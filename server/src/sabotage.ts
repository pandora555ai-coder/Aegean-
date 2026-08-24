import {
  MAX_ICE_STACK_MS,
  MAX_INK_INTENSITY,
  SABOTAGE_EFFECT_DURATION_MS,
  type ActiveSabotage,
  type SabotageEffect,
} from '@game/shared';
import type { AppliedSabotage, Room } from './state.js';
import { remainingActiveTimerMs } from './timers.js';

// The options THIS player should be sent, in THIS player's order - the
// canonical list untouched for everyone who isn't currently shuffled. The TV
// never goes through here, so it always shows canonical order.
export function optionsForPlayer(room: Room, playerId: string, options: string[]): string[] {
  const permutation = room.shuffledOptionsByTarget.get(playerId);
  if (!permutation || permutation.length !== options.length) {
    return options;
  }
  return permutation.map((canonicalIndex) => options[canonicalIndex]);
}

// Victim's slot number -> the real option they actually pressed. Everything
// past the socket handler (scoring, reveal, answer counts) speaks canonical
// indices only, so this de-permute happens once, at the edge, on submit.
export function toCanonicalChoice(room: Room, playerId: string, displayChoice: number): number {
  const permutation = room.shuffledOptionsByTarget.get(playerId);
  if (!permutation || displayChoice < 0 || displayChoice >= permutation.length) {
    return displayChoice;
  }
  return permutation[displayChoice];
}

// The inverse, needed in exactly one place: a mid-question state:sync echoing
// an already-recorded answer back to the victim, which has to name the slot
// THEY pressed, not the canonical index it was stored as.
export function toDisplayChoice(room: Room, playerId: string, canonicalChoice: number): number {
  const permutation = room.shuffledOptionsByTarget.get(playerId);
  if (!permutation) {
    return canonicalChoice;
  }
  const displayChoice = permutation.indexOf(canonicalChoice);
  return displayChoice === -1 ? canonicalChoice : displayChoice;
}

// Folds ONE landed effect into `targetPlayerId`'s stack for the question
// that is just starting - the single place any effect ever becomes active.
// Currently only reached via the POWER_UP path (applyPendingPowerUps).
// Stacking rules (Task 31a) live here and nowhere else:
//   ice     - stacks in DURATION, capped at MAX_ICE_STACK_MS; the excess is
//             discarded rather than queued for later.
//   ink     - stacks in INTENSITY (capped at MAX_INK_INTENSITY), never in
//             duration: the same window, harder to read through.
//   shuffle - stacks as neither; there is one option order per question.
// Every duration is clamped to the room's question time first, so no stack
// can ever outlive - let alone extend - the round it landed in. Must be
// called AFTER startQuestion has set questionStartedAt and armed the QUESTION
// timer, since both are read here.
export function addAppliedSabotage(room: Room, targetPlayerId: string, effect: SabotageEffect): void {
  const questionTimeMs = room.settings.questionTimeMs;
  const durationMs = Math.min(SABOTAGE_EFFECT_DURATION_MS[effect], questionTimeMs);
  // A zero-length effect is still consumed by the caller - it just never
  // becomes active, and must not occupy a slot in the stack.
  if (durationMs <= 0) {
    return;
  }

  const stack = room.activeSabotageByTarget.get(targetPlayerId) ?? [];
  const existing = stack.find((applied) => applied.effect === effect);
  if (!existing) {
    const applied: AppliedSabotage = {
      effect,
      startedAt: room.questionStartedAt,
      durationMs,
      intensity: 1,
      questionTimeMs,
    };
    stack.push(applied);
    room.activeSabotageByTarget.set(targetPlayerId, stack);
    return;
  }

  if (effect === 'ice') {
    existing.durationMs = Math.min(existing.durationMs + durationMs, MAX_ICE_STACK_MS, questionTimeMs);
  } else if (effect === 'ink') {
    existing.intensity = Math.min(existing.intensity + 1, MAX_INK_INTENSITY);
  }
}

// Wipes what was running/ordered for the question that just ended, so the
// question about to start rebuilds both from scratch. Must run BEFORE
// applyPendingPowerUps, which is what repopulates activeSabotageByTarget for
// the new question.
export function resetSabotageForNewQuestion(room: Room): void {
  room.activeSabotageByTarget.clear();
  // Belt and braces - REVEAL already clears this, but the first question of a
  // game never had one, and no question may ever inherit an older order.
  room.shuffledOptionsByTarget.clear();
}

// Everything running against `playerId` this instant - one entry per effect,
// already stacked, with the effects that have run out dropped. Remaining time
// is derived from the SHARED timer helper rather than a raw Date.now() delta:
// remainingActiveTimerMs is frozen while the room is paused and resumes at
// exactly its leftover, so an effect inherits that freeze for free and a
// pause can neither shorten nor extend it - a STACKED effect included, since
// stacking only ever changed `durationMs`/`intensity`, never how remaining
// time is computed. That also makes this safe to call repeatedly - a
// reconnecting victim gets the time still left, never a fresh full duration.
export function activeSabotagesFor(room: Room, playerId: string): ActiveSabotage[] {
  const stack = room.activeSabotageByTarget.get(playerId);
  if (!stack || room.phase !== 'QUESTION' || room.activeTimer?.kind !== 'QUESTION') {
    return [];
  }
  const active: ActiveSabotage[] = [];
  for (const applied of stack) {
    const elapsedMs = applied.questionTimeMs - remainingActiveTimerMs(room);
    const remainingMs = Math.max(0, applied.durationMs - elapsedMs);
    if (remainingMs > 0) {
      active.push({
        effect: applied.effect,
        durationMs: applied.durationMs,
        remainingMs,
        intensity: applied.intensity,
      });
    }
  }
  return active;
}

// True while `playerId` is frozen out of answering. The client disables its
// own buttons too, but this is the authority - a phone that ignores the
// freeze still can't get an answer recorded.
export function isIced(room: Room, playerId: string): boolean {
  return activeSabotagesFor(room, playerId).some((sabotage) => sabotage.effect === 'ice');
}
