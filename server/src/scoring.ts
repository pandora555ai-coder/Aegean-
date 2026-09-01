import { BASE_POINTS, SPEED_BONUS_MAX, STEAL_MAX_AMOUNT, STEAL_MIN_AMOUNT } from '@game/shared';

export function calculatePoints(correct: boolean, timeMs: number, questionTimeMs: number): number {
  if (!correct) {
    return 0;
  }

  const speedBonus = Math.max(0, Math.round(SPEED_BONUS_MAX * (1 - timeMs / questionTimeMs)));
  return BASE_POINTS + speedBonus;
}

// The shape every "one player's round" result shares, whether it came from a
// quiz question (RevealPlayerResult) or a trial one (TrialRevealResult) -
// which is all sortAndRankResults below needs to know about either.
export interface RankableResult {
  correct: boolean;
  timeMs: number | null;
  answerRank: number | null;
}

// Sorts `results` IN PLACE: correct answers first (fastest first), then
// wrong answers, then players who didn't answer at all go last. With 7
// players in a room, insertion (join) order reads as completely random -
// this is the order the reveal is actually meant to be read in. Also
// fills in each result's `answerRank`: the 1-based position among CORRECT
// answers only, by speed - left null for wrong/no-answer.
// Moved here from phases.ts in Task 127 (unchanged but for its type, which
// widened from RevealPlayerResult to the structural shape above): the trial
// reveal ranks lock-ins by exactly the same rule, and "earliest correct
// lock-in wins" in sudden death IS answerRank === 1.
export function sortAndRankResults(results: RankableResult[]): void {
  results.sort((a, b) => {
    const aAnswered = a.timeMs !== null;
    const bAnswered = b.timeMs !== null;
    if (aAnswered !== bAnswered) {
      return aAnswered ? -1 : 1; // answered before non-answerers
    }
    if (!aAnswered) {
      return 0; // both non-answerers - relative order doesn't matter
    }
    if (a.correct !== b.correct) {
      return a.correct ? -1 : 1; // correct before incorrect
    }
    return (a.timeMs as number) - (b.timeMs as number); // faster first
  });

  let rank = 0;
  for (const result of results) {
    if (result.correct) {
      rank += 1;
      result.answerRank = rank;
    }
  }
}

// Steal (Task 32) - what the fastest correct answerer has EARNED the right to
// take, scaled linearly by their answer speed between STEAL_MIN_AMOUNT (right
// on the buzzer) and STEAL_MAX_AMOUNT (instant). This is the attempt only:
// what actually moves is clamped to the victim's score at resolution time.
export function calculateStealAmount(timeMs: number, questionTimeMs: number): number {
  const fraction = Math.min(1, Math.max(0, timeMs / questionTimeMs));
  return Math.round(STEAL_MAX_AMOUNT - (STEAL_MAX_AMOUNT - STEAL_MIN_AMOUNT) * fraction);
}
