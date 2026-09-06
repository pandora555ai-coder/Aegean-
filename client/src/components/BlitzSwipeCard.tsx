import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

// Task 156c - the phone's established flat-marble card language
// (ControllerScreen's own OPTION_SLAB_CLIP): MarbleSlab's chamfer clip-path,
// but flat --marble fill and no vein/lit/filter layer - that texture is
// TV-only. Duplicated as a literal here for the same reason
// ControllerScreen's own copy is: sharing the SHAPE needs no shared component.
const CARD_SLAB_CLIP = 'polygon(1.5% 0, 98.5% 0.6%, 100% 3%, 99.4% 97%, 98% 100%, 2% 99.4%, 0 96%, 0.6% 3%)';

// How far (px) a drag must travel before release commits an answer.
const COMMIT_THRESHOLD_PX = 60;
// How many px of drag it takes to grow the active label's scale by 1.0 -
// e.g. scale(2) at 120px of drag. Growth is DIRECT: no easing, no spring,
// no clamp - the label's size at any instant is a pure function of the
// pointer's CURRENT distance from where the drag started.
const SCALE_GROWTH_PX = 120;

interface BlitzSwipeCardProps {
  text: string;
  disabled: boolean;
  onCommit: (answeredTrue: boolean) => void;
}

// One statement, swiped: right commits ΣΩΣΤΟ (true), left commits ΛΑΘΟΣ
// (false). The card itself never moves - only the two flanking labels
// scale, directly off the live pointer delta, so "the label on the drag
// side grows" is the ONLY thing in motion, and only while a finger is
// actually down. Release past COMMIT_THRESHOLD_PX fires onCommit; release
// short of it resets dx to 0 with NO transition - an instant snap, not an
// animation - matching "no motion on the phone that is not driven by the finger."
export function BlitzSwipeCard({ text, disabled, onCommit }: BlitzSwipeCardProps) {
  const [dx, setDx] = useState(0);
  const pointerRef = useRef<{ id: number; startX: number } | null>(null);

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (disabled) {
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerRef.current = { id: e.pointerId, startX: e.clientX };
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const p = pointerRef.current;
    if (!p || e.pointerId !== p.id) {
      return;
    }
    setDx(e.clientX - p.startX);
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const p = pointerRef.current;
    if (!p || e.pointerId !== p.id) {
      return;
    }
    pointerRef.current = null;
    const finalDx = e.clientX - p.startX;
    setDx(0); // instant reset either way - no transition is ever set on this element
    if (Math.abs(finalDx) >= COMMIT_THRESHOLD_PX) {
      onCommit(finalDx > 0);
    }
  }

  const rightScale = 1 + Math.max(0, dx) / SCALE_GROWTH_PX;
  const leftScale = 1 + Math.max(0, -dx) / SCALE_GROWTH_PX;

  return (
    <div style={wrapStyle}>
      <span
        style={{ ...labelStyle, ...labelLeftStyle, transform: `translateY(-50%) scale(${leftScale})` }}
        data-testid="blitz-label-lathos"
        aria-hidden="true"
      >
        ΛΑΘΟΣ
      </span>
      <span
        style={{ ...labelStyle, ...labelRightStyle, transform: `translateY(-50%) scale(${rightScale})` }}
        data-testid="blitz-label-sosto"
        aria-hidden="true"
      >
        ΣΩΣΤΟ
      </span>
      <div
        style={cardStyle}
        data-testid="blitz-swipe-card"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {text}
      </div>
    </div>
  );
}

const wrapStyle: CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '13rem',
  padding: '0 3.5rem',
};

// The card: flat --marble, --carve text, MarbleSlab's own chamfer - no
// vein/lit/filter (phone rule). touchAction:'none' so the browser's own
// scroll/zoom gestures never fight the drag; userSelect:'none' so a slow
// drag doesn't select the statement text.
const cardStyle: CSSProperties = {
  width: '100%',
  minHeight: '44px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: '1.5rem 1.25rem',
  clipPath: CARD_SLAB_CLIP,
  border: '3px solid var(--marble-3)',
  background: 'var(--marble)',
  color: 'var(--carve)',
  fontSize: '1.2rem',
  fontWeight: 700,
  lineHeight: 1.35,
  touchAction: 'none',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  cursor: 'grab',
};

// Both labels share EVERY style but position - same size, same weight, same
// colour - so only the side (left/right) and its live scale carry meaning,
// never a colour difference between "correct" and "wrong".
const labelStyle: CSSProperties = {
  position: 'absolute',
  top: '50%',
  fontSize: '1rem',
  fontWeight: 800,
  letterSpacing: '0.08em',
  color: 'var(--marble)',
  pointerEvents: 'none',
};

const labelLeftStyle: CSSProperties = { left: '0.25rem', transformOrigin: 'left center' };
const labelRightStyle: CSSProperties = { right: '0.25rem', transformOrigin: 'right center' };
