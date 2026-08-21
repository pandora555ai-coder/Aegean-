import { SABOTAGE_EFFECT_DURATION_MS, type ActiveSabotage, type SabotageEffect } from '@game/shared';
import type { Room } from './state.js';
import { remainingActiveTimerMs } from './timers.js';

// Weakest to strongest - the ordering "comeback weighting" below hands out.
// 'shuffle' has no implementation yet (28c); it still gets cast and still
// gets consumed, it simply does nothing when it lands.
const EFFECTS_WEAKEST_TO_STRONGEST: readonly SabotageEffect[] = ['shuffle', 'ink', 'ice'];

// Competition ranking (ties share a rank) among every player currently in
// the room, same convention as the scoreboard - 1 = current leader.
function computeCasterRank(room: Room, casterPlayerId: string): { rank: number; totalPlayers: number } {
  const players = Array.from(room.players.values());
  const casterScore = room.players.get(casterPlayerId)?.score ?? 0;
  const rank = 1 + players.filter((player) => player.score > casterScore).length;
  return { rank, totalPlayers: players.length };
}

// The higher the caster's rank (closer to 1st), the weaker the effect they
// get handed - a leader casting is deliberately given the worst version of
// the weapon, someone near last place gets the best one. Pure comeback
// mechanic: falling behind makes sabotage MORE useful, never less.
export function pickSabotageEffect(room: Room, casterPlayerId: string): SabotageEffect {
  const { rank, totalPlayers } = computeCasterRank(room, casterPlayerId);
  const tierCount = EFFECTS_WEAKEST_TO_STRONGEST.length;
  const tier =
    totalPlayers <= 1 ? 0 : Math.min(tierCount - 1, Math.floor(((rank - 1) / totalPlayers) * tierCount));
  return EFFECTS_WEAKEST_TO_STRONGEST[tier];
}

// Lands every sabotage that was announced at the previous REVEAL, at the
// exact moment its victim's next question begins. CONSUMING is the point:
// each pending entry is moved out of pendingSabotageByTarget (so it can
// never fire twice) into activeSabotageByTarget, stamped with the question's
// own start time. Must be called AFTER startQuestion has set
// questionStartedAt and armed the QUESTION timer, since both are read here.
//
// Durations are clamped to the room's question time, so a sabotage can only
// ever eat into a round, never extend one - an 8s ink in a 10s round is 8s,
// the same ink in a 5s round is 5s and ends exactly with the question.
export function applyPendingSabotage(room: Room): void {
  room.activeSabotageByTarget.clear();
  if (room.pendingSabotageByTarget.size === 0) {
    return;
  }

  const questionTimeMs = room.settings.questionTimeMs;
  for (const [targetPlayerId, cast] of room.pendingSabotageByTarget) {
    const durationMs = Math.min(SABOTAGE_EFFECT_DURATION_MS[cast.effect], questionTimeMs);
    // A zero-length effect (today: every 'shuffle', since 28c hasn't built
    // it) is still consumed - it just never becomes active.
    if (durationMs > 0) {
      room.activeSabotageByTarget.set(targetPlayerId, {
        effect: cast.effect,
        startedAt: room.questionStartedAt,
        durationMs,
        questionTimeMs,
      });
    }
    console.log(
      `room ${room.code} sabotage '${cast.effect}' from ${cast.casterName} landed on ${cast.targetName} ` +
        `at ${room.questionStartedAt} for ${durationMs}ms (question ${room.currentQuestionIndex + 1})`,
    );
  }
  room.pendingSabotageByTarget.clear();
}

// What is running against `playerId` this instant, or null. Remaining time is
// derived from the SHARED timer helper rather than a raw Date.now() delta:
// remainingActiveTimerMs is frozen while the room is paused and resumes at
// exactly its leftover, so an effect inherits that freeze for free and a
// pause can neither shorten nor extend it. That also makes this safe to call
// repeatedly - a reconnecting victim gets the time still left, never a fresh
// full duration.
export function activeSabotageFor(room: Room, playerId: string): ActiveSabotage | null {
  const applied = room.activeSabotageByTarget.get(playerId);
  if (!applied || room.phase !== 'QUESTION' || room.activeTimer?.kind !== 'QUESTION') {
    return null;
  }
  const elapsedMs = applied.questionTimeMs - remainingActiveTimerMs(room);
  const remainingMs = Math.max(0, applied.durationMs - elapsedMs);
  if (remainingMs === 0) {
    return null;
  }
  return { effect: applied.effect, durationMs: applied.durationMs, remainingMs };
}

// True while `playerId` is frozen out of answering. The client disables its
// own buttons too, but this is the authority - a phone that ignores the
// freeze still can't get an answer recorded.
export function isIced(room: Room, playerId: string): boolean {
  return activeSabotageFor(room, playerId)?.effect === 'ice';
}
