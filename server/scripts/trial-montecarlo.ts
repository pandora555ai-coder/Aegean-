// Task 184 - Monte Carlo harness for Η Δίκη (the quiz finale).
//
// Drives the PRODUCTION trial in-process: phases.ts's startTrial /
// submitTrialAnswer / endTrialQuestion / endTrialReveal, trial.ts's drain and
// elimination, payloads.ts's builders - the same code path a live room runs,
// on a virtual clock injected through timers.ts's installTimerClock so a run
// takes milliseconds instead of minutes. Nothing about the mechanic is
// reimplemented here; this file only plays the players and reads the room.
//
//   npx tsx server/scripts/trial-montecarlo.ts --runs 200 --entry 5000-9000
//   npx tsx server/scripts/trial-montecarlo.ts --runs 200 --entry 400-1500
//
// Flags (all optional):
//   --runs N            simulated trials (default 200)
//   --players N         duelists per trial (default 4)
//   --entry LO-HI       entry life range; one player always walks in at HI
//   --p-correct P       per-player, per-round chance of a correct lock-in (0.6)
//   --p-correct-leader P  overrides pCorrect for the entry leader only (Task 185c)
//   --p-correct-others P  overrides pCorrect for every other player (Task 185c)
//   --p-noanswer P      chance a player never locks in that round (0.05)
//   --t-mean MS         mean lock-in time in ms (8000)
//   --t-sd MS           lock-in time spread, ms (4000); clamped to [500, timer]
//   --seed N            RNG seed (default 184)
//   --finale trial|climb  which finale mechanic to simulate (Task 187; default trial)
//   --cap N             climb only: round cap to simulate (default CLIMB_MAX_ROUNDS;
//                       a high value shows the uncapped tail - Task 188b calibration)
//   --json              print the aggregate as JSON instead of prose

import express from 'express';
import { randomUUID } from 'node:crypto';
import { CLIMB_MAX_ROUNDS, CLIMB_TOP, DEFAULT_ROOM_SETTINGS, DUEL_WEAPONS, TRIAL_MAX_QUESTIONS, climbEntryStep, duelOutcome, type Player } from '@game/shared';
import { initRealtime } from '../src/realtime.js';
import '../src/modes/index.js';
import { createRoom, deleteRoom, type Room } from '../src/state.js';
import { installTimerClock, type TimerClock } from '../src/timers.js';
import { endTrialQuestion, startTrial, submitTrialAnswer } from '../src/phases.js';
import { computeCompetitionRanks } from '../src/payloads.js';
import {
  applyClimbDuelResult,
  applyClimbRound,
  applyClimbSpearRound,
  climbSpearRuleActive,
  nextAfterClimbRound,
  nextAfterSpearEliminations,
  nextAfterSpearRound,
  resolveClimbAtCap,
  type ClimbRoundEntry,
  type ClimbSpearCounters,
} from '../src/climb.js';

// ---------------------------------------------------------------------------
// Virtual clock - the injected TimerClock. Timers queue up in virtual time and
// fire only when the driver asks; `advanceTo` moves "now" without firing, so a
// lock-in can be placed at an exact elapsed time before the question timer goes.
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

  // Fires the earliest pending timer (ties: earliest armed). Returns false
  // when nothing is armed - a stuck room.
  fireNext(): boolean {
    if (this.queue.length === 0) return false;
    this.queue.sort((a, b) => a.at - b.at || a.id - b.id);
    const next = this.queue.shift()!;
    this.t = Math.max(this.t, next.at);
    next.fn();
    return true;
  }

  pendingCount(): number {
    return this.queue.length;
  }
}

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32) - a seed reproduces a whole batch.
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
interface Config {
  runs: number;
  players: number;
  entryLo: number;
  entryHi: number;
  pCorrect: number;
  // Task 185c - per-player skill, so the entry leader can be modeled as the
  // better player a real leader usually is, not just the one who got lucky
  // earlier. null means "everyone uses pCorrect", the original behavior.
  pCorrectLeader: number | null;
  pCorrectOthers: number | null;
  pNoAnswer: number;
  tMeanMs: number;
  tSdMs: number;
  seed: number;
  // Task 187 - which finale mechanic to simulate. 'trial' drives the real
  // phase machine exactly as before; 'climb' calls climb.ts's pure
  // functions directly (there is no phase machine for it yet).
  finale: 'trial' | 'climb';
  cap: number;
  json: boolean;
  // Task 203 - the spear elimination overlay, climb only. 'auto' follows
  // climbSpearRuleActive(players) (the N >= 4 gate baked into climb.ts
  // itself); 'on'/'off' forces it either way for controlled comparison runs.
  spear: 'auto' | 'on' | 'off';
}

