import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

// Task 239 - top-left, below muteToggle's own LOBBY-only spot and
// audioSuspendedChip's (both left:1rem, hostStyles.ts) so none of the three
// ever overlap regardless of which are on screen together.
const rootStyle: CSSProperties = {
  position: 'fixed',
  top: 'calc(var(--tv-safe-top) + 6.5rem)',
  left: '1rem',
  fontSize: '0.9rem',
  fontWeight: 700,
  fontFamily: 'monospace',
  color: 'var(--marble-2)',
  background: 'color-mix(in srgb, var(--night-0) 55%, transparent)',
  borderRadius: '999px',
  padding: '0.3rem 0.75rem',
  pointerEvents: 'none',
  zIndex: 50,
};

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

interface GameClockProps {
  // Absolute ms (server or client clock, whichever HostScreen resolved) this
  // game began. The component only ever reads the current wall clock against
  // it - cosmetic, like every other client-side countdown/elapsed display in
  // this codebase, so a few hundred ms of clock drift is not a concern.
  startedAt: number;
}

export function GameClock({ startedAt }: GameClockProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={rootStyle} data-testid="game-clock">
      {formatElapsed(now - startedAt)}
    </div>
  );
}
