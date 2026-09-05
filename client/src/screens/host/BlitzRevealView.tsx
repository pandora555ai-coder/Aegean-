import { type BlitzRevealHostPayload, type RoomCode } from '@game/shared';
import { GameLayout } from './GameLayout';
import { styles } from './hostStyles';

interface BlitzRevealViewProps {
  reveal: BlitzRevealHostPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  secondsLeft: number;
}

// Task 156a - a STUB TV view for BLITZ_REVEAL, same reasoning as BlitzView.
// Shows the statement the room got wrong most, if any - the real screen
// (with the score column's per-player deltas etc.) is built in 156b.
export function BlitzRevealView({ reveal, roomCode, paused, pausedByName }: BlitzRevealViewProps) {
  const missed = reveal.mostMissed;
  return (
    <GameLayout roomCode={roomCode} paused={paused} pausedByName={pausedByName} standings={reveal.standings} contentKey="blitz-reveal">
      <div className="enter-pop" style={styles.category}>
        {missed ? 'Η πιο δύσκολη πρόταση' : 'Η Παλαίστρα'}
      </div>
      <div data-testid="blitz-reveal-text">{missed ? missed.text : 'Κανείς δεν έκανε λάθος.'}</div>
      {missed && (
        <div data-testid="blitz-reveal-verdict">
          Ήταν {missed.isTrue ? 'ΣΩΣΤΟ' : 'ΛΑΘΟΣ'} — το έχασαν {missed.missedCount}
        </div>
      )}
    </GameLayout>
  );
}
