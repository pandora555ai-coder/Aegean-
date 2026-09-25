import {
  PRESET_NAMES,
  getVocative,
  lineHash,
  stageSegment,
  type Difficulty,
  type GameModeId,
  type StageDefinition,
} from '@game/shared';
import { isLineDeleted } from './voiceDeletions.js';
// Task 293 - the per-stage ledger rides on SocratesState (see below), so it
// is rebuilt fresh with the rest of SocratesState on play-again (Task 319's
// rebuildRoomForNewGame), exactly like usedLines/momentFireCounts. A leaf
// module: it imports nothing back.
import { createStageLedger, type StageLedger } from './stageLedger.js';

// Task 61 - same dev/production idiom used elsewhere in the server (see
// index.ts/avatars.ts's `isProduction`): gates the per-fire moment log and
// the GAME_OVER summary below so neither ever runs in production.
const isProduction = process.env.NODE_ENV === 'production';

// Socrates: the host persona (Task 37a - renamed from "Game Master", text
// only, same module) - a teasing text commentator that reacts to what
// actually happened in the round (never anything not derivable from game
// state). Two kinds of line:
//   - a REVEAL line (socratesLine) - picked once per question, right after
//     scoring, from whichever MOMENT is the most interesting thing that
//     just happened (a streak, a comeback, a total wipeout...).
//   - a QUESTION-START line (socratesIntro) - a much lighter touch shown
//     briefly as the next question appears (final question, halfway
//     point, the category, or just a generic "let's go").
// Both are plain synchronous string computation - no I/O, no timers - so
// neither can ever delay a phase transition or the answer buttons becoming
// tappable, which is the hard constraint this whole module exists under.

export type Moment =
  // HIGH - genuinely rare STATES, not common distribution outcomes (Task 62
  // re-tier: ONLY_ONE_CORRECT/EVERYONE_WRONG/EVERYONE_CORRECT moved to
  // MEDIUM - those are just the frequent shapes a 4-option question's
  // scoring takes, not rare events). Bypasses the per-player cooldown.
  | 'BIG_COMEBACK'
  | 'LEAD_CHANGE'
  | 'HOT_STREAK_5'
  | 'PERFECT_GAME_PACE'
  | 'STREAK_BROKEN'
  // MEDIUM
  | 'EVERYONE_WRONG'
  | 'ONLY_ONE_CORRECT'
  | 'EVERYONE_CORRECT'
  | 'HOT_STREAK_3'
  | 'SPEED_DEMON'
  | 'EASY_MISS'
  | 'HARD_HIT'
  | 'COLD_STREAK_3'
  | 'NO_ANSWER'
  | 'STUCK_IN_LAST'
  // LOW - fallback tier, so there is usually something to say.
  | 'CLOSE_SCORES'
  | 'RUNAWAY_LEAD'
  | 'GENERIC_TRANSITION';

export type IntroMoment = 'FINAL_QUESTION' | 'HALFWAY_POINT' | 'CATEGORY_CALLOUT' | 'GENERIC_INTRO';

// Task 138 - the draw and numeric modes' own moments. Deliberately NOT folded
// into `Moment` above: that type's whole candidate/priority/per-player-
// cooldown machinery (recordRoundAndPickLine) is quiz-specific streak/rank
// tracking that has no equivalent here - a guess round or a numeric question
// has no "player state" to carry between rounds, just this round's own
// numbers. These get their own small pools and their own detector functions
// (below), sharing only the game-wide `usedLines`/`momentFireCounts`
// bookkeeping and the `pickLine` weighting logic every pool already uses.
export type DrawMoment = 'DRAW_INTRO' | 'NOBODY_GUESSED' | 'EVERYBODY_GUESSED' | 'SPLIT_GUESS' | 'DRAW_WINNER';
export type NumericMoment = 'EXACT_HIT' | 'WILDLY_OFF' | 'ALL_CLUSTERED' | 'NOBODY_CLOSE';
// Task 188b - the climb duel's one beat: the second weapon pick just landed
// (DUEL_LOCKED). Detection-only for now, the Task 138 pattern - the pool
// below is EMPTY (D1 blocks new lines), so the beat stays silent and the
// DUEL_LOCK_FLOOR_MS floor carries it.
export type DuelMoment = 'DUEL_LOCKED';

// 0 = HIGH (bypasses cooldown), 1 = MEDIUM, 2 = LOW.
type Priority = 0 | 1 | 2;

// Task 62: per-game fire cap, checked in recordRoundAndPickLine - once a
// moment has fired this many times, it's skipped in favor of the next
// candidate even if it still qualifies.
const MOMENT_FIRE_CAP = 2;

export interface SocratesPlayerRoundInput {
  playerId: string;
  name: string;
  answered: boolean;
  correct: boolean;
  answerRank: number | null; // 1-based among correct answers only, fastest first - null if wrong/no-answer
  scoreBefore: number;
  scoreAfter: number;
}

export interface SocratesRoundContext {
  questionIndex: number; // 0-based
  totalQuestions: number;
  difficulty: Difficulty;
  stage: number; // 1-based, matches StageDefinition.stage - dev logging only (Task 61)
}

export interface SocratesQuestionIntroContext {
  questionIndex: number; // 0-based
  totalQuestions: number;
  category: string;
}

interface SocratesPlayerState {
  correctStreak: number;
  wrongStreak: number;
  fastestAnswerCount: number;
  previousRank: number | null;
  timesInLast: number;
  noAnswerCount: number;
  totalCorrect: number;
  totalRounds: number;
  // -1 = "never targeted" - the cooldown check (questionIndex - this < 3)
  // then always passes for a player who's never been called out.
  lastTargetedAtQuestionIndex: number;
}

export interface SocratesState {
  players: Map<string, SocratesPlayerState>;
  // Every line TEMPLATE (pre-substitution) already used this game, across
  // BOTH socratesLine and socratesIntro - "never repeat the exact same
  // line twice" is a whole-game invariant, not scoped per moment or per
  // surface.
  usedLines: Set<string>;
  // Task 319 - every template an EARLIER game in this room used. Carried
  // across "Ξανά, ίδια παρέα" by rebuildRoomForNewGame (state.ts) - the only
  // SocratesState field that survives a new game - so pickLine can prefer
  // lines this room has never heard, recycling a pool only once it is spent.
  earlierGamesLines: Set<string>;
  // How many times each REVEAL Moment has actually been picked this game.
  // Task 61: fed the dev-only GAME_OVER summary in logMomentFireSummary
  // below. Task 62: now also load-bearing in all environments - the
  // MOMENT_FIRE_CAP check in recordRoundAndPickLine reads it to skip a
  // candidate once its moment has already fired twice, so a frequent
  // moment can't crowd out rarer ones for a whole game. Task 138: keyed
  // loosely enough (not just `Moment`) that the draw/numeric detectors below
  // share the exact same cap and the exact same map - one room, one game,
  // one set of moment budgets, regardless of which mode is running.
  momentFireCounts: Map<Moment | DrawMoment | NumericMoment | DuelMoment, number>;
  // Task 293 - the cumulative per-STAGE, per-player record (stageLedger.ts).
  // Everything above is scoped to the whole GAME; this one is cleared at every
  // stage boundary (phases.ts's recordStageStart), which is what lets a v2
  // slot ask "who had the best/worst stage" and "who has already been named
  // this stage". Nothing in v1 reads it - it is written and dumped only.
  ledger: StageLedger;
}

export function createSocratesState(): SocratesState {
  return {
    players: new Map(),
    usedLines: new Set(),
    earlierGamesLines: new Set(),
    momentFireCounts: new Map(),
    ledger: createStageLedger(),
  };
}

const MAX_NAME_DISPLAY_LENGTH = 12;

// Defense in depth: socratesLine/socratesIntro are rendered client-side
// as plain JSX text (React already escapes text-node content, so this
// isn't patching a real injection hole), but a player name is still
// arbitrary user input - HTML-tag-like characters are stripped and the
// length is capped before it is ever spliced into a line, independent of
// how any future consumer might render it.
function safeNameForLine(name: string): string {
  const stripped = name.replace(/[<>&]/g, '');
  const truncated =
    stripped.length > MAX_NAME_DISPLAY_LENGTH ? `${stripped.slice(0, MAX_NAME_DISPLAY_LENGTH)}…` : stripped;
  return truncated.length > 0 ? truncated : 'Παίκτης';
}

function safeCategoryForLine(category: string): string {
  return category.replace(/[<>&]/g, '');
}

function substitute(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => vars[key] ?? '');
}

// ============================= the line library =============================
// Greek, teasing/playful tone. Every line stays well under the ~90 char
// hard limit even after substitution (checked live in server/test tooling,
// not just eyeballed here). Task 46 removed every {name} placeholder from
// this library (replaced with name-free phrasing, same moment/position/
// count) - the gender-neutrality problem {name} used to create (Greek
// marks gender on articles, predicate adjectives, possessives and object
// pronouns, and a player's name gives no reliable gender to pick one) is
// now moot for these pools, since there's no name-shaped slot left to
// gender at all. Zero "/" characters in any line either way. Mocks the
// ANSWER/PERFORMANCE only - never appearance, never intelligence as a
// trait, never anything not derivable from game state. Exported (only) so
// test tooling can inspect line counts/content directly - nothing else in
// this file needs it to be public.
export const LINES: Record<Moment, readonly string[]> = {
  EVERYONE_WRONG: [
    'Κοιτάζω γύρω μου και δεν βλέπω ούτε μία σωστή απάντηση. Θα το θυμάμαι όταν έρθει η ώρα να διαλέξω.',
    'Ούτε ένας ανάμεσα σε όλους σας. Και ήρθατε εδώ με τόση σιγουριά.',
    'Ώστε συμφωνείτε όλοι. Κρίμα που συμφωνείτε στο λάθος.',
    'Κοιτάξτε γύρω σας. Αυτοί είναι οι συνυποψήφιοί σας. Παρηγορηθείτε.',
    'Τέτοια ομοφωνία την είχαμε μόνο όταν καταδικάζαμε κάποιον.',
    'Όλοι μαζί, στο ίδιο ακριβώς λάθος. Υπάρχει μια αρμονία εδώ που δεν την αξίζετε.',
  ],
  ONLY_ONE_CORRECT: [
    'Ένας. Μόνο ένας ανάμεσά σας. Κοιτάξτε καλά.',
    'Όλοι λάθος εκτός από έναν. Αυτό λέγεται διαφορά.',
    'Ένας μόνο. Οι υπόλοιποι μόλις έχασαν λίγη αξιοπρέπεια.',
    'Κάποιος τα κατάφερε και όλοι οι άλλοι όχι. Μία φορά είναι τύχη· δύο, σοφία.',
    'Ένα σωστό χέρι σηκώθηκε σε τούτη την Αγορά. Οι υπόλοιποι κοιτούσατε αλλού.',
    'Ένας ανάμεσα σε τόσους. Έτσι ξεχωρίζει κάποιος.',
    // Task 45 - name-free additions.
    'Ένας ξεχώρισε χωρίς καν να το επιδιώξει. Αυτά είναι που προσέχω, και σπάνια τα ξεχνάω.',
    'Κοιτάξτε ποιος σήκωσε το βάρος. Οι υπόλοιποι κοιτάγατε.',
    'Ώστε ένας μόνο κατάλαβε τι ρώτησα. Οι υπόλοιποι ξαναδιαβάστε την ερώτηση, με την ησυχία σας.',
  ],
  EVERYONE_CORRECT: [
    'Όλοι σωστά. Άρα η ερώτηση ήταν εύκολη. Μη μπερδεύεστε.',
    'Ομοφωνία. Ύποπτο πράγμα σε αίθουσα με τόσους φιλόδοξους.',
    'Μπράβο σε όλους. Τώρα κανείς δεν ξεχώρισε.',
    'Κανένα λάθος. Θα κάνω την επόμενη δυσκολότερη.',
    'Το ήξεραν όλοι, άρα δεν έμαθα τίποτα για κανέναν σας. Θα το διορθώσω αυτό αμέσως.',
    'Ομόφωνα σωστό. Βαρετό, αλλά σωστό.',
  ],
  BIG_COMEBACK: [
    'Και ξαφνικά, ζωή. Πού ήταν αυτό μέχρι τώρα;',
    'Ώστε μπορούσες. Και το κράτησες κρυφό.',
    'Κάποιος ανέβηκε από το πουθενά. Κοιτάτε, έτσι γίνεται.',
    'Κάποιος γύρισε από εκεί που δεν γυρίζει κανείς. Ομολογώ ότι δεν τον είχα υπολογίσει.',
    'Από την τελευταία θέση ως εδώ, μπροστά σε όλους. Αυτό το εκτιμώ περισσότερο από όποιον καθόταν ήσυχος στην κορυφή.',
    'Με έκανε κάποιος να αλλάξω γνώμη. Δύσκολο πράγμα.',
    // Task 45 - name-free additions.
    'Γύρισε το παιχνίδι. Πού ήταν τόση ώρα αυτό;',
    'Και ξαφνικά κάποιος θυμήθηκε πώς να σκέφτεται. Λίγο αργά, αλλά το δέχομαι.',
    'Κάποιος θυμήθηκε γιατί ήρθε.',
  ],
  LEAD_CHANGE: [
    'Άλλαξε η κορυφή. Ο θρόνος στην Αθήνα ποτέ δεν κράτησε πολύ.',
    'Νέο πρώτο όνομα. Οι υπόλοιποι θυμηθείτε πώς είναι να κυνηγάτε.',
    'Ώστε αλλάζουν τα πράγματα εδώ μέσα. Καλά κάνουν — η βεβαιότητα με κουράζει περισσότερο από την άγνοια.',
    'Κάποιος πέρασε μπροστά. Για πόσο;',
    'Η κορυφή άλλαξε χέρια για μία ακόμη φορά. Μη συνηθίσετε κανέναν εκεί πάνω.',
    'Κάποιος πέρασε μπροστά, και μαζί πέρασε και ο στόχος στην πλάτη του. Θα το καταλάβει σύντομα.',
  ],
  HOT_STREAK_5: [
    'Πέντε στη σειρά χωρίς δισταγμό. Δεν ξέρω αν είναι γνώση ή πείσμα, και δεν είμαι σίγουρος ποιο προτιμώ.',
    'Πέντε συνεχόμενες σωστές, και το πλήθος σταμάτησε να μιλάει. Αρχίζω να πιστεύω ότι κάποιον τον υποτίμησα.',
    'Πέντε στη σειρά από τον έναν, και οι υπόλοιποι κάθεστε και βλέπετε. Ντρέπομαι λίγο για λογαριασμό σας.',
    'Κάποιος τις παίρνει όλες. Η Αθήνα βρήκε το θέμα της.',
    'Πέντε συνεχόμενες. Αν πέσεις τώρα, θα πονέσει.',
    'Σταματήστε να με εντυπωσιάζετε. Δεν το αντέχω.',
    // Task 45 - name-free addition.
    'Πέντε συνεχόμενες. Οι υπόλοιποι, τι ακριβώς κάνετε;',
    'Κανείς σας δεν μπορεί να σταματήσει αυτό το σερί. Ή είναι πολύ καλός, ή είστε πολύ αργοί.',
  ],
  PERFECT_GAME_PACE: [
    'Ρυθμός χωρίς λάθος. Μήπως κάνω τις ερωτήσεις πολύ εύκολες;',
    'Κανένα λάθος ως τώρα. Αυτό δεν είναι σοφία, είναι υπόσχεση.',
    'Τέλεια πορεία ως εδώ. Το ένα λάθος θα το θυμάστε για πάντα.',
    'Χωρίς λάθος μέχρι στιγμής. Με ανησυχεί.',
    "Άψογη πορεία μέχρι αυτή τη στιγμή. Και η στιγμή είναι πάντα πιο σύντομη απ' όσο νομίζετε.",
    'Καθαρή πορεία ως εδώ, χωρίς ούτε ένα λάθος. Έχω δει πολλές τέτοιες να λερώνονται, και πάντα ξαφνικά.',
    // Task 146 additions.
    'Ούτε ένα λάθος ως αυτή τη στιγμή, από κανέναν σας. Κάτι μου λέει ότι φταίνε οι ερωτήσεις μου, και θα το διορθώσω.',
    'Προχωράτε χωρίς να σκοντάψετε πουθενά ακόμη. Όταν έρθει το πρώτο λάθος, θα ακουστεί σαν αγγείο που σπάει.',
    'Μια πορεία χωρίς ψεγάδι με κάνει καχύποπτο, όχι περήφανο. Έχω δει την τελειότητα να κρύβει τεμπελιά πιο συχνά από σοφία.',
  ],
  HOT_STREAK_3: [
    'Τρεις διαδοχικές. Κάτι συμβαίνει εδώ.',
    'Τρία συνεχόμενα. Αυτό δεν είναι τύχη πια.',
    'Τρεις σωστές. Κάποιος εδώ ξέρει τι κάνει.',
    'Κάποιος δεν σταματάει. Κάντε κάτι.',
    'Τρία στη σειρά. Από εδώ και πέρα κάθε λάθος θα το θυμούνται.',
    'Τρεις σωστές στη σειρά, και άρχισα να παρακολουθώ πιο στενά. Δεν είναι πάντα καλό αυτό.',
    // Task 45 - name-free additions.
    'Τρία συνεχόμενα χωρίς λάθος. Από εδώ και πέρα κάθε αστοχία θα ακούγεται διπλά.',
    'Κανείς δεν σταματάει αυτό το σερί. Περίεργο πλήθος σήμερα.',
  ],
  STREAK_BROKEN: [
    'Τελείωσε το σερί. Όλα τελειώνουν, απλώς αυτό τελείωσε δημόσια.',
    'Και να που έπεσες. Η πτώση από ψηλά ακούγεται περισσότερο.',
    'Σταμάτησε. Ήταν ωραία όσο κράτησε.',
    'Τόσες σωστές στη σειρά, και μετά τίποτα. Έτσι ακριβώς τελειώνουν όλα τα σερί, και πάντα μπροστά σε κοινό.',
    'Το σερί έσπασε. Το πλήθος το πρόσεξε πριν από εσένα.',
    'Το σερί τελείωσε εδώ και τώρα. Ξαναρχίζεις από το μηδέν, όπως όλοι μας κάποτε.',
  ],
  SPEED_DEMON: [
    'Απάντησες πριν τελειώσω. Είτε το ήξερες, είτε δεν με άκουγες.',
    'Ταχύτητα. Στην Αγορά ο πρώτος που μιλάει σπάνια έχει δίκιο.',
    'Γρήγορα. Ελπίζω και σωστά.',
    'Τόση βιάση για μια ερώτηση που δεν επρόκειτο να φύγει πουθενά. Η γνώση περιμένει· εσείς όχι.',
    'Πρόλαβες τους πάντες. Πρόλαβες να σκεφτείς;',
    'Απάντησες πριν τελειώσω την ερώτηση. Δεν ξέρω αν να εντυπωσιαστώ ή να προσβληθώ.',
  ],
  EASY_MISS: [
    'Αυτή την ερώτηση την ήξερε και το πλήθος που στέκεται πίσω σας. Σκεφτείτε το για λίγο.',
    'Εύκολη ερώτηση. Την έκανες δύσκολη χωρίς λόγο.',
    'Θα προσποιηθώ ότι δεν το είδα. Οι υπόλοιποι όμως το είδαν.',
    'Αυτό ήταν από τα εύκολα. Ήταν.',
    'Ερώτηση για παιδιά, και όμως χάθηκε μπροστά μου. Δεν ξέρω τι να πω, και σπάνια μου συμβαίνει.',
    'Δεν χρειαζόταν γνώση εδώ, χρειαζόταν μόνο προσοχή. Και η προσοχή δεν κοστίζει τίποτα σε κανέναν.',
    // Task 45 - name-free additions. (a third supplied line, "Δεν χρειαζόταν
    // γνώση εδώ. Χρειαζόταν προσοχή.", was dropped: identical to the
    // existing line directly above - adding it again would be a dead
    // duplicate, permanently unselectable once the original is used.)
    'Εύκολο ερώτημα, βαριά απάντηση. Κάπου εκεί χάθηκε ένας υποψήφιος μαθητής.',
    'Εύκολη ερώτηση, βαριά αστοχία.',
  ],
  HARD_HIT: [
    'Δύσκολη, και κάποιος την πέτυχε. Τύχη ή γνώση;',
    'Λίγοι θα το ήξεραν. Σημείωσα ποιος.',
    'Ώστε διαβάζεις. Επιτέλους κάποιος.',
    'Αυτό ήταν δύσκολο. Το πλήθος δεν το κατάλαβε καν.',
    'Αυτό δεν το περίμενα από κανέναν σας, και το λέω χωρίς ειρωνεία. Συνεχίστε έτσι και θα το θυμάμαι.',
    'Σωστή απάντηση σε ερώτημα που θα δυσκόλευε και εμένα. Αυτά είναι που μετράνε στο τέλος, όχι τα εύκολα.',
  ],
  COLD_STREAK_3: [
    'Τρία λάθη στη σειρά. Υπάρχει μέθοδος εδώ.',
    'Τρεις συνεχόμενες αστοχίες. Δοκιμάστε να σκεφτείτε πρώτα.',
    'Τρία στη σειρά, και εννοώ λάθος. Αρχίζω να πιστεύω ότι υπάρχει μέθοδος εδώ.',
    'Το πλήθος σταμάτησε να ελπίζει.',
    'Τρεις σερί αποτυχίες. Η σταθερότητα σου είναι αξιοθαύμαστη.',
    'Κάτι δεν πάει καλά. Και το βλέπουν όλοι.',
  ],
  NO_ANSWER: [
    "Σιωπή απ' όλη την Αγορά. Θα την εκτιμούσα, αν ήταν επιλογή και όχι πανικός.",
    'Καμία απάντηση. Τουλάχιστον δεν ειπώθηκε βλακεία.',
    'Ο χρόνος πέρασε, και κάποιος τον άφησε να περάσει από πάνω του. Αυτό λέει περισσότερα από μια λάθος απάντηση.',
    'Καμία απάντηση απολύτως. Η άγνοια τουλάχιστον κράτησε το στόμα της κλειστό.',
    'Σας περίμενα να μιλήσετε και δεν ήρθατε. Ο Σωκράτης έχει συνηθίσει να τον αποφεύγουν.',
    'Απολύτως τίποτα. Και το τίποτα κρύβει είτε σοφία είτε φόβο — ξέρω ποιο από τα δύο ήταν.',
    // Task 45 - name-free additions.
    'Καμία απάντηση. Η σιωπή τουλάχιστον δεν λέει βλακείες.',
    'Ο χρόνος πέρασε. Κάποιος τον άφησε να περάσει.',
    'Τίποτα. Και το τίποτα κι αυτό απάντηση είναι.',
  ],
  STUCK_IN_LAST: [
    'Ακόμα στην τελευταία θέση. Υπάρχει μια σταθερότητα εδώ.',
    'Τελευταία θέση από την αρχή. Τουλάχιστον υπάρχει συνέπεια.',
    'Μη φεύγει κανείς. Κάποιος ορίζει τον πάτο.',
    'Ο δρόμος προς τη σοφία ξεκινά εκεί που στέκεστε. Κάποιος στέκεται πολύ πίσω.',
    'Ακόμα εκεί κάτω, γύρο με τον γύρο. Αυτό λέει κάτι για την επιμονή, αν όχι για το μυαλό.',
    'Σας βλέπω όλους από εδώ που στέκομαι. Κάποιον τον βλέπω περισσότερο, και δεν είναι για καλό.',
    // Task 45 - name-free additions.
    'Ακόμα τελευταίος. Υπάρχει μια σταθερότητα εδώ που άλλοι θα ζήλευαν.',
    'Ο πάτος έχει κι αυτός τον φύλακά του.',
    'Κάποιος πρέπει να ορίζει το κάτω όριο. Ευχαριστούμε.',
  ],
  CLOSE_SCORES: [
    'Κολλητά. Κανείς σας δεν έχει κερδίσει τίποτα ακόμα.',
    'Τόσο κοντά που η επόμενη κρίνει χαρακτήρες, όχι πόντους.',
    'Ισορροπία. Κάποιος πρέπει να τη χαλάσει.',
    'Λίγοι πόντοι σας χωρίζουν. Λίγοι πόντοι, μεγάλη διαφορά.',
    'Κανένας σας δεν έχει ξεχωρίσει ακόμη από τους υπόλοιπους. Και ο χρόνος για να το κάνετε τελειώνει.',
    'Στενό. Μου αρέσει όταν δεν ξέρω το τέλος.',
  ],
  RUNAWAY_LEAD: [
    'Κάποιος ξέφυγε τόσο μπροστά που δεν τον φτάνετε. Στην Αθήνα τέτοιους τους εξοστρακίζαμε, και όχι άδικα.',
    'Κάποιος έχει ξεφύγει και κανείς σας δεν κάνει τίποτα.',
    'Τόσο μπροστά που άρχισε να βαριέται.',
    'Η διαφορά μεγαλώνει. Αυτό δεν είναι αγώνας πια.',
    'Ένας εναντίον όλων. Και κερδίζει.',
    'Σταματήστε τον. Παρακαλώ.',
    // Task 45 - name-free additions.
    'Ένας τρέχει μόνος του και οι υπόλοιποι τον παρακολουθείτε ευγενικά. Δεν είναι αγώνας αυτό, είναι παρέλαση.',
    'Η διαφορά μεγάλωσε τόσο που έπαψε να έχει νόημα. Κάποιος να κάνει κάτι, βαριέμαι κι εγώ.',
    'Στην Αθήνα τον πρώτο τον εξοστρακίζαμε. Απλή υπενθύμιση.',
  ],
  GENERIC_TRANSITION: [
    'Συνεχίζουμε. Η άγνοια δεν ξεκουράζεται.',
    'Προχωράμε στην επόμενη, και σας παρακολουθώ πιο στενά τώρα. Κάτι άρχισε να μου κινεί την περιέργεια.',
    'Πάμε. Το πλήθος βαριέται πιο γρήγορα από μένα.',
    'Άλλη μία ερώτηση, και μη χαλαρώσει κανείς. Οι εύκολες τελείωσαν πριν από λίγο.',
    'Προχωράμε. Κάποιος πρέπει να ξεχωρίσει.',
    'Επόμενο ερώτημα. Ελπίζω σε καλύτερα.',
  ],
};

