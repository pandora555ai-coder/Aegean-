// Task 320 - "Νέο παιχνίδι": a new room for the TV, the old one closed and its
// phones told; room instance ids; the VIP after a "same players" reset. The
// REAL server in-process on a throwaway port (the live Room is read directly),
// a console.log tee so its own lines are assertable, a real Vite client and a
// real phone page in Chromium for the phone-side criteria.
//
//   A  new game: TV + VIP press in one tick (+ a same-players press after):
//      one new room, logged no-ops, the TV moved, the old room torn down.
//   B  the real phone: stores the instance id, gets room:closed, forgets the
//      room and shows the closed text; a reload is a fresh visitor.
//   C  forced 4-digit code reuse: a resume carrying the old instance id is
//      refused (socket AND real phone), a legacy/fresh join is not.
//   D  "same players" with the VIP disconnected: a human gets VIP.
//
//   npx tsx dev/320-new-game-check.ts
process.env.PORT = process.env.SERVER_PORT ?? '3933';
process.env.POST_GAME_IDLE_MS_DEV = '600000';

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { io, type Socket } from 'socket.io-client';
import { chromium, type Browser, type Page } from 'playwright';
import { AVATAR_CATALOGUE, ClientEvents, PRESET_NAMES, ServerEvents } from '@game/shared';

const SERVER_PORT = Number(process.env.PORT);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? '5934');
const ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const CLIENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'client');
const CLOSED_TEXT = 'Το παιχνίδι έκλεισε. Σκάναρε το νέο QR στην τηλεόραση.';

interface LogLine {
  ts: number;
  text: string;
}
const serverLog: LogLine[] = [];
const realLog = console.log.bind(console);
console.log = (...args: unknown[]): void => {
  serverLog.push({ ts: Date.now(), text: args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') });
};
const say = (text: string): void => realLog(text);
const logsSince = (ts: number, needle: string): LogLine[] => serverLog.filter((l) => l.ts >= ts && l.text.includes(needle));

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail: string): void {
  if (ok) passed++;
  else failed++;
  say(`  ${ok ? 'ok  ' : 'FAIL'} ${label} — ${detail}`);
}

async function waitFor(pred: () => boolean | Promise<boolean>, timeoutMs: number, stepMs = 100): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await pred()) return true;
    await delay(stepMs);
  }
  return pred();
}

