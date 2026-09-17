// Task 249 - criterion 3 (the inverse sweep): total game duration and
// per-stage timings for a 5-bot full game, to confirm the Socrates cutoff
// diagnosis (dev/socrates-cutoff-check.ts) added no dead air anywhere. Since
// that diagnosis found the cause is (a) - the mp3 FILES themselves end
// truncated - no playback/timing code was touched at all, so this is really
// a single measurement standing in for both "before" and "after": nothing in
// server/src or client/src changed, so the two cannot differ.
//
// Same socket-level bot infra as dev/full-lineup-check.ts (CREATE_ROOM's own
// botCount field spawns real server-side bots, server/src/bots.ts - the
// SAME code that acks socrates:audio_ended for every beat), just a separate
// standalone script with botCount raised to 5 rather than editing that
// file's own fixed botCount:3 run.
//
//   npx tsx dev/socrates-cutoff-timing-check.ts
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { io, type Socket } from 'socket.io-client';
import { ClientEvents, DUEL_WEAPONS, ServerEvents, type GamePhase } from '@game/shared';
import { wireHostSocratesAck } from '../server/src/bots.js';

const ROOT = new URL('..', import.meta.url).pathname;
const SERVER_DIR = `${ROOT}server`;
const SERVER_PORT = 3922; // distinct from every other harness's throwaway port
const ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const BOT_COUNT = 5;

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

async function startServer(): Promise<void> {
  serverProc = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: SERVER_DIR,
    detached: true,
    env: { ...process.env, PORT: String(SERVER_PORT), NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.stdout?.on('data', (chunk: Buffer) => process.stderr.write(`[server] ${chunk}`));
  serverProc.stderr?.on('data', (chunk: Buffer) => process.stderr.write(`[server] ${chunk}`));
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

function pick(n: number): number {
  return Math.floor(Math.random() * n);
}

const PLACEHOLDER_DRAWING =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function wireHuman(socket: Socket): void {
  const soon = (fn: () => void) => setTimeout(fn, 400 + Math.random() * 400);
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

interface CardMark {
  stage: number;
  totalStages: number;
  title: string;
  t: number;
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

async function main(): Promise<void> {
  console.log(`starting server on ${SERVER_PORT}`);
  await startServer();
  console.log('server up');

  const host = connect();
  // Task 221's own harness-side fix (server/src/bots.ts) - a bare socket.io
  // host has no browser and no audio, so without this every beat rides its
  // full backstop instead of a real ack, inflating the very timing number
  // this script exists to measure.
  wireHostSocratesAck(host);
  const cards: CardMark[] = [];
  let t0 = Date.now();
  let gameOverT: number | null = null;
  host.onAny((event: string, payload: Record<string, unknown>) => {
    if (event === ServerEvents.STAGE_ANNOUNCE) {
      const c = payload as unknown as { stage: number; totalStages: number; title: string };
      cards.push({ stage: c.stage, totalStages: c.totalStages, title: c.title, t: Date.now() - t0 });
    }
    if (event === ServerEvents.GAME_OVER) {
      gameOverT = Date.now() - t0;
    }
  });

  const created = await (async () => {
    const p = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
    host.emit(ClientEvents.CREATE_ROOM, { botCount: BOT_COUNT });
    return p;
  })();
  const code = created.code;

  const player = connect();
  wireHuman(player);
  const joined = waitFor(player, ServerEvents.PLAYER_JOINED, 15000);
  // avatarPool (7 available avatars) is claimed by bots from the END,
  // i%pool.length - with BOT_COUNT=5 that's cerberus/pegasus/sphinx/
  // centaur/cyclops, so 'minotaur' (index 0) is the one avatar 5 bots never
  // touch.
  player.emit(ClientEvents.PLAYER_JOIN, { code, name: 'Αργύρης', playerId: randomUUID(), avatarId: 'minotaur' });
  await joined;
  await waitFor<{ players: unknown[] }>(player, ServerEvents.LOBBY_UPDATE, 20000, (p) => p.players.length >= BOT_COUNT + 1);

  const modeSet = waitFor<{ mode: string }>(player, ServerEvents.LOBBY_UPDATE, 8000, (p) => p.mode === 'full');
  player.emit(ClientEvents.VIP_SET_MODE, { mode: 'full' });
  await modeSet;

  t0 = Date.now();
  const over = waitFor(host, ServerEvents.GAME_OVER, 900_000);
  player.emit(ClientEvents.VIP_START_GAME, {});
  await over;
  await delay(300);

  console.log(`\n5-bot full game (mode=full, default settings, ${BOT_COUNT} bots + 1 human):\n`);
  const end = gameOverT ?? cards[cards.length - 1]?.t ?? 0;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const stageEnd = i + 1 < cards.length ? cards[i + 1].t : end;
    console.log(`  stage ${card.stage}/${card.totalStages}: ${card.title} — ${((stageEnd - card.t) / 1000).toFixed(1)}s`);
  }
  console.log(`\n  TOTAL: ${((end) / 1000).toFixed(1)}s`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    setTimeout(() => process.exit(), 200);
  });
