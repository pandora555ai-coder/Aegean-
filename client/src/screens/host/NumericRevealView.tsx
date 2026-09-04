import { useRef, type CSSProperties } from 'react';
import { NUMERIC_REVEAL_DURATION_MS, type NumericRevealShowPayload, type RoomCode } from '@game/shared';
import { useFitFontSize } from '../../hooks/useFitFontSize';
import { GameLayout } from './GameLayout';
import { MarbleSlab } from '../../components/MarbleSlab';
import { styles } from './hostStyles';

// progressBarTrack is shared with GuessRevealView (hostStyles.ts) and still
// carries an old pre-Θέατρο token there - this phase's content is
// ported on its own, so it gets a local override instead of touching that
// shared entry.
const progressBarTrackStyle: CSSProperties = {
  width: '100%',
  maxWidth: '500px',
  height: '0.5rem',
  borderRadius: '999px',
  background: 'var(--marble)',
  overflow: 'hidden',
};

interface NumericRevealViewProps {
  reveal: NumericRevealShowPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  secondsLeft: number;
}

// Task 66 - the TV during NUMERIC_REVEAL. Task 114 deleted the number line
// (every player's guess plotted as a beeswarm against the correct answer):
// it was a second rendering of what the score column already carries, and
// the marker names duplicated the column's rows outright. The reveal is now
// the question, "Σωστή απάντηση: N", and each player's own +N in the column.
export function NumericRevealView({ reveal, roomCode, paused, pausedByName, secondsLeft }: NumericRevealViewProps) {
  const count = reveal.standings.length;
  const questionBlockRef = useRef<HTMLDivElement | null>(null);
  const questionTextRef = useRef<HTMLDivElement | null>(null);
  useFitFontSize(questionBlockRef, questionTextRef, [reveal.text, reveal.questionIndex, count], {
    maxRem: 6,
    minRem: 2,
  });

  return (
    <GameLayout
      roomCode={roomCode}
      paused={paused}
      pausedByName={pausedByName}
      standings={reveal.standings}
      contentKey={reveal.questionIndex}
    >
      <div className="enter-pop" style={styles.category}>
        {reveal.category}
      </div>
      {/* flex:1 1 0 opts back into filling available height - useFitFontSize
          below needs a determinate, flexed container to shrink text against. */}
      <MarbleSlab className="enter-pop" style={{ flex: '1 1 0' }}>
        <div style={styles.questionBlock} ref={questionBlockRef}>
          <div
            style={{ ...styles.questionTextTv, color: 'var(--carve)' }}
            data-testid="numeric-reveal-text"
            ref={questionTextRef}
          >
            {reveal.text}
          </div>
        </div>
      </MarbleSlab>
      <div style={styles.numericAnswerBanner} data-testid="numeric-reveal-answer">
        Σωστή απάντηση: {reveal.answer}
      </div>
      <div style={progressBarTrackStyle} data-testid="numeric-reveal-progress">
        <div
          style={{
            ...styles.progressBarFill,
            width: `${(secondsLeft / Math.ceil(NUMERIC_REVEAL_DURATION_MS / 1000)) * 100}%`,
          }}
        />
      </div>
    </GameLayout>
  );
}
