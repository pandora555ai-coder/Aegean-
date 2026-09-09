import { useRef } from 'react';
import type { AgoraQuestionKind, AgoraQuestionShowHostPayload, RoomCode } from '@game/shared';
import { useFitFontSize } from '../../hooks/useFitFontSize';
import { greekUpper } from '../../greekUpper';
import { GameLayout } from './GameLayout';
import { MarbleSlab } from '../../components/MarbleSlab';
import { styles } from './hostStyles';

interface AgoraQuestionViewProps {
  agoraQuestion: AgoraQuestionShowHostPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
}

// The ladder is fixed server-side (Q1 existence, Q2 colour, Q3 count -
// shared/src/agora.ts's own comment) and is exactly a difficulty ladder, so
// this reuses the reference's own three tags rather than inventing new ones.
// Authored lowercase+accented, like every other title on this screen -
// greekUpper does the uppercasing (CLAUDE.md: never a raw text-transform on
// Greek text).
const AGORA_KIND_LABEL_GR: Record<AgoraQuestionKind, string> = {
  existence: 'εύκολη',
  colour: 'μέτρια',
  count: 'δύσκολη',
};

// Task 208 - the market is CLOSED during this phase (AgoraScene renders no
// market group at all while AGORA_QUESTION is live - see HostScreen), so
// this view carries the same "papyrus reads, column carries players" shape
// as QuestionView/TrialQuestionView: the question text only, no options grid
// (the phones already have the four options; the TV's own options+swatches
// belong to the reveal, not here - see AgoraRevealView).
export function AgoraQuestionView({ agoraQuestion, roomCode, paused, pausedByName }: AgoraQuestionViewProps) {
  const questionBlockRef = useRef<HTMLDivElement | null>(null);
  const questionTextRef = useRef<HTMLDivElement | null>(null);
  useFitFontSize(
    questionBlockRef,
    questionTextRef,
    [agoraQuestion.question, agoraQuestion.questionIndex, agoraQuestion.standings.length],
    { maxRem: 6, minRem: 2 },
  );
  return (
    <GameLayout
      roomCode={roomCode}
      paused={paused}
      pausedByName={pausedByName}
      standings={agoraQuestion.standings}
      contentKey={agoraQuestion.questionIndex}
    >
      <div className="enter-pop" style={styles.category}>
        {greekUpper(AGORA_KIND_LABEL_GR[agoraQuestion.kind])}
      </div>
      <MarbleSlab className="enter-pop" style={{ flex: '1 1 0' }} data-testid="agora-question-slab">
        <div style={styles.questionBlock} ref={questionBlockRef}>
          <div
            style={{ ...styles.questionTextTv, color: 'var(--carve)' }}
            data-testid="question-text"
            ref={questionTextRef}
          >
            {agoraQuestion.question}
          </div>
        </div>
      </MarbleSlab>
    </GameLayout>
  );
}
