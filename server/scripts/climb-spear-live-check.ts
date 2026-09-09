// Task 205 - integration check for Η Λόγχη wired into the LIVE climb: drives
// the real phase machine (server/src/phases.ts's startClimb/submitClimbAnswer/
// endClimbQuestion/submitDuelPick/endDuelReveal, server/src/payloads.ts's
// builders) exactly the way a real room would, on a virtual clock injected
// through timers.ts's installTimerClock - same technique as
// server/scripts/trial-montecarlo.ts, just scripted scenarios instead of a
// random Monte Carlo batch, since the acceptance criteria need EXACT
// conditions (a specific round, a specific same-round collision) rather than
// a distribution. The pure mechanic (server/src/climb.ts) is never touched or
// re-implemented here - only played through the real wiring.
//
//   npx tsx server/scripts/climb-spear-live-check.ts
//
import express from 'express';
import { randomUUID } from 'node:crypto';
import { CLIMB_MAX_ROUNDS, CLIMB_TOP, type Player } from '@game/shared';
import { initRealtime } from '../src/realtime.js';
import '../src/modes/index.js';
import { createRoom, deleteRoom, type Room } from '../src/state.js';
import { installTimerClock, pauseActiveTimer, remainingActiveTimerMs, resumeActiveTimer, type TimerClock } from '../src/timers.js';
import {
  buildClimbQuestionHostPayload,
  buildClimbQuestionPlayerPayload,
  buildClimbRevealPlayerPayload,
  buildGameOver,
} from '../src/payloads.js';
import { endClimbQuestion, startClimb, submitClimbAnswer, submitDuelPick } from '../src/phases.js';
import { climbSpearRuleActive } from '../src/climb.js';

// ---------------------------------------------------------------------------
// Virtual clock (the exact shape trial-montecarlo.ts uses)
// ---------------------------------------------------------------------------
interface Pending {
  id: number;
  at: number;
  fn: () => void;
}

class VirtualClock implements TimerClock {
  private t = 0;
  private nextId = 1;
  private queue: Pending[] = [];

  now = (): number => this.t;

  setTimeout = (fn: () => void, ms: number): NodeJS.Timeout => {
    const pending: Pending = { id: this.nextId++, at: this.t + ms, fn };
    this.queue.push(pending);
    return { id: pending.id } as unknown as NodeJS.Timeout;
  };

  clearTimeout = (handle: NodeJS.Timeout): void => {
    const id = (handle as unknown as { id: number }).id;
    this.queue = this.queue.filter((p) => p.id !== id);
  };

  advanceTo(t: number): void {
    if (t > this.t) this.t = t;
  }

  fireNext(): boolean {
    if (this.queue.length === 0) return false;
    this.queue.sort((a, b) => a.at - b.at || a.id - b.id);
    const next = this.queue.shift()!;
    this.t = Math.max(this.t, next.at);
    next.fn();
    return true;
  }
}

function makePlayer(name: string): Player {
  return {
    playerId: randomUUID(),
    name,
    socketId: `sim-${name}`,
    connected: true,
    score: 0,
    isVip: false,
    avatarId: name,
    isPresetName: false,
    isBot: false,
  };
}

// Fires timers until `predicate` holds - for driving through STAGE_ANNOUNCE/
// SOCRATES beats between rounds, which are just their own timer firing.
function driveUntil(clock: VirtualClock, predicate: () => boolean, guard = 300): void {
  let count = 0;
  while (!predicate()) {
    if (++count > guard) {
      throw new Error(`drive guard exceeded waiting for a condition`);
    }
    if (!clock.fireNext()) {
      throw new Error(`stuck with no timer armed`);
    }
  }
}

// Submits playerId's choice at an exact elapsed time within the current
// CLIMB_QUESTION timer - advances the clock (never backward) first, so
// submissions for one round must be called in ascending elapsedMs order.
function submitAt(room: Room, clock: VirtualClock, playerId: string, choice: number, elapsedMs: number): boolean {
  const start = room.activeTimer!.startedAt;
  clock.advanceTo(start + elapsedMs);
  return submitClimbAnswer(room, playerId, choice);
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean): void {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(label);
    console.log(`FAIL: ${label}`);
  }
}

