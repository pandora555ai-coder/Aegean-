import {
  BLITZ_STATEMENT_COUNT,
  FULL_DRAW_ROUNDS_BY_LENGTH,
  FULL_GUESS_SCORE_SCALE,
  FULL_NUMERIC_QUESTION_COUNT,
  MIN_PLAYERS,
  firstQuestionIndexOfStage,
  fullStagesForLength,
  stageSegment,
  type GamePhase,
  type StageDefinition,
} from '@game/shared';
import type { Room } from '../state.js';
import { getQuestionSet } from '../questions.js';
import { enterQuestionOrPowerUp, enterStageAnnounce } from '../phases.js';
import { QUIZ_CONTINUATIONS } from './quiz.js';
import { DRAW_CONTINUATIONS, clearDrawState, startDrawSegment } from './draw.js';
import { NUMERIC_CONTINUATIONS, prepareNumericGame, startNumericSegment } from './numeric.js';
import { BLITZ_CONTINUATIONS, prepareBlitzGame, startBlitzSegment } from './blitz.js';
import { AGORA_CONTINUATIONS, prepareAgoraRound, startAgoraSegment } from './agora.js';
import { registerGameMode } from './registry.js';
import type { GameMode } from './types.js';

// THE game (Task 134, relined by Task 214): one show that runs every
// mechanic back to back - the LOCKED lineup -
//
//   1  Η Αγορά             quiz questions (a POWER_UP before each, per the table)
//   2  Η Παλαίστρα         one blitz swipe window (BLITZ_STATEMENT_COUNT
//                          statements, BLITZ_DURATION_MS) then its reveal
//   3  Ζωγραφική           drawing round(s) (1, or 3 on gameLength 'long' - see
//                          FULL_DRAW_ROUNDS_BY_LENGTH): everyone draws, then every
//                          drawing is guessed in turn, each round advancing the
//                          moment every connected participant has submitted
//   4  Εκτίμηση            three numeric questions
//   5  Η Μνήμη της Αγοράς  one agora round: the exposure, then its three questions
//   6  Η Συκοφαντία        quiz questions, each followed by a STEAL
//   7  Η Ανάβασις          the climb finale (Task 188a), entered with the scores
//                          everyone accumulated across stages 1-6 as the ladder's
//                          entry order - or Η Δίκη (Task 127), which uses those
//                          same scores as LIFE, when the VIP sets finaleMode
//                          back to 'trial'
//
// - and then GAME_OVER, the only one in the mode.
//
// This file COMPOSES: it holds no mechanic of its own. Every phase, timer,
// payload and scoring rule is the existing mode's, called through the entry
// points those modules already expose (or, for the ones that were private,
// through the split-outs Tasks 134/207 made of them - startDrawSegment,
// startNumericSegment, prepareBlitzGame/startBlitzSegment,
// prepareAgoraRound/startAgoraSegment). Every standalone mode stays
// registered and VIP-selectable as the dev harness for its own mechanic, and
// nothing here changes what they do: the two GameMode hooks below
// (beginStage, advanceAfterSegment) are the whole coupling, and they are
// undefined there.
//
// There is no per-room state for this mode. WHERE the show is up to is
// room.stage, which the phase machine already keeps, and everything else lives
// in the state the composed modes keep for themselves.

const FULL_PHASES: readonly GamePhase[] = [
  'LOBBY',
  // Stages 1 and 6 - the quiz's own machine (phases.ts), unchanged.
  'STAGE_ANNOUNCE',
  'POWER_UP',
  'QUESTION',
  'REVEAL',
  'STEAL',
  'SOCRATES',
  // Stage 2 - modes/blitz.ts.
  'BLITZ',
  'BLITZ_REVEAL',
  // Stage 3 - modes/draw.ts.
  'DRAW',
  'GUESS',
  'GUESS_REVEAL',
  // Stage 4 - modes/numeric.ts.
  'NUMERIC_QUESTION',
  'NUMERIC_REVEAL',
  // Stage 5 - modes/agora.ts (its SOCRATES beat is the shared phase above).
  'AGORA_EXPOSE',
  'AGORA_QUESTION',
  'AGORA_REVEAL',
  // Stage 7 - the climb, the default finale since Task 214.
  'CLIMB_QUESTION',
  'CLIMB_REVEAL',
  // Task 188b - the climb's duel.
  'DUEL_PICK',
  'DUEL_REVEAL',
  // ...or the trial, when finaleMode is 'trial'. Part of the quiz's own machine.
  'TRIAL_QUESTION',
  'TRIAL_REVEAL',
  'GAME_OVER',
];

// The composed modes' tables, merged. Not restated: a timer kind's continuation
// is whatever the mode that ARMS it already says it is, so pause/resume in the
// middle of any segment of this show behaves exactly as it does in that
// segment's own mode.
function mergeContinuations(
  tables: readonly Record<string, (room: Room) => void>[],
): Record<string, (room: Room) => void> {
  const merged: Record<string, (room: Room) => void> = {};
  for (const table of tables) {
    for (const [kind, advance] of Object.entries(table)) {
      // Loudly, at startup, rather than silently letting one mode's idea of
      // what follows a timer kind win over another's: two modes sharing a kind
      // would mean a pause in one of them resumes into the other's phase.
      if (merged[kind]) {
        throw new Error(`game mode 'full': timer kind '${kind}' is claimed by two of the composed modes`);
      }
      merged[kind] = advance;
    }
  }
  return merged;
}

