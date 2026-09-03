import {
  BLITZ_CORRECT_POINTS,
  BLITZ_DURATION_MS,
  BLITZ_MIN_PLAYERS,
  BLITZ_REVEAL_DURATION_MS,
  BLITZ_STATEMENT_COUNT,
  BLITZ_WRONG_POINTS,
  ServerEvents,
  type BlitzRevealHostPayload,
  type BlitzRevealPlayerPayload,
  type BlitzRevealResult,
  type BlitzShowHostPayload,
  type BlitzShowPlayerPayload,
  type BlitzStatement,
  type GamePhase,
  type RoomCode,
} from '@game/shared';
import { getConnectedPlayers, getRoom, type Room } from '../state.js';
import { armActiveTimer, clearActiveTimer, remainingActiveTimerMs } from '../timers.js';
import { buildGameOver, computeStandings } from '../payloads.js';
import { setCrowdMood } from '../crowd.js';
import {
  drawBlitzGameStatements,
  mostMissedBlitzStatement,
  scoreBlitzTally,
  tallyBlitzSwipes,
  type BlitzSwipe,
} from '../blitz.js';
import { io } from '../realtime.js';
import { modeForRoom, registerGameMode } from './registry.js';
import type { GameMode } from './types.js';

// The blitz mode (Task 156), standalone - see blitz.ts for the pure
// mechanic. Everything HERE is the shell: per-room runtime state, the two
// phases, the timers, and the actual socket emits. Same split as numeric.

interface BlitzState {
  // Fixed for the game, drawn at prepareGame - "play again" reuses the same
  // Room object, so this is rebuilt fresh every time rather than mutated.
  // Truth lives in here and nowhere a client can see before BLITZ_REVEAL.
  statements: BlitzStatement[];
  swipes: Map<string, BlitzSwipe[]>; // playerId -> swipes in order
  // Same reconnect discipline as numeric's lastReveal: snapshotted once, the
  // instant the round resolves. autoAdvanceMs/paused/pausedByName/standings
  // are always read live (see buildBlitzRevealHostShow).
  lastReveal: {
    results: BlitzRevealResult[];
    mostMissed: BlitzRevealHostPayload['mostMissed'];
  } | null;
}

const blitzStateByRoom = new WeakMap<Room, BlitzState>();

function requireBlitzState(room: Room): BlitzState {
  const state = blitzStateByRoom.get(room);
  if (!state) {
    throw new Error(`room ${room.code} has no blitz state - prepareGame was never called for it`);
  }
  return state;
}

const BLITZ_PHASES: readonly GamePhase[] = ['LOBBY', 'BLITZ', 'BLITZ_REVEAL', 'GAME_OVER'];

export type BlitzTimerKind = 'BLITZ' | 'BLITZ_REVEAL';

function armBlitzTimer(room: Room, kind: BlitzTimerKind, durationMs: number, onFire: () => void): void {
  armActiveTimer(room, kind, durationMs, onFire);
}

// Task 52's prepareGame contract. The delete is unconditional and first,
// same as draw's and numeric's - a second game (via "play again", the same
// Room object) must never see a trace of the first game's swipes.
function prepareGame(room: Room): void {
  prepareBlitzGame(room, BLITZ_STATEMENT_COUNT);
}

// The draw, callable by a composing mode with its own count (same shape as
// prepareNumericGame - a later task composes this into full).
export function prepareBlitzGame(room: Room, statementCount: number): void {
  blitzStateByRoom.delete(room);
  blitzStateByRoom.set(room, {
    statements: drawBlitzGameStatements(statementCount),
    swipes: new Map(),
    lastReveal: null,
  });
}

// vip:start_game calls only this.
function start(room: Room): void {
  startBlitzSegment(room);
}

export function startBlitzSegment(room: Room): void {
  const state = requireBlitzState(room);
  state.swipes.clear();

  room.phase = 'BLITZ';
  armBlitzTimer(room, 'BLITZ', BLITZ_DURATION_MS, () => endBlitz(room.code));
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
  // Crowd mood - the whole swipe window is tension (spec), not the quiz's
  // calm-then-tension split: there is no single question to settle into.
  // AFTER phase:changed, mirroring every other mode's ordering.
  setCrowdMood(room, 'tension');
  broadcastBlitzShow(room);

  console.log(`room ${room.code} blitz started - ${state.statements.length} statements, ${BLITZ_DURATION_MS}ms`);
}

function progressByPlayerId(room: Room, state: BlitzState): Record<string, number> {
  const progress: Record<string, number> = {};
  for (const player of room.players.values()) {
    progress[player.playerId] = state.swipes.get(player.playerId)?.length ?? 0;
  }
  return progress;
}

