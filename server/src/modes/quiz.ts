import { QUIZ_STAGES, totalQuestionsForLength, type GamePhase } from '@game/shared';
import type { Room } from '../state.js';
import { getQuestionSet } from '../questions.js';
import {
  advanceFromReveal,
  advanceFromSocrates,
  advanceFromSteal,
  endPowerUp,
  endQuestion,
  endStageAnnounce,
  enterQuestionOrPowerUp,
  resolveSteal,
  type QuizTimerKind,
} from '../phases.js';
import { registerGameMode } from './registry.js';
import type { GameMode } from './types.js';

// The original game, and the first GameMode (Task 52). Nothing here is new
// behaviour: it is the quiz's existing phase machine (phases.ts, untouched
// in what it does) plus the two tables that used to be implicit - which
// phases it uses, and what follows each of its timers.

const QUIZ_PHASES: readonly GamePhase[] = [
  'LOBBY',
  'STAGE_ANNOUNCE',
  'POWER_UP',
  'QUESTION',
  'REVEAL',
  'STEAL',
  'SOCRATES',
  'GAME_OVER',
];

// Keyed by QuizTimerKind, not by `string`, so the compiler still demands an
// entry for EVERY kind the quiz arms - the exhaustiveness the old switch in
// phases.ts gave us, kept, but now attached to the mode instead of to the
// timer module. The GameMode field it satisfies is the looser
// Record<string, ...>, which is what lets another mode name its own kinds.
const QUIZ_CONTINUATIONS: Record<QuizTimerKind, (room: Room) => void> = {
  STAGE_ANNOUNCE: (room) => endStageAnnounce(room.code),
  POWER_UP: (room) => endPowerUp(room.code),
  QUESTION: (room) => endQuestion(room.code),
  REVEAL: (room) => advanceFromReveal(room.code),
  STEAL: (room) => resolveSteal(room.code, null),
  STEAL_ANNOUNCE: (room) => advanceFromSteal(room.code),
  SOCRATES: (room) => advanceFromSocrates(room.code),
};

export const quizMode: GameMode = {
  id: 'quiz',
  phases: QUIZ_PHASES,
  stages: QUIZ_STAGES,
  // The question draw that used to sit in state.ts's buildRoomQuestions. It
  // is quiz content, so it belongs to the quiz: a mode that isn't about
  // questions simply does something else here.
  prepareGame(room: Room): void {
    room.questions = getQuestionSet(
      room.settings.difficultyMix,
      totalQuestionsForLength(room.settings.gameLength, QUIZ_STAGES),
    );
  },
  // A quiz game opens on the single gate every question is entered through -
  // which is what runs GAME_INTRO and announces stage 1 before anything else.
  start: enterQuestionOrPowerUp,
  continuations: QUIZ_CONTINUATIONS,
};

registerGameMode(quizMode);
