import type { CSSProperties } from 'react';
import type { GamePhase } from '@game/shared';

// The one place that decides whether the scene is lit (Socrates centre
// stage) or dimmed (papyrus speaking) - keyed off phase so no view has to
// repeat this rhythm as a flag of its own. See dev/mockups/README.md.
const LIT_PHASES: ReadonlySet<GamePhase> = new Set([
  'LOBBY',
  'STAGE_ANNOUNCE',
  'SOCRATES',
  'STEAL',
  'GAME_OVER',
]);

export function isSceneLit(phase: GamePhase): boolean {
  return LIT_PHASES.has(phase);
}

const wrapStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
  transition: 'filter 450ms ease',
};

const backdropStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'var(--ground)',
};

const backdropImageStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

const socratesLayerStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
};

interface SceneLayerProps {
  phase: GamePhase;
}

// Task 104 - the scene stack every /host phase sits on top of: a backdrop
// layer (flat --ground for now, an <img> slot for /scene/backdrop.webp once
// it exists) and an empty layer above it reserved for an animated Socrates.
// Structure only - no assets yet, nothing here should be visible above the
// existing (opaque) phase views.
export function SceneLayer({ phase }: SceneLayerProps) {
  const lit = isSceneLit(phase);
  return (
    <div
      style={{ ...wrapStyle, filter: lit ? 'none' : 'brightness(0.55) saturate(0.7) blur(2px)' }}
      aria-hidden="true"
      data-scene-layer=""
    >
      <div style={backdropStyle}>
        <img
          src="/scene/backdrop.webp"
          alt=""
          style={backdropImageStyle}
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      </div>
      <div style={socratesLayerStyle} />
    </div>
  );
}
