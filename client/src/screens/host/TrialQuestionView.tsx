import { useRef } from 'react';
import { type RoomCode, type TrialQuestionShowHostPayload } from '@game/shared';
import { useFitFontSize } from '../../hooks/useFitFontSize';
import { GameLayout } from './GameLayout';
import { PapyrusPanel } from './PapyrusPanel';
import { styles } from './hostStyles';

interface TrialQuestionViewProps {
  trialQuestion: TrialQuestionShowHostPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
}

// Η Δίκη (Task 128) - TRIAL_QUESTION's whole view, built the same way
// QuestionView is: the papyrus carries the question text only (the phones
// carry the four options), the score column carries everyone's life. No
// options grid, no answered counter - both would duplicate what the score
// column already shows during this beat.
export function TrialQuestionView({ trialQuestion, roomCode, paused, pausedByName }: TrialQuestionViewProps) {
  const questionBlockRef = useRef<HTMLDivElement | null>(null);
  const questionTextRef = useRef<HTMLDivElement | null>(null);
  useFitFontSize(
    questionBlockRef,
    questionTextRef,
    [trialQuestion.question, trialQuestion.roundIndex, trialQuestion.standings.length],
    {
      maxRem: 6,
      minRem: 2,
    },
  );
  return (
    <GameLayout
      roomCode={roomCode}
      paused={paused}
      pausedByName={pausedByName}
      standings={trialQuestion.standings}
      contentKey={trialQuestion.roundIndex}
    >
      {trialQuestion.suddenDeath && (
        <div className="enter-pop" style={styles.socratesIntroBanner} data-testid="trial-sudden-death">
          ΘΑΝΑΤΗΦΟΡΟΣ ΓΥΡΟΣ
        </div>
      )}
      <div className="enter-pop" style={styles.category}>
        {trialQuestion.category}
      </div>
      <PapyrusPanel className="enter-pop" style={{ flex: '1 1 0' }}>
        <div style={styles.questionBlock} ref={questionBlockRef}>
          <div
            style={{ ...styles.questionTextTv, color: 'var(--ink)' }}
            data-testid="question-text"
            ref={questionTextRef}
          >
            {trialQuestion.question}
          </div>
        </div>
      </PapyrusPanel>
    </GameLayout>
  );
}
