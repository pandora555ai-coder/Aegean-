import { type RoomCode, type SocratesShowPayload } from '@game/shared';
import { GameLayout } from './GameLayout';
import { styles } from './hostStyles';

interface SocratesViewProps {
  socrates: SocratesShowPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
}

// Task 39 - the whole view of the SOCRATES phase: the host alone with the
// line for the round that just ended. HOST ONLY, like every other piece of
// his commentary. The server HOLDS here on the shared timer, so nothing else
// is on screen underneath and the next question hasn't started - and it only
// enters the phase when a line actually fired, so this is never empty.
// "Scene lit" pass (Task 90) - he speaks alone: the score column is
// suppressed for this phase only (GameLayout's hideScorePanel), reversing
// Task 38's shared two-column shell just for this one view.
// No progress bar (Task 96) - unlike REVEAL/GUESS_REVEAL/NUMERIC_REVEAL,
// this phase does NOT actually advance when a timer fills: it ends on
// socrates:audio_ended from the host, the countdown is only a backstop for
// when audio fails to fire that event. A filling bar implied a real
// running timer that isn't what's driving the phase here.
export function SocratesView({ socrates, roomCode, paused, pausedByName }: SocratesViewProps) {
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
    </GameLayout>
  );
}