// Exported for the same reason as LINES above.
export const INTRO_LINES: Record<IntroMoment, readonly string[]> = {
  FINAL_QUESTION: [
    'Τελευταία ερώτηση. Ό,τι μάθατε ως τώρα κρίνεται εδώ.',
    'Η τελευταία. Μετά διαλέγω μαθητή και δεν αλλάζω γνώμη.',
    'Ένα ερώτημα ακόμη σας χωρίζει από το τέλος. Και σας κρίνει, είτε το θέλετε είτε όχι.',
    'Τέλος. Μία ερώτηση σας χωρίζει από την απάντηση.',
    'Η τελευταία ευκαιρία να με πείσετε.',
    'Μετά από αυτήν την ερώτηση θα πέσει σιωπή. Και ύστερα θα ακουστεί μόνο η απόφασή μου.',
  ],
  HALFWAY_POINT: [
    'Μισός δρόμος. Οι μισοί το κατάλαβαν ήδη ότι δεν θα τα καταφέρουν.',
    'Φτάσαμε στη μέση. Ό,τι χτίσατε μπορεί να καταρρεύσει.',
    'Μέση. Καλή στιγμή να αναρωτηθείτε γιατί ήρθατε.',
    'Οι μισές ερωτήσεις πέρασαν και είστε ακόμη όρθιοι. Οι δύσκολες όμως μένουν, και δεν συγχωρούν.',
    'Μέχρι εδώ καλά. Από εδώ και πέρα, δεν ξέρω.',
    'Φτάσαμε στη μέση και κανείς δεν έχει κερδίσει τίποτα. Ό,τι μαζέψατε ως τώρα χάνεται εύκολα.',
  ],
  CATEGORY_CALLOUT: [
    'Εδώ χωρίζονται όσοι ξέρουν από όσους νομίζουν.',
    'Ας δούμε τώρα ποιος διάβασε.',
    'Αυτό το θέμα δεν συγχωρεί το μπλόφαρισμα. Θα φανεί αμέσως ποιος διάβασε και ποιος μαντεύει.',
    'Προσοχή τώρα, γιατί εδώ δεν περνάει κανείς τυχαία. Θέλω να δω ποιος θα σηκώσει το βλέμμα.',
    'Κάποιοι από εσάς μόλις χλωμιάσατε.',
    'Δείξτε μου επιτέλους κάτι που να αξίζει. Περιμένω από την αρχή αυτής της συζήτησης.',
    // Task 146 additions.
    '{category}. Θέλω να δω ποιος θα σηκώσει το βλέμμα τώρα και ποιος θα κοιτάξει τα πόδια του.',
    '{category}. Εδώ δεν βοηθάει η ευγλωττία, μόνο η μνήμη — και η μνήμη σας δεν με έχει εντυπωσιάσει.',
    '{category}. Ένα θέμα που δεν χωράει μπλόφα, και εγώ έχω δει κάθε είδους μπλόφα σε αυτή την πόλη.',
  ],
  GENERIC_INTRO: [
    'Καλώς ήρθατε στην Αγορά, όλοι σας. Ήρθατε για τη γνώση ή για τα βλέμματα; Θα το μάθω πριν τελειώσουμε.',
    'Ένας από εσάς θα γίνει μαθητής μου. Οι υπόλοιποι θα φύγετε πιο ταπεινοί.',
    'Μαζευτήκατε. Τώρα δείξτε μου ότι αξίζατε τον δρόμο.',
    'Ξεκινάμε. Δεν ξέρω τίποτα, αλλά εσείς ξέρετε ακόμα λιγότερα.',
    'Η Αθήνα ολόκληρη ακούει αυτή τη συζήτηση. Μιλήστε προσεκτικά, γιατί δεν ξεχνάει τίποτα.',
    'Καθίστε και ετοιμαστείτε. Οι ερωτήσεις μου δεν είναι ευγενικές, και δεν σκοπεύω να αλλάξω.',
  ],
};

// Task 48 - three more one-shot pools, each played through the SAME held
// SOCRATES phase/audio path as a REVEAL-moment line (see phases.ts), just
// triggered by a different event instead of recordRoundAndPickLine:
//   - GAME_INTRO (8) - once, before the very first STAGE_ANNOUNCE.
//   - STAGE_INTRO (6 per stage) - once per stage, right after that stage's
//     announcement card.
//   - WINNER (8) - once, right before GAME_OVER.
// All three are plain literal Greek (no {name}/{n}/{category} placeholders -
// there's no per-round data to substitute at these moments), so they share
// pickLine's plumbing below with an empty vars object.
export const GAME_INTRO_LINES: readonly string[] = [
  'Καλώς ήρθατε στην Αγορά. Καθίστε, και μη βιαστείτε να μιλήσετε.',
  'Ένας από εσάς θα γίνει μαθητής μου. Οι υπόλοιποι θα φύγετε πιο ταπεινοί.',
  'Ήρθατε για τη γνώση ή για το πλήθος; Θα φανεί σύντομα.',
  'Δεν ρωτάω για να μάθω τι ξέρετε. Ρωτάω για να δω ποιοι είστε όταν δεν ξέρετε.',
  'Η μισή Αθήνα μαζεύτηκε εδώ για να σας δει. Ελπίζω να μην τους απογοητεύσετε όσο φοβάμαι.',
  'Εγώ ένα ξέρω: ότι δεν ξέρω τίποτα. Εσείς θα δυσκολευτείτε περισσότερο.',
  'Τρεις γύροι σας χωρίζουν από την απάντηση που ήρθατε να ακούσετε. Ελάχιστοι φτάνουν ως εκεί όρθιοι.',
  'Ας αρχίσει η διαμάχη. Και ας κερδίσει ο λιγότερο ανόητος.',
];

// Task 236 - the full show's own opening narration (generated by Task 230,
// auditioned at /dev/intro-lines). A SEQUENCE, not a pool: these ten lines
// are sequential prose - #3 ("Απόψε ήρθαν για το δεύτερο") only means
// anything after #2, #8 ("θα δείτε πόσο γρήγορα το ξεχνάει") only after #7 -
// so picking ONE at random the way GAME_INTRO_LINES is picked would emit
// nonsense. They play back to back through the same held SOCRATES phase,
// each on its own audio ack (see startSocratesSequence in phases.ts).
// FULL ONLY, and GAME_INTRO_LINES above is deliberately left in place for
// the standalone modes: these lines describe full's lineup by content
// ("σε γνώση, σε ταχύτητα, σε μνήμη", and #9 setting up Η Ανάβασις), which
// would misdescribe a standalone quiz exactly the way the round count Task
// 231 had to filter out did. Keeping both pools is also what keeps 231's
// "kept for standalone" true - see pickGameIntroLine's filter.
export const GAME_INTRO_SEQUENCE: readonly string[] = [
  'Καλώς ήρθατε στην Αθήνα.',
  'Το θέατρο γέμισε από νωρίς. Ο δήμος αφήνει τη δουλειά του για δύο πράγματα: για τραγωδία, και για να δει κάποιον να πέφτει.',
  'Απόψε ήρθαν για το δεύτερο.',
  'Και ήρθατε κι εσείς. Σοφιστές, λένε. Άνθρωποι που πουλούν τη σοφία τους σε όποιον πληρώνει.',
  "Εγώ δεν έχω να πουλήσω τίποτα. Δεν ξέρω τίποτα. Γι' αυτό ρωτάω.",
  'Και απόψε θα ρωτήσω εσάς. Πολλά. Σε γνώση, σε ταχύτητα, σε μνήμη — και σε πράγματα που δεν περιμένετε.',
  "Κάποιοι από εσάς θα λάμψετε νωρίς. Το πλήθος θ' αγαπήσει το όνομά σας.",
  'Και θα δείτε πόσο γρήγορα το ξεχνάει.',
  "Ένας από εσάς θ' αντέξει ως το τέλος. Κάτι τον περιμένει εκεί. Δεν θα σας πω τι… δεν το λέω ποτέ σε όσους δεν έφτασαν.",
  'Το πλήθος θα κρίνει — και το πλήθος δεν είναι ευγενικό. Ας αρχίσουμε.',
];

// Task 236 - Η Ανάβασις' own announcement, and the ONE place the game ever
// explains that the points you spent all night earning only set your
// STARTING STEP on the ladder. A player led on points all game, finished
// 4th, and nothing on screen had ever said why - this is that fix, so it is
// a SEQUENCE for the same reason GAME_INTRO_SEQUENCE is: #20 alone
// ("Κοιτάξτε πού στέκεστε") does not state the rule at all, so picking one
// of the three at random would leave a third of games never stating it.
// All three play, in order; #21 carries the rule outright.
// Its own const rather than a STAGE_INTRO_LINES entry: that table is picked
// from one line at a time, and these three are sequential prose.
export const ANAVASIS_INTRO_SEQUENCE: readonly string[] = [
  'Το θέατρο τελείωσε. Κοιτάξτε πού στέκεστε.',
  'Δεν είστε όλοι στο ίδιο ύψος. Ό,τι κερδίσατε απόψε, εκεί πήγε — όχι σε νίκη, σε σκαλιά.',
  'Από δω και πέρα δεν μετράει τι ξέρετε. Μόνο πόσο ψηλά φτάνετε. Ο ναός είναι εκεί πάνω, και χωράει έναν.',
];

// Task 139 - Η Συκοφαντία's intro pool, its own const so it can be shared
// under whatever identities legitimately mean "the steal stage" (Task 218 -
// see StageIntroIdentity below; quiz's own stage 3 and full's stage 6 both
// resolve to 'steal').
const SYKOPHANTIA_INTRO_LINES: readonly string[] = [
  'Η Συκοφαντία. Οι κατήγοροι έβγαζαν ψωμί από τις κατηγορίες — τώρα θα βγάλετε κι εσείς.',
  'Φτάνουμε στη Συκοφαντία. Εμένα με κατηγόρησαν άδικα· εσάς θα σας κατηγορήσουν σωστά.',
  'Ρωτάω ακόμη εγώ, μα πλέον κλέβετε κι εσείς. Θα δούμε ποιος έχει ταλέντο στο άδικο.',
  'Η Συκοφαντία ανοίγει. Κρατήστε τους πόντους σας σφιχτά — τα χέρια εδώ μέσα μακραίνουν.',
  'Από εδώ και πέρα, ό,τι κερδίσετε το παίρνετε από κάποιον άλλον.',
  // Task 146 additions.
  "Φτάσαμε στη Συκοφαντία, το θέμα που ξέρω καλύτερα απ' όσο θα ήθελα. Προσέξτε ποιον κοιτάτε στα μάτια από δω και πέρα.",
  'Στην Αθήνα μια κατηγορία δεν χρειαζόταν αποδείξεις, μόνο κοινό. Έχετε και τα δύο απόψε.',
  'Η Συκοφαντία αρχίζει, και μαζί της τελειώνει η ευγένεια. Θα δούμε πόσο γρήγορα ξεχνάτε ότι ήρθατε μαζί.',
];

// Task 218 - what STAGE_INTRO_LINES is actually keyed by, replacing the raw
// (pre-Task-214) table POSITION it used to be keyed by. The Task 214 lineup
// reordered every stage, so a numeric key silently started resolving to the
// WRONG stage (or to nothing) the moment a stage's position in its table
// changed - see tasks/218-report.md's diagnosis for the exact fallout. An
// IDENTITY survives reordering by construction: it's derived from what a
// stage actually IS (its StageSegment, or - the one identity segment alone
// can't distinguish - whether it steals), never from where it sits.
// 'quiz' covers EVERY plain (non-stealing) quiz-segment stage regardless of
// mode or table position: standalone quiz's own Η Αγορά AND Οι Σοφιστές
// (Task 218 - previously two SEPARATE numeric pools, keys 1/2, that only
// ever happened to resolve correctly because those two stages' POSITIONS
// never moved; deliberately MERGED here into one pool since neither the
// StageSegment vocabulary nor this task's identity scheme has a way to
// tell them apart, and full's own single non-stealing quiz stage, "Η
// Αγορά", already had to share this same bucket) - full's own stage 1
// (also "Η Αγορά"). 'steal' covers every stealAfterEveryQuestion quiz
// stage (Η Συκοφαντία, in both tables). 'blitz'/'draw'/'numeric'/'agora'
// and 'finale' (the trial/climb row) have NO entry below - by design, the
// existing silent-pool pattern (Task 138): `pickStageIntroLine` reads
// `STAGE_INTRO_LINES[identity] ?? []`, an empty pool declines the beat and
// the stage advances straight through with no added delay. In practice
// full.ts's `beginStage` hook already intercepts blitz/draw/numeric/agora
// stages before `pickStageIntroLine` is ever called for them (see
// phases.ts's `endStageAnnounce`), and the finale row is announced through
// its own room.trial/room.climb branches there, never this one - so those
// five identities exist in the union purely for completeness/documentation,
// not because any code path looks them up.
export type StageIntroIdentity = 'quiz' | 'blitz' | 'draw' | 'numeric' | 'agora' | 'steal' | 'finale';

export function stageIntroIdentity(definition: StageDefinition): StageIntroIdentity {
  const segment = stageSegment(definition);
  if (segment === 'trial') {
    return 'finale';
  }
  if (segment === 'quiz') {
    return definition.stealAfterEveryQuestion ? 'steal' : 'quiz';
  }
  return segment;
}

export const STAGE_INTRO_LINES: Partial<Record<StageIntroIdentity, readonly string[]>> = {
  // Merged (Task 218, see StageIntroIdentity above): Η Αγορά's own six
  // lines, then Οι Σοφιστές's own six - both sets kept VERBATIM (each is
  // lineHash-keyed to an already-generated mp3, see ## Voice in CLAUDE.md);
  // only which ARRAY holds them changed, not the line text itself, so no
  // mp3 is invalidated by this merge.
  quiz: [
    'Βρισκόμαστε στην Αγορά, εκεί όπου ξεκινούν όλες οι συζητήσεις. Εδώ χάνονται και οι περισσότερες.',
    'Πρώτος γύρος. Ακόμα κανείς δεν έχει ντροπιαστεί.',
    'Στην Αγορά μιλάει όποιος τολμά. Τολμήστε.',
    'Ξεκινάμε ήρεμα και πολιτισμένα, όπως αρμόζει. Δεν πρόκειται να κρατήσει πολύ αυτό.',
    'Η Αγορά είναι γεμάτη κόσμο σήμερα, και όλοι περιμένουν. Ας δούμε ποιος θα στέκεται ακόμη εδώ στο τέλος.',
    "Τα πρώτα ερωτήματα είναι πάντα απλά, και γι' αυτό επικίνδυνα. Οι απαντήσεις σας θα σας προδώσουν πριν το καταλάβετε.",
    'Οι Σοφιστές. Από εδώ και πέρα δεν αρκεί να ξέρετε.',
    'Δεύτερος γύρος. Τώρα μπορείτε να βλάψετε ο ένας τον άλλον.',
    'Οι Σοφιστές δίδασκαν πώς να κερδίζεις, όχι πώς να έχεις δίκιο. Θα σας φανεί χρήσιμο.',
    'Ελπίζω να μην έχετε φίλους εδώ μέσα. Θα σας εμποδίσουν.',
    'Ένα όπλο ο καθένας. Ας δούμε σε ποιον θα στραφεί.',
    'Η γνώση χωρίς πονηριά χάνει. Το έμαθα με τον δύσκολο τρόπο.',
  ],
  // Four new lines, plus the one old stage-3 line that was always about
  // stealing rather than the trial - kept VERBATIM (see ## Voice in
  // CLAUDE.md). The five lines that literally said "Η Δίκη" went to
  // TRIAL_INTRO_LINES in Task 139 and were deleted with that finale in
  // Task 258.
  steal: SYKOPHANTIA_INTRO_LINES,
  // Task 236 - the four non-quiz stages of the full show, which announced
  // their card and then went silent because full.ts's `beginStage` hook
  // returned before pickStageIntroLine was ever reached (see
  // resumeAfterStageAnnounce in phases.ts, which now asks for the line
  // FIRST). Generated by Task 230 as "alternatives" rather than sequences,
  // so these are ordinary pick-one pools like every other entry here.
  blitz: [
    'Στην Παλαίστρα δεν συζητούσαν. Πάλευαν. Θα σας πω κάτι, κι εσείς θα το δεχτείτε ή θα το ρίξετε. Όποιος διστάσει, έχασε.',
    'Θα ακούσετε ισχυρισμούς. Άλλοι αληθεύουν, άλλοι όχι. Δεν έχετε χρόνο να ξεχωρίσετε — μόνο να διαλέξετε.',
    'Θα σας πω δώδεκα πράγματα. Δεν είναι όλα αληθινά. Ούτε έχετε χρόνο να καταλάβετε ποια.',
  ],
  draw: [
    'Οι λέξεις σάς βοήθησαν ως τώρα. Ας δούμε τι κάνετε χωρίς αυτές.',
    'Ο ζωγράφος ξέρει. Δεν επιτρέπεται να μιλήσει. Ίσως είναι η μόνη φορά απόψε που κάποιος θα σωπάσει… ενώ ξέρει.',
  ],
  numeric: [
    'Πόσα; Αυτή είναι όλη η ερώτηση. Δεν χρειάζεται να ξέρετε — χρειάζεται να μαντέψετε καλύτερα από τους άλλους.',
    'Οι σοφοί μετρούσαν τον κόσμο. Εσείς θα τον μαντέψετε. Είναι σχεδόν το ίδιο, και πολύ πιο γρήγορο.',
  ],
  agora: [
    'Η Λήθη δεν παίρνει όσα ξεχνάτε. Παίρνει όσα δεν προσέξατε ποτέ.',
    'Θα σας δείξω, και μετά θα σας ρωτήσω. Ανάμεσα στα δύο, η Λήθη θα κάνει τη δουλειά της.',
  ],
};

export const WINNER_LINES: readonly string[] = [
  'Βρήκα τον μαθητή μου. Η Αθήνα το είδε.',
  "Ένας στάθηκε πάνω απ' όλους. Δεν ήταν τύχη.",
  'Αυτό ήταν αξιοπρεπές. Και δεν το λέω συχνά.',
  'Ο νικητής κέρδισε τη θέση δίπλα μου. Ας δούμε αν την αντέχει.',
  'Οι υπόλοιποι, μην απελπίζεστε. Και εγώ έχασα μια δίκη κάποτε.',
  'Τελείωσε. Ένας σοφότερος, οι υπόλοιποι ταπεινότεροι. Καλή συμφωνία.',
  'Η διαμάχη έληξε. Πήρα την απόφασή μου.',
  'Ο μαθητής βρέθηκε. Η γνώση, όπως πάντα, μας διέφυγε.',
];

