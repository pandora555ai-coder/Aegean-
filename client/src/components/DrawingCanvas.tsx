import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { DRAWING_EXPORT_QUALITY, DRAWING_EXPORT_SIZE } from '@game/shared';

// A finger-drawing surface with undo and clear. Deliberately featureless:
// one colour, one brush size (Task 53). Not wired into a game phase yet -
// the /dev/draw screen is its only caller.
//
// Strokes are kept as NORMALISED points (0..1 on both axes), never as
// device pixels. That is what lets the same stroke list be redrawn after a
// rotation or a resize, and exported at a fixed size on any handset,
// without ever rescaling pixels.

interface Point {
  x: number;
  y: number;
}

type Stroke = Point[];

// Fraction of the surface's width. At the 512px export that is ~6px -
// thick enough to read across a room on the TV.
const LINE_WIDTH_RATIO = 0.012;
const INK = '#12102a';
const PAPER = '#ffffff';

export interface DrawingCanvasHandle {
  // A data URL, or null if nothing has been drawn yet.
  exportDataUrl: () => string | null;
}

interface DrawingCanvasProps {
  // Fires whenever the finished-stroke count changes, so the caller can
  // enable/disable its own submit button.
  onStrokeCountChange?: (count: number) => void;
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, size: number) {
  if (stroke.length === 0) {
    return;
  }

  ctx.lineWidth = size * LINE_WIDTH_RATIO;

  // A tap is a dot, not a zero-length line - a stroked path of one point
  // paints nothing at all in canvas 2D.
  if (stroke.length === 1) {
    ctx.beginPath();
    ctx.arc(stroke[0].x * size, stroke[0].y * size, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(stroke[0].x * size, stroke[0].y * size);
  for (let i = 1; i < stroke.length; i += 1) {
    ctx.lineTo(stroke[i].x * size, stroke[i].y * size);
  }
  ctx.stroke();
}

function prepareContext(ctx: CanvasRenderingContext2D) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
}

export const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(
  function DrawingCanvas({ onStrokeCountChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    // Finished strokes live in a ref, not in state: they are redrawn
    // imperatively and a re-render per pointermove would be the lag.
    const strokesRef = useRef<Stroke[]>([]);
    const currentStrokeRef = useRef<Stroke | null>(null);
    const activePointerRef = useRef<number | null>(null);
    // CSS pixel width of the (square) surface - the coordinate space the
    // context is scaled into.
    const sizeRef = useRef(0);
    const [strokeCount, setStrokeCount] = useState(0);

    useEffect(() => {
      onStrokeCountChange?.(strokeCount);
    }, [onStrokeCountChange, strokeCount]);

    const redraw = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) {
        return;
      }

      const size = sizeRef.current;
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, size, size);
      prepareContext(ctx);
      for (const stroke of strokesRef.current) {
        drawStroke(ctx, stroke, size);
      }
      if (currentStrokeRef.current) {
        drawStroke(ctx, currentStrokeRef.current, size);
      }
    }, []);

    // The canvas backing store follows its laid-out size x devicePixelRatio
    // (capped at 2 - a 3x phone gains nothing visible here and pays for it
    // in fill rate), and everything below draws in CSS pixels.
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      function resize() {
        const element = canvasRef.current;
        const ctx = element?.getContext('2d');
        if (!element || !ctx) {
          return;
        }

        const cssSize = element.getBoundingClientRect().width;
        if (cssSize === 0) {
          return;
        }

        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        element.width = Math.round(cssSize * ratio);
        element.height = Math.round(cssSize * ratio);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        sizeRef.current = cssSize;
        redraw();
      }

      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);
      return () => observer.disconnect();
    }, [redraw]);

    const pointFromEvent = useCallback((clientX: number, clientY: number): Point => {
      const rect = canvasRef.current!.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / rect.width,
        y: (clientY - rect.top) / rect.height,
      };
    }, []);

    function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
      // Second and later fingers are ignored outright - this is a one-line
      // drawing surface, and tracking them would draw stray strokes.
      if (activePointerRef.current !== null) {
        return;
      }

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) {
        return;
      }

      activePointerRef.current = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
      const point = pointFromEvent(event.clientX, event.clientY);
      currentStrokeRef.current = [point];
      prepareContext(ctx);
      drawStroke(ctx, currentStrokeRef.current, sizeRef.current);
    }

    function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
      const stroke = currentStrokeRef.current;
      if (activePointerRef.current !== event.pointerId || !stroke) {
        return;
      }

      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) {
        return;
      }

      // A phone reports touch positions faster than it fires pointermove;
      // the coalesced events are the ones that were merged into this
      // frame's. Using them is what keeps a fast swipe a curve instead of
      // a run of straight chords.
      const native = event.nativeEvent;
      const moves = typeof native.getCoalescedEvents === 'function'
        ? native.getCoalescedEvents()
        : [native];

      const size = sizeRef.current;
      prepareContext(ctx);
      ctx.lineWidth = size * LINE_WIDTH_RATIO;
      ctx.beginPath();
      const last = stroke[stroke.length - 1];
      ctx.moveTo(last.x * size, last.y * size);
      for (const move of moves) {
        const point = pointFromEvent(move.clientX, move.clientY);
        stroke.push(point);
        ctx.lineTo(point.x * size, point.y * size);
      }
      // Only the new segment is painted - a full redraw per move is what
      // makes a long drawing feel heavier the more it holds.
      ctx.stroke();
    }

    function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
      if (activePointerRef.current !== event.pointerId) {
        return;
      }

      const stroke = currentStrokeRef.current;
      activePointerRef.current = null;
      currentStrokeRef.current = null;
      if (stroke && stroke.length > 0) {
        strokesRef.current.push(stroke);
        setStrokeCount(strokesRef.current.length);
      }
    }

    function undo() {
      strokesRef.current.pop();
      setStrokeCount(strokesRef.current.length);
      redraw();
    }

    function clear() {
      strokesRef.current = [];
      setStrokeCount(0);
      redraw();
    }

    useImperativeHandle(ref, () => ({
      exportDataUrl() {
        if (strokesRef.current.length === 0) {
          return null;
        }

        // Exported off a throwaway canvas at a fixed size, so the bytes on
        // the wire don't depend on the handset's screen or pixel ratio.
        const out = document.createElement('canvas');
        out.width = DRAWING_EXPORT_SIZE;
        out.height = DRAWING_EXPORT_SIZE;
        const ctx = out.getContext('2d')!;
        ctx.fillStyle = PAPER;
        ctx.fillRect(0, 0, DRAWING_EXPORT_SIZE, DRAWING_EXPORT_SIZE);
        prepareContext(ctx);
        for (const stroke of strokesRef.current) {
          drawStroke(ctx, stroke, DRAWING_EXPORT_SIZE);
        }

        // WebP is roughly half of JPEG on flat line art. A browser that
        // can't encode it hands back a PNG data URL instead of failing,
        // so the prefix - not the argument - says what we actually got.
        const webp = out.toDataURL('image/webp', DRAWING_EXPORT_QUALITY);
        if (webp.startsWith('data:image/webp')) {
          return webp;
        }
        return out.toDataURL('image/jpeg', DRAWING_EXPORT_QUALITY);
      },
    }), []);

    return (
      <div style={styles.wrapper}>
        <canvas
          ref={canvasRef}
          style={styles.canvas}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        <div style={styles.buttonRow}>
          <button type="button" style={styles.button} onClick={undo} disabled={strokeCount === 0}>
            Αναίρεση
          </button>
          <button type="button" style={styles.button} onClick={clear} disabled={strokeCount === 0}>
            Καθάρισμα
          </button>
        </div>
      </div>
    );
  },
);

const styles: Record<string, CSSProperties> = {
  wrapper: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  canvas: {
    // `touch-action: none` is the whole of criterion 1's "no
    // scroll-hijacking": without it the browser owns the gesture and pans
    // or zooms the page while the finger is meant to be drawing, and the
    // pointermove stream stops dead the moment it decides to scroll.
    touchAction: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
    width: '100%',
    aspectRatio: '1 / 1',
    display: 'block',
    borderRadius: '0.75rem',
    border: '2px solid var(--border-strong)',
    background: PAPER,
  },
  buttonRow: { display: 'flex', gap: '0.75rem' },
  button: {
    flex: 1,
    padding: '0.85rem',
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--text)',
    background: 'var(--surface-strong)',
    border: '1px solid var(--border-strong)',
    borderRadius: '0.75rem',
    touchAction: 'manipulation',
  },
};