function parseArgs(argv: string[]): Config {
  const cfg: Config = {
    runs: 200,
    players: 4,
    entryLo: 400,
    entryHi: 1500,
    pCorrect: 0.6,
    pCorrectLeader: null,
    pCorrectOthers: null,
    pNoAnswer: 0.05,
    tMeanMs: 8000,
    tSdMs: 4000,
    seed: 184,
    finale: 'trial',
    cap: CLIMB_MAX_ROUNDS,
    json: false,
    spear: 'auto',
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case '--runs':
        cfg.runs = Number(value);
        i++;
        break;
      case '--players':
        cfg.players = Number(value);
        i++;
        break;
      case '--entry': {
        const [lo, hi] = value.split('-').map(Number);
        cfg.entryLo = lo;
        cfg.entryHi = hi ?? lo;
        i++;
        break;
      }
      case '--p-correct':
        cfg.pCorrect = Number(value);
        i++;
        break;
      case '--p-correct-leader':
        cfg.pCorrectLeader = Number(value);
        i++;
        break;
      case '--p-correct-others':
        cfg.pCorrectOthers = Number(value);
        i++;
        break;
      case '--p-noanswer':
        cfg.pNoAnswer = Number(value);
        i++;
        break;
      case '--t-mean':
        cfg.tMeanMs = Number(value);
        i++;
        break;
      case '--t-sd':
        cfg.tSdMs = Number(value);
        i++;
        break;
      case '--seed':
        cfg.seed = Number(value);
        i++;
        break;
      case '--finale':
        if (value !== 'trial' && value !== 'climb') {
          throw new Error(`--finale must be 'trial' or 'climb', got '${value}'`);
        }
        cfg.finale = value;
        i++;
        break;
      case '--cap':
        cfg.cap = Number(value);
        i++;
        break;
      case '--json':
        cfg.json = true;
        break;
      case '--spear':
        if (value !== 'on' && value !== 'off') {
          throw new Error(`--spear must be 'on' or 'off', got '${value}'`);
        }
        cfg.spear = value;
        i++;
        break;
      default:
        throw new Error(`unknown flag ${flag}`);
    }
  }
  return cfg;
}

// ---------------------------------------------------------------------------
// One simulated trial
// ---------------------------------------------------------------------------
interface RunResult {
  verdict: boolean;
  rounds: number;
  winnerId: string | null;
  entryLeaderId: string;
  comeback: boolean;
  leaderDied: boolean;
  leaderMissStreakAtDeath: number | null;
  // Task 185b - resilience/calibration check: over the whole trial (not
  // just the fatal streak), how many locked-in-wrong hits the leader
  // absorbed, and drain vs. hit's share of what actually killed him.
  leaderWrongLockInHits: number;
  leaderTotalDrain: number;
  leaderTotalHit: number;
  suddenDeathFired: number;
  anomalies: string[];
}

function makePlayer(name: string, score: number): Player {
  return {
    playerId: randomUUID(),
    name,
    socketId: `sim-${name}`,
    connected: true,
    score,
    isVip: false,
    avatarId: name,
    isPresetName: false,
    isBot: true,
  };
}

