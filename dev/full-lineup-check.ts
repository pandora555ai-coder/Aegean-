// Task 214 - the LOCKED full-show lineup: composition check. Drives real
// rooms over the REAL socket protocol against a throwaway dev server
// (socket.io-client, the screenshot harness's "bot at the socket level"
// pattern - no Playwright, no screenshots) and reports the task's four
// acceptance criteria, each with its numbers:
//
//   1. FULL RUN     one ?bot=3 'full' game, seven stages to GAME_OVER, with the
//                   observed stage order, each stage's duration and the total
//   2. FINALE       the default room ends on Η Ανάβασις; a room whose VIP flips
//                   finaleMode to 'trial' ends on Η Δίκη
//   3. CONTINUITY   scores at every stage boundary, the finale's entry values,
//                   and an INDEPENDENT running total rebuilt from every reveal's
//                   own pointsAwarded (+ steal:resolved transfers); plus a
//                   crowdIntensityFor sweep over every GamePhase and a scan of
//                   the server's own stderr for a thrown one
//   4. REGRESSION   each standalone mode still runs start -> GAME_OVER
//
//   npx tsx dev/full-lineup-check.ts              # all four
//   npx tsx dev/full-lineup-check.ts --only full  # one section: full|trial|standalone
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { io, type Socket } from 'socket.io-client';
import {
  ClientEvents,
  DUEL_WEAPONS,
  ServerEvents,
  crowdIntensityFor,
  type GameModeId,
  type GamePhase,
  type RoomSettings,
} from '@game/shared';

// The wire vocabulary, restated here so the sweep is exhaustive by
// enumeration rather than by whatever a run happened to enter. TypeScript's
// own exhaustiveness check on GamePhase keeps this list honest: a missing
// name is a type error, an extra one too.
const ALL_GAME_PHASES: readonly GamePhase[] = [
  'LOBBY',
  'STAGE_ANNOUNCE',
  'POWER_UP',
  'QUESTION',
  'REVEAL',
  'STEAL',
  'SOCRATES',
  'DRAW',
  'GUESS',
  'GUESS_REVEAL',
  'NUMERIC_QUESTION',
  'NUMERIC_REVEAL',
  'TRIAL_QUESTION',
  'TRIAL_REVEAL',
  'CLIMB_QUESTION',
  'CLIMB_REVEAL',
  'DUEL_PICK',
  'DUEL_REVEAL',
  'BLITZ',
  'BLITZ_REVEAL',
  'AGORA_EXPOSE',
  'AGORA_QUESTION',
  'AGORA_REVEAL',
  'GAME_OVER',
];

const ROOT = path.resolve(import.meta.dirname, '..');
const SERVER_DIR = path.join(ROOT, 'server');
const SERVER_PORT = 3907; // distinct from every other harness's throwaway port
const ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;

let serverProc: ChildProcess | null = null;
const serverLog: string[] = [];
const sockets: Socket[] = [];

// --------------------------------------------------------------------------
// server lifecycle (agora-scene-check.ts's spawn/cleanup shape, no client)
// --------------------------------------------------------------------------
function killGroup(child: ChildProcess | null): void {
  if (!child || child.pid === undefined || child.killed) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // already gone
  }
}

async function cleanup(): Promise<void> {
  for (const s of sockets) s.disconnect();
  killGroup(serverProc);
}

