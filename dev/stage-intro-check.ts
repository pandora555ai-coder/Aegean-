// Task 218 - STAGE_INTRO_LINES keying: diagnosis + verification. Spawns a
// throwaway dev server, creates a `?bot=3` room, sets its mode to 'full'
// (needs a VIP - a bot can never hold one - so this script's own scripted
// human joins once, purely to flip the mode and press Έναρξη; it plays no
// further part), and lets the game run. The server's OWN stdout already
// logs everything this task needs to observe - `enterStageAnnounce` logs
// `entering stage N/M — TITLE` and `enterSocratesBeat` logs
// `Socrates (KIND) — "LINE"` for every beat, STAGE_INTRO included - so this
// script makes no socket-level assertions of its own; it just captures that
// log for a human (or a later grep pass) to read against the acceptance
// criteria.
//
//   npx tsx dev/stage-intro-check.ts             # full game, ~run to GAME_OVER
//   RUN_MS=120000 npx tsx dev/stage-intro-check.ts  # cap the run instead
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { io, type Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents } from '@game/shared';

const ROOT = path.resolve(import.meta.dirname, '..');
const SERVER_DIR = path.join(ROOT, 'server');
const SERVER_PORT = Number(process.env.SERVER_PORT) || 3911; // distinct from every other harness's throwaway port
const ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;

let serverProc: ChildProcess | null = null;
const sockets: Socket[] = [];

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

async function waitForServer(): Promise<void> {
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

function connect(): Socket {
  const s = io(ORIGIN, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  return s;
}

function waitFor<T = Record<string, unknown>>(socket: Socket, event: string, timeoutMs: number, predicate?: (p: T) => boolean): Promise<T> {
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

const PLACEHOLDER_DRAWING =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function pick(n: number): number {
  return Math.floor(Math.random() * n);
}

// The bots answer everything themselves at the socket level (server/src/
// bots.ts), but "all connected have answered" gates every early-advance
// check in this show (quiz, blitz, draw's own guess round, numeric, agora)
// - a human who never responds forces EVERY one of those phases to sit out
// its full timer instead of ending early, which is needlessly slow for a
// diagnosis run. Answering fast here (same random-pick discipline as
// server/src/bots.ts - never reads a correct answer) keeps this at roughly
// the ~850s baseline other full-run harnesses in this repo already measured
// (tasks/214-report.md) instead of several times that.
function wireFastAnswers(socket: Socket): void {
  const soon = (fn: () => void) => setTimeout(fn, 300 + Math.random() * 400);
  socket.on(ServerEvents.QUESTION_SHOW, (p: { options?: string[] }) => {
    if (!p.options) return;
    soon(() => socket.emit(ClientEvents.SUBMIT_ANSWER, { choice: pick(p.options!.length) }));
  });
  socket.on(ServerEvents.POWER_UP_SHOW, (p: { targets?: { playerId: string }[] }) => {
    if (!p.targets?.length) return;
    soon(() => socket.emit(ClientEvents.POWER_UP_CHOOSE, { effect: 'ink', targetPlayerId: p.targets![pick(p.targets!.length)].playerId }));
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
  socket.on(ServerEvents.AGORA_QUESTION_SHOW, (p: { options?: string[]; answered?: boolean }) => {
    if (!p.options || p.answered) return;
    soon(() => socket.emit(ClientEvents.AGORA_SUBMIT, { choice: pick(p.options!.length) }));
  });
  let blitzGeneration = 0;
  socket.on(ServerEvents.BLITZ_SHOW, (p: { total?: number; answeredCount?: number; progressByPlayerId?: unknown }) => {
    if (p.progressByPlayerId !== undefined || p.total === undefined) return;
    blitzGeneration += 1;
    const myGeneration = blitzGeneration;
    let next = p.answeredCount ?? 0;
    const swipe = () => {
      if (myGeneration !== blitzGeneration || next >= p.total!) return;
      socket.emit(ClientEvents.BLITZ_SWIPE, { index: next, answeredTrue: Math.random() < 0.5 });
      next += 1;
      setTimeout(swipe, 150 + Math.random() * 150);
    };
    setTimeout(swipe, 150);
  });
}

// Prefixes every server log line with elapsed ms since THIS process started,
// so stage durations (criterion 3's own ask - compare a silent stage's
// duration pre-fix vs post-fix) can be read straight off the log instead of
// timed by hand.
const t0 = Date.now();
function timestampedWrite(chunk: Buffer): void {
  const text = chunk.toString();
  const elapsed = Date.now() - t0;
  for (const line of text.split('\n')) {
    if (line.length === 0) continue;
    process.stdout.write(`[${elapsed}ms] ${line}\n`);
  }
}

// MODE env var (default 'full') lets this same harness drive any standalone
// mode too - Task 218 criterion 4's no-regression check for quiz/draw/
// numeric/blitz/agora needs a real running game per mode, not just full.
// 'quiz' skips VIP_SET_MODE since DEFAULT_GAME_MODE is already 'quiz'.
async function main(): Promise<void> {
  const mode = process.env.MODE ?? 'full';
  serverProc = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: SERVER_DIR,
    detached: true,
    env: { ...process.env, PORT: String(SERVER_PORT), NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.stdout?.on('data', timestampedWrite);
  serverProc.stderr?.on('data', timestampedWrite);
  try {
    await waitForServer();

    const host = connect();
    const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
    host.emit(ClientEvents.CREATE_ROOM, { botCount: 3 });
    const { code } = await created;
    console.log(`>>> room ${code} created with ?bot=3, mode=${mode}`);

    const human = connect();
    wireFastAnswers(human);
    const playerId = randomUUID();
    const joined = waitFor(human, ServerEvents.PLAYER_JOINED, 15000);
    human.emit(ClientEvents.PLAYER_JOIN, { code, name: 'Δοκιμαστής', playerId, avatarId: 'sphinx' });
    await joined;

    await waitFor<{ players: unknown[] }>(human, ServerEvents.LOBBY_UPDATE, 20000, (p) => p.players.length >= 4);
    if (mode !== 'quiz') {
      const modeSet = waitFor<{ mode: string }>(human, ServerEvents.LOBBY_UPDATE, 8000, (p) => p.mode === mode);
      human.emit(ClientEvents.VIP_SET_MODE, { mode });
      await modeSet;
    }
    console.log(`>>> mode ${mode} ready - starting`);

    const over = waitFor(host, ServerEvents.GAME_OVER, 900_000);
    human.emit(ClientEvents.VIP_START_GAME, {});
    const runMsEnv = Number(process.env.RUN_MS);
    if (runMsEnv > 0) {
      await Promise.race([over, delay(runMsEnv)]);
      console.log(`>>> RUN_MS (${runMsEnv}ms) elapsed - stopping observation (game may still be running server-side)`);
    } else {
      await over;
      console.log('>>> GAME_OVER reached');
    }
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