const FULL_CONTINUATIONS = mergeContinuations([
  QUIZ_CONTINUATIONS,
  BLITZ_CONTINUATIONS,
  DRAW_CONTINUATIONS,
  NUMERIC_CONTINUATIONS,
  AGORA_CONTINUATIONS,
]);

function stagesFor(room: Room): readonly StageDefinition[] {
  return fullStagesForLength(room.settings.gameLength);
}

function stageDefinition(room: Room, stage: number): StageDefinition | undefined {
  return stagesFor(room).find((definition) => definition.stage === stage);
}

// How many quiz questions the WHOLE show asks - both quiz stages' counts,
// which is what room.questions holds end to end. Stage 1 answers indices
// 0..n-1 and stage 6 answers n..2n-1; every non-quiz stage has a
// questionCount of 0, so a quiz question index maps straight past them.
function quizQuestionCount(room: Room): number {
  return stagesFor(room).reduce((total, definition) => total + definition.questionCount, 0);
}

function drawRoundCount(room: Room): number {
  return FULL_DRAW_ROUNDS_BY_LENGTH[room.settings.gameLength];
}

// Everything one game needs, drawn up front. Every sub-mode state is CLEARED
// here as well as dealt: "play again" reuses the same Room object, so a second
// show must never be able to see the first one's swipes, drawings (see
// clearDrawState), numeric questions or agora scene. Each of these four calls
// is the standalone mode's own prepare, deleting its state first.
function prepareGame(room: Room): void {
  room.questions = getQuestionSet(room.settings.difficultyMix, quizQuestionCount(room));
  prepareBlitzGame(room, BLITZ_STATEMENT_COUNT);
  clearDrawState(room);
  prepareNumericGame(room, FULL_NUMERIC_QUESTION_COUNT);
  prepareAgoraRound(room);
  console.log(
    `room ${room.code} full show: ${quizQuestionCount(room)} quiz question(s) over 2 stages, ` +
      `${BLITZ_STATEMENT_COUNT} blitz statement(s), ${drawRoundCount(room)} drawing round(s), ` +
      `${FULL_NUMERIC_QUESTION_COUNT} numeric question(s), 1 agora round`,
  );
}

// Stage 1 is a quiz stage, so the show opens through the quiz's single gate -
// which is what plays GAME_INTRO and announces stage 1 before anything else,
// exactly as it does for a standalone quiz.
function start(room: Room): void {
  enterQuestionOrPowerUp(room);
}

// Announces `stage` and holds on its card. Returns false for a stage the show
// doesn't drive itself - past the end, and the trial, which phases.ts enters
// through startTrial (it needs the unused question pool and the living-player
// list, none of which is this file's business).
function enterStage(room: Room, stage: number): boolean {
  const definition = stageDefinition(room, stage);
  if (!definition || stageSegment(definition) === 'trial') {
    return false;
  }
  if (stageSegment(definition) === 'quiz') {
    // A quiz stage that begins mid-show starts at its own first question. For
    // stage 1 this is 0, which is where vip:start_game already put it.
    room.currentQuestionIndex = firstQuestionIndexOfStage(stage, stagesFor(room));
  }
  enterStageAnnounce(room, stage);
  return true;
}

// Called by endStageAnnounce once the card has had its beat: start the stage's
// own mechanic. False for a quiz stage, which leaves the quiz's normal
// STAGE_INTRO-then-question path to run.
function beginStage(room: Room): boolean {
  const definition = stageDefinition(room, room.stage);
  if (!definition) {
    return false;
  }
  switch (stageSegment(definition)) {
    case 'blitz':
      startBlitzSegment(room);
      return true;
    case 'agora':
      startAgoraSegment(room);
      return true;
    case 'draw':
      if (startDrawSegment(room, drawRoundCount(room), FULL_GUESS_SCORE_SCALE)) {
        return true;
      }
      // Too few connected players to deal a drawing round (the mode's own
      // floor, checked against whoever is here NOW). The show goes on rather
      // than stalling on a stage nobody can play.
      console.log(`room ${room.code} full show: skipping the drawing stage — could not deal it`);
      return advanceAfterSegment(room);
    case 'numeric':
      startNumericSegment(room);
      return true;
    default:
      return false;
  }
}

// Called wherever a segment ENDS - the blitz reveal's, the drawing round's,
// the numeric run's and the agora round's own finishGame/finishRound, and the
// last question of a quiz stage. Moves the show to the next card. Returns
// false only when the next card is the FINALE row, which hands the decision
// back to the caller: for the quiz machine that means its existing "last
// question -> startClimb/startTrial -> WINNER -> GAME_OVER" tail, the one path
// this mode ends on.
function advanceAfterSegment(room: Room): boolean {
  return enterStage(room, room.stage + 1);
}

export const fullMode: GameMode = {
  id: 'full',
  label: 'Πλήρες παιχνίδι',
  // The drawing stage needs two players to deal (DRAW_MIN_PLAYERS), which is
  // the same floor the quiz has.
  minPlayers: MIN_PLAYERS,
  phases: FULL_PHASES,
  // The medium-length table; stagesFor is what every reader actually gets,
  // since the two quiz stages' counts depend on the VIP's length setting.
  stages: fullStagesForLength('medium'),
  stagesFor,
  prepareGame,
  start,
  beginStage,
  advanceAfterSegment,
  continuations: FULL_CONTINUATIONS,
};

registerGameMode(fullMode);