function setup(names: string[]): { room: Room; clock: VirtualClock; players: Player[] } {
  const clock = new VirtualClock();
  installTimerClock(clock);
  const room = createRoom('sim-host');
  const players = names.map((name) => makePlayer(name));
  for (const player of players) {
    room.players.set(player.playerId, player);
  }
  return { room, clock, players };
}

// A running tally across every scenario, for criterion 3's "grep/assert
// step>=0 across all payloads" and "spectator payloads carry 0 answer/weapon
// fields".
let stepFieldsChecked = 0;
let stepFieldViolations = 0;
let spectatorPayloadsChecked = 0;
let spectatorFieldViolations = 0;

function auditHostPayload(room: Room): void {
  const payload = buildClimbQuestionHostPayload(room);
  if (!payload) return;
  for (const standing of payload.steps) {
    stepFieldsChecked += 1;
    if (standing.step < 0) stepFieldViolations += 1;
  }
}

function auditPlayerPayload(room: Room, playerId: string): void {
  const payload = buildClimbQuestionPlayerPayload(room, playerId);
  if (!payload) return;
  stepFieldsChecked += 1;
  if (payload.yourStep < 0) stepFieldViolations += 1;
  if (payload.eliminated || !payload.climbing) {
    spectatorPayloadsChecked += 1;
    const keys = Object.keys(payload);
    if (keys.includes('choice') || keys.includes('weapon')) {
      spectatorFieldViolations += 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Criterion 1 - live elimination
// ---------------------------------------------------------------------------
function scenarioLiveElimination(): { eliminatedRound: number; spectatorFromRoundOn: boolean; answerIgnored: boolean; figureAbsent: boolean } {
  const { room, clock, players } = setup(['A', 'B', 'C', 'D']);
  const [a, b, c, d] = players;
  check('scenario1: spear active at N=4', climbSpearRuleActive(4));
  check('scenario1: startClimb succeeds', startClimb(room));
  driveUntil(clock, () => room.phase === 'CLIMB_QUESTION');
  // All 4 players enter tied (equal score -> equal competition rank -> the
  // SAME entry step, 4 for N=4) - force everyone to the natural lowest
  // entry (1) instead: D so the fall-to-0-then-two-bad-rounds arc plays out
  // in exactly 3 rounds, and A/B/C so 3 rounds of correct (even fastest-
  // every-time) climbing tops out at 1+2*3=7, nowhere near CLIMB_TOP - this
  // scenario is about D alone, not an incidental TOP race.
  for (const player of [a, b, c, d]) room.climb!.steps.set(player.playerId, 1);

  let eliminatedRound = -1;
  // D answers wrong every round; A/B/C answer correctly and fast, so
  // nobody but D is ever at risk and nobody nears CLIMB_TOP in 3 rounds.
  for (let round = 1; round <= 3 && eliminatedRound === -1; round++) {
    const climb = room.climb!;
    const correctIndex = climb.questions[climb.questionIndex].correctIndex;
    const wrongChoice = (correctIndex + 1) % 4;
    auditHostPayload(room);
    for (const p of [a, b, c]) auditPlayerPayload(room, p.playerId);
    auditPlayerPayload(room, d.playerId);
    submitAt(room, clock, a.playerId, correctIndex, 100);
    submitAt(room, clock, b.playerId, correctIndex, 150);
    submitAt(room, clock, c.playerId, correctIndex, 200);
    submitAt(room, clock, d.playerId, wrongChoice, 250);
    check(`scenario1 round ${round}: auto-advanced to CLIMB_REVEAL`, room.phase === 'CLIMB_REVEAL');
    if (room.climb!.eliminationOrder.includes(d.playerId) && eliminatedRound === -1) {
      eliminatedRound = round;
      const row = room.climb!.lastResults!.find((r) => r.playerId === d.playerId)!;
      check(`scenario1: D's own elimination-round reveal row is flagged eliminated`, row.eliminated === true);
    }
    driveUntil(clock, () => room.phase === 'CLIMB_QUESTION' || room.phase === 'GAME_OVER');
  }
  check('scenario1: D was eliminated within 3 rounds', eliminatedRound !== -1);
  check('scenario1: game did not end (3 players still climbing)', room.phase === 'CLIMB_QUESTION');

  // Round K+1: spectator payload, answers ignored, figure absent.
  const playerPayload = buildClimbQuestionPlayerPayload(room, d.playerId)!;
  const spectatorFromRoundOn = playerPayload.eliminated === true;
  check('scenario1: player payload flags eliminated from round K+1', spectatorFromRoundOn);

  const before = room.climb!.lockIns.size;
  const accepted = submitClimbAnswer(room, d.playerId, 0);
  const answerIgnored = !accepted && room.climb!.lockIns.size === before && !room.climb!.lockIns.has(d.playerId);
  check('scenario1: eliminated player\'s answer is rejected and changes nothing', answerIgnored);

  const hostPayload = buildClimbQuestionHostPayload(room)!;
  const figureAbsent = !hostPayload.steps.some((s) => s.playerId === d.playerId);
  check('scenario1: eliminated player absent from the TV steps array', figureAbsent);

  auditHostPayload(room);
  for (const p of [a, b, c]) auditPlayerPayload(room, p.playerId);
  auditPlayerPayload(room, d.playerId);

  deleteRoom(room.code);
  return { eliminatedRound, spectatorFromRoundOn, answerIgnored, figureAbsent };
}

// ---------------------------------------------------------------------------
// Criterion 2a - last-survivor win, nobody at CLIMB_TOP
// ---------------------------------------------------------------------------
function scenarioLastSurvivor(): { winnerIsSurvivor: boolean; noTopArrival: boolean; isTrialResult: boolean } {
  const { room, clock, players } = setup(['S', 'D1', 'D2', 'D3']);
  const [s, d1, d2, d3] = players;
  check('scenario2a: startClimb succeeds', startClimb(room));
  driveUntil(clock, () => room.phase === 'CLIMB_QUESTION');

  let maxStepSeen = 0;
  const doomed = [d1, d2, d3];
  for (const target of doomed) {
    // Force the target to the bottom, isolated from whatever it drifted to
    // while it was somebody else's turn - two consecutive bad rounds at
    // step 0 is exactly CLIMB_SPEAR_LIMIT.
    room.climb!.steps.set(target.playerId, 0);
    for (let i = 0; i < 2; i++) {
      // Keep S safely mid-ladder every round - correct but never fastest,
      // and never left to drift near CLIMB_TOP over this whole scenario.
      room.climb!.steps.set(s.playerId, 3);
      const climb = room.climb!;
      const correctIndex = climb.questions[climb.questionIndex].correctIndex;
      const wrongChoice = (correctIndex + 1) % 4;
      const alive = [s, ...doomed].filter((p) => !climb.eliminationOrder.includes(p.playerId));
      let t = 100;
      for (const p of alive) {
        const choice = p.playerId === target.playerId ? wrongChoice : correctIndex;
        submitAt(room, clock, p.playerId, choice, t);
        t += 100;
      }
      for (const r of room.climb!.lastResults ?? []) maxStepSeen = Math.max(maxStepSeen, r.stepAfter);
      driveUntil(clock, () => room.phase === 'CLIMB_QUESTION' || room.phase === 'GAME_OVER');
    }
    check(`scenario2a: ${target.name} eliminated after 2 bad rounds at step 0`, room.climb ? room.climb.eliminationOrder.includes(target.playerId) : true);
    if (room.phase === 'GAME_OVER') break;
  }

  check('scenario2a: game reached GAME_OVER', room.phase === 'GAME_OVER');
  const gameOver = buildGameOver(room, room.climb?.winnerPlayerId ?? null);
  const winnerIsSurvivor = gameOver.standings[0]?.playerId === s.playerId;
  check('scenario2a: the lone survivor is the declared winner', winnerIsSurvivor);
  const noTopArrival = maxStepSeen < CLIMB_TOP;
  check('scenario2a: nobody ever reached CLIMB_TOP this game', noTopArrival);
  check('scenario2a: GAME_OVER is gated isTrialResult (no digits)', gameOver.isTrialResult === true);

  deleteRoom(room.code);
  return { winnerIsSurvivor, noTopArrival, isTrialResult: gameOver.isTrialResult };
}

// ---------------------------------------------------------------------------
// Criterion 2b - same round: a TOP arrival AND an unrelated elimination
// ---------------------------------------------------------------------------
function scenarioTopWinWithSimultaneousElimination(): { topWinnerCorrect: boolean; eliminatedRankedBelowSurvivors: boolean } {
  const { room, clock, players } = setup(['W', 'E', 'O1', 'O2']);
  const [w, e, o1, o2] = players;
  check('scenario2b: startClimb succeeds', startClimb(room));
  driveUntil(clock, () => room.phase === 'CLIMB_QUESTION');

  // W one step from the top; E already mid-streak at the bottom; O1/O2 just
  // along for the ride, mid-ladder.
  room.climb!.steps.set(w.playerId, CLIMB_TOP - 1);
  room.climb!.steps.set(e.playerId, 0);
  room.climb!.spearCounters.set(e.playerId, 1);
  room.climb!.steps.set(o1.playerId, 3);
  room.climb!.steps.set(o2.playerId, 3);

  const climb = room.climb!;
  const correctIndex = climb.questions[climb.questionIndex].correctIndex;
  const wrongChoice = (correctIndex + 1) % 4;
  submitAt(room, clock, w.playerId, correctIndex, 50); // fastest correct -> +2 -> CLIMB_TOP+1
  submitAt(room, clock, o1.playerId, correctIndex, 500);
  submitAt(room, clock, o2.playerId, correctIndex, 600);
  submitAt(room, clock, e.playerId, wrongChoice, 700); // 2nd consecutive bad round at step 0 -> struck

  check('scenario2b: W reached the top this round', room.climb!.lastResults!.find((r) => r.playerId === w.playerId)!.stepAfter >= CLIMB_TOP);
  check('scenario2b: E was eliminated this same round', room.climb!.eliminationOrder.includes(e.playerId));
  check('scenario2b: TOP win resolved (not last-survivor)', room.climb!.winnerPlayerId === w.playerId);
  check('scenario2b: 3 players remained alive (not a last-survivor scenario)', 4 - room.climb!.eliminationOrder.length === 3);

  driveUntil(clock, () => room.phase === 'GAME_OVER');
  const gameOver = buildGameOver(room, room.climb!.winnerPlayerId);
  const rankOf = (playerId: string): number => gameOver.standings.find((s) => s.playerId === playerId)!.rank;
  const topWinnerCorrect = rankOf(w.playerId) === 1;
  const eliminatedRankedBelowSurvivors = rankOf(e.playerId) > rankOf(o1.playerId) && rankOf(e.playerId) > rankOf(o2.playerId);
  check('scenario2b: W ranked 1st', topWinnerCorrect);
  check('scenario2b: E ranked below both surviving bystanders', eliminatedRankedBelowSurvivors);

  deleteRoom(room.code);
  return { topWinnerCorrect, eliminatedRankedBelowSurvivors };
}

// ---------------------------------------------------------------------------
// Criterion 3 - the N-gate, inverse: identical bad-round script at N=3
// ---------------------------------------------------------------------------
function scenarioGateAtThree(): { eliminations: number } {
  const { room, clock, players } = setup(['A', 'B', 'C']);
  const [a, b, c] = players;
  check('scenario3: spear inactive at N=3', !climbSpearRuleActive(3));
  check('scenario3: startClimb succeeds', startClimb(room));
  driveUntil(clock, () => room.phase === 'CLIMB_QUESTION');

  // The SAME bad-round script as scenario 1 (one player wrong every round),
  // run for 4 rounds - one more than what struck D out at N=4.
  for (let round = 1; round <= 4; round++) {
    const climb = room.climb!;
    const correctIndex = climb.questions[climb.questionIndex].correctIndex;
    const wrongChoice = (correctIndex + 1) % 4;
    auditHostPayload(room);
    for (const p of [a, b]) auditPlayerPayload(room, p.playerId);
    auditPlayerPayload(room, c.playerId);
    submitAt(room, clock, a.playerId, correctIndex, 100);
    submitAt(room, clock, b.playerId, correctIndex, 150);
    submitAt(room, clock, c.playerId, wrongChoice, 200);
    driveUntil(clock, () => room.phase === 'CLIMB_QUESTION' || room.phase === 'GAME_OVER');
    if (room.phase !== 'CLIMB_QUESTION') break;
  }
  const eliminations = room.climb?.eliminationOrder.length ?? 0;
  check('scenario3: 0 eliminations at N=3 despite the identical bad-round script', eliminations === 0);

  deleteRoom(room.code);
  return { eliminations };
}

// ---------------------------------------------------------------------------
// Criterion 4 - pause mid-streak, 0ms drift, streak survives untouched
// ---------------------------------------------------------------------------
function scenarioPauseMidStreak(): { streakBefore: number; streakAfterResume: number; streakAfterRound: number; remainingBefore: number; remainingAfterResume: number } {
  const { room, clock, players } = setup(['A', 'B', 'C', 'P']);
  const [a, b, c, p] = players;
  check('scenario4: startClimb succeeds', startClimb(room));
  driveUntil(clock, () => room.phase === 'CLIMB_QUESTION');

  room.climb!.steps.set(p.playerId, 0);
  room.climb!.spearCounters.set(p.playerId, 1); // mid-streak: one bad round already banked
  const streakBefore = room.climb!.spearCounters.get(p.playerId)!;

  // Advance partway into the round, then pause - mid-question, mid-streak.
  clock.advanceTo(room.activeTimer!.startedAt + 2000);
  const remainingBefore = remainingActiveTimerMs(room);
  room.paused = true;
  room.pausedByName = 'test';
  room.pausedAt = clock.now();
  pauseActiveTimer(room);

  // A real gap while paused - must count for NOTHING.
  clock.advanceTo(clock.now() + 30000);
  const streakDuringPause = room.climb!.spearCounters.get(p.playerId)!;

  room.paused = false;
  room.pausedByName = null;
  room.pausedAt = null;
  resumeActiveTimer(room, () => endClimbQuestion(room.code));
  const remainingAfterResume = remainingActiveTimerMs(room);
  const streakAfterResume = room.climb!.spearCounters.get(p.playerId)!;

  check('scenario4: streak untouched while paused', streakDuringPause === streakBefore);
  check('scenario4: streak untouched immediately after resume (before the round resolves)', streakAfterResume === streakBefore);
  check('scenario4: 0ms timer drift across pause/resume', remainingAfterResume === remainingBefore);

  // Now let the round actually resolve: P's 2nd bad round at step 0.
  const climb = room.climb!;
  const correctIndex = climb.questions[climb.questionIndex].correctIndex;
  const wrongChoice = (correctIndex + 1) % 4;
  const start = room.activeTimer!.startedAt;
  // advanceTo is relative to the RESUMED timer's own startedAt (reset by
  // resumeActiveTimer above), same pattern as submitAt elsewhere.
  clock.advanceTo(start + 100);
  submitClimbAnswer(room, a.playerId, correctIndex);
  clock.advanceTo(start + 150);
  submitClimbAnswer(room, b.playerId, correctIndex);
  clock.advanceTo(start + 200);
  submitClimbAnswer(room, c.playerId, correctIndex);
  clock.advanceTo(start + 250);
  submitClimbAnswer(room, p.playerId, wrongChoice);

  const streakAfterRound = room.climb!.spearCounters.get(p.playerId) ?? 0;
  check('scenario4: streak incremented to CLIMB_SPEAR_LIMIT exactly once the round resolves', streakAfterRound === 2 || room.climb!.eliminationOrder.includes(p.playerId));
  check('scenario4: P eliminated by the round the pause interrupted', room.climb!.eliminationOrder.includes(p.playerId));

  deleteRoom(room.code);
  return { streakBefore, streakAfterResume, streakAfterRound, remainingBefore, remainingAfterResume };
}

// ---------------------------------------------------------------------------
// Task 205b review fixes - each scenario is the exact failure the fix kills.
// ---------------------------------------------------------------------------

// 205b item 1 (endClimbQuestion's cap branch): the round that hits
// CLIMB_MAX_ROUNDS with everyone at step 0 and one player struck out that
// same round. Before the fix, resolveClimbAtCap saw the struck row as a tie
// occupant and (X being the fastest wrong answerer, hence first in the
// scored order that pickDuelists' all-null answerRank tie keeps) seated the
// ELIMINATED player in the top duel - and, on a lucky pick, crowned them,
// with GAME_OVER then listing them twice (winner AND eliminated).
function scenarioCapWithSameRoundStrike(): { duelExcludesEliminated: boolean; winnerNotEliminated: boolean; standingsUnique: boolean } {
  const { room, clock, players } = setup(['X', 'B', 'C', 'D']);
  const [x, b, c, d] = players;
  check('scenario5: startClimb succeeds', startClimb(room));
  driveUntil(clock, () => room.phase === 'CLIMB_QUESTION');
  const climb = room.climb!;
  for (const p of players) climb.steps.set(p.playerId, 0);
  climb.spearCounters.set(x.playerId, 1); // X's second bad round at 0 is this one
  climb.roundsPlayed = CLIMB_MAX_ROUNDS - 1; // this round IS the cap

  const correctIndex = climb.questions[climb.questionIndex].correctIndex;
  const wrongChoice = (correctIndex + 1) % 4;
  submitAt(room, clock, x.playerId, wrongChoice, 100); // fastest wrong - first in scored order
  submitAt(room, clock, b.playerId, wrongChoice, 200);
  submitAt(room, clock, c.playerId, wrongChoice, 300);
  submitAt(room, clock, d.playerId, wrongChoice, 400);

  check('scenario5: reached CLIMB_REVEAL at the cap', room.phase === 'CLIMB_REVEAL');
  check('scenario5: X struck out this round', climb.eliminationOrder.includes(x.playerId));
  const duel = climb.duel;
  check('scenario5: the cap tie went to a duel (three survivors all at 0)', duel !== null && duel.cause === 'top');
  const duelExcludesEliminated = duel !== null && !duel.duelistIds.includes(x.playerId);
  check('scenario5: the eliminated player is NOT a cap duelist', duelExcludesEliminated);
  check('scenario5: the cap duel is the two fastest SURVIVORS (B, C)', duel !== null && duel.duelistIds[0] === b.playerId && duel.duelistIds[1] === c.playerId);

  driveUntil(clock, () => room.phase === 'DUEL_PICK');
  if (duel) {
    submitDuelPick(room, duel.duelistIds[0], 'xifos');
    submitDuelPick(room, duel.duelistIds[1], 'dory'); // xifos beats dory - duelist 0 wins, deterministic
  }
  driveUntil(clock, () => room.phase === 'GAME_OVER');
  const gameOver = buildGameOver(room, climb.winnerPlayerId);
  const winnerNotEliminated = climb.winnerPlayerId !== null && !climb.eliminationOrder.includes(climb.winnerPlayerId);
  const standingsUnique = new Set(gameOver.standings.map((s) => s.playerId)).size === gameOver.standings.length && gameOver.standings.length === 4;
  check('scenario5: the winner is not an eliminated player', winnerNotEliminated);
  check('scenario5: GAME_OVER lists each player exactly once', standingsUnique);
  check('scenario5: X ranked last', gameOver.standings[3]?.playerId === x.playerId);

  deleteRoom(room.code);
  return { duelExcludesEliminated, winnerNotEliminated, standingsUnique };
}

// 205b item 1 (startClimbQuestion's pool-exhaustion branch): a spear duel
// whose loser is still in lastResults when the NEXT question start finds the
// pool empty and resolves the cap from those rows. Before the fix the loser
// (first in scored order) was seated in the top duel a second time.
function scenarioPoolExhaustionAfterSpearDuel(): { capDuelExcludesLoser: boolean } {
  const { room, clock, players } = setup(['A', 'B', 'C', 'D']);
  const [a, b, c, d] = players;
  check('scenario6: startClimb succeeds', startClimb(room));
  driveUntil(clock, () => room.phase === 'CLIMB_QUESTION');
  const climb = room.climb!;
  for (const p of players) climb.steps.set(p.playerId, 0);
  climb.spearCounters.set(a.playerId, 1);
  climb.spearCounters.set(b.playerId, 1); // A and B both struck this round -> spear duel
  climb.questions = climb.questions.slice(0, climb.questionIndex + 1); // this is the LAST question in the pool

  const correctIndex = climb.questions[climb.questionIndex].correctIndex;
  const wrongChoice = (correctIndex + 1) % 4;
  submitAt(room, clock, a.playerId, wrongChoice, 100);
  submitAt(room, clock, b.playerId, wrongChoice, 200);
  submitAt(room, clock, c.playerId, wrongChoice, 300);
  submitAt(room, clock, d.playerId, wrongChoice, 400);

  check('scenario6: a spear duel between A and B is pending', climb.duel?.cause === 'spear' && climb.duel.duelistIds[0] === a.playerId && climb.duel.duelistIds[1] === b.playerId);
  driveUntil(clock, () => room.phase === 'DUEL_PICK');
  submitDuelPick(room, a.playerId, 'xifos');
  submitDuelPick(room, b.playerId, 'dory'); // A wins, B is eliminated
  // endDuelReveal eliminates B and, synchronously, startClimbQuestion finds
  // the pool empty and opens the cap duel - so the instant B is out, the
  // room is already in the NEXT duel's DUEL_PICK.
  driveUntil(clock, () => climb.eliminationOrder.includes(b.playerId));
  check('scenario6: B eliminated by the spear duel', climb.eliminationOrder.includes(b.playerId));
  check('scenario6: pool exhausted -> straight into the cap duel', room.phase === 'DUEL_PICK' && climb.duel?.cause === 'top');
  const capDuelExcludesLoser = climb.duel !== null && !climb.duel.duelistIds.includes(b.playerId);
  check('scenario6: the spear-duel loser is NOT a cap duelist', capDuelExcludesLoser);
  check('scenario6: the cap duel is A vs C (the two fastest survivors)', climb.duel?.duelistIds[0] === a.playerId && climb.duel?.duelistIds[1] === c.playerId);
  void d;

  deleteRoom(room.code);
  return { capDuelExcludesLoser };
}

// 205b item 6 (payload boundary): a fastest-correct arrival from CLIMB_TOP-1
// scores stepAfter = CLIMB_TOP+1 in the mechanic (kept on the host row); the
// phone's yourStep must be clamped to the board, or ClimbStrip fills no
// notch at all for the winner.
function scenarioTopOverflowPhoneStep(): { hostStepAfter: number; phoneYourStep: number } {
  const { room, clock, players } = setup(['W', 'B', 'C', 'D']);
  const [w, b, c, d] = players;
  check('scenario7: startClimb succeeds', startClimb(room));
  driveUntil(clock, () => room.phase === 'CLIMB_QUESTION');
  const climb = room.climb!;
  climb.steps.set(w.playerId, CLIMB_TOP - 1);
  for (const p of [b, c, d]) climb.steps.set(p.playerId, 3);
  const correctIndex = climb.questions[climb.questionIndex].correctIndex;
  submitAt(room, clock, w.playerId, correctIndex, 50);
  submitAt(room, clock, b.playerId, correctIndex, 500);
  submitAt(room, clock, c.playerId, correctIndex, 600);
  submitAt(room, clock, d.playerId, correctIndex, 700);

  const hostStepAfter = climb.lastResults!.find((r) => r.playerId === w.playerId)!.stepAfter;
  const phone = buildClimbRevealPlayerPayload(room, w.playerId)!;
  check('scenario7: the host row keeps the unclamped mechanic value (CLIMB_TOP+1)', hostStepAfter === CLIMB_TOP + 1);
  check('scenario7: the phone yourStep is clamped to top', phone.yourStep === CLIMB_TOP && phone.yourStep <= phone.top);
  check('scenario7: W is the winner', climb.winnerPlayerId === w.playerId);

  deleteRoom(room.code);
  return { hostStepAfter, phoneYourStep: phone.yourStep };
}

// ---------------------------------------------------------------------------
function main(): void {
  initRealtime(express(), { origin: true });
  const realLog = console.log;
  const realWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};

  const r1 = scenarioLiveElimination();
  const r2a = scenarioLastSurvivor();
  const r2b = scenarioTopWinWithSimultaneousElimination();
  const r3 = scenarioGateAtThree();
  const r4 = scenarioPauseMidStreak();
  const r5 = scenarioCapWithSameRoundStrike();
  const r6 = scenarioPoolExhaustionAfterSpearDuel();
  const r7 = scenarioTopOverflowPhoneStep();

  console.log = realLog;
  console.warn = realWarn;

  console.log(`\n=== Task 205 live-wiring check ===`);
  console.log(`criterion 1 (live elimination): eliminated at round ${r1.eliminatedRound}; ` +
    `spectator from K+1: ${r1.spectatorFromRoundOn}; answer ignored: ${r1.answerIgnored}; figure absent: ${r1.figureAbsent}`);
  console.log(`criterion 2a (last-survivor): winner is survivor: ${r2a.winnerIsSurvivor}; ` +
    `no top arrival: ${r2a.noTopArrival}; isTrialResult: ${r2a.isTrialResult}`);
  console.log(`criterion 2b (same-round top+elimination): top winner correct: ${r2b.topWinnerCorrect}; ` +
    `eliminated ranked below survivors: ${r2b.eliminatedRankedBelowSurvivors}`);
  console.log(`criterion 3 (N=3 gate): eliminations = ${r3.eliminations} (must be 0)`);
  console.log(`criterion 3 (invariants across runs 1-3): step fields checked = ${stepFieldsChecked}, violations = ${stepFieldViolations}; ` +
    `spectator payloads checked = ${spectatorPayloadsChecked}, violations = ${spectatorFieldViolations}`);
  console.log(`criterion 4 (pause mid-streak): streak before=${r4.streakBefore} afterResume=${r4.streakAfterResume} afterRound=${r4.streakAfterRound}; ` +
    `remaining before=${r4.remainingBefore}ms afterResume=${r4.remainingAfterResume}ms (drift=${r4.remainingAfterResume - r4.remainingBefore}ms)`);

  console.log(`205b cap + same-round strike: duel excludes eliminated=${r5.duelExcludesEliminated}; winner not eliminated=${r5.winnerNotEliminated}; standings unique=${r5.standingsUnique}`);
  console.log(`205b pool exhaustion after spear duel: cap duel excludes loser=${r6.capDuelExcludesLoser}`);
  console.log(`205b top overflow: host stepAfter=${r7.hostStepAfter}, phone yourStep=${r7.phoneYourStep}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('failures:', failures);
    process.exit(1);
  }
}

main();