// Task 278 - the CORONATION: what Socrates says to the one person left
// standing, rebuilt as TWO complete three-line SETS, one spoken per game.
//
// Everything gendered is GONE with this task: Task 247's σοφιστή/σοφίστρια
// pair, and with it the NAME_GENDER branch that chose between them. Not one
// line below inflects for who won, so a winner whose name this codebase has
// never seen is addressed exactly as well as one it has - which is the whole
// point, since the only thing that ever made the coronation unspeakable was
// not knowing a name's gender. There is no longer any such thing as a winner
// this beat cannot address.
//
// Each set is a SEQUENCE, not a pool: three sentences of ONE argument, in
// order, exactly like GAME_INTRO_SEQUENCE/ANAVASIS_INTRO_SEQUENCE and for the
// same reason - picking one of the six at random would be nonsense.
//
// SET B - "the name". Its last line is the entire point of the set: the
// winner's own name, spoken AFTER that line as a separate spliced clip (Task
// 277's `suffix`), never baked into this sentence's own audio and never
// substituted into the template that gets hashed.
export const CORONATION_SET_B: readonly string[] = [
  'Το πλήθος ξεχνάει. Ονόματα, νίκες, ήττες — όλα σβήνουν πριν σβήσουν οι δάδες.',
  'Απόψε είδα κάτι σπάνιο. Το θέατρο έμαθε ένα όνομα απέξω.',
  'Το δικό σου.',
];

// SET C - "the silence". No name anywhere in it, by construction: nothing is
// ever spliced onto any of its three lines, and it reads and sounds
// identically for every winner in the game.
export const CORONATION_SET_C: readonly string[] = [
  'Ήρθα απόψε να κοροϊδέψω σοφιστές. Εύκολη δουλειά, συνήθως.',
  'Σε έψαξα όλη τη νύχτα για ένα λάθος να σε πιάσω. Δεν το βρήκα.',
  'Η ειρωνεία μου σωπαίνει μπροστά σου. Μεγαλύτερο έπαθλο δεν έχω δώσει ποτέ.',
];

export const CORONATION_SETS: readonly (readonly string[])[] = [CORONATION_SET_B, CORONATION_SET_C];

// The ONE line in either set that the winner's name is spliced onto - set B's
// last. Exported so both the builder below and the check harness name it the
// same way instead of re-deriving "the third line of B" by index.
export const CORONATION_NAME_LINE = CORONATION_SET_B[2];

// The vocative clip a given winner would be addressed with, as a (template,
// tag) pair like any other line - `getVocative`'s first real call site
// (it was dead code from Task 241 until this task). Untagged on purpose: the
// bank has an 11-tag vocabulary and none of them is a name, so rather than
// invent one, a vocative hashes as a plain tagless line.
// Task 296 - generalised off coronationVocative (which now delegates here and
// keeps its name for the ceremony's own call sites): the spear's elimination
// beat addresses the player it struck in exactly the same way, so "the clip
// that says this person's name" is one function rather than two.
export function vocativeClipFor(name: string | null): { template: string; tag: string | null } | null {
  if (!name) {
    return null;
  }
  const vocative = getVocative(name);
  return vocative ? { template: vocative, tag: null } : null;
}

export function coronationVocative(name: string | null): { template: string; tag: string | null } | null {
  return vocativeClipFor(name);
}

// Which set this game speaks. A plain uniform pick among CORONATION_SETS:
// nothing about the winner is consulted here at all, so BOTH sets are
// reachable on every game for every winner - there is no name, gender or
// clip condition that can make one of them unreachable.
//
// Dev-only determinism hook, the same shape and the same NODE_ENV gate as
// questions.ts's FORCE_QUESTION_ID (and kept for the same reason): a check
// harness must be able to watch a NAMED ceremony and a NAMELESS one on
// demand, rather than replaying whole games until the coin lands the way it
// needs. Never fires in production even if the variable leaks there.
export function pickCoronationSet(): readonly string[] {
  const forced = !isProduction ? process.env.FORCE_CORONATION_SET : undefined;
  if (forced === 'B') {
    return CORONATION_SET_B;
  }
  if (forced === 'C') {
    return CORONATION_SET_C;
  }
  return CORONATION_SETS[Math.floor(Math.random() * CORONATION_SETS.length)];
}

// The whole coronation, in speaking order: one set, three lines. Null only if
// every line of the chosen set has been deleted (Task 271) - there is no
// "unspeakable winner" case any more, and with it no WINNER_LINES fallback.
//
// The winner's NAME enters the DISPLAY text here and nowhere else, and only
// on CORONATION_NAME_LINE. It is deliberately NOT conditioned on whether a
// vocative clip exists: the subtitle says the name either way (that is what
// makes set B still land today, with zero vocative clips recorded for any of
// the 201 names), while the separate vocative CLIP is spliced on only when it
// is genuinely on disk - a decision the CALLER makes, since disk access lives
// in socratesAudio.ts and this stays a pure line-bank function like every
// other pick* above. A missing clip therefore silences the splice, never the
// name.
//
// `name` null (a tie, whose winner is not one person) simply leaves the line
// as its bare self: "Το δικό σου." still reads, and no placeholder or stray
// punctuation is left behind, which is the {ΚΛΗΤΙΚΗ} lesson of Task 270.
export function buildCoronationSequence(name: string | null): PickedLine[] | null {
  // Task 271's deletion rule, applied exactly as pickSequence applies it to
  // the other two sequences: a deleted line is SKIPPED, never played and
  // never marked used, so the ceremony runs one line shorter rather than
  // reading a missing clip's silence into it.
  const lines = pickCoronationSet()
    .filter((template) => !isLineDeleted(template))
    .map<PickedLine>((template) => ({
      template,
      text: template === CORONATION_NAME_LINE && name ? `${template} ${getVocative(name)}.` : template,
      tag: LINE_TAGS[template] ?? null,
    }));
  return lines.length > 0 ? lines : null;
}

// Task 138 built these pools empty (detection only); Task 139 wrote the
// lines. Same craft rules as every pool above: name-free, short (the TTS
// clip length is round time), an observation then a turn, landing on a
// judgement or a threat.
export const DRAW_LINES: Record<DrawMoment, readonly string[]> = {
  DRAW_INTRO: [
    'Αφήστε τα λόγια και πιάστε το πινέλο. Ομολογώ ότι αυτό με τρομάζει περισσότερο.',
    'Ας δούμε τα χέρια σας τώρα, όχι τα στόματά σας. Φοβάμαι πως θα προδώσουν κι αυτά.',
    "Τελείωσαν οι λέξεις, μένουν οι γραμμές. Αναρωτιέμαι αν σχεδιάζετε καλύτερα απ' όσο μιλάτε.",
    'Η Αθήνα γέμισε αγάλματα από χέρια σπουδαία. Τα δικά σας χέρια θα κριθούν πιο αυστηρά.',
    'Ζωγραφίστε καθαρά, σαν να σας βλέπει όλη η πόλη. Γιατί σας βλέπει.',
  ],
  NOBODY_GUESSED: [
    'Κοίταξαν όλοι το έργο και κανείς δεν κατάλαβε τίποτα. Με ανησυχεί που δεν φταίει μόνο ένας.',
    'Ούτε ένας δεν βρήκε τι έβλεπε. Ή το χέρι πρόδωσε τη σκέψη, ή η σκέψη δεν ήρθε ποτέ.',
    'Τόσα μάτια πάνω σε ένα σχέδιο, και όλα είδαν λάθος πράγμα. Κάποιος εδώ χρωστάει μια συγγνώμη.',
    'Το έργο έμεινε αίνιγμα για όλους. Θαυμάζω τον καλλιτέχνη — έκρυψε το θέμα του εντελώς.',
    'Κανείς δεν αναγνώρισε το έργο. Στην Αγορά αυτό το λέμε μυστήριο· εδώ θα το πω αποτυχία.',
  ],
  EVERYBODY_GUESSED: [
    'Το είδαν όλοι και το βρήκαν όλοι. Ομολογώ πως τόση σαφήνεια εδώ μέσα με ξαφνιάζει.',
    'Όλοι βρήκαν το ίδιο πράγμα στο ίδιο σχέδιο. Επιτέλους ένα χέρι που λέει την αλήθεια.',
    'Κάθε ματιά έπεσε στο σωστό. Ο ζωγράφος μίλησε πιο καθαρά από κάθε ρήτορα σήμερα.',
    'Καμία παρεξήγηση πουθενά. Να προσέχετε όποιον πείθει τόσο εύκολα.',
    'Τόσο καθαρό ήταν, που το βρήκαν και οι βιαστικοί. Αναρωτιέμαι αν ήταν τέχνη ή ευκολία.',
  ],
  SPLIT_GUESS: [
    'Ο καθένας είδε κάτι διαφορετικό στο ίδιο σχέδιο. Έτσι γεννιούνται οι αιρέσεις.',
    'Οι μισοί είδαν άλλο και οι άλλοι άλλο. Με ανησυχεί που όλοι σας ήσασταν σίγουροι.',
    'Ένα σχέδιο και τόσες ερμηνείες. Κάπως έτσι χάθηκε και η δημοκρατία μας.',
    'Άλλος είδε το ένα, άλλος το άλλο. Ο ζωγράφος ζωγράφισε αίνιγμα και σας άφησε να μαλώνετε.',
    "Οι ψήφοι μοιράστηκαν παντού. Έτσι ψηφίζει η πόλη μας — και γι' αυτό φοβάμαι για εκείνη.",
    // Task 146 additions.
    'Άλλος είδε ένα πράγμα κι άλλος κάτι άλλο, στο ίδιο χαρτί. Ποιος κοίταξε και ποιος φαντάστηκε;',
    'Οι απαντήσεις σκορπίστηκαν σε κάθε κατεύθυνση, σαν να είδατε διαφορετικά σχέδια. Ένα ήταν, και το χάσατε από κοινού.',
    'Δύο άνθρωποι κοίταξαν το ίδιο πράγμα και διαφώνησαν. Όλη μου τη ζωή προσπαθώ να καταλάβω πώς γίνεται αυτό.',
  ],
  DRAW_WINNER: [
    'Ένα χέρι ξεχώρισε σήμερα ανάμεσα σε όλα. Θα το θυμάμαι όταν διαλέγω μαθητή.',
    'Κάποιος εδώ μέσα μιλάει πιο καθαρά με το πινέλο παρά με τη γλώσσα. Το εκτιμώ βαθιά.',
    'Ο καλύτερος ζωγράφος αναδείχθηκε από τα μάτια των υπολοίπων. Δύσκολα ξεγελάς τόσα μάτια.',
    'Βρέθηκε ο ζωγράφος της παρέας. Οι υπόλοιποι, μείνετε στα λόγια — εκεί κρύβεστε καλύτερα.',
    'Ένας σας κέρδισε τα μάτια όλων με λίγες γραμμές. Οι ρήτορες εδώ μέσα ας ντραπούν λίγο.',
    // Task 146 additions.
    'Κάποιος έκανε τους άλλους να δουν τη σκέψη του χωρίς μία λέξη. Εγώ χρειάζομαι ώρες για το ίδιο πράγμα.',
    'Ένα χέρι σήμερα ήταν πιο πειστικό από κάθε επιχείρημα που ακούστηκε εδώ. Κρατήστε το υπόψη όταν έρθει η ώρα να με πείσετε.',
    "Ο νικητής αυτού του γύρου δεν φώναξε και δεν επιχειρηματολόγησε. Απλώς έγινε κατανοητός, και αυτό είναι σπανιότερο απ' όσο νομίζετε.",
  ],
};

// Task 188b built this empty by design; Task 296 WROTE the three lines, which
// is exactly the "no other change needed" switch that note described: phases.ts
// already waits for the host's audio_ended once a line fires here, so the duel's
// early-lock beat is audible from this edit alone.
//
// Deliberately under BOTH speech policies (Argyrios's rule, superseding Task
// 138's silent-duel decision for this one case): Η Μονομαχία is a unique
// mechanic and deserves a line whether the room plays v1 or v2. This pool is
// the single source of the three lines - SPEECH_V2_LINES.DUEL_LOCKED below
// aliases THIS array rather than restating it, so the two can never drift and
// `usedLines` cannot let one policy repeat what the other already spoke.
export const DUEL_LINES: Record<DuelMoment, readonly string[]> = {
  DUEL_LOCKED: [
    'Δύο στην κορυφή. Η Αθήνα δοκίμασε κάποτε δύο άρχοντες. Κράτησε μία μέρα.',
    'Φτάσατε μαζί. Κρίμα — το σκαλί χωράει έναν. Διαλέξτε όπλο.',
    'Μοιραστήκατε την ανάβαση. Τη νίκη δεν τη μοιράζεται κανείς. Εμπρός.',
  ],
};

// Task 300 - what Socrates says when the room VOTES him quiet mid-narration.
// ONE line plays, once per skipped sequence, and it is the only thing between
// the discarded narration and whatever that narration was leading to.
//
// Under BOTH speech policies, for the same reason DUEL_LOCKED and SPEAR_OUT are
// (Task 296): this belongs to a MECHANIC - the room's own interruption - not to
// a stage's structural slot, so it never goes near pickSpeechSlot and is never
// gated on room.settings.speechPolicy. Four lines rather than three because a
// game can hold two skippable sequences (the opening narration and Η Ανάβασις'
// announcement) and `usedLines` must still have something unrepeated to draw
// for the second.
//
// No mp3 exists for any of these until the October pass, which is the accepted
// interim every unrecorded pool has: the host's LOBBY prefetch 404s, the client
// acks at once (Task 154), and the beat is subtitle-only. That is exactly why
// this beat cannot strand a room that has just asked for the talking to stop.
export const SKIP_INTERRUPTED_LINES: readonly string[] = [
  'Καλά. Ούτε στη δίκη μου δεν με διέκοψαν τόσο γρήγορα.',
  'Μιλούσα. Ψηφίσατε. Δημοκρατία — το χειρότερο πολίτευμα, εκτός από όσα δοκιμάσαμε.',
  'Η Εκκλησία του Δήμου αποφάσισε να σωπάσω. Πρώτη φορά συμφωνώ με απόφασή της τόσο απρόθυμα.',
  'Σημειώνω τα ονόματα όσων ψήφισαν. Δεν θα το ξεχάσω. Παίξτε.',
];

export const NUMERIC_LINES: Record<NumericMoment, readonly string[]> = {
  EXACT_HIT: [
    'Κάποιος βρήκε τον αριθμό ακριβώς. Δεν πιστεύω στην τύχη τόσο πολύ — άρα μου κρύβετε πράγματα.',
    'Ακριβώς πάνω στον αριθμό έπεσε κάποιος. Τέτοια ακρίβεια ή λατρεύεται ή ανακρίνεται.',
    'Το νούμερο βρέθηκε στο ακέραιο. Ομολογώ ότι τόση σιγουριά δεν την περίμενα από κανέναν σας.',
    'Κάποιος δεν μάντεψε — ήξερε. Και όποιος ξέρει τόσο καλά, κάτι μας κρύβει.',
    'Μια βολή έπεσε στο κέντρο. Οι υπόλοιποι μετρήστε πόσο μακριά πέσατε, και ντραπείτε ανάλογα.',
  ],
  WILDLY_OFF: [
    'Κάποια εκτίμηση εδώ ξέφυγε από κάθε λογική. Αναρωτιέμαι σε ποιον κόσμο μετράνε έτσι.',
    'Είδα ένα νούμερο τόσο μακριά από την αλήθεια, που σχεδόν το θαύμασα. Σχεδόν.',
    'Ένας από εσάς δεν αστόχησε απλώς — ταξίδεψε. Η αλήθεια έμεινε πίσω, να χαιρετάει.',
    'Τέτοιο λάθος θέλει θάρρος. Με ανησυχεί που το θάρρος σας περισσεύει και η κρίση όχι.',
    'Η απόσταση από τη σωστή απάντηση μετριέται εδώ με πλοίο. Κάποιος να του δείξει τον χάρτη.',
  ],
  ALL_CLUSTERED: [
    'Όλες οι εκτιμήσεις έπεσαν σχεδόν στο ίδιο σημείο. Σκέφτηκε ένα κοπάδι, όχι πολλά μυαλά.',
    'Συμφωνήσατε μεταξύ σας χωρίς να μιλήσετε. Με ανησυχεί πόσο εύκολα γίνεστε ένα.',
    'Τα νούμερά σας αγκαλιάστηκαν σαν παλιοί φίλοι. Τόση ομόνοια κάπου αλλού θα με συγκινούσε.',
    'Σχεδόν ίδιες απαντήσεις από όλους. Ή σκέφτεστε ίδια, ή κρυφοκοιτάτε. Ξέρω τι ποντάρω.',
    'Μαζευτήκατε όλοι γύρω από το ίδιο νούμερο. Στην Αθήνα το πλήθος έτσι έπνιξε πολλές αλήθειες.',
    // Task 146 additions.
    'Όλα τα νούμερα έπεσαν στο ίδιο σημείο, χωρίς κουβέντα. Σκέφτεστε ή απλώς θυμάστε τα ίδια;',
    'Όλες οι εκτιμήσεις μαζεμένες σε μια σπιθαμή. Αν είναι λάθος, θα έχετε τουλάχιστον παρέα στην πτώση.',
    'Συμφωνήσατε χωρίς να ανταλλάξετε λέξη, και αυτό δεν με καθησυχάζει. Έτσι κάνει λάθος μια ολόκληρη πόλη.',
    'Κανείς σας δεν τόλμησε να ξεφύγει από τους υπόλοιπους. Το ασφαλές νούμερο σπάνια είναι το σωστό, και ποτέ το γενναίο.',
  ],
  NOBODY_CLOSE: [
    'Ρώτησα έναν αριθμό και κανείς δεν τον πλησίασε. Ευτυχώς που δεν χτίζετε εσείς τα τείχη μας.',
    'Ο κοντινότερος από εσάς έπεσε μακριά, και οι άλλοι μακρύτερα. Με θλίβει η ακρίβειά σας.',
    'Η αλήθεια στάθηκε σε ένα σημείο και όλοι περάσατε από αλλού. Ούτε κατά λάθος δεν την αγγίξατε.',
    'Κανείς δεν έπεσε κοντά στο σωστό. Αναρωτιέμαι πώς ψωνίζετε στην αγορά χωρίς να κλαίτε.',
    'Τόσο μακριά πέσατε όλοι, που το σωστό νούμερο δεν ακούστηκε καν. Του χρωστάτε μια συγγνώμη.',
  ],
};

// Task 294 - the v2 speech policy's own pools, copied VERBATIM from
// content/speech-policy-lines.md (T-D, locked 2026-09-20): 36 lines, 12
// pools, three lines each. Task 296 appended the 13th, QUIZ_BEST, to that same
// file and to this table. Counted against the source file: 39 spoken lines,
// 13 pool headers.
//
// Deliberately a SEPARATE table from LINES/DRAW_LINES/NUMERIC_LINES above,
// not new entries inside them: v1 must stay byte-identical, and v1 reaches a
// line only through the pools it already names. Nothing in the v1 picker can
// see this table, so registering it cannot change a v1 show's beats.
//
// DUEL_LOCKED and SPEAR_OUT are the TWO EXCEPTIONS to that separation, both
// wired by Task 296 and both deliberately audible under v1 as well: they belong
// to unique MECHANICS (Η Μονομαχία's early lock, Η Λόγχη's strike) rather than
// to a stage's structural slot, and a unique mechanic gets a line whatever
// policy the room plays. DUEL_LOCKED is literally the same array as v1's
// DUEL_LINES.DUEL_LOCKED (aliased below, so one `usedLines` entry covers both
// names), and SPEAR_OUT is read by phases.ts's own endClimbReveal branch
// through recordSpearOutAndPickLine - neither goes anywhere near
// pickSpeechSlot, so neither is gated on room.settings.speechPolicy. The
// tasks/291 §4 note that "no hook exists" for SPEAR_OUT is what Task 296
// closed.
//
// NO mp3s exist for any of these until the October generation pass, and that
// is the accepted interim state: the host's LOBBY prefetch 404s on them, so
// each beat ends on the client's immediate onEnded() ack (Task 154) rather
// than on the unknown-clip backstop. That is equally true of the two mechanic
// beats Task 296 wired - a real TV ends them in milliseconds today, which is
// exactly why neither can stall the climb or the duel.
export type SpeechSlotPool =
  | 'PALAISTRA_MID_BEST'
  | 'PALAISTRA_MID_WORST'
  | 'PALAISTRA_CLOSE_BEST'
  | 'PALAISTRA_CLOSE_WORST'
  | 'LITHI_CLOSE_OBSERVER'
  | 'LITHI_CLOSE_BLIND'
  | 'SYKO_FIRST_STEAL'
  | 'SYKO_CLOSE_THIEF'
  | 'SYKO_CLOSE_VICTIM'
  | 'AGORA_WORST'
  | 'DUEL_LOCKED'
  | 'SPEAR_OUT'
  // Task 296 - the 13th pool, appended to content/speech-policy-lines.md by
  // that task. The quiz stage's BEST side, which Task 294 left null: its mid
  // and close slots could only ever speak about the player having the worst of
  // it (AGORA_WORST) or out of a v1 reservoir.
  | 'QUIZ_BEST'
  // Task 309 - the 15th-18th pools: DRAW_MID and NUMERIC_CLOSE's own v2 lines,
  // second person like every other slot pool. They replace the third-person
  // v1 reservoirs (NOBODY/EVERYBODY_GUESSED, EXACT_HIT/WILDLY_OFF, which stay
  // for v1) as what those two slots read, so the named address no longer
  // sits on top of a line about "someone".
  | 'DRAW_MID_BEST'
  | 'DRAW_MID_WORST'
  | 'NUMERIC_CLOSE_BEST'
  | 'NUMERIC_CLOSE_WORST';

