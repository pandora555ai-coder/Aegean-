import type { CSSProperties } from 'react';
import { type RoomCode, type SocratesShowPayload } from '@game/shared';
import { GameLayout } from './GameLayout';
import { styles } from './hostStyles';

// progressBarTrack is shared with GuessRevealView/NumericRevealView
// (hostStyles.ts) and still carries an old pre-Ελαιογραφία token there -
// this phase's content is ported on its own, so it gets a local override
// instead of touching that shared entry.
const progressBarTrackStyle: CSSProperties = {
  width: '100%',
  maxWidth: '500px',
  height: '0.5rem',
  borderRadius: '999px',
  background: 'var(--panel)',
  overflow: 'hidden',
};

interface SocratesViewProps {
  socrates: SocratesShowPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  secondsLeft: number;
}

// Task 39 - the whole view of the SOCRATES phase: the host alone with the
// line for the round that just ended. HOST ONLY, like every other piece of
// his commentary. The server HOLDS here on the shared timer, so nothing else
// is on screen underneath and the next question hasn't started - and it only
// enters the phase when a line actually fired, so this is never empty.
// "Scene lit" pass (Task 90) - he speaks alone: the score column is
// suppressed for this phase only (GameLayout's hideScorePanel), reversing
// Task 38's shared two-column shell just for this one view.
export function SocratesView({ socrates, roomCode, paused, pausedByName, secondsLeft }: SocratesViewProps) {
  return (
    <GameLayout
      roomCode={roomCode}
      paused={paused}
      pausedByName={pausedByName}
      standings={socrates.standings}
      contentKey={`socrates-${socrates.questionIndex}`}
      hideScorePanel
    >
      <div className="enter-pop" style={styles.socratesStageCard} data-testid="socrates-stage">
        <div style={styles.socratesStageKicker}>ΣΩΚΡΑΤΗΣ</div>
        <div style={styles.socratesStageQuote} data-testid="socrates-line">
          «{socrates.line}»
        </div>
      </div>
      <div style={progressBarTrackStyle} data-testid="socrates-progress">
        <div
          style={{
            ...styles.progressBarFill,
            // Task 42b - the bar's denominator is THIS line's own duration
            // (audio length, clamped), not a fixed span shared by every line.
            width: `${(secondsLeft / Math.ceil(socrates.totalDurationMs / 1000)) * 100}%`,
          }}
        />
      </div>
    </GameLayout>
  );
}
