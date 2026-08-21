import { type SabotageEffect } from '@game/shared';
import type { Room } from './state.js';

// Weakest to strongest. Effects themselves aren't implemented yet (28b/28c) -
// this ordering is what "comeback weighting" below hands out.
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