function simulateOne(cfg: Config, rng: () => number, clock: VirtualClock): RunResult {
  const room: Room = createRoom('sim-host');
  const questionTimeMs = room.settings.questionTimeMs;

  // Entry life: uniform in [lo, hi], with one player pinned to HI so "the
  // leader walks in at ~hi" holds for every run.
  const players: Player[] = [];
  for (let i = 0; i < cfg.players; i++) {
    const score = Math.round(cfg.entryLo + (cfg.entryHi - cfg.entryLo) * rng());
    players.push(makePlayer(`p${i}`, score));
  }
  const pinned = Math.floor(rng() * cfg.players);
  players[pinned].score = cfg.entryHi;
  let entryLeader = players[0];
  for (const p of players) if (p.score > entryLeader.score) entryLeader = p;
  for (const p of players) room.players.set(p.playerId, p);

  const anomalies: string[] = [];
  let suddenDeathFired = 0;
  let leaderMissStreak = 0;
  let leaderDied = false;
  let leaderMissStreakAtDeath: number | null = null;
  let leaderWrongLockInHits = 0;
  let leaderTotalDrain = 0;
  let leaderTotalHit = 0;
  let seenRevealRound = -1;

  const observeReveal = (): void => {
    const trial = room.trial;
    if (!trial || room.phase !== 'TRIAL_REVEAL' || !trial.lastReveal) return;
    const reveal = trial.lastReveal;
    if (reveal.roundIndex === seenRevealRound) return;
    seenRevealRound = reveal.roundIndex;

    if (reveal.nextSuddenDeath) suddenDeathFired += 1;

    const leaderResult = reveal.results.find((r) => r.playerId === entryLeader.playerId);
    if (leaderResult && !leaderDied) {
      leaderMissStreak = leaderResult.correct ? 0 : leaderMissStreak + 1;
      if (leaderResult.choice !== null && !leaderResult.correct) {
        leaderWrongLockInHits += 1;
      }
      leaderTotalDrain += leaderResult.drain;
      leaderTotalHit += leaderResult.hit;
      // Elimination is real only when this reveal does NOT declare sudden
      // death (the 137 trap: a sudden-death-declaring reveal flags everyone).
      if (leaderResult.eliminated && !reveal.nextSuddenDeath) {
        leaderDied = true;
        leaderMissStreakAtDeath = leaderMissStreak;
      }
    }

    // The 137 trap, checked at every reveal: every duelist flagged
    // eliminated, nobody winning, and no sudden death to send them on.
    const allFlagged = reveal.results.length > 0 && reveal.results.every((r) => r.eliminated);
    if (allFlagged && !reveal.winnerPlayerId && !reveal.nextSuddenDeath) {
      anomalies.push(`round ${reveal.roundIndex + 1}: all ${reveal.results.length} flagged eliminated, no winner, no sudden death`);
    }
  };

  if (!startTrial(room)) {
    throw new Error('startTrial declined - fewer than two players or an empty question pool');
  }

  // Drive the room until GAME_OVER. Anything that is not the question itself
  // (STAGE_ANNOUNCE, SOCRATES beats, TRIAL_REVEAL) is just its timer firing.
  let guard = 0;
  while (room.phase !== 'GAME_OVER') {
    if (++guard > 400) {
      anomalies.push(`driver guard hit in phase ${room.phase}`);
      break;
    }
    if (room.phase !== 'TRIAL_QUESTION') {
      if (!clock.fireNext()) {
        anomalies.push(`stuck in ${room.phase} with no timer armed`);
        break;
      }
      observeReveal();
      continue;
    }

    const trial = room.trial!;
    const questionStart = room.activeTimer!.startedAt;
    const correctIndex = trial.questions[trial.questionIndex].correctIndex;
    const participants = trial.suddenDeath ? trial.suddenDeathPlayerIds : trial.livingPlayerIds;

    // Each duelist decides: no answer, or a lock-in (correct with pCorrect,
    // or the leader's own skill-correlated override - Task 185c) at a
    // gaussian time clamped inside the timer.
    const lockIns: { playerId: string; atMs: number; choice: number }[] = [];
    for (const playerId of participants) {
      if (rng() < cfg.pNoAnswer) continue;
      const raw = cfg.tMeanMs + gaussian(rng) * cfg.tSdMs;
      const atMs = Math.round(Math.min(questionTimeMs - 1, Math.max(500, raw)));
      const isLeader = playerId === entryLeader.playerId;
      const pCorrect = (isLeader ? cfg.pCorrectLeader : cfg.pCorrectOthers) ?? cfg.pCorrect;
      const correct = rng() < pCorrect;
      const choice = correct ? correctIndex : (correctIndex + 1 + Math.floor(rng() * 3)) % 4;
      lockIns.push({ playerId, atMs, choice });
    }
    lockIns.sort((a, b) => a.atMs - b.atMs);
    for (const lockIn of lockIns) {
      if (room.phase !== 'TRIAL_QUESTION') break;
      clock.advanceTo(questionStart + lockIn.atMs);
      const accepted = submitTrialAnswer(room, lockIn.playerId, lockIn.choice);
      if (!accepted) anomalies.push(`lock-in rejected for ${lockIn.playerId} in round ${trial.questionIndex + 1}`);
    }
    // Somebody never locked in: the question timer ends the round.
    if (room.phase === 'TRIAL_QUESTION') {
      if (!clock.fireNext()) {
        anomalies.push('question timer missing');
        break;
      }
      if (room.phase === 'TRIAL_QUESTION') {
        // A stray non-question timer fired first; end it the way the timer would.
        endTrialQuestion(room.code);
      }
    }
    observeReveal();
  }

  const trial = room.trial!;
  const winnerId = trial.winnerPlayerId;
  if (room.phase === 'GAME_OVER' && !winnerId && trial.livingPlayerIds.length === 0) {
    anomalies.push('game over with nobody living and no winner');
  }
  if (trial.roundsPlayed > TRIAL_MAX_QUESTIONS) {
    anomalies.push(`rounds ${trial.roundsPlayed} exceeded the ${TRIAL_MAX_QUESTIONS} cap`);
  }

  const result: RunResult = {
    verdict: winnerId !== null,
    rounds: trial.roundsPlayed,
    winnerId,
    entryLeaderId: entryLeader.playerId,
    comeback: winnerId !== null && winnerId !== entryLeader.playerId,
    leaderDied,
    leaderMissStreakAtDeath,
    leaderWrongLockInHits,
    leaderTotalDrain,
    leaderTotalHit,
    suddenDeathFired,
    anomalies,
  };
  deleteRoom(room.code);
  return result;
}

