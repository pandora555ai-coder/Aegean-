// Task 241 supplementary check - the STEAL banner specifically (nominative,
// never vocative). Split out from dev/241-name-check.ts's B2/C section
// because that run used gameLength:'short', which (a real, unrelated
// finding) apparently drops standalone quiz's own stage 3 (Η Συκοφαντία /
// STEAL) entirely - so STEAL never fired there. This uses DEFAULT settings
// (gameLength defaults to 'long', which DOES include the STEAL stage, as
// confirmed by the plain bot-room run in that same script) and spams
// vip:skip_socrates to skip through every beat's audio backstop fast.
//
//   npx tsx dev/241-steal-check.ts
process.env.PORT = '3942';

import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { io, type Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents, type GameModeId } from '@game/shared';

const SERVER_PORT = 3942;
const ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const sockets: Socket[] = [];

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
    function handler(p: T): void {
      if (predicate && !predicate(p)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(p);
    }
    socket.on(event, handler);
  });
}
function pick(n: number): number {
  return Math.floor(Math.random() * n);
}
const AVATAR_POOL = ['sphinx', 'minotaur', 'medusa', 'cyclops'];
function joinPlayer(code: string, name: string, avatarIndex: number): Promise<Socket> {
  const s = connect();
  s.on(ServerEvents.QUESTION_SHOW, (p: { options?: string[] }) => {
    if (!p.options) return;
    setTimeout(() => s.emit(ClientEvents.SUBMIT_ANSWER, { choice: pick(p.options!.length) }), 150 + Math.random() * 200);
  });
  s.on(ServerEvents.STEAL_SHOW, (p: { youAreThief?: boolean; targets?: { playerId: string }[]; yourChoice?: unknown }) => {
    if (!p.youAreThief || !p.targets || p.targets.length === 0 || p.yourChoice) return;
    setTimeout(() => s.emit(ClientEvents.STEAL_CHOOSE, { targetPlayerId: p.targets![pick(p.targets!.length)].playerId }), 150);
  });
  const joined = waitFor(s, ServerEvents.PLAYER_JOINED, 15000);
  s.emit(ClientEvents.PLAYER_JOIN, { code, name, playerId: randomUUID(), avatarId: AVATAR_POOL[avatarIndex % AVATAR_POOL.length] });
  return joined.then(() => s);
}

async function main(): Promise<void> {
  console.log('booting in-process server on', SERVER_PORT);
  await import('../server/src/index.js');

  const host = connect();
  const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
  host.emit(ClientEvents.CREATE_ROOM, { mode: 'quiz' as GameModeId }); // default settings - gameLength 'long'
  const { code } = await created;
  console.log(`room ${code} created (default settings)`);

  const roster = ['Παναγιώτης', 'Ξενοφών', 'Φίλιππος', 'Ευαγγελία'];
  const players: Socket[] = [];
  for (let i = 0; i < roster.length; i++) players.push(await joinPlayer(code, roster[i], i));
  const vip = players[0];
  vip.emit(ClientEvents.VIP_START_GAME, {});
  console.log(`game started, roster = ${JSON.stringify(roster)}`);

  let stealThiefName: string | null = null;
  const stealListener = (p: { thiefName?: string }) => {
    if (p.thiefName) stealThiefName = p.thiefName;
  };
  // The socket that emitted CREATE_ROOM is already the room's host display
  // (createRoom sets hostSocketId to it directly) - STEAL_SHOW's host
  // payload (io.to(room.hostSocketId)) reaches it with no extra attach step.
  host.on(ServerEvents.STEAL_SHOW, stealListener);

  const deadline = Date.now() + 180000;
  while (stealThiefName === null && Date.now() < deadline) {
    vip.emit(ClientEvents.VIP_SKIP_SOCRATES, {});
    await delay(500);
  }

  console.log(`\nsteal-thief (host event) captured: ${JSON.stringify(stealThiefName)}`);
  const ok = stealThiefName !== null && roster.includes(stealThiefName);
  console.log(ok ? '  ok   STEAL thiefName is a NOMINATIVE roster name (never a vocative form)' : '  FAIL STEAL banner never observed / not nominative');

  for (const p of players) p.disconnect();
  host.disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  for (const s of sockets) s.disconnect();
  process.exit(1);
});
