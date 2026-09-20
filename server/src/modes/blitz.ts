import {
  BLITZ_CORRECT_POINTS,
  BLITZ_DURATION_MS,
  BLITZ_MIN_PLAYERS,
  BLITZ_REVEAL_DURATION_MS,
  BLITZ_ROUND_COUNT,
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
import { emitCrowdIntensity, setCrowdMood } from '../crowd.js';
import {
  drawBlitzGameRounds,
  mostMissedBlitzStatement,
  scoreBlitzTally,
  tallyBlitzSwipes,
  type BlitzSwipe,
} from '../blitz.js';
import { recordLedgerBlitzRound } from '../stageLedger.js';
import { io } from '../realtime.js';
import { cleanupRoomBots } from '../bots.js';
import { modeForRoom, registerGameMode } from './registry.js';
import type { GameMode } from './types.js';

// The blitz mode (Task 156), standalone - see blitz.ts for the pure
// mechanic. Everything HERE is the shell: per-room runtime state, the two
// phases, the timers, and the actual socket emits. Same split as numeric.

interface BlitzState {
  // Fixed for the game, drawn at prepareGame - "play again" reuses the same
  // Room object, so this is rebuilt fresh every time rather than mutated.
  // Truth lives in here and nowhere a client can see before BLITZ_REVEAL.
  // Task 253 - EVERY round's statements, drawn once at prepareGame with no
  // repeats across rounds (drawBlitzGameRounds). `statements` is whichever
  // round is live right now, so everything below this line reads exactly what
  // it always read and never asks how many rounds the stage runs.
  rounds: BlitzStatement[][];
  roundIndex: number; // 0-based, into `rounds`
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

// Task 221 - bots.ts's own per-bot accuracy needs a given statement's truth
// by index (the same index a bot's own BLITZ_SWIPE carries). Read-only,
// in-process, never reaches a client before BLITZ_REVEAL as usual.
export function getBlitzStatementIsTrue(room: Room, index: number): boolean | null {
  const statement = blitzStateByRoom.get(room)?.statements[index];
  return statement ? statement.isTrue : null;
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
  prepareBlitzGame(room, BLITZ_STATEMENT_COUNT, BLITZ_ROUND_COUNT);
}

// The draw, callable by a composing mode with its own count (same shape as
// prepareNumericGame - a later task composes this into full).
export function prepareBlitzGame(room: Room, statementCount: number, roundCount: number): void {
  blitzStateByRoom.delete(room);
  const rounds = drawBlitzGameRounds(roundCount, statementCount);
  blitzStateByRoom.set(room, {
    rounds,
    roundIndex: 0,
    statements: rounds[0] ?? [],
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
  state.roundIndex = 0;
  state.statements = state.rounds[0] ?? [];
  enterBlitzSwipeWindow(room, state);
}

// Task 253 - the stage's NEXT swipe window. Deliberately not a stage entry:
// room.stage never moves, so enterStageAnnounce is never reached and the card
// and STAGE_INTRO line that played once for Η Παλαίστρα stay played exactly
// once. The BLITZ_REVEAL that just ended IS the between-rounds transition -
// it already holds the screen for BLITZ_REVEAL_DURATION_MS and now says a
// round follows, so the room is never cut silently from a result into a
// fresh deck.
function startNextBlitzRound(room: Room, state: BlitzState): void {
  state.roundIndex += 1;
  state.statements = state.rounds[state.roundIndex] ?? [];
  state.lastReveal = null;
  enterBlitzSwipeWindow(room, state);
}

// startBlitzSegment's own body, moved verbatim (Task 253) so the stage's
// first window and every later one enter through one identical path.
function enterBlitzSwipeWindow(room: Room, state: BlitzState): void {
  state.swipes.clear();

  room.phase = 'BLITZ';
  armBlitzTimer(room, 'BLITZ', BLITZ_DURATION_MS, () => endBlitz(room.code));
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
  emitCrowdIntensity(room, { timerDurationMs: BLITZ_DURATION_MS });
  // Crowd mood - the whole swipe window is tension (spec), not the quiz's
  // calm-then-tension split: there is no single question to settle into.
  // AFTER phase:changed, mirroring every other mode's ordering.
  setCrowdMood(room, 'tension');
  broadcastBlitzShow(room);

  console.log(
    `room ${room.code} blitz started - round ${state.roundIndex + 1}/${state.rounds.length}, ` +
      `${state.statements.length} statements, ${BLITZ_DURATION_MS}ms`,
  );
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
    round: state.roundIndex + 1,
    totalRounds: state.rounds.length,
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
    round: state.roundIndex + 1,
    totalRounds: state.rounds.length,
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

  // Task 293 - the blitz capture site, and it has to be HERE: this round's
  // tallies live only in state.lastReveal, which startNextBlitzRound nulls
  // (:129 pre-293) the moment the stage's next window opens. Captured before
  // that null, the stage's BLITZ_ROUND_COUNT windows are comparable at close.
  recordLedgerBlitzRound(room.socrates.ledger, state.roundIndex + 1, results);

  // Snapshotted BEFORE the phase/timer changes below - frozen the instant
  // the round resolves, exactly like Room.lastReveal.
  state.lastReveal = {
    results,
    mostMissed: mostMissedBlitzStatement(state.statements, state.swipes.values()),
  };

  room.phase = 'BLITZ_REVEAL';
  armBlitzTimer(room, 'BLITZ_REVEAL', BLITZ_REVEAL_DURATION_MS, () => endBlitzReveal(room.code));
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
  emitCrowdIntensity(room);
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
    round: state.roundIndex + 1,
    totalRounds: state.rounds.length,
    hasNextRound: state.roundIndex + 1 < state.rounds.length,
    results: state.lastReveal.results,
    mostMissed: state.lastReveal.mostMissed,
    // Task 156b - safe now that BLITZ_REVEAL has resolved; HOST payload
    // only (buildBlitzRevealPlayerShow below is untouched).
    statements: state.statements,
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
    round: state.roundIndex + 1,
    totalRounds: state.rounds.length,
    hasNextRound: state.roundIndex + 1 < state.rounds.length,
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
  // Task 253 - another swipe window of the SAME stage, if the draw dealt one.
  // Checked before finishGame, which is what ends the stage (and, in the full
  // show, hands over to the next one via advanceAfterSegment).
  const state = requireBlitzState(room);
  if (state.roundIndex + 1 < state.rounds.length) {
    startNextBlitzRound(room, state);
    return;
  }
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
  emitCrowdIntensity(room);
  setCrowdMood(room, 'calm');
  const gameOverPayload = buildGameOver(room);
  io.to(room.code).emit(ServerEvents.GAME_OVER, gameOverPayload);
  console.log(`room ${room.code} blitz game over - final standings: ${JSON.stringify(gameOverPayload.standings)}`);
  cleanupRoomBots(room.code);
}

export const BLITZ_CONTINUATIONS: Record<BlitzTimerKind, (room: Room) => void> = {
  BLITZ: (room) => endBlitz(room.code),
  BLITZ_REVEAL: (room) => endBlitzReveal(room.code),
};

export const blitzMode: GameMode = {
  id: 'blitz',
  label: 'Η Παλαίστρα',
  minPlayers: BLITZ_MIN_PLAYERS,
  phases: BLITZ_PHASES,
  stages: [],
  prepareGame,
  start,
  continuations: BLITZ_CONTINUATIONS,
};

registerGameMode(blitzMode);
