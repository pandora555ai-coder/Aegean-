import type { CSSProperties } from 'react';
import {
  BLITZ_REVEAL_DURATION_MS,
  type BlitzRevealHostPayload,
  type BlitzStatement,
  type RoomCode,
} from '@game/shared';
import { CheckMark } from '../../components/CheckMark';
import { GameLayout } from './GameLayout';
import { MarbleSlab } from '../../components/MarbleSlab';
import { styles } from './hostStyles';
import { greekUpper } from '../../greekUpper';

// Same wrap footprint as CheckMark.tsx's own (private) box, so a false
// row's dash lines up flush with a true row's check.
const markWrapStyle: CSSProperties = {
  display: 'inline-block',
  width: '1.6cqh',
  height: '3cqh',
  flex: '0 0 auto',
  position: 'relative',
};

// A short dash, --marble-3 (neutral, never red/green) - the check's own
// --wine-2 is this column's one "stands out" accent (CheckMark.tsx's own
// comment: colour never encodes correctness on its own, a SHAPE does), so
// false gets a different shape in a different, deliberately muted colour
// rather than the same accent inverted.
const dashShapeStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: '50%',
  height: '0.6cqh',
  background: 'var(--marble-3)',
  transform: 'translateY(-50%)',
};

function DashMark() {
  return (
    <span style={markWrapStyle} aria-hidden="true">
      <span style={dashShapeStyle} />
    </span>
  );
}

const columnsGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gap: '0 3.5cqh',
  width: '100%',
};

// Task 181 - no textTransform:uppercase ("Αληθινά"/"Ψεύτικα" would keep
// their tonos); the heading text is passed through greekUpper() instead.
const columnHeadingStyle: CSSProperties = {
  fontSize: '2cqh',
  fontWeight: 700,
  letterSpacing: '0.08em',
  color: 'var(--marble-3)',
  marginBottom: '0.6cqh',
};

// Task 156c - wraps up to TWO lines instead of the ellipsis 156b shipped:
// nothing that must be READ is ever truncated. The icon aligns to the first
// line's cap-height (flex-start), not the block's vertical centre, so a
// 2-line row still reads with the check/dash beside the opening word.
// 2.6cqh, not the initial 3cqh 156b shipped: measured, BLITZ_STATEMENTS'
// actual longest entries (up to 73 chars) still overflowed 2 lines at 3cqh
// in this column's width and got line-clamped - this is the largest size
// that keeps every entry in the pool inside two lines with zero clipping.
const rowStyle = (emphasized: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '1.4cqh',
  fontSize: '2.6cqh',
  fontWeight: emphasized ? 800 : 700,
  color: 'var(--carve)',
  marginTop: '0.5cqh',
  minWidth: 0,
});

// -webkit-line-clamp (Chromium/WebKit, what this TV actually runs in) caps
// wrapping at 2 lines and ellipses only the rare statement that STILL
// doesn't fit in two - the pool's longest entries (see BLITZ_STATEMENTS)
// fit comfortably inside two at this column width and font size.
const statementTextStyle: CSSProperties = {
  minWidth: 0,
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  overflow: 'hidden',
  lineHeight: 1.18,
};

const progressBarTrackStyle: CSSProperties = {
  width: '100%',
  maxWidth: '500px',
  height: '0.5rem',
  borderRadius: '999px',
  background: 'var(--marble)',
  overflow: 'hidden',
  flex: '0 0 auto',
};

function StatementColumn({
  heading,
  statements,
  isTrueColumn,
  emphasizedText,
}: {
  heading: string;
  statements: BlitzStatement[];
  isTrueColumn: boolean;
  emphasizedText: string | null;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={columnHeadingStyle}>{greekUpper(heading)}</div>
      {statements.map((statement, index) => (
        <div key={index} style={rowStyle(statement.text === emphasizedText)} data-testid="blitz-reveal-statement">
          {isTrueColumn ? <CheckMark visible /> : <DashMark />}
          <span style={statementTextStyle} data-testid="blitz-reveal-statement-text">
            {statement.text}
          </span>
        </div>
      ))}
    </div>
  );
}

interface BlitzRevealViewProps {
  reveal: BlitzRevealHostPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  secondsLeft: number;
}

// Task 156b - the TV during BLITZ_REVEAL: every statement the round used,
// split by truth (Αληθινά/Ψεύτικα) - the first moment any of it is safe to
// show. The one the room got wrong most (mostMissed) is set heavier, an
// EMPHASIS (weight only), never a colour swap. Everything about players -
// each one's own correct/wrong/unanswered, the +N - is the row below
// (HostScreen's deltasThisRound), never named here. No outer category label
// (RevealView's own precedent - the two columns ARE the content, exactly
// like RevealView's options grid needs no label of its own either).
export function BlitzRevealView({ reveal, roomCode, paused, pausedByName, secondsLeft }: BlitzRevealViewProps) {
  const trues = reveal.statements.filter((s) => s.isTrue);
  const falses = reveal.statements.filter((s) => !s.isTrue);
  const emphasizedText = reveal.mostMissed?.text ?? null;

  return (
    <GameLayout
      roomCode={roomCode}
      paused={paused}
      pausedByName={pausedByName}
      standings={reveal.standings}
      contentKey="blitz-reveal"
    >
      <MarbleSlab className="enter-pop" style={{ flex: '0 0 auto', padding: '1.1rem 1.9rem' }}>
        <div style={columnsGridStyle}>
          <StatementColumn heading="Αληθινά" statements={trues} isTrueColumn emphasizedText={emphasizedText} />
          <StatementColumn heading="Ψεύτικα" statements={falses} isTrueColumn={false} emphasizedText={emphasizedText} />
        </div>
      </MarbleSlab>
      <div style={progressBarTrackStyle} data-testid="blitz-reveal-progress">
        <div
          style={{
            ...styles.progressBarFill,
            width: `${(secondsLeft / Math.ceil(BLITZ_REVEAL_DURATION_MS / 1000)) * 100}%`,
          }}
        />
      </div>
    </GameLayout>
  );
}
