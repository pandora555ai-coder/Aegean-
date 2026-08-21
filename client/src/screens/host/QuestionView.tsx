import {
  type AnswerProgressPayload,
  type LobbyPlayer,
  type QuestionShowHostPayload,
  type RoomCode,
} from '@game/shared';
import { Avatar } from '../../components/Avatar';
import { answeredAvatarSize, answeredNamesSizeStyle, styles } from './hostStyles';

interface QuestionViewProps {
  question: QuestionShowHostPayload;
  answerProgress: AnswerProgressPayload | null;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  secondsLeft: number;
  players: LobbyPlayer[];
  connectedCount: number;
}

export function QuestionView({
  question,
  answerProgress,
  roomCode,
  paused,
  pausedByName,
  secondsLeft,
  players,
  connectedCount,
}: QuestionViewProps) {
  const answeredIds = new Set(answerProgress?.answeredPlayerIds ?? []);
  const answeredCount = answerProgress?.answered ?? 0;
  const totalCount = answerProgress?.total ?? connectedCount;

  const timerCritical = !paused && secondsLeft <= 5 && secondsLeft > 0;
  return (
    <div style={styles.container} className="screen-fade-in" key={question.questionIndex}>
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
      {/* Game Master (Task 24) - HOST ONLY, briefly shown then fades on
          its own via CSS (gm-intro-fade, see theme.css) - no JS timer, so
          it can never delay anything else on this screen. The player
          side's answer buttons are unaffected regardless, since gmIntro
          is never even sent in the player payload. Conditionally
          rendered, same reasoning as gmLine on REVEAL - no gap when
          null. */}
      {question.gmIntro && (
        <div className="gm-intro-fade" style={styles.gmIntroBanner} data-testid="gm-intro">
          {question.gmIntro}
        </div>
      )}
      <div className={timerCritical ? 'timer-ring timer-ring-critical' : 'timer-ring'} style={styles.timerRingWrap}>
        <div className={timerCritical ? 'timer-critical' : undefined} style={styles.timer} data-testid="countdown">
          {secondsLeft}
        </div>
      </div>
      <div className="enter-pop">
        <div style={styles.category}>{question.category}</div>
        <div style={styles.progress} data-testid="question-progress">
          Ερώτηση {question.questionIndex + 1}/{question.totalQuestions}
        </div>
        {/* Task 29: the TV shows the question only - no options. Reading
            four answers off the TV and then hunting for the matching
            button on the phone splits attention; the phone already has
            every option. The options come back at REVEAL, where the TV
            is the only place the correct one is shown. Render-only: the
            host payload still carries question.options untouched. */}
        <div style={styles.questionTextTv} data-testid="question-text">
          {question.question}
        </div>
      </div>
      <div style={styles.answerCounter} data-testid="answer-progress">
        {answeredCount}/{totalCount} απάντησαν
      </div>
      <div style={{ ...styles.answeredNames, ...answeredNamesSizeStyle(players.length) }}>
        {players.map((player) => {
          const answered = answeredIds.has(player.playerId);
          return (
            <span
              key={player.playerId}
              data-testid="answered-marker"
              data-answered={answered}
              style={answered ? styles.nameAnswered : styles.nameNotAnswered}
            >
              <Avatar
                avatarId={player.avatarId}
                sizeRem={answeredAvatarSize(players.length)}
                ringColor={answered ? 'var(--success)' : undefined}
              />
              {answered ? '✓ ' : ''}
              {player.name}
            </span>
          );
        })}
      </div>
    </div>
  );
}
