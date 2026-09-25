// Task 319 - draw/blitz/numeric/agora keep their per-game state in module-level
// WeakMaps keyed by the Room OBJECT, outside the Room literal, so the whitelist
// rebuild (state.ts's rebuildRoomForNewGame) cannot reach them by resetting
// Room fields. Each of those modules registers its own clearer here at load
// time and the rebuild calls clearModeStateForRoom - state.ts must not import
// the mode modules (they import it), and this file imports nothing at runtime.
import type { Room } from './state.js';

const clearers: Array<(room: Room) => void> = [];

export function registerModeStateClearer(clear: (room: Room) => void): void {
  clearers.push(clear);
}

export function clearModeStateForRoom(room: Room): void {
  for (const clear of clearers) {
    clear(room);
  }
}