// ---------------------------------------------------------------------------
// One simulated climb (Task 187) - no Room, no phase machine, no clock:
// climb.ts has no timers to inject one into. Reuses the SAME player-
// simulation shape as simulateOne above (RNG-driven lock-in decisions,
// gaussian lock-in timing, leader/other skill split) so the two mechanics
// are compared on like-for-like player behavior; only the entry setup and
// scoring differ, calling climb.ts's pure functions directly.
// ---------------------------------------------------------------------------
// Task 203 - resolves a duel (top-of-ladder or spear) all the way to a
// winner, the same weapon rock-paper-scissors mechanic the live game uses
// (duelOutcome, shared): a random weapon per side, re-drawn on a tie exactly
// as DUEL_PICK does (phases.ts re-enters DUEL_PICK with tieCount + 1). The
// pre-203 harness stopped at "reached a duel" without a winner; Task 203
// needs a real one for every run to compute rounds-to-verdict and the
// comeback stats below.
function resolveDuelToWinner(rng: () => number, playerA: string, playerB: string): string {
  for (let tie = 0; tie < 1000; tie++) {
    const weaponA = DUEL_WEAPONS[Math.floor(rng() * DUEL_WEAPONS.length)];
    const weaponB = DUEL_WEAPONS[Math.floor(rng() * DUEL_WEAPONS.length)];
    const outcome = duelOutcome(weaponA, weaponB);
    if (outcome !== 'TIE') {
      return applyClimbDuelResult([playerA, playerB], outcome === 'A' ? playerA : playerB);
    }
  }
  throw new Error(`duel between ${playerA} and ${playerB} never resolved after 1000 ties`);
}

// Task 203 - a run's final verdict, one of four shapes: reaching CLIMB_TOP
// alone or via its duel, or the spear thinning the field to one survivor
// either outright (the last elimination needed no duel) or via a spear duel
// (the field was down to exactly two struck players, who happened to be the
// last two standing).
type ClimbVerdictType = 'top' | 'top-duel' | 'last-survivor' | 'bottom-duel-survivor';

interface ClimbRunResult {
  rounds: number;
  verdictType: ClimbVerdictType;
  winnerId: string;
  entryLeaderId: string;
  comeback: boolean; // winner isn't the entry-rank leader (pre-203 definition, kept for continuity)
  eliminationsCount: number;
  capHit: boolean; // the round cap resolved this run rather than a natural verdict
  winnerEverAtStepZero: boolean;
  winnerEverBehindBy3: boolean; // winner's step was ever >= 3 below the then-current leader's
  anomalies: string[];
}

