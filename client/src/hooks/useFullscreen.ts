import { useCallback, useEffect, useState } from 'react';

// Whole-page fullscreen (document.documentElement), not any one element -
// both the TV and phone views want the entire screen. Support is checked
// once at module load: iOS Safari has no requestFullscreen at all on plain
// elements, and that never changes mid-session, so there is nothing to
// re-check on every render.
export const fullscreenSupported =
  typeof document !== 'undefined' &&
  document.fullscreenEnabled === true &&
  typeof document.documentElement.requestFullscreen === 'function';

// Tracks the REAL fullscreen state via the fullscreenchange event rather
// than local state - Esc, a system gesture, or another tab taking over all
// exit fullscreen without going through `toggle`, and only the event fires
// then.
export function useFullscreen(): { isFullscreen: boolean; toggle: () => void } {
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);

  useEffect(() => {
    if (!fullscreenSupported) {
      return;
    }
    function handleChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  // Must run synchronously inside a user gesture handler (browsers reject an
  // async-deferred call), so no state updates or awaits before it fires.
  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  return { isFullscreen, toggle };
}
