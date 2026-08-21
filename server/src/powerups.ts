import { POWER_UP_EFFECTS, SABOTAGE_EFFECT_DURATION_MS, type PowerUpEffect } from '@game/shared';
import type { Room } from './state.js';

// Never trust the client: an effect only counts if it's verbatim one of the
// two the POWER_UP phase offers. 'shuffle' is a Task 28a effect and is NOT
// choosable here, so a phone naming it is rejected like any other garbage.
export function isPowerUpEffect(value: unknown): value is PowerUpEffect {
  return typeof value === 'string' && (POWER_UP_EFFECTS as readonly string[]).includes(value);
}

// Lands every choice made during POWER_UP at the exact moment the question
// that phase preceded begins. CONSUMING is the point, same discipline as
// applyPendingSabotage: each entry is moved out of pendingPowerUpByTarget so
// it can never fire twice.
//
// Deliberately writes into activeSabotageByTarget rather than a parallel map:
// from the instant it lands, a power-up IS just an effect running against a
// player, and every existing reader (activeSabotageFor, isIced, the victim's
// `yourSabotage`, the pause-aware remaining-time maths) then works unchanged.
//
// MUST be called AFTER applyPendingSabotage, which clears that map and would
// otherwise wipe what this just wrote. If a Task 28a sabotage and a power-up
// happen to target the same player for the same question, the power-up - the
// deliberate, player-made choice - is the one that lands.
//
// Durations are clamped to the room's question time exactly like a sabotage,
// so a power-up can only eat into a round, never extend one.
export function applyPendingPowerUps(room: Room): void {
  if (room.pendingPowerUpByTarget.size === 0) {
    return;
  }

  const questionTimeMs = room.settings.questionTimeMs;
  for (const [targetPlayerId, choice] of room.pendingPowerUpByTarget) {
    const durationMs = Math.min(SABOTAGE_EFFECT_DURATION_MS[choice.effect], questionTimeMs);
    // A zero-length effect is still consumed - it just never becomes active.
    if (durationMs > 0) {
      room.activeSabotageByTarget.set(targetPlayerId, {
        effect: choice.effect,
        startedAt: room.questionStartedAt,
        durationMs,
        questionTimeMs,
      });
    }
    console.log(
      `room ${room.code} power-up '${choice.effect}' from ${choice.casterName} landed on ${choice.targetName} ` +
        `at ${room.questionStartedAt} for ${durationMs}ms (question ${room.currentQuestionIndex + 1})`,
    );
  }
  room.pendingPowerUpByTarget.clear();
}
