import { useRef } from 'react';
import { type RoomCode, type SocratesShowPayload } from '@game/shared';
import { useFitFontSize } from '../../hooks/useFitFontSize';
import { GameLayout } from './GameLayout';
import { styles } from './hostStyles';

interface SocratesViewProps {
  socrates: SocratesShowPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
}

// Task 39 - the whole view of the SOCRATES phase: the host alone with the
// line for the round that just ended. HOST ONLY, like every other piece of
// his commentary. The server HOLDS here on the shared timer, so nothing else
// is on screen underneath and the next question hasn't started - and it only
// enters the phase when a line actually fired, so this is never empty.
// "Scene lit" pass (Task 90) - he speaks alone: the sophists row drops to
// 60% for this phase (SophistsRow), the way the reference dims it.
// No progress bar (Task 96) - unlike REVEAL/GUESS_REVEAL/NUMERIC_REVEAL,
// this phase does NOT actually advance when a timer fills: it ends on
// socrates:audio_ended from the host, the countdown is only a backstop for
// when audio fails to fire that event. A filling bar implied a real
// running timer that isn't what's driving the phase here.
// Task 161 - the line is fit-sized against the read area (57vh now), the
// same way a long question is: a 95-character line at the old fixed 4vw
// wrapped to four lines and ran into the row.
export function SocratesView({ socrates, roomCode, paused, pausedByName }: SocratesViewProps) {
  const quoteBlockRef = useRef<HTMLDivElement | null>(null);
  const quoteTextRef = useRef<HTMLDivElement | null>(null);
  useFitFontSize(quoteBlockRef, quoteTextRef, [socrates.line, socrates.questionIndex], { maxRem: 4, minRem: 1.5 });
  return (
    <GameLayout
      roomCode={roomCode}
      paused={paused}
      pausedByName={pausedByName}
      standings={socrates.standings}
      contentKey={`socrates-${socrates.questionIndex}`}
    >
      <div className="enter-pop" style={{ ...styles.socratesStageCard, flex: '1 1 0', minHeight: 0 }} data-testid="socrates-stage">
        <div style={styles.socratesStageKicker}>ΣΩΚΡΑΤΗΣ</div>
        <div style={styles.questionBlock} ref={quoteBlockRef}>
          <div style={styles.socratesStageQuote} data-testid="socrates-line" ref={quoteTextRef}>
            «{socrates.line}»
          </div>
        </div>
      </div>
    </GameLayout>
  );
}