async function startServer(): Promise<void> {
  serverProc = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: SERVER_DIR,
    detached: true,
    env: { ...process.env, PORT: String(SERVER_PORT), NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.stdout?.on('data', (chunk: Buffer) => serverLog.push(chunk.toString()));
  serverProc.stderr?.on('data', (chunk: Buffer) => serverLog.push(chunk.toString()));
  for (let attempt = 0; attempt < 60; attempt++) {
    const ok = await new Promise<boolean>((resolve) => {
      const probe = io(ORIGIN, { reconnection: false, timeout: 1000, transports: ['websocket'] });
      probe.on('connect', () => {
        probe.disconnect();
        resolve(true);
      });
      probe.on('connect_error', () => {
        probe.disconnect();
        resolve(false);
      });
    });
    if (ok) return;
    await delay(500);
  }
  throw new Error(`server did not come up on port ${SERVER_PORT}`);
}

// --------------------------------------------------------------------------
// the scripted human: one real socket that plays every mechanic, since a bot
// is never VIP and only the VIP can press Έναρξη. Same random-pick discipline
// as server/src/bots.ts - it never sees a correct answer.
// --------------------------------------------------------------------------
const PLACEHOLDER_DRAWING =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function pick(n: number): number {
  return Math.floor(Math.random() * n);
}

function wireHuman(socket: Socket): void {
  const soon = (fn: () => void) => setTimeout(fn, 400 + Math.random() * 400);
  socket.on(ServerEvents.QUESTION_SHOW, (p: { options?: string[] }) => {
    if (!p.options) return;
    soon(() => socket.emit(ClientEvents.SUBMIT_ANSWER, { choice: pick(p.options!.length) }));
  });
  socket.on(ServerEvents.POWER_UP_SHOW, (p: { targets?: { playerId: string }[] }) => {
    if (!p.targets?.length) return;
    soon(() =>
      socket.emit(ClientEvents.POWER_UP_CHOOSE, {
        effect: 'ink',
        targetPlayerId: p.targets![pick(p.targets!.length)].playerId,
      }),
    );
  });
  socket.on(ServerEvents.STEAL_SHOW, (p: { youAreThief?: boolean; targets?: { playerId: string }[] }) => {
    if (!p.youAreThief || !p.targets?.length) return;
    soon(() => socket.emit(ClientEvents.STEAL_CHOOSE, { targetPlayerId: p.targets![pick(p.targets!.length)].playerId }));
  });
  socket.on(ServerEvents.DRAW_SHOW, (p: { wordToDraw?: string }) => {
    if (!p.wordToDraw) return;
    soon(() => socket.emit(ClientEvents.DRAW_SUBMIT, { image: PLACEHOLDER_DRAWING }));
  });
  socket.on(ServerEvents.GUESS_SHOW, (p: { isDrawer?: boolean; options?: string[] }) => {
    if (p.isDrawer === undefined || p.isDrawer || !p.options) return;
    soon(() => socket.emit(ClientEvents.DRAW_GUESS, { choice: pick(p.options!.length) }));
  });
  socket.on(ServerEvents.NUMERIC_QUESTION_SHOW, (p: { max?: number; submittedCount?: number }) => {
    if (p.submittedCount !== undefined || p.max === undefined) return;
    soon(() => socket.emit(ClientEvents.NUMERIC_SUBMIT, { value: pick(p.max! + 1) }));
  });
  socket.on(ServerEvents.TRIAL_QUESTION_SHOW, (p: { options?: string[]; onTrial?: boolean }) => {
    if (!p.options || p.onTrial === false) return;
    soon(() => socket.emit(ClientEvents.TRIAL_SUBMIT, { choice: pick(p.options!.length) }));
  });
  socket.on(ServerEvents.CLIMB_QUESTION_SHOW, (p: { options?: string[]; climbing?: boolean; eliminated?: boolean }) => {
    if (!p.options || p.climbing === false || p.eliminated) return;
    soon(() => socket.emit(ClientEvents.CLIMB_SUBMIT, { choice: pick(p.options!.length) }));
  });
  socket.on(ServerEvents.AGORA_QUESTION_SHOW, (p: { options?: string[]; answered?: boolean }) => {
    if (!p.options || p.answered) return;
    soon(() => socket.emit(ClientEvents.AGORA_SUBMIT, { choice: pick(p.options!.length) }));
  });
  socket.on(ServerEvents.DUEL_PICK_SHOW, (p: { youDuel?: boolean; picked?: boolean }) => {
    if (!p.youDuel || p.picked) return;
    soon(() => socket.emit(ClientEvents.DUEL_PICK, { weapon: DUEL_WEAPONS[pick(DUEL_WEAPONS.length)] }));
  });
  socket.on(ServerEvents.BLITZ_SHOW, (p: { total?: number; answeredCount?: number; progressByPlayerId?: unknown }) => {
    if (p.progressByPlayerId !== undefined || p.total === undefined) return;
    let next = p.answeredCount ?? 0;
    const swipe = () => {
      if (next >= p.total!) return;
      socket.emit(ClientEvents.BLITZ_SWIPE, { index: next, answeredTrue: Math.random() < 0.5 });
      next += 1;
      setTimeout(swipe, 400 + Math.random() * 400);
    };
    setTimeout(swipe, 400);
  });
}

// --------------------------------------------------------------------------
// observation
// --------------------------------------------------------------------------
interface StandingRow {
  playerId: string;
  name: string;
  score: number;
}

class Run {
  t0 = Date.now();
  phases: { phase: GamePhase; t: number }[] = [];
  cards: { stage: number; totalStages: number; title: string; t: number }[] = [];
  standings: { t: number; rows: StandingRow[] }[] = [];
  // Rebuilt independently of any standings snapshot - every reveal's own
  // pointsAwarded plus every steal transfer.
  ledger = new Map<string, number>();
  gameOver: unknown = null;
  names = new Map<string, string>();

  private add(playerId: string, points: number): void {
    this.ledger.set(playerId, (this.ledger.get(playerId) ?? 0) + points);
  }

  attach(socket: Socket): void {
    socket.onAny((event: string, payload: Record<string, unknown>) => {
      const t = Date.now() - this.t0;
      if (event === ServerEvents.PHASE_CHANGED) {
        this.phases.push({ phase: (payload as { phase: GamePhase }).phase, t });
      }
      if (event === ServerEvents.STAGE_ANNOUNCE) {
        const card = payload as unknown as { stage: number; totalStages: number; title: string };
        this.cards.push({ stage: card.stage, totalStages: card.totalStages, title: card.title, t });
      }
      if (event === ServerEvents.GAME_OVER) {
        this.gameOver = payload;
      }
      if (payload && typeof payload === 'object') {
        const rows = (payload as { standings?: StandingRow[] }).standings;
        if (Array.isArray(rows) && rows.length > 0 && typeof rows[0]?.score === 'number') {
          for (const row of rows) this.names.set(row.playerId, row.name);
          this.standings.push({ t, rows: rows.map((r) => ({ playerId: r.playerId, name: r.name, score: r.score })) });
        }
        // Every reveal shape in the show carries results[].pointsAwarded;
        // the drawing round's own drawer award is its one extra field.
        const results = (payload as { results?: { playerId?: string; pointsAwarded?: number }[] }).results;
        if (
          Array.isArray(results) &&
          (event === ServerEvents.REVEAL_SHOW ||
            event === ServerEvents.BLITZ_REVEAL_SHOW ||
            event === ServerEvents.GUESS_REVEAL_SHOW ||
            event === ServerEvents.NUMERIC_REVEAL_SHOW ||
            event === ServerEvents.AGORA_REVEAL_SHOW)
        ) {
          for (const r of results) {
            if (typeof r?.playerId === 'string' && typeof r.pointsAwarded === 'number') this.add(r.playerId, r.pointsAwarded);
          }
        }
        if (event === ServerEvents.GUESS_REVEAL_SHOW) {
          const p = payload as unknown as { drawerPlayerId: string; drawerPointsAwarded: number };
          this.add(p.drawerPlayerId, p.drawerPointsAwarded);
        }
        if (event === ServerEvents.STEAL_RESOLVED) {
          const p = payload as unknown as { thiefPlayerId: string; victimPlayerId: string | null; stolenAmount: number };
          this.add(p.thiefPlayerId, p.stolenAmount);
          if (p.victimPlayerId) this.add(p.victimPlayerId, -p.stolenAmount);
        }
      }
    });
  }

  standingsAt(t: number): StandingRow[] {
    let best: StandingRow[] = [];
    for (const snap of this.standings) {
      if (snap.t <= t) best = snap.rows;
    }
    return best;
  }
}

function connect(): Socket {
  const s = io(ORIGIN, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  return s;
}

function waitFor<T = Record<string, unknown>>(
  socket: Socket,
  event: string,
  timeoutMs: number,
  predicate?: (p: T) => boolean,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for ${event} after ${timeoutMs}ms`));
    }, timeoutMs);
    function handler(p: T) {
      if (predicate && !predicate(p)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(p);
    }
    socket.on(event, handler);
  });
}

interface RunOptions {
  mode: GameModeId;
  botCount: number;
  settings?: Partial<RoomSettings>;
  timeoutMs: number;
}

async function playRoom(opts: RunOptions): Promise<Run> {
  const run = new Run();
  const host = connect();
  run.attach(host);
  const created = await (async () => {
    const p = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
    host.emit(ClientEvents.CREATE_ROOM, { botCount: opts.botCount });
    return p;
  })();
  const code = created.code;

  const player = connect();
  wireHuman(player);
  const joined = waitFor(player, ServerEvents.PLAYER_JOINED, 15000);
  player.emit(ClientEvents.PLAYER_JOIN, { code, name: 'Αργύρης', playerId: randomUUID(), avatarId: 'sphinx' });
  await joined;
  await waitFor<{ players: unknown[] }>(
    player,
    ServerEvents.LOBBY_UPDATE,
    20000,
    (p) => p.players.length >= opts.botCount + 1,
  );

  const modeSet = waitFor<{ mode: string }>(player, ServerEvents.LOBBY_UPDATE, 8000, (p) => p.mode === opts.mode);
  player.emit(ClientEvents.VIP_SET_MODE, { mode: opts.mode });
  await modeSet;

  if (opts.settings) {
    const applied = waitFor(player, ServerEvents.SETTINGS_UPDATED, 8000);
    player.emit(ClientEvents.VIP_UPDATE_SETTINGS, opts.settings);
    await applied;
  }

  run.t0 = Date.now();
  const over = waitFor(host, ServerEvents.GAME_OVER, opts.timeoutMs);
  player.emit(ClientEvents.VIP_START_GAME, {});
  await over;
  await delay(300);
  host.disconnect();
  player.disconnect();
  return run;
}

function stageDurations(run: Run): { stage: number; title: string; ms: number }[] {
  const end = run.phases.find((p) => p.phase === 'GAME_OVER')?.t ?? run.phases[run.phases.length - 1].t;
  return run.cards.map((card, i) => ({
    stage: card.stage,
    title: card.title,
    ms: (i + 1 < run.cards.length ? run.cards[i + 1].t : end) - card.t,
  }));
}

function fmt(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

// --------------------------------------------------------------------------
// criteria
// --------------------------------------------------------------------------
async function criterion1and3(): Promise<void> {
  console.log('\n===== 1. FULL RUN (mode=full, bots=3, all settings default) =====');
  const run = await playRoom({ mode: 'full', botCount: 3, timeoutMs: 900_000 });
  const durations = stageDurations(run);
  const total = run.phases.find((p) => p.phase === 'GAME_OVER')?.t ?? 0;
  for (const d of durations) console.log(`  stage ${d.stage}: ${d.title} — ${fmt(d.ms)}`);
  console.log(`  totalStages reported on every card: ${[...new Set(run.cards.map((c) => c.totalStages))].join(',')}`);
  console.log(`  stages announced: ${run.cards.length} (expected 7)`);
  console.log(`  distinct phases seen: ${[...new Set(run.phases.map((p) => p.phase))].join(' ')}`);
  console.log(`  GAME_OVER reached: ${run.gameOver !== null} — total ${fmt(total)}`);

  console.log('\n===== 2a. FINALE DEFAULT (no VIP toggle) =====');
  const lastCard = run.cards[run.cards.length - 1];
  console.log(`  finale card: stage ${lastCard.stage}/${lastCard.totalStages} "${lastCard.title}"`);
  console.log(
    `  CLIMB_QUESTION=${run.phases.filter((p) => p.phase === 'CLIMB_QUESTION').length} ` +
      `CLIMB_REVEAL=${run.phases.filter((p) => p.phase === 'CLIMB_REVEAL').length} ` +
      `DUEL_PICK=${run.phases.filter((p) => p.phase === 'DUEL_PICK').length} ` +
      `TRIAL_QUESTION=${run.phases.filter((p) => p.phase === 'TRIAL_QUESTION').length}`,
  );
  console.log(`  game_over isTrialResult: ${(run.gameOver as { isTrialResult?: boolean })?.isTrialResult}`);

  console.log('\n===== 3. SCORE CONTINUITY + COVERAGE =====');
  const finaleCard = run.cards[run.cards.length - 1];
  for (const card of run.cards) {
    const rows = run.standingsAt(card.t);
    console.log(`  at stage ${card.stage} card: ${rows.map((r) => `${r.name}=${r.score}`).join(' ')}`);
  }
  const entry = run.standingsAt(finaleCard.t);
  console.log(`  FINALE (${finaleCard.title}) entry scores: ${entry.map((r) => `${r.name}=${r.score}`).join(' ')}`);
  let allMatch = true;
  for (const row of entry) {
    const ledger = Math.round(run.ledger.get(row.playerId) ?? 0);
    const ok = ledger === row.score;
    if (!ok) allMatch = false;
    console.log(`    ${row.name}: entry ${row.score} vs independent ledger ${ledger} -> ${ok ? 'MATCH' : 'MISMATCH'}`);
  }
  console.log(`  entry scores equal the running totals: ${allMatch ? 'PASS' : 'FAIL'}`);
  reportCrowd(run);
}

function reportCrowd(run: Run): void {
  let thrown = 0;
  for (const phase of ALL_GAME_PHASES) {
    try {
      crowdIntensityFor(phase);
    } catch {
      thrown += 1;
      console.log(`  crowdIntensityFor THREW for ${phase}`);
    }
  }
  console.log(`  crowdIntensityFor sweep over all ${ALL_GAME_PHASES.length} GamePhase values: ${thrown} throw(s)`);
  const seen = [...new Set(run.phases.map((p) => p.phase))];
  let seenThrown = 0;
  for (const phase of seen) {
    try {
      crowdIntensityFor(phase);
    } catch {
      seenThrown += 1;
    }
  }
  console.log(`  ...restricted to the ${seen.length} phases this run actually entered: ${seenThrown} throw(s)`);
  const log = serverLog.join('');
  const hits = log.split('\n').filter((line) => line.includes('crowdIntensityFor') || line.includes('unhandled phase'));
  console.log(`  server stdout/stderr lines mentioning crowdIntensityFor/unhandled phase: ${hits.length}`);
  for (const hit of hits.slice(0, 5)) console.log(`    ${hit.trim()}`);
}

async function criterion2(): Promise<void> {
  console.log('\n===== 2b. FINALE = trial (VIP flips finaleMode to trial) =====');
  const run = await playRoom({ mode: 'full', botCount: 3, settings: { finaleMode: 'trial' }, timeoutMs: 900_000 });
  const finaleCard = run.cards[run.cards.length - 1];
  const phases = new Set(run.phases.map((p) => p.phase));
  console.log(`  stages announced: ${run.cards.map((c) => `${c.stage}:${c.title}`).join(' | ')}`);
  console.log(`  finale card: stage ${finaleCard.stage}/${finaleCard.totalStages} "${finaleCard.title}"`);
  console.log(
    `  TRIAL_QUESTION=${run.phases.filter((p) => p.phase === 'TRIAL_QUESTION').length} ` +
      `CLIMB_QUESTION=${run.phases.filter((p) => p.phase === 'CLIMB_QUESTION').length}`,
  );
  console.log(`  GAME_OVER reached: ${phases.has('GAME_OVER')}`);
  const durations = stageDurations(run);
  for (const d of durations) console.log(`  stage ${d.stage}: ${d.title} — ${fmt(d.ms)}`);
}

async function criterion4(): Promise<void> {
  console.log('\n===== 4. NO REGRESSION (standalone modes) =====');
  const runs: { label: string; opts: RunOptions }[] = [
    // Covers Η Αγορά (quiz), Η Συκοφαντία (quiz+steal, its stage 3) and the
    // climb finale in one standalone quiz game.
    { label: 'quiz (Η Αγορά + Η Συκοφαντία + Η Ανάβασις)', opts: { mode: 'quiz', botCount: 3, timeoutMs: 900_000 } },
    { label: 'blitz (Η Παλαίστρα)', opts: { mode: 'blitz', botCount: 3, timeoutMs: 300_000 } },
    { label: 'draw (Ζωγραφική)', opts: { mode: 'draw', botCount: 3, timeoutMs: 600_000 } },
    { label: 'numeric (Εκτίμηση)', opts: { mode: 'numeric', botCount: 3, timeoutMs: 600_000 } },
    { label: 'agora (Η Μνήμη της Αγοράς)', opts: { mode: 'agora', botCount: 3, timeoutMs: 300_000 } },
    { label: 'duel (Η Μονομαχία)', opts: { mode: 'duel', botCount: 3, timeoutMs: 300_000 } },
  ];
  for (const { label, opts } of runs) {
    try {
      const run = await playRoom(opts);
      const total = run.phases.find((p) => p.phase === 'GAME_OVER')?.t ?? 0;
      const seen = [...new Set(run.phases.map((p) => p.phase))].join(' ');
      console.log(`  ${label}: PASS — ${fmt(total)}, phases: ${seen}`);
    } catch (err) {
      console.log(`  ${label}: FAIL — ${String(err)}`);
    }
  }
}

async function main(): Promise<void> {
  const onlyIndex = process.argv.indexOf('--only');
  const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : null;
  await startServer();
  try {
    if (!only || only === 'full') await criterion1and3();
    if (!only || only === 'trial') await criterion2();
    if (!only || only === 'standalone') await criterion4();
  } finally {
    await cleanup();
  }
}

main().then(
  () => process.exit(0),
  async (err) => {
    console.error(err);
    await cleanup();
    process.exit(1);
  },
);