function simulateOneClimb(cfg: Config, rng: () => number): ClimbRunResult {
  const anomalies: string[] = [];
  const questionTimeMs = DEFAULT_ROOM_SETTINGS.questionTimeMs;

  // Same entry-scale generation as simulateOne, deliberately unused beyond
  // producing a RANK ORDER: climb entry is ordinal (climbEntryStep), so the
  // raw score values themselves must have no effect on the outcome.
  const players: Player[] = [];
  for (let i = 0; i < cfg.players; i++) {
    const score = Math.round(cfg.entryLo + (cfg.entryHi - cfg.entryLo) * rng());
    players.push(makePlayer(`p${i}`, score));
  }
  const pinned = Math.floor(rng() * cfg.players);
  players[pinned].score = cfg.entryHi;
  let entryLeader = players[0];
  for (const p of players) if (p.score > entryLeader.score) entryLeader = p;

  const ranks = computeCompetitionRanks(
    players,
    (p) => p.score,
    (p) => p.playerId,
  );
  const steps = new Map<string, number>();
  for (const p of players) {
    steps.set(p.playerId, climbEntryStep(ranks.get(p.playerId)!, players.length));
  }

  const spearActive = cfg.spear === 'auto' ? climbSpearRuleActive(cfg.players) : cfg.spear === 'on';
  const spearCounters: ClimbSpearCounters = new Map();
  const alive = new Set(players.map((p) => p.playerId));
  const eliminatedRound = new Map<string, number>();
  const everAtStepZero = new Set<string>();
  const everBehindBy3 = new Set<string>();

  // Records, for every player CURRENTLY alive, whether their step is at 0 or
  // >= 3 behind the current leader (the max step among the alive) - called
  // once before round 1 (entry steps) and again after every round.
  const trackDeficits = (): void => {
    let max = -Infinity;
    for (const id of alive) max = Math.max(max, steps.get(id)!);
    for (const id of alive) {
      const step = steps.get(id)!;
      if (step === 0) everAtStepZero.add(id);
      if (max - step >= 3) everBehindBy3.add(id);
    }
  };
  trackDeficits();

  let rounds = 0;
  let winnerId: string | null = null;
  let verdictType: ClimbVerdictType | null = null;
  let capHit = false;

  while (winnerId === null) {
    rounds += 1;
    if (rounds > cfg.cap * 3) {
      anomalies.push(`driver guard: ${rounds} rounds without a verdict (cap ${cfg.cap})`);
      break;
    }
    const correctIndex = 0; // arbitrary and fixed - only correctness (via pCorrect) matters, not which option

    const alivePlayers = players.filter((p) => alive.has(p.playerId));
    const entries: ClimbRoundEntry[] = alivePlayers.map((p) => {
      const stepBefore = steps.get(p.playerId)!;
      if (rng() < cfg.pNoAnswer) {
        return { playerId: p.playerId, name: p.name, avatarId: p.avatarId, stepBefore, choice: null, elapsedMs: null };
      }
      const raw = cfg.tMeanMs + gaussian(rng) * cfg.tSdMs;
      const elapsedMs = Math.round(Math.min(questionTimeMs - 1, Math.max(500, raw)));
      const isLeader = p.playerId === entryLeader.playerId;
      const pCorrect = (isLeader ? cfg.pCorrectLeader : cfg.pCorrectOthers) ?? cfg.pCorrect;
      const correct = rng() < pCorrect;
      const choice = correct ? correctIndex : (correctIndex + 1 + Math.floor(rng() * 3)) % 4;
      return { playerId: p.playerId, name: p.name, avatarId: p.avatarId, stepBefore, choice, elapsedMs };
    });

    const results = applyClimbRound(entries, correctIndex);
    for (const result of results) {
      steps.set(result.playerId, result.stepAfter);
      if (result.stepAfter < 0) anomalies.push(`round ${rounds}: negative step for ${result.playerId}`);
    }
    trackDeficits();

    // 1. Reaching the top always wins outright first, spear or no spear.
    const topNext = nextAfterClimbRound(results);
    if (topNext.kind === 'WINNER') {
      winnerId = topNext.winnerPlayerId;
      verdictType = 'top';
      break;
    }
    if (topNext.kind === 'DUEL') {
      winnerId = resolveDuelToWinner(rng, topNext.playerIds[0], topNext.playerIds[1]);
      verdictType = 'top-duel';
      break;
    }

    // 2. The spear overlay: a second, independent pass over the SAME round.
    if (spearActive) {
      const spearResults = applyClimbSpearRound(results, spearCounters, cfg.players);
      const struckIds = new Set(spearResults.filter((r) => r.struck).map((r) => r.playerId));
      for (const r of spearResults) spearCounters.set(r.playerId, r.countAfter);

      if (struckIds.size > 0) {
        const struckResults = results.filter((r) => struckIds.has(r.playerId));
        const spearNext = nextAfterSpearRound(struckResults);
        let bottomDuelFired = false;
        if (spearNext.kind === 'OUT') {
          for (const id of spearNext.playerIds) {
            alive.delete(id);
            eliminatedRound.set(id, rounds);
          }
        } else {
          for (const id of spearNext.outrightPlayerIds) {
            alive.delete(id);
            eliminatedRound.set(id, rounds);
          }
          const duelWinner = resolveDuelToWinner(rng, spearNext.playerIds[0], spearNext.playerIds[1]);
          const duelLoser = duelWinner === spearNext.playerIds[0] ? spearNext.playerIds[1] : spearNext.playerIds[0];
          alive.delete(duelLoser);
          eliminatedRound.set(duelLoser, rounds);
          spearCounters.set(duelWinner, 0);
          bottomDuelFired = true;
        }

        const survivorVerdict = nextAfterSpearEliminations([...alive]);
        if (survivorVerdict) {
          winnerId = survivorVerdict.winnerPlayerId;
          verdictType = bottomDuelFired ? 'bottom-duel-survivor' : 'last-survivor';
          break;
        }
        if (alive.size === 0) {
          anomalies.push(`round ${rounds}: spear eliminated every remaining player`);
          break;
        }
      }
    }

    // 3. The round cap - same resolver the phase machine calls, over
    // whoever the spear left alive.
    if (rounds >= cfg.cap) {
      capHit = true;
      const stillAlive = results.filter((r) => alive.has(r.playerId));
      const verdict = resolveClimbAtCap(stillAlive);
      if (verdict.kind === 'WINNER') {
        winnerId = verdict.winnerPlayerId;
        verdictType = 'top';
      } else {
        winnerId = resolveDuelToWinner(rng, verdict.playerIds[0], verdict.playerIds[1]);
        verdictType = 'top-duel';
      }
      break;
    }
  }

  if (winnerId === null || verdictType === null) {
    // The driver guard fired - no real verdict. Fall back to whoever is
    // alive with the highest step so the batch still gets a row, flagged by
    // the anomaly already pushed above.
    const stillAlive = players.filter((p) => alive.has(p.playerId));
    const fallback = stillAlive.reduce((best, p) => (steps.get(p.playerId)! > steps.get(best.playerId)! ? p : best), stillAlive[0]);
    winnerId = fallback.playerId;
    verdictType = 'top';
  }
  if (eliminatedRound.has(winnerId)) {
    anomalies.push(`winner ${winnerId} was previously eliminated in round ${eliminatedRound.get(winnerId)}`);
  }

  return {
    rounds,
    verdictType,
    winnerId,
    entryLeaderId: entryLeader.playerId,
    comeback: winnerId !== entryLeader.playerId,
    eliminationsCount: eliminatedRound.size,
    capHit,
    winnerEverAtStepZero: everAtStepZero.has(winnerId),
    winnerEverBehindBy3: everBehindBy3.has(winnerId),
    anomalies,
  };
}

