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

// A finger-drawing surface with undo, clear, colour, eraser, size and fill
// (Task 53 + 54 + 55). Not wired into a game phase yet - the /dev/draw
// screen is its only caller.
//
// Strokes are kept as NORMALISED points (0..1 on both axes), never as
// device pixels. That is what lets the same stroke list be redrawn after a
// rotation or a resize, and exported at a fixed size on any handset,
// without ever rescaling pixels. Colour, size and tool are recorded PER
// STROKE (fixed at the finger-down that starts it), so a full redraw from
// the stroke list is enough to reconstruct the canvas exactly - which is
// also what makes undo correct for an eraser or fill stroke, not just a
// pen one: undo just pops the last entry, whatever tool made it.

interface Point {
  x: number;
  y: number;
}

type Tool = 'pen' | 'eraser' | 'fill';
type SizeKey = 'small' | 'medium' | 'large';

interface Stroke {
  points: Point[];
  color: string;
  size: SizeKey;
  tool: Tool;
}

// Fraction of the surface's width, one per size. At the 512px export,
// medium is ~6px - thick enough to read across a room on the TV. Medium is
// the pre-Task-54 default width, kept unchanged so old strokes don't jump.
const SIZE_RATIOS: Record<SizeKey, number> = {
  small: 0.006,
  medium: 0.012,
  large: 0.024,
};
const SIZE_ORDER: SizeKey[] = ['small', 'medium', 'large'];
const SIZE_DOT_PX: Record<SizeKey, number> = { small: 6, medium: 10, large: 16 };

const INK = '#12102a';
const PAPER = '#ffffff';

// The 8 fixed shortcuts, plus whatever the wheel is dragged to.
const SWATCHES = [INK, '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];

const WHEEL_SIZE = 56;
const WHEEL_INDICATOR_RADIUS = 22;

export interface DrawingCanvasHandle {
  // A data URL, or null if nothing has been drawn yet.
  exportDataUrl: () => string | null;
}

interface DrawingCanvasProps {
  // Fires whenever the finished-stroke count changes, so the caller can
  // enable/disable its own submit button.
  onStrokeCountChange?: (count: number) => void;
}

function prepareContext(ctx: CanvasRenderingContext2D, tool: Tool, color: string) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // The eraser removes ink where it passes rather than painting paper on
  // top of it: destination-out clears alpha instead of drawing a colour,
  // so it works identically over any ink colour and any stacking order.
  ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

// A throwaway 1x1 canvas is the simplest way to turn ANY CSS colour string
// this component uses - hex swatches, the hsl(...) the hue wheel emits -
// into concrete RGBA, without hand-rolling a parser per format.
let swatchCtx: CanvasRenderingContext2D | null = null;
function colorToRgba(color: string): Rgba {
  if (!swatchCtx) {
    const el = document.createElement('canvas');
    el.width = 1;
    el.height = 1;
    swatchCtx = el.getContext('2d', { willReadFrequently: true })!;
  }
  swatchCtx.clearRect(0, 0, 1, 1);
  swatchCtx.fillStyle = color;
  swatchCtx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = swatchCtx.getImageData(0, 0, 1, 1).data;
  return { r, g, b, a };
}

function colorsClose(a: Rgba, b: Rgba, tolerance: number): boolean {
  return (
    Math.abs(a.r - b.r) <= tolerance &&
    Math.abs(a.g - b.g) <= tolerance &&
    Math.abs(a.b - b.b) <= tolerance &&
    Math.abs(a.a - b.a) <= tolerance
  );
}

// Stack-based flood fill in raw pixel-buffer coordinates (getImageData /
// putImageData ignore the canvas's current transform, so the caller must
// hand in DEVICE pixels, not the CSS/export units the rest of this file
// draws in). Reads the tapped pixel as the "inside" colour and floods every
// 4-connected neighbour close enough to it - a boundary the eye reads as a
// closed line still has anti-aliased edge pixels blended toward the fill
// colour, so an exact match would leak the fill straight through them.
function floodFill(ctx: CanvasRenderingContext2D, startX: number, startY: number, fillColor: string, width: number, height: number) {
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) {
    return;
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const startIdx = (startY * width + startX) * 4;
  const target: Rgba = { r: data[startIdx], g: data[startIdx + 1], b: data[startIdx + 2], a: data[startIdx + 3] };
  const fill = colorToRgba(fillColor);
  const TOLERANCE = 48;

  if (colorsClose(target, fill, 0)) {
    return;
  }

  const visited = new Uint8Array(width * height);
  const stack: number[] = [startX, startY];
  visited[startY * width + startX] = 1;

  function tryPush(x: number, y: number) {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }
    const vIdx = y * width + x;
    if (visited[vIdx]) {
      return;
    }
    const pIdx = vIdx * 4;
    const pixel: Rgba = { r: data[pIdx], g: data[pIdx + 1], b: data[pIdx + 2], a: data[pIdx + 3] };
    if (colorsClose(pixel, target, TOLERANCE)) {
      visited[vIdx] = 1;
      stack.push(x, y);
    }
  }

  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    const idx = (y * width + x) * 4;
    data[idx] = fill.r;
    data[idx + 1] = fill.g;
    data[idx + 2] = fill.b;
    data[idx + 3] = fill.a;

    tryPush(x - 1, y);
    tryPush(x + 1, y);
    tryPush(x, y - 1);
    tryPush(x, y + 1);
  }

  ctx.putImageData(imageData, 0, 0);
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, canvasSize: number) {
  if (stroke.points.length === 0) {
    return;
  }

  if (stroke.tool === 'fill') {
    // Convert the tapped point from the CSS/export units the rest of this
    // file draws in into device pixels - the units getImageData actually
    // reads, regardless of the context's current scale transform.
    const canvas = ctx.canvas;
    const ratio = canvas.width / canvasSize;
    const x = Math.round(stroke.points[0].x * canvasSize * ratio);
    const y = Math.round(stroke.points[0].y * canvasSize * ratio);
    floodFill(ctx, x, y, stroke.color, canvas.width, canvas.height);
    return;
  }

  prepareContext(ctx, stroke.tool, stroke.color);
  ctx.lineWidth = canvasSize * SIZE_RATIOS[stroke.size];

  // A tap is a dot, not a zero-length line - a stroked path of one point
  // paints nothing at all in canvas 2D.
  if (stroke.points.length === 1) {
    ctx.beginPath();
    ctx.arc(stroke.points[0].x * canvasSize, stroke.points[0].y * canvasSize, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x * canvasSize, stroke.points[0].y * canvasSize);
  for (let i = 1; i < stroke.points.length; i += 1) {
    ctx.lineTo(stroke.points[i].x * canvasSize, stroke.points[i].y * canvasSize);
  }
  ctx.stroke();
}

// Erasing leaves real transparency (see prepareContext), which is what
// makes a redraw from the stroke list order-independent and correct - but
// it means the canvas has holes after replaying strokes. This is the one
// place those holes get backed with paper again: destination-over paints
// ONLY where the canvas is still transparent, leaving inked pixels alone.
function flattenToPaper(ctx: CanvasRenderingContext2D, canvasSize: number) {
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, canvasSize, canvasSize);
  ctx.globalCompositeOperation = 'source-over';
}

