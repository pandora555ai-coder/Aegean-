import {
  NUMERIC_MIN_PLAYERS,
  NUMERIC_QUESTION_COUNT,
  NUMERIC_QUESTION_DURATION_MS,
  NUMERIC_REVEAL_DURATION_MS,
  ServerEvents,
  type GamePhase,
  type NumericQuestionShowHostPayload,
  type NumericQuestionShowPlayerPayload,
  type NumericRevealResult,
  type NumericRevealShowPayload,
  type RoomCode,
} from '@game/shared';
import { getConnectedPlayers, getRoom, type Room } from '../state.js';
import { armActiveTimer, clearActiveTimer, remainingActiveTimerMs } from '../timers.js';
import { buildGameOver, computeStandings } from '../payloads.js';
import {
  NUMERIC_QUESTIONS,
  buildNumericQuestionHostPayload,
  buildNumericQuestionPlayerPayload,
  buildNumericRevealPayload,
  clampNumericValue,
  scoreNumericSubmissions,
  type NumericQuestion,
  type NumericSubmission,
} from '../numeric.js';
import { enterSocratesBeat } from '../phases.js';
import { recordNumericRoundAndPickLine, type PickedLine } from '../socrates.js';
import { io } from '../realtime.js';
import { modeForRoom, registerGameMode } from './registry.js';
import type { GameMode } from './types.js';

// The numeric-estimate mode (Task 65), standalone for now - see numeric.ts
// for the pure mechanic. Everything HERE is the shell: per-room runtime
// state, phase transitions, timers, and the actual socket emits. Task 66
// folding this into the quiz as a stage is a rewrite of this file only - the
// mechanic in numeric.ts should not have to change.

interface NumericState {
  // Fixed for the game, snapshotted at prepareGame - "play again" reuses the
  // same Room object, so this is rebuilt fresh every time rather than mutated.
  questions: NumericQuestion[];
  questionIndex: number; // -1 before the first question
  submissions: Map<string, number>; // playerId -> clamped value, THIS question only
  // Same reconnect discipline as Room.lastReveal / draw's lastGuessReveal:
  // snapshotted once, the instant the round resolves, so a reconnect
  // mid-reveal replays exactly what already happened rather than recomputing
  // anything. autoAdvanceMs/paused/pausedByName/standings are always read
  // live (see buildNumericRevealShow) since those can change under a
  // reconnect.
  lastReveal: Omit<NumericRevealShowPayload, 'autoAdvanceMs' | 'paused' | 'pausedByName' | 'standings'> | null;
  // Task 138 - the round-moment line (EXACT_HIT/WILDLY_OFF/ALL_CLUSTERED/
  // NOBODY_CLOSE) detected for the NUMERIC_REVEAL that just resolved, if
  // any. Set in endNumericQuestion, consumed and cleared the instant
  // NUMERIC_REVEAL's own timer ends.
  pendingSocratesLine: PickedLine | null;
}

const numericStateByRoom = new WeakMap<Room, NumericState>();

function requireNumericState(room: Room): NumericState {
  const state = numericStateByRoom.get(room);
  if (!state) {
    throw new Error(`room ${room.code} has no numeric state - prepareGame was never called for it`);
  }
  return state;
}

const NUMERIC_PHASES: readonly GamePhase[] = ['LOBBY', 'NUMERIC_QUESTION', 'NUMERIC_REVEAL', 'SOCRATES', 'GAME_OVER'];

// 'NUMERIC_SOCRATES' (Task 138), not the literal 'SOCRATES' - same reasoning
// as DrawTimerKind's own 'DRAW_SOCRATES': a mode-local name keeps the full
// mode's merged continuations table (modes/full.ts) collision-free even
// though every mode's SOCRATES beat enters the same wire-level phase.
export type NumericTimerKind = 'NUMERIC_QUESTION' | 'NUMERIC_REVEAL' | 'NUMERIC_SOCRATES';

function armNumericTimer(room: Room, kind: NumericTimerKind, durationMs: number, onFire: () => void): void {
  armActiveTimer(room, kind, durationMs, onFire);
}

