// The barrel that WIRES the modes up: importing a mode module is what
// registers it, so every mode must be imported here exactly once. This is the
// one file a new mode adds a line to.
import './quiz.js';
import './draw.js';

export { quizMode } from './quiz.js';
export { drawMode } from './draw.js';
export { continuationForActiveTimer, listGameModeOptions, modeForRoom, registerGameMode } from './registry.js';
export type { GameMode } from './types.js';
