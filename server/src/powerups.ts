import { POWER_UP_EFFECTS, type PowerUpEffect } from '@game/shared';
import { addAppliedSabotage } from './sabotage.js';
import type { Room } from './state.js';

// Never trust the client: an effect only counts if it's verbatim one of the
// two the POWER_UP phase offers. 'shuffle' is not choosable here, so a phone
// naming it is rejected like any other garbage.
export function isPowerUpEffect(value: unknown): value is PowerUpEffect {
  return typeof value === 'string' && (POWER_UP_EFFECTS as readonly string[]).includes(value);
}

// Lands every choice made during POWER_UP at the exact moment the question
// that phase preceded begins. CONSUMING is the point: every entry is moved
// out of pendingPowerUpByTarget so it can never fire twice.
//
// Deliberately goes through addAppliedSabotage rather than writing a parallel
// map: from the instant it lands, a power-up IS just an effect running against
// a player, so it gets the stacking rules (Task 31a), the question-time clamp,
// and every existing reader (activeSabotagesFor, isIced, the victim's
// `yourSabotages`, the pause-aware remaining-time maths) unchanged.
//
// MUST be called AFTER resetSabotageForNewQuestion, which clears
// activeSabotageByTarget and would otherwise wipe what this just wrote.
export function applyPendingPowerUps(room: Room): void {
  if (room.pendingPowerUpByTarget.size === 0) {
    return;
  }

  for (const [targetPlayerId, choices] of room.pendingPowerUpByTarget) {
    // Every chooser who aimed here lands - in stage 2 the whole room chooses
    // each round, so this list is routinely several deep and stacking it is
    // the entire point.
    for (const choice of choices) {
      addAppliedSabotage(room, targetPlayerId, choice.effect);
      console.log(
        `room ${room.code} power-up '${choice.effect}' from ${choice.casterName} landed on ${choice.targetName} ` +
          `at ${room.questionStartedAt} (question ${room.currentQuestionIndex + 1})`,
      );
    }
    console.log(
      `room ${room.code} stack on ${targetPlayerId}: ` +
        `${JSON.stringify(room.activeSabotageByTarget.get(targetPlayerId) ?? [])}`,
    );
  }
  room.pendingPowerUpByTarget.clear();
}
