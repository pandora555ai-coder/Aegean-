import {
  type LobbyPlayer,
  type NumericProgressPayload,
  type NumericQuestionShowHostPayload,
  type RoomCode,
} from '@game/shared';
import { Avatar } from '../../components/Avatar';
import { GameLayout } from './GameLayout';
import { answeredAvatarSize, answeredNamesSizeStyle, styles } from './hostStyles';

interface NumericQuestionViewProps {
  question: NumericQuestionShowHostPayload;
  progress: NumericProgressPayload | null;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  secondsLeft: number;
  players: LobbyPlayer[];
}

// Task 66 - the TV during NUMERIC_QUESTION: the question, the 0..max range,
// the timer, and who has locked in - deliberately the same answered-markers
// strip as DrawView/PowerUpView. WHAT anyone typed is never sent to the host
// at all (see NumericQuestionShowHostPayload), so there is nothing here that
// could give a guess away before NUMERIC_REVEAL.
export function NumericQuestionView({
  question,
  progress,
  roomCode,
  paused,
  pausedByName,
  secondsLeft,
  players,
}: NumericQuestionViewProps) {
  const submittedIds = new Set(progress?.submittedPlayerIds ?? question.submittedPlayerIds);
  const submittedCount = progress?.submittedCount ?? question.submittedCount;
  const totalCount = progress?.totalPlayers ?? question.totalPlayers;

  const timerCritical = !paused && secondsLeft <= 5 && secondsLeft > 0;
  return (
    <GameLayout
      roomCode={roomCode}
      paused={paused}
      pausedByName={pausedByName}
      standings={question.standings}
      contentKey={question.questionIndex}
    >
      <div className={timerCritical ? 'timer-ring timer-ring-critical' : 'timer-ring'} style={styles.timerRingWrap}>
        <div
          className={timerCritical ? 'timer-critical' : undefined}
          style={styles.timer}
          data-testid="numeric-question-countdown"
        >
          {secondsLeft}
        </div>
      </div>
      <div className="enter-pop">
        <div style={styles.category}>{question.category}</div>
        <div style={styles.questionTextTv} data-testid="numeric-question-text">
          {question.text}
        </div>
        <div style={styles.numericRange} data-testid="numeric-question-range">
          0 — {question.max}
        </div>
      </div>
      <div style={styles.answerCounter} data-testid="numeric-question-progress">
        {submittedCount}/{totalCount} κλείδωσαν
      </div>
      <div style={{ ...styles.answeredNames, ...answeredNamesSizeStyle(players.length) }}>
        {players.map((player) => {
          const submitted = submittedIds.has(player.playerId);
          return (
            <span
              key={player.playerId}
              data-testid="numeric-question-marker"
              data-submitted={submitted}
              style={submitted ? styles.nameAnswered : styles.nameNotAnswered}
            >
              <Avatar
                avatarId={player.avatarId}
                sizeRem={answeredAvatarSize(players.length)}
                ringColor={submitted ? 'var(--success)' : undefined}
              />
              {submitted ? '🔒 ' : ''}
              {player.name}
            </span>
          );
        })}
      </div>
    </GameLayout>
  );
}
