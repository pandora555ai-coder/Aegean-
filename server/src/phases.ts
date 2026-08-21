import {
  POWER_UP_DURATION_MS,
  REVEAL_DURATION_MS,
  SCOREBOARD_DURATION_MS,
  SCOREBOARD_EVERY_N_QUESTIONS,
  STAGES,
  STEAL_ANNOUNCE_DURATION_MS,
  STEAL_DURATION_MS,
  ServerEvents,
  firstQuestionIndexOfStage,
  stageForQuestionIndex,
  type QuestionShowHostPayload,
  type QuestionShowPlayerPayload,
  type RevealPlayerResult,
  type RoomCode,
  type StageAnnouncePayload,
} from '@game/shared';
import { getConnectedPlayers, getRoom, type Room } from './state.js';
import { armActiveTimer, clearActiveTimer } from './timers.js';
import { calculatePoints } from './scoring.js';
import { pickQuestionIntro, recordRoundAndPickLine, type GmPlayerRoundInput } from './gamemaster.js';
import { activeSabotagesFor, applyPendingSabotage, optionsForPlayer } from './sabotage.js';
import { applyPendingPowerUps } from './powerups.js';
import { applySteal, buildStealState } from './steal.js';
import { io } from './realtime.js';
import {
  buildRevealHostPayload,
  buildRevealPlayerPayload,
  buildPowerUpHostPayload,
  buildPowerUpPlayerPayload,
  buildStealHostPayload,
  buildStealPlayerPayload,
  buildScoreboard,
  buildGameOver,
} from './payloads.js';

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

// Stages (Task 31a). Brings room.stage in line with whatever question is
// about to be entered, and announces the stage on the TV the ONE time it
// actually changes. Called from the single gate below, so "each stage is
// announced exactly once, as it begins" is structural rather than something
// each caller has to remember - and a pause, a reconnect or a re-broadcast
// can never re-announce, since none of them move currentQuestionIndex.
function syncStage(room: Room): void {
  const definition = stageForQuestionIndex(room.currentQuestionIndex);
  if (room.stage === definition.stage) {
    return;
  }
  room.stage = definition.stage;

  const payload: StageAnnouncePayload = {
    stage: definition.stage,
    totalStages: STAGES.length,
    title: definition.title,
    tagline: definition.tagline,
    questionCount: definition.questionCount,
    firstQuestionIndex: firstQuestionIndexOfStage(definition.stage),
    totalQuestions: room.questions.length,
  };
  // Room-wide, but only the TV renders it: the phones are controllers and
  // are about to be busy with a power-up choice or an answer.
  io.to(room.code).emit(ServerEvents.STAGE_ANNOUNCE, payload);
  console.log(`room ${room.code} entering stage ${definition.stage} — ${definition.title}`);
}

// The ONLY way any question is ever entered - vip:start_game and every
// advance past a REVEAL/SCOREBOARD both come through here. That's what makes
// "the stage decides whether a POWER_UP precedes this question, and every
// stage announces itself once" structural rather than something each caller
// has to remember.
export function enterQuestionOrPowerUp(room: Room): void {
  syncStage(room);
  if (stageForQuestionIndex(room.currentQuestionIndex).powerUpBeforeEveryQuestion) {
    startPowerUp(room);
    return;
  }
  room.phase = 'QUESTION';
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
  startQuestion(room);
}

// Power-up (Task 30a). Runs on its OWN 10s timer through the shared helper,
// so a pause freezes it exactly like a question timer and a reconnect gets
// the real remaining time back. room.currentQuestionIndex already points at
// the question this precedes - it is NOT advanced here; endPowerUp starts
// that very question. Since Task 31a this runs before EVERY question of a
// power-up stage, so nothing here may carry over between rounds: every
// connected player simply gets one fresh choice each time (no economy, no
// holdings), and endPowerUp below is what re-enters the question itself
// rather than re-entering this gate.
export function startPowerUp(room: Room): void {
  room.phase = 'POWER_UP';
  room.powerUpChoices.clear();
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });

  // Armed BEFORE the payloads are built - they report the timer's remaining
  // time, so it has to exist first.
  armActiveTimer(room, 'POWER_UP', POWER_UP_DURATION_MS, () => endPowerUp(room.code));

  if (room.hostSocketId) {
    io.to(room.hostSocketId).emit(ServerEvents.POWER_UP_SHOW, buildPowerUpHostPayload(room));
  }
  // Per player, never built once and reused: each phone gets its own target
  // list (everyone but itself) and learns nothing about anyone else's pick.
  for (const player of getConnectedPlayers(room)) {
    io.to(player.socketId).emit(ServerEvents.POWER_UP_SHOW, buildPowerUpPlayerPayload(room, player.playerId));
  }

  console.log(
    `room ${room.code} power-up phase — before question ${room.currentQuestionIndex + 1}/${room.questions.length}`,
  );
}

