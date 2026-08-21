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
// not just eyeballed here). Gender-neutrality: Greek marks gender on
// articles ("ο/η"), predicate adjectives ("γρήγορος/η"), possessives
// ("του/της") and object pronouns ("τον/την") - since a player's name
// gives no reliable gender, every line below avoids these slots entirely
// rather than papering over them with a slash: {name} is used bare, as a
// grammatical subject or in apposition to a gender-fixed noun ("απάντηση"
// = answer, feminine; "σερί" = streak, neuter) wherever a 3rd-person
// article/adjective/pronoun would otherwise be needed, and several lines
// switch to direct 2nd-person address ("εσύ"/"σε"/"σου"), which Greek
// simply has no grammatical gender for. Zero "/" characters in any line.
// Mocks the ANSWER/PERFORMANCE only - never appearance, never intelligence
// as a trait, never anything not derivable from game state. Exported
// (only) so test tooling can inspect line counts/content directly -
// nothing else in this file needs it to be public.
export const LINES: Record<Moment, readonly string[]> = {
  EVERYONE_WRONG: [
    'Κανείς. Ούτε ένας. Ντροπή σας όλους.',
    'Όλοι λάθος. Ίσως να ρίξουμε ζάρι την επόμενη φορά.',
    'Μηδέν σωστές απαντήσεις. Ρεκόρ... απαράδεκτο ρεκόρ.',
    'Αυτή η ερώτηση σας νίκησε όλους μαζί. Συγχαρητήρια σε κανέναν.',
    'Ομαδική αποτυχία. Τουλάχιστον είστε ενωμένοι σε αυτό.',
    'Ούτε μία σωστή. Το σύμπαν σάς κοιτάει με απογοήτευση.',
  ],
  ONLY_ONE_CORRECT: [
    'Μόνο {name} το βρήκε. Οι υπόλοιποι, τι κάνατε εκεί πέρα;',
    'Μόνο {name} στην κορυφή αυτής της ερώτησης.',
    'Μία σωστή απάντηση: {name}. Όλοι οι άλλοι, σκεφτείτε το.',
    '{name} το ήξερε. Οι υπόλοιποι απλώς μάντεψαν και έχασαν.',
    'Σπάνια στιγμή: μόνο {name} δεν απογοήτευσε.',
    '{name} λάμπει μόνο, ενώ οι άλλοι σβήνουν.',
  ],
  EVERYONE_CORRECT: [
    'Όλοι σωστά! Μήπως ήταν λίγο εύκολη αυτή, ε;',
    '100% επιτυχία. Είτε είστε ιδιοφυΐες είτε η ερώτηση ήταν χαρισμένη.',
    'Καμία απώλεια αυτόν τον γύρο. Ύποπτα καλή απόδοση.',
    'Όλοι μαζί στο σωστό. Ωραία δουλειά, ομάδα.',
    'Full house σωστών. Δεν το περίμενα, ειλικρινά.',
    'Κανείς δεν σας κατέβασε αυτή τη φορά. Μπράβο σε όλους.',
  ],
  BIG_COMEBACK: [
    'Και ξαφνικά {name} θυμήθηκε ότι παίζει!',
    '{name} ανέβηκε {n} θέσεις με ένα χτύπημα. Επιστροφή σεζόν.',
    'Από το πουθενά, {name} μπαίνει ξανά στο παιχνίδι.',
    '{name} μόλις έκανε άλμα {n} θέσεων. Ποιος σταματάει αυτό τώρα;',
    'Ανατροπή! {name} σκαρφάλωσε {n} θέσεις σε μία ερώτηση.',
    '{name} το γύρισε δραματικά. Σίριαλ θα το λέγαμε.',
  ],
  LEAD_CHANGE: [
    '{name}, πήρες την κορυφή! Η πρωτιά άλλαξε χέρια.',
    '{name} πέρασε μπροστά. Η πρωτοπορία έχει νέο όνομα.',
    'Αλλαγή στην κορυφή: {name} πλέον οδηγεί.',
    '{name} άρπαξε την πρώτη θέση. Κρατηθείτε.',
    'Νέα εποχή: {name} είναι τώρα μπροστά απ\' όλους.',
    'Η σκυτάλη πέρασε σε {name}. Δείτε πώς τρέχει τώρα.',
  ],
  HOT_STREAK_5: [
    '{n} σωστές στη σειρά για {name}. Δεν σταματάει.',
    '{name} στο σερί {n}. Κάποιος να το σταματήσει, σοβαρά.',
    '{n} στη σειρά. {name} έχει κλειδώσει τη σωστή απάντηση.',
    '{name} είναι σε φωτιά — {n} σερί και συνεχίζει.',
    'Σερί {n} σωστών για {name}. Επίσημα εντυπωσιακό.',
    '{name} χτίζει δυναστεία: {n} σωστές στη σειρά.',
  ],
  PERFECT_GAME_PACE: [
    '{name} στο 100% ακόμα, μετά από {n} ερωτήσεις. Τέλειο ρεκόρ.',
    'Καμία λάθος απάντηση από {name} μέχρι στιγμής. Ανησυχητικό.',
    '{name} παίζει σε άλλο επίπεδο — τέλειο σκορ ακόμα.',
    '{n} ερωτήσεις, μηδέν λάθη. {name} δεν έχει χάσει βήμα.',
    '{name} συνεχίζει το τέλειο παιχνίδι. Πόσο θα κρατήσει;',
    'Ούτε μία λάθος ακόμα για {name}. Φοβερό.',
  ],
  HOT_STREAK_3: [
    '{name} έχει πάρει φωτιά. Κάποιος να φέρει νερό.',
    '{n} σωστές στη σειρά. {name} μπήκε σε ρυθμό.',
    '{name} σερί {n}. Αρχίζει να γίνεται συνήθεια.',
    'Τρίτη σωστή στη σειρά για {name}. Προσοχή, σοβαρά.',
    '{name} βρήκε ρυθμό — {n} σωστές και μετράει.',
    'Καλή στιγμή για {name}: {n} σερί.',
  ],
  STREAK_BROKEN: [
    'Το σερί σταμάτησε εδώ, {name}. Ωραίο όσο κράτησε.',
    '{name} έσπασε το σερί. Όλα τα καλά πράγματα τελειώνουν.',
    'Τέλος εποχής για {name} — το σερί έσπασε.',
    '{name} επέστρεψε στη γη μετά από καλό σερί.',
    '{name}, το ασταμάτητο σερί μόλις σταμάτησε.',
    '{name} έχασε τον ρυθμό. Θα ξαναβρεθεί;',
  ],
  SPEED_DEMON: [
    'Απαντάς πιο γρήγορα από όλους, {name}. {n} φορές τώρα.',
    'Ταχύτητα φωτός για {name}, για {n}η φορά.',
    'Απαντάς πριν προλάβει κανείς να διαβάσει, {name}. {n}η φορά.',
    'Κανείς δεν προλαβαίνει {name}. {n} φορές τώρα.',
    '{name} απαντάει πριν προλάβετε να διαβάσετε. {n}η φορά.',
    'Δάχτυλα σαν αστραπή: {name}, {n}η φορά.',
  ],
  EASY_MISS: [
    '{name}, αυτό το ήξερε και το σκυλί μου.',
    'Εύκολη ερώτηση, δύσκολη απάντηση για {name}.',
    '{name}, αυτό ήταν δώρο και το αρνήθηκες.',
    'Ακόμα και τα νήπια θα το έβρισκαν, {name}.',
    '{name}, η εύκολη ερώτηση σε νίκησε. Πώς;',
    'Αυτό ήταν στημένο να το βρεις, {name}. Και όμως.',
  ],
  HARD_HIT: [
    '{name} το βρήκε; Εντάξει, σε υποτίμησα.',
    'Δύσκολη ερώτηση, εύκολη νίκη για {name}.',
    '{name}, δεν το περίμενα αυτό. Σεβασμός.',
    '{name} έλυσε το δύσκολο σαν να ήταν εύκολο.',
    'Απροσδόκητο χτύπημα από {name} στη δύσκολη ερώτηση.',
    '{name}, από πού βγήκε αυτή η γνώση; Εντυπωσιακό.',
  ],
  COLD_STREAK_3: [
    '{n} λάθη στη σειρά για {name}. Δύσκολη βραδιά.',
    '{name} σε ελεύθερη πτώση — {n} λάθη στη σειρά.',
    'Τρίτο λάθος στη σειρά για {name}. Ανάσα, ξαναπροσπάθησε.',
    '{name} χρειάζεται βοήθεια — {n} στη σειρά λάθος.',
    'Κρύο σερί για {name}: {n} λάθη μαζεμένα.',
    '{name} δεν βρίσκει άκρη. {n} λάθη στη σειρά.',
  ],
  NO_ANSWER: [
    '{name} αποφάσισε να μην παίξει καθόλου. Θάρρος.',
    'Ο χρόνος τελείωσε και {name} δεν είπε τίποτα. Στρατηγική;',
    '{name}, η σιωπή δεν φέρνει πόντους.',
    '{name} πάγωσε. Τίποτα δεν στάλθηκε.',
    '{name} επέλεξε το μηδέν αντί για μια απάντηση.',
    'Ούτε μία επιλογή από {name} αυτή τη φορά.',
  ],
  STUCK_IN_LAST: [
    '{name}, η τελευταία θέση σε περιμένει σαν σπίτι.',
    '{name} έχει νοικιάσει μόνιμα την τελευταία θέση.',
    'Ακόμα στην τελευταία θέση {name}. Σταθερότητα.',
    '{name} δεν φεύγει από τον πάτο. Αφοσίωση, τρόπον τινά.',
    '{name}, ο πάτος έχει γίνει η άνετη γωνιά σου.',
    '{name} κρατάει την τελευταία θέση σαν τρόπαιο.',
  ],
  FASTEST_THIS_ROUND: [
    '{name} απάντησε πιο γρήγορα απ\' όλους αυτόν τον γύρο.',
    'Ταχύτερη απάντηση αυτή τη φορά: {name}.',
    '{name} πρόλαβε όλους τους άλλους σε αυτή την ερώτηση.',
    'Πρώτη σωστή απάντηση: {name}.',
    '{name} δεν έχασε ούτε δευτερόλεπτο αυτόν τον γύρο.',
    'Ταχύτητα ρεκόρ απ\' όλους: {name}, σε αυτή την ερώτηση.',
  ],
  CLOSE_SCORES: [
    '{name} και {name2} χωρίζονται μόνο από {n} πόντους.',
    'Στενή μάχη στην κορυφή: {name} εναντίον {name2}.',
    '{n} πόντοι χωρίζουν {name} από {name2}. Τίποτα.',
    '{name} και {name2} είναι σχεδόν κολλητά στο σκορ.',
    'Θρίλερ στην κορυφή ανάμεσα σε {name} και {name2}.',
    'Μόλις {n} πόντοι χωρίζουν την πρώτη από τη δεύτερη θέση.',
  ],
  RUNAWAY_LEAD: [
    '{name} έχει φύγει μακριά. {score} πόντοι και μετρώντας.',
    'Δεν είναι πια αγώνας — {name} οδηγεί με άνεση.',
    '{name} χτίζει προβάδισμα που δύσκολα θα φανεί ξανά.',
    'Οι υπόλοιποι παίζουν για τη δεύτερη θέση. {name} οδηγεί.',
    '{name} απομακρύνεται. Χρειάζεται θαύμα για να φτάσει κανείς.',
    'Μεγάλο προβάδισμα για {name}. Άνετα μπροστά.',
  ],
  GENERIC_TRANSITION: [
    'Και προχωράμε στην επόμενη ερώτηση.',
    'Ώρα για την επόμενη πρόκληση.',
    'Ας δούμε τι θα φέρει η επόμενη ερώτηση.',
    'Συνεχίζουμε — κανείς δεν σταματάει τώρα.',
    'Επόμενη ερώτηση, ίδιο πάθος.',
    'Πάμε παρακάτω, το παιχνίδι δεν περιμένει.',
    'Ώρα να δούμε ποιος θα ξεχωρίσει τώρα.',
    'Η μάχη συνεχίζεται στην επόμενη ερώτηση.',
    'Κρατηθείτε, ερχόμαστε δυνατά στην επόμενη.',
    'Χωρίς ανάσα προχωράμε στην επόμενη ερώτηση.',
  ],
};

