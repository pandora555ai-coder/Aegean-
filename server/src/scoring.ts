import { BASE_POINTS, SPEED_BONUS_MAX, STEAL_MAX_AMOUNT, STEAL_MIN_AMOUNT } from '@game/shared';

export function calculatePoints(correct: boolean, timeMs: number, questionTimeMs: number): number {
  if (!correct) {
    return 0;
  }

  const speedBonus = Math.max(0, Math.round(SPEED_BONUS_MAX * (1 - timeMs / questionTimeMs)));
  return BASE_POINTS + speedBonus;
}

// Steal (Task 32) - what the fastest correct answerer has EARNED the right to
// take, scaled linearly by their answer speed between STEAL_MIN_AMOUNT (right
// on the buzzer) and STEAL_MAX_AMOUNT (instant). This is the attempt only:
// what actually moves is clamped to the victim's score at resolution time.
export function calculateStealAmount(timeMs: number, questionTimeMs: number): number {
  const fraction = Math.min(1, Math.max(0, timeMs / questionTimeMs));
  return Math.round(STEAL_MAX_AMOUNT - (STEAL_MAX_AMOUNT - STEAL_MIN_AMOUNT) * fraction);
}