// ---------------------------------------------------------------------------
// Batch + report
// ---------------------------------------------------------------------------
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Task 188b - nearest-rank percentile (p in 0..100), for the p99 the round
// cap is calibrated against.
function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

function runTrialBatch(cfg: Config): void {
  // Sockets: initRealtime builds io on an http server that never listens, so
  // every emit the trial makes lands on an empty room - the production emit
  // sites run, nobody hears them.
  initRealtime(express(), { origin: true });

  const clock = new VirtualClock();
  installTimerClock(clock);
  const rng = mulberry32(cfg.seed);

  // The trial logs every lock-in and reveal; that is thousands of lines per
  // batch, so the room's own logging is muted for the duration.
  const realLog = console.log;
  const realWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};

  const started = performance.now();
  const results: RunResult[] = [];
  for (let i = 0; i < cfg.runs; i++) {
    results.push(simulateOne(cfg, rng, clock));
  }
  const wallMs = performance.now() - started;

  console.log = realLog;
  console.warn = realWarn;

  const verdicts = results.filter((r) => r.verdict);
  const leaderDeaths = results.filter((r) => r.leaderDied);
  const summary = {
    config: cfg,
    runs: results.length,
    verdictCount: verdicts.length,
    verdictPct: (100 * verdicts.length) / results.length,
    roundsMedianVerdictRuns: median(verdicts.map((r) => r.rounds)),
    roundsMedianAllRuns: median(results.map((r) => r.rounds)),
    poolExhaustedCount: results.length - verdicts.length,
    comebackCount: results.filter((r) => r.comeback).length,
    leaderDiedCount: leaderDeaths.length,
    leaderMissStreakAtDeathMedian: median(leaderDeaths.map((r) => r.leaderMissStreakAtDeath ?? 0)),
    leaderWrongLockInHitsMedian: median(leaderDeaths.map((r) => r.leaderWrongLockInHits)),
    leaderDrainSharePctMean:
      leaderDeaths.length === 0
        ? null
        : (100 *
            leaderDeaths.reduce((sum, r) => {
              const total = r.leaderTotalDrain + r.leaderTotalHit;
              return sum + (total > 0 ? r.leaderTotalDrain / total : 0);
            }, 0)) /
          leaderDeaths.length,
    suddenDeathFiredTotal: results.reduce((sum, r) => sum + r.suddenDeathFired, 0),
    suddenDeathRuns: results.filter((r) => r.suddenDeathFired > 0).length,
    anomalies: results.flatMap((r, i) => r.anomalies.map((a) => `run ${i + 1}: ${a}`)),
    pendingVirtualTimers: clock.pendingCount(),
    wallClockMs: Math.round(wallMs),
  };

  if (cfg.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }
  const lines = [
    `trial monte carlo — ${summary.runs} runs, ${cfg.players} players, entry ${cfg.entryLo}-${cfg.entryHi}, ` +
      `pCorrect leader=${cfg.pCorrectLeader ?? cfg.pCorrect} others=${cfg.pCorrectOthers ?? cfg.pCorrect}, ` +
      `pNoAnswer ${cfg.pNoAnswer}, t ${cfg.tMeanMs}±${cfg.tSdMs}ms, seed ${cfg.seed}`,
    `verdict reached: ${summary.verdictCount}/${summary.runs} (${summary.verdictPct.toFixed(1)}%), ` +
      `pool exhausted (${TRIAL_MAX_QUESTIONS}-round cap): ${summary.poolExhaustedCount}`,
    `rounds to verdict: median ${summary.roundsMedianVerdictRuns ?? 'n/a'} (all runs median ${summary.roundsMedianAllRuns})`,
    `comebacks (winner ≠ entry leader): ${summary.comebackCount}; entry leader died in ${summary.leaderDiedCount} runs, ` +
      `median consecutive misses at death ${summary.leaderMissStreakAtDeathMedian ?? 'n/a'}`,
    `dead leader: median locked-in-wrong hits absorbed ${summary.leaderWrongLockInHitsMedian ?? 'n/a'}, ` +
      `mean drain share of life lost ${summary.leaderDrainSharePctMean === null ? 'n/a' : summary.leaderDrainSharePctMean.toFixed(1) + '%'}`,
    `sudden death fired: ${summary.suddenDeathFiredTotal} times across ${summary.suddenDeathRuns} runs`,
    `anomalies: ${summary.anomalies.length}${summary.anomalies.length ? '\n  ' + summary.anomalies.join('\n  ') : ''}`,
    `pending virtual timers after batch: ${summary.pendingVirtualTimers}; wall clock ${summary.wallClockMs}ms`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

// ---------------------------------------------------------------------------
// Climb batch + report (Task 187)
// ---------------------------------------------------------------------------
function runClimbBatch(cfg: Config): void {
  const rng = mulberry32(cfg.seed);

  const started = performance.now();
  const results: ClimbRunResult[] = [];
  for (let i = 0; i < cfg.runs; i++) {
    results.push(simulateOneClimb(cfg, rng));
  }
  const wallMs = performance.now() - started;

  const spearActive = cfg.spear === 'auto' ? climbSpearRuleActive(cfg.players) : cfg.spear === 'on';
  const byVerdict = (kind: ClimbVerdictType) => results.filter((r) => r.verdictType === kind);
  const eliminationInvariantViolations = results.filter((r) => r.anomalies.some((a) => a.includes('previously eliminated')));
  const negativeStepViolations = results.filter((r) => r.anomalies.some((a) => a.includes('negative step')));
  const summary = {
    config: cfg,
    spearActive,
    runs: results.length,
    roundsMedian: median(results.map((r) => r.rounds)),
    roundsP90: percentile(results.map((r) => r.rounds), 90),
    roundsP95: percentile(results.map((r) => r.rounds), 95),
    roundsP99: percentile(results.map((r) => r.rounds), 99),
    roundsMax: Math.max(...results.map((r) => r.rounds)),
    capHitCount: results.filter((r) => r.capHit).length,
    capRatePct: (100 * results.filter((r) => r.capHit).length) / results.length,
    verdictCounts: {
      top: byVerdict('top').length,
      'top-duel': byVerdict('top-duel').length,
      'last-survivor': byVerdict('last-survivor').length,
      'bottom-duel-survivor': byVerdict('bottom-duel-survivor').length,
    },
    eliminationsMedian: median(results.map((r) => r.eliminationsCount)),
    eliminationsMean: results.reduce((sum, r) => sum + r.eliminationsCount, 0) / results.length,
    comebackCount: results.filter((r) => r.comeback).length,
    comebackPct: (100 * results.filter((r) => r.comeback).length) / results.length,
    winnerEverAtStepZeroCount: results.filter((r) => r.winnerEverAtStepZero).length,
    winnerEverAtStepZeroPct: (100 * results.filter((r) => r.winnerEverAtStepZero).length) / results.length,
    // Task 203 acceptance criterion 3: the comeback-preservation figure.
    winnerEverBehindBy3Count: results.filter((r) => r.winnerEverBehindBy3).length,
    winnerEverBehindBy3Pct: (100 * results.filter((r) => r.winnerEverBehindBy3).length) / results.length,
    // Task 203 acceptance criterion 4: must both be 0.
    eliminationInvariantViolations: eliminationInvariantViolations.length,
    negativeStepViolations: negativeStepViolations.length,
    anomalies: results.flatMap((r, i) => r.anomalies.map((a) => `run ${i + 1}: ${a}`)),
    wallClockMs: Math.round(wallMs),
  };

  if (cfg.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }
  const lines = [
    `climb monte carlo — ${summary.runs} runs, ${cfg.players} players, spear ${cfg.spear}${cfg.spear === 'auto' ? ` (active=${spearActive})` : ''}, ` +
      `entry ${cfg.entryLo}-${cfg.entryHi}, pCorrect leader=${cfg.pCorrectLeader ?? cfg.pCorrect} others=${cfg.pCorrectOthers ?? cfg.pCorrect}, ` +
      `pNoAnswer ${cfg.pNoAnswer}, t ${cfg.tMeanMs}±${cfg.tSdMs}ms, seed ${cfg.seed}`,
    `rounds to verdict: median ${summary.roundsMedian ?? 'n/a'}, p90 ${summary.roundsP90 ?? 'n/a'}, p95 ${summary.roundsP95 ?? 'n/a'}, ` +
      `p99 ${summary.roundsP99 ?? 'n/a'}, max ${summary.roundsMax}; cap (${cfg.cap}) hit: ${summary.capHitCount} (${summary.capRatePct.toFixed(1)}%)`,
    `verdict type: top ${summary.verdictCounts.top}, top-duel ${summary.verdictCounts['top-duel']}, ` +
      `last-survivor ${summary.verdictCounts['last-survivor']}, bottom-duel-survivor ${summary.verdictCounts['bottom-duel-survivor']}`,
    `eliminations per run: median ${summary.eliminationsMedian ?? 'n/a'}, mean ${summary.eliminationsMean.toFixed(2)}`,
    `comebacks (winner ≠ entry-rank leader): ${summary.comebackCount}/${summary.runs} (${summary.comebackPct.toFixed(1)}%); ` +
      `winner was ever at step 0: ${summary.winnerEverAtStepZeroCount}/${summary.runs} (${summary.winnerEverAtStepZeroPct.toFixed(1)}%)`,
    `comeback preservation: winner was ever >= 3 steps behind the leader: ${summary.winnerEverBehindBy3Count}/${summary.runs} ` +
      `(${summary.winnerEverBehindBy3Pct.toFixed(1)}%)`,
    `invariant violations: elimination-then-won-or-moved ${summary.eliminationInvariantViolations}, negative step ${summary.negativeStepViolations}`,
    `anomalies: ${summary.anomalies.length}${summary.anomalies.length ? '\n  ' + summary.anomalies.join('\n  ') : ''}`,
    `wall clock ${summary.wallClockMs}ms`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

function main(): void {
  const cfg = parseArgs(process.argv.slice(2));
  // Climb has no Room and logs nothing, so it needs none of runTrialBatch's
  // own console muting (which stays self-contained, unchanged, below).
  if (cfg.finale === 'climb') {
    runClimbBatch(cfg);
  } else {
    runTrialBatch(cfg);
  }
}

main();
