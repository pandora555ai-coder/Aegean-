import { type BlitzShowHostPayload, type RoomCode } from '@game/shared';
import { GameLayout } from './GameLayout';
import { PapyrusPanel } from './PapyrusPanel';
import { styles } from './hostStyles';

interface BlitzViewProps {
  blitz: BlitzShowHostPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
}

// Task 156 - the TV during BLITZ. The papyrus carries only what is READ:
// the stage title and one line of instruction. The statements themselves are
// on the phones (each player reads at their own pace, and the TV showing one
// would put everyone on the same one), and everything about PLAYERS - the
// timer, each player's n/K - lives in the score column (HostScreen), never
// under the papyrus.
export function BlitzView({ blitz, roomCode, paused, pausedByName }: BlitzViewProps) {
  return (
    <GameLayout roomCode={roomCode} paused={paused} pausedByName={pausedByName} standings={blitz.standings} contentKey="blitz">
      <div className="enter-pop" style={styles.category}>
        Σωστό ή Λάθος
      </div>
      <PapyrusPanel className="enter-pop" style={{ flex: '1 1 0' }}>
        <div style={styles.questionBlock}>
          <div style={styles.blitzTitle} data-testid="blitz-title">
            Αστραπή
          </div>
          <div style={styles.blitzInstruction} data-testid="blitz-instruction">
            {blitz.total} προτάσεις στο κινητό σου — σύρε δεξιά για ΣΩΣΤΟ, αριστερά για ΛΑΘΟΣ.
          </div>
        </div>
      </PapyrusPanel>
    </GameLayout>
  );
}
