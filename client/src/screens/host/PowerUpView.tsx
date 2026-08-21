import {
  type LobbyPlayer,
  type PowerUpProgressPayload,
  type PowerUpShowHostPayload,
  type RoomCode,
} from '@game/shared';
import { Avatar } from '../../components/Avatar';
import { answeredAvatarSize, answeredNamesSizeStyle, styles } from './hostStyles';

interface PowerUpViewProps {
  powerUp: PowerUpShowHostPayload;
  progress: PowerUpProgressPayload | null;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  secondsLeft: number;
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
  secondsLeft,
  players,
  connectedCount,
}: PowerUpViewProps) {
  const chosenIds = new Set(progress?.chosenPlayerIds ?? powerUp.chosenPlayerIds);
  const chosenCount = progress?.chosenCount ?? powerUp.chosenCount;
  const totalCount = progress?.totalPlayers ?? powerUp.totalPlayers ?? connectedCount;

  const timerCritical = !paused && secondsLeft <= 5 && secondsLeft > 0;
  return (
    <div style={styles.container} className="screen-fade-in">
      {roomCode && (
        <div style={styles.cornerRoomCode} data-testid="corner-room-code">
          {roomCode}
        </div>
      )}
      {paused && (
        <div style={styles.pauseOverlay} data-testid="pause-overlay">
          <div style={styles.pauseTitle}>ΠΑΥΣΗ</div>
          <div style={styles.pauseSubtitle}>Ο/Η {pausedByName} έκανε παύση</div>
        </div>
      )}
      <div className={timerCritical ? 'timer-ring timer-ring-critical' : 'timer-ring'} style={styles.timerRingWrap}>
        <div className={timerCritical ? 'timer-critical' : undefined} style={styles.timer} data-testid="power-up-countdown">
          {secondsLeft}
        </div>
      </div>
      <div className="enter-pop">
        <div style={styles.category}>Σαμποτάζ</div>
        <div style={styles.questionTextTv} data-testid="power-up-title">
          Διάλεξε το όπλο σου!
        </div>
        <div style={styles.progress} data-testid="power-up-subtitle">
          Στα κινητά σας — πριν την ερώτηση {powerUp.questionIndex + 1}/{powerUp.totalQuestions}
        </div>
      </div>
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
              <Avatar
                avatarId={player.avatarId}
                sizeRem={answeredAvatarSize(players.length)}
                ringColor={chosen ? 'var(--success)' : undefined}
              />
              {chosen ? '🔒 ' : ''}
              {player.name}
            </span>
          );
        })}
      </div>
    </div>
  );
}