export const SPEECH_V2_LINES: Record<SpeechSlotPool, readonly string[]> = {
  PALAISTRA_MID_BEST: [
    'Δύσκολα σε ρίχνουν τα ψέματά μου. Στην Παλαίστρα αυτό λέγεται ταλέντο. Παντού αλλού, τύχη.',
    'Ο γύρος πέρασε και δεν σε άγγιξε κανείς. Οι θεατές αρχίζουν να στοιχηματίζουν επάνω σου.',
    "Αποφασίζεις πιο γρήγορα απ' όσο σκέφτεσαι. Έτσι νικούν οι παλαιστές. Και οι ανόητοι, αλλά ας μη χαλάσουμε τη στιγμή.",
  ],
  PALAISTRA_MID_WORST: [
    'Δίστασες. Στην Παλαίστρα ο δισταγμός μετράει ως πτώση.',
    'Ο πρώτος γύρος σε έριξε στο χώμα. Τα καλά νέα: το χώμα δεν έχει πιο κάτω.',
    'Μην απελπίζεσαι. Ο δεύτερος γύρος υπάρχει ακριβώς για ανθρώπους σαν εσένα.',
  ],
  PALAISTRA_CLOSE_BEST: [
    'Πάλεψες με τα ψέματά μου και δεν έπεσες. Αυτό δεν το λέω συχνά.',
    'Η Παλαίστρα σε στεφανώνει. Μικρό στεφάνι, αλλά δικό σου.',
    'Έπεσαν όλοι εκτός από εσένα. Χάρου το απόψε. Αύριο δεν θα το θυμάται κανείς.',
  ],
  PALAISTRA_CLOSE_WORST: [
    'Η Παλαίστρα τελείωσε και το χώμα έχει το σχήμα σου. Τουλάχιστον άφησες σημάδι.',
    'Έχασες κάθε πάλη, μα σηκώθηκες κάθε φορά. Οι φιλόσοφοι το λένε αρετή. Οι παλαιστές, πείσμα.',
    'Σε είδα να ψάχνεις την αλήθεια εκεί που δεν ήταν. Συμβαίνει και στους καλύτερους. Σπανίως τόσες φορές.',
  ],
  LITHI_CLOSE_OBSERVER: [
    'Πέρασες από την Αγορά μία φορά και θυμάσαι περισσότερα από τους εμπόρους της. Ανησυχητικό χάρισμα.',
    'Η Λήθη δεν βρήκε τίποτα δικό σου να πάρει. Έφυγε με άδεια χέρια, πρώτη φορά.',
    'Θυμάσαι την Αγορά καλύτερα από όλους. Ή έχεις μάτια παντού, ή έστησες τον πάγκο εσύ.',
  ],
  LITHI_CLOSE_BLIND: [
    'Πέρασες από την Αγορά και δεν είδες τίποτα. Η Λήθη σε ευχαριστεί για τη συνεργασία.',
    'Κοιτούσες την Αγορά όλη την ώρα. Πού ταξίδευε ο νους σου, δεν θα ρωτήσω.',
    'Θυμάσαι λιγότερα κι από τους ψαράδες μετά το κρασί. Τουλάχιστον εκείνοι έχουν δικαιολογία.',
  ],
  SYKO_FIRST_STEAL: [
    'Μόλις έβγαλες ψωμί από κατηγορία. Οι συκοφάντες της πόλης σε καμαρώνουν από κάτω.',
    'Το πρώτο κλεμμένο είναι πάντα το πιο γλυκό. Τα επόμενα είναι απλώς επάγγελμα.',
    'Δεν ρώτησες αν είναι δίκαιο. Ρώτησες μόνο πόσα. Θα πας μακριά σε αυτή την πόλη.',
  ],
  SYKO_CLOSE_THIEF: [
    'Μάζεψες περισσότερα από κατηγορίες παρά από απαντήσεις. Στην Αθήνα αυτό λέγεται καριέρα.',
    'Οι άλλοι έπαιζαν το παιχνίδι. Εσύ έπαιζες τους άλλους. Σημείωσα τη διαφορά.',
    'Κέρδισες με ξένους πόντους. Δεν σε κατηγορώ — απλώς θα κάθομαι πιο μακριά σου στο συμπόσιο.',
  ],
  SYKO_CLOSE_VICTIM: [
    "Σου πήραν περισσότερα απ' όσα κέρδισες. Στην Αθήνα αυτό το λέμε φορολογία.",
    'Σε έγδυσαν οι κατήγοροι απόψε. Παρηγορήσου: κυνηγούν μόνο όποιον έχει κάτι να χάσει.',
    'Όλοι διάλεξαν εσένα. Κάτι ξέρουν, ή κάτι φοβούνται. Και τα δύο κολακευτικά, με τον τρόπο τους.',
  ],
  AGORA_WORST: [
    'Η Αγορά δεν σε αγάπησε απόψε. Δεν πειράζει. Ούτε εμένα με αγάπησε ποτέ.',
    'Κάθε αγορά έχει κάποιον που πληρώνει ακριβά και φεύγει με άδειο καλάθι. Απόψε κρατάς εσύ το καλάθι.',
    'Οι απαντήσεις σου έχουν θάρρος. Η ακρίβεια θα έβλαπτε; Όχι. Δοκίμασέ τη.',
  ],
  // Task 296 - the SAME array as v1's pool above, not a copy: one mechanic,
  // one set of three lines, one usedLines entry per line whichever policy
  // spoke it. Only lockDuel reads either name.
  DUEL_LOCKED: DUEL_LINES.DUEL_LOCKED,
  SPEAR_OUT: [
    'Το δόρυ βρήκε στόχο. Το θέατρο σε αποχαιρετά — κάποιοι ανεβαίνουν με τα πόδια, εσύ έφυγες ιπτάμενος.',
    'Δύο γύρους ρίζωσες στο ίδιο σκαλί. Η Ανάβαση δεν ανέχεται αγάλματα.',
    'Έπεσες πολεμώντας στο πρώτο σκαλί. Κάπου πρέπει να στέκεται και ο φύλακας της βάσης.',
  ],
  QUIZ_BEST: [
    'Η Αγορά έχει χίλιες φωνές. Απόψε ακούγεται κυρίως η δική σου.',
    'Απαντάς σαν να έχεις ξαναδεί τις ερωτήσεις. Δεν σε κατηγορώ. Σε παρακολουθώ.',
    'Οι έμποροι ρωτούν ποιος είσαι. Οι σοφιστές ρωτούν πόσο χρεώνεις.',
  ],
  DRAW_MID_BEST: [
    'Όλοι κατάλαβαν τι ζωγράφισες. Σπάνιο για σοφιστή. Συνήθως κανείς δεν καταλαβαίνει τι λέμε.',
    'Το σχέδιό σου το διάβασαν όλοι με την πρώτη. Σοφιστής που γίνεται κατανοητός. Ανησυχητικό.',
    'Λίγες γραμμές και σε κατάλαβαν όλοι. Τα λόγια σου δεν τα κατάφεραν ποτέ τόσο καλά.',
  ],
  DRAW_MID_WORST: [
    'Κανείς δεν κατάλαβε τι ζωγράφισες. Επιτέλους, ένας σοφιστής που δεν πείθει κανέναν.',
    'Το σχέδιό σου έμεινε μυστήριο για όλους. Ακόμα και για σένα, υποψιάζομαι.',
    'Κανείς δεν το βρήκε. Οι μεγάλοι καλλιτέχνες πέθαιναν παρεξηγημένοι. Μη βιαστείς να τους μοιάσεις.',
  ],
  NUMERIC_CLOSE_BEST: [
    'Οι σοφιστές μετρούν λόγια. Εσύ μετράς τον κόσμο. Και τον μετράς σωστά.',
    "Οι αριθμοί σου έπεσαν πιο κοντά απ' όλων. Ή ξέρεις, ή μαντεύεις καλύτερα απ' όσο πρέπει.",
    'Σε ρώτησα πόσα και ήξερες. Επιτέλους ένας σοφιστής με κάτι χρήσιμο.',
  ],
  NUMERIC_CLOSE_WORST: [
    'Είπες αριθμούς που δεν έχουν καμία σχέση με τον κόσμο μας. Σε ζηλεύω λίγο.',
    'Οι εκτιμήσεις σου ήταν τολμηρές. Λάθος, αλλά τολμηρές. Κανένας σοφιστής δεν ζητά περισσότερα.',
    'Σε κάθε ερώτηση, ήσουν μακριά. Σε αυτό τουλάχιστον ήσουν συνεπής.',
  ],
};

// ============================= selection logic =============================

