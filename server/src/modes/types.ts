import type { GameModeId, GamePhase, StageDefinition } from '@game/shared';
// Type-only, and deliberately so: nothing under modes/ may pull state.ts in
// at RUNTIME, since state.ts imports the registry below.
import type { Room } from '../state.js';

// A GAME the room can run (Task 52). Everything that used to be "the quiz,
// hardcoded" lives behind this: the phase sequence, what follows each phase,
// and the stage table that gives a game its shape. The room holds only
// `mode` (a GameModeId); this is what that id resolves to.
//
// To add a mode you write ONE module under server/src/modes/ that builds a
// GameMode and calls registerGameMode() - nothing in state.ts, timers.ts or
// realtime.ts changes. See modes/README for the full checklist.
export interface GameMode {
  id: GameModeId;

  // Every phase a room running this mode can be in, LOBBY and GAME_OVER
  // included (both are common to all modes - a room has to sit somewhere
  // before and after a game). The wire-level GamePhase union in @game/shared
  // is the union of all modes' lists; this is the subset THIS one uses.
  phases: readonly GamePhase[];

  // This mode's own stage table - the shape of one of its games. Passed to
  // the stage helpers in @game/shared (all of which take the table to read
  // as their last argument) instead of them reaching for a global.
  stages: readonly StageDefinition[];

  // Draws/builds whatever content one game needs, against room.settings.
  // Called for a fresh room and again on play-again, from state.ts - which
  // is why the question draw is HERE and not there: a mode that isn't about
  // questions has nothing to do with room.questions.
  prepareGame(room: Room): void;

  // Enters this mode's FIRST phase. vip:start_game calls exactly this and
  // nothing else, so no handler needs to know which phase a game opens on.
  start(room: Room): void;

  // What follows each of this mode's phase-advance timers, keyed by
  // ActiveTimer.kind. THE table continuationForActiveTimer dispatches
  // through, replacing the fixed switch that used to break pause every time
  // a phase was added: a phase that arms a timer only has to appear here for
  // pause/resume (and a mid-phase reconnect) to keep working.
  continuations: Readonly<Record<string, (room: Room) => void>>;
}
