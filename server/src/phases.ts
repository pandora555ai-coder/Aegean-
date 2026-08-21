import {
  REVEAL_DURATION_MS,
  SCOREBOARD_DURATION_MS,
  SCOREBOARD_EVERY_N_QUESTIONS,
  ServerEvents,
  type QuestionShowHostPayload,
  type QuestionShowPlayerPayload,
  type RevealPlayerResult,
  type RoomCode,
} from '@game/shared';
import { getConnectedPlayers, getRoom, type Room } from './state.js';
import { armActiveTimer, clearActiveTimer } from './timers.js';
import { calculatePoints } from './scoring.js';
import { pickQuestionIntro, recordRoundAndPickLine, type GmPlayerRoundInput } from './gamemaster.js';
import { activeSabotageFor, applyPendingSabotage } from './sabotage.js';
import { io } from './realtime.js';
import { buildRevealHostPayload, buildRevealPlayerPayload, buildScoreboard, buildGameOver } from './payloads.js';

// Sorts `results` IN PLACE: correct answers first (fastest first), then
// wrong answers, then players who didn't answer at all go last. With 7
// players in a room, insertion (join) order reads as completely random -
// this is the order the reveal is actually meant to be read in. Also
// fills in each result's `answerRank`: the 1-based position among CORRECT
// answers only, by speed - left null for wrong/no-answer.
function sortAndRankResults(results: RevealPlayerResult[]): void {
  results.sort((a, b) => {
    const aAnswered = a.timeMs !== null;
    const bAnswered = b.timeMs !== null;
    if (aAnswered !== bAnswered) {
      return aAnswered ? -1 : 1; // answered before non-answerers
    }
    if (!aAnswered) {
      return 0; // both non-answerers - relative order doesn't matter
    }
    if (a.correct !== b.correct) {
      return a.correct ? -1 : 1; // correct before incorrect
    }
    return (a.timeMs as number) - (b.timeMs as number); // faster first
  });

  let rank = 0;
  for (const result of results) {
    if (result.correct) {
      rank += 1;
      result.answerRank = rank;
    }
  }
}

export function startQuestion(room: Room): void {
  room.answers.clear();
  room.questionStartedAt = Date.now();
  const questionTimeMs = room.settings.questionTimeMs;
  armActiveTimer(room, 'QUESTION', questionTimeMs, () => endQuestion(room.code));

  // Sabotage (Task 28b): anything announced at the last REVEAL lands NOW, on
  // the same clock as the question timer just armed above. Deliberately
  // after the arm - applyPendingSabotage reads both it and questionStartedAt.
  applyPendingSabotage(room);

  const question = room.questions[room.currentQuestionIndex];
  const totalQuestions = room.questions.length;

  // Game Master (Task 24): pure/synchronous, so this can never delay the
  // question or answer buttons appearing. Host-only, per spec.
  const gmIntro = pickQuestionIntro(room.gameMaster, {
    questionIndex: room.currentQuestionIndex,
    totalQuestions,
    category: question.category,
  });

  const hostPayload: QuestionShowHostPayload = {
    questionIndex: room.currentQuestionIndex,
    totalQuestions,
    question: question.question,
    options: question.options,
    category: question.category,
    questionTimeMs,
    paused: room.paused,
    pausedByName: room.pausedByName,
    gmIntro,
  };
  if (room.hostSocketId) {
    io.to(room.hostSocketId).emit(ServerEvents.QUESTION_SHOW, hostPayload);
  }

  // Built per player, not once and reused: yourSabotage is the one field
  // here that differs between phones, and no phone may learn another's.
  for (const player of getConnectedPlayers(room)) {
    const playerPayload: QuestionShowPlayerPayload = {
      questionIndex: room.currentQuestionIndex,
      totalQuestions,
      options: question.options,
      category: question.category,
      questionTimeMs,
      paused: room.paused,
      pausedByName: room.pausedByName,
      yourSabotage: activeSabotageFor(room, player.playerId),
    };
    io.to(player.socketId).emit(ServerEvents.QUESTION_SHOW, playerPayload);
  }

  console.log(`room ${room.code} started — question ${room.currentQuestionIndex + 1}/${totalQuestions}`);
}

