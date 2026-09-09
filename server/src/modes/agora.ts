import {
  AGORA_EXPOSURE_MS,
  AGORA_MIN_PLAYERS,
  AGORA_QUESTIONS_PER_ROUND,
  REVEAL_DURATION_MS,
  ServerEvents,
  buildAgoraQuestions,
  generateAgora,
  type AgoraExposeShowPayload,
  type AgoraQuestion,
  type AgoraQuestionShowHostPayload,
  type AgoraQuestionShowPlayerPayload,
  type AgoraRevealHostPayload,
  type AgoraRevealPlayerPayload,
  type AgoraScene,
  type AnswerProgressPayload,
  type GamePhase,
  type RevealPlayerResult,
  type RoomCode,
} from '@game/shared';
import { getConnectedPlayers, getRoom, type Room } from '../state.js';
import { armActiveTimer, clearActiveTimer, remainingActiveTimerMs } from '../timers.js';
import { buildGameOver, computeCompetitionRanks, computeStandings } from '../payloads.js';
import { armCrowdTensionTimer, clearCrowdTensionTimer, emitCrowdIntensity, setCrowdMood } from '../crowd.js';
import { calculatePoints, sortAndRankResults } from '../scoring.js';
import { buildAgoraProof, drawAgoraSeed, toAgoraRenderSpec } from '../agora.js';
import { enterSocratesBeat } from '../phases.js';
import { LINES, recordRoundAndPickLine, type PickedLine, type SocratesPlayerRoundInput } from '../socrates.js';
import { io } from '../realtime.js';
import { cleanupRoomBots } from '../bots.js';
import { modeForRoom, registerGameMode } from './registry.js';
import type { GameMode } from './types.js';

// Task 207 - Η Μνήμη της Αγοράς as a standalone mode: the SHELL around Task
// 206's pure generator (shared/src/agora.ts, untouched) - per-room runtime
// state, phase transitions, timers, the socket emits. Same shape as
// modes/numeric.ts, for the same reason: folding this into the full show
// later is a matter of calling startAgoraSegment from full.ts, and nothing
// in here branches on who called it.
//
// One round = AGORA_EXPOSE (the scene, AGORA_EXPOSURE_MS) -> 3 x
// (AGORA_QUESTION -> AGORA_REVEAL [-> SOCRATES]) -> GAME_OVER (standalone)
// or the composing mode's advanceAfterSegment.
//
// SERVER-ONLY: the seed, the AgoraScene (absentStalls included) and every
// question's correctIndex live in AgoraState below and nowhere else. The
// render spec (toAgoraRenderSpec - the scene minus absentStalls) leaves the
// server exactly twice: on AGORA_EXPOSE (the market is open) and inside each
// AGORA_REVEAL's host-only proof. An AGORA_QUESTION payload - fresh or a
// reconnect's state:sync - never carries it: the market is closed.

interface AgoraState {
  seed: number;
  scene: AgoraScene;
  questions: readonly AgoraQuestion[];
  questionIndex: number; // -1 before the first question (i.e. during AGORA_EXPOSE)
  answers: Map<string, { choice: number; timeMs: number }>; // THIS question only
  // Same reconnect discipline as Room.lastReveal: frozen the instant the
  // question resolves; autoAdvanceMs/paused/pausedByName/standings are
  // always read live (see buildAgoraRevealHostShow).
  lastReveal: Omit<AgoraRevealHostPayload, 'autoAdvanceMs' | 'paused' | 'pausedByName' | 'standings'> | null;
  // D1 - no lines of its own: whatever the quiz's GENERIC round-moment
  // detection (recordRoundAndPickLine) happens to fire, consumed the
  // instant AGORA_REVEAL's timer ends, exactly numeric's pendingSocratesLine.
  pendingSocratesLine: PickedLine | null;
  // Task 215 - multiplies calculatePoints' raw total (endAgoraQuestion),
  // same `scale` arg draw's endGuessRound already takes. Set once at
  // startAgoraSegment, the call-site parameter (draw's guessScale pattern):
  // standalone agora never passes one, so this stays 1 there.
  scoreScale: number;
}

const agoraStateByRoom = new WeakMap<Room, AgoraState>();

