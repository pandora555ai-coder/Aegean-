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
//   --p-noanswer P      chance a player never locks in that round (0.05)
//   --t-mean MS         mean lock-in time in ms (8000)
//   --t-sd MS           lock-in time spread, ms (4000); clamped to [500, timer]
//   --seed N            RNG seed (default 184)
//   --json              print the aggregate as JSON instead of prose

import express from 'express';
import { randomUUID } from 'node:crypto';
import { TRIAL_MAX_QUESTIONS, type Player } from '@game/shared';
import { initRealtime } from '../src/realtime.js';
import '../src/modes/index.js';
import { createRoom, deleteRoom, type Room } from '../src/state.js';
import { installTimerClock, type TimerClock } from '../src/timers.js';
import { endTrialQuestion, startTrial, submitTrialAnswer } from '../src/phases.js';

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
  pNoAnswer: number;
  tMeanMs: number;
  tSdMs: number;
  seed: number;
  json: boolean;
}

function parseArgs(argv: string[]): Config {
  const cfg: Config = {
    runs: 200,
    players: 4,
    entryLo: 400,
    entryHi: 1500,
    pCorrect: 0.6,
    pNoAnswer: 0.05,
    tMeanMs: 8000,
    tSdMs: 4000,
    seed: 184,
    json: false,
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
      case '--json':
        cfg.json = true;
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

    // Each duelist decides: no answer, or a lock-in (correct with pCorrect) at
    // a gaussian time clamped inside the timer.
    const lockIns: { playerId: string; atMs: number; choice: number }[] = [];
    for (const playerId of participants) {
      if (rng() < cfg.pNoAnswer) continue;
      const raw = cfg.tMeanMs + gaussian(rng) * cfg.tSdMs;
      const atMs = Math.round(Math.min(questionTimeMs - 1, Math.max(500, raw)));
      const correct = rng() < cfg.pCorrect;
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
// Batch + report
// ---------------------------------------------------------------------------
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function main(): void {
  const cfg = parseArgs(process.argv.slice(2));

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
      `pCorrect ${cfg.pCorrect}, pNoAnswer ${cfg.pNoAnswer}, t ${cfg.tMeanMs}±${cfg.tSdMs}ms, seed ${cfg.seed}`,
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

main();
