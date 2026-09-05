import type { CSSProperties } from 'react';
import { REVEAL_DURATION_MS, type RoomCode, type TrialRevealShowPayload } from '@game/shared';
import { CheckMark } from '../../components/CheckMark';
import { GameLayout } from './GameLayout';
import { MarbleSlab } from '../../components/MarbleSlab';
import { styles } from './hostStyles';

// Task 163d - the same check-mark-carries-correctness language as REVEAL
// (CheckMark, 8cqh/800, --carve, doubled from the reference's literal
// figure - see CheckMark.tsx's comment), just centred: there's only ever
// ONE answer here (no options array, no per-option tally - Task 127 never
// built one), so there's nothing to grid against and nothing that's ever
// "wrong".
const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '3.2cqh',
  fontSize: '8cqh',
  fontWeight: 800,
  color: 'var(--carve)',
};

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
      <MarbleSlab className="enter-pop" style={{ flex: '0 0 auto' }}>
        <div className="correct-pop" style={rowStyle} data-testid="trial-correct-answer">
          <CheckMark visible />
          <span>{trialReveal.correctOption}</span>
        </div>
      </MarbleSlab>
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