const sockets: Socket[] = [];
function connect(): Socket {
  const socket = io(ORIGIN, { transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  return socket;
}

interface Joined {
  socket: Socket;
  instanceId: string;
  closed: { code: string; instanceId: string }[];
}
function joinHuman(code: string, name: string, playerId: string, avatarId: string, instanceId?: string): Promise<Joined> {
  const socket = connect();
  const closed: Joined['closed'] = [];
  socket.on(ServerEvents.ROOM_CLOSED, (p: { code: string; instanceId: string }) => closed.push(p));
  return new Promise((resolve, reject) => {
    socket.once(ServerEvents.PLAYER_JOINED, (p: { instanceId: string }) => resolve({ socket, instanceId: p.instanceId, closed }));
    socket.once(ServerEvents.JOIN_REJECTED, (p: { reason: string }) => reject(new Error(p.reason)));
    socket.emit(ClientEvents.PLAYER_JOIN, { code, name, playerId, avatarId, instanceId });
  });
}

let clientProc: ChildProcess | null = null;
let browser: Browser | null = null;
async function cleanup(): Promise<void> {
  for (const s of sockets) s.disconnect();
  if (browser) await browser.close().catch(() => {});
  if (clientProc?.pid !== undefined) {
    try {
      process.kill(-clientProc.pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
}

async function storedSession(page: Page): Promise<Record<string, string> | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('lastSession');
    return raw ? JSON.parse(raw) : null;
  });
}

// A phone page whose stored session makes it auto-resume straight into `code`
// (Task 174's path) - the identity a real join would have saved.
async function openPhone(session: Record<string, string>, playerId: string): Promise<Page> {
  const page = await browser!.newPage({ viewport: { width: 360, height: 640 } });
  await page.goto(`http://localhost:${CLIENT_PORT}/play`);
  await page.evaluate(
    ([s, id]) => {
      localStorage.setItem('playerId', id);
      localStorage.setItem('lastSession', s);
    },
    [JSON.stringify(session), playerId] as const,
  );
  await page.reload();
  return page;
}

async function main(): Promise<void> {
  await import('../server/src/index.js');
  const { getRoom, createRoom, deleteRoom, armPostGameIdle } = await import('../server/src/state.js');
  const { spawnBots } = await import('../server/src/bots.js');
  const { prepareBlitzGame, getBlitzStatementIsTrue } = await import('../server/src/modes/blitz.js');
  clientProc = spawn('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], {
    cwd: CLIENT_DIR,
    stdio: 'ignore',
    detached: true,
    env: { ...process.env, VITE_SERVER_URL: `http://localhost:${SERVER_PORT}` },
  });
  const clientUp = await waitFor(async () => {
    try {
      return (await fetch(`http://localhost:${CLIENT_PORT}/`)).ok;
    } catch {
      return false;
    }
  }, 30000, 500);
  if (!clientUp) throw new Error('vite did not come up');
  browser = await chromium.launch();

  const avatars = AVATAR_CATALOGUE.map((a) => a.id);

  // ======================= A: new game ====================================
  say('--- A: new game ---');
  const host = connect();
  const hostCreated: string[] = [];
  const hostPhases: string[] = [];
  const hostLobbyCodes: string[] = [];
  host.on(ServerEvents.ROOM_CREATED, (p: { code: string }) => hostCreated.push(p.code));
  host.on(ServerEvents.PHASE_CHANGED, (p: { phase: string }) => hostPhases.push(p.phase));
  host.on(ServerEvents.LOBBY_UPDATE, (p: { code: string }) => hostLobbyCodes.push(p.code));
  host.emit(ClientEvents.CREATE_ROOM, { mode: 'blitz', speechPolicy: 'v1' });
  await waitFor(() => hostCreated.length === 1, 5000);
  const oldCode = hostCreated[0];
  const oldRoom = getRoom(oldCode)!;
  const oldInstance = oldRoom.instanceId;

  const vipId = randomUUID();
  const vip = await joinHuman(oldCode, PRESET_NAMES[0], vipId, avatars[0]);
  const phoneId = randomUUID();
  const phone = await openPhone({ code: oldCode, name: PRESET_NAMES[1], avatarId: avatars[1] }, phoneId);
  await waitFor(() => oldRoom.players.has(phoneId), 15000);
  oldRoom.requestedBotCount = 2;
  spawnBots(oldCode, 2);
  await waitFor(() => oldRoom.players.size === 4, 10000);
  const phoneSession = await storedSession(phone);
  check('B: phone stored the instance id with the code', phoneSession?.code === oldCode && phoneSession?.instanceId === oldInstance, JSON.stringify(phoneSession));
  check('A: joins carry the room instance id', vip.instanceId === oldInstance && /^[0-9a-f-]{36}$/.test(oldInstance), oldInstance);

  // What a finished game leaves behind: mode state in the WeakMap, the idle timer.
  prepareBlitzGame(oldRoom, 12, 2);
  const blitzBefore = getBlitzStatementIsTrue(oldRoom, 0);
  oldRoom.phase = 'GAME_OVER';
  armPostGameIdle(oldRoom);
  const idleArmed = oldRoom.postGameIdleTimer !== null;

  const t = Date.now();
  host.emit(ClientEvents.HOST_NEW_GAME, {});
  vip.socket.emit(ClientEvents.VIP_NEW_GAME, {});
  vip.socket.emit(ClientEvents.VIP_PLAY_AGAIN, {});
  await waitFor(() => hostCreated.length === 2, 5000);
  await delay(500);
  host.emit(ClientEvents.HOST_PLAY_AGAIN, {});
  host.emit(ClientEvents.HOST_NEW_GAME, {});
  await delay(500);
  const newCode = hostCreated[1];
  const newRoom = newCode ? getRoom(newCode) : undefined;
  const closedLogs = logsSince(t, 'closed for a new game -');
  const noOps = logsSince(t, 'an earlier press already won');
  check('A: first press wins - exactly one new room', closedLogs.length === 1 && hostCreated.length === 2, closedLogs[0]?.text ?? 'none');
  check('A: the four later presses (VIP new/same, TV same/new) are logged no-ops', noOps.length === 4, noOps.map((l) => l.text.slice(0, 80)).join(' | '));
  check('A: new code, new instance id', !!newRoom && newCode !== oldCode && newRoom.instanceId !== oldInstance, `${oldCode}/${oldInstance.slice(0, 8)} -> ${newCode}/${newRoom?.instanceId.slice(0, 8)}`);
  check('A: mode + speechPolicy carried', newRoom?.mode === 'blitz' && newRoom?.settings.speechPolicy === 'v1', `${newRoom?.mode} ${newRoom?.settings.speechPolicy}`);
  check('A: TV moved - host display of the new room, LOBBY + lobby update for it', newRoom?.hostSocketId === host.id && hostPhases[0] === 'LOBBY' && hostLobbyCodes.includes(newCode), `host ${newRoom?.hostSocketId === host.id}, TV phases ${hostPhases.join(',')} (the all-bot new room then self-starts, Task 217)`);
  check('A: idle timer cancelled by the press', idleArmed && oldRoom.postGameIdleTimer === null && logsSince(t, 'idle timer cancelled: new game').length === 1, logsSince(t, 'idle timer cancelled')[0]?.text ?? 'no log');
  check('A: old room deleted (deleteRoom)', getRoom(oldCode) === undefined, `getRoom(${oldCode}) undefined`);
  check('A: mode map cleared by deleteRoom', blitzBefore !== null && getBlitzStatementIsTrue(oldRoom, 0) === null, `blitz entry ${blitzBefore} -> ${getBlitzStatementIsTrue(oldRoom, 0)}`);
  check('A: old bots cleaned by deleteRoom', logsSince(t, `room ${oldCode}: cleaned up 2 bot(s)`).length === 1 && [...oldRoom.players.values()].every((p) => !p.isBot), logsSince(t, 'cleaned up')[0]?.text ?? 'no log');
  await waitFor(() => (newRoom?.players.size ?? 0) === 2, 5000);
  check('A: new room gets fresh bots, no humans', newRoom !== undefined && [...newRoom.players.values()].every((p) => p.isBot) && newRoom.players.size === 2, `${newRoom?.players.size} players`);
  check('A/2: old VIP socket got room:closed', vip.closed.length === 1 && vip.closed[0].code === oldCode && vip.closed[0].instanceId === oldInstance, JSON.stringify(vip.closed));

  // ======================= B: the real phone ==============================
  say('--- B: the phone ---');
  const closedVisible = await waitFor(async () => (await phone.getByTestId('room-closed').count()) === 1, 5000);
  const closedText = closedVisible ? await phone.getByTestId('room-closed').innerText() : '';
  check('B: phone shows the closed text', closedText === CLOSED_TEXT, JSON.stringify(closedText));
  const afterClose = await storedSession(phone);
  const keptId = await phone.evaluate(() => localStorage.getItem('playerId'));
  check("B: localStorage 'lastSession' cleared ('playerId' kept - identity)", afterClose === null && keptId === phoneId, `lastSession ${JSON.stringify(afterClose)}, playerId kept ${keptId === phoneId}`);
  const reloadT = Date.now();
  await phone.reload();
  await phone.getByTestId('code-input').waitFor({ timeout: 10000 });
  check('B: a reload is a fresh visitor (join form, no resume attempt)', (await phone.getByTestId('resuming-notice').count()) === 0 && logsSince(reloadT, 'reconnected').length === 0 && logsSince(reloadT, 'joined room').length === 0, 'code-input shown');

  // ======================= C: forced code reuse ===========================
  say('--- C: code reuse ---');
  // Force the next generated code to be the closed room's own code.
  const realRandom = Math.random;
  Math.random = () => (Number(oldCode) + 0.5) / 10000;
  const reused = createRoom('no-socket', 'quiz');
  Math.random = realRandom;
  check('C: the 4-digit code really was reused', reused.code === oldCode && reused.instanceId !== oldInstance, `${reused.code}, instance ${reused.instanceId.slice(0, 8)} vs old ${oldInstance.slice(0, 8)}`);
  const stranger = await joinHuman(reused.code, PRESET_NAMES[3], randomUUID(), avatars[3]);
  const sizeBefore = reused.players.size;
  let rejected = '';
  try {
    await joinHuman(oldCode, PRESET_NAMES[0], vipId, avatars[0], oldInstance);
  } catch (err) {
    rejected = (err as Error).message;
  }
  check('C: socket resume with the old instance id is rejected ROOM_CLOSED', rejected === 'ROOM_CLOSED' && reused.players.size === sizeBefore, `reason ${rejected}, roster ${sizeBefore}->${reused.players.size}`);
  // The same stale session on a real phone: refused, forgotten, fresh visitor.
  // (>= 1 refusal: StrictMode double-runs the resume effect in dev.)
  const stalePhoneId = randomUUID();
  const staleT = Date.now();
  const stalePhone = await openPhone({ code: oldCode, name: PRESET_NAMES[4], avatarId: avatars[4], instanceId: oldInstance }, stalePhoneId);
  await stalePhone.getByTestId('code-input').waitFor({ timeout: 10000 });
  const staleSession = await storedSession(stalePhone);
  check('C: real phone with a stale session: refused, session cleared, join form, not in the room', logsSince(staleT, 'is not the live').length >= 1 && staleSession === null && !reused.players.has(stalePhoneId) && (await stalePhone.getByTestId('room-closed').count()) === 0, `${logsSince(staleT, 'is not the live').length} refusal(s), lastSession ${JSON.stringify(staleSession)}, roster ${reused.players.size}`);
  // Counter-proof: the right instance id resumes; no instance id is a plain join.
  const ok = await joinHuman(reused.code, PRESET_NAMES[3], [...reused.players.keys()][0], avatars[3], reused.instanceId).then(() => true, () => false);
  check('C: a resume with the live instance id is accepted', ok, `room ${reused.code}`);
  stranger.socket.disconnect();
  deleteRoom(reused.code);

  // ======================= D: same players, VIP gone ======================
  say('--- D: same players with the VIP disconnected ---');
  const host2 = connect();
  const code2 = await new Promise<string>((resolve) => {
    host2.once(ServerEvents.ROOM_CREATED, (p: { code: string }) => resolve(p.code));
    host2.emit(ClientEvents.CREATE_ROOM, { mode: 'quiz' });
  });
  const room2 = getRoom(code2)!;
  const aId = randomUUID();
  const bId = randomUUID();
  const a = await joinHuman(code2, PRESET_NAMES[0], aId, avatars[0]);
  // Bots join BEFORE the second human, so join order is A, bot, bot, B: the
  // pre-320 migration (first connected PLAYER) handed VIP to a bot here.
  spawnBots(code2, 2);
  await waitFor(() => room2.players.size === 3, 5000);
  await joinHuman(code2, PRESET_NAMES[1], bId, avatars[1]);
  room2.phase = 'REVEAL';
  // D1: the VIP drops mid-game with bots still in - migration goes to a human.
  const d1 = Date.now();
  a.socket.disconnect();
  await waitFor(() => logsSince(d1, 'VIP transferred').length === 1, 3000);
  check('D: in-game VIP drop migrates to a human, never a bot', room2.vipPlayerId === bId, logsSince(d1, 'VIP transferred')[0]?.text ?? 'no log');
  // D2: the rebuild itself - VIP held by a seat that is gone at the reset.
  const { cleanupRoomBots } = await import('../server/src/bots.js');
  cleanupRoomBots(code2);
  room2.vipPlayerId = aId; // as if nothing had migrated it
  room2.phase = 'GAME_OVER';
  host2.emit(ClientEvents.HOST_PLAY_AGAIN, {});
  await waitFor(() => room2.phase === 'LOBBY', 3000);
  const b = room2.players.get(bId);
  check('D: "same players" reset hands VIP to the connected human', room2.vipPlayerId === bId && b?.isVip === true && !room2.players.has(aId), `vip ${room2.vipPlayerId === bId ? 'B' : room2.vipPlayerId}, roster ${room2.players.size}`);
  deleteRoom(code2);

  await cleanup();
  say(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  say(`harness error: ${err instanceof Error ? err.stack : String(err)}`);
  await cleanup();
  process.exit(1);
});
