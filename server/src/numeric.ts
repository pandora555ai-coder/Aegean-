// The numeric-estimate mechanic (Task 65) - deliberately mode-agnostic. This
// file knows nothing about GameMode, Room.mode, phases, sockets or timers:
// maxForAnswer, the scoring function and the payload builders all just turn
// primitives into other primitives. modes/numeric.ts is the only file that
// knows this is currently running as its own standalone mode; when Task 66
// folds numeric estimate into the quiz as a stage, that shell is what gets
// rewritten - this file should not have to change at all.
import { NUMERIC_ROUND_VALUES, type PlayerStanding } from '@game/shared';
import { computeCompetitionRanks } from './payloads.js';
import type {
  NumericQuestionShowHostPayload,
  NumericQuestionShowPlayerPayload,
  NumericRevealResult,
  NumericRevealShowPayload,
} from '@game/shared';

// The smallest round value at least 2.5x the answer - this keeps the correct
// value sitting at 20-40% of the slider (never the midpoint, which would
// give it away). 8 -> 20 is the boundary case: 2.5*8 is exactly 20, and 20
// itself qualifies ("at least", not "strictly above"). NUMERIC_ROUND_VALUES
// itself lives in shared (see its own comment) so the /dev/numeric review
// tool can run this exact same check client-side.
export function maxForAnswer(answer: number): number {
  const threshold = 2.5 * answer;
  const found = NUMERIC_ROUND_VALUES.find((value) => value >= threshold);
  return found ?? NUMERIC_ROUND_VALUES[NUMERIC_ROUND_VALUES.length - 1];
}

export function sliderStepForMax(max: number): number {
  return max / 200;
}

// Out of range is CLAMPED, never rejected (spec) - a player dragging past
// either end of the slider just lands on that end.
export function clampNumericValue(value: number, max: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(max, Math.max(0, value));
}

export interface NumericQuestion {
  text: string;
  answer: number;
  max: number; // DERIVED via maxForAnswer, never authored directly
  category: string;
}

export function buildNumericQuestion(text: string, answer: number, category: string): NumericQuestion {
  return { text, answer, category, max: maxForAnswer(answer) };
}

export interface NumericSubmission {
  playerId: string;
  value: number | null; // null - never submitted
}

export interface NumericScoreResult extends NumericSubmission {
  distance: number;
  rank: number; // tied distances share the better rank (1,1,3 - not 1,2,3)
  exact: boolean;
  pointsAwarded: number;
}

// Everyone scores. Ranked by absolute distance from the answer (closest
// first) via computeCompetitionRanks - the SAME ranking function every other
// mode uses, just fed a negated distance so "smaller is better" sorts like
// "bigger score is better" does everywhere else. A non-submitter is scored
// as distance = max + 1, strictly worse than any in-range (post-clamp)
// submission, so they rank last without any special-casing or crash.
export function scoreNumericSubmissions(
  submissions: readonly NumericSubmission[],
  answer: number,
  max: number,
): NumericScoreResult[] {
  const n = submissions.length;
  const withDistance = submissions.map((submission) => ({
    ...submission,
    distance: submission.value === null ? max + 1 : Math.abs(submission.value - answer),
  }));
  const ranks = computeCompetitionRanks(
    withDistance,
    (item) => -item.distance,
    (item) => item.playerId,
  );

  return withDistance.map((item) => {
    const rank = ranks.get(item.playerId) ?? n;
    // base = round(400 * (0.25 + 0.75 * (N - rank) / (N - 1))) - last place
    // always gets a flat 25% of max, at any N. N<=1 is the edge case: N-1
    // would divide by zero, and the spec calls it out explicitly as 400.
    const base = n <= 1 ? 400 : Math.round(400 * (0.25 + (0.75 * (n - rank)) / (n - 1)));
    const exact = item.value !== null && item.value === answer;
    return { ...item, rank, exact, pointsAwarded: base + (exact ? 100 : 0) };
  });
}

// ---------------------------------------------------------------------------
// Pure payload builders - primitives in, a wire-shaped object out. No Room,
// no socket, no timer: modes/numeric.ts supplies every value (durationMs from
// remainingActiveTimerMs, standings from computeStandings, paused/pausedByName
// off the room) itself.
// ---------------------------------------------------------------------------

