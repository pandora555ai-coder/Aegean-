// Dev-only unit check for the spear elimination rule (Task 203, acceptance
// criterion 1) - counter increments/resets, the duel-at-bottom trigger, the
// last-survivor win, and the N-gate. Exercises climb.ts's pure functions
// directly with hand-built ClimbRevealResult rows; no Room, no harness.
//
//   npx tsx server/scripts/climb-spear-check.ts

import type { ClimbRevealResult } from '@game/shared';
import {
  CLIMB_SPEAR_LIMIT,
  applyClimbDuelResult,
  applyClimbSpearRound,
  climbSpearRuleActive,
  nextAfterSpearEliminations,
  nextAfterSpearRound,
  type ClimbSpearCounters,
} from '../src/climb.js';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean): void {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    console.log(`FAIL: ${label}`);
  }
}

// Minimal ClimbRevealResult - only stepBefore/correct/timeMs/playerId ever
// matter to the spear functions; the rest is filler to satisfy the type.
function mkResult(playerId: string, stepBefore: number, correct: boolean, timeMs: number | null): ClimbRevealResult {
  return {
    playerId,
    name: playerId,
    avatarId: playerId,
    choice: correct ? 0 : timeMs === null ? null : 1,
    correct,
    timeMs,
    answerRank: null,
    stepBefore,
    delta: 0,
    stepAfter: stepBefore,
  };
}

// --- counter increments across consecutive negative rounds at step 0 -------
{
  const counters: ClimbSpearCounters = new Map();
  const r1 = applyClimbSpearRound([mkResult('a', 0, false, 5000)], counters, 4);
  check('round 1 wrong at step 0: countAfter 1, not struck', r1[0].countAfter === 1 && !r1[0].struck);
  counters.set('a', r1[0].countAfter);

  const r2 = applyClimbSpearRound([mkResult('a', 0, false, null)], counters, 4);
  check(
    `round 2 no-answer at step 0: countAfter reaches CLIMB_SPEAR_LIMIT (${CLIMB_SPEAR_LIMIT}) and struck`,
    r2[0].countAfter === CLIMB_SPEAR_LIMIT && r2[0].struck,
  );
}

// --- a correct lock-in resets the counter to zero ---------------------------
{
  const counters: ClimbSpearCounters = new Map([['a', 1]]);
  const r = applyClimbSpearRound([mkResult('a', 0, true, 3000)], counters, 4);
  check('correct lock-in at step 0 resets counter to 0', r[0].countAfter === 0 && !r[0].struck);
}

// --- leaving step 0 (landing there is not the same as starting there) ------
// resets the counter too: a player who started ABOVE 0 and fell TO 0 this
// round (a wrong lock-in, stepBefore 1 -> stepAfter 0) has not yet spent a
// round AT the bottom, so this round doesn't count against them.
{
  const counters: ClimbSpearCounters = new Map([['a', 1]]); // stale from an earlier stay at 0
  const r = applyClimbSpearRound([mkResult('a', 1, false, 4000)], counters, 4);
  check('stepBefore !== 0 resets counter to 0 regardless of history', r[0].countAfter === 0 && !r[0].struck);
}

// --- N-gate: the rule is inert below CLIMB_SPEAR_MIN_PLAYERS ----------------
{
  check('gate: active at N=4', climbSpearRuleActive(4));
  check('gate: inactive at N=3', !climbSpearRuleActive(3));
  check('gate: inactive at N=2', !climbSpearRuleActive(2));

  const counters: ClimbSpearCounters = new Map([['a', 1]]);
  const r = applyClimbSpearRound([mkResult('a', 0, false, 1000)], counters, 3);
  check('N=3: never struck even at what would be the limit for N>=4', r[0].countAfter === 0 && !r[0].struck);
}

// --- duel-at-bottom trigger only on a same-round double ---------------------
{
  const none = nextAfterSpearRound([]);
  check('0 struck: NONE', none.kind === 'NONE');

  const one = nextAfterSpearRound([mkResult('a', 0, false, 1000)]);
  check('1 struck: OUT, no duel', one.kind === 'OUT' && one.kind === 'OUT' && one.playerIds.length === 1 && one.playerIds[0] === 'a');

  // Two struck: the FASTER reactor (lower timeMs) duels alongside the other;
  // a non-answer (timeMs null) is the slowest reaction, so it never wins a
  // duel slot over an actual (even wrong) lock-in.
  const two = nextAfterSpearRound([mkResult('slow', 0, false, null), mkResult('fast', 0, false, 500)]);
  check(
    'exactly 2 struck: DUEL between them, no one held outright',
    two.kind === 'DUEL' && two.playerIds[0] === 'fast' && two.playerIds[1] === 'slow' && two.outrightPlayerIds.length === 0,
  );

  const three = nextAfterSpearRound([
    mkResult('mid', 0, false, 2000),
    mkResult('fast', 0, false, 500),
    mkResult('slow', 0, false, null),
  ]);
  check(
    '3+ struck: the two fastest duel, the rest are out outright (not a 3-way duel)',
    three.kind === 'DUEL' &&
      three.playerIds[0] === 'fast' &&
      three.playerIds[1] === 'mid' &&
      three.outrightPlayerIds.length === 1 &&
      three.outrightPlayerIds[0] === 'slow',
  );
}

// --- the duel resolver (reused from the top's applyClimbDuelResult) --------
{
  const winner = applyClimbDuelResult(['a', 'b'], 'b');
  check('duel resolver accepts a real duelist as winner', winner === 'b');
  let threw = false;
  try {
    applyClimbDuelResult(['a', 'b'], 'c');
  } catch {
    threw = true;
  }
  check('duel resolver rejects a non-duelist winner', threw);
}

// --- last-survivor win: the second victory path -----------------------------
{
  const win = nextAfterSpearEliminations(['a']);
  check('exactly one remaining: WINNER', win !== null && win.kind === 'WINNER' && win.winnerPlayerId === 'a');
  const noWin = nextAfterSpearEliminations(['a', 'b']);
  check('two or more remaining: no verdict yet', noWin === null);
  let threwOnEmpty = false;
  try {
    nextAfterSpearEliminations([]);
  } catch {
    threwOnEmpty = true;
  }
  check('zero remaining does not falsely declare a winner', !threwOnEmpty && nextAfterSpearEliminations([]) === null);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