// Room-in, payload-out, reused by BOTH the live broadcast and index.ts's
// state:sync catch-up, so a reattaching host or player gets exactly what a
// fresh phase entry would have sent.
export function buildBlitzHostShow(room: Room): BlitzShowHostPayload | null {
  const state = blitzStateByRoom.get(room);
  if (!state || room.phase !== 'BLITZ') {
    return null;
  }
  return {
    total: state.statements.length,
    durationMs: remainingActiveTimerMs(room),
    progressByPlayerId: progressByPlayerId(room, state),
    paused: room.paused,
    pausedByName: room.pausedByName,
    standings: computeStandings(room),
  };
}

export function buildBlitzPlayerShow(room: Room, playerId: string): BlitzShowPlayerPayload | null {
  const state = blitzStateByRoom.get(room);
  if (!state || room.phase !== 'BLITZ') {
    return null;
  }
  return {
    statements: state.statements.map((statement) => statement.text), // texts only - never isTrue
    total: state.statements.length,
    durationMs: remainingActiveTimerMs(room),
    answeredCount: state.swipes.get(playerId)?.length ?? 0,
    paused: room.paused,
    pausedByName: room.pausedByName,
  };
}

function broadcastBlitzShow(room: Room): void {
  const hostPayload = buildBlitzHostShow(room);
  if (hostPayload && room.hostSocketId) {
    io.to(room.hostSocketId).emit(ServerEvents.BLITZ_SHOW, hostPayload);
  }
  for (const player of getConnectedPlayers(room)) {
    const playerPayload = buildBlitzPlayerShow(room, player.playerId);
    if (playerPayload) {
      io.to(player.socketId).emit(ServerEvents.BLITZ_SHOW, playerPayload);
    }
  }
}

// Every CONNECTED player has swiped all K - same identity-based reasoning as
// numeric's allConnectedPlayersSubmitted.
function allConnectedPlayersFinished(room: Room, state: BlitzState): boolean {
  const connected = getConnectedPlayers(room);
  return (
    connected.length > 0 &&
    connected.every((player) => (state.swipes.get(player.playerId)?.length ?? 0) >= state.statements.length)
  );
}

// Records one swipe. Returns whether it was accepted - the caller (index.ts's
// blitz:swipe handler) logs on that. `index` must be exactly the player's
// next statement: no going back, no skipping ahead, one swipe per statement.
export function submitBlitzSwipe(room: Room, playerId: string, index: unknown, answeredTrue: unknown): boolean {
  if (room.phase !== 'BLITZ' || room.paused) {
    return false;
  }
  if (typeof index !== 'number' || !Number.isInteger(index) || typeof answeredTrue !== 'boolean') {
    return false;
  }
  const state = requireBlitzState(room);
  const swipes = state.swipes.get(playerId) ?? [];
  if (index !== swipes.length || index >= state.statements.length) {
    return false;
  }
  swipes.push({ index, answeredTrue, atMs: Date.now() }); // stamped here, never by the phone
  state.swipes.set(playerId, swipes);

  if (room.hostSocketId) {
    io.to(room.hostSocketId).emit(ServerEvents.BLITZ_PROGRESS, { progressByPlayerId: progressByPlayerId(room, state) });
  }
  if (allConnectedPlayersFinished(room, state)) {
    endBlitz(room.code);
  }
  return true;
}

// Re-run whenever a player disconnects during BLITZ - the player who just
// left might have been the only one still swiping.
export function recheckBlitzPhaseOnDisconnect(room: Room): void {
  if (room.phase !== 'BLITZ') {
    return;
  }
  const state = blitzStateByRoom.get(room);
  if (state && allConnectedPlayersFinished(room, state)) {
    endBlitz(room.code);
  }
}

