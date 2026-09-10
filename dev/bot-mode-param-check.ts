// Task 222 - ?bot=N&mode=X: a bot room that is already in the mode it was
// asked for. Drives real rooms over the REAL socket protocol (socket.io-
// client, the "bot at the socket level" pattern every dev/* harness here
// already uses - no Playwright, no screenshots) and reports the task's four
// acceptance criteria, each from OBSERVATION of a running server.
//
// The server runs IN-PROCESS (imported, not spawned) on a throwaway port, so
// the harness can read `room.mode`, `room.vipPlayerId` and every
// `player.isVip` STRAIGHT OFF the live Room object - criterion 4 needs VIP
// ownership mid-game, and no socket payload carries isVip outside LOBBY.
// The host socket still emits exactly the CREATE_ROOM payload HostScreen
// builds for the URL under test, and nothing else reaches in.
//
//   1. MODE=FULL      ?bot=6&mode=full: room.mode is 'full' BEFORE start
//                     (in-process AND on the wire's lobby:update), then one
//                     complete run - the 7-stage lineup in order, with the
//                     wall clock. Criterion 4 rides along on this same run.
//   2. NO PARAM       ?bot=6, no mode: still 'quiz', full run, stage sequence
//   3a. AUTOSTART     ?bot=6&mode=full starts at 6 of 6 bots, not earlier
//   3b. HUMAN GUARD   same URL + one human socket: autostart suppressed
//   4. VIP            no bot ever holds VIP during criterion 1's run
//
//   npx tsx dev/bot-mode-param-check.ts --only 1 --port 3910 --log dev/222-c1.log
//   npx tsx dev/bot-mode-param-check.ts --only 2 --port 3911 --log dev/222-c2.log
//   npx tsx dev/bot-mode-param-check.ts --only 3a --port 3912
//   npx tsx dev/bot-mode-param-check.ts --only 3b --port 3913
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { io, type Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents, GAME_MODE_IDS, MAX_BOTS, type GameModeId } from '@game/shared';

