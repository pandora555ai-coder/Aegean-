import { useRef, type CSSProperties } from 'react';
import { BLITZ_REVEAL_DURATION_MS, type BlitzRevealHostPayload, type RoomCode } from '@game/shared';
import { useFitFontSize } from '../../hooks/useFitFontSize';
import { GameLayout } from './GameLayout';
import { PapyrusPanel } from './PapyrusPanel';
import { styles } from './hostStyles';

// Same local override as NumericRevealView's - see the note there.
const progressBarTrackStyle: CSSProperties = {
  width: '100%',
  maxWidth: '500px',
  height: '0.5rem',
  borderRadius: '999px',
  background: 'var(--panel)',
  overflow: 'hidden',
};

interface BlitzRevealViewProps {
  reveal: BlitzRevealHostPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  secondsLeft: number;
}

// Task 156 - the TV during BLITZ_REVEAL. The papyrus reads the ONE statement
// the room got wrong most, with its truth - the first moment a truth value
// is on any screen. Every player's delta is in the score column (HostScreen's
// pointsThisRound), never here.
export function BlitzRevealView({ reveal, roomCode, paused, pausedByName, secondsLeft }: BlitzRevealViewProps) {
  const count = reveal.standings.length;
  const blockRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const missed = reveal.mostMissed;
  useFitFontSize(blockRef, textRef, [missed?.text, count], { maxRem: 4.5, minRem: 1.8 });

  return (
    <GameLayout roomCode={roomCode} paused={paused} pausedByName={pausedByName} standings={reveal.standings} contentKey="blitz-reveal">
      <div className="enter-pop" style={styles.category}>
        {missed ? 'Η πιο δύσκολη πρόταση' : 'Αστραπή'}
      </div>
      <PapyrusPanel className="enter-pop" style={{ flex: '1 1 0' }}>
        <div style={styles.questionBlock} ref={blockRef}>
          <div style={{ ...styles.questionTextTv, color: 'var(--ink)' }} data-testid="blitz-reveal-text" ref={textRef}>
            {missed ? missed.text : 'Κανείς δεν έκανε λάθος.'}
          </div>
          {missed && (
            <div style={styles.blitzVerdict} data-testid="blitz-reveal-verdict">
              Ήταν {missed.isTrue ? 'ΣΩΣΤΟ' : 'ΛΑΘΟΣ'} — το έχασαν {missed.missedCount}
            </div>
          )}
        </div>
      </PapyrusPanel>
      <div style={progressBarTrackStyle} data-testid="blitz-reveal-progress">
        <div
          style={{
            ...styles.progressBarFill,
            width: `${(secondsLeft / Math.ceil(BLITZ_REVEAL_DURATION_MS / 1000)) * 100}%`,
          }}
        />
      </div>
    </GameLayout>
  );
}
