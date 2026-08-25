import {
  type DrawProgressPayload,
  type DrawShowHostPayload,
  type LobbyPlayer,
  type RoomCode,
} from '@game/shared';
import { Avatar } from '../../components/Avatar';
import { GameLayout } from './GameLayout';
import { answeredAvatarSize, answeredNamesSizeStyle, styles } from './hostStyles';

interface DrawViewProps {
  draw: DrawShowHostPayload;
  progress: DrawProgressPayload | null;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  secondsLeft: number;
  players: LobbyPlayer[];
}

// Task 56b - the TV during DRAW: who has submitted, nothing else. Deliberately
// the same shape as PowerUpView's answered-markers strip - WHAT anyone is
// drawing is never sent to the host at all (see buildDrawHostPayload), so
// there is nothing here that could spoil it before the GUESS phase.
export function DrawView({ draw, progress, roomCode, paused, pausedByName, secondsLeft, players }: DrawViewProps) {
  const submittedIds = new Set(progress?.submittedPlayerIds ?? draw.submittedPlayerIds);
  const submittedCount = progress?.submittedCount ?? draw.submittedCount;
  const totalCount = progress?.totalPlayers ?? draw.totalPlayers;

  const timerCritical = !paused && secondsLeft <= 10 && secondsLeft > 0;
  return (
    <GameLayout roomCode={roomCode} paused={paused} pausedByName={pausedByName} standings={draw.standings}>
      <div className={timerCritical ? 'timer-ring timer-ring-critical' : 'timer-ring'} style={styles.timerRingWrap}>
        <div className={timerCritical ? 'timer-critical' : undefined} style={styles.timer} data-testid="draw-countdown">
          {secondsLeft}
        </div>
      </div>
      <div className="enter-pop">
        <div style={styles.category}>Ζωγραφική</div>
        <div style={styles.questionTextTv} data-testid="draw-title">
          Ζωγραφίστε!
        </div>
        <div style={styles.progress} data-testid="draw-subtitle">
          Στα κινητά σας
        </div>
      </div>
      <div style={styles.answerCounter} data-testid="draw-progress">
        {submittedCount}/{totalCount} υπέβαλαν
      </div>
      <div style={{ ...styles.answeredNames, ...answeredNamesSizeStyle(players.length) }}>
        {players.map((player) => {
          const submitted = submittedIds.has(player.playerId);
          return (
            <span
              key={player.playerId}
              data-testid="draw-marker"
              data-submitted={submitted}
              style={submitted ? styles.nameAnswered : styles.nameNotAnswered}
            >
              <Avatar
                avatarId={player.avatarId}
                sizeRem={answeredAvatarSize(players.length)}
                ringColor={submitted ? 'var(--success)' : undefined}
              />
              {submitted ? '✓ ' : ''}
              {player.name}
            </span>
          );
        })}
      </div>
    </GameLayout>
  );
}