// Task 43: optional eleven_v3 emotion/non-verbal tags ("[sarcastic]",
// "[sighs]"...), keyed by the exact line TEMPLATE text they belong to - a
// side table rather than inline fields on LINES/INTRO_LINES so the pools
// above stay plain `readonly string[]`, and every existing selection/
// cooldown/dedup check (all of which key on template text) is untouched.
// A template with no entry here plays with no tag, exactly as before this
// map existed. Spoken only - prepended to the text sent to the TTS API by
// dev/generate-voice-lines.ts, never to what's shown on screen or to
// `text` below.
export const LINE_TAGS: Partial<Record<string, string>> = {
  // Task 278 - the coronation's two three-line sets, replacing Task 263's
  // opener/line-two and Task 247's gendered last line. Every tag here is from
  // the bank's own 11-tag vocabulary. Load-bearing like every entry in this
  // map - the clip is found by lineHash(template, tag), so changing a tag
  // renames the file. Each set keeps the "no two adjacent beats share a tag"
  // shape the beat has always had: B runs [thoughtful] -> [serious] ->
  // [warm], C runs [sarcastic] -> [sighs] -> [serious].
  [CORONATION_SET_B[0]]: '[thoughtful]',
  [CORONATION_SET_B[1]]: '[serious]',
  [CORONATION_SET_B[2]]: '[warm]',
  [CORONATION_SET_C[0]]: '[sarcastic]',
  [CORONATION_SET_C[1]]: '[sighs]',
  [CORONATION_SET_C[2]]: '[serious]',
  // Task 236 - the 22 lines Task 230 generated, now wired into the pools
  // above. These tags are LOAD-BEARING, not decoration: the client finds a
  // clip by lineHash(template, tag), so a missing entry here would hash to
  // lineHash(template, null), 404, and the beat would fall silent (Task 154
  // ends it immediately on a 404, so it would look like nothing fired at
  // all). Verified: all 22 hash to the mp3 Task 230 actually generated.
  // GAME_INTRO_SEQUENCE (Εισαγωγή #1-10)
  'Καλώς ήρθατε στην Αθήνα.': '[warm]',
  'Το θέατρο γέμισε από νωρίς. Ο δήμος αφήνει τη δουλειά του για δύο πράγματα: για τραγωδία, και για να δει κάποιον να πέφτει.':
    '[amused]',
  'Απόψε ήρθαν για το δεύτερο.': '[dry]',
  'Και ήρθατε κι εσείς. Σοφιστές, λένε. Άνθρωποι που πουλούν τη σοφία τους σε όποιον πληρώνει.': '[sarcastic]',
  "Εγώ δεν έχω να πουλήσω τίποτα. Δεν ξέρω τίποτα. Γι' αυτό ρωτάω.": '[warm]',
  'Και απόψε θα ρωτήσω εσάς. Πολλά. Σε γνώση, σε ταχύτητα, σε μνήμη — και σε πράγματα που δεν περιμένετε.':
    '[thoughtful]',
  "Κάποιοι από εσάς θα λάμψετε νωρίς. Το πλήθος θ' αγαπήσει το όνομά σας.": '[warm]',
  'Και θα δείτε πόσο γρήγορα το ξεχνάει.': '[dry]',
  "Ένας από εσάς θ' αντέξει ως το τέλος. Κάτι τον περιμένει εκεί. Δεν θα σας πω τι… δεν το λέω ποτέ σε όσους δεν έφτασαν.":
    '[thoughtful]',
  'Το πλήθος θα κρίνει — και το πλήθος δεν είναι ευγενικό. Ας αρχίσουμε.': '[serious]',
  // STAGE_INTRO_LINES.blitz (Παλαίστρα #11-13)
  'Στην Παλαίστρα δεν συζητούσαν. Πάλευαν. Θα σας πω κάτι, κι εσείς θα το δεχτείτε ή θα το ρίξετε. Όποιος διστάσει, έχασε.':
    '[serious]',
  'Θα ακούσετε ισχυρισμούς. Άλλοι αληθεύουν, άλλοι όχι. Δεν έχετε χρόνο να ξεχωρίσετε — μόνο να διαλέξετε.': '[serious]',
  'Θα σας πω δώδεκα πράγματα. Δεν είναι όλα αληθινά. Ούτε έχετε χρόνο να καταλάβετε ποια.': '[amused]',
  // STAGE_INTRO_LINES.draw (Ζωγραφική #14-15)
  'Οι λέξεις σάς βοήθησαν ως τώρα. Ας δούμε τι κάνετε χωρίς αυτές.': '[curious]',
  'Ο ζωγράφος ξέρει. Δεν επιτρέπεται να μιλήσει. Ίσως είναι η μόνη φορά απόψε που κάποιος θα σωπάσει… ενώ ξέρει.': '[dry]',
  // STAGE_INTRO_LINES.numeric (Εκτίμηση #16-17)
  'Πόσα; Αυτή είναι όλη η ερώτηση. Δεν χρειάζεται να ξέρετε — χρειάζεται να μαντέψετε καλύτερα από τους άλλους.':
    '[curious]',
  'Οι σοφοί μετρούσαν τον κόσμο. Εσείς θα τον μαντέψετε. Είναι σχεδόν το ίδιο, και πολύ πιο γρήγορο.': '[amused]',
  // STAGE_INTRO_LINES.agora (Η Λήθη #18-19)
  'Η Λήθη δεν παίρνει όσα ξεχνάτε. Παίρνει όσα δεν προσέξατε ποτέ.': '[serious]',
  'Θα σας δείξω, και μετά θα σας ρωτήσω. Ανάμεσα στα δύο, η Λήθη θα κάνει τη δουλειά της.': '[thoughtful]',
  // ANAVASIS_INTRO_SEQUENCE (Η Ανάβασις #20-22)
  'Το θέατρο τελείωσε. Κοιτάξτε πού στέκεστε.': '[serious]',
  'Δεν είστε όλοι στο ίδιο ύψος. Ό,τι κερδίσατε απόψε, εκεί πήγε — όχι σε νίκη, σε σκαλιά.': '[serious]',
  'Από δω και πέρα δεν μετράει τι ξέρετε. Μόνο πόσο ψηλά φτάνετε. Ο ναός είναι εκεί πάνω, και χωράει έναν.': '[serious]',
  // EVERYONE_WRONG
  'Κοιτάζω γύρω μου και δεν βλέπω ούτε μία σωστή απάντηση. Θα το θυμάμαι όταν έρθει η ώρα να διαλέξω.': '[deadpan]',
  'Ούτε ένας ανάμεσα σε όλους σας. Και ήρθατε εδώ με τόση σιγουριά.': '[sarcastic]',
  'Ώστε συμφωνείτε όλοι. Κρίμα που συμφωνείτε στο λάθος.': '[sarcastic]',
  'Κοιτάξτε γύρω σας. Αυτοί είναι οι συνυποψήφιοί σας. Παρηγορηθείτε.': '[amused]',
  'Τέτοια ομοφωνία την είχαμε μόνο όταν καταδικάζαμε κάποιον.': '[dry]',
  'Όλοι μαζί, στο ίδιο ακριβώς λάθος. Υπάρχει μια αρμονία εδώ που δεν την αξίζετε.': '[dry]',
  // ONLY_ONE_CORRECT
  'Ένας. Μόνο ένας ανάμεσά σας. Κοιτάξτε καλά.': '[impressed]',
  'Όλοι λάθος εκτός από έναν. Αυτό λέγεται διαφορά.': '[deadpan]',
  'Ένας μόνο. Οι υπόλοιποι μόλις έχασαν λίγη αξιοπρέπεια.': '[sarcastic]',
  'Κάποιος τα κατάφερε και όλοι οι άλλοι όχι. Μία φορά είναι τύχη· δύο, σοφία.': '[thoughtful]',
  'Ένα σωστό χέρι σηκώθηκε σε τούτη την Αγορά. Οι υπόλοιποι κοιτούσατε αλλού.': '[deadpan]',
  'Ένας ανάμεσα σε τόσους. Έτσι ξεχωρίζει κάποιος.': '[impressed]',
  'Ένας ξεχώρισε χωρίς καν να το επιδιώξει. Αυτά είναι που προσέχω, και σπάνια τα ξεχνάω.': '[thoughtful]',
  'Κοιτάξτε ποιος σήκωσε το βάρος. Οι υπόλοιποι κοιτάγατε.': '[sarcastic]',
  'Ώστε ένας μόνο κατάλαβε τι ρώτησα. Οι υπόλοιποι ξαναδιαβάστε την ερώτηση, με την ησυχία σας.': '[sarcastic]',
  // EVERYONE_CORRECT
  'Όλοι σωστά. Άρα η ερώτηση ήταν εύκολη. Μη μπερδεύεστε.': '[dry]',
  'Ομοφωνία. Ύποπτο πράγμα σε αίθουσα με τόσους φιλόδοξους.': '[curious]',
  'Μπράβο σε όλους. Τώρα κανείς δεν ξεχώρισε.': '[sarcastic]',
  'Κανένα λάθος. Θα κάνω την επόμενη δυσκολότερη.': '[serious]',
  'Το ήξεραν όλοι, άρα δεν έμαθα τίποτα για κανέναν σας. Θα το διορθώσω αυτό αμέσως.': '[curious]',
  'Ομόφωνα σωστό. Βαρετό, αλλά σωστό.': '[deadpan]',
  // BIG_COMEBACK
  'Και ξαφνικά, ζωή. Πού ήταν αυτό μέχρι τώρα;': '[amused]',
  'Ώστε μπορούσες. Και το κράτησες κρυφό.': '[curious]',
  'Κάποιος ανέβηκε από το πουθενά. Κοιτάτε, έτσι γίνεται.': '[impressed]',
  'Κάποιος γύρισε από εκεί που δεν γυρίζει κανείς. Ομολογώ ότι δεν τον είχα υπολογίσει.': '[impressed]',
  'Από την τελευταία θέση ως εδώ, μπροστά σε όλους. Αυτό το εκτιμώ περισσότερο από όποιον καθόταν ήσυχος στην κορυφή.': '[thoughtful]',
  'Με έκανε κάποιος να αλλάξω γνώμη. Δύσκολο πράγμα.': '[laughs]',
  'Γύρισε το παιχνίδι. Πού ήταν τόση ώρα αυτό;': '[amused]',
  'Και ξαφνικά κάποιος θυμήθηκε πώς να σκέφτεται. Λίγο αργά, αλλά το δέχομαι.': '[amused]',
  'Κάποιος θυμήθηκε γιατί ήρθε.': '[warm]',
  // LEAD_CHANGE
  'Άλλαξε η κορυφή. Ο θρόνος στην Αθήνα ποτέ δεν κράτησε πολύ.': '[thoughtful]',
  'Νέο πρώτο όνομα. Οι υπόλοιποι θυμηθείτε πώς είναι να κυνηγάτε.': '[serious]',
  'Ώστε αλλάζουν τα πράγματα εδώ μέσα. Καλά κάνουν — η βεβαιότητα με κουράζει περισσότερο από την άγνοια.': '[curious]',
  'Κάποιος πέρασε μπροστά. Για πόσο;': '[curious]',
  'Η κορυφή άλλαξε χέρια για μία ακόμη φορά. Μη συνηθίσετε κανέναν εκεί πάνω.': '[dry]',
  'Κάποιος πέρασε μπροστά, και μαζί πέρασε και ο στόχος στην πλάτη του. Θα το καταλάβει σύντομα.': '[serious]',
  // HOT_STREAK_5
  'Πέντε στη σειρά χωρίς δισταγμό. Δεν ξέρω αν είναι γνώση ή πείσμα, και δεν είμαι σίγουρος ποιο προτιμώ.': '[curious]',
  'Πέντε συνεχόμενες σωστές, και το πλήθος σταμάτησε να μιλάει. Αρχίζω να πιστεύω ότι κάποιον τον υποτίμησα.': '[impressed]',
  'Πέντε στη σειρά από τον έναν, και οι υπόλοιποι κάθεστε και βλέπετε. Ντρέπομαι λίγο για λογαριασμό σας.': '[sarcastic]',
  'Κάποιος τις παίρνει όλες. Η Αθήνα βρήκε το θέμα της.': '[amused]',
  'Πέντε συνεχόμενες. Αν πέσεις τώρα, θα πονέσει.': '[serious]',
  'Σταματήστε να με εντυπωσιάζετε. Δεν το αντέχω.': '[laughs]',
  'Πέντε συνεχόμενες. Οι υπόλοιποι, τι ακριβώς κάνετε;': '[sarcastic]',
  'Κανείς σας δεν μπορεί να σταματήσει αυτό το σερί. Ή είναι πολύ καλός, ή είστε πολύ αργοί.': '[amused]',
  // HOT_STREAK_3 (shared line - see LINES.HOT_STREAK_3)
  'Κανείς δεν σταματάει αυτό το σερί. Περίεργο πλήθος σήμερα.': '[curious]',
  // PERFECT_GAME_PACE
  'Ρυθμός χωρίς λάθος. Μήπως κάνω τις ερωτήσεις πολύ εύκολες;': '[curious]',
  'Κανένα λάθος ως τώρα. Αυτό δεν είναι σοφία, είναι υπόσχεση.': '[thoughtful]',
  'Τέλεια πορεία ως εδώ. Το ένα λάθος θα το θυμάστε για πάντα.': '[serious]',
  'Χωρίς λάθος μέχρι στιγμής. Με ανησυχεί.': '[curious]',
  "Άψογη πορεία μέχρι αυτή τη στιγμή. Και η στιγμή είναι πάντα πιο σύντομη απ' όσο νομίζετε.": '[dry]',
  'Καθαρή πορεία ως εδώ, χωρίς ούτε ένα λάθος. Έχω δει πολλές τέτοιες να λερώνονται, και πάντα ξαφνικά.': '[thoughtful]',
  // HOT_STREAK_3
  'Τρεις διαδοχικές. Κάτι συμβαίνει εδώ.': '[curious]',
  'Τρία συνεχόμενα. Αυτό δεν είναι τύχη πια.': '[thoughtful]',
  'Τρεις σωστές. Κάποιος εδώ ξέρει τι κάνει.': '[impressed]',
  'Κάποιος δεν σταματάει. Κάντε κάτι.': '[amused]',
  'Τρία στη σειρά. Από εδώ και πέρα κάθε λάθος θα το θυμούνται.': '[serious]',
  'Τρεις σωστές στη σειρά, και άρχισα να παρακολουθώ πιο στενά. Δεν είναι πάντα καλό αυτό.': '[curious]',
  'Τρία συνεχόμενα χωρίς λάθος. Από εδώ και πέρα κάθε αστοχία θα ακούγεται διπλά.': '[serious]',
  // STREAK_BROKEN
  'Τελείωσε το σερί. Όλα τελειώνουν, απλώς αυτό τελείωσε δημόσια.': '[sighs]',
  'Και να που έπεσες. Η πτώση από ψηλά ακούγεται περισσότερο.': '[deadpan]',
  'Σταμάτησε. Ήταν ωραία όσο κράτησε.': '[sighs]',
  'Τόσες σωστές στη σειρά, και μετά τίποτα. Έτσι ακριβώς τελειώνουν όλα τα σερί, και πάντα μπροστά σε κοινό.': '[sighs]',
  'Το σερί έσπασε. Το πλήθος το πρόσεξε πριν από εσένα.': '[sarcastic]',
  'Το σερί τελείωσε εδώ και τώρα. Ξαναρχίζεις από το μηδέν, όπως όλοι μας κάποτε.': '[deadpan]',
  // SPEED_DEMON
  'Απάντησες πριν τελειώσω. Είτε το ήξερες, είτε δεν με άκουγες.': '[curious]',
  'Ταχύτητα. Στην Αγορά ο πρώτος που μιλάει σπάνια έχει δίκιο.': '[thoughtful]',
  'Γρήγορα. Ελπίζω και σωστά.': '[dry]',
  'Τόση βιάση για μια ερώτηση που δεν επρόκειτο να φύγει πουθενά. Η γνώση περιμένει· εσείς όχι.': '[sighs]',
  'Πρόλαβες τους πάντες. Πρόλαβες να σκεφτείς;': '[sarcastic]',
  'Απάντησες πριν τελειώσω την ερώτηση. Δεν ξέρω αν να εντυπωσιαστώ ή να προσβληθώ.': '[amused]',
  // EASY_MISS
  'Αυτή την ερώτηση την ήξερε και το πλήθος που στέκεται πίσω σας. Σκεφτείτε το για λίγο.': '[sarcastic]',
  'Εύκολη ερώτηση. Την έκανες δύσκολη χωρίς λόγο.': '[deadpan]',
  'Θα προσποιηθώ ότι δεν το είδα. Οι υπόλοιποι όμως το είδαν.': '[amused]',
  'Αυτό ήταν από τα εύκολα. Ήταν.': '[deadpan]',
  'Ερώτηση για παιδιά, και όμως χάθηκε μπροστά μου. Δεν ξέρω τι να πω, και σπάνια μου συμβαίνει.': '[deadpan]',
  'Δεν χρειαζόταν γνώση εδώ, χρειαζόταν μόνο προσοχή. Και η προσοχή δεν κοστίζει τίποτα σε κανέναν.': '[dry]',
  'Εύκολο ερώτημα, βαριά απάντηση. Κάπου εκεί χάθηκε ένας υποψήφιος μαθητής.': '[sighs]',
  'Εύκολη ερώτηση, βαριά αστοχία.': '[sighs]',
  // HARD_HIT
  'Δύσκολη, και κάποιος την πέτυχε. Τύχη ή γνώση;': '[impressed]',
  'Λίγοι θα το ήξεραν. Σημείωσα ποιος.': '[thoughtful]',
  'Ώστε διαβάζεις. Επιτέλους κάποιος.': '[amused]',
  'Αυτό ήταν δύσκολο. Το πλήθος δεν το κατάλαβε καν.': '[impressed]',
  'Αυτό δεν το περίμενα από κανέναν σας, και το λέω χωρίς ειρωνεία. Συνεχίστε έτσι και θα το θυμάμαι.': '[impressed]',
  'Σωστή απάντηση σε ερώτημα που θα δυσκόλευε και εμένα. Αυτά είναι που μετράνε στο τέλος, όχι τα εύκολα.': '[serious]',
  // COLD_STREAK_3
  'Τρία λάθη στη σειρά. Υπάρχει μέθοδος εδώ.': '[dry]',
  'Τρεις συνεχόμενες αστοχίες. Δοκιμάστε να σκεφτείτε πρώτα.': '[sighs]',
  'Τρία στη σειρά, και εννοώ λάθος. Αρχίζω να πιστεύω ότι υπάρχει μέθοδος εδώ.': '[deadpan]',
  'Το πλήθος σταμάτησε να ελπίζει.': '[sighs]',
  'Τρεις σερί αποτυχίες. Η σταθερότητα σου είναι αξιοθαύμαστη.': '[sarcastic]',
  'Κάτι δεν πάει καλά. Και το βλέπουν όλοι.': '[serious]',
  // NO_ANSWER
  "Σιωπή απ' όλη την Αγορά. Θα την εκτιμούσα, αν ήταν επιλογή και όχι πανικός.": '[thoughtful]',
  'Καμία απάντηση. Τουλάχιστον δεν ειπώθηκε βλακεία.': '[dry]',
  'Ο χρόνος πέρασε, και κάποιος τον άφησε να περάσει από πάνω του. Αυτό λέει περισσότερα από μια λάθος απάντηση.': '[sighs]',
  'Καμία απάντηση απολύτως. Η άγνοια τουλάχιστον κράτησε το στόμα της κλειστό.': '[deadpan]',
  'Σας περίμενα να μιλήσετε και δεν ήρθατε. Ο Σωκράτης έχει συνηθίσει να τον αποφεύγουν.': '[dry]',
  'Απολύτως τίποτα. Και το τίποτα κρύβει είτε σοφία είτε φόβο — ξέρω ποιο από τα δύο ήταν.': '[thoughtful]',
  'Καμία απάντηση. Η σιωπή τουλάχιστον δεν λέει βλακείες.': '[sarcastic]',
  'Ο χρόνος πέρασε. Κάποιος τον άφησε να περάσει.': '[dry]',
  'Τίποτα. Και το τίποτα κι αυτό απάντηση είναι.': '[thoughtful]',
  // STUCK_IN_LAST
  'Ακόμα στην τελευταία θέση. Υπάρχει μια σταθερότητα εδώ.': '[deadpan]',
  'Τελευταία θέση από την αρχή. Τουλάχιστον υπάρχει συνέπεια.': '[sarcastic]',
  'Μη φεύγει κανείς. Κάποιος ορίζει τον πάτο.': '[amused]',
  'Ο δρόμος προς τη σοφία ξεκινά εκεί που στέκεστε. Κάποιος στέκεται πολύ πίσω.': '[thoughtful]',
  'Ακόμα εκεί κάτω, γύρο με τον γύρο. Αυτό λέει κάτι για την επιμονή, αν όχι για το μυαλό.': '[dry]',
  'Σας βλέπω όλους από εδώ που στέκομαι. Κάποιον τον βλέπω περισσότερο, και δεν είναι για καλό.': '[sarcastic]',
  'Ακόμα τελευταίος. Υπάρχει μια σταθερότητα εδώ που άλλοι θα ζήλευαν.': '[deadpan]',
  'Ο πάτος έχει κι αυτός τον φύλακά του.': '[dry]',
  'Κάποιος πρέπει να ορίζει το κάτω όριο. Ευχαριστούμε.': '[sarcastic]',
  // CLOSE_SCORES
  'Κολλητά. Κανείς σας δεν έχει κερδίσει τίποτα ακόμα.': '[serious]',
  'Τόσο κοντά που η επόμενη κρίνει χαρακτήρες, όχι πόντους.': '[thoughtful]',
  'Ισορροπία. Κάποιος πρέπει να τη χαλάσει.': '[curious]',
  'Λίγοι πόντοι σας χωρίζουν. Λίγοι πόντοι, μεγάλη διαφορά.': '[serious]',
  'Κανένας σας δεν έχει ξεχωρίσει ακόμη από τους υπόλοιπους. Και ο χρόνος για να το κάνετε τελειώνει.': '[serious]',
  'Στενό. Μου αρέσει όταν δεν ξέρω το τέλος.': '[amused]',
  // RUNAWAY_LEAD
  'Κάποιος ξέφυγε τόσο μπροστά που δεν τον φτάνετε. Στην Αθήνα τέτοιους τους εξοστρακίζαμε, και όχι άδικα.': '[serious]',
  'Κάποιος έχει ξεφύγει και κανείς σας δεν κάνει τίποτα.': '[sarcastic]',
  'Τόσο μπροστά που άρχισε να βαριέται.': '[amused]',
  'Η διαφορά μεγαλώνει. Αυτό δεν είναι αγώνας πια.': '[serious]',
  'Ένας εναντίον όλων. Και κερδίζει.': '[impressed]',
  'Σταματήστε τον. Παρακαλώ.': '[laughs]',
  'Ένας τρέχει μόνος του και οι υπόλοιποι τον παρακολουθείτε ευγενικά. Δεν είναι αγώνας αυτό, είναι παρέλαση.': '[sarcastic]',
  'Η διαφορά μεγάλωσε τόσο που έπαψε να έχει νόημα. Κάποιος να κάνει κάτι, βαριέμαι κι εγώ.': '[deadpan]',
  'Στην Αθήνα τον πρώτο τον εξοστρακίζαμε. Απλή υπενθύμιση.': '[dry]',
  // GENERIC_TRANSITION
  'Συνεχίζουμε. Η άγνοια δεν ξεκουράζεται.': '[serious]',
  'Προχωράμε στην επόμενη, και σας παρακολουθώ πιο στενά τώρα. Κάτι άρχισε να μου κινεί την περιέργεια.': '[curious]',
  'Πάμε. Το πλήθος βαριέται πιο γρήγορα από μένα.': '[amused]',
  'Άλλη μία ερώτηση, και μη χαλαρώσει κανείς. Οι εύκολες τελείωσαν πριν από λίγο.': '[dry]',
  'Προχωράμε. Κάποιος πρέπει να ξεχωρίσει.': '[serious]',
  'Επόμενο ερώτημα. Ελπίζω σε καλύτερα.': '[sighs]',
  // FINAL_QUESTION (intro)
  'Τελευταία ερώτηση. Ό,τι μάθατε ως τώρα κρίνεται εδώ.': '[serious]',
  'Η τελευταία. Μετά διαλέγω μαθητή και δεν αλλάζω γνώμη.': '[serious]',
  'Ένα ερώτημα ακόμη σας χωρίζει από το τέλος. Και σας κρίνει, είτε το θέλετε είτε όχι.': '[thoughtful]',
  'Τέλος. Μία ερώτηση σας χωρίζει από την απάντηση.': '[serious]',
  'Η τελευταία ευκαιρία να με πείσετε.': '[curious]',
  'Μετά από αυτήν την ερώτηση θα πέσει σιωπή. Και ύστερα θα ακουστεί μόνο η απόφασή μου.': '[serious]',
  // HALFWAY_POINT (intro)
  'Μισός δρόμος. Οι μισοί το κατάλαβαν ήδη ότι δεν θα τα καταφέρουν.': '[sarcastic]',
  'Φτάσαμε στη μέση. Ό,τι χτίσατε μπορεί να καταρρεύσει.': '[serious]',
  'Μέση. Καλή στιγμή να αναρωτηθείτε γιατί ήρθατε.': '[thoughtful]',
  'Οι μισές ερωτήσεις πέρασαν και είστε ακόμη όρθιοι. Οι δύσκολες όμως μένουν, και δεν συγχωρούν.': '[serious]',
  'Μέχρι εδώ καλά. Από εδώ και πέρα, δεν ξέρω.': '[curious]',
  'Φτάσαμε στη μέση και κανείς δεν έχει κερδίσει τίποτα. Ό,τι μαζέψατε ως τώρα χάνεται εύκολα.': '[dry]',
  // CATEGORY_CALLOUT (intro)
  'Εδώ χωρίζονται όσοι ξέρουν από όσους νομίζουν.': '[serious]',
  'Ας δούμε τώρα ποιος διάβασε.': '[curious]',
  'Αυτό το θέμα δεν συγχωρεί το μπλόφαρισμα. Θα φανεί αμέσως ποιος διάβασε και ποιος μαντεύει.': '[serious]',
  'Προσοχή τώρα, γιατί εδώ δεν περνάει κανείς τυχαία. Θέλω να δω ποιος θα σηκώσει το βλέμμα.': '[curious]',
  'Κάποιοι από εσάς μόλις χλωμιάσατε.': '[amused]',
  'Δείξτε μου επιτέλους κάτι που να αξίζει. Περιμένω από την αρχή αυτής της συζήτησης.': '[dry]',
  // GENERIC_INTRO (intro)
  'Καλώς ήρθατε στην Αγορά, όλοι σας. Ήρθατε για τη γνώση ή για τα βλέμματα; Θα το μάθω πριν τελειώσουμε.': '[curious]',
  'Ένας από εσάς θα γίνει μαθητής μου. Οι υπόλοιποι θα φύγετε πιο ταπεινοί.': '[serious]',
  'Μαζευτήκατε. Τώρα δείξτε μου ότι αξίζατε τον δρόμο.': '[curious]',
  'Ξεκινάμε. Δεν ξέρω τίποτα, αλλά εσείς ξέρετε ακόμα λιγότερα.': '[amused]',
  'Η Αθήνα ολόκληρη ακούει αυτή τη συζήτηση. Μιλήστε προσεκτικά, γιατί δεν ξεχνάει τίποτα.': '[serious]',
  'Καθίστε και ετοιμαστείτε. Οι ερωτήσεις μου δεν είναι ευγενικές, και δεν σκοπεύω να αλλάξω.': '[dry]',
  // GAME_INTRO (Task 48)
  'Καλώς ήρθατε στην Αγορά. Καθίστε, και μη βιαστείτε να μιλήσετε.': '[warm]',
  'Ήρθατε για τη γνώση ή για το πλήθος; Θα φανεί σύντομα.': '[curious]',
  'Δεν ρωτάω για να μάθω τι ξέρετε. Ρωτάω για να δω ποιοι είστε όταν δεν ξέρετε.': '[thoughtful]',
  'Η μισή Αθήνα μαζεύτηκε εδώ για να σας δει. Ελπίζω να μην τους απογοητεύσετε όσο φοβάμαι.': '[amused]',
  'Εγώ ένα ξέρω: ότι δεν ξέρω τίποτα. Εσείς θα δυσκολευτείτε περισσότερο.': '[thoughtful]',
  'Τρεις γύροι σας χωρίζουν από την απάντηση που ήρθατε να ακούσετε. Ελάχιστοι φτάνουν ως εκεί όρθιοι.': '[serious]',
  'Ας αρχίσει η διαμάχη. Και ας κερδίσει ο λιγότερο ανόητος.': '[warm]',
  // STAGE_INTRO stage 1 — Η Αγορά (Task 48)
  'Βρισκόμαστε στην Αγορά, εκεί όπου ξεκινούν όλες οι συζητήσεις. Εδώ χάνονται και οι περισσότερες.': '[warm]',
  'Πρώτος γύρος. Ακόμα κανείς δεν έχει ντροπιαστεί.': '[curious]',
  'Στην Αγορά μιλάει όποιος τολμά. Τολμήστε.': '[serious]',
  'Ξεκινάμε ήρεμα και πολιτισμένα, όπως αρμόζει. Δεν πρόκειται να κρατήσει πολύ αυτό.': '[dry]',
  'Η Αγορά είναι γεμάτη κόσμο σήμερα, και όλοι περιμένουν. Ας δούμε ποιος θα στέκεται ακόμη εδώ στο τέλος.': '[curious]',
  "Τα πρώτα ερωτήματα είναι πάντα απλά, και γι' αυτό επικίνδυνα. Οι απαντήσεις σας θα σας προδώσουν πριν το καταλάβετε.": '[thoughtful]',
  // STAGE_INTRO stage 2 — Οι Σοφιστές (Task 48)
  'Οι Σοφιστές. Από εδώ και πέρα δεν αρκεί να ξέρετε.': '[serious]',
  'Δεύτερος γύρος. Τώρα μπορείτε να βλάψετε ο ένας τον άλλον.': '[amused]',
  'Οι Σοφιστές δίδασκαν πώς να κερδίζεις, όχι πώς να έχεις δίκιο. Θα σας φανεί χρήσιμο.': '[dry]',
  'Ελπίζω να μην έχετε φίλους εδώ μέσα. Θα σας εμποδίσουν.': '[sarcastic]',
  'Ένα όπλο ο καθένας. Ας δούμε σε ποιον θα στραφεί.': '[curious]',
  'Η γνώση χωρίς πονηριά χάνει. Το έμαθα με τον δύσκολο τρόπο.': '[serious]',
  // STAGE_INTRO stage 3 — Η Δίκη (Task 48)
  'Η Δίκη. Εδώ δεν υπερασπίζεστε γνώση, υπερασπίζεστε τον εαυτό σας.': '[serious]',
  'Φτάσαμε στον τελευταίο γύρο, στη Δίκη. Ξέρω καλά πώς τελειώνουν οι δίκες σε αυτή την πόλη.': '[thoughtful]',
  'Από εδώ και πέρα, ό,τι κερδίσετε το παίρνετε από κάποιον άλλον.': '[dry]',
  'Η Δίκη. Επιτέλους κάτι που ξέρω από πρώτο χέρι.': '[sarcastic]',
  'Δεν υπάρχουν συμμαχίες πια. Ούτε υπήρξαν ποτέ.': '[serious]',
  'Το τέλος πλησιάζει. Ποιος από εσάς θα το αντέξει;': '[curious]',
  // WINNER (Task 48)
  'Βρήκα τον μαθητή μου. Η Αθήνα το είδε.': '[warm]',
  "Ένας στάθηκε πάνω απ' όλους. Δεν ήταν τύχη.": '[serious]',
  'Αυτό ήταν αξιοπρεπές. Και δεν το λέω συχνά.': '[impressed]',
  'Ο νικητής κέρδισε τη θέση δίπλα μου. Ας δούμε αν την αντέχει.': '[thoughtful]',
  'Οι υπόλοιποι, μην απελπίζεστε. Και εγώ έχασα μια δίκη κάποτε.': '[amused]',
  'Τελείωσε. Ένας σοφότερος, οι υπόλοιποι ταπεινότεροι. Καλή συμφωνία.': '[dry]',
  'Η διαμάχη έληξε. Πήρα την απόφασή μου.': '[warm]',
  'Ο μαθητής βρέθηκε. Η γνώση, όπως πάντα, μας διέφυγε.': '[serious]',
  // DRAW_INTRO (Task 139)
  'Αφήστε τα λόγια και πιάστε το πινέλο. Ομολογώ ότι αυτό με τρομάζει περισσότερο.': '[amused]',
  'Ας δούμε τα χέρια σας τώρα, όχι τα στόματά σας. Φοβάμαι πως θα προδώσουν κι αυτά.': '[dry]',
  "Τελείωσαν οι λέξεις, μένουν οι γραμμές. Αναρωτιέμαι αν σχεδιάζετε καλύτερα απ' όσο μιλάτε.": '[curious]',
  'Η Αθήνα γέμισε αγάλματα από χέρια σπουδαία. Τα δικά σας χέρια θα κριθούν πιο αυστηρά.': '[serious]',
  'Ζωγραφίστε καθαρά, σαν να σας βλέπει όλη η πόλη. Γιατί σας βλέπει.': '[deadpan]',
  // NOBODY_GUESSED (Task 139)
  'Κοίταξαν όλοι το έργο και κανείς δεν κατάλαβε τίποτα. Με ανησυχεί που δεν φταίει μόνο ένας.': '[dry]',
  'Ούτε ένας δεν βρήκε τι έβλεπε. Ή το χέρι πρόδωσε τη σκέψη, ή η σκέψη δεν ήρθε ποτέ.': '[deadpan]',
  'Τόσα μάτια πάνω σε ένα σχέδιο, και όλα είδαν λάθος πράγμα. Κάποιος εδώ χρωστάει μια συγγνώμη.': '[amused]',
  'Το έργο έμεινε αίνιγμα για όλους. Θαυμάζω τον καλλιτέχνη — έκρυψε το θέμα του εντελώς.': '[sarcastic]',
  'Κανείς δεν αναγνώρισε το έργο. Στην Αγορά αυτό το λέμε μυστήριο· εδώ θα το πω αποτυχία.': '[dry]',
  // EVERYBODY_GUESSED (Task 139)
  'Το είδαν όλοι και το βρήκαν όλοι. Ομολογώ πως τόση σαφήνεια εδώ μέσα με ξαφνιάζει.': '[impressed]',
  'Όλοι βρήκαν το ίδιο πράγμα στο ίδιο σχέδιο. Επιτέλους ένα χέρι που λέει την αλήθεια.': '[warm]',
  'Κάθε ματιά έπεσε στο σωστό. Ο ζωγράφος μίλησε πιο καθαρά από κάθε ρήτορα σήμερα.': '[impressed]',
  'Καμία παρεξήγηση πουθενά. Να προσέχετε όποιον πείθει τόσο εύκολα.': '[dry]',
  'Τόσο καθαρό ήταν, που το βρήκαν και οι βιαστικοί. Αναρωτιέμαι αν ήταν τέχνη ή ευκολία.': '[curious]',
  // SPLIT_GUESS (Task 139)
  'Ο καθένας είδε κάτι διαφορετικό στο ίδιο σχέδιο. Έτσι γεννιούνται οι αιρέσεις.': '[amused]',
  'Οι μισοί είδαν άλλο και οι άλλοι άλλο. Με ανησυχεί που όλοι σας ήσασταν σίγουροι.': '[thoughtful]',
  'Ένα σχέδιο και τόσες ερμηνείες. Κάπως έτσι χάθηκε και η δημοκρατία μας.': '[dry]',
  'Άλλος είδε το ένα, άλλος το άλλο. Ο ζωγράφος ζωγράφισε αίνιγμα και σας άφησε να μαλώνετε.': '[amused]',
  "Οι ψήφοι μοιράστηκαν παντού. Έτσι ψηφίζει η πόλη μας — και γι' αυτό φοβάμαι για εκείνη.": '[sighs]',
  // DRAW_WINNER (Task 139)
  'Ένα χέρι ξεχώρισε σήμερα ανάμεσα σε όλα. Θα το θυμάμαι όταν διαλέγω μαθητή.': '[warm]',
  'Κάποιος εδώ μέσα μιλάει πιο καθαρά με το πινέλο παρά με τη γλώσσα. Το εκτιμώ βαθιά.': '[impressed]',
  'Ο καλύτερος ζωγράφος αναδείχθηκε από τα μάτια των υπολοίπων. Δύσκολα ξεγελάς τόσα μάτια.': '[serious]',
  'Βρέθηκε ο ζωγράφος της παρέας. Οι υπόλοιποι, μείνετε στα λόγια — εκεί κρύβεστε καλύτερα.': '[sarcastic]',
  'Ένας σας κέρδισε τα μάτια όλων με λίγες γραμμές. Οι ρήτορες εδώ μέσα ας ντραπούν λίγο.': '[amused]',
  // EXACT_HIT (Task 139)
  'Κάποιος βρήκε τον αριθμό ακριβώς. Δεν πιστεύω στην τύχη τόσο πολύ — άρα μου κρύβετε πράγματα.': '[curious]',
  'Ακριβώς πάνω στον αριθμό έπεσε κάποιος. Τέτοια ακρίβεια ή λατρεύεται ή ανακρίνεται.': '[dry]',
  'Το νούμερο βρέθηκε στο ακέραιο. Ομολογώ ότι τόση σιγουριά δεν την περίμενα από κανέναν σας.': '[impressed]',
  'Κάποιος δεν μάντεψε — ήξερε. Και όποιος ξέρει τόσο καλά, κάτι μας κρύβει.': '[amused]',
  'Μια βολή έπεσε στο κέντρο. Οι υπόλοιποι μετρήστε πόσο μακριά πέσατε, και ντραπείτε ανάλογα.': '[deadpan]',
  // WILDLY_OFF (Task 139)
  'Κάποια εκτίμηση εδώ ξέφυγε από κάθε λογική. Αναρωτιέμαι σε ποιον κόσμο μετράνε έτσι.': '[sarcastic]',
  'Είδα ένα νούμερο τόσο μακριά από την αλήθεια, που σχεδόν το θαύμασα. Σχεδόν.': '[deadpan]',
  'Ένας από εσάς δεν αστόχησε απλώς — ταξίδεψε. Η αλήθεια έμεινε πίσω, να χαιρετάει.': '[amused]',
  'Τέτοιο λάθος θέλει θάρρος. Με ανησυχεί που το θάρρος σας περισσεύει και η κρίση όχι.': '[dry]',
  'Η απόσταση από τη σωστή απάντηση μετριέται εδώ με πλοίο. Κάποιος να του δείξει τον χάρτη.': '[laughs]',
  // ALL_CLUSTERED (Task 139)
  'Όλες οι εκτιμήσεις έπεσαν σχεδόν στο ίδιο σημείο. Σκέφτηκε ένα κοπάδι, όχι πολλά μυαλά.': '[dry]',
  'Συμφωνήσατε μεταξύ σας χωρίς να μιλήσετε. Με ανησυχεί πόσο εύκολα γίνεστε ένα.': '[thoughtful]',
  'Τα νούμερά σας αγκαλιάστηκαν σαν παλιοί φίλοι. Τόση ομόνοια κάπου αλλού θα με συγκινούσε.': '[amused]',
  'Σχεδόν ίδιες απαντήσεις από όλους. Ή σκέφτεστε ίδια, ή κρυφοκοιτάτε. Ξέρω τι ποντάρω.': '[sarcastic]',
  'Μαζευτήκατε όλοι γύρω από το ίδιο νούμερο. Στην Αθήνα το πλήθος έτσι έπνιξε πολλές αλήθειες.': '[serious]',
  // NOBODY_CLOSE (Task 139)
  'Ρώτησα έναν αριθμό και κανείς δεν τον πλησίασε. Ευτυχώς που δεν χτίζετε εσείς τα τείχη μας.': '[dry]',
  'Ο κοντινότερος από εσάς έπεσε μακριά, και οι άλλοι μακρύτερα. Με θλίβει η ακρίβειά σας.': '[sighs]',
  'Η αλήθεια στάθηκε σε ένα σημείο και όλοι περάσατε από αλλού. Ούτε κατά λάθος δεν την αγγίξατε.': '[deadpan]',
  'Κανείς δεν έπεσε κοντά στο σωστό. Αναρωτιέμαι πώς ψωνίζετε στην αγορά χωρίς να κλαίτε.': '[amused]',
  'Τόσο μακριά πέσατε όλοι, που το σωστό νούμερο δεν ακούστηκε καν. Του χρωστάτε μια συγγνώμη.': '[dry]',
  // STAGE_INTRO stage 3 — Η Συκοφαντία (Task 139; the old Δίκη entries above
  // keep their tags - their lines moved to TRIAL_INTRO_LINES, text unchanged)
  'Η Συκοφαντία. Οι κατήγοροι έβγαζαν ψωμί από τις κατηγορίες — τώρα θα βγάλετε κι εσείς.': '[dry]',
  'Φτάνουμε στη Συκοφαντία. Εμένα με κατηγόρησαν άδικα· εσάς θα σας κατηγορήσουν σωστά.': '[sarcastic]',
  'Ρωτάω ακόμη εγώ, μα πλέον κλέβετε κι εσείς. Θα δούμε ποιος έχει ταλέντο στο άδικο.': '[curious]',
  'Η Συκοφαντία ανοίγει. Κρατήστε τους πόντους σας σφιχτά — τα χέρια εδώ μέσα μακραίνουν.': '[amused]',
  // Task 146 additions - 19 lines for the six moments the voice rating pass
  // left with 0-1 usable lines.
  // ALL_CLUSTERED
  'Όλα τα νούμερα έπεσαν στο ίδιο σημείο, χωρίς κουβέντα. Σκέφτεστε ή απλώς θυμάστε τα ίδια;': '[curious]',
  'Όλες οι εκτιμήσεις μαζεμένες σε μια σπιθαμή. Αν είναι λάθος, θα έχετε τουλάχιστον παρέα στην πτώση.': '[deadpan]',
  'Συμφωνήσατε χωρίς να ανταλλάξετε λέξη, και αυτό δεν με καθησυχάζει. Έτσι κάνει λάθος μια ολόκληρη πόλη.': '[serious]',
  'Κανείς σας δεν τόλμησε να ξεφύγει από τους υπόλοιπους. Το ασφαλές νούμερο σπάνια είναι το σωστό, και ποτέ το γενναίο.': '[thoughtful]',
  // PERFECT_GAME_PACE
  'Ούτε ένα λάθος ως αυτή τη στιγμή, από κανέναν σας. Κάτι μου λέει ότι φταίνε οι ερωτήσεις μου, και θα το διορθώσω.': '[dry]',
  'Προχωράτε χωρίς να σκοντάψετε πουθενά ακόμη. Όταν έρθει το πρώτο λάθος, θα ακουστεί σαν αγγείο που σπάει.': '[serious]',
  'Μια πορεία χωρίς ψεγάδι με κάνει καχύποπτο, όχι περήφανο. Έχω δει την τελειότητα να κρύβει τεμπελιά πιο συχνά από σοφία.': '[thoughtful]',
  // CATEGORY_CALLOUT
  '{category}. Θέλω να δω ποιος θα σηκώσει το βλέμμα τώρα και ποιος θα κοιτάξει τα πόδια του.': '[curious]',
  '{category}. Εδώ δεν βοηθάει η ευγλωττία, μόνο η μνήμη — και η μνήμη σας δεν με έχει εντυπωσιάσει.': '[dry]',
  '{category}. Ένα θέμα που δεν χωράει μπλόφα, και εγώ έχω δει κάθε είδους μπλόφα σε αυτή την πόλη.': '[serious]',
  // SPLIT_GUESS
  'Άλλος είδε ένα πράγμα κι άλλος κάτι άλλο, στο ίδιο χαρτί. Ποιος κοίταξε και ποιος φαντάστηκε;': '[curious]',
  'Οι απαντήσεις σκορπίστηκαν σε κάθε κατεύθυνση, σαν να είδατε διαφορετικά σχέδια. Ένα ήταν, και το χάσατε από κοινού.': '[dry]',
  'Δύο άνθρωποι κοίταξαν το ίδιο πράγμα και διαφώνησαν. Όλη μου τη ζωή προσπαθώ να καταλάβω πώς γίνεται αυτό.': '[thoughtful]',
  // DRAW_WINNER
  'Κάποιος έκανε τους άλλους να δουν τη σκέψη του χωρίς μία λέξη. Εγώ χρειάζομαι ώρες για το ίδιο πράγμα.': '[impressed]',
  'Ένα χέρι σήμερα ήταν πιο πειστικό από κάθε επιχείρημα που ακούστηκε εδώ. Κρατήστε το υπόψη όταν έρθει η ώρα να με πείσετε.': '[serious]',
  "Ο νικητής αυτού του γύρου δεν φώναξε και δεν επιχειρηματολόγησε. Απλώς έγινε κατανοητός, και αυτό είναι σπανιότερο απ' όσο νομίζετε.": '[warm]',
  // STAGE_INTRO stage 3 — Η Συκοφαντία
  "Φτάσαμε στη Συκοφαντία, το θέμα που ξέρω καλύτερα απ' όσο θα ήθελα. Προσέξτε ποιον κοιτάτε στα μάτια από δω και πέρα.": '[serious]',
  'Στην Αθήνα μια κατηγορία δεν χρειαζόταν αποδείξεις, μόνο κοινό. Έχετε και τα δύο απόψε.': '[dry]',
  'Η Συκοφαντία αρχίζει, και μαζί της τελειώνει η ευγένεια. Θα δούμε πόσο γρήγορα ξεχνάτε ότι ήρθατε μαζί.': '[amused]',
  // Task 294 - the 36 v2 slot lines (SPEECH_V2_LINES above). LOAD-BEARING
  // exactly as the Task 236 block is: the clip is found by
  // lineHash(template, tag), so these tags decide the filenames the October
  // generation pass will produce, and a missing entry here would hash to
  // lineHash(template, null) and 404 forever.
  'Δύσκολα σε ρίχνουν τα ψέματά μου. Στην Παλαίστρα αυτό λέγεται ταλέντο. Παντού αλλού, τύχη.': '[dry]',
  'Ο γύρος πέρασε και δεν σε άγγιξε κανείς. Οι θεατές αρχίζουν να στοιχηματίζουν επάνω σου.': '[amused]',
  "Αποφασίζεις πιο γρήγορα απ' όσο σκέφτεσαι. Έτσι νικούν οι παλαιστές. Και οι ανόητοι, αλλά ας μη χαλάσουμε τη στιγμή.":
    '[thoughtful]',
  'Δίστασες. Στην Παλαίστρα ο δισταγμός μετράει ως πτώση.': '[sighs]',
  'Ο πρώτος γύρος σε έριξε στο χώμα. Τα καλά νέα: το χώμα δεν έχει πιο κάτω.': '[dry]',
  'Μην απελπίζεσαι. Ο δεύτερος γύρος υπάρχει ακριβώς για ανθρώπους σαν εσένα.': '[warm]',
  'Πάλεψες με τα ψέματά μου και δεν έπεσες. Αυτό δεν το λέω συχνά.': '[serious]',
  'Η Παλαίστρα σε στεφανώνει. Μικρό στεφάνι, αλλά δικό σου.': '[amused]',
  'Έπεσαν όλοι εκτός από εσένα. Χάρου το απόψε. Αύριο δεν θα το θυμάται κανείς.': '[dry]',
  'Η Παλαίστρα τελείωσε και το χώμα έχει το σχήμα σου. Τουλάχιστον άφησες σημάδι.': '[dry]',
  'Έχασες κάθε πάλη, μα σηκώθηκες κάθε φορά. Οι φιλόσοφοι το λένε αρετή. Οι παλαιστές, πείσμα.': '[amused]',
  'Σε είδα να ψάχνεις την αλήθεια εκεί που δεν ήταν. Συμβαίνει και στους καλύτερους. Σπανίως τόσες φορές.': '[sighs]',
  'Πέρασες από την Αγορά μία φορά και θυμάσαι περισσότερα από τους εμπόρους της. Ανησυχητικό χάρισμα.': '[thoughtful]',
  'Η Λήθη δεν βρήκε τίποτα δικό σου να πάρει. Έφυγε με άδεια χέρια, πρώτη φορά.': '[dry]',
  'Θυμάσαι την Αγορά καλύτερα από όλους. Ή έχεις μάτια παντού, ή έστησες τον πάγκο εσύ.': '[amused]',
  'Πέρασες από την Αγορά και δεν είδες τίποτα. Η Λήθη σε ευχαριστεί για τη συνεργασία.': '[dry]',
  'Κοιτούσες την Αγορά όλη την ώρα. Πού ταξίδευε ο νους σου, δεν θα ρωτήσω.': '[sighs]',
  'Θυμάσαι λιγότερα κι από τους ψαράδες μετά το κρασί. Τουλάχιστον εκείνοι έχουν δικαιολογία.': '[amused]',
  'Μόλις έβγαλες ψωμί από κατηγορία. Οι συκοφάντες της πόλης σε καμαρώνουν από κάτω.': '[amused]',
  'Το πρώτο κλεμμένο είναι πάντα το πιο γλυκό. Τα επόμενα είναι απλώς επάγγελμα.': '[dry]',
  'Δεν ρώτησες αν είναι δίκαιο. Ρώτησες μόνο πόσα. Θα πας μακριά σε αυτή την πόλη.': '[thoughtful]',
  'Μάζεψες περισσότερα από κατηγορίες παρά από απαντήσεις. Στην Αθήνα αυτό λέγεται καριέρα.': '[dry]',
  'Οι άλλοι έπαιζαν το παιχνίδι. Εσύ έπαιζες τους άλλους. Σημείωσα τη διαφορά.': '[amused]',
  'Κέρδισες με ξένους πόντους. Δεν σε κατηγορώ — απλώς θα κάθομαι πιο μακριά σου στο συμπόσιο.': '[serious]',
  "Σου πήραν περισσότερα απ' όσα κέρδισες. Στην Αθήνα αυτό το λέμε φορολογία.": '[sighs]',
  'Σε έγδυσαν οι κατήγοροι απόψε. Παρηγορήσου: κυνηγούν μόνο όποιον έχει κάτι να χάσει.': '[warm]',
  'Όλοι διάλεξαν εσένα. Κάτι ξέρουν, ή κάτι φοβούνται. Και τα δύο κολακευτικά, με τον τρόπο τους.': '[dry]',
  'Η Αγορά δεν σε αγάπησε απόψε. Δεν πειράζει. Ούτε εμένα με αγάπησε ποτέ.': '[warm]',
  'Κάθε αγορά έχει κάποιον που πληρώνει ακριβά και φεύγει με άδειο καλάθι. Απόψε κρατάς εσύ το καλάθι.': '[dry]',
  'Οι απαντήσεις σου έχουν θάρρος. Η ακρίβεια θα έβλαπτε; Όχι. Δοκίμασέ τη.': '[thoughtful]',
  'Δύο στην κορυφή. Η Αθήνα δοκίμασε κάποτε δύο άρχοντες. Κράτησε μία μέρα.': '[serious]',
  'Φτάσατε μαζί. Κρίμα — το σκαλί χωράει έναν. Διαλέξτε όπλο.': '[amused]',
  'Μοιραστήκατε την ανάβαση. Τη νίκη δεν τη μοιράζεται κανείς. Εμπρός.': '[dry]',
  'Το δόρυ βρήκε στόχο. Το θέατρο σε αποχαιρετά — κάποιοι ανεβαίνουν με τα πόδια, εσύ έφυγες ιπτάμενος.': '[sighs]',
  'Δύο γύρους ρίζωσες στο ίδιο σκαλί. Η Ανάβαση δεν ανέχεται αγάλματα.': '[dry]',
  'Έπεσες πολεμώντας στο πρώτο σκαλί. Κάπου πρέπει να στέκεται και ο φύλακας της βάσης.': '[warm]',
  // Task 296 - QUIZ_BEST, the 13th pool. Load-bearing exactly like every
  // entry above: the clip is lineHash(template, tag).
  'Η Αγορά έχει χίλιες φωνές. Απόψε ακούγεται κυρίως η δική σου.': '[dry]',
  'Απαντάς σαν να έχεις ξαναδεί τις ερωτήσεις. Δεν σε κατηγορώ. Σε παρακολουθώ.': '[thoughtful]',
  'Οι έμποροι ρωτούν ποιος είσαι. Οι σοφιστές ρωτούν πόσο χρεώνεις.': '[amused]',
  // Task 309 - DRAW_MID_BEST/WORST and NUMERIC_CLOSE_BEST/WORST, pools 15-18.
  // Load-bearing like every entry above: the clip is lineHash(template, tag).
  'Όλοι κατάλαβαν τι ζωγράφισες. Σπάνιο για σοφιστή. Συνήθως κανείς δεν καταλαβαίνει τι λέμε.': '[amused]',
  'Το σχέδιό σου το διάβασαν όλοι με την πρώτη. Σοφιστής που γίνεται κατανοητός. Ανησυχητικό.': '[dry]',
  'Λίγες γραμμές και σε κατάλαβαν όλοι. Τα λόγια σου δεν τα κατάφεραν ποτέ τόσο καλά.': '[thoughtful]',
  'Κανείς δεν κατάλαβε τι ζωγράφισες. Επιτέλους, ένας σοφιστής που δεν πείθει κανέναν.': '[dry]',
  'Το σχέδιό σου έμεινε μυστήριο για όλους. Ακόμα και για σένα, υποψιάζομαι.': '[sighs]',
  'Κανείς δεν το βρήκε. Οι μεγάλοι καλλιτέχνες πέθαιναν παρεξηγημένοι. Μη βιαστείς να τους μοιάσεις.': '[amused]',
  'Οι σοφιστές μετρούν λόγια. Εσύ μετράς τον κόσμο. Και τον μετράς σωστά.': '[thoughtful]',
  "Οι αριθμοί σου έπεσαν πιο κοντά απ' όλων. Ή ξέρεις, ή μαντεύεις καλύτερα απ' όσο πρέπει.": '[dry]',
  'Σε ρώτησα πόσα και ήξερες. Επιτέλους ένας σοφιστής με κάτι χρήσιμο.': '[amused]',
  'Είπες αριθμούς που δεν έχουν καμία σχέση με τον κόσμο μας. Σε ζηλεύω λίγο.': '[dry]',
  'Οι εκτιμήσεις σου ήταν τολμηρές. Λάθος, αλλά τολμηρές. Κανένας σοφιστής δεν ζητά περισσότερα.': '[amused]',
  'Σε κάθε ερώτηση, ήσουν μακριά. Σε αυτό τουλάχιστον ήσουν συνεπής.': '[sighs]',
  // Task 300 - SKIP_INTERRUPTED, the 14th pool. Same load-bearing role: the
  // clip is lineHash(template, tag), so these four tags decide the filenames
  // the October pass produces, and a missing entry here would hash to
  // lineHash(template, null) and 404 forever.
  'Καλά. Ούτε στη δίκη μου δεν με διέκοψαν τόσο γρήγορα.': '[dry]',
  'Μιλούσα. Ψηφίσατε. Δημοκρατία — το χειρότερο πολίτευμα, εκτός από όσα δοκιμάσαμε.': '[sighs]',
  'Η Εκκλησία του Δήμου αποφάσισε να σωπάσω. Πρώτη φορά συμφωνώ με απόφασή της τόσο απρόθυμα.': '[amused]',
  'Σημειώνω τα ονόματα όσων ψήφισαν. Δεν θα το ξεχάσω. Παίξτε.': '[deadpan]',
};