// Ends BLITZ exactly once - guarded by the phase check, so whichever of (the
// timer firing) / (everyone finishing) happens first wins. Scores EVERY
// player in the room, swiped or not: no swipes is K unanswered, flat 0.
export function endBlitz(code: RoomCode): void {
  const room = getRoom(code);
  if (!room || room.phase !== 'BLITZ') {
    return;
  }
  const state = requireBlitzState(room);
  clearActiveTimer(room);

  const results: BlitzRevealResult[] = [...room.players.values()].map((player) => {
    const tally = tallyBlitzSwipes(state.statements, state.swipes.get(player.playerId) ?? []);
    const pointsAwarded = scoreBlitzTally(tally, BLITZ_CORRECT_POINTS, BLITZ_WRONG_POINTS);
    player.score += pointsAwarded;
    return {
      playerId: player.playerId,
      name: player.name,
      avatarId: player.avatarId,
      correct: tally.correct,
      wrong: tally.wrong,
      unanswered: tally.unanswered,
      pointsAwarded,
      totalScore: player.score,
    };
  });

  // Snapshotted BEFORE the phase/timer changes below - frozen the instant
  // the round resolves, exactly like Room.lastReveal.
  state.lastReveal = {
    results,
    mostMissed: mostMissedBlitzStatement(state.statements, state.swipes.values()),
  };

  room.phase = 'BLITZ_REVEAL';
  armBlitzTimer(room, 'BLITZ_REVEAL', BLITZ_REVEAL_DURATION_MS, () => endBlitzReveal(room.code));
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
  // Crowd mood - cheer when the room's swipes were mostly right, boo
  // otherwise (a room that never swiped gets the boo). AFTER phase:changed.
  const totalCorrect = results.reduce((sum, result) => sum + result.correct, 0);
  const totalWrong = results.reduce((sum, result) => sum + result.wrong, 0);
  setCrowdMood(room, totalCorrect > totalWrong ? 'cheer' : 'boo');
  broadcastBlitzReveal(room);

  console.log(
    `room ${room.code} blitz revealed - ${results.map((r) => `${r.name}:${r.correct}/${r.wrong}/${r.unanswered}=${r.pointsAwarded}`).join(' ')}`,
  );
}

// Reused for the fresh broadcast AND a later state:sync catch-up - one code
// path, fed the frozen snapshot plus whatever is true RIGHT NOW.
export function buildBlitzRevealHostShow(room: Room): BlitzRevealHostPayload | null {
  const state = blitzStateByRoom.get(room);
  if (!state?.lastReveal) {
    return null;
  }
  return {
    total: state.statements.length,
    results: state.lastReveal.results,
    mostMissed: state.lastReveal.mostMissed,
    autoAdvanceMs: remainingActiveTimerMs(room),
    paused: room.paused,
    pausedByName: room.pausedByName,
    standings: computeStandings(room),
  };
}

// A phone's own counts and nothing about anyone else - not even its points,
// which the TV column carries.
export function buildBlitzRevealPlayerShow(room: Room, playerId: string): BlitzRevealPlayerPayload | null {
  const state = blitzStateByRoom.get(room);
  const mine = state?.lastReveal?.results.find((result) => result.playerId === playerId);
  if (!state || !mine) {
    return null;
  }
  return {
    total: state.statements.length,
    correct: mine.correct,
    wrong: mine.wrong,
    unanswered: mine.unanswered,
    autoAdvanceMs: remainingActiveTimerMs(room),
    paused: room.paused,
    pausedByName: room.pausedByName,
  };
}

function broadcastBlitzReveal(room: Room): void {
  const hostPayload = buildBlitzRevealHostShow(room);
  if (hostPayload && room.hostSocketId) {
    io.to(room.hostSocketId).emit(ServerEvents.BLITZ_REVEAL_SHOW, hostPayload);
  }
  for (const player of getConnectedPlayers(room)) {
    const playerPayload = buildBlitzRevealPlayerShow(room, player.playerId);
    if (playerPayload) {
      io.to(player.socketId).emit(ServerEvents.BLITZ_REVEAL_SHOW, playerPayload);
    }
  }
}

// Ends the reveal beat exactly once - same one-shot discipline as every
// other end* function, guarded by the phase check.
export function endBlitzReveal(code: RoomCode): void {
  const room = getRoom(code);
  if (!room || room.phase !== 'BLITZ_REVEAL') {
    return;
  }
  clearActiveTimer(room);
  finishGame(room);
}

function finishGame(room: Room): void {
  // Same routing hook as draw's/numeric's finishGame, for the day a
  // composing mode runs this as a stage. Absent on this mode, so a
  // standalone blitz game ends right here.
  if (modeForRoom(room).advanceAfterSegment?.(room)) {
    return;
  }
  room.phase = 'GAME_OVER';
  clearActiveTimer(room);
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
  setCrowdMood(room, 'calm');
  const gameOverPayload = buildGameOver(room);
  io.to(room.code).emit(ServerEvents.GAME_OVER, gameOverPayload);
  console.log(`room ${room.code} blitz game over - final standings: ${JSON.stringify(gameOverPayload.standings)}`);
}

export const BLITZ_CONTINUATIONS: Record<BlitzTimerKind, (room: Room) => void> = {
  BLITZ: (room) => endBlitz(room.code),
  BLITZ_REVEAL: (room) => endBlitzReveal(room.code),
};

export const blitzMode: GameMode = {
  id: 'blitz',
  label: 'Αστραπή',
  minPlayers: BLITZ_MIN_PLAYERS,
  phases: BLITZ_PHASES,
  stages: [],
  prepareGame,
  start,
  continuations: BLITZ_CONTINUATIONS,
};

registerGameMode(blitzMode);
