import type { Difficulty } from '@game/shared';

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
  // HIGH - rare, dramatic. Bypasses the per-player cooldown.
  | 'EVERYONE_WRONG'
  | 'ONLY_ONE_CORRECT'
  | 'EVERYONE_CORRECT'
  | 'BIG_COMEBACK'
  | 'LEAD_CHANGE'
  | 'HOT_STREAK_5'
  | 'PERFECT_GAME_PACE'
  // MEDIUM
  | 'HOT_STREAK_3'
  | 'STREAK_BROKEN'
  | 'SPEED_DEMON'
  | 'EASY_MISS'
  | 'HARD_HIT'
  | 'COLD_STREAK_3'
  | 'NO_ANSWER'
  | 'STUCK_IN_LAST'
  // LOW - fallback tier, so there is usually something to say.
  | 'FASTEST_THIS_ROUND'
  | 'CLOSE_SCORES'
  | 'RUNAWAY_LEAD'
  | 'GENERIC_TRANSITION';

export type IntroMoment = 'FINAL_QUESTION' | 'HALFWAY_POINT' | 'CATEGORY_CALLOUT' | 'GENERIC_INTRO';

// 0 = HIGH (bypasses cooldown), 1 = MEDIUM, 2 = LOW.
type Priority = 0 | 1 | 2;

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
}

export function createSocratesState(): SocratesState {
  return { players: new Map(), usedLines: new Set() };
}

