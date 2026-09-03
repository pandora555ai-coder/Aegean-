import type { CSSProperties } from 'react';
import { REVEAL_DURATION_MS, type RoomCode, type TrialRevealShowPayload } from '@game/shared';
import { GameLayout } from './GameLayout';
import { PapyrusPanel } from './PapyrusPanel';
import { styles } from './hostStyles';

const progressBarTrackStyle: CSSProperties = {
  width: '100%',
  maxWidth: '500px',
  height: '0.5rem',
  borderRadius: '999px',
  background: 'var(--marble)',
  overflow: 'hidden',
};

interface TrialRevealViewProps {
  trialReveal: TrialRevealShowPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  revealSecondsLeft: number;
}

// Η Δίκη (Task 128) - TRIAL_REVEAL's whole view. Unlike quiz REVEAL, the
// payload carries only the ONE correct answer's text (no options array, no
// per-option tally - Task 127 never built one), so the papyrus reads as a
// single revealed line rather than RevealView's 2x2 grid. The score column
// carries the life that just moved.
export function TrialRevealView({ trialReveal, roomCode, paused, pausedByName, revealSecondsLeft }: TrialRevealViewProps) {
  return (
    <GameLayout
      roomCode={roomCode}
      paused={paused}
      pausedByName={pausedByName}
      standings={trialReveal.standings}
      contentKey={trialReveal.roundIndex}
    >
      <PapyrusPanel className="enter-pop" style={{ flex: '0 0 auto' }}>
        <div style={styles.trialCorrectAnswer} data-testid="trial-correct-answer">
          {trialReveal.correctOption}
        </div>
      </PapyrusPanel>
      {trialReveal.winnerName && (
        <div className="enter-pop" style={styles.trialOutcomeLine} data-testid="trial-winner">
          Νικητής/Νικήτρια: {trialReveal.winnerName}
        </div>
      )}
      {!trialReveal.winnerName && trialReveal.nextSuddenDeath && (
        <div className="enter-pop" style={styles.trialOutcomeLine} data-testid="trial-sudden-death-next">
          Ισοπαλία — θανατηφόρος γύρος
        </div>
      )}
      <div style={progressBarTrackStyle} data-testid="trial-reveal-progress">
        <div
          style={{
            ...styles.progressBarFill,
            width: `${(revealSecondsLeft / Math.ceil(REVEAL_DURATION_MS / 1000)) * 100}%`,
          }}
        />
      </div>
    </GameLayout>
  );
}