// Fisher-Yates, same shape as questions.ts's shuffle for the quiz mode - a
// fresh random draw of NUMERIC_QUESTION_COUNT questions out of the full pool
// every game, rather than always the same first five.
function shuffle<T>(items: readonly T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Task 52's prepareGame contract. The delete is unconditional and first, same
// as draw's - a second game (via "play again", the same Room object) must
// never see a trace of the first game's submissions.
function prepareGame(room: Room): void {
  // NUMERIC_QUESTION_COUNT is THIS mode's length, and stays 5. Task 134 made
  // the count a parameter of the builder below rather than a constant read
  // inside it, so the full show can ask for its own three without either
  // number becoming the other's business.
  prepareNumericGame(room, NUMERIC_QUESTION_COUNT);
}

// Task 134 - the draw, callable by a composing mode with its own count. Fresh
// every game (never mutated in place) for the same reason draw's deal is: "play
// again" reuses the same Room object.
export function prepareNumericGame(room: Room, questionCount: number): void {
  numericStateByRoom.delete(room);
  numericStateByRoom.set(room, {
    questions: shuffle(NUMERIC_QUESTIONS).slice(0, questionCount),
    questionIndex: -1,
    submissions: new Map(),
    lastReveal: null,
    pendingSocratesLine: null,
  });
}

// vip:start_game calls only this.
function start(room: Room): void {
  startNumericSegment(room);
}

// Task 134 - the numeric run as ONE STAGE of a longer show; identical to what
// `start` does for a standalone game, which is the point.
export function startNumericSegment(room: Room): void {
  startNumericQuestion(room, requireNumericState(room));
}

function currentQuestion(state: NumericState): NumericQuestion {
  return state.questions[state.questionIndex];
}

function startNumericQuestion(room: Room, state: NumericState): void {
  state.questionIndex += 1;
  if (state.questionIndex >= state.questions.length) {
    finishGame(room);
    return;
  }
  state.submissions.clear();

  room.phase = 'NUMERIC_QUESTION';
  armNumericTimer(room, 'NUMERIC_QUESTION', NUMERIC_QUESTION_DURATION_MS, () => endNumericQuestion(room.code));
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
  broadcastNumericQuestionShow(room);

  console.log(
    `room ${room.code} numeric question ${state.questionIndex + 1}/${state.questions.length} started`,
  );
}

// Task 65 - room-in, payload-out, same discipline as draw.ts's
// buildDrawHostPayload/buildDrawPlayerPayload: reused by BOTH the live
// broadcast below and server/src/index.ts's state:sync catch-up, so a
// reattaching host or player gets exactly what a fresh phase entry would
// have sent, never a stale or guessed value.
export function buildNumericQuestionHostShow(room: Room): NumericQuestionShowHostPayload | null {
  const state = numericStateByRoom.get(room);
  if (!state || state.questionIndex < 0 || state.questionIndex >= state.questions.length) {
    return null;
  }
  return buildNumericQuestionHostPayload(
    currentQuestion(state),
    state.questionIndex,
    state.questions.length,
    remainingActiveTimerMs(room),
    state.submissions.size,
    getConnectedPlayers(room).length,
    Array.from(state.submissions.keys()),
    room.paused,
    room.pausedByName,
    computeStandings(room),
  );
}

export function buildNumericQuestionPlayerShow(room: Room, playerId: string): NumericQuestionShowPlayerPayload | null {
  const state = numericStateByRoom.get(room);
  if (!state || state.questionIndex < 0 || state.questionIndex >= state.questions.length) {
    return null;
  }
  return buildNumericQuestionPlayerPayload(
    currentQuestion(state),
    state.questionIndex,
    state.questions.length,
    remainingActiveTimerMs(room),
    state.submissions.has(playerId),
    room.paused,
    room.pausedByName,
  );
}

function broadcastNumericQuestionShow(room: Room): void {
  const hostPayload = buildNumericQuestionHostShow(room);
  if (hostPayload && room.hostSocketId) {
    io.to(room.hostSocketId).emit(ServerEvents.NUMERIC_QUESTION_SHOW, hostPayload);
  }
  for (const player of getConnectedPlayers(room)) {
    const playerPayload = buildNumericQuestionPlayerShow(room, player.playerId);
    if (playerPayload) {
      io.to(player.socketId).emit(ServerEvents.NUMERIC_QUESTION_SHOW, playerPayload);
    }
  }
}

// Every CONNECTED player has submitted - same identity-based reasoning as
// haveAllConnectedPlayersAnswered/allConnectedParticipantsSubmitted.
function allConnectedPlayersSubmitted(room: Room, state: NumericState): boolean {
  const connectedIds = getConnectedPlayers(room).map((player) => player.playerId);
  return connectedIds.length > 0 && connectedIds.every((id) => state.submissions.has(id));
}

// Records one player's guess. Returns whether it was accepted - the caller
// (server/src/index.ts's numeric:submit handler) logs/acks on that.
// Out-of-range values are CLAMPED here, never rejected (spec).
export function submitNumericAnswer(room: Room, playerId: string, rawValue: number): boolean {
  if (room.phase !== 'NUMERIC_QUESTION') {
    return false;
  }
  if (room.paused) {
    return false;
  }
  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
    return false;
  }
  const state = requireNumericState(room);
  if (state.submissions.has(playerId)) {
    return false; // one submission per player per question
  }

  const question = currentQuestion(state);
  state.submissions.set(playerId, clampNumericValue(rawValue, question.max));
  console.log(
    `room ${room.code} numeric submit from ${playerId} - ${state.submissions.size}/${getConnectedPlayers(room).length} submitted`,
  );

  if (allConnectedPlayersSubmitted(room, state)) {
    endNumericQuestion(room.code);
  }
  return true;
}

