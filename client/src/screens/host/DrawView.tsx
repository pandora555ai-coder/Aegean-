import { useRef, type CSSProperties } from 'react';
import { type DrawShowHostPayload, type RoomCode } from '@game/shared';
import { useFitFontSize } from '../../hooks/useFitFontSize';
import { GameLayout } from './GameLayout';
import { MarbleSlab } from '../../components/MarbleSlab';
import { styles } from './hostStyles';

// questionTextTv/progress are shared with other phases (hostStyles.ts) and
// still carry pre-Θέατρο tokens there - this phase's content is ported
// on its own, so the papyrus text gets local ink overrides instead of
// touching those shared entries. Same layout as PowerUpView's identical
// "instruction card" pattern.
const papyrusTextBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.75rem',
  width: '100%',
};

interface DrawViewProps {
  draw: DrawShowHostPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
}

// Task 56b - the TV during DRAW. WHAT anyone is drawing is never sent to the
// host at all (see buildDrawHostPayload), so there is nothing here that could
// spoil it before the GUESS phase.
//
// Task 115 deleted the "N/M υπέβαλαν" counter and the submitted-avatar strip
// under it, with NO replacement: the score column already names everyone in
// the room. The server still counts submissions and still ends the phase
// early once everyone has submitted.
export function DrawView({ draw, roomCode, paused, pausedByName }: DrawViewProps) {
  const titleBlockRef = useRef<HTMLDivElement | null>(null);
  const titleTextRef = useRef<HTMLDivElement | null>(null);
  // "Ζωγραφίστε!" is one unbroken word - no space to wrap on, so a fixed
  // 6rem (questionTextTv) ran it past the panel's width with no fallback.
  useFitFontSize(titleBlockRef, titleTextRef, [], { maxRem: 6, minRem: 2 });
  return (
    <GameLayout roomCode={roomCode} paused={paused} pausedByName={pausedByName} standings={draw.standings}>
      <div className="enter-pop" style={styles.category}>
        Ζωγραφική
      </div>
      <MarbleSlab className="enter-pop" style={{ flex: '0 0 auto' }}>
        <div style={papyrusTextBlockStyle} ref={titleBlockRef}>
          <div style={{ ...styles.questionTextTv, color: 'var(--carve)' }} data-testid="draw-title" ref={titleTextRef}>
            Ζωγραφίστε!
          </div>
          <div style={{ ...styles.progress, color: 'var(--carve)' }} data-testid="draw-subtitle">
            Στα κινητά σας
          </div>
        </div>
      </MarbleSlab>
    </GameLayout>
  );
}
