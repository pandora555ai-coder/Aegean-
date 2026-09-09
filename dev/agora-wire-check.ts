// Task 207 - Η Μνήμη της Αγοράς: the phase-machine wiring check. Drives a
// standalone 'agora' room over the REAL socket protocol (socket.io-client
// against a dev server, the screenshot harness's own "bot at the socket
// level" pattern - no Playwright, no screenshots) and reports the task's
// four acceptance criteria, each with its numbers:
//
//   1. FLOW       expose -> 3 x (question -> reveal) -> GAME_OVER, sequence + duration
//   2. LEAKS      every payload of the round captured; scene fields only ever
//                 in agora_expose:show / agora_reveal:show, correctIndex only
//                 ever in agora_reveal:show
//   3. RECONNECT  a TV and a phone rejoin mid-EXPOSE (spec + remainingMs) and
//                 mid-QUESTION (question/options, NO scene fields)
//   4. PAUSE      pause 3s into the exposure, hold 30s, resume - remaining
//                 identical either side, then the round completes
//
// Plus a pure `--subjects` sweep: the reveal's subject resolution
// (server/src/agora.ts) cross-checked against the scene's truth over many
// seeds, since that resolver mirrors two of agora.ts's private tables.
//
//   PORT=4001 npx tsx dev/agora-wire-check.ts            # all four, against localhost:4001
//   npx tsx dev/agora-wire-check.ts --subjects [N]       # the pure sweep only
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { io, type Socket } from 'socket.io-client';
import {
  AGORA_EXPOSURE_MS,
  ClientEvents,
  ServerEvents,
  buildAgoraQuestions,
  generateAgora,
  type GamePhase,
} from '@game/shared';
import { agoraSubjectAgreesWithTruth, resolveAgoraSubject } from '../server/src/agora.js';

const PORT = Number(process.env.PORT) || 4001;
const ORIGIN = `http://127.0.0.1:${PORT}`;

interface Captured {
  t: number;
  side: 'host' | 'player';
  event: string;
  payload: unknown;
}

const SCENE_KEYS = new Set(['stalls', 'animals', 'spec', 'proof', 'scene', 'seed', 'colour', 'geeseN', 'slot', 'absentStalls']);
const SCENE_EVENTS_ALLOWED = new Set<string>([ServerEvents.AGORA_EXPOSE_SHOW, ServerEvents.AGORA_REVEAL_SHOW]);
const SCENE_SYNC_PHASES_ALLOWED = new Set<GamePhase>(['AGORA_EXPOSE', 'AGORA_REVEAL']);

function collectKeys(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, out);
  } else if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out.add(key);
      collectKeys(inner, out);
    }
  }
}

function keysOf(payload: unknown): Set<string> {
  const keys = new Set<string>();
  collectKeys(payload, keys);
  return keys;
}

function connect(): Socket {
  return io(ORIGIN, { transports: ['websocket'], forceNew: true });
}

function waitFor<T = unknown>(socket: Socket, event: string, timeoutMs = 15000, predicate?: (payload: T) => boolean): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    function handler(payload: T) {
      if (predicate && !predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
  });
}

class Capture {
  records: Captured[] = [];
  private t0 = Date.now();
  attach(socket: Socket, side: Captured['side']): void {
    socket.onAny((event: string, payload: unknown) => {
      this.records.push({ t: Date.now() - this.t0, side, event, payload });
    });
  }
}

interface PlayerSeat {
  playerId: string;
  name: string;
  avatarId: string;
}

// The scripted human: answers every agora question ~1s in with a random
// pick, exactly what a bot does over the same wire.
function wirePlayer(socket: Socket): void {
  socket.on(ServerEvents.AGORA_QUESTION_SHOW, (payload: { options?: string[]; answered?: boolean }) => {
    if (!payload.options || payload.answered) return;
    const choice = Math.floor(Math.random() * payload.options.length);
    setTimeout(() => socket.emit(ClientEvents.AGORA_SUBMIT, { choice }), 1000);
  });
}

async function joinPlayer(code: string, seat: PlayerSeat, capture: Capture): Promise<Socket> {
  const socket = connect();
  capture.attach(socket, 'player');
  wirePlayer(socket);
  const joined = waitFor(socket, ServerEvents.PLAYER_JOINED);
  socket.emit(ClientEvents.PLAYER_JOIN, { code, name: seat.name, playerId: seat.playerId, avatarId: seat.avatarId });
  await joined;
  return socket;
}

async function rejoinHost(code: string, capture: Capture): Promise<{ socket: Socket; sync: Record<string, unknown> }> {
  const socket = connect();
  capture.attach(socket, 'host');
  const sync = waitFor<Record<string, unknown>>(socket, ServerEvents.STATE_SYNC);
  socket.emit(ClientEvents.HOST_REJOIN, { code });
  return { socket, sync: await sync };
}