// Ends POWER_UP exactly once - guarded by the phase check, so whichever of
// (every connected player chose) / (the 10s timer fired) happens first wins.
// Anyone who didn't choose simply casts nothing. Flows straight into the
// question it preceded: the choices land THERE, on the very next question,
// never on some later round.
export function endPowerUp(code: RoomCode): void {
  const room = getRoom(code);
  if (!room || room.phase !== 'POWER_UP') {
    return;
  }

  // Every choice is kept, not just the last one aimed at a given target
  // (Task 31a): several players piling onto the same victim is the normal
  // case in a power-up stage, and they STACK when they land.
  for (const choice of room.powerUpChoices.values()) {
    const forTarget = room.pendingPowerUpByTarget.get(choice.targetPlayerId) ?? [];
    forTarget.push(choice);
    room.pendingPowerUpByTarget.set(choice.targetPlayerId, forTarget);
  }
  console.log(
    `room ${room.code} power-up phase ended — ${room.powerUpChoices.size} chose, ` +
      `${room.pendingPowerUpByTarget.size} target(s) hit`,
  );
  room.powerUpChoices.clear();

  room.phase = 'QUESTION';
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
  startQuestion(room); // arms its own QUESTION timer, replacing this phase's
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
  // Power-up (Task 30a): the choices made in the POWER_UP phase that just
  // ended land HERE, on the very next question, on the same clock. Must
  // follow applyPendingSabotage, which clears activeSabotageByTarget - the
  // map both of them land into.
  applyPendingPowerUps(room);

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

  // Built per player, not once and reused: yourSabotage and (Task 28c) the
  // ORDER of `options` are what differ between phones, and no phone may learn
  // another's. The host payload above keeps canonical order regardless.
  for (const player of getConnectedPlayers(room)) {
    const playerPayload: QuestionShowPlayerPayload = {
      questionIndex: room.currentQuestionIndex,
      totalQuestions,
      options: optionsForPlayer(room, player.playerId, question.options),
      category: question.category,
      questionTimeMs,
      paused: room.paused,
      pausedByName: room.pausedByName,
      yourSabotages: activeSabotagesFor(room, player.playerId),
    };
    io.to(player.socketId).emit(ServerEvents.QUESTION_SHOW, playerPayload);
  }

  console.log(
    `room ${room.code} started — question ${room.currentQuestionIndex + 1}/${totalQuestions} (stage ${room.stage})`,
  );
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

  // Sabotage (Task 28c): the shuffled order belonged to the question that
  // just ended. Every answer was de-permuted on submit, so `results` below
  // is already canonical - from here on there is one option order again, the
  // TV's, which is the one the reveal is read in.
  room.shuffledOptionsByTarget.clear();

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
// wins, and the timer is always cleared so it can never fire twice. In a
// stealing stage the STEAL phase goes HERE, between REVEAL and any
// SCOREBOARD, so the standings a scoreboard shows are always post-theft.
export function advanceFromReveal(code: RoomCode): void {
  const room = getRoom(code);
  if (!room || room.phase !== 'REVEAL') {
    return;
  }

  if (startStealIfEligible(room)) {
    return; // the steal runs its own timers and calls continueAfterReveal itself
  }
  continueAfterReveal(room);
}

// Steal (Task 32). Starts the phase only when the STAGE calls for one AND
// this particular round produced a thief - "nobody answered correctly" (and
// the other no-thief cases in buildStealState) simply skips it entirely.
// Returns whether the phase actually began, so the caller knows whether to
// carry on to SCOREBOARD/next question itself.
function startStealIfEligible(room: Room): boolean {
  if (!stageForQuestionIndex(room.currentQuestionIndex).stealAfterEveryQuestion) {
    return false;
  }
  const steal = buildStealState(room);
  if (!steal) {
    console.log(`room ${room.code} skipping steal after question ${room.currentQuestionIndex + 1} — no eligible thief`);
    return false;
  }

  room.steal = steal;
  room.phase = 'STEAL';
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });

  // Armed BEFORE the payloads are built - they report the timer's remaining
  // time, so it has to exist first.
  armActiveTimer(room, 'STEAL', STEAL_DURATION_MS, () => resolveSteal(room.code, null));

  broadcastSteal(room);
  console.log(
    `room ${room.code} steal phase — ${steal.thiefName} may take up to ${steal.amount} ` +
      `(after question ${room.currentQuestionIndex + 1})`,
  );
  return true;
}

