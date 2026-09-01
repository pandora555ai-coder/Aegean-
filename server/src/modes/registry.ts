import { type GameModeId, type GameModeOption, type StageDefinition } from '@game/shared';
import type { GameMode } from './types.js';
// Type-only on purpose - see the note in types.ts. state.ts imports THIS
// module at runtime, so this one must never import it back.
import type { Room } from '../state.js';

// Every mode a room may run, by id. Populated by each mode module calling
// registerGameMode() as it loads - a registry rather than a static table so
// adding a mode touches only that mode's own file plus the barrel that
// imports it (modes/index.ts), never this one.
const modes = new Map<GameModeId, GameMode>();

export function registerGameMode(mode: GameMode): void {
  // Both are common to every mode: a room has to sit somewhere before a game
  // starts and after it ends. A mode missing either would strand rooms, and
  // finding that out at startup beats finding it out mid-game.
  for (const required of ['LOBBY', 'GAME_OVER'] as const) {
    if (!mode.phases.includes(required)) {
      throw new Error(`game mode '${mode.id}' does not declare the ${required} phase`);
    }
  }
  modes.set(mode.id, mode);
  console.log(`registered game mode '${mode.id}' — phases: ${mode.phases.join(', ')}`);
}

// Task 57 - the lobby's mode picker, read straight off whatever is actually
// registered (registration order) rather than a hardcoded array anywhere in
// client or server code: adding a mode module (which calls
// registerGameMode as it loads - see modes/index.ts) is what makes it
// appear here, with no edit to this function or to any lobby code.
export function listGameModeOptions(): GameModeOption[] {
  return [...modes.values()].map((mode) => ({ id: mode.id, label: mode.label, minPlayers: mode.minPlayers }));
}

// The mode a room is running. Throws rather than falling back to the quiz:
// an unregistered id means a mode module wasn't imported (see modes/index.ts),
// which is a wiring bug, and silently running the wrong game would hide it.
export function modeForRoom(room: Pick<Room, 'mode'>): GameMode {
  const mode = modes.get(room.mode);
  if (!mode) {
    throw new Error(`room is running unregistered game mode '${room.mode}'`);
  }
  return mode;
}

// Task 134 - THE stage table for a room, as opposed to the mode's static one:
// the quiz's is sliced by gameLength (plus Η Δίκη, always the last card), the
// full show's has its quiz counts substituted. Everything that reads a stage -
// phases.ts's stage machine, the TV's stage card (payloads.ts) - goes through
// here, so no call site has to know which mode it is looking at.
export function stagesForRoom(room: Room): readonly StageDefinition[] {
  const mode = modeForRoom(room);
  return mode.stagesFor?.(room) ?? mode.stages;
}

// The continuation a resumed timer should fire once its remaining time
// elapses - whichever function originally would have advanced the phase that
// got paused. Task 52: dispatches through the ROOM'S MODE rather than a fixed
// switch over phase names, so a mode's new phase can never silently break
// pause/resume - the mode's own continuations table is the single place a
// phase-advance timer's follow-up is declared.
export function continuationForActiveTimer(room: Room): (() => void) | null {
  if (!room.activeTimer) {
    return null;
  }
  const advance = modeForRoom(room).continuations[room.activeTimer.kind];
  if (!advance) {
    // Not silent: a timer whose kind no continuation claims would resume as a
    // game that never advances again, which is exactly the failure this
    // dispatch exists to make impossible to introduce quietly.
    console.log(
      `room ${room.code} has no continuation for timer kind '${room.activeTimer.kind}' in mode '${room.mode}'`,
    );
    return null;
  }
  return () => advance(room);
}
