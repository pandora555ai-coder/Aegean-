// The barrel that WIRES the modes up: importing a mode module is what
// registers it, so every mode must be imported here exactly once. This is the
// one file a new mode adds a line to.
import './quiz.js';
import './draw.js';
import './numeric.js';
import './blitz.js';
// Last, deliberately: 'full' composes the three above, and this is also the
// order the lobby's mode picker lists them in (registration order).
import './full.js';

export { quizMode } from './quiz.js';
export { drawMode } from './draw.js';
export { numericMode } from './numeric.js';
export { blitzMode } from './blitz.js';
export { fullMode } from './full.js';
export {
  continuationForActiveTimer,
  listGameModeOptions,
  modeForRoom,
  registerGameMode,
  stagesForRoom,
} from './registry.js';
export type { GameMode } from './types.js';