// Task 62: a quality rating side table, same shape and rationale as
// LINE_TAGS above - keyed by exact line TEMPLATE text, entirely separate
// from the LINES pools themselves (so pool contents/order stay untouched).
// pickLine below uses this only to WEIGHT which unused line in a pool gets
// picked (genius 3x as likely as okish) - it never affects whether a line
// can repeat (usedLines still governs that) or which moment/pool fires.
// Only genius/okish outliers are marked explicitly; a line with no entry
// here is 'good' by default, which carries the same weight as 'okish'+1 ==
// unrated, so writing 'good' explicitly would be redundant - see
// DEFAULT_LINE_WEIGHT below. Currently rates the REVEAL pools (LINES) only,
// since those are the moments Task 62 is about; intro/one-shot pools are
// unrated (all lines equally likely).
export type LineRating = 'genius' | 'good' | 'okish';

export const LINE_RATINGS: Partial<Record<string, LineRating>> = {
  // EVERYONE_WRONG
  'Κοιτάζω γύρω μου και δεν βλέπω ούτε μία σωστή απάντηση. Θα το θυμάμαι όταν έρθει η ώρα να διαλέξω.': 'genius',
  'Ώστε συμφωνείτε όλοι. Κρίμα που συμφωνείτε στο λάθος.': 'genius',
  'Τέτοια ομοφωνία την είχαμε μόνο όταν καταδικάζαμε κάποιον.': 'genius',
  'Κοιτάξτε γύρω σας. Αυτοί είναι οι συνυποψήφιοί σας. Παρηγορηθείτε.': 'okish',
  // ONLY_ONE_CORRECT
  'Κάποιος τα κατάφερε, και όλοι οι άλλοι όχι. Αναρωτιέμαι αν το ήξερε ή αν του ήρθε. Μία φορά είναι τύχη· δύο, σοφία.':
    'genius',
  'Ένας ξεχώρισε χωρίς καν να το επιδιώξει. Αυτά είναι που προσέχω, και σπάνια τα ξεχνάω.': 'genius',
  'Ώστε ένας μόνο κατάλαβε τι ρώτησα. Οι υπόλοιποι ξαναδιαβάστε την ερώτηση, με την ησυχία σας.': 'genius',
  'Ένας ανάμεσα σε τόσους. Έτσι ξεχωρίζει κάποιος.': 'okish',
  // EVERYONE_CORRECT
  'Ομοφωνία. Ύποπτο πράγμα σε αίθουσα με τόσους φιλόδοξους.': 'genius',
  'Το ήξεραν όλοι, άρα δεν έμαθα τίποτα για κανέναν σας. Θα το διορθώσω αυτό αμέσως.': 'genius',
  'Κανένα λάθος. Θα κάνω την επόμενη δυσκολότερη.': 'okish',
  'Ομόφωνα σωστό. Βαρετό, αλλά σωστό.': 'okish',
  // BIG_COMEBACK
  'Ώστε μπορούσες. Και το κράτησες κρυφό.': 'genius',
  'Κάποιος γύρισε από εκεί που δεν γυρίζει κανείς. Ομολογώ ότι δεν τον είχα υπολογίσει.': 'genius',
  'Από την τελευταία θέση ως εδώ, μπροστά σε όλους. Αυτό το εκτιμώ περισσότερο από όποιον καθόταν ήσυχος στην κορυφή.':
    'genius',
  'Κάποιος ανέβηκε από το πουθενά. Κοιτάτε, έτσι γίνεται.': 'okish',
  'Γύρισε το παιχνίδι. Πού ήταν τόση ώρα αυτό;': 'okish',
  'Κάποιος θυμήθηκε γιατί ήρθε.': 'okish',
  // LEAD_CHANGE
  'Άλλαξε η κορυφή. Ο θρόνος στην Αθήνα ποτέ δεν κράτησε πολύ.': 'genius',
  'Ώστε αλλάζουν τα πράγματα εδώ μέσα. Καλά κάνουν — η βεβαιότητα με κουράζει περισσότερο από την άγνοια.': 'genius',
  'Κάποιος πέρασε μπροστά, και μαζί πέρασε και ο στόχος στην πλάτη του. Θα το καταλάβει σύντομα.': 'genius',
  'Κάποιος πέρασε μπροστά. Για πόσο;': 'okish',
  // HOT_STREAK_5
  'Πέντε στη σειρά χωρίς δισταγμό. Δεν ξέρω αν είναι γνώση ή πείσμα, και δεν είμαι σίγουρος ποιο προτιμώ.': 'genius',
  'Πέντε συνεχόμενες σωστές, και το πλήθος σταμάτησε να μιλάει. Αρχίζω να πιστεύω ότι κάποιον τον υποτίμησα.':
    'genius',
  'Κάποιος τις παίρνει όλες. Η Αθήνα βρήκε το θέμα της.': 'okish',
  'Πέντε συνεχόμενες. Οι υπόλοιποι, τι ακριβώς κάνετε;': 'okish',
  // PERFECT_GAME_PACE
  'Κανένα λάθος ως τώρα. Αυτό δεν είναι σοφία, είναι υπόσχεση.': 'genius',
  "Άψογη πορεία μέχρι αυτή τη στιγμή. Και η στιγμή είναι πάντα πιο σύντομη απ' όσο νομίζετε.": 'genius',
  'Καθαρή πορεία ως εδώ, χωρίς ούτε ένα λάθος. Έχω δει πολλές τέτοιες να λερώνονται, και πάντα ξαφνικά.': 'genius',
  'Χωρίς λάθος μέχρι στιγμής. Με ανησυχεί.': 'okish',
  // HOT_STREAK_3
  'Τρεις σωστές στη σειρά, και άρχισα να παρακολουθώ πιο στενά. Δεν είναι πάντα καλό αυτό.': 'genius',
  'Τρεις διαδοχικές. Κάτι συμβαίνει εδώ.': 'okish',
  'Τρεις σωστές. Κάποιος εδώ ξέρει τι κάνει.': 'okish',
  'Κάποιος δεν σταματάει. Κάντε κάτι.': 'okish',
  // STREAK_BROKEN
  'Τελείωσε το σερί. Όλα τελειώνουν, απλώς αυτό τελείωσε δημόσια.': 'genius',
  'Τόσες σωστές στη σειρά, και μετά τίποτα. Έτσι ακριβώς τελειώνουν όλα τα σερί, και πάντα μπροστά σε κοινό.':
    'genius',
  'Σταμάτησε. Ήταν ωραία όσο κράτησε.': 'okish',
  // SPEED_DEMON
  'Ταχύτητα. Στην Αγορά ο πρώτος που μιλάει σπάνια έχει δίκιο.': 'genius',
  'Τόση βιάση για μια ερώτηση που δεν επρόκειτο να φύγει πουθενά. Η γνώση περιμένει· εσείς όχι.': 'genius',
  'Γρήγορα. Ελπίζω και σωστά.': 'okish',
  // EASY_MISS
  'Θα προσποιηθώ ότι δεν το είδα. Οι υπόλοιποι όμως το είδαν.': 'genius',
  'Δεν χρειαζόταν γνώση εδώ, χρειαζόταν μόνο προσοχή. Και η προσοχή δεν κοστίζει τίποτα σε κανέναν.': 'genius',
  'Εύκολη ερώτηση. Την έκανες δύσκολη χωρίς λόγο.': 'okish',
  'Αυτό ήταν από τα εύκολα. Ήταν.': 'okish',
  'Εύκολη ερώτηση, βαριά αστοχία.': 'okish',
  // HARD_HIT
  'Λίγοι θα το ήξεραν. Σημείωσα ποιος.': 'genius',
  'Αυτό δεν το περίμενα από κανέναν σας, και το λέω χωρίς ειρωνεία. Συνεχίστε έτσι και θα το θυμάμαι.': 'genius',
  'Σωστή απάντηση σε ερώτημα που θα δυσκόλευε και εμένα. Αυτά είναι που μετράνε στο τέλος, όχι τα εύκολα.': 'genius',
  'Ώστε διαβάζεις. Επιτέλους κάποιος.': 'okish',
  // COLD_STREAK_3
  'Το πλήθος σταμάτησε να ελπίζει.': 'genius',
  'Τρεις σερί αποτυχίες. Η σταθερότητα σου είναι αξιοθαύμαστη.': 'genius',
  'Τρία λάθη στη σειρά. Υπάρχει μέθοδος εδώ.': 'okish',
  'Κάτι δεν πάει καλά. Και το βλέπουν όλοι.': 'okish',
  // NO_ANSWER
  "Σιωπή απ' όλη την Αγορά. Θα την εκτιμούσα, αν ήταν επιλογή και όχι πανικός.": 'genius',
  'Ο χρόνος πέρασε, και κάποιος τον άφησε να περάσει από πάνω του. Αυτό λέει περισσότερα από μια λάθος απάντηση.':
    'genius',
  'Σας περίμενα να μιλήσετε και δεν ήρθατε. Ο Σωκράτης έχει συνηθίσει να τον αποφεύγουν.': 'genius',
  'Απολύτως τίποτα. Και το τίποτα κρύβει είτε σοφία είτε φόβο — ξέρω ποιο από τα δύο ήταν.': 'genius',
  'Καμία απάντηση. Η σιωπή τουλάχιστον δεν λέει βλακείες.': 'okish',
  'Ο χρόνος πέρασε. Κάποιος τον άφησε να περάσει.': 'okish',
  // STUCK_IN_LAST
  'Ο δρόμος προς τη σοφία ξεκινά εκεί που στέκεστε. Κάποιος στέκεται πολύ πίσω.': 'genius',
  'Ακόμα εκεί κάτω, γύρο με τον γύρο. Αυτό λέει κάτι για την επιμονή, αν όχι για το μυαλό.': 'genius',
  'Σας βλέπω όλους από εδώ που στέκομαι. Κάποιον τον βλέπω περισσότερο, και δεν είναι για καλό.': 'genius',
  'Ακόμα στην τελευταία θέση. Υπάρχει μια σταθερότητα εδώ.': 'okish',
  'Ο πάτος έχει κι αυτός τον φύλακά του.': 'okish',
  'Κάποιος πρέπει να ορίζει το κάτω όριο. Ευχαριστούμε.': 'okish',
  // CLOSE_SCORES
  'Τόσο κοντά που η επόμενη κρίνει χαρακτήρες, όχι πόντους.': 'genius',
  'Ισορροπία. Κάποιος πρέπει να τη χαλάσει.': 'okish',
  'Στενό. Μου αρέσει όταν δεν ξέρω το τέλος.': 'okish',
  // RUNAWAY_LEAD
  'Κάποιος ξέφυγε τόσο μπροστά που δεν τον φτάνετε. Στην Αθήνα τέτοιους τους εξοστρακίζαμε, και όχι άδικα.': 'genius',
  'Ένας τρέχει μόνος του και οι υπόλοιποι τον παρακολουθείτε ευγενικά. Δεν είναι αγώνας αυτό, είναι παρέλαση.':
    'genius',
  'Στην Αθήνα τον πρώτο τον εξοστρακίζαμε. Απλή υπενθύμιση.': 'genius',
  'Κάποιος έχει ξεφύγει και κανείς σας δεν κάνει τίποτα.': 'okish',
  'Ένας εναντίον όλων. Και κερδίζει.': 'okish',
  'Σταματήστε τον. Παρακαλώ.': 'okish',
  // GENERIC_TRANSITION
  'Συνεχίζουμε. Η άγνοια δεν ξεκουράζεται.': 'genius',
  'Προχωράμε. Κάποιος πρέπει να ξεχωρίσει.': 'okish',
  'Επόμενο ερώτημα. Ελπίζω σε καλύτερα.': 'okish',
};