// Ends the current question exactly once - guarded by the phase check, so
// whichever of (all connected players answered) / (timer fired) happens
// first wins, and the timer is always cleared so it can never fire twice.
export function endQuestion(code: RoomCode): void {
  const room = getRoom(code);
  if (!room || room.phase !== 'QUESTION') {
    return;
  }

  const question = room.questions[room.currentQuestionIndex];
  const connectedPlayers = getConnectedPlayers(room);
  const questionTimeMs = room.settings.questionTimeMs;

  // Game Master (Task 24) needs scoreBefore/scoreAfter and whether they
  // answered at all - built alongside `results` (same loop, same source
  // data) rather than recomputed from it afterward.
  const gmInputs: GmPlayerRoundInput[] = [];

  const results: RevealPlayerResult[] = connectedPlayers.map((player) => {
    const recorded = room.answers.get(player.playerId);
    const choice = recorded ? recorded.choice : null;
    const correct = choice === question.correctIndex;
    const pointsAwarded = calculatePoints(correct, recorded?.timeMs ?? questionTimeMs, questionTimeMs);
    const scoreBefore = player.score;
    player.score += pointsAwarded;

    gmInputs.push({
      playerId: player.playerId,
      name: player.name,
      answered: choice !== null,
      correct,
      answerRank: null, // filled in below, once sortAndRankResults has computed it
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
      answerRank: null, // filled in by sortAndRankResults below
    };
  });

  // Correct-by-speed first, then wrong, then non-answerers last - insertion
  // (join) order made no sense to anyone once there were 7 players in the
  // room. Also fills in each correct answer's 1-based speed rank.
  sortAndRankResults(results);
  const answerRankByPlayerId = new Map(results.map((result) => [result.playerId, result.answerRank]));
  for (const gmInput of gmInputs) {
    gmInput.answerRank = answerRankByPlayerId.get(gmInput.playerId) ?? null;
  }

  const answerCounts = [0, 0, 0, 0];
  for (const result of results) {
    if (result.choice !== null) {
      answerCounts[result.choice] += 1;
    }
  }

  const correctOption = question.options[question.correctIndex];

  // Pure/synchronous - can never delay the REVEAL broadcast that follows.
  const gmLine = recordRoundAndPickLine(room.gameMaster, gmInputs, {
    questionIndex: room.currentQuestionIndex,
    totalQuestions: room.questions.length,
    difficulty: question.difficulty,
  });

  room.phase = 'REVEAL';
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });

  // Sabotage (Task 28a): whatever was cast during this question, hidden
  // until now, becomes this round's announcement - and stays pending
  // against each victim (keyed by targetPlayerId) for their next question.
  const sabotageAnnouncements = Array.from(room.hiddenSabotageCasts.values());
  for (const cast of sabotageAnnouncements) {
    room.pendingSabotageByTarget.set(cast.targetPlayerId, cast);
  }
  room.hiddenSabotageCasts.clear();

  // Snapshot so a player who reconnects mid-REVEAL can be caught up via
  // state:sync without recomputing (or re-scoring) anything.
  room.lastReveal = {
    correctIndex: question.correctIndex,
    correctOption,
    results,
    answerCounts,
    gmLine,
    sabotageAnnouncements,
  };

  const hostPayload = buildRevealHostPayload(room);
  if (hostPayload && room.hostSocketId) {
    io.to(room.hostSocketId).emit(ServerEvents.REVEAL_SHOW, hostPayload);
  }

  for (const result of results) {
    const player = room.players.get(result.playerId);
    if (!player) {
      continue;
    }
    const playerPayload = buildRevealPlayerPayload(room, result.playerId);
    if (playerPayload) {
      io.to(player.socketId).emit(ServerEvents.REVEAL_SHOW, playerPayload);
    }
  }

  console.log(
    `room ${room.code} question ${room.currentQuestionIndex + 1} revealed — correctIndex=${question.correctIndex} results: ${JSON.stringify(results)}`,
  );

  armActiveTimer(room, 'REVEAL', REVEAL_DURATION_MS, () => advanceFromReveal(room.code));
}