function requireAgoraState(room: Room): AgoraState {
  const state = agoraStateByRoom.get(room);
  if (!state) {
    throw new Error(`room ${room.code} has no agora state - prepareGame was never called for it`);
  }
  return state;
}

// Task 221 - bots.ts's own per-bot accuracy needs the CURRENT question's
// correct index. Read-only, in-process, never reaches a client (the render
// spec discipline above is untouched) - the same "server already knows it"
// shortcut room.questions[...].correctIndex gives a quiz bot for free.
export function getAgoraCorrectIndex(room: Room): number | null {
  const state = agoraStateByRoom.get(room);
  if (!state || state.questionIndex < 0 || state.questionIndex >= state.questions.length) {
    return null;
  }
  return state.questions[state.questionIndex].correctIndex;
}

const AGORA_PHASES: readonly GamePhase[] = ['LOBBY', 'AGORA_EXPOSE', 'AGORA_QUESTION', 'AGORA_REVEAL', 'SOCRATES', 'GAME_OVER'];

// 'AGORA_SOCRATES', not the literal 'SOCRATES' - the mode-local timer kind
// keeps a future merged continuations table (modes/full.ts) collision-free,
// same as DRAW_SOCRATES / NUMERIC_SOCRATES.
export type AgoraTimerKind = 'AGORA_EXPOSE' | 'AGORA_QUESTION' | 'AGORA_REVEAL' | 'AGORA_SOCRATES';

function armAgoraTimer(room: Room, kind: AgoraTimerKind, durationMs: number, onFire: () => void): void {
  armActiveTimer(room, kind, durationMs, onFire);
}

// Task 52's prepareGame contract - the delete is unconditional and first,
// same as numeric's: "play again" reuses the same Room object and must never
// see a trace of the previous round's scene or answers.
function prepareGame(room: Room): void {
  prepareAgoraRound(room);
}

// Callable by a composing mode later, exactly as prepareNumericGame is. A
// fresh seed every call - the server's RNG, never a client's.
export function prepareAgoraRound(room: Room): void {
  agoraStateByRoom.delete(room);
  const seed = drawAgoraSeed();
  const scene = generateAgora(seed);
  agoraStateByRoom.set(room, {
    seed,
    scene,
    questions: buildAgoraQuestions(scene, seed),
    questionIndex: -1,
    answers: new Map(),
    lastReveal: null,
    pendingSocratesLine: null,
    scoreScale: 1,
  });
}

// vip:start_game calls only this.
function start(room: Room): void {
  startAgoraSegment(room);
}

// The round as ONE STAGE of a longer show - identical to what `start` does
// standalone (scale defaulting to 1), which is the point (numeric's
// startNumericSegment pattern). `scale` is a call-site parameter exactly like
// draw's startDrawSegment(room, totalCycles, guessScale) - full.ts passes its
// own FULL_AGORA_SCORE_SCALE (Task 215), standalone agora passes nothing.
export function startAgoraSegment(room: Room, scale = 1): void {
  const state = requireAgoraState(room);
  state.scoreScale = scale;
  startAgoraExpose(room, state);
}

function currentQuestion(state: AgoraState): AgoraQuestion {
  return state.questions[state.questionIndex];
}

// ---------------------------------------------------------------------------
// AGORA_EXPOSE
// ---------------------------------------------------------------------------

function startAgoraExpose(room: Room, state: AgoraState): void {
  state.questionIndex = -1;
  room.phase = 'AGORA_EXPOSE';
  armAgoraTimer(room, 'AGORA_EXPOSE', AGORA_EXPOSURE_MS, () => endAgoraExpose(room.code));
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
  emitCrowdIntensity(room, { timerDurationMs: AGORA_EXPOSURE_MS });
  // Calm while everyone stares, tension for the last third - the market is
  // about to close. AFTER phase:changed, the house ordering.
  setCrowdMood(room, 'calm');
  armCrowdTensionTimer(room, AGORA_EXPOSURE_MS);

  const payload = buildAgoraExposeShow(room);
  if (payload) {
    io.to(room.code).emit(ServerEvents.AGORA_EXPOSE_SHOW, payload);
  }
  // The ONE reproduction handle: generateAgora(seed) + buildAgoraQuestions
  // (scene, seed) rebuilds this exact round. Server log only.
  console.log(
    `room ${room.code} agora expose started - seed=${state.seed} stalls=${state.scene.stalls
      .map((s) => `${s.type}/${s.colour}/${s.count}`)
      .join(',')} animals=${JSON.stringify(state.scene.animals)}`,
  );
}