export function buildNumericQuestionHostPayload(
  question: NumericQuestion,
  questionIndex: number,
  totalQuestions: number,
  durationMs: number,
  submittedCount: number,
  totalPlayers: number,
  submittedPlayerIds: string[],
  paused: boolean,
  pausedByName: string | null,
  standings: PlayerStanding[],
): NumericQuestionShowHostPayload {
  return {
    questionIndex,
    totalQuestions,
    text: question.text,
    category: question.category,
    max: question.max,
    sliderStep: sliderStepForMax(question.max),
    durationMs,
    submittedCount,
    totalPlayers,
    submittedPlayerIds,
    paused,
    pausedByName,
    standings,
  };
}

export function buildNumericQuestionPlayerPayload(
  question: NumericQuestion,
  questionIndex: number,
  totalQuestions: number,
  durationMs: number,
  submitted: boolean,
  paused: boolean,
  pausedByName: string | null,
): NumericQuestionShowPlayerPayload {
  return {
    questionIndex,
    totalQuestions,
    text: question.text,
    category: question.category,
    max: question.max,
    sliderStep: sliderStepForMax(question.max),
    durationMs,
    submitted,
    paused,
    pausedByName,
  };
}

export function buildNumericRevealPayload(
  question: NumericQuestion,
  questionIndex: number,
  totalQuestions: number,
  results: NumericRevealResult[],
  autoAdvanceMs: number,
  paused: boolean,
  pausedByName: string | null,
  standings: PlayerStanding[],
): NumericRevealShowPayload {
  return {
    questionIndex,
    totalQuestions,
    text: question.text,
    category: question.category,
    answer: question.answer,
    max: question.max,
    results,
    autoAdvanceMs,
    paused,
    pausedByName,
    standings,
  };
}

