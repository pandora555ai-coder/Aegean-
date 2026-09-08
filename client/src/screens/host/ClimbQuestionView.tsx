import { useRef } from 'react';
import type { ClimbQuestionShowHostPayload, RoomCode } from '@game/shared';
import { useFitFontSize } from '../../hooks/useFitFontSize';
import { greekUpper } from '../../greekUpper';
import { MarbleSlab } from '../../components/MarbleSlab';
import { AnavasisChrome } from '../../components/AnavasisScene';
import { styles } from './hostStyles';

interface ClimbQuestionViewProps {
  climbQuestion: ClimbQuestionShowHostPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
}

// Task 189 - Η Ανάβασις's own question beat. Same "just the question, no
// options grid" shape as TrialQuestionView (the ladder is the score, shown
// by the climbers on the stair, not a slab) - but positioned like
// design/anavasis-reference.html's #qslab rather than inside GameLayout's
// read column: the climb bypasses that column entirely (HostScreen's
// showShell is false for all four climb/duel phases), so this renders its
// own room-code/pause chrome via AnavasisChrome.
const SLAB_WRAP_STYLE = { position: 'fixed', left: '16%', top: '9%', width: '52%', zIndex: 1 } as const;

export function ClimbQuestionView({ climbQuestion, roomCode, paused, pausedByName }: ClimbQuestionViewProps) {
  const questionBlockRef = useRef<HTMLDivElement | null>(null);
  const questionTextRef = useRef<HTMLDivElement | null>(null);
  useFitFontSize(questionBlockRef, questionTextRef, [climbQuestion.question, climbQuestion.roundIndex], {
    maxRem: 5,
    minRem: 2,
  });
  return (
    <>
      <AnavasisChrome roomCode={roomCode} paused={paused} pausedByName={pausedByName} />
      <div style={SLAB_WRAP_STYLE} key={climbQuestion.roundIndex} className="screen-fade-in">
        <div className="enter-pop" style={styles.category}>
          {greekUpper(climbQuestion.category)}
        </div>
        <MarbleSlab className="enter-pop" data-testid="climb-question-slab">
          <div style={{ ...styles.questionBlock, minHeight: '10rem' }} ref={questionBlockRef}>
            <div style={{ ...styles.questionTextTv, fontSize: '3.5rem', color: 'var(--carve)' }} data-testid="question-text" ref={questionTextRef}>
              {climbQuestion.question}
            </div>
          </div>
        </MarbleSlab>
      </div>
    </>
  );
}
