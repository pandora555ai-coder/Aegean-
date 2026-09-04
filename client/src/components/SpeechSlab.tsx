import type { CSSProperties, ReactNode } from 'react';
import { MarbleSlab } from './MarbleSlab';

const rootStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  // Matches SophistsRow's own basis (the full viewport, not reduced by the
  // TV overscan safe area - see SophistsRow's ".sophists-root") so the
  // slab's cqh sizing stays proportional to the row it floats above, the
  // same way design/theatre-reference.html's #speech and .sophists share
  // one `.tv` container.
  containerType: 'size',
  pointerEvents: 'none',
  zIndex: 3,
};

// The reference's own left:24%/width:52% (measured, /dev/scene) wraps the
// longest LINE_TAGS line (132 characters) to 4 lines at 4.8cqh - one over
// the 3-line budget. Widened to 72% (kept centred: symmetric ~14% margins)
// so the same 4.8cqh type has room for 3 lines instead of shrinking the
// font the reference specifies.
const slabStyle: CSSProperties = {
  position: 'absolute',
  left: '14%',
  bottom: '38%',
  width: '72%',
  fontFamily: '"Gentium Book Plus", Georgia, "Times New Roman", serif',
  fontSize: '4.8cqh',
  lineHeight: 1.25,
  fontWeight: 700,
  padding: '3.4cqh 4.5cqh',
  color: 'var(--carve)',
};

interface SpeechSlabProps {
  children: ReactNode;
  'data-testid'?: string;
}

// Task 163b - design/theatre-reference.html's #speech: a marble slab
// floating lower-left over the lit scene, used by SOCRATES (his own line)
// and STEAL (the resolved narration) in place of the top read column those
// two used to share with every other in-game phase.
export function SpeechSlab({ children, ...rest }: SpeechSlabProps) {
  return (
    <div style={rootStyle} aria-hidden="true">
      <MarbleSlab className="enter-pop" style={slabStyle} {...rest}>
        {children}
      </MarbleSlab>
    </div>
  );
}