// First real content pass (Task 67's source list) - unreviewed. Judge these
// at /dev/numeric before they ship; Keep/Cut choices there are what decide
// the real pool, not this array's mere presence. One question from the
// source list ("πόσους θεατές χωράει το αρχαίο θέατρο της Επιδαύρου" -
// 14000) is deliberately NOT here: its answer exceeds 2000, so it has no
// valid entry in NUMERIC_ROUND_VALUES (shared) and would silently get
// max=5000 - either the table grows a 10000/20000 step, or the question
// stays cut. Nothing here is time-sensitive (populations, prices, records,
// "how many exist today") on purpose - those go stale.
export const NUMERIC_QUESTIONS: readonly NumericQuestion[] = [
  buildNumericQuestion('Πόσοι κίονες περιβάλλουν τον Παρθενώνα;', 46, 'Αρχαία Αθήνα'),
  buildNumericQuestion('Πόσα χρόνια έζησε ο Σωκράτης;', 71, 'Αρχαία Αθήνα'),
  buildNumericQuestion('Πόσοι Σπαρτιάτες πολέμησαν στις Θερμοπύλες;', 300, 'Ιστορία'),
  buildNumericQuestion('Πόσα μέλη είχε η Βουλή των Πεντακοσίων;', 500, 'Αρχαία Αθήνα'),
  buildNumericQuestion('Πόσοι δικαστές δίκασαν τον Σωκράτη;', 501, 'Αρχαία Αθήνα'),
  buildNumericQuestion('Πόσα χρόνια κράτησε ο Πελοποννησιακός Πόλεμος;', 27, 'Ιστορία'),
  buildNumericQuestion('Πόσοι ήταν οι άθλοι του Ηρακλή;', 12, 'Μυθολογία'),
  buildNumericQuestion('Πόσα χρόνια κράτησε η πολιορκία της Τροίας;', 10, 'Μυθολογία'),
  buildNumericQuestion('Πόσα χρόνια ταξίδευε ο Οδυσσέας για να γυρίσει;', 10, 'Μυθολογία'),
  buildNumericQuestion('Πόσες ραψωδίες έχει η Οδύσσεια;', 24, 'Μυθολογία'),
  buildNumericQuestion('Πόσα μέτρα ύψος είχε ο Κολοσσός της Ρόδου;', 33, 'Ιστορία'),
  buildNumericQuestion('Πόσα γράμματα έχει το ελληνικό αλφάβητο;', 24, 'Γλώσσα'),
  buildNumericQuestion('Σε ποιο έτος π.Χ. έγινε η μάχη του Μαραθώνα;', 490, 'Ιστορία'),
  buildNumericQuestion('Σε ποιο έτος έπεσε η Κωνσταντινούπολη;', 1453, 'Ιστορία'),
  buildNumericQuestion('Πόσα χρόνια κράτησε ο Εκατονταετής Πόλεμος;', 116, 'Ιστορία'),
  buildNumericQuestion('Πόσα θαύματα είχε ο αρχαίος κόσμος;', 7, 'Ιστορία'),
  buildNumericQuestion('Κάθε πόσα χρόνια γίνονταν οι αρχαίοι Ολυμπιακοί;', 4, 'Ιστορία'),
  buildNumericQuestion('Πόσα οστά έχει ο ενήλικος άνθρωπος;', 206, 'Σώμα'),
  buildNumericQuestion('Πόσα δόντια έχει ο ενήλικος άνθρωπος;', 32, 'Σώμα'),
  buildNumericQuestion('Πόσα ζεύγη χρωμοσωμάτων έχει ο άνθρωπος;', 23, 'Σώμα'),
  buildNumericQuestion('Πόσα οστά έχει το ανθρώπινο χέρι από τον καρπό και κάτω;', 27, 'Σώμα'),
  buildNumericQuestion('Πόσοι μύες υπάρχουν περίπου στο ανθρώπινο σώμα;', 600, 'Σώμα'),
  buildNumericQuestion('Πόσα λίτρα αίμα έχει ένας ενήλικας;', 5, 'Σώμα'),
  buildNumericQuestion('Πόσες φορές χτυπά η καρδιά σε ένα λεπτό ηρεμίας;', 70, 'Σώμα'),
  buildNumericQuestion('Πόσα οστά έχει το ανθρώπινο κρανίο;', 22, 'Σώμα'),
  buildNumericQuestion('Πόσες καρδιές έχει το χταπόδι;', 3, 'Ζώα'),
  buildNumericQuestion('Πόσα δόντια έχει ένας ενήλικος σκύλος;', 42, 'Ζώα'),
  buildNumericQuestion('Πόσους σπονδύλους έχει ο λαιμός της καμηλοπάρδαλης;', 7, 'Ζώα'),
  buildNumericQuestion('Πόσες μέρες κρατά η κύηση του ελέφαντα;', 645, 'Ζώα'),
  buildNumericQuestion('Πόσα χρόνια ζει μια χελώνα των Γαλαπάγκος;', 150, 'Ζώα'),
  buildNumericQuestion('Πόσα μάτια έχει η μέλισσα;', 5, 'Ζώα'),
  buildNumericQuestion('Πόσα πλοκάμια έχει το καλαμάρι;', 10, 'Ζώα'),
  buildNumericQuestion('Πόσοι πλανήτες υπάρχουν στο ηλιακό σύστημα;', 8, 'Διάστημα'),
  buildNumericQuestion('Πόσα δευτερόλεπτα κάνει το φως να φτάσει από τον Ήλιο στη Γη;', 499, 'Διάστημα'),
  buildNumericQuestion('Πόσες μέρες κάνει ο Άρης να κάνει τον γύρο του Ήλιου;', 687, 'Διάστημα'),
  buildNumericQuestion('Πόσα χρόνια κάνει ο Ποσειδώνας να κάνει τον γύρο του Ήλιου;', 165, 'Διάστημα'),
  buildNumericQuestion('Πόσες μέρες κάνει η Σελήνη να κάνει τον γύρο της Γης;', 27, 'Διάστημα'),
  buildNumericQuestion('Πόσα φεγγάρια έχει ο Άρης;', 2, 'Διάστημα'),
  buildNumericQuestion('Πόσες ζώνες ώρας έχει ο πλανήτης;', 24, 'Γεωγραφία'),
  buildNumericQuestion('Πόσα στοιχεία έχει ο περιοδικός πίνακας;', 118, 'Επιστήμη'),
  buildNumericQuestion('Πόσες μοίρες έχουν μαζί οι γωνίες ενός τριγώνου;', 180, 'Επιστήμη'),
  buildNumericQuestion('Πόσα χρώματα έχει το ουράνιο τόξο;', 7, 'Επιστήμη'),
  buildNumericQuestion('Στους πόσους βαθμούς Κελσίου βράζει το νερό στο επίπεδο της θάλασσας;', 100, 'Επιστήμη'),
  buildNumericQuestion('Πόσα πλήκτρα έχει ένα πιάνο;', 88, 'Μουσική'),
  buildNumericQuestion('Πόσα τετράγωνα έχει η σκακιέρα;', 64, 'Παιχνίδια'),
  buildNumericQuestion('Πόσα πιόνια και κομμάτια έχει το σκάκι στην αρχή;', 32, 'Παιχνίδια'),
  buildNumericQuestion('Πόσα φύλλα έχει μια τράπουλα με τους τζόκερ;', 54, 'Παιχνίδια'),
  buildNumericQuestion('Πόσες χορδές έχει το βιολί;', 4, 'Μουσική'),
  buildNumericQuestion('Πόσα χιλιόμετρα είναι ο μαραθώνιος;', 42, 'Αθλητισμός'),
];
