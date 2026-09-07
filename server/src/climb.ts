import { CLIMB_TOP, type ClimbRevealResult } from '@game/shared';
import { sortAndRankResults } from './scoring.js';

// Climb finale mechanic (Task 187) - a prototype replacement for the trial
// (trial.ts): a race up a ladder of CLIMB_TOP steps instead of a life
// drain. Same purity discipline as trial.ts: no Room, no io, no timers -
// everything here is arithmetic over plain data. NOT wired into the live
// game; this is validated only through the dev Monte Carlo harness
// (server/scripts/trial-montecarlo.ts's `--finale climb`).
//
// The one rule the round-scoring half of this file exists to serve:
//   stepAfter = max(0, stepBefore + delta)
//   delta = +2 (the round's single fastest correct lock-in, answerRank 1)
//         | +1 (any other correct lock-in)
//         | -1 (a wrong lock-in)
//         | -2 (no lock-in at all)
// Nobody exits at 0 - falling behind is the punishment, not elimination.

// One player's lock-in on a climb round, as the round hands it over.
export interface ClimbRoundEntry {
  playerId: string;
  name: string;
  avatarId: string;
  stepBefore: number;
  choice: number | null; // null = never locked in
  elapsedMs: number | null; // pause-aware elapsed at lock-in; null exactly when choice is null
}

// Scores one climb round: correct-by-speed ranking is IDENTICAL to the quiz
// and trial reveals (sortAndRankResults), so "the round's fastest correct"
// is exactly answerRank === 1 - never a separate buzzer/tiebreak of its own.
export function applyClimbRound(entries: ClimbRoundEntry[], correctIndex: number): ClimbRevealResult[] {
  const results: ClimbRevealResult[] = entries.map((entry) => {
    const correct = entry.choice !== null && entry.choice === correctIndex;
    return {
      playerId: entry.playerId,
      name: entry.name,
      avatarId: entry.avatarId,
      choice: entry.choice,
      correct,
      timeMs: entry.elapsedMs,
      answerRank: null, // filled in by sortAndRankResults below
      stepBefore: entry.stepBefore,
      delta: 0, // filled in below, once answerRank is known
      stepAfter: entry.stepBefore, // filled in below
    };
  });

  sortAndRankResults(results);

  for (const result of results) {
    const delta = result.answerRank === 1 ? 2 : result.correct ? 1 : result.choice === null ? -2 : -1;
    result.delta = delta;
    result.stepAfter = Math.max(0, result.stepBefore + delta);
  }

  return results;
}

// What the (not-yet-built) phase machine must do next, decided from one
// scored round. Exhaustive by construction.
export type ClimbNext =
  | { kind: 'WINNER'; winnerPlayerId: string } // exactly one player reached the top this reveal
  | { kind: 'DUEL'; playerIds: [string, string] } // two (or the two fastest of 3+) reached together
  | { kind: 'CONTINUE' }; // nobody reached CLIMB_TOP yet

// A player can only newly cross CLIMB_TOP via a POSITIVE delta (a correct
// lock-in), so every arrival this reveal has a real answerRank to sort by -
// there is no "wrong answer arrived at the top" case to handle.
export function nextAfterClimbRound(results: ClimbRevealResult[]): ClimbNext {
  const arrivals = results.filter((result) => result.stepAfter >= CLIMB_TOP);
  if (arrivals.length === 0) {
    return { kind: 'CONTINUE' };
  }
  if (arrivals.length === 1) {
    return { kind: 'WINNER', winnerPlayerId: arrivals[0].playerId };
  }
  // Two or more arrived in the same reveal: the two fastest lock-ins duel
  // for the temple. Anyone past the top two is held one step below it -
  // still very much alive, not eliminated; they simply weren't fast enough
  // to be one of the two who settle it.
  const sorted = [...arrivals].sort((a, b) => (a.answerRank ?? Infinity) - (b.answerRank ?? Infinity));
  for (const held of sorted.slice(2)) {
    held.stepAfter = CLIMB_TOP - 1;
  }
  return { kind: 'DUEL', playerIds: [sorted[0].playerId, sorted[1].playerId] };
}

// The duel itself (rock-paper-scissors, best-of-N, whatever it becomes) is
// explicitly NOT this task - only what happens once it resolves: the winner
// takes the temple. Validates the winner really was one of the two
// duelists; returns their id for the caller to record as the game's winner.
export function applyClimbDuelResult(duelPlayerIds: readonly [string, string], winnerPlayerId: string): string {
  if (winnerPlayerId !== duelPlayerIds[0] && winnerPlayerId !== duelPlayerIds[1]) {
    throw new Error(`climb duel winner ${winnerPlayerId} was not one of the duelists ${duelPlayerIds.join(', ')}`);
  }
  return winnerPlayerId;
}
