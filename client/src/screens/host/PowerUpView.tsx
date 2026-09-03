import type { CSSProperties } from 'react';
import { type PowerUpShowHostPayload, type RoomCode } from '@game/shared';
import { GameLayout } from './GameLayout';
import { PapyrusPanel } from './PapyrusPanel';
import { styles } from './hostStyles';

// questionTextTv/progress are shared with other phases (hostStyles.ts) and
// still carry pre-Θέατρο tokens there - this phase's content is ported
// on its own, so the papyrus text gets local ink overrides instead of
// touching those shared entries.
const papyrusTextBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.75rem',
  width: '100%',
};

interface PowerUpViewProps {
  powerUp: PowerUpShowHostPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
}

// Task 30b - the TV during POWER_UP. WHAT anyone picked and WHO they aimed at
// are never sent to the host at all (see buildPowerUpProgress), so there is
// nothing here that could leak them - the surprise only breaks on the next
// question.
//
// Task 115 deleted the "N/M διάλεξαν" counter and the chosen-avatar strip
// under it, with NO replacement: every one of those names is already in the
// right-hand score column. The server still counts choices and still ends the
// phase early once everyone has committed.
export function PowerUpView({ powerUp, roomCode, paused, pausedByName }: PowerUpViewProps) {
  return (
    <GameLayout roomCode={roomCode} paused={paused} pausedByName={pausedByName} standings={powerUp.standings}>
      <div className="enter-pop" style={styles.category}>
        Σαμποτάζ
      </div>
      <PapyrusPanel className="enter-pop" style={{ flex: '0 0 auto' }}>
        <div style={papyrusTextBlockStyle}>
          <div style={{ ...styles.questionTextTv, color: 'var(--carve)' }} data-testid="power-up-title">
            Διάλεξε το όπλο σου!
          </div>
          <div style={{ ...styles.progress, color: 'var(--carve)' }} data-testid="power-up-subtitle">
            Στα κινητά σας
          </div>
        </div>
      </PapyrusPanel>
    </GameLayout>
  );
}
