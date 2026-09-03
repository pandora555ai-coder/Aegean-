import type { CSSProperties } from 'react';
import { AVATAR_CATALOGUE } from '@game/shared';

// Renders one player's mythological-creature avatar, circular-cropped and
// never distorted regardless of the source image's own aspect ratio
// (fixed width/height + object-fit: cover does the cropping; border-radius
// does the circle). `flexShrink: 0` is load-bearing wherever this sits next
// to a name in a flex row - the avatar must never be squeezed to make room
// for text; the TEXT is what gets an ellipsis instead (see each screen's
// name styles).
//
// `avatarId` may point at a catalogue entry whose image file doesn't
// actually exist (a stale value from before a room emptied, or simply one
// of the 17 not-yet-shipped creatures) - `onError` swaps to a plain
// silhouette glyph rather than ever showing the browser's broken-image
// icon, so this is always safe to render unconditionally.
export function Avatar({
  avatarId,
  sizeRem = 2.5,
  ringColor,
}: {
  avatarId: string;
  sizeRem?: number;
  ringColor?: string;
}) {
  const definition = AVATAR_CATALOGUE.find((avatar) => avatar.id === avatarId);

  const wrapperStyle: CSSProperties = {
    width: `${sizeRem}rem`,
    height: `${sizeRem}rem`,
    minWidth: `${sizeRem}rem`,
    minHeight: `${sizeRem}rem`,
    borderRadius: '50%',
    flexShrink: 0,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // --marble/--marble-3 below, not --surface-strong/--text-faint: those two only
    // ever lived in the retired theme stylesheet and are gone for good.
    background: 'var(--marble)',
    // --marble-3, not --border: --border only ever lived in the retired theme
    // stylesheet, so this rim vanished silently the day that file went.
    // Avatar draws on every /host score-column row, so the fallback branch
    // is live on every frame.
    border: ringColor ? `2px solid ${ringColor}` : '1px solid var(--marble-3)',
    fontSize: `${sizeRem * 0.55}rem`,
    color: 'var(--marble-3)',
    fontWeight: 700,
  };

  if (!definition) {
    return (
      <span style={wrapperStyle} aria-hidden="true" data-testid="avatar-fallback">
        ?
      </span>
    );
  }

  return (
    <span style={wrapperStyle}>
      <img
        src={`/avatars/${definition.filename}`}
        alt={definition.name}
        data-testid="avatar-image"
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        onError={(event) => {
          // Falls back to a plain silhouette glyph in place, in the same
          // circular frame, instead of a broken-image icon - swap the
          // whole node's content rather than leaving a dead <img>.
          const img = event.currentTarget;
          img.style.display = 'none';
          const parent = img.parentElement;
          if (parent && !parent.querySelector('[data-testid="avatar-fallback-glyph"]')) {
            const fallback = document.createElement('span');
            fallback.textContent = '?';
            fallback.setAttribute('data-testid', 'avatar-fallback-glyph');
            parent.appendChild(fallback);
          }
        }}
      />
    </span>
  );
}
