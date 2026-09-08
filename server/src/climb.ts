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
  return pickDuelists(arrivals, CLIMB_TOP);
}

// Task 188b - THE one tie-break, shared by the two-arrival reveal above and
// the round cap below: of everyone standing on the contested step, the two
// fastest by the final round's answerRank duel for the temple (a null rank -
// no correct lock-in that round - sorts last; equal ranks keep the given
// order, i.e. join order). Anyone past the top two is held one step below
// the contested step IN PLACE (stepAfter is rewritten) - still very much
// alive, not eliminated; they simply weren't fast enough to be one of the
// two who settle it.
function pickDuelists(occupants: ClimbRevealResult[], contestedStep: number): Extract<ClimbNext, { kind: 'DUEL' }> {
  const sorted = [...occupants].sort((a, b) => (a.answerRank ?? Infinity) - (b.answerRank ?? Infinity));
  for (const held of sorted.slice(2)) {
    // Floored like every step (188c: a cap-tie at step 0 wrote -1 here).
    held.stepAfter = Math.max(0, contestedStep - 1);
  }
  return { kind: 'DUEL', playerIds: [sorted[0].playerId, sorted[1].playerId] };
}

// Task 188b - the verdict at the round cap (CLIMB_MAX_ROUNDS), or at pool
// exhaustion, the second guard: the highest step wins outright; a shared
// highest step is settled by pickDuelists over its occupants, using the
// FINAL round's results (the same rows the last reveal scored, so held
// occupants are rewritten there too). Never CONTINUE: the climb is over
// either way. Callers pass the last round's results, which must cover every
// climber (endClimbQuestion scores everyone, lock-in or not).
export function resolveClimbAtCap(finalRoundResults: ClimbRevealResult[]): Exclude<ClimbNext, { kind: 'CONTINUE' }> {
  const highest = Math.max(...finalRoundResults.map((result) => result.stepAfter));
  const occupants = finalRoundResults.filter((result) => result.stepAfter === highest);
  if (occupants.length === 1) {
    return { kind: 'WINNER', winnerPlayerId: occupants[0].playerId };
  }
  return pickDuelists(occupants, highest);
}

// What happens once the duel resolves: the winner takes the temple.
// Validates the winner really was one of the two duelists; returns their id
// for the caller to record as the game's winner. The duel's own mechanic
// (one weapon each, duelOutcome in shared) lives in the phase shell.
// Generic enough to also settle a spear duel below - "was the winner one of
// the two named duelists" doesn't care which duel it was.
export function applyClimbDuelResult(duelPlayerIds: readonly [string, string], winnerPlayerId: string): string {
  if (winnerPlayerId !== duelPlayerIds[0] && winnerPlayerId !== duelPlayerIds[1]) {
    throw new Error(`climb duel winner ${winnerPlayerId} was not one of the duelists ${duelPlayerIds.join(', ')}`);
  }
  return winnerPlayerId;
}

// ------------------------ Η Λόγχη, the spear (Task 203) ------------------------
// An elimination overlay on the bottom step, independent of everything above:
// applyClimbRound/nextAfterClimbRound/resolveClimbAtCap are UNCHANGED and
// still the only thing phases.ts calls - this is a second, optional pass a
// caller runs over the SAME scored round. Design-approved rule:
//   - sitting at step 0 through a negative round (wrong OR no lock-in)
//     increments a per-player counter; a correct lock-in (which always means
//     LEAVING step 0 - the smallest positive delta is +1) resets it to zero,
//     and so does already being off step 0 when the round starts.
//   - at counter === CLIMB_SPEAR_LIMIT the player is speared out.
//   - two or more struck in the SAME round: the two fastest-reacting (by
//     lock-in time, a non-answer sorting last - "reacting" is about speed,
//     not correctness, so this is NOT answerRank) duel it out with the same
//     weapon mechanic as the top (duelOutcome, shared); anyone struck beyond
//     those two is out outright, no duel.
//   - eliminations leaving exactly one player standing win immediately - a
//     second victory path beside reaching CLIMB_TOP.
// Auto-gated to N >= CLIMB_SPEAR_MIN_PLAYERS, baked into
// applyClimbSpearRound itself (not left to the caller to remember) - for
// N = 2-3 the climb plays exactly as it did before this task.

