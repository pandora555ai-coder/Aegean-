import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

// Task 156 - the blitz swipe surface, ported from DevBlitzScreen's round
// screen (Task 69/71) and driven by the SERVER's statement list instead of
// a local feed: the parent passes the texts and the index of the statement
// to show; this reports each committed swipe and never decides what comes
// next. One statement at a time, no going back, no correctness feedback -
// the truth isn't on this device. Colour is never information: the two edge
// labels react with opacity and weight only.
//
// Gesture resolution is DevBlitzScreen's verbatim: a fast flick commits by
// velocity, a drag past COMMIT_FRACTION of the surface's width commits by
// distance, a tap commits by which half was tapped, anything else springs
// home. The outgoing scroll flies off in its own pointer-events:none layer
// and the next one is mounted at rest synchronously - input never waits on
// an animation.

const COMMIT_FRACTION = 0.15; // of the surface's width
const FLICK_VELOCITY = 0.6; // px per ms
const TAP_SLOP = 10; // px of total travel below which a press counts as a tap
const MAX_TILT_DEG = 12;
const STACK_ROT_DEG = -4;
const STACK_SHIFT_PX = 14;

interface PointerTrack {
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  lastT: number;
  vx: number;
  moved: number;
  done: boolean;
}

interface ExitingCard {
  id: number;
  text: string;
  dir: 1 | -1;
}

interface BlitzSwipeProps {
  statements: string[];
  index: number; // the statement to show; the parent owns advancing it
  disabled: boolean; // paused - the surface still renders, swipes are ignored
  onSwipe: (index: number, answeredTrue: boolean) => void;
}

function tiltFor(dx: number): number {
  return Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, dx * 0.04));
}

export function BlitzSwipe({ statements, index, disabled, onSwipe }: BlitzSwipeProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<PointerTrack | null>(null);
  const springTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitIdRef = useRef(0);
  const [drag, setDrag] = useState({ dx: 0, dy: 0 });
  const [springing, setSpringing] = useState(false);
  const [exiting, setExiting] = useState<ExitingCard[]>([]);

  useEffect(
    () => () => {
      if (springTimerRef.current) clearTimeout(springTimerRef.current);
    },
    [],
  );

  const current = statements[index] ?? null;
  const buffered = statements[index + 1] ?? null;

  function surfaceWidth(): number {
    return rootRef.current?.clientWidth || window.innerWidth;
  }

  function commit(answeredTrue: boolean) {
    if (disabled || current === null) {
      springBack();
      return;
    }
    const id = exitIdRef.current++;
    const dir: 1 | -1 = answeredTrue ? 1 : -1;
    setExiting((list) => [...list, { id, text: current, dir }]);
    window.setTimeout(() => setExiting((list) => list.filter((card) => card.id !== id)), 420);
    setSpringing(false);
    setDrag({ dx: 0, dy: 0 });
    onSwipe(index, answeredTrue);
  }

  function springBack() {
    setSpringing(true);
    setDrag({ dx: 0, dy: 0 });
    if (springTimerRef.current) clearTimeout(springTimerRef.current);
    springTimerRef.current = setTimeout(() => setSpringing(false), 260);
  }

  const onPointerDown = (e: ReactPointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointerRef.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastT: e.timeStamp,
      vx: 0,
      moved: 0,
      done: false,
    };
    if (springTimerRef.current) clearTimeout(springTimerRef.current);
    setSpringing(false);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const p = pointerRef.current;
    if (!p || p.done || e.pointerId !== p.id) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    p.moved = Math.max(p.moved, Math.hypot(dx, dy));
    const dt = e.timeStamp - p.lastT;
    if (dt > 0) p.vx = (e.clientX - p.lastX) / dt;
    p.lastX = e.clientX;
    p.lastT = e.timeStamp;
    setDrag({ dx, dy: dy * 0.12 }); // 1:1 horizontal, vertical heavily damped
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const p = pointerRef.current;
    if (!p || p.done || e.pointerId !== p.id) return;
    p.done = true;
    pointerRef.current = null;

    const dx = e.clientX - p.startX;
    const width = surfaceWidth();
    const left = rootRef.current?.getBoundingClientRect().left ?? 0;
    if (Math.abs(p.vx) >= FLICK_VELOCITY) {
      commit(p.vx > 0);
    } else if (Math.abs(dx) >= COMMIT_FRACTION * width) {
      commit(dx > 0);
    } else if (p.moved < TAP_SLOP) {
      commit(e.clientX - left >= width / 2); // a tap - right half = ΣΩΣΤΟ, left half = ΛΑΘΟΣ
    } else {
      springBack();
    }
  };

  const progress = Math.max(-1, Math.min(1, drag.dx / (surfaceWidth() * COMMIT_FRACTION)));
  const rightWeight = progress > 0.45 ? 800 : 400;
  const leftWeight = progress < -0.45 ? 800 : 400;
  const stackPose = `translate(0px, ${STACK_SHIFT_PX}px) rotate(${STACK_ROT_DEG}deg)`;
  const frontTransform = `translate(${drag.dx}px, ${drag.dy}px) rotate(${tiltFor(drag.dx)}deg)`;
  const frontTransition = springing ? 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
  const frontOpacity = 1 - 0.28 * Math.min(1, Math.abs(progress));

  return (
    <div
      ref={rootRef}
      style={{ ...styles.root, opacity: disabled ? 0.6 : 1 }}
      data-testid="blitz-swipe"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <span
        style={{ ...styles.edgeLabel, ...styles.edgeLeft, opacity: 0.18 + 0.72 * Math.max(0, -progress), fontWeight: leftWeight }}
      >
        ΛΑΘΟΣ
      </span>
      <span
        style={{ ...styles.edgeLabel, ...styles.edgeRight, opacity: 0.18 + 0.72 * Math.max(0, progress), fontWeight: rightWeight }}
      >
        ΣΩΣΤΟ
      </span>

      {exiting.map((card) => (
        <Scroll
          key={card.id}
          style={{
            pointerEvents: 'none',
            transform: `translateX(${card.dir * surfaceWidth() * 0.9}px) rotate(${card.dir * 20}deg)`,
            opacity: 0,
            transition: 'transform 0.4s ease-out, opacity 0.4s ease-out',
          }}
        >
          {card.text}
        </Scroll>
      ))}

      {buffered !== null && (
        <Scroll style={{ pointerEvents: 'none', transform: stackPose, opacity: 0.7 }}>{buffered}</Scroll>
      )}

      {current !== null && (
        <Scroll
          key={index}
          testId="blitz-statement"
          style={{ transform: frontTransform, transition: frontTransition, opacity: frontOpacity }}
        >
          {current}
        </Scroll>
      )}
    </div>
  );
}

