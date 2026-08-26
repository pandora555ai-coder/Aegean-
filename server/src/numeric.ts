// The numeric-estimate mechanic (Task 65) - deliberately mode-agnostic. This
// file knows nothing about GameMode, Room.mode, phases, sockets or timers:
// maxForAnswer, the scoring function and the payload builders all just turn
// primitives into other primitives. modes/numeric.ts is the only file that
// knows this is currently running as its own standalone mode; when Task 66
// folds numeric estimate into the quiz as a stage, that shell is what gets
// rewritten - this file should not have to change at all.
import type { PlayerStanding } from '@game/shared';
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
// itself qualifies ("at least", not "strictly above").
const NUMERIC_ROUND_VALUES = [20, 50, 100, 200, 500, 1000, 2000, 5000] as const;

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

// Five placeholder questions (Task 65) so the mode can run end to end - real
// content comes later. Greek, matching the quiz question bank's style.
export const NUMERIC_QUESTIONS: readonly NumericQuestion[] = [
  buildNumericQuestion('Πόσα μέτρα ύψος έχει ο βράχος της Ακρόπολης;', 156, 'Ελλάδα'),
  buildNumericQuestion('Πόσα χιλιόμετρα μήκος έχει η Εγνατία Οδός;', 670, 'Ελλάδα'),
  buildNumericQuestion('Ποιο έτος έγιναν οι πρώτοι σύγχρονοι Ολυμπιακοί Αγώνες;', 1896, 'Ιστορία'),
  buildNumericQuestion('Πόσα κατοικημένα νησιά έχει η Ελλάδα;', 227, 'Ελλάδα'),
  buildNumericQuestion('Πόσα χιλιόμετρα μήκος έχει η Κρήτη;', 260, 'Ελλάδα'),
];
