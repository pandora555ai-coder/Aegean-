import type { CSSProperties } from 'react';
import { ANSWER_IDENTITIES } from '@game/shared';

// Renders just the coloured shape glyph for one of the 4 answer slots - the
// one visual element used verbatim by both the TV and every phone, so the
// colour+shape identity can never drift between screens. Never use this
// alone: always pair it with the Greek letter (ANSWER_IDENTITIES[i].letter)
// so colour-blind players can still tell the four slots apart.
export function AnswerShape({
  index,
  sizeRem = 1.5,
  muted = false,
}: {
  index: number;
  sizeRem?: number;
  muted?: boolean;
}) {
  const identity = ANSWER_IDENTITIES[index];
  const style: CSSProperties = {
    fontSize: `${sizeRem}rem`,
    color: muted ? 'var(--text-faint)' : identity.color,
    lineHeight: 1,
  };
  return (
    <span style={style} aria-hidden="true">
      {identity.shape}
    </span>
  );
}