const args = process.argv.slice(2);
function flag(name: string, fallback: string): string {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const ONLY = flag('only', '1');
const PORT = flag('port', '3910');
const LOG_PATH = path.resolve(import.meta.dirname, '..', flag('log', `dev/222-c${ONLY}.log`));

// Every line goes to the file as it happens (appendFileSync, no buffering):
// criterion 1 runs ~15 minutes and the session driving this may drop before
// it finishes - the measurement has to survive that.
fs.writeFileSync(LOG_PATH, '');
function log(line: string): void {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  fs.appendFileSync(LOG_PATH, `${stamped}\n`);
  console.log(stamped);
}

process.env.PORT = PORT;
process.env.NODE_ENV = 'development';
const ORIGIN = `http://127.0.0.1:${PORT}`;

// Import order matters only in that the server must be listening before any
// socket connects; both specifiers resolve to the SAME module instances, so
// getRoom below is the live rooms Map the handlers write to.
await import('../server/src/index.js');
const { getRoom, getConnectedPlayers, canStartRoom } = await import('../server/src/state.js');
const { wireHostSocratesAck } = await import('../server/src/bots.js');
await delay(500);

const sockets: Socket[] = [];
function connect(): Socket {
  const s = io(ORIGIN, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  return s;
}

function waitFor<T = Record<string, unknown>>(socket: Socket, event: string, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for ${event} after ${timeoutMs}ms`));
    }, timeoutMs);
    function handler(p: T) {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(p);
    }
    socket.on(event, handler);
  });
}

function fmt(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

// EXACTLY what client/src/screens/HostScreen.tsx's handleCreateRoom builds
// for a given /host URL - copied in shape, so what this harness puts on the
// wire is what a real TV at that URL puts on the wire.
function createRoomPayloadForUrl(search: string): { botCount?: number; mode?: GameModeId } {
  const params = new URLSearchParams(search);
  const botParam = Number(params.get('bot'));
  const botCount = Number.isFinite(botParam) ? Math.max(0, Math.min(MAX_BOTS, Math.floor(botParam))) : 0;
  const modeParam = params.get('mode');
  const mode =
    modeParam && (GAME_MODE_IDS as readonly string[]).includes(modeParam) ? (modeParam as GameModeId) : null;
  return { ...(botCount > 0 ? { botCount } : {}), ...(mode ? { mode } : {}) };
}

interface LobbyLite {
  players: { playerId: string; name: string; connected: boolean; isVip: boolean }[];
  canStart: boolean;
  mode: string;
}

// A full run: create the room from `url`, watch every phase and stage, and
// sample VIP ownership off the LIVE Room throughout. Returns when GAME_OVER
// lands (or the deadline passes, which is reported, never retried).
async function runWholeGame(url: string, deadlineMs: number): Promise<void> {
  const host = connect();
  wireHostSocratesAck(host);
  const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
  const payload = createRoomPayloadForUrl(url);
  log(`host emits ${ClientEvents.CREATE_ROOM} ${JSON.stringify(payload)}   (from /host${url})`);
  host.emit(ClientEvents.CREATE_ROOM, payload);
  const { code } = await created;
  const room = getRoom(code)!;
  log(`room ${code} created - in-process room.mode = '${room.mode}'`);

  let lastLobby: LobbyLite | null = null;
  host.on(ServerEvents.LOBBY_UPDATE, (p: LobbyLite) => {
    lastLobby = p;
    log(`lobby:update  players=${p.players.length} canStart=${p.canStart} mode='${p.mode}'`);
  });

  const stages: string[] = [];
  const phases: string[] = [];
  let started = 0;
  let gameOverAt = 0;
  host.on(ServerEvents.PHASE_CHANGED, (p: { phase: string }) => {
    if (started === 0 && p.phase !== 'LOBBY') {
      started = Date.now();
      log(
        `START - phase left LOBBY at ${getConnectedPlayers(room).length} connected player(s); ` +
          `wire mode='${lastLobby?.mode}' in-process mode='${room.mode}'`,
      );
      log(vipLine(code, 'at start'));
    }
    if (phases[phases.length - 1] !== p.phase) phases.push(p.phase);
    log(`phase:changed ${p.phase}${started ? ` (+${fmt(Date.now() - started)})` : ''}`);
    if (p.phase === 'GAME_OVER') gameOverAt = Date.now();
  });
  host.on(ServerEvents.STAGE_ANNOUNCE, (p: { stage: number; totalStages: number; title: string }) => {
    stages.push(`${p.stage}/${p.totalStages} ${p.title}`);
    log(`stage:announce ${p.stage}/${p.totalStages} "${p.title}"  ${vipLine(code, 'at stage')}`);
  });

  // VIP sample every 15s for the whole run - criterion 4's "mid-game".
  const vipTimer = setInterval(() => log(vipLine(code, 'sample')), 15000);

  const deadline = Date.now() + deadlineMs;
  while (!gameOverAt && Date.now() < deadline) {
    await delay(1000);
  }
  clearInterval(vipTimer);

  if (!gameOverAt) {
    log(`DEADLINE HIT after ${fmt(deadlineMs)} - stopped at phase '${room.phase}', stage ${room.stage}`);
  } else {
    log(`GAME_OVER reached - total wall clock from start: ${fmt(gameOverAt - started)}`);
  }
  log(vipLine(code, 'at end'));
  log(`STAGE SEQUENCE (${stages.length}): ${stages.join(' | ')}`);
  log(`PHASE SEQUENCE (${phases.length} transitions): ${phases.join(' -> ')}`);
}

// Criterion 4's observation: read the LIVE Room, not a payload. Reports the
// holder's playerId, whether that player is a bot, and every player's own
// isVip flag - a bot holding VIP would show up in either half.
function vipLine(code: string, label: string): string {
  const room = getRoom(code);
  if (!room) return `VIP[${label}] room gone`;
  const holder = room.vipPlayerId ? room.players.get(room.vipPlayerId) : undefined;
  const flagged = [...room.players.values()].filter((p) => p.isVip);
  return (
    `VIP[${label}] vipPlayerId=${room.vipPlayerId ?? 'null'} ` +
    `holder=${holder ? `${holder.name} isBot=${holder.isBot}` : 'none'} ` +
    `isVip-flagged=[${flagged.map((p) => `${p.name}(isBot=${p.isBot})`).join(',') || 'none'}] ` +
    `bots=${[...room.players.values()].filter((p) => p.isBot).length}/${room.players.size}`
  );
}

// 'cerberus' is deliberate: only SEVEN avatars have art today
// (server/src/avatars.ts cross-references client/public/avatars), bots take
// the first six by catalogue order, and a human on one of THOSE six gets
// that bot's join REJECTED (AVATAR_TAKEN) with no retry - a real, pre-existing
// ?bot=N behaviour, but not what criterion 3b is measuring.
async function joinHuman(code: string, name: string, avatarId = 'cerberus'): Promise<string> {
  const socket = connect();
  const playerId = randomUUID();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('player:join timed out')), 15000);
    socket.on(ServerEvents.PLAYER_JOINED, () => {
      clearTimeout(timer);
      resolve();
    });
    socket.on(ServerEvents.JOIN_REJECTED, (p: { reason?: string }) => {
      clearTimeout(timer);
      reject(new Error(`join rejected: ${p?.reason}`));
    });
    socket.emit(ClientEvents.PLAYER_JOIN, { code, name, playerId, avatarId });
  });
  return playerId;
}

// 3a - the room must not start before ALL requested bots are in.
async function criterion3a(): Promise<void> {
  const host = connect();
  const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
  const payload = createRoomPayloadForUrl('?bot=6&mode=full');
  host.emit(ClientEvents.CREATE_ROOM, payload);
  const { code } = await created;
  const room = getRoom(code)!;
  log(`room ${code} created with ${JSON.stringify(payload)} - mode='${room.mode}'`);

  const joinCounts: number[] = [];
  host.on(ServerEvents.LOBBY_UPDATE, (p: LobbyLite) => {
    joinCounts.push(p.players.length);
    log(`lobby:update players=${p.players.length} canStart=${p.canStart} mode='${p.mode}' phase='${room.phase}'`);
  });

  let startedAtCount = -1;
  host.on(ServerEvents.PHASE_CHANGED, (p: { phase: string }) => {
    if (startedAtCount < 0 && p.phase !== 'LOBBY') {
      startedAtCount = getConnectedPlayers(room).length;
      log(`AUTOSTART fired: first non-LOBBY phase '${p.phase}' at ${startedAtCount} connected bot(s)`);
    }
  });

  const deadline = Date.now() + 60000;
  while (startedAtCount < 0 && Date.now() < deadline) await delay(200);
  log(`lobby:update player counts seen while still in LOBBY: [${joinCounts.join(', ')}]`);
  log(`RESULT 3a: started at ${startedAtCount} of ${payload.botCount} bots; mode at start = '${room.mode}'`);
}

// 3b - one human anywhere in the roster suppresses autostart, permanently.
async function criterion3b(): Promise<void> {
  const host = connect();
  const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
  const payload = createRoomPayloadForUrl('?bot=6&mode=full');
  host.emit(ClientEvents.CREATE_ROOM, payload);
  const { code } = await created;
  const room = getRoom(code)!;
  log(`room ${code} created with ${JSON.stringify(payload)} - mode='${room.mode}'`);

  const humanId = await joinHuman(code, 'Ανθρωπος');
  log(`human joined playerId=${humanId.slice(0, 8)} - ${vipLine(code, 'after human join')}`);

  // Watch for a full 30s AFTER the roster fills: MAX_BOTS is 7, so 6 bots +
  // 1 human is a legal roster and every bot really does get in.
  const deadline = Date.now() + 45000;
  let phaseLeftLobby = '';
  host.on(ServerEvents.PHASE_CHANGED, (p: { phase: string }) => {
    if (p.phase !== 'LOBBY' && !phaseLeftLobby) phaseLeftLobby = p.phase;
  });
  while (Date.now() < deadline) {
    await delay(5000);
    log(
      `t+${fmt(45000 - (deadline - Date.now()))} phase='${room.phase}' ` +
        `connected=${getConnectedPlayers(room).length} canStart=${canStartRoom(room)} ` +
        `bots=${[...room.players.values()].filter((p) => p.isBot).length} ${vipLine(code, 'watch')}`,
    );
    if (phaseLeftLobby) break;
  }
  log(
    `RESULT 3b: autostart ${phaseLeftLobby ? `FIRED (phase ${phaseLeftLobby}) - SUPPRESSION FAILED` : 'did NOT fire'}; ` +
      `final phase='${room.phase}', roster=${room.players.size} (${[...room.players.values()].filter((p) => p.isBot).length} bots + human), ` +
      `canStart=${canStartRoom(room)}`,
  );
}

const DEADLINE_MS = 30 * 60 * 1000;
log(`=== Task 222 criterion ${ONLY} on port ${PORT} ===`);
if (ONLY === '1') await runWholeGame('?bot=6&mode=full', DEADLINE_MS);
else if (ONLY === '2') await runWholeGame('?bot=6', DEADLINE_MS);
else if (ONLY === '3a') await criterion3a();
else if (ONLY === '3b') await criterion3b();
else throw new Error(`unknown --only '${ONLY}'`);
log(`=== criterion ${ONLY} done ===`);
for (const s of sockets) s.disconnect();
process.exit(0);
