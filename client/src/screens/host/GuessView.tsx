import { ANSWER_IDENTITIES, type GuessProgressPayload, type GuessShowHostPayload, type RoomCode } from '@game/shared';
import { AnswerShape } from '../../components/AnswerShape';
import { Avatar } from '../../components/Avatar';
import { GameLayout } from './GameLayout';
import { styles } from './hostStyles';

interface GuessViewProps {
  guess: GuessShowHostPayload;
  progress: GuessProgressPayload | null;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  secondsLeft: number;
}

// Task 56b - the TV during GUESS: the drawing large, the 4 options, the
// timer. The correct index never reaches this payload at all (see
// buildGuessHostPayload) - every option renders identically until
// GUESS_REVEAL.
export function GuessView({ guess, progress, roomCode, paused, pausedByName, secondsLeft }: GuessViewProps) {
  const guessedCount = progress?.guessedCount ?? guess.guessedCount;
  const totalGuessers = progress?.totalGuessers ?? guess.totalGuessers;
  const timerCritical = !paused && secondsLeft <= 5 && secondsLeft > 0;

  return (
    <GameLayout
      roomCode={roomCode}
      paused={paused}
      pausedByName={pausedByName}
      standings={guess.standings}
      contentKey={guess.roundIndex}
    >
      <div className={timerCritical ? 'timer-ring timer-ring-critical' : 'timer-ring'} style={styles.timerRingWrap}>
        <div className={timerCritical ? 'timer-critical' : undefined} style={styles.timer} data-testid="guess-countdown">
          {secondsLeft}
        </div>
      </div>
      <div className="enter-pop" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Avatar avatarId={guess.drawerAvatarId} sizeRem={2} />
        <span style={styles.category} data-testid="guess-drawer-name">
          {guess.drawerName} ζωγράφισε αυτό
        </span>
      </div>
      <div style={styles.drawingImageWrap} className="enter-pop">
        <img src={guess.image} alt="" style={styles.drawingImage} data-testid="guess-drawing" />
      </div>
      <div style={styles.optionsGrid}>
        {guess.options.map((option, index) => {
          const identity = ANSWER_IDENTITIES[index];
          return (
            <div key={index} data-testid="guess-option" style={{ ...styles.optionCard, borderColor: identity.color }}>
              <AnswerShape index={index} sizeRem={1.75} />
              <span style={styles.optionLabel}>{identity.letter}</span>
              <span>{option}</span>
            </div>
          );
        })}
      </div>
      <div style={styles.answerCounter} data-testid="guess-progress">
        {guessedCount}/{totalGuessers} μάντεψαν
      </div>
    </GameLayout>
  );
}