export const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(
  function DrawingCanvas({ onStrokeCountChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const wheelRef = useRef<HTMLDivElement | null>(null);
    // Finished strokes live in a ref, not in state: they are redrawn
    // imperatively and a re-render per pointermove would be the lag.
    const strokesRef = useRef<Stroke[]>([]);
    const currentStrokeRef = useRef<Stroke | null>(null);
    const activePointerRef = useRef<number | null>(null);
    const wheelDraggingRef = useRef(false);
    // CSS pixel width of the (square) surface - the coordinate space the
    // context is scaled into.
    const sizeRef = useRef(0);
    const [strokeCount, setStrokeCount] = useState(0);
    const [tool, setTool] = useState<Tool>('pen');
    const [color, setColor] = useState(INK);
    const [brushSize, setBrushSize] = useState<SizeKey>('medium');
    const [hue, setHue] = useState(0);
    // Collapsed by default (Task 55): a full wheel+swatch panel sitting on
    // the canvas permanently ate a corner of the drawing surface. Now it's
    // a small toggle that overlays the canvas only while open.
    const [pickerOpen, setPickerOpen] = useState(false);

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
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, size, size);
      for (const stroke of strokesRef.current) {
        drawStroke(ctx, stroke, size);
      }
      if (currentStrokeRef.current) {
        drawStroke(ctx, currentStrokeRef.current, size);
      }
      flattenToPaper(ctx, size);
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
      // Colour/size/tool are fixed for the whole gesture at finger-down, so
      // a tap on a swatch mid-stroke (impossible with one finger, but keeps
      // the model honest) can never change ink partway through a line.
      const stroke: Stroke = { points: [point], color, size: brushSize, tool };
      currentStrokeRef.current = stroke;
      drawStroke(ctx, stroke, sizeRef.current);
    }

    function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
      const stroke = currentStrokeRef.current;
      if (activePointerRef.current !== event.pointerId || !stroke) {
        return;
      }
      // Fill is a tap, not a line: it already flooded at pointer-down, and
      // dragging must not smear extra fill points into the same stroke.
      if (stroke.tool === 'fill') {
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

      const canvasSize = sizeRef.current;
      prepareContext(ctx, stroke.tool, stroke.color);
      ctx.lineWidth = canvasSize * SIZE_RATIOS[stroke.size];
      ctx.beginPath();
      const last = stroke.points[stroke.points.length - 1];
      ctx.moveTo(last.x * canvasSize, last.y * canvasSize);
      for (const move of moves) {
        const point = pointFromEvent(move.clientX, move.clientY);
        stroke.points.push(point);
        ctx.lineTo(point.x * canvasSize, point.y * canvasSize);
      }
      // Only the new segment is painted - a full redraw per move is what
      // makes a long drawing feel heavier the more it holds. The canvas's
      // own white CSS background stands in for paper under a fresh eraser
      // hole until the next redraw() flattens it for real.
      ctx.stroke();
    }

    function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
      if (activePointerRef.current !== event.pointerId) {
        return;
      }

      const stroke = currentStrokeRef.current;
      activePointerRef.current = null;
      currentStrokeRef.current = null;
      if (stroke && stroke.points.length > 0) {
        strokesRef.current.push(stroke);
        setStrokeCount(strokesRef.current.length);
      }
    }

    function undo() {
      // Pops whichever stroke was drawn last, pen or eraser, then replays
      // everything left from scratch - undo never needs to know which
      // tool made a stroke.
      strokesRef.current.pop();
      setStrokeCount(strokesRef.current.length);
      redraw();
    }

    function clear() {
      strokesRef.current = [];
      setStrokeCount(0);
      redraw();
    }

    // Picking a colour should never silently switch a fill tap back to the
    // pen - only the eraser (which has no colour of its own) gets bumped
    // over to a paintable tool.
    function selectColor(next: string) {
      setColor(next);
      setTool((current) => (current === 'eraser' ? 'pen' : current));
    }

    function updateHueFromPointer(clientX: number, clientY: number) {
      const wheel = wheelRef.current;
      if (!wheel) {
        return;
      }
      const rect = wheel.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angle = (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
      const normalized = Math.round((angle + 360) % 360);
      setHue(normalized);
      selectColor(`hsl(${normalized}, 100%, 50%)`);
    }

    function handleWheelPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
      event.currentTarget.setPointerCapture(event.pointerId);
      wheelDraggingRef.current = true;
      updateHueFromPointer(event.clientX, event.clientY);
    }

    function handleWheelPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
      if (!wheelDraggingRef.current) {
        return;
      }
      updateHueFromPointer(event.clientX, event.clientY);
    }

    function handleWheelPointerUp() {
      wheelDraggingRef.current = false;
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
        for (const stroke of strokesRef.current) {
          drawStroke(ctx, stroke, DRAWING_EXPORT_SIZE);
        }
        flattenToPaper(ctx, DRAWING_EXPORT_SIZE);

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

    const indicatorAngle = (hue * Math.PI) / 180;
    const indicatorX = WHEEL_SIZE / 2 + WHEEL_INDICATOR_RADIUS * Math.cos(indicatorAngle);
    const indicatorY = WHEEL_SIZE / 2 + WHEEL_INDICATOR_RADIUS * Math.sin(indicatorAngle);

    return (
      <div style={styles.wrapper}>
        <div style={styles.stage}>
          <canvas
            ref={canvasRef}
            style={styles.canvas}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        </div>
        <div style={styles.toolRow}>
          <div style={styles.pickerAnchor}>
            <button
              type="button"
              aria-label="επιλογή χρώματος"
              aria-expanded={pickerOpen}
              style={styles.pickerToggle}
              onClick={() => setPickerOpen((open) => !open)}
            >
              <span style={{ ...styles.pickerToggleSwatch, background: color }} />
            </button>
            {pickerOpen && (
              <div style={styles.pickerPanel}>
                <div
                  ref={wheelRef}
                  style={styles.wheel}
                  onPointerDown={handleWheelPointerDown}
                  onPointerMove={handleWheelPointerMove}
                  onPointerUp={handleWheelPointerUp}
                  onPointerCancel={handleWheelPointerUp}
                >
                  <div style={{ ...styles.wheelCenter, background: color }} />
                  <div style={{ ...styles.wheelIndicator, left: indicatorX, top: indicatorY }} />
                </div>
                <div style={styles.swatchGrid}>
                  {SWATCHES.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      aria-label={`χρώμα ${swatch}`}
                      onClick={() => selectColor(swatch)}
                      style={{
                        ...styles.swatch,
                        background: swatch,
                        ...(color === swatch ? styles.swatchActive : null),
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          <div style={styles.segmentGroup}>
            <button
              type="button"
              style={{ ...styles.segmentButton, ...(tool === 'pen' ? styles.segmentButtonActive : null) }}
              onClick={() => setTool('pen')}
            >
              Στυλό
            </button>
            <button
              type="button"
              style={{ ...styles.segmentButton, ...(tool === 'eraser' ? styles.segmentButtonActive : null) }}
              onClick={() => setTool('eraser')}
            >
              Γόμα
            </button>
            <button
              type="button"
              style={{ ...styles.segmentButton, ...(tool === 'fill' ? styles.segmentButtonActive : null) }}
              onClick={() => setTool('fill')}
            >
              Γέμισμα
            </button>
          </div>
        </div>
        <div style={styles.toolRow}>
          <div style={styles.segmentGroup}>
            {SIZE_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                aria-label={key}
                style={{ ...styles.sizeButton, ...(brushSize === key ? styles.segmentButtonActive : null) }}
                onClick={() => setBrushSize(key)}
              >
                <span
                  style={{
                    ...styles.sizeDot,
                    width: SIZE_DOT_PX[key],
                    height: SIZE_DOT_PX[key],
                    background: brushSize === key ? 'var(--bg-edge)' : 'var(--text-dim)',
                  }}
                />
              </button>
            ))}
          </div>
        </div>
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
  stage: { position: 'relative' },
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
  // The toggle itself sits inline in the tool row (never over the canvas),
  // so criterion 1's "no overlap when collapsed" holds by construction. The
  // expanded panel is the only part allowed to float over other controls,
  // and only while the user has it open.
  pickerAnchor: { position: 'relative' },
  pickerToggle: {
    width: '2.6rem',
    height: '2.6rem',
    padding: '0.3rem',
    borderRadius: '0.75rem',
    background: 'var(--surface-strong)',
    border: '1px solid var(--border-strong)',
    touchAction: 'manipulation',
  },
  pickerToggleSwatch: {
    display: 'block',
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.5)',
  },
  pickerPanel: {
    position: 'absolute',
    left: 0,
    bottom: 'calc(100% + 0.5rem)',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.35rem',
    borderRadius: '0.9rem',
    background: 'rgba(18, 16, 42, 0.9)',
    backdropFilter: 'blur(2px)',
    touchAction: 'none',
    boxShadow: '0 0.5rem 1.5rem rgba(0,0,0,0.35)',
  },
  wheel: {
    position: 'relative',
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
    borderRadius: '50%',
    background:
      'conic-gradient(hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))',
    touchAction: 'none',
    flexShrink: 0,
  },
  wheelCenter: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: WHEEL_SIZE - 20,
    height: WHEEL_SIZE - 20,
    borderRadius: '50%',
    border: '2px solid #ffffff',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
  },
  wheelIndicator: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: '#ffffff',
    border: '2px solid #12102a',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
  },
  swatchGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 16px)',
    gridAutoRows: '16px',
    gap: '4px',
  },
  swatch: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.5)',
    padding: 0,
    touchAction: 'manipulation',
  },
  swatchActive: {
    border: '2px solid #ffffff',
    boxShadow: '0 0 0 2px rgba(255,255,255,0.8)',
  },
  toolRow: { display: 'flex', gap: '0.5rem' },
  segmentGroup: {
    display: 'flex',
    flex: 1,
    gap: '0.35rem',
    background: 'var(--surface-strong)',
    border: '1px solid var(--border-strong)',
    borderRadius: '0.75rem',
    padding: '0.25rem',
  },
  segmentButton: {
    flex: 1,
    padding: '0.5rem 0.4rem',
    fontSize: '0.85rem',
    fontWeight: 700,
    color: 'var(--text-dim)',
    background: 'transparent',
    border: 'none',
    borderRadius: '0.5rem',
    touchAction: 'manipulation',
  },
  segmentButtonActive: {
    color: 'var(--text)',
    background: 'var(--gold)',
  },
  sizeButton: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.5rem 0.4rem',
    background: 'transparent',
    border: 'none',
    borderRadius: '0.5rem',
    touchAction: 'manipulation',
  },
  sizeDot: {
    display: 'block',
    borderRadius: '50%',
    background: 'var(--text-dim)',
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
