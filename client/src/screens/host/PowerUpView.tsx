import type { CSSProperties } from 'react';
import {
  type LobbyPlayer,
  type PowerUpProgressPayload,
  type PowerUpShowHostPayload,
  type RoomCode,
} from '@game/shared';
import { Avatar } from '../../components/Avatar';
import { GameLayout } from './GameLayout';
import { PapyrusPanel } from './PapyrusPanel';
import { answeredAvatarSize, answeredNamesSizeStyle, styles } from './hostStyles';

// questionTextTv/progress are shared with other phases (hostStyles.ts) and
// still carry pre-Ελαιογραφία tokens there - this phase's content is ported
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
  progress: PowerUpProgressPayload | null;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  players: LobbyPlayer[];
  connectedCount: number;
}

// Task 30b - the TV during POWER_UP. Deliberately the same shape as
// QuestionView's answered-markers strip: an avatar per player that lights up
// as they commit. WHAT anyone picked and WHO they aimed at are never sent to
// the host at all (see buildPowerUpProgress), so there is nothing here that
// could leak them - the surprise only breaks on the next question.
export function PowerUpView({
  powerUp,
  progress,
  roomCode,
  paused,
  pausedByName,
  players,
  connectedCount,
}: PowerUpViewProps) {
  const chosenIds = new Set(progress?.chosenPlayerIds ?? powerUp.chosenPlayerIds);
  const chosenCount = progress?.chosenCount ?? powerUp.chosenCount;
  const totalCount = progress?.totalPlayers ?? powerUp.totalPlayers ?? connectedCount;

  return (
    <GameLayout roomCode={roomCode} paused={paused} pausedByName={pausedByName} standings={powerUp.standings}>
      <div className="enter-pop" style={styles.category}>
        Σαμποτάζ
      </div>
      <PapyrusPanel className="enter-pop" style={{ flex: '0 0 auto' }}>
        <div style={papyrusTextBlockStyle}>
          <div style={{ ...styles.questionTextTv, color: 'var(--ink)' }} data-testid="power-up-title">
            Διάλεξε το όπλο σου!
          </div>
          <div style={{ ...styles.progress, color: 'var(--ink)' }} data-testid="power-up-subtitle">
            Στα κινητά σας
          </div>
        </div>
      </PapyrusPanel>
      <div style={styles.answerCounter} data-testid="power-up-progress">
        {chosenCount}/{totalCount} διάλεξαν
      </div>
      <div style={{ ...styles.answeredNames, ...answeredNamesSizeStyle(players.length) }}>
        {players.map((player) => {
          const chosen = chosenIds.has(player.playerId);
          return (
            <span
              key={player.playerId}
              data-testid="power-up-marker"
              data-chosen={chosen}
              style={chosen ? styles.nameAnswered : styles.nameNotAnswered}
            >
              <Avatar avatarId={player.avatarId} sizeRem={answeredAvatarSize(players.length)} />
              {chosen ? '✓ ' : ''}
              {player.name}
            </span>
          );
        })}
      </div>
    </GameLayout>
  );
}