// Whether the just-finished question should be followed by a SCOREBOARD -
// every SCOREBOARD_EVERY_N_QUESTIONS questions, and ALWAYS after the final
// question (so there's a stop right before GAME_OVER). REVEAL already shows
// per-player results with animation; a scoreboard after every single
// question just repeats it, hence the skip.
function shouldShowScoreboard(room: Room): boolean {
  const questionNumber = room.currentQuestionIndex + 1; // 1-based
  const isLastQuestion = room.currentQuestionIndex >= room.questions.length - 1;
  return isLastQuestion || questionNumber % SCOREBOARD_EVERY_N_QUESTIONS === 0;
}

// Ends REVEAL exactly once - guarded by the phase check, so whichever of
// (the auto-advance timer firing) / (host clicking "skip") happens first
// wins, and the timer is always cleared so it can never fire twice. Either
// shows SCOREBOARD (arming its own timer) or - when this question doesn't
// warrant one - skips straight to the next question/GAME_OVER, exactly as
// if a SCOREBOARD had shown and immediately auto-advanced.
export function advanceFromReveal(code: RoomCode): void {
  const room = getRoom(code);
  if (!room || room.phase !== 'REVEAL') {
    return;
  }

  if (!shouldShowScoreboard(room)) {
    console.log(`room ${room.code} skipping scoreboard after question ${room.currentQuestionIndex + 1}`);
    advanceToNextQuestionOrGameOver(room);
    return;
  }

  room.phase = 'SCOREBOARD';
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
  io.to(room.code).emit(ServerEvents.SCOREBOARD_SHOW, buildScoreboard(room));
  console.log(`room ${room.code} showing scoreboard after question ${room.currentQuestionIndex + 1}`);

  armActiveTimer(room, 'SCOREBOARD', SCOREBOARD_DURATION_MS, () => advanceFromScoreboard(room.code));
}

// Same one-shot discipline as advanceFromReveal.
export function advanceFromScoreboard(code: RoomCode): void {
  const room = getRoom(code);
  if (!room || room.phase !== 'SCOREBOARD') {
    return;
  }
  advanceToNextQuestionOrGameOver(room);
}

// The shared tail of both advanceFromReveal (when it skips SCOREBOARD
// entirely) and advanceFromScoreboard (once SCOREBOARD's own time is up) -
// either the next question starts, or - on the final question, always
// reached via SCOREBOARD since shouldShowScoreboard forces it - the game
// ends.
function advanceToNextQuestionOrGameOver(room: Room): void {
  const isLastQuestion = room.currentQuestionIndex >= room.questions.length - 1;
  if (isLastQuestion) {
    room.phase = 'GAME_OVER';
    clearActiveTimer(room); // no more phase-advance timer needed once the game is over
    io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
    const gameOverPayload = buildGameOver(room);
    io.to(room.code).emit(ServerEvents.GAME_OVER, gameOverPayload);
    console.log(`room ${room.code} game over — final standings: ${JSON.stringify(gameOverPayload.standings)}`);
    return;
  }

  room.currentQuestionIndex += 1;
  room.phase = 'QUESTION';
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
  startQuestion(room); // arms its own QUESTION timer
}

// The continuation a resumed timer should fire once its remaining time
// elapses - whichever function originally would have advanced the phase
// that got paused.
export function continuationForActiveTimer(room: Room): (() => void) | null {
  if (!room.activeTimer) {
    return null;
  }
  switch (room.activeTimer.kind) {
    case 'QUESTION':
      return () => endQuestion(room.code);
    case 'REVEAL':
      return () => advanceFromReveal(room.code);
    case 'SCOREBOARD':
      return () => advanceFromScoreboard(room.code);
  }
}
