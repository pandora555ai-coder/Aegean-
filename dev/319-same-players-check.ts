// Task 319 - "Ξανά, ίδια παρέα": game 1 -> same players -> game 2, and the
// post-game idle timer. Socket-level, no browser: the REAL server in-process on
// a throwaway port (so the live Room can be read between games), a console.log
// tee so the server's own lines are assertable, two real human sockets (the
// first is VIP) plus three server bots, a standalone `quiz` room at
// gameLength 'short' - which still ends in the climb, so the climb object and
// the spear latch are exercised.
//
//   A  game 1 -> host AND VIP press in the same tick -> game 2 to GAME_OVER:
//      one reset, one logged no-op; everything per-game fresh; survivors kept;
//      no game-1 question dealt again; no game-1 line spoken again unless its
//      pool recycled; a late game-1 socrates:audio_ended rejected as stale.
//   B  game 2's GAME_OVER left alone: the idle timer plays again by itself.
//   C  no humans left cancels the timer; a human coming back re-arms it.
//   D  deleteRoom cancels the timer.
//   E  pure: the dev override fails closed, the mode-state registry clears,
//      blitz/numeric draws avoid seen content until the pool runs out.
//
//   npx tsx dev/319-same-players-check.ts
//
// POST_GAME_IDLE_MS_DEV shortens the 5-minute timer; it is read only when
// NODE_ENV is not 'production' (scenario E proves the prod side).
process.env.PORT = process.env.SERVER_PORT ?? '3931';
process.env.POST_GAME_IDLE_MS_DEV = process.env.POST_GAME_IDLE_MS_DEV ?? '5000';

import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { io, type Socket } from 'socket.io-client';
import { AVATAR_CATALOGUE, ClientEvents, DUEL_WEAPONS, PRESET_NAMES, ServerEvents } from '@game/shared';

const SERVER_PORT = Number(process.env.PORT);
const ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const IDLE_MS = Number(process.env.POST_GAME_IDLE_MS_DEV);
const GAME_DEADLINE_MS = 15 * 60_000;