export const CLIMB_SPEAR_MIN_PLAYERS = 4;
export const CLIMB_SPEAR_LIMIT = 2;

export function climbSpearRuleActive(playerCount: number): boolean {
  return playerCount >= CLIMB_SPEAR_MIN_PLAYERS;
}

// The caller's state (a Monte Carlo run today; eventually a Room), keyed by
// playerId - a player with no entry is implicitly at 0. Never mutated here;
// applyClimbSpearRound returns what each entry becomes and the caller writes
// it back.
export type ClimbSpearCounters = Map<string, number>;

export interface ClimbSpearRoundResult {
  playerId: string;
  countBefore: number;
  countAfter: number;
  struck: boolean; // this round pushed countAfter to CLIMB_SPEAR_LIMIT
}

export function applyClimbSpearRound(
  results: readonly ClimbRevealResult[],
  countersBefore: ClimbSpearCounters,
  playerCount: number,
): ClimbSpearRoundResult[] {
  const active = climbSpearRuleActive(playerCount);
  return results.map((result) => {
    const countBefore = countersBefore.get(result.playerId) ?? 0;
    if (!active) {
      return { playerId: result.playerId, countBefore, countAfter: 0, struck: false };
    }
    const countAfter = result.stepBefore !== 0 || result.correct ? 0 : countBefore + 1;
    return { playerId: result.playerId, countBefore, countAfter, struck: countAfter >= CLIMB_SPEAR_LIMIT };
  });
}

// What the spear does with one round's struck players (the subset of
// applyClimbSpearRound's output flagged `struck`, joined back to that same
// round's ClimbRevealResult rows for their lock-in time). Exhaustive by
// construction, mirroring ClimbNext's shape.
export type ClimbSpearNext =
  | { kind: 'NONE' } // nobody struck this round
  | { kind: 'OUT'; playerIds: string[] } // one or more struck, none need a duel
  | { kind: 'DUEL'; playerIds: [string, string]; outrightPlayerIds: string[] }; // 2+ struck: the two fastest-reacting duel; the rest are out outright

export function nextAfterSpearRound(struckResults: readonly ClimbRevealResult[]): ClimbSpearNext {
  if (struckResults.length === 0) {
    return { kind: 'NONE' };
  }
  if (struckResults.length === 1) {
    return { kind: 'OUT', playerIds: [struckResults[0].playerId] };
  }
  // Fastest-REACTING, not fastest-correct: a non-answer (timeMs null) is the
  // slowest possible reaction, sorted last. Ties (equal timeMs) keep the
  // given order, same convention as pickDuelists' null-answerRank tie.
  const sorted = [...struckResults].sort((a, b) => (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity));
  return {
    kind: 'DUEL',
    playerIds: [sorted[0].playerId, sorted[1].playerId],
    outrightPlayerIds: sorted.slice(2).map((result) => result.playerId),
  };
}

// The second victory path (Task 203): call once a round's eliminations (any
// outright spear-outs plus a resolved spear duel, if one fired) are fully
// applied. Callers check this AFTER nextAfterClimbRound/resolveClimbAtCap and
// only when that call did not already declare a top-of-ladder winner -
// reaching the temple always wins outright first.
export function nextAfterSpearEliminations(
  remainingPlayerIds: readonly string[],
): { kind: 'WINNER'; winnerPlayerId: string } | null {
  if (remainingPlayerIds.length === 1) {
    return { kind: 'WINNER', winnerPlayerId: remainingPlayerIds[0] };
  }
  return null;
}
