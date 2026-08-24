import {
  POWER_UP_DURATION_MS,
  REVEAL_DURATION_MS,
  SOCRATES_MAX_DURATION_MS,
  STAGE_ANNOUNCE_DURATION_MS,
  STEAL_ANNOUNCE_DURATION_MS,
  STEAL_DURATION_MS,
  ServerEvents,
  stageForQuestionIndex,
  type QuestionShowHostPayload,
  type QuestionShowPlayerPayload,
  type RevealPlayerResult,
  type RoomCode,
} from '@game/shared';
import { getConnectedPlayers, getRoom, type Room } from './state.js';
import { armActiveTimer, clearActiveTimer } from './timers.js';
import { armCrowdTensionTimer, clearCrowdTensionTimer, setCrowdMood } from './crowd.js';
import { calculatePoints } from './scoring.js';
import {
  pickGameIntroLine,
  pickQuestionIntro,
  pickStageIntroLine,
  pickWinnerLine,
  recordRoundAndPickLine,
  type PickedLine,
  type SocratesPlayerRoundInput,
} from './socrates.js';
import { activeSabotagesFor, resetSabotageForNewQuestion, optionsForPlayer } from './sabotage.js';
import { applyPendingPowerUps } from './powerups.js';
import { applySteal, buildStealState } from './steal.js';
import { io } from './realtime.js';
import {
  buildRevealHostPayload,
  buildRevealPlayerPayload,
  buildPowerUpHostPayload,
  buildPowerUpPlayerPayload,
  buildSocratesPayload,
  buildStageAnnounce,
  buildStealHostPayload,
  buildStealPlayerPayload,
  buildGameOver,
  computeStandings,
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

// Stages (Task 31a, Task 35). Brings room.stage in line with whatever
// question is about to be entered, and when it actually changes, HOLDS the
// game in a STAGE_ANNOUNCE phase for the announcement's own duration before
// anything else starts. Called from the single gate below, so "each stage is
// announced exactly once, as it begins" is structural rather than something
// each caller has to remember - and a pause, a reconnect or a re-broadcast
// can never re-announce, since none of them move currentQuestionIndex.
// Returns whether the beat began, so the gate knows to wait rather than
// starting the round itself: nothing else may run while the TV is showing
// the card, which is what keeps the announcement and the question from
// rendering on top of each other.
function announceStageIfChanged(room: Room): boolean {
  const definition = stageForQuestionIndex(room.currentQuestionIndex);
  if (room.stage === definition.stage) {
    return false;
  }
  room.stage = definition.stage;

  room.phase = 'STAGE_ANNOUNCE';
  // The shared helper, exactly like every other phase - so pausing during
  // the announcement freezes it and a reconnecting TV is told the real
  // remaining time instead of a fresh full duration.
  armActiveTimer(room, 'STAGE_ANNOUNCE', STAGE_ANNOUNCE_DURATION_MS, () => endStageAnnounce(room.code));
  // Crowd mood (Task 35) - calm for the announcement card, same as LOBBY.
  setCrowdMood(room, 'calm');

  // Card BEFORE the phase change, deliberately: the TV renders the card as
  // the STAGE_ANNOUNCE phase's whole view, so it must already hold it when
  // it learns the phase - otherwise there's a frame with a phase and no card.
  // Room-wide, but only the TV renders it: the phones are controllers and
  // are about to be busy with a power-up choice or an answer.
  io.to(room.code).emit(ServerEvents.STAGE_ANNOUNCE, buildStageAnnounce(room));
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
  console.log(`room ${room.code} entering stage ${definition.stage} — ${definition.title}`);
  return true;
}

// Ends the announcement beat exactly once - guarded by the phase check, the
// same one-shot discipline as every other advanceFrom*. Task 48: plays that
// stage's STAGE_INTRO beat right after the card, before the round itself
// starts - announceStageIfChanged already guarantees this runs exactly once
// per stage, so no separate "already played" flag is needed here the way
// GAME_INTRO needs one.
export function endStageAnnounce(code: RoomCode): void {
  const room = getRoom(code);
  if (!room || room.phase !== 'STAGE_ANNOUNCE') {
    return;
  }
  const stage = stageForQuestionIndex(room.currentQuestionIndex).stage;
  if (startSocratesBeat(room, 'STAGE_INTRO', pickStageIntroLine(room.socrates, stage))) {
    return; // advanceFromSocrates calls beginRound once the beat is over
  }
  beginRound(room);
}

// The ONLY way any question is ever entered - vip:start_game and every
// advance past a REVEAL/STEAL both come through here. That's what makes
// "the stage decides whether a POWER_UP precedes this question, and every
// stage announces itself once" structural rather than something each caller
// has to remember.
export function enterQuestionOrPowerUp(room: Room): void {
  // Task 48 - GAME_INTRO, exactly once per game, before anything else. This
  // gate runs on EVERY call (not just the very first), but the flag makes it
  // a cheap no-op past the first time - so nothing else here has to know
  // whether it's "the first call" itself.
  if (!room.gameIntroPlayed && startGameIntro(room)) {
    return; // advanceFromSocrates re-enters this same gate once it's over
  }
  if (announceStageIfChanged(room)) {
    return; // endStageAnnounce starts the round once the beat is over
  }
  beginRound(room);
}

// Set BEFORE attempting the beat, not after: GAME_INTRO must play at most
// once even if its pool somehow came back empty (practically unreachable -
// a fresh game always has a full, unused GAME_INTRO_LINES pool).
function startGameIntro(room: Room): boolean {
  room.gameIntroPlayed = true;
  return startSocratesBeat(room, 'GAME_INTRO', pickGameIntroLine(room.socrates));
}

// Task 48 - the shared entry for the three one-shot beats (GAME_INTRO/
// STAGE_INTRO/WINNER), parallel to startSocratesIfLineFired below but for a
// line that ISN'T tied to room.lastReveal. `picked` is null exactly when
// that beat's pool has nothing left to say (see PickedLine callers) - in
// which case this is a no-op and the caller falls through to whatever
// would've happened anyway, same "no line, no phase" discipline as every
// other Socrates beat.
function startSocratesBeat(room: Room, kind: 'GAME_INTRO' | 'STAGE_INTRO' | 'WINNER', picked: PickedLine | null): boolean {
  if (!picked) {
    return false;
  }
  room.pendingSocratesBeat = { kind, line: picked.text, lineTemplate: picked.template, lineTag: picked.tag };

  room.phase = 'SOCRATES';
  // Same backstop-at-the-ceiling arming as every other Socrates beat (see
  // startSocratesIfLineFired) - the normal path out is still the client's
  // SOCRATES_AUDIO_ENDED ack.
  armActiveTimer(room, 'SOCRATES', SOCRATES_MAX_DURATION_MS, () => advanceFromSocrates(room.code));

  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
  const payload = buildSocratesPayload(room);
  if (payload && room.hostSocketId) {
    io.to(room.hostSocketId).emit(ServerEvents.SOCRATES_SHOW, payload);
  }
  console.log(`room ${room.code} Socrates (${kind}) — "${picked.text}"`);
  return true;
}

// Everything the gate does once any stage announcement is out of the way -
// reached either directly (mid-stage) or from endStageAnnounce.
function beginRound(room: Room): void {
  if (stageForQuestionIndex(room.currentQuestionIndex).powerUpBeforeEveryQuestion) {
    startPowerUp(room);
    return;
  }
  room.phase = 'QUESTION';
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
  startQuestion(room); // arms the question timer HERE, as the question appears
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
  // Crowd mood (Task 35) - the whole power-up phase is tension.
  setCrowdMood(room, 'tension');

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
  // Crowd mood (Task 35) - calm to start, switching to tension for the last
  // third of the timer via its own pause-aware SimpleTimer (see crowd.ts).
  setCrowdMood(room, 'calm');
  armCrowdTensionTimer(room, questionTimeMs);

  // Wipe last question's sabotage state before this one's lands.
  resetSabotageForNewQuestion(room);
  // Power-up (Task 30a): the choices made in the POWER_UP phase that just
  // ended land HERE, on the very next question, on the same clock. Must
  // follow resetSabotageForNewQuestion, which clears activeSabotageByTarget -
  // the map this lands into.
  applyPendingPowerUps(room);

  const question = room.questions[room.currentQuestionIndex];
  const totalQuestions = room.questions.length;

  // Socrates (Task 24, renamed Task 37a): pure/synchronous, so this can
  // never delay the question or answer buttons appearing. Host-only, per
  // spec.
  const socratesIntro = pickQuestionIntro(room.socrates, {
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
    socratesIntro,
    standings: computeStandings(room),
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

  // Socrates (Task 24, renamed Task 37a) needs scoreBefore/scoreAfter and
  // whether they answered at all - built alongside `results` (same loop,
  // same source data) rather than recomputed from it afterward.
  const socratesInputs: SocratesPlayerRoundInput[] = [];

  const results: RevealPlayerResult[] = connectedPlayers.map((player) => {
    const recorded = room.answers.get(player.playerId);
    const choice = recorded ? recorded.choice : null;
    const correct = choice === question.correctIndex;
    const pointsAwarded = calculatePoints(correct, recorded?.timeMs ?? questionTimeMs, questionTimeMs);
    const scoreBefore = player.score;
    player.score += pointsAwarded;

    socratesInputs.push({
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
  for (const socratesInput of socratesInputs) {
    socratesInput.answerRank = answerRankByPlayerId.get(socratesInput.playerId) ?? null;
  }

  const answerCounts = [0, 0, 0, 0];
  for (const result of results) {
    if (result.choice !== null) {
      answerCounts[result.choice] += 1;
    }
  }

  const correctOption = question.options[question.correctIndex];

  // Pure/synchronous - can never delay the REVEAL broadcast that follows.
  const pickedLine = recordRoundAndPickLine(room.socrates, socratesInputs, {
    questionIndex: room.currentQuestionIndex,
    totalQuestions: room.questions.length,
    difficulty: question.difficulty,
  });

  room.phase = 'REVEAL';
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });

  // Crowd mood (Task 35) - must be cleared here regardless of whether it
  // already fired: a question that ends early (everyone answered before the
  // last third) would otherwise leave it armed to fire LATE, into REVEAL,
  // and stomp the cheer/boo this reveal is about to set.
  clearCrowdTensionTimer(room);
  const correctCount = results.filter((result) => result.correct).length;
  if (results.length > 0) {
    setCrowdMood(room, correctCount * 2 > results.length ? 'cheer' : 'boo');
  }

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
    socratesLine: pickedLine?.text ?? null,
    socratesLineTemplate: pickedLine?.template ?? null,
    socratesLineTag: pickedLine?.tag ?? null,
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

// Ends REVEAL exactly once - guarded by the phase check, so whichever of
// (the auto-advance timer firing) / (host clicking "skip") happens first
// wins, and the timer is always cleared so it can never fire twice. In a
// stealing stage the STEAL phase goes HERE, right after REVEAL, so the
// score column's post-theft figures are always the ones the next phase
// shows.
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
// carry on to the next question itself.
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
  // Crowd mood (Task 35) - the whole steal phase is tension, until it resolves.
  setCrowdMood(room, 'tension');

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
  // Crowd mood (Task 35) - a steal resolving is always a boo, win or not.
  setCrowdMood(room, 'boo');

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

// What follows a REVEAL once any STEAL is done with (Task 38 - the mid-game
// SCOREBOARD phase is gone now that scores are always visible on the TV's
// score column): Socrates' own beat if this round produced a line, then
// straight to the next question, or GAME_OVER on the last one.
// THE single post-REVEAL decision point: the reveal, the steal that may
// follow it and Socrates' own beat all leave through here, so nothing else
// ever decides what comes next. That makes it re-entrant by design - the
// SOCRATES beat comes back through it when it ends - and the phase check
// below is what makes the second pass fall through to the next question
// instead of starting a second beat (and with it a second, racing advance).
function continueAfterReveal(room: Room): void {
  if (room.phase !== 'SOCRATES' && startSocratesIfLineFired(room)) {
    return; // advanceFromSocrates comes back through here once the beat is over
  }
  advanceToNextQuestionOrGameOver(room);
}

// Socrates (Task 39). A real held phase on the shared timer, exactly like
// STAGE_ANNOUNCE: the TV shows him ALONE (beside the score column) and
// nothing else runs while he's speaking. The line itself was already picked
// when the round was scored (endQuestion -> recordRoundAndPickLine, stored on
// room.lastReveal), so this decides only WHETHER there is a beat - no line,
// no phase, rather than an empty screen. Returns whether it began, so the
// caller knows to wait rather than advancing itself.
function startSocratesIfLineFired(room: Room): boolean {
  if (!room.lastReveal?.socratesLine) {
    console.log(`room ${room.code} skipping Socrates after question ${room.currentQuestionIndex + 1} — no line fired`);
    return false;
  }

  room.phase = 'SOCRATES';
  // Armed BEFORE the payload is built - it reports the timer's remaining
  // time, so it has to exist first. Task 42c: armed at the CEILING, not this
  // line's own estimated audio length - the normal path out of this phase is
  // now the client's SOCRATES_AUDIO_ENDED ack (index.ts), fired the instant
  // its clip genuinely finishes, whatever that actually takes (network/decode
  // latency included). This timer is only the backstop for when that ack
  // never arrives at all (host muted, file missing, ack lost) - arming it at
  // the per-line estimate instead would reintroduce exactly the "phase ends
  // before the clip finishes" race this task exists to fix.
  armActiveTimer(room, 'SOCRATES', SOCRATES_MAX_DURATION_MS, () => advanceFromSocrates(room.code));
  // Crowd mood (Task 35) deliberately untouched: whatever the reveal (or a
  // steal) set is the mood he's speaking into, and re-setting it here would
  // stomp the cheer/boo this beat is a reaction to.

  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
  // Host only - the phones are controllers and never show commentary; they
  // stay on their own reveal result until the next question arrives.
  const payload = buildSocratesPayload(room);
  if (payload && room.hostSocketId) {
    io.to(room.hostSocketId).emit(ServerEvents.SOCRATES_SHOW, payload);
  }
  console.log(`room ${room.code} Socrates — "${room.lastReveal.socratesLine}"`);
  return true;
}

// Ends the commentary beat exactly once - the same one-shot discipline as
// every other advanceFrom*, so the auto-advance timer and a VIP skip can
// never both advance. Task 48: a REVEAL-moment beat never sets
// pendingSocratesBeat, so it falls to the original path (back through the
// one post-REVEAL decision point); GAME_INTRO/STAGE_INTRO/WINNER each carry
// their own explicit continuation instead, since none of them are part of
// that post-REVEAL sequence at all.
export function advanceFromSocrates(code: RoomCode): void {
  const room = getRoom(code);
  if (!room || room.phase !== 'SOCRATES') {
    return;
  }

  const pending = room.pendingSocratesBeat;
  if (pending) {
    room.pendingSocratesBeat = null;
    switch (pending.kind) {
      case 'GAME_INTRO':
        enterQuestionOrPowerUp(room); // now proceeds to announce stage 1
        return;
      case 'STAGE_INTRO':
        beginRound(room); // starts the question (or its power-up) this stage begins with
        return;
      case 'WINNER':
        finishGame(room);
        return;
    }
  }

  // Back through the one decision point rather than jumping to the tail
  // itself - the beat is part of the post-REVEAL sequence, not a second
  // path out of it (this is what a stage change on the next question hangs
  // off, and it is reached identically by the timer and by a VIP skip).
  continueAfterReveal(room);
}

// The shared tail of advanceFromReveal (directly, or via a STEAL first) -
// either the next question starts, or - on the final question - Socrates
// names the winner (Task 48) before the game actually ends.
function advanceToNextQuestionOrGameOver(room: Room): void {
  const isLastQuestion = room.currentQuestionIndex >= room.questions.length - 1;
  if (isLastQuestion) {
    if (startSocratesBeat(room, 'WINNER', pickWinnerLine(room.socrates))) {
      return; // advanceFromSocrates calls finishGame once the beat is over
    }
    finishGame(room);
    return;
  }

  room.currentQuestionIndex += 1;
  // May run the one POWER_UP phase first, which then starts this question
  // itself once it's done.
  enterQuestionOrPowerUp(room);
}

// The actual GAME_OVER transition - split out from advanceToNextQuestionOrGameOver
// so the WINNER beat above can sit between "this was the last question" and
// this, exactly like STAGE_INTRO sits between a stage announcement and its
// first question.
function finishGame(room: Room): void {
  room.phase = 'GAME_OVER';
  clearActiveTimer(room); // no more phase-advance timer needed once the game is over
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
  setCrowdMood(room, 'calm');
  const gameOverPayload = buildGameOver(room);
  io.to(room.code).emit(ServerEvents.GAME_OVER, gameOverPayload);
  console.log(`room ${room.code} game over — final standings: ${JSON.stringify(gameOverPayload.standings)}`);
}

// The continuation a resumed timer should fire once its remaining time
// elapses - whichever function originally would have advanced the phase
// that got paused.
export function continuationForActiveTimer(room: Room): (() => void) | null {
  if (!room.activeTimer) {
    return null;
  }
  switch (room.activeTimer.kind) {
    case 'STAGE_ANNOUNCE':
      return () => endStageAnnounce(room.code);
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
    case 'SOCRATES':
      return () => advanceFromSocrates(room.code);
  }
}