// Symmetric (TV and phones alike), and reused by state:sync so a reconnect
// mid-exposure gets the spec plus what is actually LEFT of the look.
export function buildAgoraExposeShow(room: Room): AgoraExposeShowPayload | null {
  const state = agoraStateByRoom.get(room);
  if (!state || room.phase !== 'AGORA_EXPOSE') {
    return null;
  }
  return {
    exposureMs: AGORA_EXPOSURE_MS,
    durationMs: remainingActiveTimerMs(room),
    spec: toAgoraRenderSpec(state.scene),
    paused: room.paused,
    pausedByName: room.pausedByName,
  };
}

export function endAgoraExpose(code: RoomCode): void {
  const room = getRoom(code);
  if (!room || room.phase !== 'AGORA_EXPOSE') {
    return;
  }
  const state = requireAgoraState(room);
  clearActiveTimer(room);
  clearCrowdTensionTimer(room);
  console.log(`room ${room.code} agora expose ended - the market is closed`);
  startAgoraQuestion(room, state);
}

// ---------------------------------------------------------------------------
// AGORA_QUESTION
// ---------------------------------------------------------------------------

function startAgoraQuestion(room: Room, state: AgoraState): void {
  state.questionIndex += 1;
  if (state.questionIndex >= state.questions.length) {
    finishRound(room);
    return;
  }
  state.answers.clear();

  const questionTimeMs = room.settings.questionTimeMs;
  room.phase = 'AGORA_QUESTION';
  armAgoraTimer(room, 'AGORA_QUESTION', questionTimeMs, () => endAgoraQuestion(room.code));
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
  emitCrowdIntensity(room, { timerDurationMs: questionTimeMs });
  setCrowdMood(room, 'calm');
  armCrowdTensionTimer(room, questionTimeMs);
  broadcastAgoraQuestionShow(room);

  const question = currentQuestion(state);
  console.log(
    `room ${room.code} agora question ${state.questionIndex + 1}/${state.questions.length} (${question.kind}) started`,
  );
}

// Room-in, payload-out, reused by BOTH the live broadcast and state:sync -
// a reconnecting TV gets exactly what a fresh entry sent: the question and
// its options, WHO has answered, and nothing about the scene.
export function buildAgoraQuestionHostShow(room: Room): AgoraQuestionShowHostPayload | null {
  const state = agoraStateByRoom.get(room);
  if (!state || room.phase !== 'AGORA_QUESTION' || state.questionIndex < 0) {
    return null;
  }
  const question = currentQuestion(state);
  return {
    questionIndex: state.questionIndex,
    totalQuestions: state.questions.length,
    kind: question.kind,
    question: question.textGr,
    options: [...question.options],
    questionTimeMs: room.settings.questionTimeMs,
    paused: room.paused,
    pausedByName: room.pausedByName,
    standings: computeStandings(room),
    answeredPlayerIds: Array.from(state.answers.keys()),
  };
}

export function buildAgoraQuestionPlayerShow(room: Room, playerId: string): AgoraQuestionShowPlayerPayload | null {
  const state = agoraStateByRoom.get(room);
  if (!state || room.phase !== 'AGORA_QUESTION' || state.questionIndex < 0) {
    return null;
  }
  const question = currentQuestion(state);
  return {
    questionIndex: state.questionIndex,
    totalQuestions: state.questions.length,
    kind: question.kind,
    options: [...question.options],
    questionTimeMs: room.settings.questionTimeMs,
    answered: state.answers.has(playerId),
    paused: room.paused,
    pausedByName: room.pausedByName,
  };
}

function broadcastAgoraQuestionShow(room: Room): void {
  const hostPayload = buildAgoraQuestionHostShow(room);
  if (hostPayload && room.hostSocketId) {
    io.to(room.hostSocketId).emit(ServerEvents.AGORA_QUESTION_SHOW, hostPayload);
  }
  for (const player of getConnectedPlayers(room)) {
    const playerPayload = buildAgoraQuestionPlayerShow(room, player.playerId);
    if (playerPayload) {
      io.to(player.socketId).emit(ServerEvents.AGORA_QUESTION_SHOW, playerPayload);
    }
  }
}