// The papyrus scroll: a rounded rect on the palette's papyrus gradient, one
// darker bar at the top edge and one at the bottom (the rolled ends).
function Scroll({ style, testId, children }: { style?: CSSProperties; testId?: string; children: ReactNode }) {
  return (
    <div style={{ ...styles.scroll, ...style }} data-testid={testId}>
      <div style={styles.scrollBarTop} />
      <div style={styles.scrollText}>{children}</div>
      <div style={styles.scrollBarBottom} />
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  root: {
    position: 'relative',
    width: '100%',
    flex: '1 1 auto',
    minHeight: '58vh',
    borderRadius: '1rem',
    background: 'var(--panel)',
    overflow: 'hidden',
    touchAction: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
  },
  // ΛΑΘΟΣ / ΣΩΣΤΟ sit OUTSIDE the scroll, vertical, at the very edges, low
  // opacity until dragged toward. No colour - opacity + weight only.
  edgeLabel: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: '0.95rem',
    letterSpacing: '0.14em',
    color: 'var(--cream)',
    writingMode: 'vertical-rl',
    textOrientation: 'mixed',
  },
  edgeLeft: { left: '0.45rem' },
  edgeRight: { right: '0.45rem', transform: 'translateY(-50%) rotate(180deg)' },
  scroll: {
    position: 'absolute',
    width: 'min(400px, 78%)',
    minHeight: '46%',
    borderRadius: '14px',
    background: 'linear-gradient(160deg, var(--pap-1), var(--pap-2))',
    color: 'var(--ink)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'stretch',
    overflow: 'hidden',
    willChange: 'transform',
    boxSizing: 'border-box',
  },
  scrollBarTop: { position: 'absolute', top: 0, left: 0, right: 0, height: '10px', background: 'var(--wood)' },
  scrollBarBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '10px', background: 'var(--wood)' },
  scrollText: {
    // system sans only - reading speed is the mechanic, no display face
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    textAlign: 'center',
    fontSize: '1.6rem',
    lineHeight: 1.3,
    fontWeight: 500,
    padding: '2.2rem 1.4rem',
  },
};
