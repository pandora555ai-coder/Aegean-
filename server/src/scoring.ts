import { BASE_POINTS, SPEED_BONUS_MAX } from '@game/shared';

export function calculatePoints(correct: boolean, timeMs: number, questionTimeMs: number): number {
  if (!correct) {
    return 0;
  }

  const speedBonus = Math.max(0, Math.round(SPEED_BONUS_MAX * (1 - timeMs / questionTimeMs)));
  return BASE_POINTS + speedBonus;
}