const RATING_WEIGHTS: Record<LineRating, number> = { genius: 3, good: 2, okish: 1 };
const DEFAULT_LINE_WEIGHT = 2; // unrated == 'good'

function lineWeight(template: string): number {
  const rating = LINE_RATINGS[template];
  return rating ? RATING_WEIGHTS[rating] : DEFAULT_LINE_WEIGHT;
}

// A picked line, in three forms: `text` is what's shown on screen
// (placeholders substituted), `template` is the raw, un-substituted pool
// entry - kept around so the REVEAL beat can hand it to the client for
// Task 42b's audio lookup (client/public/voice/<lineHash(template, tag)>.mp3)
// - and `tag` is that same template's optional voice tag (Task 43), looked
// up from LINE_TAGS purely so callers don't have to import that map too.
export interface PickedLine {
  template: string;
  text: string;
  tag: string | null;
}

// Task 62: picks a WEIGHTED-random line among the still-unused entries in
// `pool` (genius 3x as likely as okish - see LINE_RATINGS/lineWeight above).
// Exhaustion is unaffected by weighting - once every line in the pool has
// been used this game, this still returns null exactly as the old
// first-unused-in-order version did (a pool never repeats WITHIN a game).
// Across games (Task 319) an exhausted pool recycles instead - see below.
function pickLine(state: SocratesState, pool: readonly string[], vars: Record<string, string>): PickedLine | null {
  // Task 271 - deleted lines filtered out here, same "kept in the pool,
  // filtered at pick time" idiom GAME_INTRO_LINES_EXCLUDED_IN_FULL/
  // QUIZ_STAGE_INTRO_LINES_EXCLUDED_IN_FULL already use for mode exclusion
  // below - one more reason a line can be unavailable this pick, checked
  // alongside `state.usedLines` rather than requiring every caller to
  // filter its own pool first.
  const unused = pool.filter((template) => !state.usedLines.has(template) && !isLineDeleted(template));
  if (unused.length === 0) {
    return null; // this moment's whole pool is exhausted THIS game
  }
  // Task 319 - across games: prefer a line no earlier game in this room spoke.
  // When every line still unused this game WAS spoken in an earlier one, the
  // pool RECYCLES - its earlier-game marks are forgotten, so it is drawn
  // afresh (and cycles through in full again) instead of going silent.
  let candidates = unused.filter((template) => !state.earlierGamesLines.has(template));
  if (candidates.length === 0) {
    for (const template of pool) {
      state.earlierGamesLines.delete(template);
    }
    candidates = unused;
    console.log(`[lines] pool of ${pool.length} recycled - every unused line was spoken in an earlier game`);
  }
  const weights = candidates.map(lineWeight);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * totalWeight;
  let chosen = candidates[candidates.length - 1];
  for (let i = 0; i < candidates.length; i++) {
    if (roll < weights[i]) {
      chosen = candidates[i];
      break;
    }
    roll -= weights[i];
  }
  state.usedLines.add(chosen);
  return { template: chosen, text: substitute(chosen, vars), tag: LINE_TAGS[chosen] ?? null };
}

// Task 294 - the v2 slot engine's picker (speechSlots.ts decides WHICH pool;
// this is how it draws from one). Deliberately the SAME pickLine above, not a
// second implementation: a slot line must obey the identical weighting,
// never-repeat-a-line-this-game and deleted-line rules every other pool does,
// and a slot drawing from a RESERVOIR pool (LINES.RUNAWAY_LEAD and friends)
// shares `usedLines` with v1 by construction. No vars: every v2 line is
// written in the second person with no {name} slot to fill - the winner's
// name is spliced as its own clip, never baked into the text.
export function pickSpeechLine(state: SocratesState, pool: readonly string[]): PickedLine | null {
  return pickLine(state, pool, {});
}

// Tied scores share the same rank (1,1,3 - not 1,2,3), same convention used
// everywhere else in this codebase.
function computeRanks(scores: Array<{ id: string; score: number }>): Map<string, number> {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const ranks = new Map<string, number>();
  let previousScore: number | null = null;
  let previousRank = 0;
  sorted.forEach((item, index) => {
    const rank = item.score === previousScore ? previousRank : index + 1;
    ranks.set(item.id, rank);
    previousScore = item.score;
    previousRank = rank;
  });
  return ranks;
}

interface Candidate {
  moment: Moment;
  priority: Priority;
  targetId: string | null;
  vars: Record<string, string>;
}

function ensurePlayerState(state: SocratesState, playerId: string): SocratesPlayerState {
  let p = state.players.get(playerId);
  if (!p) {
    p = {
      correctStreak: 0,
      wrongStreak: 0,
      fastestAnswerCount: 0,
      previousRank: null,
      timesInLast: 0,
      noAnswerCount: 0,
      totalCorrect: 0,
      totalRounds: 0,
      // Never-targeted-yet sentinel. Must be far enough in the past that
      // `questionIndex - lastTargetedAtQuestionIndex < 3` is false even at
      // questionIndex 0/1 - otherwise a player's very first appearance
      // looks like a false cooldown and silently suppresses every
      // MEDIUM/LOW moment for the first 2 questions of the game.
      lastTargetedAtQuestionIndex: -Infinity,
    };
    state.players.set(playerId, p);
  }
  return p;
}

// Task 243 - CLOSE_SCORES' [amused] line read as flippant for a moment
// about the game being on a knife's edge. Argyrios asked it filtered
// everywhere (not scoped to one mode like the Task 231 precedent below) -
// kept in the pool, its mp3 stays valid, filtered out at pick time instead.
const CLOSE_SCORES_EXCLUDED: ReadonlySet<string> = new Set(['Στενό. Μου αρέσει όταν δεν ξέρω το τέλος.']);

// Called once per question, right after scoring - updates every connected
// player's tracked state, detects which MOMENTS fired, and returns the
// single highest-priority one whose target (if any) isn't on cooldown, as
// a ready-to-display line. Pure/synchronous - safe to call inline from
// endQuestion without risking any delay.
export function recordRoundAndPickLine(
  state: SocratesState,
  results: SocratesPlayerRoundInput[],
  context: SocratesRoundContext,
): PickedLine | null {
  if (results.length === 0) {
    return null;
  }

  for (const r of results) {
    ensurePlayerState(state, r.playerId);
  }

  const ranksAfter = computeRanks(results.map((r) => ({ id: r.playerId, score: r.scoreAfter })));
  const maxRankAfter = Math.max(...results.map((r) => ranksAfter.get(r.playerId) ?? 1));

  // Snapshots of state BEFORE this round's update - needed to detect
  // TRANSITIONS (a streak that just broke, a lead that just changed) as
  // opposed to a persistent state that was already true last round too.
  const preCorrectStreak = new Map<string, number>();
  const preRank = new Map<string, number | null>();
  for (const r of results) {
    const p = state.players.get(r.playerId)!;
    preCorrectStreak.set(r.playerId, p.correctStreak);
    preRank.set(r.playerId, p.previousRank);
  }

  for (const r of results) {
    const p = state.players.get(r.playerId)!;
    if (r.correct) {
      p.correctStreak += 1;
      p.wrongStreak = 0;
      p.totalCorrect += 1;
    } else {
      p.wrongStreak += 1;
      p.correctStreak = 0;
    }
    if (r.answerRank === 1) {
      p.fastestAnswerCount += 1;
    }
    if (!r.answered) {
      p.noAnswerCount += 1;
    }
    p.totalRounds += 1;
    const rankAfter = ranksAfter.get(r.playerId) ?? results.length;
    p.timesInLast = rankAfter === maxRankAfter ? p.timesInLast + 1 : 0;
    p.previousRank = rankAfter;
  }

  const candidates: Candidate[] = [];
  const correctCount = results.filter((r) => r.correct).length;

  // ---- MEDIUM (distribution outcomes - common, not rare; Task 62) ----
  if (correctCount === 0) {
    candidates.push({ moment: 'EVERYONE_WRONG', priority: 1, targetId: null, vars: {} });
  }
  if (correctCount === results.length) {
    candidates.push({ moment: 'EVERYONE_CORRECT', priority: 1, targetId: null, vars: {} });
  }
  if (correctCount === 1) {
    const only = results.find((r) => r.correct)!;
    candidates.push({
      moment: 'ONLY_ONE_CORRECT',
      priority: 1,
      targetId: only.playerId,
      vars: { name: safeNameForLine(only.name) },
    });
  }

  // ---- HIGH ----

  // BIG_COMEBACK / LEAD_CHANGE need a genuine "before" to compare against -
  // meaningless on the very first question, where every previousRank is null.
  if (context.questionIndex > 0) {
    let bestClimb = 0;
    let climber: SocratesPlayerRoundInput | null = null;
    for (const r of results) {
      const before = preRank.get(r.playerId);
      if (before === null || before === undefined) {
        continue;
      }
      const after = ranksAfter.get(r.playerId) ?? results.length;
      const climb = before - after;
      if (climb >= 2 && climb > bestClimb) {
        bestClimb = climb;
        climber = r;
      }
    }
    if (climber) {
      candidates.push({
        moment: 'BIG_COMEBACK',
        priority: 0,
        targetId: climber.playerId,
        vars: { name: safeNameForLine(climber.name), n: String(bestClimb) },
      });
    }

    const oldLeaderIds = new Set(results.filter((r) => preRank.get(r.playerId) === 1).map((r) => r.playerId));
    const newLeaders = results.filter((r) => ranksAfter.get(r.playerId) === 1);
    const sameLeadership =
      oldLeaderIds.size === newLeaders.length && newLeaders.every((r) => oldLeaderIds.has(r.playerId));
    if (!sameLeadership && newLeaders.length > 0 && oldLeaderIds.size > 0) {
      const newLeader = newLeaders[0];
      candidates.push({
        moment: 'LEAD_CHANGE',
        priority: 0,
        targetId: newLeader.playerId,
        vars: { name: safeNameForLine(newLeader.name) },
      });
    }
  }

  for (const r of results) {
    const p = state.players.get(r.playerId)!;
    if (p.correctStreak === 5) {
      candidates.push({
        moment: 'HOT_STREAK_5',
        priority: 0,
        targetId: r.playerId,
        vars: { name: safeNameForLine(r.name), n: '5' },
      });
    }
    if (p.totalRounds >= 5 && p.totalCorrect === p.totalRounds) {
      candidates.push({
        moment: 'PERFECT_GAME_PACE',
        priority: 0,
        targetId: r.playerId,
        vars: { name: safeNameForLine(r.name), n: String(p.totalRounds) },
      });
    }
  }

  // STREAK_BROKEN stayed HIGH in the re-tier (Task 62) - losing a streak is
  // a genuinely rare turning point, unlike the distribution moments above.
  for (const r of results) {
    const p = state.players.get(r.playerId)!;
    if (!r.correct && (preCorrectStreak.get(r.playerId) ?? 0) >= 3) {
      candidates.push({
        moment: 'STREAK_BROKEN',
        priority: 0,
        targetId: r.playerId,
        vars: { name: safeNameForLine(r.name) },
      });
    }
  }

  // ---- MEDIUM ----
  for (const r of results) {
    const p = state.players.get(r.playerId)!;
    if (p.correctStreak === 3) {
      candidates.push({
        moment: 'HOT_STREAK_3',
        priority: 1,
        targetId: r.playerId,
        vars: { name: safeNameForLine(r.name), n: '3' },
      });
    }
    if (r.answerRank === 1 && p.fastestAnswerCount >= 3) {
      candidates.push({
        moment: 'SPEED_DEMON',
        priority: 1,
        targetId: r.playerId,
        vars: { name: safeNameForLine(r.name), n: String(p.fastestAnswerCount) },
      });
    }
    if (context.difficulty === 'easy' && r.answered && !r.correct) {
      candidates.push({
        moment: 'EASY_MISS',
        priority: 1,
        targetId: r.playerId,
        vars: { name: safeNameForLine(r.name) },
      });
    }
    if (context.difficulty === 'hard' && r.correct) {
      candidates.push({
        moment: 'HARD_HIT',
        priority: 1,
        targetId: r.playerId,
        vars: { name: safeNameForLine(r.name) },
      });
    }
    if (p.wrongStreak === 3) {
      candidates.push({
        moment: 'COLD_STREAK_3',
        priority: 1,
        targetId: r.playerId,
        vars: { name: safeNameForLine(r.name), n: '3' },
      });
    }
    if (!r.answered) {
      candidates.push({
        moment: 'NO_ANSWER',
        priority: 1,
        targetId: r.playerId,
        vars: { name: safeNameForLine(r.name) },
      });
    }
    if (p.timesInLast >= 3) {
      candidates.push({
        moment: 'STUCK_IN_LAST',
        priority: 1,
        targetId: r.playerId,
        vars: { name: safeNameForLine(r.name), n: String(p.timesInLast) },
      });
    }
  }

  // ---- LOW ----
  const byScoreDesc = [...results].sort((a, b) => b.scoreAfter - a.scoreAfter);
  if (byScoreDesc.length >= 2) {
    const [top, second] = byScoreDesc;
    const margin = top.scoreAfter - second.scoreAfter;
    if (margin <= 150) {
      candidates.push({
        moment: 'CLOSE_SCORES',
        priority: 2,
        targetId: top.playerId,
        vars: { name: safeNameForLine(top.name), name2: safeNameForLine(second.name), n: String(margin) },
      });
    } else if (margin >= 1000) {
      candidates.push({
        moment: 'RUNAWAY_LEAD',
        priority: 2,
        targetId: top.playerId,
        vars: { name: safeNameForLine(top.name), score: String(top.scoreAfter) },
      });
    }
  }
  // The floor - always a candidate, never targets anyone, so it's never on
  // cooldown. "Always produce something."
  candidates.push({ moment: 'GENERIC_TRANSITION', priority: 2, targetId: null, vars: {} });

  candidates.sort((a, b) => a.priority - b.priority);

  for (const candidate of candidates) {
    // Task 62: cap any single moment at MOMENT_FIRE_CAP fires per game - on
    // the 3rd qualification, skip to the next candidate instead of letting
    // a frequent moment (e.g. ONLY_ONE_CORRECT) keep winning the round and
    // starving rarer ones of a turn.
    if ((state.momentFireCounts.get(candidate.moment) ?? 0) >= MOMENT_FIRE_CAP) {
      continue;
    }
    if (candidate.targetId) {
      const p = state.players.get(candidate.targetId)!;
      const onCooldown = context.questionIndex - p.lastTargetedAtQuestionIndex < 3;
      // HIGH priority (0) bypasses the cooldown - a dramatic moment is
      // worth mentioning even if that player was just roasted last round.
      if (onCooldown && candidate.priority !== 0) {
        continue;
      }
    }
    const pool = candidate.moment === 'CLOSE_SCORES' ? LINES.CLOSE_SCORES.filter((line) => !CLOSE_SCORES_EXCLUDED.has(line)) : LINES[candidate.moment];
    const line = pickLine(state, pool, candidate.vars);
    if (line === null) {
      continue; // this moment's line pool is exhausted - try the next candidate
    }
    if (candidate.targetId) {
      state.players.get(candidate.targetId)!.lastTargetedAtQuestionIndex = context.questionIndex;
    }
    state.momentFireCounts.set(candidate.moment, (state.momentFireCounts.get(candidate.moment) ?? 0) + 1);
    if (!isProduction) {
      console.log(
        `[socrates] fired moment=${candidate.moment} stage=${context.stage} question=${context.questionIndex + 1} lineHash=${lineHash(line.template, line.tag)}`,
      );
    }
    return line;
  }

  // Every candidate (including GENERIC_TRANSITION) was exhausted - only
  // reachable in a game far longer than this line library was sized for.
  return null;
}