async function rejoinPlayer(code: string, seat: PlayerSeat, capture: Capture): Promise<{ socket: Socket; sync: Record<string, unknown> }> {
  const socket = connect();
  capture.attach(socket, 'player');
  wirePlayer(socket);
  const sync = waitFor<Record<string, unknown>>(socket, ServerEvents.STATE_SYNC);
  socket.emit(ClientEvents.PLAYER_JOIN, { code, name: seat.name, playerId: seat.playerId, avatarId: seat.avatarId });
  return { socket, sync: await sync };
}

interface StartedRoom {
  code: string;
  host: Socket;
  player: Socket;
  seat: PlayerSeat;
  capture: Capture;
  startedAt: number;
}

async function startAgoraRoom(botCount: number): Promise<StartedRoom> {
  const capture = new Capture();
  const host = connect();
  capture.attach(host, 'host');
  const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED);
  host.emit(ClientEvents.CREATE_ROOM, { botCount });
  const { code } = await created;

  const seat: PlayerSeat = { playerId: randomUUID(), name: 'Αργύρης', avatarId: 'sphinx' };
  const player = await joinPlayer(code, seat, capture);
  // Bots join asynchronously - wait until the lobby reports the full roster.
  await waitFor<{ players: unknown[] }>(player, ServerEvents.LOBBY_UPDATE, 15000, (p) => p.players.length >= botCount + 1);
  const modeSet = waitFor<{ mode: string }>(player, ServerEvents.LOBBY_UPDATE, 5000, (p) => p.mode === 'agora');
  player.emit(ClientEvents.VIP_SET_MODE, { mode: 'agora' });
  await modeSet;
  const startedAt = Date.now();
  player.emit(ClientEvents.VIP_START_GAME, {});
  return { code, host, player, seat, capture, startedAt };
}

function phaseSequence(capture: Capture, side: Captured['side']): { phase: GamePhase; t: number }[] {
  return capture.records
    .filter((r) => r.side === side && r.event === ServerEvents.PHASE_CHANGED)
    .map((r) => ({ phase: (r.payload as { phase: GamePhase }).phase, t: r.t }));
}

