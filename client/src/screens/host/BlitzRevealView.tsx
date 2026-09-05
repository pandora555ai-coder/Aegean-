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

const columnHeadingStyle: CSSProperties = {
  fontSize: '2cqh',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--marble-3)',
  marginBottom: '0.6cqh',
};

// One line per row, ALWAYS - a statement too long to fit its column ellipses
// rather than wrapping, so 12 statements (6 per column, see
// drawBlitzGameStatements' guaranteed ceil/floor split) is a fixed, known
// height regardless of content, the same discipline RevealView's own
// optionTextStyle already uses for the quiz's four answer options.
const rowStyle = (emphasized: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '1.4cqh',
  fontSize: '3cqh',
  fontWeight: emphasized ? 800 : 700,
  color: 'var(--carve)',
  marginTop: '0.5cqh',
  minWidth: 0,
});

const statementTextStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
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
      <div style={columnHeadingStyle}>{heading}</div>
      {statements.map((statement, index) => (
        <div key={index} style={rowStyle(statement.text === emphasizedText)} data-testid="blitz-reveal-statement">
          {isTrueColumn ? <CheckMark visible /> : <DashMark />}
          <span style={statementTextStyle}>{statement.text}</span>
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