function allConnectedPlayersAnswered(room: Room, state: AgoraState): boolean {
  const connectedIds = getConnectedPlayers(room).map((player) => player.playerId);
  return connectedIds.length > 0 && connectedIds.every((id) => state.answers.has(id));
}

// Records one player's answer. Every rule lives here (phase, pause, valid
// choice, one answer per question); index.ts's handler only acks. The
// elapsed figure is the shared timer's own remaining time subtracted from
// the full duration - pause-aware by construction (the trial's pattern),
// so a pause never counts toward anyone's speed bonus.
export function submitAgoraAnswer(room: Room, playerId: string, choice: unknown): boolean {
  if (room.phase !== 'AGORA_QUESTION' || room.paused) {
    return false;
  }
  if (typeof choice !== 'number' || !Number.isInteger(choice) || choice < 0 || choice > 3) {
    return false;
  }
  const state = requireAgoraState(room);
  if (state.answers.has(playerId)) {
    return false;
  }
  const questionTimeMs = room.settings.questionTimeMs;
  const timeMs = Math.max(0, questionTimeMs - remainingActiveTimerMs(room));
  state.answers.set(playerId, { choice, timeMs });

  // Same host-only ticker the quiz question sends: WHO, never what.
  const progressPayload: AnswerProgressPayload = {
    answered: state.answers.size,
    total: getConnectedPlayers(room).length,
    answeredPlayerIds: Array.from(state.answers.keys()),
  };
  if (room.hostSocketId) {
    io.to(room.hostSocketId).emit(ServerEvents.ANSWER_PROGRESS, progressPayload);
  }
  console.log(`room ${room.code} agora answer from ${playerId} - ${progressPayload.answered}/${progressPayload.total} answered`);

  if (allConnectedPlayersAnswered(room, state)) {
    endAgoraQuestion(room.code);
  }
  return true;
}

// Re-run whenever a player disconnects mid-AGORA_QUESTION - they might have
// been the only one still deciding. A no-op outside that phase.
export function recheckAgoraPhaseOnDisconnect(room: Room): void {
  if (room.phase !== 'AGORA_QUESTION') {
    return;
  }
  const state = agoraStateByRoom.get(room);
  if (state && allConnectedPlayersAnswered(room, state)) {
    endAgoraQuestion(room.code);
  }
}

// ---------------------------------------------------------------------------
// AGORA_REVEAL
// ---------------------------------------------------------------------------

