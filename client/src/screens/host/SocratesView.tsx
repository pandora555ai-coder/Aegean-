import { type RoomCode, type SocratesShowPayload } from '@game/shared';
import { GameLayout } from './GameLayout';
import { styles } from './hostStyles';

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
// enters the phase when a line actually fired, so this is never empty. The
// score column stays put (Task 38's two-column shell), which is the one thing
// he is NOT alone with.
export function SocratesView({ socrates, roomCode, paused, pausedByName, secondsLeft }: SocratesViewProps) {
  return (
    <GameLayout
      roomCode={roomCode}
      paused={paused}
      pausedByName={pausedByName}
      standings={socrates.standings}
      contentKey={`socrates-${socrates.questionIndex}`}
    >
      <div className="enter-pop" style={styles.socratesStageCard} data-testid="socrates-stage">
        <div style={styles.socratesStageKicker}>ΣΩΚΡΑΤΗΣ</div>
        <div style={styles.socratesStageQuote} data-testid="socrates-line">
          «{socrates.line}»
        </div>
      </div>
      <div style={styles.progressBarTrack} data-testid="socrates-progress">
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