// ---------------------------------------------------------------------------
// Criteria 1-3: one room
// ---------------------------------------------------------------------------
async function runFlowLeaksReconnect(): Promise<void> {
  const room = await startAgoraRoom(2);
  const { code, capture, seat } = room;
  let host = room.host;
  let player = room.player;

  const gameOver = waitFor(host, ServerEvents.GAME_OVER, 240000);

  // --- criterion 3a: reconnect both a TV and a phone mid-EXPOSE
  await waitFor(host, ServerEvents.PHASE_CHANGED, 15000, (p: { phase: string }) => p.phase === 'AGORA_EXPOSE');
  await delay(2000);
  host.disconnect();
  const hostExpose = await rejoinHost(code, capture);
  host = hostExpose.socket;
  const gameOverOnNewHost = waitFor(host, ServerEvents.GAME_OVER, 240000);
  player.disconnect();
  const playerExpose = await rejoinPlayer(code, seat, capture);
  player = playerExpose.socket;

  // --- criterion 3b: reconnect both mid-QUESTION (the first one)
  await waitFor(host, ServerEvents.PHASE_CHANGED, 30000, (p: { phase: string }) => p.phase === 'AGORA_QUESTION');
  await delay(400);
  host.disconnect();
  const hostQuestion = await rejoinHost(code, capture);
  host = hostQuestion.socket;
  const gameOverOnNewestHost = waitFor(host, ServerEvents.GAME_OVER, 240000);
  player.disconnect();
  const playerQuestion = await rejoinPlayer(code, seat, capture);
  player = playerQuestion.socket;

  await Promise.race([gameOver, gameOverOnNewHost, gameOverOnNewestHost]);
  const totalMs = Date.now() - room.startedAt;
  await delay(300);
  host.disconnect();
  player.disconnect();

  // --- criterion 1
  const seq = phaseSequence(capture, 'host');
  console.log('\n== 1. FLOW ==');
  console.log(`phase sequence (host, ms since start): ${seq.map((s) => `${s.phase}@${s.t}`).join(' -> ')}`);
  const phasesOnly = seq.map((s) => s.phase);
  const questions = phasesOnly.filter((p) => p === 'AGORA_QUESTION').length;
  const reveals = phasesOnly.filter((p) => p === 'AGORA_REVEAL').length;
  console.log(
    `expose=${phasesOnly.filter((p) => p === 'AGORA_EXPOSE').length} questions=${questions} reveals=${reveals} socrates=${phasesOnly.filter((p) => p === 'SOCRATES').length} gameOver=${phasesOnly.includes('GAME_OVER')}`,
  );
  console.log(`total stage duration: ${totalMs} ms (${(totalMs / 1000).toFixed(1)} s) - limit 240 s -> ${totalMs <= 240000 ? 'PASS' : 'FAIL'}`);

  // --- criterion 2
  console.log('\n== 2. LEAKS ==');
  const all = capture.records;
  let sceneOutside = 0;
  let correctIndexOutside = 0;
  const sceneOffenders: string[] = [];
  const ciOffenders: string[] = [];
  for (const r of all) {
    const keys = keysOf(r.payload);
    const hasScene = [...keys].some((k) => SCENE_KEYS.has(k));
    const hasCi = keys.has('correctIndex');
    const syncPhase = r.event === ServerEvents.STATE_SYNC ? (r.payload as { phase: GamePhase }).phase : null;
    const sceneAllowed = SCENE_EVENTS_ALLOWED.has(r.event) || (syncPhase !== null && SCENE_SYNC_PHASES_ALLOWED.has(syncPhase));
    const ciAllowed = r.event === ServerEvents.AGORA_REVEAL_SHOW || syncPhase === 'AGORA_REVEAL';
    if (hasScene && !sceneAllowed) {
      sceneOutside += 1;
      sceneOffenders.push(`${r.side}:${r.event}${syncPhase ? `(${syncPhase})` : ''}`);
    }
    if (hasCi && !ciAllowed) {
      correctIndexOutside += 1;
      ciOffenders.push(`${r.side}:${r.event}${syncPhase ? `(${syncPhase})` : ''}`);
    }
  }
  const byEvent = new Map<string, number>();
  for (const r of all) byEvent.set(r.event, (byEvent.get(r.event) ?? 0) + 1);
  console.log(`payloads captured (host + phone, whole round incl. reconnect syncs): ${all.length}`);
  console.log(`by event: ${[...byEvent.entries()].map(([e, n]) => `${e}=${n}`).join(', ')}`);
  console.log(`payloads with scene fields outside AGORA_EXPOSE/AGORA_REVEAL: ${sceneOutside} ${sceneOffenders.length ? sceneOffenders.join(', ') : ''}`);
  console.log(`payloads with correctIndex outside an AGORA_REVEAL: ${correctIndexOutside} ${ciOffenders.length ? ciOffenders.join(', ') : ''}`);
  const sceneCarriers = all.filter((r) => [...keysOf(r.payload)].some((k) => SCENE_KEYS.has(k)));
  console.log(`(for scale: ${sceneCarriers.length} payloads legitimately carried scene fields: ${[...new Set(sceneCarriers.map((r) => `${r.side}:${r.event}`))].join(', ')})`);
  const questionShows = all.filter((r) => r.event === ServerEvents.AGORA_QUESTION_SHOW);
  const questionShowKeys = new Set<string>();
  for (const r of questionShows) for (const k of keysOf(r.payload)) questionShowKeys.add(k);
  console.log(`agora_question:show payloads=${questionShows.length}, union of their keys: ${[...questionShowKeys].sort().join(', ')}`);

  // --- criterion 3
  console.log('\n== 3. RECONNECT FAIRNESS ==');
  const describe = (label: string, sync: Record<string, unknown>) => {
    const keys = keysOf(sync);
    const scene = [...keys].filter((k) => SCENE_KEYS.has(k));
    console.log(
      `${label}: phase=${String(sync.phase)} remainingMs=${String(sync.remainingMs)} keys=[${Object.keys(sync).sort().join(',')}] sceneKeys=[${scene.join(',')}] correctIndex=${keys.has('correctIndex')}`,
    );
  };
  describe('TV mid-EXPOSE   ', hostExpose.sync);
  describe('phone mid-EXPOSE', playerExpose.sync);
  describe('TV mid-QUESTION ', hostQuestion.sync);
  describe('phone mid-QUESTION', playerQuestion.sync);
  const exposeOk =
    hostExpose.sync.phase === 'AGORA_EXPOSE' && 'spec' in hostExpose.sync && typeof hostExpose.sync.remainingMs === 'number' &&
    playerExpose.sync.phase === 'AGORA_EXPOSE' && 'spec' in playerExpose.sync;
  const questionOk =
    hostQuestion.sync.phase === 'AGORA_QUESTION' && 'question' in hostQuestion.sync && 'options' in hostQuestion.sync &&
    ![...keysOf(hostQuestion.sync)].some((k) => SCENE_KEYS.has(k)) && !keysOf(hostQuestion.sync).has('correctIndex') &&
    playerQuestion.sync.phase === 'AGORA_QUESTION' && 'options' in playerQuestion.sync &&
    ![...keysOf(playerQuestion.sync)].some((k) => SCENE_KEYS.has(k)) && !keysOf(playerQuestion.sync).has('correctIndex');
  console.log(`mid-EXPOSE snapshots carry spec + remainingMs: ${exposeOk ? 'PASS' : 'FAIL'}`);
  console.log(`mid-QUESTION snapshots carry question/options and NO scene fields / correctIndex: ${questionOk ? 'PASS' : 'FAIL'}`);
}