// Ends AGORA_QUESTION exactly once (phase-guarded). The scoring is the quiz's
// own path verbatim: calculatePoints against room.settings.questionTimeMs
// (Task 215 - at state.scoreScale, 1 unless startAgoraSegment was given
// one), then sortAndRankResults for the reveal's correct-by-speed order and
// answerRank.
export function endAgoraQuestion(code: RoomCode): void {
  const room = getRoom(code);
  if (!room || room.phase !== 'AGORA_QUESTION') {
    return;
  }
  const state = requireAgoraState(room);
  clearActiveTimer(room);
  clearCrowdTensionTimer(room);

  const question = currentQuestion(state);
  const questionTimeMs = room.settings.questionTimeMs;
  const socratesInputs: SocratesPlayerRoundInput[] = [];

  const results: RevealPlayerResult[] = getConnectedPlayers(room).map((player) => {
    const recorded = state.answers.get(player.playerId);
    const choice = recorded ? recorded.choice : null;
    const correct = choice === question.correctIndex;
    const pointsAwarded = calculatePoints(correct, recorded?.timeMs ?? questionTimeMs, questionTimeMs, state.scoreScale);
    const scoreBefore = player.score;
    player.score += pointsAwarded;
    socratesInputs.push({
      playerId: player.playerId,
      name: player.name,
      answered: choice !== null,
      correct,
      answerRank: null,
      scoreBefore,
      scoreAfter: player.score,
    });
    return {
      playerId: player.playerId,
      name: player.name,
      avatarId: player.avatarId,
      choice,
      correct,
      pointsAwarded,
      totalScore: player.score,
      timeMs: recorded ? recorded.timeMs : null,
      answerRank: null,
    };
  });
  sortAndRankResults(results);
  const answerRankByPlayerId = new Map(results.map((result) => [result.playerId, result.answerRank]));
  for (const input of socratesInputs) {
    input.answerRank = answerRankByPlayerId.get(input.playerId) ?? null;
  }

  const answerCounts = [0, 0, 0, 0];
  for (const result of results) {
    if (result.choice !== null) {
      answerCounts[result.choice] += 1;
    }
  }

  // D1 - the quiz's GENERIC round-moment detection, nothing agora-specific:
  // whatever fires here fires exactly as it would on a plain quiz question
  // with these standings. 'medium' is the neutral difficulty (the only two
  // difficulty-gated moments key off 'easy' and 'hard').
  const pickedLine = recordRoundAndPickLine(room.socrates, socratesInputs, {
    questionIndex: state.questionIndex,
    totalQuestions: state.questions.length,
    difficulty: 'medium',
    stage: 1,
  });
  state.pendingSocratesLine = pickedLine;

  // Frozen BEFORE the phase flips, exactly like Room.lastReveal - the proof
  // (spec + subject) is built once here and replayed verbatim to a reconnect.
  state.lastReveal = {
    questionIndex: state.questionIndex,
    totalQuestions: state.questions.length,
    kind: question.kind,
    question: question.textGr,
    options: [...question.options],
    correctIndex: question.correctIndex,
    correctOption: question.options[question.correctIndex],
    results,
    answerCounts,
    proof: buildAgoraProof(state.scene, question),
  };

  room.phase = 'AGORA_REVEAL';
  armAgoraTimer(room, 'AGORA_REVEAL', REVEAL_DURATION_MS, () => endAgoraReveal(room.code));
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
  const closeScoresPending = pickedLine !== null && LINES.CLOSE_SCORES.includes(pickedLine.template);
  emitCrowdIntensity(room, { closeScoresPending });
  // The quiz's own correct-ratio convention: cheer if more than half got it.
  const correctCount = results.filter((result) => result.correct).length;
  if (results.length > 0) {
    setCrowdMood(room, correctCount * 2 > results.length ? 'cheer' : 'boo');
  }

  const hostPayload = buildAgoraRevealHostShow(room);
  if (hostPayload && room.hostSocketId) {
    io.to(room.hostSocketId).emit(ServerEvents.AGORA_REVEAL_SHOW, hostPayload);
  }
  for (const result of results) {
    const player = room.players.get(result.playerId);
    const playerPayload = player ? buildAgoraRevealPlayerShow(room, result.playerId) : null;
    if (player && playerPayload) {
      io.to(player.socketId).emit(ServerEvents.AGORA_REVEAL_SHOW, playerPayload);
    }
  }

  console.log(
    `room ${room.code} agora question ${state.questionIndex + 1} revealed - correctIndex=${question.correctIndex} subject=${JSON.stringify(state.lastReveal.proof.subject)} results: ${JSON.stringify(results)}`,
  );
}

// Host-only: every row plus the proof. Reused by state:sync.
export function buildAgoraRevealHostShow(room: Room): AgoraRevealHostPayload | null {
  const snapshot = agoraStateByRoom.get(room)?.lastReveal;
  if (!snapshot) {
    return null;
  }
  return {
    ...snapshot,
    autoAdvanceMs: remainingActiveTimerMs(room),
    paused: room.paused,
    pausedByName: room.pausedByName,
    standings: computeStandings(room),
  };
}

