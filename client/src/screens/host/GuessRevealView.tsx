import { Fragment } from 'react';
import { ANSWER_IDENTITIES, GUESS_REVEAL_DURATION_MS, type GuessRevealShowPayload, type RoomCode } from '@game/shared';
import { AnswerShape } from '../../components/AnswerShape';
import { Avatar } from '../../components/Avatar';
import { GameLayout } from './GameLayout';
import {
  SURFACE_GLOW,
  guessRevealImageWrapStyle,
  resultAvatarSize,
  resultRowSizeStyle,
  resultsListGap,
  styles,
  type CSSVars,
} from './hostStyles';

interface GuessRevealViewProps {
  guessReveal: GuessRevealShowPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  secondsLeft: number;
}

// Task 56b - the TV during GUESS_REVEAL: correct option green, who guessed
// right, and points - both the guessers' and the drawer's own bonus. The
// round is over, so the drawing and the correct index are both safe here.
export function GuessRevealView({ guessReveal, roomCode, paused, pausedByName, secondsLeft }: GuessRevealViewProps) {
  const count = guessReveal.results.length;

  return (
    <GameLayout
      roomCode={roomCode}
      paused={paused}
      pausedByName={pausedByName}
      standings={guessReveal.standings}
      contentKey={guessReveal.roundIndex}
    >
      <div className="enter-pop" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Avatar avatarId={guessReveal.drawerAvatarId} sizeRem={2} />
        <span style={styles.category} data-testid="guess-reveal-drawer-name">
          {guessReveal.drawerName} ζωγράφισε: {guessReveal.correctWord}
        </span>
      </div>
      <div style={guessRevealImageWrapStyle(guessReveal.standings.length)}>
        <img src={guessReveal.image} alt="" style={styles.drawingImage} data-testid="guess-reveal-drawing" />
      </div>
      <div style={styles.optionsGrid}>
        {guessReveal.options.map((option, index) => {
          const identity = ANSWER_IDENTITIES[index];
          const isCorrect = index === guessReveal.correctIndex;
          return (
            <div
              key={index}
              data-testid="guess-reveal-option"
              data-correct={isCorrect}
              className={isCorrect ? 'glow-pulse correct-pop' : undefined}
              style={
                isCorrect
                  ? ({
                      ...styles.optionCardCorrect,
                      borderColor: identity.color,
                      background: `${identity.color}14`,
                      '--glow-color': 'rgba(212, 175, 55, 0.55)',
                    } as CSSVars)
                  : { ...styles.optionCardWrong, borderColor: identity.color, boxShadow: SURFACE_GLOW }
              }
            >
              <AnswerShape index={index} sizeRem={1.5} muted={!isCorrect} />
              <span style={styles.optionLabel}>{identity.letter}</span>
              <span style={isCorrect ? undefined : styles.optionTextWrong}>{option}</span>
            </div>
          );
        })}
      </div>
      <div style={styles.stealAmount} data-testid="guess-reveal-drawer-bonus">
        {guessReveal.drawerName}: +{guessReveal.drawerPointsAwarded} ({guessReveal.drawerTotalScore})
      </div>
      <div style={{ ...styles.resultsList, gap: resultsListGap(count) }}>
        {guessReveal.results.map((result, index) => {
          const previous = guessReveal.results[index - 1];
          const enteringWrongOrNoAnswer = !result.correct && (previous === undefined || previous.correct);
          return (
            <Fragment key={result.playerId}>
              {enteringWrongOrNoAnswer && index > 0 && <div style={styles.resultsDivider} data-testid="results-divider" />}
              <div
                style={{ ...styles.resultRow, ...resultRowSizeStyle(count, false) }}
                data-testid="guess-reveal-result"
                data-correct={result.correct}
              >
                <span style={result.correct ? styles.resultNameCorrect : styles.resultNameWrong}>
                  <Avatar avatarId={result.avatarId} sizeRem={resultAvatarSize(count)} />
                  <span style={styles.resultNameText}>
                    {result.correct ? '✓' : result.choice !== null ? '✗' : '–'} {result.name}
                  </span>
                </span>
                <span style={styles.resultPoints}>
                  +{result.pointsAwarded} ({result.totalScore})
                </span>
              </div>
            </Fragment>
          );
        })}
      </div>
      <div style={styles.progressBarTrack} data-testid="guess-reveal-progress">
        <div
          style={{
            ...styles.progressBarFill,
            width: `${(secondsLeft / Math.ceil(GUESS_REVEAL_DURATION_MS / 1000)) * 100}%`,
          }}
        />
      </div>
    </GameLayout>
  );
}