// Re-run whenever a player disconnects during NUMERIC_QUESTION - the player
// who just left might have been the only one still deciding.
export function recheckNumericPhaseOnDisconnect(room: Room): void {
  if (room.phase !== 'NUMERIC_QUESTION') {
    return;
  }
  const state = numericStateByRoom.get(room);
  if (state && allConnectedPlayersSubmitted(room, state)) {
    endNumericQuestion(room.code);
  }
}

// Ends NUMERIC_QUESTION exactly once - guarded by the phase check, so
// whichever of (the timer firing) / (every connected player submitting)
// happens first wins. Scores EVERY connected player, submitted or not - a
// player who never submits is scored as `value: null` by scoreNumericSubmissions
// (see numeric.ts), which gives them a flat 0 and excludes them from the
// ranking entirely (Task 133), without any special-casing here.
export function endNumericQuestion(code: RoomCode): void {
  const room = getRoom(code);
  if (!room || room.phase !== 'NUMERIC_QUESTION') {
    return;
  }
  const state = requireNumericState(room);
  clearActiveTimer(room);
  const question = currentQuestion(state);

  const connectedPlayers = getConnectedPlayers(room);
  const submissions: NumericSubmission[] = connectedPlayers.map((player) => ({
    playerId: player.playerId,
    value: state.submissions.get(player.playerId) ?? null,
  }));
  const scored = scoreNumericSubmissions(submissions, question.answer, question.max);

  const results: NumericRevealResult[] = scored.map((result) => {
    const player = room.players.get(result.playerId);
    if (player) {
      player.score += result.pointsAwarded;
    }
    return {
      playerId: result.playerId,
      name: player?.name ?? '',
      avatarId: player?.avatarId ?? '',
      value: result.value,
      distance: result.distance,
      rank: result.rank,
      exact: result.exact,
      pointsAwarded: result.pointsAwarded,
      totalScore: player?.score ?? 0,
    };
  });

  // Snapshotted BEFORE the phase/timer changes below - frozen the instant the
  // question resolves, exactly like Room.lastReveal.
  state.lastReveal = {
    questionIndex: state.questionIndex,
    totalQuestions: state.questions.length,
    text: question.text,
    category: question.category,
    answer: question.answer,
    max: question.max,
    results,
  };

  // Task 138 - detected (and logged) here, at the moment the round
  // resolves, exactly like the quiz's recordRoundAndPickLine and draw's
  // recordDrawGuessRoundAndPickLine. Consumed by continueAfterNumericReveal
  // once NUMERIC_REVEAL's own timer ends. Non-submitters are excluded (Task
  // 133 already scores them at 0 and out of ranking) - only genuine
  // submitted values are what a moment like WILDLY_OFF is about.
  state.pendingSocratesLine = recordNumericRoundAndPickLine(room.socrates, {
    answer: question.answer,
    values: Array.from(state.submissions.values()),
  });

  room.phase = 'NUMERIC_REVEAL';
  armNumericTimer(room, 'NUMERIC_REVEAL', NUMERIC_REVEAL_DURATION_MS, () => endNumericReveal(room.code));
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });

  const payload = buildNumericRevealShow(room);
  if (payload) {
    io.to(room.code).emit(ServerEvents.NUMERIC_REVEAL_SHOW, payload);
  }

  console.log(
    `room ${room.code} numeric question ${state.questionIndex + 1} revealed - answer=${question.answer}`,
  );
}