// A phone's own row only - no proof, no other player's result. The
// not-in-results branch is buildRevealPlayerPayload's: a phone that was
// offline for the whole question gets a neutral view with its real total.
export function buildAgoraRevealPlayerShow(room: Room, playerId: string): AgoraRevealPlayerPayload | null {
  const snapshot = agoraStateByRoom.get(room)?.lastReveal;
  if (!snapshot) {
    return null;
  }
  const common = {
    questionIndex: snapshot.questionIndex,
    totalQuestions: snapshot.totalQuestions,
    correctIndex: snapshot.correctIndex,
    correctOption: snapshot.correctOption,
    autoAdvanceMs: remainingActiveTimerMs(room),
    paused: room.paused,
    pausedByName: room.pausedByName,
  };
  const myResult = snapshot.results.find((result) => result.playerId === playerId);
  if (myResult) {
    const ranks = computeCompetitionRanks(
      snapshot.results,
      (result) => result.totalScore,
      (result) => result.playerId,
    );
    return {
      ...common,
      yourChoice: myResult.choice,
      yourCorrect: myResult.correct,
      pointsAwarded: myResult.pointsAwarded,
      totalScore: myResult.totalScore,
      rank: ranks.get(playerId) ?? snapshot.results.length,
      yourTimeMs: myResult.timeMs,
      yourAnswerRank: myResult.answerRank,
    };
  }
  const player = room.players.get(playerId);
  if (!player) {
    return null;
  }
  const ranks = computeCompetitionRanks(
    [...room.players.values()],
    (p) => p.score,
    (p) => p.playerId,
  );
  return {
    ...common,
    yourChoice: null,
    yourCorrect: false,
    pointsAwarded: 0,
    totalScore: player.score,
    rank: ranks.get(playerId) ?? room.players.size,
    yourTimeMs: null,
    yourAnswerRank: null,
  };
}

export function endAgoraReveal(code: RoomCode): void {
  const room = getRoom(code);
  if (!room || room.phase !== 'AGORA_REVEAL') {
    return;
  }
  const state = requireAgoraState(room);
  clearActiveTimer(room);
  continueAfterAgoraReveal(room, state);
}

// numeric's continueAfterNumericReveal: play the round's SOCRATES beat if
// the generic detection fired one, else straight to the next question.
function continueAfterAgoraReveal(room: Room, state: AgoraState): void {
  const pending = state.pendingSocratesLine;
  state.pendingSocratesLine = null;
  if (pending) {
    enterSocratesBeat(
      room,
      'AGORA_SOCRATES',
      { kind: 'AGORA_MOMENT', line: pending.text, lineTemplate: pending.template, lineTag: pending.tag },
      () => advanceFromAgoraSocrates(room.code),
    );
    return;
  }
  startAgoraQuestion(room, state);
}

export function advanceFromAgoraSocrates(code: RoomCode): void {
  const room = getRoom(code);
  if (!room || room.phase !== 'SOCRATES') {
    return;
  }
  const state = requireAgoraState(room);
  room.pendingSocratesBeat = null;
  startAgoraQuestion(room, state);
}

// ---------------------------------------------------------------------------
// Round end
// ---------------------------------------------------------------------------

function finishRound(room: Room): void {
  // The same routing hook as draw/numeric's finishGame: in a composed show
  // this is the end of a stage, not of the game. Absent standalone.
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
  console.log(`room ${room.code} agora game over - final standings: ${JSON.stringify(gameOverPayload.standings)}`);
  cleanupRoomBots(room.code);
}

export const AGORA_CONTINUATIONS: Record<AgoraTimerKind, (room: Room) => void> = {
  AGORA_EXPOSE: (room) => endAgoraExpose(room.code),
  AGORA_QUESTION: (room) => endAgoraQuestion(room.code),
  AGORA_REVEAL: (room) => endAgoraReveal(room.code),
  AGORA_SOCRATES: (room) => advanceFromAgoraSocrates(room.code),
};

export const agoraMode: GameMode = {
  id: 'agora',
  label: 'Η Μνήμη της Αγοράς',
  minPlayers: AGORA_MIN_PLAYERS,
  phases: AGORA_PHASES,
  // No stage table - like draw/numeric, this mode has no notion of quiz stages.
  stages: [],
  prepareGame,
  start,
  continuations: AGORA_CONTINUATIONS,
};

// AGORA_QUESTIONS_PER_ROUND is the shared contract's statement of the tuple
// length buildAgoraQuestions returns; a drift between the two is a wiring
// bug worth failing at startup for.
if (buildAgoraQuestions(generateAgora(0), 0).length !== AGORA_QUESTIONS_PER_ROUND) {
  throw new Error('AGORA_QUESTIONS_PER_ROUND does not match buildAgoraQuestions');
}

registerGameMode(agoraMode);