export function resetSocratesState(state: SocratesState): void {
  state.players.clear();
  state.usedLines.clear();
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
    'Κανείς. Ούτε ένας. Επιτέλους μια στιγμή ειλικρινούς άγνοιας.',
    'Όλοι λάθος. Αυτό δεν είναι ερώτηση πια, είναι διάγνωση.',
    'Ώστε συμφωνείτε όλοι. Κρίμα που συμφωνείτε στο λάθος.',
    'Κοιτάξτε γύρω σας. Αυτοί είναι οι συνυποψήφιοί σας. Παρηγορηθείτε.',
    'Τέτοια ομοφωνία την είχαμε μόνο όταν καταδικάζαμε κάποιον.',
    'Μηδέν. Θα το θυμάμαι όταν διαλέγω μαθητή.',
  ],
  ONLY_ONE_CORRECT: [
    'Ένας. Μόνο ένας ανάμεσά σας. Κοιτάξτε καλά.',
    'Όλοι λάθος εκτός από έναν. Αυτό λέγεται διαφορά.',
    'Ένας μόνο. Οι υπόλοιποι μόλις έχασαν λίγη αξιοπρέπεια.',
    'Ένας σωστός. Σημειώνω.',
    'Μόνο ένας. Το πλήθος το πρόσεξε αυτό.',
    'Ένας ανάμεσα σε τόσους. Έτσι ξεχωρίζει κάποιος.',
    // Task 45 - name-free additions.
    'Ένας μόνο. Ένας ανάμεσα σε τόσους.',
    'Κοιτάξτε ποιος σήκωσε το βάρος. Οι υπόλοιποι κοιτάγατε.',
    'Μία σωστή απάντηση σε όλη την Αγορά. Μία.',
  ],
  EVERYONE_CORRECT: [
    'Όλοι σωστά. Άρα η ερώτηση ήταν εύκολη. Μη μπερδεύεστε.',
    'Ομοφωνία. Ύποπτο πράγμα σε αίθουσα με τόσους φιλόδοξους.',
    'Μπράβο σε όλους. Τώρα κανείς δεν ξεχώρισε.',
    'Κανένα λάθος. Θα κάνω την επόμενη δυσκολότερη.',
    'Το ήξεραν όλοι. Δεν μαθαίνω τίποτα για εσάς έτσι.',
    'Ομόφωνα σωστό. Βαρετό, αλλά σωστό.',
  ],
  BIG_COMEBACK: [
    'Και ξαφνικά, ζωή. Πού ήταν αυτό μέχρι τώρα;',
    'Ώστε μπορούσες. Και το κράτησες κρυφό.',
    'Κάποιος ανέβηκε από το πουθενά. Κοιτάτε, έτσι γίνεται.',
    'Επιστροφή. Δεν την είχα υπολογίσει.',
    'Από πίσω μπροστά. Αυτό αξίζει περισσότερο από σταθερότητα.',
    'Με έκανε κάποιος να αλλάξω γνώμη. Δύσκολο πράγμα.',
    // Task 45 - name-free additions.
    'Γύρισε το παιχνίδι. Πού ήταν τόση ώρα αυτό;',
    'Επιστροφή από το πουθενά. Έτσι γίνεται.',
    'Κάποιος θυμήθηκε γιατί ήρθε.',
  ],
  LEAD_CHANGE: [
    'Άλλαξε η κορυφή. Ο θρόνος στην Αθήνα ποτέ δεν κράτησε πολύ.',
    'Νέο πρώτο όνομα. Οι υπόλοιποι θυμηθείτε πώς είναι να κυνηγάτε.',
    'Ώστε αλλάζουν τα πράγματα. Η βεβαιότητα με κουράζει.',
    'Κάποιος πέρασε μπροστά. Για πόσο;',
    'Η κορυφή άλλαξε χέρια. Θα ξανααλλάξει.',
    'Η κορυφή άλλαξε χέρια. Και μαζί της οι στόχοι.',
  ],
  HOT_STREAK_5: [
    'Πέντε συνεχόμενες. Αυτό δεν το έχω ξαναδεί σήμερα.',
    'Πέντε στη σειρά. Αρχίζω να πιστεύω ότι υποτίμησα κάποιον.',
    'Πέντε. Οι υπόλοιποι, τι ακριβώς κάνετε;',
    'Κάποιος τις παίρνει όλες. Η Αθήνα βρήκε το θέμα της.',
    'Πέντε συνεχόμενες. Αν πέσεις τώρα, θα πονέσει.',
    'Σταματήστε να με εντυπωσιάζετε. Δεν το αντέχω.',
    // Task 45 - name-free additions. The last line here is shared with
    // HOT_STREAK_3 above (identical text can fire under either moment,
    // whichever hits first - see the whole-game usedLines invariant above).
    'Πέντε συνεχόμενες. Οι υπόλοιποι, τι ακριβώς κάνετε;',
    'Κανείς δεν σταματάει αυτό το σερί. Περίεργο πλήθος σήμερα.',
  ],
  PERFECT_GAME_PACE: [
    'Ρυθμός χωρίς λάθος. Μήπως κάνω τις ερωτήσεις πολύ εύκολες;',
    'Κανένα λάθος ως τώρα. Αυτό δεν είναι σοφία, είναι υπόσχεση.',
    'Τέλεια πορεία ως εδώ. Το ένα λάθος θα το θυμάστε για πάντα.',
    'Χωρίς λάθος μέχρι στιγμής. Με ανησυχεί.',
    'Άψογα ως εδώ. Και το ως εδώ μετράει.',
    'Καθαρή πορεία. Οι καθαρές πορείες λερώνονται.',
  ],
  HOT_STREAK_3: [
    'Τρεις διαδοχικές. Κάτι συμβαίνει εδώ.',
    'Τρία συνεχόμενα. Αυτό δεν είναι τύχη πια.',
    'Τρεις σωστές. Κάποιος εδώ ξέρει τι κάνει.',
    'Κάποιος δεν σταματάει. Κάντε κάτι.',
    'Τρία στη σειρά. Από εδώ και πέρα κάθε λάθος θα το θυμούνται.',
    'Τρεις. Το πλήθος μέτρησε κι αυτό.',
    // Task 45 - name-free additions.
    'Τρεις στη σειρά. Άρχισα να προσέχω.',
    'Κανείς δεν σταματάει αυτό το σερί. Περίεργο πλήθος σήμερα.',
  ],
  STREAK_BROKEN: [
    'Τελείωσε το σερί. Όλα τελειώνουν, απλώς αυτό τελείωσε δημόσια.',
    'Και να που έπεσες. Η πτώση από ψηλά ακούγεται περισσότερο.',
    'Σταμάτησε. Ήταν ωραία όσο κράτησε.',
    'Και μετά τίποτα. Έτσι τελειώνουν τα σερί.',
    'Το σερί έσπασε. Το πλήθος το πρόσεξε πριν από εσένα.',
    'Τέλος. Τώρα ξαναρχίζεις από την αρχή.',
  ],
  SPEED_DEMON: [
    'Απάντησες πριν τελειώσω. Είτε το ήξερες, είτε δεν με άκουγες.',
    'Ταχύτητα. Στην Αγορά ο πρώτος που μιλάει σπάνια έχει δίκιο.',
    'Γρήγορα. Ελπίζω και σωστά.',
    'Τόση βιάση. Η γνώση δεν φεύγει.',
    'Πρόλαβες τους πάντες. Πρόλαβες να σκεφτείς;',
    'Αστραπή. Ας δούμε αν κρατάει.',
  ],
  EASY_MISS: [
    'Και όμως, χάθηκε. Ερώτηση για παιδιά.',
    'Εύκολη ερώτηση. Την έκανες δύσκολη χωρίς λόγο.',
    'Θα προσποιηθώ ότι δεν το είδα. Οι υπόλοιποι όμως το είδαν.',
    'Αυτό ήταν από τα εύκολα. Ήταν.',
    'Εύκολο ερώτημα, βαριά απάντηση.',
    'Δεν χρειαζόταν γνώση εδώ. Χρειαζόταν προσοχή.',
    // Task 45 - name-free additions. (a third supplied line, "Δεν χρειαζόταν
    // γνώση εδώ. Χρειαζόταν προσοχή.", was dropped: identical to the
    // existing line directly above - adding it again would be a dead
    // duplicate, permanently unselectable once the original is used.)
    'Αυτό το ήξερε το πλήθος. Το πλήθος.',
    'Εύκολη ερώτηση, βαριά αστοχία.',
  ],
  HARD_HIT: [
    'Δύσκολη, και κάποιος την πέτυχε. Τύχη ή γνώση;',
    'Λίγοι θα το ήξεραν. Σημείωσα ποιος.',
    'Ώστε διαβάζεις. Επιτέλους κάποιος.',
    'Αυτό ήταν δύσκολο. Το πλήθος δεν το κατάλαβε καν.',
    'Αυτό δεν το περίμενα. Συνεχίστε.',
    'Σωστό σε δύσκολο ερώτημα. Αυτά μετράνε.',
  ],
  COLD_STREAK_3: [
    'Τρία λάθη στη σειρά. Υπάρχει μέθοδος εδώ.',
    'Τρεις συνεχόμενες αστοχίες. Δοκιμάστε να σκεφτείτε πρώτα.',
    'Τρία στη σειρά. Λάθος, εννοώ.',
    'Το πλήθος σταμάτησε να ελπίζει.',
    'Τρεις σερί αποτυχίες. Η σταθερότητα σου είναι αξιοθαύμαστη.',
    'Κάτι δεν πάει καλά. Και το βλέπουν όλοι.',
  ],
  NO_ANSWER: [
    'Σιωπή. Θα την εκτιμούσα, αν ήταν επιλογή.',
    'Καμία απάντηση. Τουλάχιστον δεν ειπώθηκε βλακεία.',
    'Ο χρόνος πέρασε και κάποιος μαζί του.',
    'Καμία απάντηση. Η άγνοια τουλάχιστον ήταν σιωπηλή.',
    'Σας περίμενα. Δεν ήρθατε.',
    'Τίποτα. Κάποιες φορές αυτό λέει περισσότερα.',
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
    'Ακόμα εκεί. Αυτό λέει κάτι για την επιμονή σου.',
    'Σας βλέπω όλους. Κάποιον περισσότερο.',
    // Task 45 - name-free additions.
    'Ακόμα τελευταίος. Υπάρχει μια σταθερότητα εδώ που άλλοι θα ζήλευαν.',
    'Ο πάτος έχει κι αυτός τον φύλακά του.',
    'Κάποιος πρέπει να ορίζει το κάτω όριο. Ευχαριστούμε.',
  ],
  FASTEST_THIS_ROUND: [
    'Γρηγορότερα απ\' όλους. Το πλήθος εντυπωσιάστηκε. Εγώ όχι ακόμα.',
    'Πρώτο χέρι. Αυτό δίνει το βήμα, όχι το δίκιο.',
    'Τους πρόλαβε όλους. Ας το κρατήσει.',
    'Κανείς πιο γρήγορα αυτόν τον γύρο.',
    'Πρώτο όνομα στη λίστα μου σήμερα.',
    'Ταχύτερη απάντηση. Σημειώθηκε.',
  ],
  CLOSE_SCORES: [
    'Κολλητά. Κανείς σας δεν έχει κερδίσει τίποτα ακόμα.',
    'Τόσο κοντά που η επόμενη κρίνει χαρακτήρες, όχι πόντους.',
    'Ισορροπία. Κάποιος πρέπει να τη χαλάσει.',
    'Λίγοι πόντοι σας χωρίζουν. Λίγοι πόντοι, μεγάλη διαφορά.',
    'Κανένας δεν ξεχωρίζει. Ακόμα.',
    'Στενό. Μου αρέσει όταν δεν ξέρω το τέλος.',
  ],
  RUNAWAY_LEAD: [
    'Κάποιος ξέφυγε. Στην Αθήνα τον πρώτο τον εξοστρακίζαμε.',
    'Κάποιος έχει ξεφύγει και κανείς σας δεν κάνει τίποτα.',
    'Τόσο μπροστά που άρχισε να βαριέται.',
    'Η διαφορά μεγαλώνει. Αυτό δεν είναι αγώνας πια.',
    'Ένας εναντίον όλων. Και κερδίζει.',
    'Σταματήστε τον. Παρακαλώ.',
    // Task 45 - name-free additions.
    'Κάποιος ξέφυγε. Και κανείς σας δεν κάνει τίποτα.',
    'Η διαφορά μεγάλωσε. Αυτό δεν είναι αγώνας πια.',
    'Στην Αθήνα τον πρώτο τον εξοστρακίζαμε. Απλή υπενθύμιση.',
  ],
  GENERIC_TRANSITION: [
    'Συνεχίζουμε. Η άγνοια δεν ξεκουράζεται.',
    'Επόμενη. Σας παρακολουθώ πιο στενά τώρα.',
    'Πάμε. Το πλήθος βαριέται πιο γρήγορα από μένα.',
    'Άλλη μία. Μη χαλαρώνετε.',
    'Προχωράμε. Κάποιος πρέπει να ξεχωρίσει.',
    'Επόμενο ερώτημα. Ελπίζω σε καλύτερα.',
  ],
};

