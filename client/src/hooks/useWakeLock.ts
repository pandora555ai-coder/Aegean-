import { useEffect, useState } from 'react';

// Screen wake lock - the TV/tablet must not sleep mid-game, or the
// WebSocket freezes and the host connection drops. Tracks whether it
// actually succeeded (Tizen and others silently ignore this API entirely)
// so the caller can hint at a manual fallback instead of failing silently.
export function useWakeLock(): boolean {
  const [wakeLockFailed, setWakeLockFailed] = useState(false);

  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;

    async function requestWakeLock() {
      if (!('wakeLock' in navigator)) {
        setWakeLockFailed(true);
        return;
      }
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        setWakeLockFailed(false);
      } catch {
        // e.g. some browsers reject while the tab is hidden - visibilitychange
        // below retries once the page is visible again.
        setWakeLockFailed(true);
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    }

    requestWakeLock();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      wakeLock?.release().catch(() => {});
    };
  }, []);

  return wakeLockFailed;
}
