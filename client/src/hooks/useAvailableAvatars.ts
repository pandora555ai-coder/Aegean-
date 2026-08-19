import { useEffect, useState } from 'react';
import { AVATAR_CATALOGUE, type AvatarDefinition } from '@game/shared';

// Probes every catalogue entry's actual image file via a plain <img> load,
// rather than hard-coding "these 7 exist" anywhere in code - only 7 of 24
// creatures have art today, and this is the mechanism that picks up the
// rest automatically the moment their PNGs land in client/public/avatars/
// and a build ships, with zero code change here. The server runs the
// equivalent check against the filesystem directly (server/src/avatars.ts)
// so the two can never disagree about what's "available" for more than an
// instant during a race.
export function useAvailableAvatars(): AvatarDefinition[] {
  const [available, setAvailable] = useState<AvatarDefinition[]>([]);

  useEffect(() => {
    let cancelled = false;
    setAvailable([]);

    for (const avatar of AVATAR_CATALOGUE) {
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        setAvailable((prev) => (prev.some((a) => a.id === avatar.id) ? prev : [...prev, avatar]));
      };
      // Missing file (404) or a broken image - simply never added, never
      // rendered, never surfaced as an error to the player.
      img.onerror = () => {};
      img.src = `/avatars/${avatar.filename}`;
    }

    return () => {
      cancelled = true;
    };
  }, []);

  return available;
}
