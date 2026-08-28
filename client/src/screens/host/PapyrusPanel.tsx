import type { CSSProperties, ReactNode } from 'react';

// Ελαιογραφία palette (Task 87) - the papyrus scroll treatment shared by
// every /host phase that puts Greek-facing text on parchment: a --pap-1 to
// --pap-2 gradient panel flanked by two marble columns (see MarbleColumn
// below). First used by QuestionView's question text; extracted here so
// REVEAL's correct-answer panel (and any future phase) reuses the exact
// same styles instead of copying them.
// Sizes to its content by default (Task 96) - a scroll should only be as
// tall as what it holds, never stretch to fill whatever's left in the
// column. The one exception is a papyrus wrapping fit-shrunk question text
// (useFitFontSize needs a determinate, flexed height to measure against) -
// those call sites pass `flex: '1 1 0'` explicitly to opt back in.
//
// flexShrink: 0, not the shorthand's default 1 (Task 103) - a papyrus
// panel's content is TEXT: it can't compress the way a results list or a
// gap can, so when the outer column (GameLayout's flex column) ran a hair
// short of 100vh, the flex-shrink algorithm proportionally shrank EVERY
// flex-shrink:1 child in it, papyrus panels included - the panel's own box
// came out a few px shorter than the text it holds, which just kept
// bleeding past the parchment edge onto the dark ground behind it. The
// page's own total height was never over 720 (confirmed) - this was
// shrinkage nothing downstream needed, applied anyway because flex-basis
// (content size) is only ever the STARTING point for flex-shrink:1, not a
// floor. A papyrus panel must never be one of the things that gives.
const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'stretch',
  gap: '1rem',
  flex: '0 0 auto',
  minHeight: 0,
  width: '100%',
  padding: '1.5rem',
  borderRadius: '1rem',
  background: 'linear-gradient(160deg, var(--pap-1), var(--pap-2))',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
};

// Marble column, not a wood roller: a fluted shaft (repeating --cream/--dim
// stripes, vertical grooves) between a capital and a base block. Left and
// right sides only - never rendered top or bottom, so the column carries no
// border of its own, just the three stacked pieces below.
const columnStyle: CSSProperties = {
  flexShrink: 0,
  width: '1.25rem',
  display: 'flex',
  flexDirection: 'column',
};

const columnCapitalStyle: CSSProperties = {
  flexShrink: 0,
  height: '0.6rem',
  borderRadius: '0.2rem 0.2rem 0 0',
  background: 'var(--cream)',
};

const columnBaseStyle: CSSProperties = {
  flexShrink: 0,
  height: '0.6rem',
  borderRadius: '0 0 0.2rem 0.2rem',
  background: 'var(--cream)',
};

// minWidth, not just the column's own fixed width above - a hard floor so
// the flute stripes (4px period) can never end up rendering as a single
// blurred line if this column is ever squeezed by a future layout change.
const columnShaftStyle: CSSProperties = {
  flex: '1 1 auto',
  minWidth: '1.25rem',
  backgroundImage: 'repeating-linear-gradient(90deg, var(--cream) 0, var(--cream) 2px, var(--dim) 2px, var(--dim) 4px)',
};

function MarbleColumn() {
  return (
    <div style={columnStyle}>
      <div style={columnCapitalStyle} />
      <div style={columnShaftStyle} />
      <div style={columnBaseStyle} />
    </div>
  );
}

interface PapyrusPanelProps {
  className?: string;
  style?: CSSProperties;
  'data-testid'?: string;
  children: ReactNode;
}

export function PapyrusPanel({ className, style, children, ...rest }: PapyrusPanelProps) {
  return (
    <div className={className} style={style ? { ...panelStyle, ...style } : panelStyle} {...rest}>
      <MarbleColumn />
      {children}
      <MarbleColumn />
    </div>
  );
}
