import type { CSSProperties } from 'react';

export const QR_SIZE_PX = 240; // comfortably above the "at least 200px" floor

// React's CSSProperties doesn't model CSS custom properties - this lets the
// `--glow-color` variable the .glow/.glow-pulse classes read (in
// palette-theatro.css) be set inline per-element, since each glow needs
// a different colour.
export type CSSVars = CSSProperties & Record<`--${string}`, string>;

// "Slightly lighter panels with a subtle inner glow, so cards feel lit
// rather than painted on." Applied to every plain surface panel EXCEPT ones
// that also use the .glow/.glow-pulse classes - an inline boxShadow always
// wins over a CSS class's boxShadow, so combining the two would silently
// clobber the glow ring.
export const SURFACE_GLOW = 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 22px rgba(122,92,210,0.12)';

// TV overflow fix: every list whose height grows with player count (up to
// MAX_PLAYERS = 8) has to still fit inside the fixed 100vh container above.
// A TV audience only ever sees one of a handful of counts, so a few
// hand-picked steps read cleanly at each one instead of an unpredictable
// continuous shrink via clamp(). Index = densityStep(count).
const DENSITY_SCALE = [1, 0.82, 0.68, 0.56];

function densityStep(count: number): number {
  if (count <= 3) return 0;
  if (count <= 5) return 1;
  if (count <= 6) return 2;
  return 3; // 7-8
}

export function densityScale(count: number): number {
  return DENSITY_SCALE[densityStep(count)];
}

// The left column's own gap between phase sections - REVEAL in particular
// stacks several sections above its results list, so this shrinks too at
// high counts to give the list the room it needs.
export function containerGap(count: number): string {
  return `${(1.5 * densityScale(count)).toFixed(2)}rem`;
}

// Task 161 - the TV's vertical split. TOP: the read column (the marble slab
// - anything READ); BOTTOM: the orchestra, where the sophists row stands
// (anything about PLAYERS). The row is a fixed band at the foot of the
// screen (SophistsRow: bottom 6.5cqh + 30cqh tall, its delta rising 3.6cqh
// above the tallest figure), so every read-area root stops SOPHISTS_BAND
// short of the viewport's bottom instead of the old --tv-safe-bottom - the
// band is well inside the overscan crop already. 38vh = 6.5 + 30 + 1.5
// breathing room; at 720p that leaves the read column 5vh..62vh (410px).
export const SOPHISTS_BAND = '38vh';
export const READ_AREA_HEIGHT = `calc(100vh - var(--tv-safe-top) - ${SOPHISTS_BAND})`;

