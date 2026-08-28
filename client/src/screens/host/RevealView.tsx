import { Fragment, type CSSProperties } from 'react';
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
import { PapyrusPanel } from './PapyrusPanel';
import { resultAvatarSize, resultRowSizeStyle, resultsListGap, styles, type CSSVars } from './hostStyles';

// Ελαιογραφία palette pass - REVEAL's own content (the shared chrome
// - score panel, timer, category, answered-names - is ported in
// hostStyles.ts already). Correctness is never colour-coded here: it reads
// purely as full-opacity/bold (correct) vs 42%-opacity/regular (wrong) -
// see WRONG_OPACITY below - so nothing here needs a correctness hue.
const WRONG_OPACITY = 0.42;

const optionRowStyle = (isCorrect: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '1rem',
  fontSize: '2.25rem',
  fontWeight: isCorrect ? 800 : 500,
  opacity: isCorrect ? 1 : WRONG_OPACITY,
  color: 'var(--ink)',
  padding: '0.5rem 0',
});

const answerCountStyle: CSSProperties = {
  marginLeft: 'auto',
  fontWeight: 800,
  color: 'var(--ink)',
};

const resultNameStyle = (correct: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  flex: 1,
  minWidth: 0,
  color: 'var(--cream)',
  fontWeight: correct ? 800 : 500,
  opacity: correct ? 1 : WRONG_OPACITY,
});

const resultPointsStyle: CSSProperties = {
  flexShrink: 0,
  fontFamily: 'monospace',
  fontWeight: 700,
  color: 'var(--cream)',
};

const resultsDividerStyle: CSSProperties = {
  height: '1px',
  background: 'var(--dim)',
  margin: '0.4rem 0',
  opacity: 0.4,
};

const progressBarTrackStyle: CSSProperties = {
  width: '100%',
  maxWidth: '500px',
  height: '0.5rem',
  borderRadius: '999px',
  background: 'var(--panel)',
  overflow: 'hidden',
};

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
      <PapyrusPanel className="enter-pop" style={{ flex: '0 0 auto' }}>
        <div style={styles.optionsGrid}>
          {question.options.map((option, index) => {
            const identity = ANSWER_IDENTITIES[index];
            const isCorrect = index === reveal.correctIndex;
            return (
              <div
                key={index}
                data-testid="reveal-option"
                data-correct={isCorrect}
                className={isCorrect ? 'correct-pop' : undefined}
                style={optionRowStyle(isCorrect)}
              >
                {/* The shape/letter identity colour never changes with
                    correctness - it's the same per-slot hue on every option
                    regardless of which one is right. Correctness itself
                    reads purely via this row's opacity/weight above. */}
                <AnswerShape index={index} sizeRem={1.75} />
                <span style={styles.optionLabel}>{identity.letter}</span>
                <span>{option}</span>
                <span style={answerCountStyle} data-testid="answer-count">
                  {reveal.answerCounts[index]}
                </span>
              </div>
            );
          })}
        </div>
      </PapyrusPanel>
      <div style={{ ...styles.resultsList, gap: resultsListGap(count) }}>
        {/* Rendered in the order the server sent them - correct-by-speed,
            then wrong, then non-answerers. Never re-sorted here. */}
        {reveal.results.map((result, index) => {
          const previous = reveal.results[index - 1];
          const enteringWrongOrNoAnswer = !result.correct && (previous === undefined || previous.correct);
          const isFastest = result.answerRank === 1;
          return (
            <Fragment key={result.playerId}>
              {enteringWrongOrNoAnswer && <div style={resultsDividerStyle} data-testid="results-divider" />}
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
                <span style={resultNameStyle(result.correct)}>
                  <Avatar avatarId={result.avatarId} sizeRem={resultAvatarSize(count)} />
                  <span style={styles.resultNameText}>
                    {result.correct
                      ? `${result.answerRank}. ${result.name}${result.timeMs !== null ? ` — ${(result.timeMs / 1000).toFixed(1)}΄΄` : ''}`
                      : `${result.timeMs !== null ? '✗' : '–'} ${result.name}`}
                  </span>
                </span>
                <span style={resultPointsStyle}>
                  +{result.pointsAwarded} ({result.totalScore})
                </span>
              </div>
            </Fragment>
          );
        })}
      </div>
      <div style={progressBarTrackStyle} data-testid="reveal-progress">
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
