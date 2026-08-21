import { useEffect, useRef, useState } from 'react';

const DEFAULT_DURATION_MS = 900;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// Eases a displayed number toward `value` whenever it changes, instead of
// snapping straight to it - used for STEAL's score counters so a transfer
// visibly ticks down/up rather than jumping. The very first render shows
// the value immediately (nothing to tween from).
export function useAnimatedNumber(value: number, durationMs = DEFAULT_DURATION_MS): number {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);

  useEffect(() => {
    const from = displayRef.current;
    if (from === value) {
      return;
    }
    const start = performance.now();
    let frame: number;

    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const next = Math.round(from + (value - from) * easeOutCubic(t));
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      }
    }
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return display;
}