// Per phone, never built once and reused: only the THIEF's payload carries a
// target list, and `youAreThief` is what turns their phone into the picker.
function broadcastSteal(room: Room): void {
  const hostPayload = buildStealHostPayload(room);
  if (hostPayload && room.hostSocketId) {
    io.to(room.hostSocketId).emit(ServerEvents.STEAL_SHOW, hostPayload);
  }
  for (const player of getConnectedPlayers(room)) {
    const playerPayload = buildStealPlayerPayload(room, player.playerId);
    if (playerPayload) {
      io.to(player.socketId).emit(ServerEvents.STEAL_SHOW, playerPayload);
    }
  }
}

// Resolves the theft exactly once - guarded by both the phase check and
// `resolved`, so whichever of (the thief picks) / (the 8s timer fires)
// happens first wins. `victimPlayerId` null means the thief never chose, and
// per spec nothing is stolen. The phase does NOT end here: it stays up for a
// short announcement beat on its own timer, which is what the TV shows.
export function resolveSteal(code: RoomCode, victimPlayerId: string | null): void {
  const room = getRoom(code);
  if (!room || room.phase !== 'STEAL' || !room.steal || room.steal.resolved) {
    return;
  }

  const steal = room.steal;
  steal.chosenTargetPlayerId = victimPlayerId;
  steal.resolved = applySteal(room, steal, victimPlayerId);

  armActiveTimer(room, 'STEAL_ANNOUNCE', STEAL_ANNOUNCE_DURATION_MS, () => advanceFromSteal(room.code));

  // Public and symmetric, unlike the picker above - the theft is over, so
  // everyone (TV included) gets the same figures.
  io.to(room.code).emit(ServerEvents.STEAL_RESOLVED, steal.resolved);
  // Followed by a fresh steal:show so a phone that was mid-picker switches to
  // the announcement view from the same state the server holds.
  broadcastSteal(room);

  console.log(
    `room ${room.code} steal resolved — ${steal.resolved.thiefName} took ${steal.resolved.stolenAmount} ` +
      `of ${steal.resolved.attemptedAmount} from ${steal.resolved.victimName ?? 'nobody'}`,
  );
}

// Same one-shot discipline as advanceFromReveal - ends the announcement beat
// and hands back to the normal post-REVEAL path.
export function advanceFromSteal(code: RoomCode): void {
  const room = getRoom(code);
  if (!room || room.phase !== 'STEAL') {
    return;
  }
  room.steal = null;
  continueAfterReveal(room);
}

// What follows a REVEAL once any STEAL is done with: either SCOREBOARD
// (arming its own timer) or - when this question doesn't warrant one - the
// next question/GAME_OVER, exactly as if a SCOREBOARD had shown and
// immediately auto-advanced.
function continueAfterReveal(room: Room): void {
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
  // May run the one POWER_UP phase first, which then starts this question
  // itself once it's done.
  enterQuestionOrPowerUp(room);
}

// The continuation a resumed timer should fire once its remaining time
// elapses - whichever function originally would have advanced the phase
// that got paused.
export function continuationForActiveTimer(room: Room): (() => void) | null {
  if (!room.activeTimer) {
    return null;
  }
  switch (room.activeTimer.kind) {
    case 'POWER_UP':
      return () => endPowerUp(room.code);
    case 'QUESTION':
      return () => endQuestion(room.code);
    case 'REVEAL':
      return () => advanceFromReveal(room.code);
    case 'STEAL':
      return () => resolveSteal(room.code, null);
    case 'STEAL_ANNOUNCE':
      return () => advanceFromSteal(room.code);
    case 'SCOREBOARD':
      return () => advanceFromScoreboard(room.code);
  }
}