// Exported for the same reason as LINES above.
export const INTRO_LINES: Record<IntroMoment, readonly string[]> = {
  FINAL_QUESTION: [
    'Τελευταία ερώτηση. Ό,τι μάθατε ως τώρα κρίνεται εδώ.',
    'Η τελευταία. Μετά διαλέγω μαθητή και δεν αλλάζω γνώμη.',
    'Ένα ερώτημα ακόμα. Και σας κρίνουν.',
    'Τέλος. Μία ερώτηση σας χωρίζει από την απάντηση.',
    'Η τελευταία ευκαιρία να με πείσετε.',
    'Μετά από αυτήν, σιωπή. Και μια απόφαση.',
  ],
  HALFWAY_POINT: [
    'Μισός δρόμος. Οι μισοί το κατάλαβαν ήδη ότι δεν θα τα καταφέρουν.',
    'Φτάσαμε στη μέση. Ό,τι χτίσατε μπορεί να καταρρεύσει.',
    'Μέση. Καλή στιγμή να αναρωτηθείτε γιατί ήρθατε.',
    'Οι μισές ερωτήσεις πέρασαν. Οι δύσκολες μένουν.',
    'Μέχρι εδώ καλά. Από εδώ και πέρα, δεν ξέρω.',
    'Μισό. Κανείς δεν έχει κερδίσει ακόμα.',
  ],
  CATEGORY_CALLOUT: [
    'Εδώ χωρίζονται όσοι ξέρουν από όσους νομίζουν.',
    'Ας δούμε τώρα ποιος διάβασε.',
    'Αυτό το θέμα δεν συγχωρεί το μπλόφαρισμα.',
    'Προσοχή τώρα. Αυτό δεν το περνάει κανείς τυχαία.',
    'Κάποιοι από εσάς μόλις χλωμιάσατε.',
    'Δείξτε μου κάτι. Το περιμένω.',
  ],
  GENERIC_INTRO: [
    'Καλώς ήρθατε στην Αγορά. Για τη γνώση ήρθατε ή για το κοινό;',
    'Ένας από εσάς θα γίνει μαθητής μου. Οι υπόλοιποι θα φύγετε πιο ταπεινοί.',
    'Μαζευτήκατε. Τώρα δείξτε μου ότι αξίζατε τον δρόμο.',
    'Ξεκινάμε. Δεν ξέρω τίποτα, αλλά εσείς ξέρετε ακόμα λιγότερα.',
    'Η Αθήνα ακούει. Μιλήστε προσεκτικά.',
    'Καθίστε. Οι ερωτήσεις μου δεν είναι ευγενικές.',
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
  // EVERYONE_WRONG
  'Κανείς. Ούτε ένας. Επιτέλους μια στιγμή ειλικρινούς άγνοιας.': '[sarcastic]',
  'Όλοι λάθος. Αυτό δεν είναι ερώτηση πια, είναι διάγνωση.': '[deadpan]',
  'Ώστε συμφωνείτε όλοι. Κρίμα που συμφωνείτε στο λάθος.': '[sarcastic]',
  'Κοιτάξτε γύρω σας. Αυτοί είναι οι συνυποψήφιοί σας. Παρηγορηθείτε.': '[amused]',
  'Τέτοια ομοφωνία την είχαμε μόνο όταν καταδικάζαμε κάποιον.': '[dry]',
  'Μηδέν. Θα το θυμάμαι όταν διαλέγω μαθητή.': '[deadpan]',
  // ONLY_ONE_CORRECT
  'Ένας. Μόνο ένας ανάμεσά σας. Κοιτάξτε καλά.': '[impressed]',
  'Όλοι λάθος εκτός από έναν. Αυτό λέγεται διαφορά.': '[deadpan]',
  'Ένας μόνο. Οι υπόλοιποι μόλις έχασαν λίγη αξιοπρέπεια.': '[sarcastic]',
  'Ένας σωστός. Σημειώνω.': '[dry]',
  'Μόνο ένας. Το πλήθος το πρόσεξε αυτό.': '[thoughtful]',
  'Ένας ανάμεσα σε τόσους. Έτσι ξεχωρίζει κάποιος.': '[impressed]',
  'Ένας μόνο. Ένας ανάμεσα σε τόσους.': '[thoughtful]',
  'Κοιτάξτε ποιος σήκωσε το βάρος. Οι υπόλοιποι κοιτάγατε.': '[sarcastic]',
  'Μία σωστή απάντηση σε όλη την Αγορά. Μία.': '[deadpan]',
  // EVERYONE_CORRECT
  'Όλοι σωστά. Άρα η ερώτηση ήταν εύκολη. Μη μπερδεύεστε.': '[dry]',
  'Ομοφωνία. Ύποπτο πράγμα σε αίθουσα με τόσους φιλόδοξους.': '[curious]',
  'Μπράβο σε όλους. Τώρα κανείς δεν ξεχώρισε.': '[sarcastic]',
  'Κανένα λάθος. Θα κάνω την επόμενη δυσκολότερη.': '[serious]',
  'Το ήξεραν όλοι. Δεν μαθαίνω τίποτα για εσάς έτσι.': '[thoughtful]',
  'Ομόφωνα σωστό. Βαρετό, αλλά σωστό.': '[deadpan]',
  // BIG_COMEBACK
  'Και ξαφνικά, ζωή. Πού ήταν αυτό μέχρι τώρα;': '[amused]',
  'Ώστε μπορούσες. Και το κράτησες κρυφό.': '[curious]',
  'Κάποιος ανέβηκε από το πουθενά. Κοιτάτε, έτσι γίνεται.': '[impressed]',
  'Επιστροφή. Δεν την είχα υπολογίσει.': '[thoughtful]',
  'Από πίσω μπροστά. Αυτό αξίζει περισσότερο από σταθερότητα.': '[impressed]',
  'Με έκανε κάποιος να αλλάξω γνώμη. Δύσκολο πράγμα.': '[laughs]',
  'Γύρισε το παιχνίδι. Πού ήταν τόση ώρα αυτό;': '[amused]',
  'Επιστροφή από το πουθενά. Έτσι γίνεται.': '[impressed]',
  'Κάποιος θυμήθηκε γιατί ήρθε.': '[warm]',
  // LEAD_CHANGE
  'Άλλαξε η κορυφή. Ο θρόνος στην Αθήνα ποτέ δεν κράτησε πολύ.': '[thoughtful]',
  'Νέο πρώτο όνομα. Οι υπόλοιποι θυμηθείτε πώς είναι να κυνηγάτε.': '[serious]',
  'Ώστε αλλάζουν τα πράγματα. Η βεβαιότητα με κουράζει.': '[amused]',
  'Κάποιος πέρασε μπροστά. Για πόσο;': '[curious]',
  'Η κορυφή άλλαξε χέρια. Θα ξανααλλάξει.': '[dry]',
  'Η κορυφή άλλαξε χέρια. Και μαζί της οι στόχοι.': '[serious]',
  // HOT_STREAK_5
  'Πέντε συνεχόμενες. Αυτό δεν το έχω ξαναδεί σήμερα.': '[impressed]',
  'Πέντε στη σειρά. Αρχίζω να πιστεύω ότι υποτίμησα κάποιον.': '[impressed]',
  'Πέντε. Οι υπόλοιποι, τι ακριβώς κάνετε;': '[sarcastic]',
  'Κάποιος τις παίρνει όλες. Η Αθήνα βρήκε το θέμα της.': '[amused]',
  'Πέντε συνεχόμενες. Αν πέσεις τώρα, θα πονέσει.': '[serious]',
  'Σταματήστε να με εντυπωσιάζετε. Δεν το αντέχω.': '[laughs]',
  'Πέντε συνεχόμενες. Οι υπόλοιποι, τι ακριβώς κάνετε;': '[sarcastic]',
  'Κανείς δεν σταματάει αυτό το σερί. Περίεργο πλήθος σήμερα.': '[curious]',
  // PERFECT_GAME_PACE
  'Ρυθμός χωρίς λάθος. Μήπως κάνω τις ερωτήσεις πολύ εύκολες;': '[curious]',
  'Κανένα λάθος ως τώρα. Αυτό δεν είναι σοφία, είναι υπόσχεση.': '[thoughtful]',
  'Τέλεια πορεία ως εδώ. Το ένα λάθος θα το θυμάστε για πάντα.': '[serious]',
  'Χωρίς λάθος μέχρι στιγμής. Με ανησυχεί.': '[curious]',
  'Άψογα ως εδώ. Και το ως εδώ μετράει.': '[dry]',
  'Καθαρή πορεία. Οι καθαρές πορείες λερώνονται.': '[deadpan]',
  // HOT_STREAK_3
  'Τρεις διαδοχικές. Κάτι συμβαίνει εδώ.': '[curious]',
  'Τρία συνεχόμενα. Αυτό δεν είναι τύχη πια.': '[thoughtful]',
  'Τρεις σωστές. Κάποιος εδώ ξέρει τι κάνει.': '[impressed]',
  'Κάποιος δεν σταματάει. Κάντε κάτι.': '[amused]',
  'Τρία στη σειρά. Από εδώ και πέρα κάθε λάθος θα το θυμούνται.': '[serious]',
  'Τρεις. Το πλήθος μέτρησε κι αυτό.': '[dry]',
  'Τρεις στη σειρά. Άρχισα να προσέχω.': '[curious]',
  // STREAK_BROKEN
  'Τελείωσε το σερί. Όλα τελειώνουν, απλώς αυτό τελείωσε δημόσια.': '[sighs]',
  'Και να που έπεσες. Η πτώση από ψηλά ακούγεται περισσότερο.': '[deadpan]',
  'Σταμάτησε. Ήταν ωραία όσο κράτησε.': '[sighs]',
  'Και μετά τίποτα. Έτσι τελειώνουν τα σερί.': '[dry]',
  'Το σερί έσπασε. Το πλήθος το πρόσεξε πριν από εσένα.': '[sarcastic]',
  'Τέλος. Τώρα ξαναρχίζεις από την αρχή.': '[deadpan]',
  // SPEED_DEMON
  'Απάντησες πριν τελειώσω. Είτε το ήξερες, είτε δεν με άκουγες.': '[curious]',
  'Ταχύτητα. Στην Αγορά ο πρώτος που μιλάει σπάνια έχει δίκιο.': '[thoughtful]',
  'Γρήγορα. Ελπίζω και σωστά.': '[dry]',
  'Τόση βιάση. Η γνώση δεν φεύγει.': '[sighs]',
  'Πρόλαβες τους πάντες. Πρόλαβες να σκεφτείς;': '[sarcastic]',
  'Αστραπή. Ας δούμε αν κρατάει.': '[amused]',
  // EASY_MISS
  'Και όμως, χάθηκε. Ερώτηση για παιδιά.': '[sarcastic]',
  'Εύκολη ερώτηση. Την έκανες δύσκολη χωρίς λόγο.': '[deadpan]',
  'Θα προσποιηθώ ότι δεν το είδα. Οι υπόλοιποι όμως το είδαν.': '[amused]',
  'Αυτό ήταν από τα εύκολα. Ήταν.': '[deadpan]',
  'Εύκολο ερώτημα, βαριά απάντηση.': '[dry]',
  'Δεν χρειαζόταν γνώση εδώ. Χρειαζόταν προσοχή.': '[serious]',
  'Αυτό το ήξερε το πλήθος. Το πλήθος.': '[sarcastic]',
  'Εύκολη ερώτηση, βαριά αστοχία.': '[sighs]',
  // HARD_HIT
  'Δύσκολη, και κάποιος την πέτυχε. Τύχη ή γνώση;': '[impressed]',
  'Λίγοι θα το ήξεραν. Σημείωσα ποιος.': '[thoughtful]',
  'Ώστε διαβάζεις. Επιτέλους κάποιος.': '[amused]',
  'Αυτό ήταν δύσκολο. Το πλήθος δεν το κατάλαβε καν.': '[impressed]',
  'Αυτό δεν το περίμενα. Συνεχίστε.': '[curious]',
  'Σωστό σε δύσκολο ερώτημα. Αυτά μετράνε.': '[serious]',
  // COLD_STREAK_3
  'Τρία λάθη στη σειρά. Υπάρχει μέθοδος εδώ.': '[dry]',
  'Τρεις συνεχόμενες αστοχίες. Δοκιμάστε να σκεφτείτε πρώτα.': '[sighs]',
  'Τρία στη σειρά. Λάθος, εννοώ.': '[deadpan]',
  'Το πλήθος σταμάτησε να ελπίζει.': '[sighs]',
  'Τρεις σερί αποτυχίες. Η σταθερότητα σου είναι αξιοθαύμαστη.': '[sarcastic]',
  'Κάτι δεν πάει καλά. Και το βλέπουν όλοι.': '[serious]',
  // NO_ANSWER
  'Σιωπή. Θα την εκτιμούσα, αν ήταν επιλογή.': '[thoughtful]',
  'Καμία απάντηση. Τουλάχιστον δεν ειπώθηκε βλακεία.': '[dry]',
  'Ο χρόνος πέρασε και κάποιος μαζί του.': '[sighs]',
  'Καμία απάντηση. Η άγνοια τουλάχιστον ήταν σιωπηλή.': '[deadpan]',
  'Σας περίμενα. Δεν ήρθατε.': '[sighs]',
  'Τίποτα. Κάποιες φορές αυτό λέει περισσότερα.': '[thoughtful]',
  'Καμία απάντηση. Η σιωπή τουλάχιστον δεν λέει βλακείες.': '[sarcastic]',
  'Ο χρόνος πέρασε. Κάποιος τον άφησε να περάσει.': '[dry]',
  'Τίποτα. Και το τίποτα κι αυτό απάντηση είναι.': '[thoughtful]',
  // STUCK_IN_LAST
  'Ακόμα στην τελευταία θέση. Υπάρχει μια σταθερότητα εδώ.': '[deadpan]',
  'Τελευταία θέση από την αρχή. Τουλάχιστον υπάρχει συνέπεια.': '[sarcastic]',
  'Μη φεύγει κανείς. Κάποιος ορίζει τον πάτο.': '[amused]',
  'Ο δρόμος προς τη σοφία ξεκινά εκεί που στέκεστε. Κάποιος στέκεται πολύ πίσω.': '[thoughtful]',
  'Ακόμα εκεί. Αυτό λέει κάτι για την επιμονή σου.': '[dry]',
  'Σας βλέπω όλους. Κάποιον περισσότερο.': '[sarcastic]',
  'Ακόμα τελευταίος. Υπάρχει μια σταθερότητα εδώ που άλλοι θα ζήλευαν.': '[deadpan]',
  'Ο πάτος έχει κι αυτός τον φύλακά του.': '[dry]',
  'Κάποιος πρέπει να ορίζει το κάτω όριο. Ευχαριστούμε.': '[sarcastic]',
  // FASTEST_THIS_ROUND
  "Γρηγορότερα απ' όλους. Το πλήθος εντυπωσιάστηκε. Εγώ όχι ακόμα.": '[dry]',
  'Πρώτο χέρι. Αυτό δίνει το βήμα, όχι το δίκιο.': '[thoughtful]',
  'Τους πρόλαβε όλους. Ας το κρατήσει.': '[impressed]',
  'Κανείς πιο γρήγορα αυτόν τον γύρο.': '[deadpan]',
  'Πρώτο όνομα στη λίστα μου σήμερα.': '[curious]',
  'Ταχύτερη απάντηση. Σημειώθηκε.': '[dry]',
  // CLOSE_SCORES
  'Κολλητά. Κανείς σας δεν έχει κερδίσει τίποτα ακόμα.': '[serious]',
  'Τόσο κοντά που η επόμενη κρίνει χαρακτήρες, όχι πόντους.': '[thoughtful]',
  'Ισορροπία. Κάποιος πρέπει να τη χαλάσει.': '[curious]',
  'Λίγοι πόντοι σας χωρίζουν. Λίγοι πόντοι, μεγάλη διαφορά.': '[serious]',
  'Κανένας δεν ξεχωρίζει. Ακόμα.': '[dry]',
  'Στενό. Μου αρέσει όταν δεν ξέρω το τέλος.': '[amused]',
  // RUNAWAY_LEAD
  'Κάποιος ξέφυγε. Στην Αθήνα τον πρώτο τον εξοστρακίζαμε.': '[serious]',
  'Κάποιος έχει ξεφύγει και κανείς σας δεν κάνει τίποτα.': '[sarcastic]',
  'Τόσο μπροστά που άρχισε να βαριέται.': '[amused]',
  'Η διαφορά μεγαλώνει. Αυτό δεν είναι αγώνας πια.': '[serious]',
  'Ένας εναντίον όλων. Και κερδίζει.': '[impressed]',
  'Σταματήστε τον. Παρακαλώ.': '[laughs]',
  'Κάποιος ξέφυγε. Και κανείς σας δεν κάνει τίποτα.': '[sarcastic]',
  'Η διαφορά μεγάλωσε. Αυτό δεν είναι αγώνας πια.': '[deadpan]',
  'Στην Αθήνα τον πρώτο τον εξοστρακίζαμε. Απλή υπενθύμιση.': '[dry]',
  // GENERIC_TRANSITION
  'Συνεχίζουμε. Η άγνοια δεν ξεκουράζεται.': '[serious]',
  'Επόμενη. Σας παρακολουθώ πιο στενά τώρα.': '[curious]',
  'Πάμε. Το πλήθος βαριέται πιο γρήγορα από μένα.': '[amused]',
  'Άλλη μία. Μη χαλαρώνετε.': '[dry]',
  'Προχωράμε. Κάποιος πρέπει να ξεχωρίσει.': '[serious]',
  'Επόμενο ερώτημα. Ελπίζω σε καλύτερα.': '[sighs]',
  // FINAL_QUESTION (intro)
  'Τελευταία ερώτηση. Ό,τι μάθατε ως τώρα κρίνεται εδώ.': '[serious]',
  'Η τελευταία. Μετά διαλέγω μαθητή και δεν αλλάζω γνώμη.': '[serious]',
  'Ένα ερώτημα ακόμα. Και σας κρίνουν.': '[thoughtful]',
  'Τέλος. Μία ερώτηση σας χωρίζει από την απάντηση.': '[serious]',
  'Η τελευταία ευκαιρία να με πείσετε.': '[curious]',
  'Μετά από αυτήν, σιωπή. Και μια απόφαση.': '[thoughtful]',
  // HALFWAY_POINT (intro)
  'Μισός δρόμος. Οι μισοί το κατάλαβαν ήδη ότι δεν θα τα καταφέρουν.': '[sarcastic]',
  'Φτάσαμε στη μέση. Ό,τι χτίσατε μπορεί να καταρρεύσει.': '[serious]',
  'Μέση. Καλή στιγμή να αναρωτηθείτε γιατί ήρθατε.': '[thoughtful]',
  'Οι μισές ερωτήσεις πέρασαν. Οι δύσκολες μένουν.': '[serious]',
  'Μέχρι εδώ καλά. Από εδώ και πέρα, δεν ξέρω.': '[curious]',
  'Μισό. Κανείς δεν έχει κερδίσει ακόμα.': '[dry]',
  // CATEGORY_CALLOUT (intro)
  'Εδώ χωρίζονται όσοι ξέρουν από όσους νομίζουν.': '[serious]',
  'Ας δούμε τώρα ποιος διάβασε.': '[curious]',
  'Αυτό το θέμα δεν συγχωρεί το μπλόφαρισμα.': '[serious]',
  'Προσοχή τώρα. Αυτό δεν το περνάει κανείς τυχαία.': '[curious]',
  'Κάποιοι από εσάς μόλις χλωμιάσατε.': '[amused]',
  'Δείξτε μου κάτι. Το περιμένω.': '[dry]',
  // GENERIC_INTRO (intro)
  'Καλώς ήρθατε στην Αγορά. Για τη γνώση ήρθατε ή για το κοινό;': '[warm]',
  'Ένας από εσάς θα γίνει μαθητής μου. Οι υπόλοιποι θα φύγετε πιο ταπεινοί.': '[serious]',
  'Μαζευτήκατε. Τώρα δείξτε μου ότι αξίζατε τον δρόμο.': '[curious]',
  'Ξεκινάμε. Δεν ξέρω τίποτα, αλλά εσείς ξέρετε ακόμα λιγότερα.': '[amused]',
  'Η Αθήνα ακούει. Μιλήστε προσεκτικά.': '[serious]',
  'Καθίστε. Οι ερωτήσεις μου δεν είναι ευγενικές.': '[dry]',
};

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

function pickLine(state: SocratesState, pool: readonly string[], vars: Record<string, string>): PickedLine | null {
  for (const template of pool) {
    if (!state.usedLines.has(template)) {
      state.usedLines.add(template);
      return { template, text: substitute(template, vars), tag: LINE_TAGS[template] ?? null };
    }
  }
  return null; // this moment's whole pool is exhausted this game
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

  // ---- HIGH ----
  if (correctCount === 0) {
    candidates.push({ moment: 'EVERYONE_WRONG', priority: 0, targetId: null, vars: {} });
  }
  if (correctCount === results.length) {
    candidates.push({ moment: 'EVERYONE_CORRECT', priority: 0, targetId: null, vars: {} });
  }
  if (correctCount === 1) {
    const only = results.find((r) => r.correct)!;
    candidates.push({
      moment: 'ONLY_ONE_CORRECT',
      priority: 0,
      targetId: only.playerId,
      vars: { name: safeNameForLine(only.name) },
    });
  }

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
    if (!r.correct && (preCorrectStreak.get(r.playerId) ?? 0) >= 3) {
      candidates.push({
        moment: 'STREAK_BROKEN',
        priority: 1,
        targetId: r.playerId,
        vars: { name: safeNameForLine(r.name) },
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
  const fastest = results.find((r) => r.answerRank === 1);
  if (fastest) {
    candidates.push({
      moment: 'FASTEST_THIS_ROUND',
      priority: 2,
      targetId: fastest.playerId,
      vars: { name: safeNameForLine(fastest.name) },
    });
  }
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
    if (candidate.targetId) {
      const p = state.players.get(candidate.targetId)!;
      const onCooldown = context.questionIndex - p.lastTargetedAtQuestionIndex < 3;
      // HIGH priority (0) bypasses the cooldown - a dramatic moment is
      // worth mentioning even if that player was just roasted last round.
      if (onCooldown && candidate.priority !== 0) {
        continue;
      }
    }
    const line = pickLine(state, LINES[candidate.moment], candidate.vars);
    if (line === null) {
      continue; // this moment's line pool is exhausted - try the next candidate
    }
    if (candidate.targetId) {
      state.players.get(candidate.targetId)!.lastTargetedAtQuestionIndex = context.questionIndex;
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