// Exported for the same reason as LINES above.
export const INTRO_LINES: Record<IntroMoment, readonly string[]> = {
  FINAL_QUESTION: [
    'Τελευταία ερώτηση! Ό,τι παίχτηκε, παίχτηκε.',
    'Η τελευταία ερώτηση της βραδιάς. Δώστε τα όλα.',
    'Μία ερώτηση ακόμα και τελειώνει το παιχνίδι.',
    'Τελευταία ευκαιρία να ανατρέψετε τα πάντα.',
    'Το φινάλε είναι εδώ. Τελευταία ερώτηση!',
    'Μία τελευταία μάχη πριν κλείσει η αυλαία.',
  ],
  HALFWAY_POINT: [
    'Φτάσαμε στη μέση του παιχνιδιού. Μισός δρόμος ακόμα.',
    'Στα μισά! Η δεύτερη μισή αρχίζει τώρα.',
    'Μέση του παιχνιδιού. Όλα ακόμα ανοιχτά.',
    'Έχουμε καλύψει τον μισό δρόμο. Συνεχίζουμε δυνατά.',
    'Στη μέση της διαδρομής — κανείς δεν έχει κερδίσει ακόμα.',
    'Μισό παιχνίδι πίσω μας, μισό μπροστά.',
  ],
  CATEGORY_CALLOUT: [
    'Θέμα: {category}. Ετοιμαστείτε.',
    'Επόμενη κατηγορία: {category}.',
    'Μπαίνουμε σε {category}. Ποιος ξέρει;',
    'Ώρα για {category}. Δείξτε τι ξέρετε.',
    'Κατηγορία {category} — όλα ανοιχτά.',
    '{category}. Εδώ θα φανεί ποιος διάβασε.',
    'Πάμε σε {category}. Κρατηθείτε.',
    'Θέμα {category}. Μην απογοητεύσετε.',
  ],
  GENERIC_INTRO: [
    'Επόμενη ερώτηση, ελάτε δυνατά.',
    'Ώρα για μια ακόμα ερώτηση.',
    'Ετοιμαστείτε — έρχεται η επόμενη ερώτηση.',
    'Μια ερώτηση ακόμα. Πάμε.',
    'Νέα ερώτηση, νέα ευκαιρία.',
    'Συγκεντρωθείτε. Η επόμενη ερώτηση είναι εδώ.',
    'Πάμε στην επόμενη ερώτηση χωρίς καθυστέρηση.',
    'Ώρα να δείξετε τι ξέρετε ξανά.',
  ],
};

// ============================= selection logic =============================

function pickLine(state: SocratesState, pool: readonly string[], vars: Record<string, string>): string | null {
  for (const template of pool) {
    if (!state.usedLines.has(template)) {
      state.usedLines.add(template);
      return substitute(template, vars);
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
): string | null {
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
      return line;
    }
  }
  if (isHalfway) {
    const line = pickLine(state, INTRO_LINES.HALFWAY_POINT, {});
    if (line) {
      return line;
    }
  }
  const categoryLine = pickLine(state, INTRO_LINES.CATEGORY_CALLOUT, { category: safeCategoryForLine(context.category) });
  if (categoryLine) {
    return categoryLine;
  }
  return pickLine(state, INTRO_LINES.GENERIC_INTRO, {});
}
