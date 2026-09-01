// The numeric-estimate mechanic (Task 65) - deliberately mode-agnostic. This
// file knows nothing about GameMode, Room.mode, phases, sockets or timers:
// maxForAnswer, the scoring function and the payload builders all just turn
// primitives into other primitives. modes/numeric.ts is the only file that
// knows this is currently running as its own standalone mode; when Task 66
// folds numeric estimate into the quiz as a stage, that shell is what gets
// rewritten - this file should not have to change at all.
import { NUMERIC_ROUND_VALUES, sliderStepForMax, type PlayerStanding } from '@game/shared';
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

// sliderStepForMax now lives in shared (see its own comment) - Task 68 found
// the /dev/numeric review tool keeping its own copy of the OLD formula,
// which had gone stale the moment this one grew a floor/round.

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

// Ranked by absolute distance from the answer (closest first) via
// computeCompetitionRanks - the SAME ranking function every other mode uses,
// just fed a negated distance so "smaller is better" sorts like "bigger
// score is better" does everywhere else. A non-submitter scores a flat 0 and
// is EXCLUDED from the ranking entirely (Task 133) - N is the count of
// SUBMITTERS, not of players, so one silent bot no longer drags a genuine
// last place up to the 25% floor, and doesn't inflate N==1 into a "you beat
// someone" situation for a lone submitter either.
export function scoreNumericSubmissions(
  submissions: readonly NumericSubmission[],
  answer: number,
  max: number,
): NumericScoreResult[] {
  const submitted = submissions.filter(
    (submission): submission is NumericSubmission & { value: number } => submission.value !== null,
  );
  const n = submitted.length;
  const withDistance = submitted.map((submission) => ({
    ...submission,
    distance: Math.abs(submission.value - answer),
  }));
  const ranks = computeCompetitionRanks(
    withDistance,
    (item) => -item.distance,
    (item) => item.playerId,
  );

  const scored = withDistance.map((item) => {
    const rank = ranks.get(item.playerId) ?? n;
    // base = round(400 * (0.25 + 0.75 * (N - rank) / (N - 1))) - last place
    // always gets a flat 25% of max, at any N. N<=1 is the edge case: N-1
    // would divide by zero, and the spec calls it out explicitly as 400.
    const base = n <= 1 ? 400 : Math.round(400 * (0.25 + (0.75 * (n - rank)) / (n - 1)));
    const exact = item.value === answer;
    // Task 68 - the +100 exact bonus is withheld at max<=50 (agree with the
    // brief, not just deferring to it): at 21-51 whole-number positions,
    // landing exactly stops measuring estimation and starts measuring
    // whether you already knew the fact cold - a different thing from what
    // this mode is for. `exact` itself stays a plain fact either way (the
    // UI's gold-ring/"nailed it" feedback is harmless and still earned),
    // only the POINTS are gated.
    const exactBonus = exact && max > 50 ? 100 : 0;
    return { ...item, rank, exact, pointsAwarded: base + exactBonus };
  });

  // Non-submitters: flat 0, rank placed just past the last real rank (never
  // competes for it), distance kept at max+1 for any display code still
  // treating a large distance as "didn't get close".
  const nonSubmitted = submissions
    .filter((submission) => submission.value === null)
    .map((submission) => ({
      ...submission,
      distance: max + 1,
      rank: n + 1,
      exact: false,
      pointsAwarded: 0,
    }));

  return [...scored, ...nonSubmitted];
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

// Task 68 - the reviewed pool: 42 questions kept via /dev/numeric's Keep/Cut
// out of the 49 Task 67 loaded (7 cut). Nothing here is time-sensitive
// (populations, prices, records, "how many exist today") on purpose - those
// go stale.
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
  buildNumericQuestion('Πόσα δόντια έχει ένας ενήλικος σκύλος;', 42, 'Ζώα'),
  buildNumericQuestion('Πόσους σπονδύλους έχει ο λαιμός της καμηλοπάρδαλης;', 7, 'Ζώα'),
  buildNumericQuestion('Πόσες μέρες κρατά η κύηση του ελέφαντα;', 645, 'Ζώα'),
  buildNumericQuestion('Πόσα χρόνια ζει μια χελώνα των Γαλαπάγκος;', 150, 'Ζώα'),
  buildNumericQuestion('Πόσα μάτια έχει η μέλισσα;', 5, 'Ζώα'),
  buildNumericQuestion('Πόσοι πλανήτες υπάρχουν στο ηλιακό σύστημα;', 8, 'Διάστημα'),
  buildNumericQuestion('Πόσα δευτερόλεπτα κάνει το φως να φτάσει από τον Ήλιο στη Γη;', 499, 'Διάστημα'),
  buildNumericQuestion('Πόσες μέρες κάνει ο Άρης να κάνει τον γύρο του Ήλιου;', 687, 'Διάστημα'),
  buildNumericQuestion('Πόσα χρόνια κάνει ο Ποσειδώνας να κάνει τον γύρο του Ήλιου;', 165, 'Διάστημα'),
  buildNumericQuestion('Πόσες μέρες κάνει η Σελήνη να κάνει τον γύρο της Γης;', 27, 'Διάστημα'),
  buildNumericQuestion('Πόσα στοιχεία έχει ο περιοδικός πίνακας;', 118, 'Επιστήμη'),
  buildNumericQuestion('Πόσες μοίρες έχουν μαζί οι γωνίες ενός τριγώνου;', 180, 'Επιστήμη'),
  buildNumericQuestion('Στους πόσους βαθμούς Κελσίου βράζει το νερό στο επίπεδο της θάλασσας;', 100, 'Επιστήμη'),
  buildNumericQuestion('Πόσα πλήκτρα έχει ένα πιάνο;', 88, 'Μουσική'),
  buildNumericQuestion('Πόσα τετράγωνα έχει η σκακιέρα;', 64, 'Παιχνίδια'),
  buildNumericQuestion('Πόσα πιόνια και κομμάτια έχει το σκάκι στην αρχή;', 32, 'Παιχνίδια'),
  buildNumericQuestion('Πόσες χορδές έχει το βιολί;', 4, 'Μουσική'),
  buildNumericQuestion('Πόσα χιλιόμετρα είναι ο μαραθώνιος;', 42, 'Αθλητισμός'),
];