export const styles: Record<string, CSSProperties> = {
  // Task 38/161 - the read column every in-game phase renders through. One
  // column now (the score column it shared the screen with is the sophists
  // row, at the foot of the screen): design/theatre-reference.html's
  // #main{left:12%;top:8%;width:60%} is the source, widened a little so a
  // 2x2 options grid still reads, and kept clear of the krater standing at
  // the top-right (kraterCorner below). The padding IS the ~3% safe-area
  // margin real TVs crop at the edges.
  gameLayout: {
    position: 'absolute',
    left: '7%',
    width: '72%',
    top: 'var(--tv-safe-top)',
    height: READ_AREA_HEIGHT,
    boxSizing: 'border-box',
    padding: '3vh 0',
    overflow: 'hidden',
    // Task 159c - transparent, not var(--night-1): TheatreScene (158) sits
    // behind every /host phase; only the reading panel gets its own surface.
    background: 'transparent',
    color: 'var(--marble)',
    zIndex: 1,
  },
  gameLayoutLeft: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    // Slabs hang from the top of the read area (the reference's #main sits
    // at top:8%), they don't float in the middle of it.
    justifyContent: 'flex-start',
    minWidth: 0,
    minHeight: 0,
    height: '100%',
    overflow: 'hidden',
  },
  // Task 161 - where the krater stands now that the column is gone: the
  // reference's .krater{right:6%;top:13%}. Above the read column's z-index
  // so nothing a phase draws can cover the clock.
  kraterCorner: {
    position: 'fixed',
    right: '6%',
    top: '13%',
    zIndex: 3,
    pointerEvents: 'none',
  },
  createButton: {
    fontSize: '2rem',
    padding: '1.5rem 3rem',
    borderRadius: '0.75rem',
    border: 'none',
    background: 'var(--wine-2)',
    color: 'var(--carve)',
    fontWeight: 700,
  },
  createButtonDisabled: {
    fontSize: '2rem',
    padding: '1.5rem 3rem',
    borderRadius: '0.75rem',
    border: 'none',
    background: 'var(--marble)',
    color: 'var(--marble-3)',
    fontWeight: 700,
  },
  muteToggle: {
    position: 'fixed',
    // Below the TV overscan crop (Task 112), same as the other two fixed
    // corner controls.
    top: 'calc(var(--tv-safe-top) + 0.5rem)',
    left: '1rem',
    fontSize: '1.5rem',
    lineHeight: 1,
    background: 'var(--marble)',
    border: '1px solid var(--marble-3)',
    borderRadius: '999px',
    padding: '0.5rem 0.7rem',
    cursor: 'pointer',
    zIndex: 50,
  },
  fullscreenToggle: {
    position: 'fixed',
    // Below the TV overscan crop (Task 112) - it is fixed to the viewport,
    // so the shell's own top inset doesn't reach it.
    top: 'calc(var(--tv-safe-top) + 0.5rem)',
    right: '1rem',
    fontSize: '1.5rem',
    lineHeight: 1,
    background: 'var(--marble)',
    border: '1px solid var(--marble-3)',
    borderRadius: '999px',
    padding: '0.5rem 0.7rem',
    cursor: 'pointer',
    zIndex: 50,
  },
  cornerRoomCode: {
    position: 'fixed',
    // Below the TV overscan crop (Task 112), same as fullscreenToggle - a
    // room code a real set clips off the top is a room nobody can join.
    top: 'calc(var(--tv-safe-top) + 0.5rem)',
    // Cleared of fullscreenToggle's own top-right corner (same fixed
    // position) so the two badges never overlap/clip each other.
    right: '4.75rem',
    fontSize: '1rem',
    fontWeight: 700,
    fontFamily: 'monospace',
    letterSpacing: '0.15em',
    color: 'var(--carve)',
    background: 'var(--marble)',
    border: '1px solid var(--marble-3)',
    padding: '0.35rem 0.75rem',
    borderRadius: '0.5rem',
    boxShadow: SURFACE_GLOW,
    // Above the pause overlay - players may still need the room code while
    // paused (e.g. someone new scanning the QR mid-break isn't possible,
    // but the code itself must never be hidden).
    zIndex: 50,
  },
  pauseOverlay: {
    position: 'fixed',
    // Top and bottom edges inset by the TV overscan safe area (palette).
    inset: 'var(--tv-safe-top) 0 var(--tv-safe-bottom) 0',
    background: 'var(--night-1)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem',
    zIndex: 40,
  },
  pauseTitle: {
    fontSize: '5rem',
    fontWeight: 900,
    color: 'var(--marble)',
    letterSpacing: '0.15em',
  },
  pauseSubtitle: {
    fontSize: '1.75rem',
    fontWeight: 600,
    color: 'var(--marble-3)',
  },
  category: {
    fontSize: '1.75rem',
    fontWeight: 600,
    color: 'var(--marble-3)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  progress: {
    fontSize: '1.5rem',
    fontWeight: 600,
    // --marble-3, not --text-faint (a token that only ever lived in the retired
    // theme stylesheet). Papyrus call sites override this with --carve; --marble-3
    // is the muted reading on the dark ground.
    color: 'var(--marble-3)',
  },
  questionText: {
    fontSize: '4rem',
    fontWeight: 700,
    textAlign: 'center',
    lineHeight: 1.3,
    maxWidth: '90%',
    color: 'var(--marble)',
  },
  // QUESTION only. With the options gone (Task 29) the question is the
  // one thing to read on the TV, so it takes the space they used to.
  // fontSize is a JS-controlled fallback here - useFitFontSize (see
  // QuestionView) overwrites it per-render to whatever actually fits
  // questionBlock's measured height, so a long question shrinks instead
  // of overflowing past the viewport.
  // Base colour matches what every call site already overrides to (papyrus
  // ink) - kept in sync so the default itself is never a stray token from
  // the retired theme stylesheet, even though today nothing renders it
  // unoverridden.
  questionTextTv: {
    fontSize: '6rem',
    fontWeight: 700,
    textAlign: 'center',
    lineHeight: 1.25,
    maxWidth: '85%',
    color: 'var(--carve)',
  },
  // Wraps questionTextTv so it has a determinate, flexed height to fit
  // against - a shrink-wrapped container just measures itself, which is
  // why this needs flex: 1 rather than living inline with its siblings.
  questionBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '1 1 0',
    minHeight: 0,
    width: '100%',
    overflow: 'hidden',
  },
  optionsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1.5rem',
    width: '100%',
    maxWidth: '1100px',
  },
  optionCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    fontSize: '1.85rem',
    fontWeight: 600,
    padding: '0.75rem 1.5rem',
    borderRadius: '1rem',
    color: 'var(--carve)',
  },
  optionLabel: {
    fontWeight: 800,
    minWidth: '2rem',
  },
  kraterWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  kraterNumber: {
    fontWeight: 800,
    fontFamily: 'monospace',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--marble)',
  },
  socratesIntroBanner: {
    padding: '0.5rem 1.25rem',
    borderRadius: '0.75rem',
    background: 'rgba(142, 36, 64, 0.12)',
    border: '2px solid var(--wine-2)',
    color: 'var(--wine-2)',
    fontSize: '1.15rem',
    fontWeight: 700,
    textAlign: 'center',
    maxWidth: '700px',
  },
  // Η Δίκη (Task 128) - TRIAL_REVEAL's papyrus. No options grid: unlike
  // RevealHostPayload, TrialRevealShowPayload carries only the one correct
  // answer's text, not a per-option tally (Task 127 never built one), so the
  // reveal reads as a single answer rather than a 2x2 aggregate.
  trialCorrectAnswer: {
    fontSize: '3rem',
    fontWeight: 800,
    textAlign: 'center',
    color: 'var(--carve)',
    padding: '1rem',
  },
  trialOutcomeLine: {
    fontSize: '1.5rem',
    fontWeight: 700,
    textAlign: 'center',
    color: 'var(--wine-2)',
  },
  progressBarFill: {
    height: '100%',
    background: 'var(--wine-2)',
    borderRadius: '999px',
    transition: 'width 1s linear',
  },
  // Drawing mode (Task 56b) - GUESS/GUESS_REVEAL's picture. Fixed square
  // (drawings export at 512x512 - see DRAWING_EXPORT_SIZE), sized off the
  // viewport's smaller dimension so it never pushes the options grid off
  // the read area at any player count (criterion 4).
  drawingImageWrap: {
    // Task 161 - shrunk again from 36vh/32vw: the picture now sits BESIDE
    // the options on ONE slab (the reference's .drawing grid, canvas 30cqh)
    // instead of above a second one, because the read area is 57vh tall
    // now that the sophists row owns the bottom of the screen.
    width: 'min(26vh, 24vw)',
    aspectRatio: '1 / 1',
    borderRadius: '1rem',
    overflow: 'hidden',
    border: '3px solid var(--marble-3)',
    flexShrink: 0,
  },
  drawingImage: {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    // Matches the paper the drawing is baked onto (PAPER in DrawingCanvas),
    // so objectFit:contain's letterbox bars are invisible against it.
    background: 'var(--marble)',
  },
  // Steal (Task 32) - the TV during and after a theft.
  stealThiefRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.25rem',
    fontSize: '3rem',
    fontWeight: 800,
    color: 'var(--wine-2)',
  },
  stealAmount: {
    fontSize: '2.25rem',
    fontWeight: 700,
    color: 'var(--marble)',
  },
  stealVictimRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.25rem',
    fontSize: '2.5rem',
    fontWeight: 700,
    color: 'var(--carve)',
  },
  stealMovedAmount: {
    fontSize: 'clamp(4rem, 7vw, 7rem)',
    fontWeight: 800,
    color: 'var(--wine-2)',
  },
  stealNothing: {
    fontSize: '3rem',
    fontWeight: 700,
    color: 'var(--marble-3)',
  },
  stealClampNote: {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: 'var(--marble-3)',
  },
  // Numeric mode (Task 66) - NUMERIC_QUESTION's range readout and
  // NUMERIC_REVEAL's answer banner. Task 114 deleted the number line and
  // every style it used: it re-rendered what the score column already says.
  numericRange: {
    fontSize: '2rem',
    fontWeight: 700,
    color: 'var(--marble-3)',
    fontFamily: 'monospace',
  },
  numericAnswerBanner: {
    fontSize: '1.75rem',
    fontWeight: 700,
    color: 'var(--wine-2)',
  },
};
