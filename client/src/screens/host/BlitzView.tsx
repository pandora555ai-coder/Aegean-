import { type BlitzShowHostPayload, type RoomCode } from '@game/shared';
import { GameLayout } from './GameLayout';
import { styles } from './hostStyles';

interface BlitzViewProps {
  blitz: BlitzShowHostPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
}

// Task 156a - a STUB TV view for BLITZ: exists so a room in this phase
// renders something rather than nothing while the real screen is built in
// 156b. The statements themselves are on the phones (each player reads at
// their own pace), so this shows only the stage title and instruction.
export function BlitzView({ blitz, roomCode, paused, pausedByName }: BlitzViewProps) {
  return (
    <GameLayout roomCode={roomCode} paused={paused} pausedByName={pausedByName} standings={blitz.standings} contentKey="blitz">
      <div className="enter-pop" style={styles.category}>
        Σωστό ή Λάθος
      </div>
      <div data-testid="blitz-title">Η Παλαίστρα</div>
      <div data-testid="blitz-instruction">
        {blitz.total} προτάσεις στο κινητό σου — σύρε δεξιά για ΣΩΣΤΟ, αριστερά για ΛΑΘΟΣ.
      </div>
    </GameLayout>
  );
}