// ---------------------------------------------------------------------------
// Criterion 4: pause - its own room
// ---------------------------------------------------------------------------
async function runPause(): Promise<void> {
  console.log('\n== 4. PAUSE ==');
  const room = await startAgoraRoom(2);
  const { code, host, player, capture } = room;
  const gameOver = waitFor(host, ServerEvents.GAME_OVER, 300000);

  const exposeAt = capture.records.find((r) => r.side === 'host' && r.event === ServerEvents.PHASE_CHANGED && (r.payload as { phase: string }).phase === 'AGORA_EXPOSE')
    ? Date.now()
    : (await waitFor(host, ServerEvents.PHASE_CHANGED, 15000, (p: { phase: string }) => p.phase === 'AGORA_EXPOSE'), Date.now());
  await delay(3000);
  const paused = waitFor(player, ServerEvents.GAME_PAUSED);
  player.emit(ClientEvents.GAME_PAUSE, {});
  await paused;
  const pausedAt = Date.now();
  const elapsedBeforePause = pausedAt - exposeAt;

  // The frozen remaining, read off a fresh TV's state:sync while paused.
  const probe = await rejoinHost(code, capture);
  const pre = probe.sync.remainingMs as number;
  const preDuration = (probe.sync as { durationMs?: number }).durationMs;
  console.log(`paused ${elapsedBeforePause} ms into AGORA_EXPOSE; frozen remainingMs (state:sync while paused) = ${pre} (durationMs field = ${preDuration})`);

  console.log('holding the pause for 30 s of wall clock...');
  await delay(30000);
  const probe2 = await rejoinHost(code, capture);
  const preAfterHold = probe2.sync.remainingMs as number;
  const resumed = waitFor<{ remainingMs: number }>(player, ServerEvents.GAME_RESUMED);
  player.emit(ClientEvents.GAME_RESUME, {});
  const post = (await resumed).remainingMs;
  const resumedAt = Date.now();
  const nextPhase = await waitFor<{ phase: string }>(probe2.socket, ServerEvents.PHASE_CHANGED, 30000);
  const ranFor = Date.now() - resumedAt;
  console.log(`remainingMs: frozen at pause = ${pre}, frozen after 30 s hold = ${preAfterHold}, on GAME_RESUMED = ${post} -> drift ${post - pre} ms (${post === pre ? 'PASS, 0 ms' : 'FAIL'})`);
  console.log(`after resume the exposure ran ${ranFor} ms more before ${nextPhase.phase} (expected ~${post} ms; AGORA_EXPOSURE_MS=${AGORA_EXPOSURE_MS})`);

  await gameOver;
  const seq = phaseSequence(capture, 'host').map((s) => s.phase);
  console.log(`round then completed: ${seq.join(' -> ')} (${Date.now() - room.startedAt} ms total incl. the 30 s hold)`);
  probe.socket.disconnect();
  probe2.socket.disconnect();
  host.disconnect();
  player.disconnect();
}

// ---------------------------------------------------------------------------
// Pure: subject resolution vs truth
// ---------------------------------------------------------------------------
function runSubjects(seeds: number): void {
  let unresolved = 0;
  let disagree = 0;
  const byKind = { existence: 0, colour: 0, count: 0 };
  for (let seed = 1; seed <= seeds; seed += 1) {
    const scene = generateAgora(seed);
    for (const q of buildAgoraQuestions(scene, seed)) {
      byKind[q.kind] += 1;
      if (!resolveAgoraSubject(scene, q)) unresolved += 1;
      else if (!agoraSubjectAgreesWithTruth(scene, q)) disagree += 1;
    }
  }
  console.log(`\n== SUBJECTS (pure) == seeds=${seeds} questions=${seeds * 3} (${JSON.stringify(byKind)}) unresolved=${unresolved} disagreeWithTruth=${disagree}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === '--subjects') {
    runSubjects(Number(args[1]) || 20000);
    return;
  }
  runSubjects(20000);
  await runFlowLeaksReconnect();
  await runPause();
  console.log('\ndone');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
