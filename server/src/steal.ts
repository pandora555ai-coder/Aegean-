import { type StealResolvedPayload } from '@game/shared';
import { calculateStealAmount } from './scoring.js';
import type { Room, StealState } from './state.js';

// Who, if anyone, gets to steal after the question that just revealed
// (Task 32). The thief is the fastest CORRECT answerer - which endQuestion has
// already computed and frozen into lastReveal.results as answerRank === 1, so
// this never re-derives (or re-orders) anything.
//
// Returns null - i.e. the phase is skipped entirely - when nobody answered
// correctly, when the would-be thief has since disconnected (there is no
// phone left to show the picker on), or when there is nobody else connected
// to steal FROM. Every one of those is a normal, non-exceptional round.
export function buildStealState(room: Room): StealState | null {
  const fastest = room.lastReveal?.results.find((result) => result.answerRank === 1);
  if (!fastest || fastest.timeMs === null) {
    return null;
  }

  const thief = room.players.get(fastest.playerId);
  if (!thief || !thief.connected) {
    return null;
  }

  const hasSomeoneToRob = [...room.players.values()].some(
    (player) => player.connected && player.playerId !== thief.playerId,
  );
  if (!hasSomeoneToRob) {
    return null;
  }

  return {
    thiefPlayerId: thief.playerId,
    thiefName: thief.name,
    thiefAvatarId: thief.avatarId,
    amount: calculateStealAmount(fastest.timeMs, room.settings.questionTimeMs),
    chosenTargetPlayerId: null,
    resolved: null,
  };
}

// Moves the points, ONCE - the caller (resolveSteal in phases.ts) guarantees
// that by only ever calling this while `room.steal.resolved` is still null.
// `victimPlayerId` is null when the thief let the clock run out: the phase
// still resolves, it just resolves to nothing being taken.
//
// The clamp is the whole rule: what actually moves is min(amount, what the
// victim currently HAS), so nobody is ever pushed below zero and the thief
// gains exactly what was removed - never the nominal amount.
export function applySteal(room: Room, steal: StealState, victimPlayerId: string | null): StealResolvedPayload {
  const thief = room.players.get(steal.thiefPlayerId);
  const victim = victimPlayerId !== null ? room.players.get(victimPlayerId) : undefined;

  let stolenAmount = 0;
  if (thief && victim) {
    stolenAmount = Math.min(steal.amount, Math.max(0, victim.score));
    victim.score -= stolenAmount;
    thief.score += stolenAmount;
  }

  return {
    thiefPlayerId: steal.thiefPlayerId,
    thiefName: steal.thiefName,
    thiefAvatarId: steal.thiefAvatarId,
    victimPlayerId: victim ? victim.playerId : null,
    victimName: victim ? victim.name : null,
    victimAvatarId: victim ? victim.avatarId : null,
    attemptedAmount: steal.amount,
    stolenAmount,
    thiefScore: thief ? thief.score : 0,
    victimScore: victim ? victim.score : null,
  };
}
