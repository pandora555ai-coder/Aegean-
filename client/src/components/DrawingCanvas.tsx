import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
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

// A destination-out erase can only ATTENUATE existing alpha proportionally
// to its own edge coverage (result = a * (1 - a) at a shared anti-aliased
// boundary), which never reaches exactly 0 unless the eraser's opaque core
// fully swallows the ink's anti-aliased fringe first - a same-width erase
// over the same-width ink leaves a faint dotted outline at every edge
// pixel. The multiplier covers large sizes proportionally; the +3px floor
// is what actually matters at 'small', where 60% of a ~2px line still
// isn't a full pixel of extra reach.
const ERASER_WIDTH_MULTIPLIER = 1.6;
const ERASER_WIDTH_FLOOR_PX = 3;

function strokeLineWidth(tool: Tool, size: SizeKey, canvasSize: number): number {
  const base = canvasSize * SIZE_RATIOS[size];
  return tool === 'eraser' ? Math.max(base * ERASER_WIDTH_MULTIPLIER, base + ERASER_WIDTH_FLOOR_PX) : base;
}

const INK = '#12102a';
const PAPER = '#ffffff';

// Task 63 - every colour but these two now comes from the wheel, which is
// always on-screen (no more popup), so the swatch list shrinks to just the
// two shortcuts a thumb reaches for constantly: paper white and ink black.
const SWATCHES: { color: string; label: string }[] = [
  { color: PAPER, label: 'λευκό' },
  { color: INK, label: 'μαύρο' },
];

// Sized to sit in the same single row as the swatches, tool icons and size
// dots (Task 63) rather than floating over the canvas as a popup.
const WHEEL_SIZE = 38;
const WHEEL_INDICATOR_RADIUS = 15;

export interface DrawingCanvasHandle {
  // A data URL, or null if nothing has been drawn yet.
  exportDataUrl: () => string | null;
}

// Task 63 - Στυλό/Γόμα/Γέμισμα lose their text labels so the tool trio fits
// its third of the one-row toolbar; these replace them one-for-one.
function PenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 3.5 L16.5 6.5 L7 16 L3.5 16.5 L4 13 Z" />
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 11 L7.5 4 L2.5 9 L8 16 H16 L14.5 11 Z" />
      <path d="M8 16 L12.5 11.5" />
    </svg>
  );
}

function FillIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2.5 L15.5 9 C17 10.5 17 12.5 15.5 14 C14 15.5 12 15.5 10.5 14 C9 12.5 9 10.5 10.5 9 Z" />
      <path d="M3.5 11.5 H12.5" />
      <circle cx="16.5" cy="16.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
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

// The wheel indicator has to reflect whatever colour is actually selected,
// including hex swatches that never pass through setHue - so hue is derived
// from the colour itself (RGB->HSL) rather than tracked as separate state.
function colorToHueDegrees(color: string): number {
  const { r, g, b } = colorToRgba(color);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  if (delta === 0) {
    return 0;
  }
  let h: number;
  if (max === rn) {
    h = ((gn - bn) / delta) % 6;
  } else if (max === gn) {
    h = (bn - rn) / delta + 2;
  } else {
    h = (rn - gn) / delta + 4;
  }
  h *= 60;
  return h < 0 ? h + 360 : h;
}

// Hue is defined as the clockwise angle from north (12 o'clock) - exactly
// how the wheel's conic-gradient paints it (hue 0 at the top, increasing
// clockwise). The pointer read and the indicator placement both go through
// this one pair, so they share a zero point by construction and can't drift
// apart into their own offsets again.
function wheelOffsetToHue(dx: number, dy: number): number {
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return (deg + 360) % 360;
}