// Reused for both the fresh broadcast above AND a later state:sync catch-up -
// one code path, via the pure builder in numeric.ts, fed the frozen snapshot
// plus whatever is true RIGHT NOW (autoAdvanceMs/paused/pausedByName/standings).
export function buildNumericRevealShow(room: Room): NumericRevealShowPayload | null {
  const state = numericStateByRoom.get(room);
  const snapshot = state?.lastReveal;
  if (!snapshot) {
    return null;
  }
  return buildNumericRevealPayload(
    { text: snapshot.text, category: snapshot.category, answer: snapshot.answer, max: snapshot.max },
    snapshot.questionIndex,
    snapshot.totalQuestions,
    snapshot.results,
    remainingActiveTimerMs(room),
    room.paused,
    room.pausedByName,
    computeStandings(room),
  );
}

// Ends the reveal beat exactly once - same one-shot discipline as every other
// end* function here, guarded by the phase check.
export function endNumericReveal(code: RoomCode): void {
  const room = getRoom(code);
  if (!room || room.phase !== 'NUMERIC_REVEAL') {
    return;
  }
  const state = requireNumericState(room);
  clearActiveTimer(room);
  continueAfterNumericReveal(room, state);
}

// Task 138 - mirrors the quiz's continueAfterReveal / draw's
// continueAfterGuessReveal: plays the round's SOCRATES beat (if
// endNumericQuestion detected one AND it had a line - see
// state.pendingSocratesLine) before moving on, and is what
// advanceFromNumericSocrates re-enters once that beat ends.
function continueAfterNumericReveal(room: Room, state: NumericState): void {
  const pending = state.pendingSocratesLine;
  state.pendingSocratesLine = null;
  if (pending) {
    enterSocratesBeat(
      room,
      'NUMERIC_SOCRATES',
      { kind: 'NUMERIC_MOMENT', line: pending.text, lineTemplate: pending.template, lineTag: pending.tag },
      () => advanceFromNumericSocrates(room.code),
    );
    return;
  }
  startNumericQuestion(room, state);
}

// Ends this mode's SOCRATES beat exactly once - guarded by the phase check,
// same one-shot discipline as every other advanceFrom*. Numeric has only the
// one kind of beat (NUMERIC_MOMENT), so there's no pending.kind to switch on
// - unlike draw's advanceFromDrawSocrates, this always falls back to the
// next question.
export function advanceFromNumericSocrates(code: RoomCode): void {
  const room = getRoom(code);
  if (!room || room.phase !== 'SOCRATES') {
    return;
  }
  const state = requireNumericState(room);
  room.pendingSocratesBeat = null;
  startNumericQuestion(room, state);
}

function finishGame(room: Room): void {
  // Task 134 - the same routing hook as draw's finishGame: in the full show
  // this is the end of a stage, not of the game. Absent in this mode, so a
  // standalone numeric game still ends right here.
  if (modeForRoom(room).advanceAfterSegment?.(room)) {
    return;
  }
  room.phase = 'GAME_OVER';
  clearActiveTimer(room);
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
  const gameOverPayload = buildGameOver(room);
  io.to(room.code).emit(ServerEvents.GAME_OVER, gameOverPayload);
  console.log(`room ${room.code} numeric game over - final standings: ${JSON.stringify(gameOverPayload.standings)}`);
}

// Exported since Task 134 - see QUIZ_CONTINUATIONS' note in quiz.ts.
export const NUMERIC_CONTINUATIONS: Record<NumericTimerKind, (room: Room) => void> = {
  NUMERIC_QUESTION: (room) => endNumericQuestion(room.code),
  NUMERIC_REVEAL: (room) => endNumericReveal(room.code),
  NUMERIC_SOCRATES: (room) => advanceFromNumericSocrates(room.code),
};

export const numericMode: GameMode = {
  id: 'numeric',
  label: 'Εκτίμηση',
  minPlayers: NUMERIC_MIN_PLAYERS,
  phases: NUMERIC_PHASES,
  // No stage table - like draw, this mode has no notion of quiz stages.
  stages: [],
  prepareGame,
  start,
  continuations: NUMERIC_CONTINUATIONS,
};

registerGameMode(numericMode);
