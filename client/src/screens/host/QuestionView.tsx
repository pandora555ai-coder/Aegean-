import { useRef } from 'react';
import { type QuestionShowHostPayload, type RoomCode } from '@game/shared';
import { useFitFontSize } from '../../hooks/useFitFontSize';
import { GameLayout } from './GameLayout';
import { PapyrusPanel } from './PapyrusPanel';
import { styles } from './hostStyles';

interface QuestionViewProps {
  question: QuestionShowHostPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
}

// Task 115 - the papyrus reads, the column carries players: the
// "N/M απάντησαν" counter and the answered-avatar strip under it are gone,
// with NO replacement on the TV. Both named the same people the right-hand
// score column already lists. The server-side count is untouched - it still
// ends the phase early once everyone has answered.
export function QuestionView({ question, roomCode, paused, pausedByName }: QuestionViewProps) {
  const questionBlockRef = useRef<HTMLDivElement | null>(null);
  const questionTextRef = useRef<HTMLDivElement | null>(null);
  useFitFontSize(
    questionBlockRef,
    questionTextRef,
    [question.question, question.questionIndex, question.standings.length],
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
      standings={question.standings}
      contentKey={question.questionIndex}
    >
      {/* Socrates (Task 24, renamed Task 37a) - HOST ONLY, briefly shown
          then fades on its own via CSS (socrates-intro-fade, in
          palette-theatro.css) - no JS timer, so it can never delay
          anything else on this screen. The player side's answer buttons are unaffected
          regardless, since socratesIntro is never even sent in the player
          payload. Conditionally rendered, same reasoning as socratesLine
          on REVEAL - no gap when null. */}
      {question.socratesIntro && (
        <div className="socrates-intro-fade" style={styles.socratesIntroBanner} data-testid="socrates-intro">
          {question.socratesIntro}
        </div>
      )}
      <div className="enter-pop" style={styles.category}>
        {question.category}
      </div>
      {/* Task 29: the TV shows the question only - no options. Reading four
          answers off the TV and then hunting for the matching button on the
          phone splits attention; the phone already has every option. The
          options come back at REVEAL, where the TV is the only place the
          correct one is shown. Render-only: the host payload still carries
          question.options untouched. questionBlock is the ONLY child of
          questionTextRef's fit measurement, so its own flexed height maps
          1:1 to the text's available space - see useFitFontSize. */}
      {/* flex:1 1 0 opts back into filling available height - useFitFontSize
          below needs a determinate, flexed container to shrink text against. */}
      <PapyrusPanel className="enter-pop" style={{ flex: '1 1 0' }}>
        <div style={styles.questionBlock} ref={questionBlockRef}>
          <div
            style={{ ...styles.questionTextTv, color: 'var(--carve)' }}
            data-testid="question-text"
            ref={questionTextRef}
          >
            {question.question}
          </div>
        </div>
      </PapyrusPanel>
    </GameLayout>
  );
}
