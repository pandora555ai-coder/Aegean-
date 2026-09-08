import type { GamePhase } from '@game/shared';
import { endDuelPick, endDuelReveal, onDuelLockTimer, startDuel } from '../phases.js';
import { getConnectedPlayers, type ClimbState, type Room } from '../state.js';
import { registerGameMode } from './registry.js';
import type { GameMode } from './types.js';

// Task 191 - Η Μονομαχία (188b) as its own standalone dev-harness mode, the
// house pattern quiz/draw/numeric/blitz already follow: a mode with no
// mechanic of its own, existing only so the test menu can reach DUEL_PICK/
// DUEL_REVEAL without a full climb. Zero new mechanic - `start` builds just
// enough of a `room.climb` (the shape the duel already lives on, see
// ClimbState/ClimbDuelState in state.ts) to hand off to phases.ts's
// startDuel, and every phase function after that (submitDuelPick,
// onDuelLockTimer, onDuelAudioEnded, endDuelPick, endDuelReveal, and the
// quiz's mode-agnostic finishGame once endDuelReveal calls endClimb) is the
// SAME code the climb finale runs, untouched.

const DUEL_PHASES: readonly GamePhase[] = ['LOBBY', 'DUEL_PICK', 'DUEL_REVEAL', 'GAME_OVER'];

// This mode's own TimerKind, same reasoning as every other mode's (e.g.
// NumericTimerKind): its own continuations table, even though every entry
// dispatches to the exact function the quiz's QUIZ_CONTINUATIONS table
// already points DUEL_PICK/DUEL_LOCKED/DUEL_REVEAL at - nothing here is a
// second implementation, only a second table entry, which the GameMode
// contract requires per mode.
export type DuelTimerKind = 'DUEL_PICK' | 'DUEL_LOCKED' | 'DUEL_REVEAL';

export const DUEL_CONTINUATIONS: Record<DuelTimerKind, (room: Room) => void> = {
  DUEL_PICK: (room) => endDuelPick(room.code),
  DUEL_LOCKED: (room) => onDuelLockTimer(room.code),
  DUEL_REVEAL: (room) => endDuelReveal(room.code),
};

// Nothing to draw - the duelists are picked from the CONNECTED roster at
// start(), not at prepareGame() time (a player could join/leave the lobby
// right up to the VIP tapping Έναρξη).
function prepareGame(_room: Room): void {}

// vip:start_game calls only this. Duelists = the first two players by join
// order among those connected right now (getConnectedPlayers preserves
// Room.players' Map insertion order - see state.ts); every other connected
// player spectates via the duel's existing spectator payloads (youDuel:
// false), same as a 3+-way climb arrival that didn't make the duel.
function start(room: Room): void {
  const duelistIds = getConnectedPlayers(room)
    .slice(0, 2)
    .map((player) => player.playerId) as [string, string];
  const climb: ClimbState = {
    questions: [],
    questionIndex: -1,
    climberIds: duelistIds,
    steps: new Map(duelistIds.map((id) => [id, 0])),
    lockIns: new Map(),
    roundsPlayed: 0,
    winnerPlayerId: null,
    lastResults: null,
    lastCorrectIndex: null,
    duel: null,
  };
  room.climb = climb;
  startDuel(room, duelistIds);
}

export const duelMode: GameMode = {
  id: 'duel',
  label: 'Η Μονομαχία',
  minPlayers: 2,
  phases: DUEL_PHASES,
  // No stage table - like draw/numeric, this mode has no notion of stages.
  stages: [],
  prepareGame,
  start,
  continuations: DUEL_CONTINUATIONS,
};

registerGameMode(duelMode);