// --- server log tee (277/303's pattern) -----------------------------------
interface LogLine {
  ts: number;
  text: string;
}
const serverLog: LogLine[] = [];
const realLog = console.log.bind(console);
console.log = (...args: unknown[]): void => {
  const text = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  serverLog.push({ ts: Date.now(), text });
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

async function waitFor(pred: () => boolean, timeoutMs: number, stepMs = 100): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (pred()) return true;
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

// A human phone that answers everything a quiz+climb game asks of it at once.
function wireHuman(socket: Socket): void {
  socket.on(ServerEvents.QUESTION_SHOW, (p: { options?: string[] }) => {
    if (p.options) socket.emit(ClientEvents.SUBMIT_ANSWER, { choice: Math.floor(Math.random() * p.options.length) });
  });
  socket.on(ServerEvents.CLIMB_QUESTION_SHOW, (p: { options?: string[]; climbing?: boolean; eliminated?: boolean }) => {
    if (p.options && p.climbing !== false && !p.eliminated) {
      socket.emit(ClientEvents.CLIMB_SUBMIT, { choice: Math.floor(Math.random() * p.options.length) });
    }
  });
  socket.on(ServerEvents.STEAL_SHOW, (p: { youAreThief?: boolean; targets?: { playerId: string }[] }) => {
    if (p.youAreThief && p.targets && p.targets.length > 0) {
      socket.emit(ClientEvents.STEAL_CHOOSE, { targetPlayerId: p.targets[0].playerId });
    }
  });
  socket.on(ServerEvents.DUEL_PICK_SHOW, (p: { youDuel?: boolean; picked?: boolean }) => {
    if (p.youDuel && !p.picked) socket.emit(ClientEvents.DUEL_PICK, { weapon: DUEL_WEAPONS[0] });
  });
}

function joinHuman(code: string, name: string, playerId: string, avatarId: string): Promise<Socket> {
  const socket = connect();
  wireHuman(socket);
  return new Promise((resolve, reject) => {
    socket.once(ServerEvents.PLAYER_JOINED, () => resolve(socket));
    socket.once(ServerEvents.JOIN_REJECTED, (p: unknown) => reject(new Error(`join rejected: ${JSON.stringify(p)}`)));
    socket.emit(ClientEvents.PLAYER_JOIN, { code, name, playerId, avatarId });
  });
}

async function main(): Promise<void> {
  await import('../server/src/index.js');
  const state = await import('../server/src/state.js');
  const { getRoom, deleteRoom, armPostGameIdle, postGameIdleMs, createRoom, rebuildRoomForNewGame } = state;
  const { spawnBots, cleanupRoomBots } = await import('../server/src/bots.js');
  const { GAME_INTRO_SEQUENCE, ANAVASIS_INTRO_SEQUENCE, CORONATION_SETS } = await import('../server/src/socrates.js');
  const { prepareBlitzGame, getBlitzStatementIsTrue } = await import('../server/src/modes/blitz.js');
  const { prepareNumericGame } = await import('../server/src/modes/numeric.js');
  await delay(300);

  // --- host: acks every beat 30ms after it shows, records what it saw ------
  const host = connect();
  const shows: { beatId: number; kind: string; template: string; game: number }[] = [];
  let game = 1;
  let gameOvers = 0;
  let staleAckPlan: { staleId: number; sent: boolean } | null = null;
  host.on(ServerEvents.SOCRATES_SHOW, (p: { beatId: number; kind: string; lineTemplate?: string }) => {
    shows.push({ beatId: p.beatId, kind: p.kind, template: p.lineTemplate ?? '', game });
    if (staleAckPlan && !staleAckPlan.sent && game === 2) {
      staleAckPlan.sent = true;
      host.emit(ClientEvents.SOCRATES_AUDIO_ENDED, { beatId: staleAckPlan.staleId });
    }
    setTimeout(() => host.emit(ClientEvents.SOCRATES_AUDIO_ENDED, { beatId: p.beatId }), 30);
  });
  host.on(ServerEvents.GAME_OVER, () => gameOvers++);
  let climbShowsGame2 = 0;
  let spearLatchAtGame2ClimbStart: boolean | null = null;
  let climbObjectGame1: unknown = null;
  let climbObjectFresh = false;
  let code = '';
  host.on(ServerEvents.CLIMB_QUESTION_SHOW, () => {
    if (game !== 2) return;
    climbShowsGame2++;
    if (climbShowsGame2 === 1) {
      const climb = getRoom(code)?.climb ?? null;
      spearLatchAtGame2ClimbStart = climb ? climb.spearBeatPlayed : null;
      climbObjectFresh = climb !== null && climb !== climbObjectGame1;
    }
  });

  code = await new Promise<string>((resolve) => {
    host.once(ServerEvents.ROOM_CREATED, (p: { code: string }) => resolve(p.code));
    host.emit(ClientEvents.CREATE_ROOM, { mode: 'quiz' });
  });
  const room = getRoom(code)!;
  say(`room ${code} (mode ${room.mode}), idle override ${IDLE_MS}ms`);

  const avatars = AVATAR_CATALOGUE.map((a) => a.id);
  const humans = [
    { name: PRESET_NAMES[0], playerId: randomUUID(), avatarId: avatars[0] },
    { name: PRESET_NAMES[1], playerId: randomUUID(), avatarId: avatars[1] },
  ];
  const vip = await joinHuman(code, humans[0].name, humans[0].playerId, humans[0].avatarId);
  let other = await joinHuman(code, humans[1].name, humans[1].playerId, humans[1].avatarId);
  vip.emit(ClientEvents.VIP_UPDATE_SETTINGS, { gameLength: 'short', questionTimeMs: 10000 });
  room.requestedBotCount = 3;
  spawnBots(code, 3);
  await waitFor(() => room.players.size === 5, 10000);
  const settingsBefore = JSON.stringify(room.settings);
  const botIdsGame1 = [...room.players.values()].filter((p) => p.isBot).map((p) => p.playerId);
  say(`roster: ${room.players.size} (2 humans, ${botIdsGame1.length} bots), settings ${settingsBefore}`);

  // ======================= A: game 1 ======================================
  say('\n--- A: game 1 ---');
  const g1Start = Date.now();
  vip.emit(ClientEvents.VIP_START_GAME, {});
  await waitFor(() => gameOvers === 1, GAME_DEADLINE_MS, 500);
  check('A: game 1 reached GAME_OVER', gameOvers === 1, `${Math.round((Date.now() - g1Start) / 1000)}s`);
  const g1Used = new Set(room.socrates.usedLines);
  const g1QuestionIds = new Set([...room.questions, ...(room.climb?.questions ?? [])].map((q) => q.id));
  const g1LastBeatId = room.socratesBeatId;
  const g1Spear = room.climb?.spearBeatPlayed ?? null;
  climbObjectGame1 = room.climb;
  const g1Scores = [...room.players.values()].map((p) => `${p.name}=${p.score}`).join(' ');
  check('A: idle timer armed at GAME_OVER', room.postGameIdleTimer !== null, logsSince(g1Start, 'idle timer armed').at(-1)?.text ?? 'no log');
  say(`  game 1: ${g1Used.size} lines, ${g1QuestionIds.size} questions dealt, last beat ${g1LastBeatId}, spear latch ${g1Spear}, scores ${g1Scores}`);

  // Two presses in one tick, then a third afterwards.
  const pressT = Date.now();
  host.emit(ClientEvents.HOST_PLAY_AGAIN, {});
  vip.emit(ClientEvents.VIP_PLAY_AGAIN, {});
  await waitFor(() => room.phase === 'LOBBY', 3000);
  await delay(400);
  vip.emit(ClientEvents.VIP_PLAY_AGAIN, {});
  await delay(300);
  const resets = logsSince(pressT, 'reset for a new game - same players');
  const ignored = logsSince(pressT, 'an earlier press already won');
  check('A: first press wins - exactly one reset', resets.length === 1, resets.map((l) => l.text).join(' | '));
  check('A: the other two presses are logged no-ops', ignored.length === 2, ignored.map((l) => l.text.slice(0, 90)).join(' | '));
  check('A: the press cancelled the idle timer', room.postGameIdleTimer === null && logsSince(pressT, 'idle timer cancelled: room rebuilt').length === 1, `timer ${room.postGameIdleTimer}`);

  // Fresh vs survivors, right after the rebuild.
  const humanPlayers = [...room.players.values()].filter((p) => !p.isBot);
  const botsNow = [...room.players.values()].filter((p) => p.isBot);
  check('A: phase LOBBY, stage 0, no questions, question index -1', room.phase === 'LOBBY' && room.stage === 0 && room.questions.length === 0 && room.currentQuestionIndex === -1, `${room.phase}/${room.stage}/${room.questions.length}/${room.currentQuestionIndex}`);
  check('A: scores 0', humanPlayers.every((p) => p.score === 0), humanPlayers.map((p) => `${p.name}=${p.score}`).join(' '));
  check('A: ledger fresh', room.socrates.ledger.stage === 0 && room.socrates.ledger.entries.size === 0 && room.socrates.ledger.firedSlots.size === 0 && room.socrates.ledger.targetedThisStage.size === 0, `stage ${room.socrates.ledger.stage}, entries ${room.socrates.ledger.entries.size}`);
  check('A: climb (and its spear latch) gone', room.climb === null, `climb ${room.climb}, game 1 latch was ${g1Spear}`);
  check('A: this game\'s used lines empty, moment counts empty', room.socrates.usedLines.size === 0 && room.socrates.momentFireCounts.size === 0, `${room.socrates.usedLines.size}/${room.socrates.momentFireCounts.size}`);
  check('A: game 1 lines carried as earlierGamesLines', [...g1Used].every((t) => room.socrates.earlierGamesLines.has(t)), `${room.socrates.earlierGamesLines.size} carried of ${g1Used.size}`);
  check('A: socratesBeatId NOT reset', room.socratesBeatId === g1LastBeatId, `${room.socratesBeatId} (game 1 last ${g1LastBeatId})`);
  check('A: skip vote / pending beat / queue / hold empty', room.skipVote === null && room.pendingSocratesBeat === null && room.pendingSocratesQueue.length === 0 && room.socratesHoldMs === null, 'all null/empty');
  check('A: same humans, same names, same VIP', humanPlayers.length === 2 && humans.every((h) => room.players.get(h.playerId)?.name === h.name) && room.vipPlayerId === humans[0].playerId, humanPlayers.map((p) => `${p.name}${p.isVip ? '(VIP)' : ''}`).join(' '));
  check('A: settings/mode/code kept', JSON.stringify(room.settings) === settingsBefore && room.mode === 'quiz' && room.code === code, `${room.mode} ${room.settings.gameLength} ${room.settings.speechPolicy}`);
  await waitFor(() => [...room.players.values()].filter((p) => p.isBot).length === 3, 5000);
  const botIdsGame2 = [...room.players.values()].filter((p) => p.isBot).map((p) => p.playerId);
  check('A: bots are fresh instances', botIdsGame2.length === 3 && botIdsGame2.every((id) => !botIdsGame1.includes(id)), `${botsNow.length}->${botIdsGame2.length} bots, 0 ids shared`);
  check('A: seen-question record kept', [...g1QuestionIds].every((id) => room.seenQuestionKeys.has(`quiz:${id}`)), `${room.seenQuestionKeys.size} keys`);

  // ======================= A: game 2 ======================================
  say('\n--- A: game 2 ---');
  game = 2;
  staleAckPlan = { staleId: g1LastBeatId, sent: false };
  const g2Start = Date.now();
  vip.emit(ClientEvents.VIP_START_GAME, {});
  await waitFor(() => gameOvers === 2, GAME_DEADLINE_MS, 500);
  check('A: game 2 reached GAME_OVER', gameOvers === 2, `${Math.round((Date.now() - g2Start) / 1000)}s`);
  const g2FirstBeat = shows.find((s) => s.game === 2)?.beatId ?? -1;
  const stale = logsSince(g2Start, `stale beat ${g1LastBeatId}, current is ${g2FirstBeat}`);
  check('A: late game-1 ack rejected as stale in game 2', staleAckPlan.sent && stale.length === 1, stale[0]?.text ?? 'no rejection logged');
  check('A: game 2 beat ids continue past game 1', g2FirstBeat === g1LastBeatId + 1, `first ${g2FirstBeat}, game 1 last ${g1LastBeatId}`);
  check('A: game 2 climb is a new object with a fresh spear latch', climbObjectFresh && spearLatchAtGame2ClimbStart === false, `new=${climbObjectFresh} latch=${spearLatchAtGame2ClimbStart}`);
  const g2QuestionIds = [...room.questions, ...(room.climb?.questions ?? [])].map((q) => q.id);
  const repeatedQ = g2QuestionIds.filter((id) => g1QuestionIds.has(id));
  check('A: no game-1 question dealt in game 2', repeatedQ.length === 0, `${repeatedQ.length} of ${g2QuestionIds.length} (pool not exhausted)`);
  const sequenceLines = new Set([...GAME_INTRO_SEQUENCE, ...ANAVASIS_INTRO_SEQUENCE, ...CORONATION_SETS.flat()]);
  const g2Used = [...room.socrates.usedLines];
  const overlap = g2Used.filter((t) => g1Used.has(t) && !sequenceLines.has(t));
  const unjustified = overlap.filter((t) => room.socrates.earlierGamesLines.has(t));
  const recycles = logsSince(g2Start, '[lines] pool of');
  check('A: no game-1 line spoken in game 2 unless its pool recycled', unjustified.length === 0, `${g2Used.length} lines, ${overlap.length} repeated, all ${overlap.length} from recycled pools (${recycles.length} recycle(s)); sequences exempt`);
  for (const r of recycles.slice(0, 5)) say(`    ${r.text}`);

  // ======================= B: idle fires ==================================
  say('\n--- B: nobody presses ---');
  const bT = Date.now();
  const firedB = await waitFor(() => room.phase === 'LOBBY', IDLE_MS + 3000);
  const fireLog = logsSince(bT, 'post-game idle timer fired');
  check('B: idle timer played again by itself', firedB && fireLog.length === 1 && logsSince(bT, 'same players (post-game idle timer)').length === 1, `${Date.now() - bT}ms, ${fireLog[0]?.text ?? 'no fire'}`);

  // ======================= C: no humans cancels, return re-arms ==========
  say('\n--- C: everyone leaves, one comes back ---');
  cleanupRoomBots(code); // what a real GAME_OVER has already done
  room.phase = 'GAME_OVER';
  armPostGameIdle(room);
  const cT = Date.now();
  vip.disconnect();
  other.disconnect();
  await delay(300);
  check('C: last human leaving cancels the timer', room.postGameIdleTimer === null && logsSince(cT, 'cancelled: no connected humans left').length === 1, logsSince(cT, 'cancelled').map((l) => l.text).join(' | ') || 'no log');
  await delay(IDLE_MS + 1500);
  check('C: nothing fires while nobody is here', room.phase === 'GAME_OVER' && logsSince(cT, 'idle timer fired').length === 0, `phase ${room.phase}`);
  const rT = Date.now();
  other = await joinHuman(code, humans[1].name, humans[1].playerId, humans[1].avatarId);
  check('C: a human coming back re-arms it', room.postGameIdleTimer !== null && logsSince(rT, 'idle timer armed').length === 1, logsSince(rT, 'armed')[0]?.text ?? 'no log');
  await waitFor(() => room.phase === 'LOBBY', IDLE_MS + 3000);
  const kept = [...room.players.values()].filter((p) => !p.isBot);
  check('C: it fires; only the connected human carries over, and holds VIP', room.phase === 'LOBBY' && kept.length === 1 && kept[0].playerId === humans[1].playerId && room.vipPlayerId === humans[1].playerId, kept.map((p) => `${p.name}${p.isVip ? '(VIP)' : ''}`).join(' '));

  // ======================= D: deleteRoom cancels ==========================
  say('\n--- D: room deleted ---');
  cleanupRoomBots(code);
  room.phase = 'GAME_OVER';
  armPostGameIdle(room);
  const dT = Date.now();
  deleteRoom(code);
  check('D: deleteRoom cancels the timer', room.postGameIdleTimer === null && logsSince(dT, 'cancelled: room deleted').length === 1, logsSince(dT, 'cancelled')[0]?.text ?? 'no log');
  await delay(IDLE_MS + 1500);
  check('D: nothing fires for a deleted room', logsSince(dT, 'idle timer fired').length === 0, `${logsSince(dT, 'fired').length} fires`);

  // ======================= E: pure ========================================
  say('\n--- E: override, registry, draws ---');
  const savedEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const prodMs = postGameIdleMs();
  process.env.NODE_ENV = savedEnv;
  const savedOverride = process.env.POST_GAME_IDLE_MS_DEV;
  process.env.POST_GAME_IDLE_MS_DEV = 'abc';
  const junkMs = postGameIdleMs();
  process.env.POST_GAME_IDLE_MS_DEV = savedOverride;
  check('E: override ignored under NODE_ENV=production, and when junk', prodMs === 300000 && junkMs === 300000 && postGameIdleMs() === IDLE_MS, `prod ${prodMs}, junk ${junkMs}, dev ${postGameIdleMs()}`);

  const scratch = createRoom('no-socket', 'blitz');
  prepareBlitzGame(scratch, 12, 2);
  const before = getBlitzStatementIsTrue(scratch, 0);
  rebuildRoomForNewGame(scratch);
  check('E: rebuild clears the mode-state maps (blitz entry gone)', before !== null && getBlitzStatementIsTrue(scratch, 0) === null, `before ${before}, after ${getBlitzStatementIsTrue(scratch, 0)}`);

  const { BLITZ_STATEMENTS } = await import('@game/shared');
  const perGame = 24;
  const fullGames = Math.floor(BLITZ_STATEMENTS.length / perGame);
  const blitzSeen = new Set<string>();
  let blitzRepeatsBeforeExhaustion = 0;
  // The registry check above already dealt one game into this room's record.
  const alreadyDealt = [...scratch.seenQuestionKeys].filter((k) => k.startsWith('blitz:')).length;
  for (let g = 0; g < fullGames - 1; g++) {
    // Every deal is marked on the seen record, so a repeat shows up as fewer
    // distinct blitz keys than statements dealt so far.
    prepareBlitzGame(scratch, 12, 2);
    const keys = [...scratch.seenQuestionKeys].filter((k) => k.startsWith('blitz:'));
    blitzRepeatsBeforeExhaustion = alreadyDealt + (g + 1) * perGame - keys.length;
    keys.forEach((k) => blitzSeen.add(k));
  }
  check('E: blitz deals no repeat until the pool runs short', blitzRepeatsBeforeExhaustion === 0, `${alreadyDealt / perGame + fullGames - 1} games x ${perGame} = ${blitzSeen.size} distinct of ${BLITZ_STATEMENTS.length}, ${blitzRepeatsBeforeExhaustion} repeats`);
  const recycleT = Date.now();
  prepareBlitzGame(scratch, 12, 2);
  prepareBlitzGame(scratch, 12, 2);
  check('E: then it recycles instead of dealing short', logsSince(recycleT, 'drawing from the full pool').length >= 1, logsSince(recycleT, 'blitz:')[0]?.text ?? 'no recycle log');
  prepareNumericGame(scratch, 3);
  prepareNumericGame(scratch, 3);
  const numericKeys = [...scratch.seenQuestionKeys].filter((k) => k.startsWith('numeric:'));
  check('E: two numeric draws share no question', numericKeys.length === 6, `${numericKeys.length} distinct of 6`);
  deleteRoom(scratch.code);

  for (const s of sockets) s.disconnect();
  say(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  say(`harness error: ${err instanceof Error ? err.stack : String(err)}`);
  for (const s of sockets) s.disconnect();
  process.exit(1);
});
