import type { CSSProperties, ReactNode } from 'react';

// Ελαιογραφία palette (Task 87) - the papyrus scroll treatment shared by
// every /host phase that puts Greek-facing text on parchment: a --pap-1 to
// --pap-2 gradient panel flanked by two --wood rollers. First used by
// QuestionView's question text; extracted here so REVEAL's correct-answer
// panel (and any future phase) reuses the exact same styles instead of
// copying them.
const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'stretch',
  gap: '1rem',
  flex: '1 1 0',
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
