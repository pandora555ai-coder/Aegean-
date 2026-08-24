import { Fragment } from 'react';
import {
  ANSWER_IDENTITIES,
  REVEAL_DURATION_MS,
  type QuestionShowHostPayload,
  type RevealHostPayload,
  type RoomCode,
} from '@game/shared';
import { AnswerShape } from '../../components/AnswerShape';
import { Avatar } from '../../components/Avatar';
import { GameLayout } from './GameLayout';
import {
  SURFACE_GLOW,
  resultAvatarSize,
  resultRowSizeStyle,
  resultsListGap,
  styles,
  type CSSVars,
} from './hostStyles';

interface RevealViewProps {
  reveal: RevealHostPayload;
  question: QuestionShowHostPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  revealSecondsLeft: number;
}

export function RevealView({ reveal, question, roomCode, paused, pausedByName, revealSecondsLeft }: RevealViewProps) {
  const count = reveal.results.length;

  return (
    <GameLayout
      roomCode={roomCode}
      paused={paused}
      pausedByName={pausedByName}
      standings={reveal.standings}
      contentKey={question.questionIndex}
    >
      {/* Socrates' commentary is NOT here any more (Task 39): it gets its
          own phase after this one, alone on screen, instead of a banner
          crowding the results. */}
      <div style={styles.optionsGrid}>
        {question.options.map((option, index) => {
          const identity = ANSWER_IDENTITIES[index];
          const isCorrect = index === reveal.correctIndex;
          return (
            <div
              key={index}
              data-testid="reveal-option"
              data-correct={isCorrect}
              className={isCorrect ? 'glow-pulse correct-pop' : undefined}
              style={
                isCorrect
                  ? ({
                      ...styles.optionCardCorrect,
                      borderColor: identity.color,
                      background: `${identity.color}14`,
                      // The burst glow is GOLD (not the identity colour) -
                      // gold means "this matters", and it's what makes the
                      // correct card read as CELEBRATED rather than just
                      // "still coloured like it was during the question".
                      '--glow-color': 'rgba(212, 175, 55, 0.55)',
                    } as CSSVars)
                  : { ...styles.optionCardWrong, borderColor: identity.color, boxShadow: SURFACE_GLOW }
              }
            >
              <AnswerShape index={index} sizeRem={1.75} muted={!isCorrect} />
              {/* Letter text is always neutral, never the identity colour -
                  red/blue as small TEXT drop under 4.5:1 on this lighter
                  stage background (see theme.css's --danger-text comment).
                  The identity colour still pops via the shape, the full
                  border, and (when correct) the tinted background + gold
                  glow. */}
              <span style={styles.optionLabel}>{identity.letter}</span>
              <span style={isCorrect ? undefined : styles.optionTextWrong}>{option}</span>
              <span style={styles.answerCount} data-testid="answer-count">
                {reveal.answerCounts[index]}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ ...styles.resultsList, gap: resultsListGap(count) }}>
        {/* Rendered in the order the server sent them - correct-by-speed,
            then wrong, then non-answerers. Never re-sorted here. */}
        {reveal.results.map((result, index) => {
          const previous = reveal.results[index - 1];
          const enteringWrongOrNoAnswer = !result.correct && (previous === undefined || previous.correct);
          const isFastest = result.answerRank === 1;
          return (
            <Fragment key={result.playerId}>
              {enteringWrongOrNoAnswer && <div style={styles.resultsDivider} data-testid="results-divider" />}
              <div
                className={isFastest ? 'glow-pulse' : undefined}
                style={
                  isFastest
                    ? ({
                        ...styles.resultRowFastest,
                        ...resultRowSizeStyle(count, true),
                        '--glow-color': 'rgba(212, 175, 55, 0.35)',
                      } as CSSVars)
                    : { ...styles.resultRow, ...resultRowSizeStyle(count, false) }
                }
                data-testid="reveal-result"
                data-correct={result.correct}
                data-answer-rank={result.answerRank ?? ''}
              >
                <span style={result.correct ? styles.resultNameCorrect : styles.resultNameWrong}>
                  <Avatar avatarId={result.avatarId} sizeRem={resultAvatarSize(count)} />
                  <span style={styles.resultNameText}>
                    {result.correct
                      ? `${result.answerRank}. ${result.name}${result.timeMs !== null ? ` — ${(result.timeMs / 1000).toFixed(1)}΄΄` : ''}`
                      : `${result.timeMs !== null ? '✗' : '–'} ${result.name}`}
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
      <div style={styles.progressBarTrack} data-testid="reveal-progress">
        <div
          style={{
            ...styles.progressBarFill,
            width: `${(revealSecondsLeft / Math.ceil(REVEAL_DURATION_MS / 1000)) * 100}%`,
          }}
        />
      </div>
    </GameLayout>
  );
}
