import { useRef } from 'react';
import { type NumericQuestionShowHostPayload, type RoomCode } from '@game/shared';
import { useFitFontSize } from '../../hooks/useFitFontSize';
import { GameLayout } from './GameLayout';
import { PapyrusPanel } from './PapyrusPanel';
import { styles } from './hostStyles';

interface NumericQuestionViewProps {
  question: NumericQuestionShowHostPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
}

// Task 66 - the TV during NUMERIC_QUESTION: the question and the 0..max
// range. WHAT anyone typed is never sent to the host at all (see
// NumericQuestionShowHostPayload), so there is nothing here that could give a
// guess away before NUMERIC_REVEAL.
//
// Task 114 deleted the "N/M κλείδωσαν" counter and the answered-avatar strip
// under it, with NO replacement indicator: the score column's +N already says
// who scored, and each player's own phone tells them their result. The
// server-side count is untouched - it still ends the phase early once
// everyone has locked in (observed: the phase ended 3.3-3.5s into a 20s
// NUMERIC_QUESTION_DURATION_MS with the last bot locking in at ~3.3-3.5s).
export function NumericQuestionView({ question, roomCode, paused, pausedByName }: NumericQuestionViewProps) {
  const questionBlockRef = useRef<HTMLDivElement | null>(null);
  const questionTextRef = useRef<HTMLDivElement | null>(null);
  useFitFontSize(questionBlockRef, questionTextRef, [question.text, question.questionIndex], {
    maxRem: 6,
    minRem: 2,
  });
  return (
    <GameLayout
      roomCode={roomCode}
      paused={paused}
      pausedByName={pausedByName}
      standings={question.standings}
      contentKey={question.questionIndex}
    >
      <div className="enter-pop" style={styles.category}>
        {question.category}
      </div>
      {/* flex:1 1 0 opts back into filling available height - useFitFontSize
          below needs a determinate, flexed container to shrink text against. */}
      <PapyrusPanel className="enter-pop" style={{ flex: '1 1 0' }}>
        <div style={styles.questionBlock} ref={questionBlockRef}>
          <div
            style={{ ...styles.questionTextTv, color: 'var(--carve)' }}
            data-testid="numeric-question-text"
            ref={questionTextRef}
          >
            {question.text}
          </div>
        </div>
      </PapyrusPanel>
      <div style={styles.numericRange} data-testid="numeric-question-range">
        0 — {question.max}
      </div>
    </GameLayout>
  );
}