function hueToWheelOffset(hueDeg: number, radius: number): { dx: number; dy: number } {
  const rad = (hueDeg * Math.PI) / 180;
  return { dx: radius * Math.sin(rad), dy: -radius * Math.cos(rad) };
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

  function tryPush(x: number, y: number, dx: number, dy: number) {
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
      return;
    }
    // Task 66 - this pixel failed the tolerance test, but so would a solid
    // stroke pixel one ring in from the fringe. Only paint it if it's still
    // blending toward something further along the same direction (differs
    // from that next pixel); one that already matches its neighbour is
    // solid content, not anti-aliasing, and must be left alone.
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
      return;
    }
    const nIdx = (ny * width + nx) * 4;
    const beyond: Rgba = { r: data[nIdx], g: data[nIdx + 1], b: data[nIdx + 2], a: data[nIdx + 3] };
    if (!colorsClose(pixel, beyond, 6)) {
      visited[vIdx] = 1;
      data[pIdx] = fill.r; data[pIdx + 1] = fill.g; data[pIdx + 2] = fill.b; data[pIdx + 3] = fill.a;
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

    tryPush(x - 1, y, -1, 0);
    tryPush(x + 1, y, 1, 0);
    tryPush(x, y - 1, 0, -1);
    tryPush(x, y + 1, 0, 1);
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
  ctx.lineWidth = strokeLineWidth(stroke.tool, stroke.size, canvasSize);

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

    useEffect(() => {
      onStrokeCountChange?.(strokeCount);
    }, [onStrokeCountChange, strokeCount]);

    // Replays every stroke as ONE continuous path each (round joins along
    // its whole length, not the many separate round-capped segments a live
    // drag paints per pointermove) - a single destination-out composite per
    // stroke, so an eraser clears to true alpha 0 with no seam left behind
    // from overlapping partial-alpha caps. Deliberately does NOT flatten to
    // paper: callers that need the canvas to look solid (resize) flatten
    // afterwards themselves; a plain post-stroke replay must leave erased/
    // background pixels genuinely transparent, not bake them opaque.
    const replayStrokes = useCallback((ctx: CanvasRenderingContext2D, size: number) => {
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, size, size);
      for (const stroke of strokesRef.current) {
        drawStroke(ctx, stroke, size);
      }
      if (currentStrokeRef.current) {
        drawStroke(ctx, currentStrokeRef.current, size);
      }
    }, []);

    const redraw = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) {
        return;
      }

      const size = sizeRef.current;
      replayStrokes(ctx, size);
      flattenToPaper(ctx, size);
    }, [replayStrokes]);

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
      ctx.lineWidth = strokeLineWidth(stroke.tool, stroke.size, canvasSize);
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
        // The live gesture just painted this stroke as many separate
        // per-move segments, each its own destination-out composite - the
        // anti-aliased caps between them don't sum to full transparency,
        // leaving a faint dotted trace behind an eraser stroke. Replaying
        // the finished stroke as ONE continuous path erases it in a single
        // clean pass. Not the flattening redraw() - this must leave a
        // genuinely erased spot at alpha 0, not bake it opaque.
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
          replayStrokes(ctx, sizeRef.current);
        }
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
      const hue = Math.round(wheelOffsetToHue(clientX - cx, clientY - cy));
      selectColor(`hsl(${hue}, 100%, 50%)`);
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

    const hue = useMemo(() => colorToHueDegrees(color), [color]);
    const { dx: indicatorDx, dy: indicatorDy } = hueToWheelOffset(hue, WHEEL_INDICATOR_RADIUS);
    const indicatorX = WHEEL_SIZE / 2 + indicatorDx;
    const indicatorY = WHEEL_SIZE / 2 + indicatorDy;

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
        {/* Task 63 - the whole toolbar in one row: the two fixed swatches,
            the wheel, the three tools and the three sizes, each cluster split
            by a thin separator. The wheel sits inline here (never absolute,
            never over the canvas) so criterion 2 holds at every width by
            construction, not by measurement. */}
        <div style={styles.unifiedRow}>
          {SWATCHES.map((swatch) => (
            <button
              key={swatch.color}
              type="button"
              aria-label={swatch.label}
              onClick={() => selectColor(swatch.color)}
              style={{
                ...styles.swatch,
                background: swatch.color,
                ...(color === swatch.color ? styles.swatchActive : null),
              }}
            />
          ))}
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
          <span style={styles.separator} />
          <button
            type="button"
            aria-label="Στυλό"
            aria-pressed={tool === 'pen'}
            style={{ ...styles.iconButton, ...(tool === 'pen' ? styles.iconButtonActive : null) }}
            onClick={() => setTool('pen')}
          >
            <PenIcon />
          </button>
          <button
            type="button"
            aria-label="Γόμα"
            aria-pressed={tool === 'eraser'}
            style={{ ...styles.iconButton, ...(tool === 'eraser' ? styles.iconButtonActive : null) }}
            onClick={() => setTool('eraser')}
          >
            <EraserIcon />
          </button>
          <button
            type="button"
            aria-label="Γέμισμα"
            aria-pressed={tool === 'fill'}
            style={{ ...styles.iconButton, ...(tool === 'fill' ? styles.iconButtonActive : null) }}
            onClick={() => setTool('fill')}
          >
            <FillIcon />
          </button>
          <span style={styles.separator} />
          {SIZE_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={key}
              aria-pressed={brushSize === key}
              style={{ ...styles.iconButton, ...(brushSize === key ? styles.iconButtonActive : null) }}
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
  // Task 63 - wheel, swatches, tools and sizes all in one row, wrapped in
  // nowrap so it can never spill onto a second line and reclaim the
  // vertical space the old 3-row toolbar spent. Every child is inline in
  // normal flow (nothing absolute), so the wheel can never overlap the
  // canvas above it at any width - criterion 2 holds by construction, not
  // by measurement.
  unifiedRow: {
    display: 'flex',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: '0.2rem',
    overflowX: 'auto',
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
    width: WHEEL_SIZE - 14,
    height: WHEEL_SIZE - 14,
    borderRadius: '50%',
    border: '2px solid #ffffff',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
  },
  wheelIndicator: {
    position: 'absolute',
    width: 9,
    height: 9,
    borderRadius: '50%',
    background: '#ffffff',
    border: '2px solid #12102a',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
  },
  swatch: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.5)',
    padding: 0,
    flexShrink: 0,
    touchAction: 'manipulation',
  },
  swatchActive: {
    border: '2px solid #ffffff',
    boxShadow: '0 0 0 2px rgba(255,255,255,0.8)',
  },
  separator: {
    width: '1px',
    height: '22px',
    flexShrink: 0,
    background: 'var(--border-strong)',
    margin: '0 0.15rem',
  },
  iconButton: {
    width: '34px',
    height: '34px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-dim)',
    background: 'var(--surface-strong)',
    border: '1px solid var(--border-strong)',
    borderRadius: '0.6rem',
    touchAction: 'manipulation',
  },
  iconButtonActive: {
    color: 'var(--bg-edge)',
    background: 'var(--gold)',
    borderColor: 'var(--gold)',
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
