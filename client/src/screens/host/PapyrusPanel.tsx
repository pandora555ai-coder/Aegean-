import type { CSSProperties, ReactNode } from 'react';

// Ελαιογραφία palette (Task 87) - the papyrus scroll treatment shared by
// every /host phase that puts Greek-facing text on parchment: a --pap-1 to
// --pap-2 gradient panel flanked by two --wood rollers. First used by
// QuestionView's question text; extracted here so REVEAL's correct-answer
// panel (and any future phase) reuses the exact same styles instead of
// copying them.
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

const rollerStyle: CSSProperties = {
  flexShrink: 0,
  width: '1.25rem',
  borderRadius: '999px',
  background: 'var(--wood)',
};

interface PapyrusPanelProps {
  className?: string;
  style?: CSSProperties;
  'data-testid'?: string;
  children: ReactNode;
}

export function PapyrusPanel({ className, style, children, ...rest }: PapyrusPanelProps) {
  return (
    <div className={className} style={style ? { ...panelStyle, ...style } : panelStyle} {...rest}>
      <div style={rollerStyle} />
      {children}
      <div style={rollerStyle} />
    </div>
  );
}