// Called once per question, right before question:show - a much lighter
// touch than the REVEAL line, never targets a player, and must never delay
// the question/answer buttons appearing (also pure/synchronous).
export function pickQuestionIntro(state: SocratesState, context: SocratesQuestionIntroContext): string | null {
  const questionNumber = context.questionIndex + 1;
  const isFinal = questionNumber === context.totalQuestions;
  const isHalfway = !isFinal && context.totalQuestions >= 4 && questionNumber === Math.ceil(context.totalQuestions / 2);

  if (isFinal) {
    const line = pickLine(state, INTRO_LINES.FINAL_QUESTION, {});
    if (line) {
      return line.text;
    }
  }
  if (isHalfway) {
    const line = pickLine(state, INTRO_LINES.HALFWAY_POINT, {});
    if (line) {
      return line.text;
    }
  }
  const categoryLine = pickLine(state, INTRO_LINES.CATEGORY_CALLOUT, { category: safeCategoryForLine(context.category) });
  if (categoryLine) {
    return categoryLine.text;
  }
  return pickLine(state, INTRO_LINES.GENERIC_INTRO, {})?.text ?? null;
}

// Task 48 - the three one-shot beats. Each returns a full PickedLine (not
// just `text`, unlike pickQuestionIntro above) because these DO play through
// the held SOCRATES phase and need `template`/`tag` for the client's audio
// lookup, exactly like recordRoundAndPickLine's REVEAL-moment line. All pure/
// synchronous, same as every other picker in this file - never allowed to
// delay a phase transition itself; whether to actually enter the phase is
// the caller's decision (phases.ts), based on whether a line came back.
// Task 231 - one GAME_INTRO_LINES entry names a round count ("Τρεις γύροι",
// three rounds) that only ever matched standalone quiz's own stage count;
// it contradicts full's seven-stage lineup. Checked the whole pool for the
// same problem - this is the only line in it that states a round count.
// Kept in the pool (its mp3 stays valid) and filtered out by mode instead.
const GAME_INTRO_LINES_EXCLUDED_IN_FULL: ReadonlySet<string> = new Set([
  'Τρεις γύροι σας χωρίζουν από την απάντηση που ήρθατε να ακούσετε. Ελάχιστοι φτάνουν ως εκεί όρθιοι.',
]);

// Task 236 - a SEQUENCE picker: every line of the pool, in order, rather
// than one weighted-random entry. Deliberately NOT pickLine (which picks one
// and would break the narration's order); each line is still marked used so
// nothing else can draw it later. Returns [] for an exhausted/empty pool, so
// the caller falls through exactly like a null PickedLine.
function pickSequence(state: SocratesState, pool: readonly string[]): PickedLine[] {
  // Task 271 - a deleted line is simply SKIPPED, never played and never
  // marked used - the narration just runs one line shorter rather than
  // reading a missing clip's silence into the sequence.
  return pool
    .filter((template) => !isLineDeleted(template))
    .map((template) => {
      state.usedLines.add(template);
      // No {name}/{n}/{category} placeholders in either sequence, same as
      // every other one-shot pool here - so text IS the template.
      return { template, text: template, tag: LINE_TAGS[template] ?? null };
    });
}

export function pickGameIntroSequence(state: SocratesState): PickedLine[] {
  return pickSequence(state, GAME_INTRO_SEQUENCE);
}

export function pickAnavasisIntroSequence(state: SocratesState): PickedLine[] {
  return pickSequence(state, ANAVASIS_INTRO_SEQUENCE);
}

export function pickGameIntroLine(state: SocratesState, mode: GameModeId): PickedLine | null {
  const pool = mode === 'full' ? GAME_INTRO_LINES.filter((line) => !GAME_INTRO_LINES_EXCLUDED_IN_FULL.has(line)) : GAME_INTRO_LINES;
  return pickLine(state, pool, {});
}

// Task 231 - three of quiz's STAGE_INTRO_LINES are standalone quiz's own
// "Οι Σοφιστές" second-stage framing ("δεύτερος γύρος", a stage that
// doesn't exist in full - the quiz pool fires once there, at stage 1).
// Correct in standalone quiz, wrong in full. Kept in the pool (not deleted -
// their mp3s stay valid, CLAUDE.md's Voice section) and filtered out by
// mode at pick time instead.
const QUIZ_STAGE_INTRO_LINES_EXCLUDED_IN_FULL: ReadonlySet<string> = new Set([
  'Οι Σοφιστές. Από εδώ και πέρα δεν αρκεί να ξέρετε.',
  'Δεύτερος γύρος. Τώρα μπορείτε να βλάψετε ο ένας τον άλλον.',
  'Οι Σοφιστές δίδασκαν πώς να κερδίζεις, όχι πώς να έχεις δίκιο. Θα σας φανεί χρήσιμο.',
]);

export function pickStageIntroLine(state: SocratesState, identity: StageIntroIdentity, mode: GameModeId): PickedLine | null {
  let pool = STAGE_INTRO_LINES[identity] ?? [];
  if (mode === 'full' && identity === 'quiz') {
    pool = pool.filter((line) => !QUIZ_STAGE_INTRO_LINES_EXCLUDED_IN_FULL.has(line));
  }
  return pickLine(state, pool, {});
}

// Task 278 - pickWinnerLine is GONE with the coronation rebuild. It had
// exactly one call site (phases.ts's pickWinnerBeatSequence), as the degrade
// for a winner whose gender was unknown, and the rebuilt coronation has no
// such case left to degrade from: both sets address anyone. WINNER_LINES
// itself stays exactly where it is, still registered for generation below -
// its eight clips are real files in the bank, and deleting the pool would
// orphan them for nothing.

// ============================= draw / numeric (Task 138) =============================
// Detection only - no lines exist yet (DRAW_LINES/NUMERIC_LINES above are all
// empty), so every pickLine call here returns null and none of this ever
// becomes a real phase. What DOES happen unconditionally is the detection
// log below: phases.ts/modes/draw.ts/modes/numeric.ts skip the SOCRATES beat
// on a null return exactly the way startSocratesIfLineFired already does for
// the quiz, so "detected, but skipped" is observable in the logs without
// waiting on task 139's lines.

function logDrawNumericDetection(kind: string, moment: string, detail: string): void {
  if (!isProduction) {
    console.log(`[socrates] ${kind} moment detected=${moment} ${detail}`);
  }
}

// One-shot, before the DRAW phase begins (a fresh deal, or the second round
// of a 2-round game) - same "no cooldown, no cap" treatment as GAME_INTRO/
// WINNER above, since it can only ever fire once per phase entry.
export function pickDrawIntroLine(state: SocratesState): PickedLine | null {
  return pickLine(state, DRAW_LINES.DRAW_INTRO, {});
}

// One-shot, after the LAST GUESS_REVEAL of a draw stage - the best drawer
// (by total drawer points awarded across every round of the stage) gets
// named before the stage actually ends.
export function pickDrawWinnerLine(state: SocratesState, winnerName: string, points: number): PickedLine | null {
  return pickLine(state, DRAW_LINES.DRAW_WINNER, { name: safeNameForLine(winnerName), n: String(points) });
}

export interface DrawGuessRoundContext {
  correctGuessers: number;
  eligibleGuessers: number; // connected non-drawer players this round
  distractorsHit: number; // how many of the 3 WRONG options got at least one guess
  drawerName: string;
}

// Called once per GUESS_REVEAL, right when it begins (mirrors
// recordRoundAndPickLine's placement in endQuestion) - mutually exclusive by
// construction (each condition below requires the one above to be false), so
// at most one candidate is ever detected per round.
export function recordDrawGuessRoundAndPickLine(state: SocratesState, context: DrawGuessRoundContext): PickedLine | null {
  const { correctGuessers, eligibleGuessers, distractorsHit, drawerName } = context;
  if (eligibleGuessers === 0) {
    return null; // nobody was eligible to guess - nothing to say
  }

  let moment: DrawMoment | null = null;
  if (correctGuessers === 0) {
    moment = 'NOBODY_GUESSED';
  } else if (correctGuessers === eligibleGuessers) {
    moment = 'EVERYBODY_GUESSED';
  } else if (correctGuessers <= eligibleGuessers / 2 && distractorsHit >= 2) {
    moment = 'SPLIT_GUESS';
  }
  if (!moment) {
    return null;
  }

  logDrawNumericDetection('draw', moment, `correct=${correctGuessers}/${eligibleGuessers} distractorsHit=${distractorsHit}`);
  if ((state.momentFireCounts.get(moment) ?? 0) >= MOMENT_FIRE_CAP) {
    return null;
  }
  const line = pickLine(state, DRAW_LINES[moment], { name: safeNameForLine(drawerName) });
  if (!line) {
    return null; // pool empty (no lines written yet) - detection was still logged above
  }
  state.momentFireCounts.set(moment, (state.momentFireCounts.get(moment) ?? 0) + 1);
  if (!isProduction) {
    console.log(`[socrates] fired moment=${moment} lineHash=${lineHash(line.template, line.tag)}`);
  }
  return line;
}

// Task 226 - see its use in recordNumericRoundAndPickLine below. 3 is the
// smallest miss that reads as more than a one-off rounding slip (off-by-1/2
// happens even when someone is clearly aiming at the right number).
const NOBODY_CLOSE_MIN_ABSOLUTE_DISTANCE = 3;

export interface NumericRoundContext {
  answer: number;
  values: number[]; // every CONNECTED player's submitted (clamped) value, non-submitters excluded
}

// Called once per NUMERIC_REVEAL, right when it begins. Candidates are NOT
// mutually exclusive (a room could be simultaneously exact-hit-having and
// wildly-off, e.g. one player nails it while another guesses 3x over) - the
// priority order below picks the single most interesting one to report,
// same "sorted candidates, first qualifying one wins" shape as the quiz's
// recordRoundAndPickLine, just without a per-player cooldown to check.
export function recordNumericRoundAndPickLine(state: SocratesState, context: NumericRoundContext): PickedLine | null {
  const { answer, values } = context;
  if (values.length === 0) {
    return null; // nobody submitted anything this question
  }

  const candidates: NumericMoment[] = [];
  if (values.some((value) => value === answer)) {
    candidates.push('EXACT_HIT');
  }
  if (answer > 0 && values.some((value) => value >= answer * 3 || value <= answer / 3)) {
    candidates.push('WILDLY_OFF');
  }
  if (values.length >= 2) {
    const spread = Math.max(...values) - Math.min(...values);
    if (spread <= Math.max(answer * 0.1, 1)) {
      candidates.push('ALL_CLUSTERED');
    }
  }
  if (answer > 0) {
    const bestDistance = Math.min(...values.map((value) => Math.abs(value - answer)));
    // Task 226 - the ratio alone used to be the whole gate, which broke down
    // for the pool's many small answers (Πόσοι πλανήτες = 8, Πόσα λίτρα αίμα
    // = 5, Κάθε πόσα χρόνια οι Ολυμπιακοί = 4...): missing a 4 by 2 is a 50%
    // ratio, same as missing a 100 by 50, but a miss of 2 reads as a near
    // guess, not "nobody was close". NOBODY_CLOSE_MIN_ABSOLUTE_DISTANCE is a
    // floor under the ratio - an absolute miss below it never counts as far,
    // whatever the answer's own size. First guess, to be tuned at playtest.
    if (bestDistance / answer >= 0.5 && bestDistance >= NOBODY_CLOSE_MIN_ABSOLUTE_DISTANCE) {
      candidates.push('NOBODY_CLOSE');
    }
  }

  for (const moment of candidates) {
    logDrawNumericDetection('numeric', moment, `answer=${answer} values=${JSON.stringify(values)}`);
    if ((state.momentFireCounts.get(moment) ?? 0) >= MOMENT_FIRE_CAP) {
      continue;
    }
    const line = pickLine(state, NUMERIC_LINES[moment], {});
    if (!line) {
      continue; // pool empty (no lines written yet) - detection was still logged above
    }
    state.momentFireCounts.set(moment, (state.momentFireCounts.get(moment) ?? 0) + 1);
    if (!isProduction) {
      console.log(`[socrates] fired moment=${moment} lineHash=${lineHash(line.template, line.tag)}`);
    }
    return line;
  }
  return null;
}

// Task 188b - called once per duel lock (the second pick landing). Detection
// logs unconditionally; the pool is empty today, so this returns null and the
// beat stays silent - exactly the draw/numeric shape above.
export function recordDuelLockedAndPickLine(state: SocratesState, duelistNames: [string, string]): PickedLine | null {
  const moment: DuelMoment = 'DUEL_LOCKED';
  logDrawNumericDetection('duel', moment, `duelists=${JSON.stringify(duelistNames)}`);
  if ((state.momentFireCounts.get(moment) ?? 0) >= MOMENT_FIRE_CAP) {
    return null;
  }
  const line = pickLine(state, DUEL_LINES[moment], {});
  if (!line) {
    return null; // pool empty by design - detection was still logged above
  }
  state.momentFireCounts.set(moment, (state.momentFireCounts.get(moment) ?? 0) + 1);
  if (!isProduction) {
    console.log(`[socrates] fired moment=${moment} lineHash=${lineHash(line.template, line.tag)}`);
  }
  return line;
}

// Task 296 - Η Λόγχη's own beat: the spear has just taken someone out of the
// climb. Fires under BOTH speech policies, so it draws with pickSpeechLine (the
// plain pool picker) rather than through the v2 slot engine - that one is gated
// on room.settings.speechPolicy and targets a player off the stage ledger's
// extremes, neither of which fits here: the target is not the stage's standout,
// it is the person the mechanic just struck.
//
// The NAME enters the DISPLAY text here and nowhere else, exactly as the
// coronation's does (buildCoronationSequence): as the vocative, and
// unconditionally, so the subtitle addresses them whether or not a clip exists.
// `template` is left untouched - it is what hashes to the mp3 - and whether the
// name is also SPOKEN (a spliced prefix clip) is the CALLER's decision, since
// disk access lives in socratesAudio.ts and this stays a pure line-bank
// function like every other pick*/record* here.
//
// No MOMENT_FIRE_CAP bookkeeping: one line per game is guaranteed upstream by
// the caller's own latch (ClimbState.spearBeatPlayed), which means this is
// never even asked a second time.
export function recordSpearOutAndPickLine(state: SocratesState, name: string): PickedLine | null {
  logDrawNumericDetection('climb', 'SPEAR_OUT', `speared=${name}`);
  const picked = pickSpeechLine(state, SPEECH_V2_LINES.SPEAR_OUT);
  if (!picked) {
    return null; // every line used or deleted - silence, never a repeat
  }
  if (!isProduction) {
    console.log(`[socrates] fired moment=SPEAR_OUT lineHash=${lineHash(picked.template, picked.tag)}`);
  }
  return { ...picked, text: `${getVocative(name)}. ${picked.text}` };
}

// Task 300 - the interruption line, drawn once per skipped sequence. Plain
// pickSpeechLine (never the v2 slot engine) for the same reason
// recordSpearOutAndPickLine is: this fires under BOTH policies, and its subject
// is the room's own decision rather than a stage's standout. Null when every
// line has been used or deleted - the caller then routes onward in silence
// rather than repeating one, the same "no line, no phase" discipline as
// everywhere else here.
export function pickSkipInterruptedLine(state: SocratesState): PickedLine | null {
  const picked = pickSpeechLine(state, SKIP_INTERRUPTED_LINES);
  if (picked && !isProduction) {
    console.log(`[socrates] fired moment=SKIP_INTERRUPTED lineHash=${lineHash(picked.template, picked.tag)}`);
  }
  return picked;
}

// Task 61, dev-only: called once at GAME_OVER. Prints every Moment from
// LINES (so rarer moments that never fired still show up as 0) alongside
// how many times it actually got picked this game - the whole point being
// to see which pools repeat and which never play in a real game.
export function logMomentFireSummary(state: SocratesState, roomCode: string): void {
  if (isProduction) {
    return;
  }
  const allMoments = Object.keys(LINES) as Moment[];
  const counts = allMoments.map((moment) => `${moment}=${state.momentFireCounts.get(moment) ?? 0}`);
  const neverFired = allMoments.filter((moment) => !state.momentFireCounts.has(moment));
  console.log(`[socrates] room ${roomCode} moment summary: ${counts.join(', ')}`);
  console.log(
    `[socrates] room ${roomCode} never fired (${neverFired.length}/${allMoments.length}): ${neverFired.length > 0 ? neverFired.join(', ') : 'none'}`,
  );
}

// Task 142: one line entry across EVERY pool - moment, raw template, its
// optional voice tag, and the hash its mp3 is named after. Used by both
// dev/generate-voice-index.ts (the static voice-index.html) and the
// DEV_GET_VOICE_LINES socket handler (/dev/voice) so the two listings can
// never drift from each other or from the actual pools.
export interface VoiceLineEntry {
  moment: string;
  line: string;
  tag: string | null;
  hash: string;
}

export function collectVoiceLineEntries(): VoiceLineEntry[] {
  const entries: VoiceLineEntry[] = [];
  // One line (the GENERIC_INTRO/GAME_INTRO overlap) is reused verbatim
  // across two pools - list it once, under whichever moment adds it first,
  // so this stays one row per LINE_TAGS key (235), not per pool occurrence.
  const seenLines = new Set<string>();
  const add = (moment: string, pool: readonly string[]) => {
    for (const line of pool) {
      if (seenLines.has(line)) {
        continue;
      }
      seenLines.add(line);
      const tag = LINE_TAGS[line] ?? null;
      entries.push({ moment, line, tag, hash: lineHash(line, tag) });
    }
  };
  for (const [moment, pool] of Object.entries(LINES)) {
    add(moment, pool);
  }
  for (const [moment, pool] of Object.entries(INTRO_LINES)) {
    add(moment, pool);
  }
  add('GAME_INTRO', GAME_INTRO_LINES);
  // Task 236 - the two sequences, so `voice:generate`/`voice:index` see them
  // as active lines rather than orphaned mp3s.
  add('GAME_INTRO (full sequence)', GAME_INTRO_SEQUENCE);
  add('ANAVASIS_INTRO', ANAVASIS_INTRO_SEQUENCE);
  // Task 218 - keyed by StageIntroIdentity now, not a table position; the
  // dedup below is defensive (nothing currently shares one pool across two
  // identities) rather than load-bearing the way it was pre-218, when
  // 'steal' (then keys 3 and 4) genuinely was one array under two keys.
  const seenStagePools = new Set<readonly string[]>();
  for (const [identity, pool] of Object.entries(STAGE_INTRO_LINES)) {
    if (!pool || seenStagePools.has(pool)) {
      continue;
    }
    seenStagePools.add(pool);
    add(`STAGE_INTRO (stage ${identity})`, pool);
  }
  add('WINNER', WINNER_LINES);
  // Task 278 - the two coronation SETS, six lines, registered so
  // `npm run voice:generate` will produce their clips when the time comes.
  // Until then all six are simply missing from disk: the host's LOBBY
  // prefetch (Task 154) 404s on them and drops the bytes, which is harmless,
  // and each beat ends on the immediate onEnded() ack rather than a backstop.
  add('CORONATION', CORONATION_SET_B);
  add('CORONATION', CORONATION_SET_C);
  // Task 263 - the vocative address clips, one per PRESET_NAMES entry. These
  // are what the coronation's named opener splices ahead of itself, and until
  // this task they were not registered anywhere, so `voice:generate` had no
  // way to produce them at all. Registering them does NOT generate them - it
  // only makes them generatable (and listed in /dev/voice). Every one of them
  // is missing from disk today, which is exactly why the NAMELESS opener is
  // the branch that actually runs.
  for (const name of PRESET_NAMES) {
    const vocative = coronationVocative(name);
    if (vocative) {
      add('VOCATIVE', [vocative.template]);
    }
  }
  for (const [moment, pool] of Object.entries(DRAW_LINES)) {
    add(moment, pool);
  }
  for (const [moment, pool] of Object.entries(NUMERIC_LINES)) {
    add(moment, pool);
  }
  for (const [moment, pool] of Object.entries(DUEL_LINES)) {
    add(moment, pool);
  }
  // Task 294 - the v2 slot pools (twelve then, THIRTEEN since Task 296's
  // QUIZ_BEST), registered so `npm run voice:generate` produces their clips in
  // the October pass and /dev/voice lists them. Registering does NOT generate:
  // all 39 are missing from disk today, which is why a v2 beat currently ends
  // on the client's immediate 404 ack.
  //
  // DUEL_LOCKED adds no row here: its three lines are the SAME array as
  // DUEL_LINES.DUEL_LOCKED, already added by the loop just above, and `add`
  // dedups on line text. So Task 296's net effect on this listing is QUIZ_BEST's
  // three lines, not nine - the other six were already registered by 294.
  for (const [pool, lines] of Object.entries(SPEECH_V2_LINES)) {
    add(`SLOT (${pool})`, lines);
  }
  // Task 300 - the skip-vote interruption pool, registered here for the same
  // reason every pool above is: `voice:generate` produces a clip only for a
  // line this function returns, and /dev/voice can only list what it sees.
  // Four NEW rows (nothing else shares these lines), so this listing goes
  // 517 -> 521.
  add('SKIP_INTERRUPTED', SKIP_INTERRUPTED_LINES);
  return entries;
}
