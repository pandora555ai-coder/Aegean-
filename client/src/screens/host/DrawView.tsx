import type { CSSProperties } from 'react';
import { type DrawShowHostPayload, type RoomCode } from '@game/shared';
import { GameLayout } from './GameLayout';
import { MarbleSlab } from '../../components/MarbleSlab';
import { styles } from './hostStyles';

// Task 163d - design/theatre-reference.html's .drawing grid: a canvas-shaped
// square left, text right. DRAW never sends the host WHAT anyone is drawing
// (see buildDrawHostPayload) or WHO - everyone draws at once, so unlike
// GUESS there's no single artist to name (the standing "names a player"
// exception is GUESS's drawer line only) - so the canvas here is blank
// paper, not a picture, and the text names no one.
// The literal reference figures - see CheckMark.tsx's comment for why
// these no longer need doubling.
const drawingGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: '4cqh',
  alignItems: 'center',
  width: '100%',
};

const titleStyle: CSSProperties = {
  fontFamily: '"Gentium Book Plus", Georgia, "Times New Roman", serif',
  fontSize: '5.8cqh',
  lineHeight: 1.2,
  fontWeight: 700,
  color: 'var(--carve)',
};

// The reference's .mid is --marble-3 (a dark-ground colour) - on this
// marble slab (light ground) that would be nearly invisible, so this reads
// as --carve at a lighter weight/size instead, the same substitution every
// other slab on this TV already makes for "muted but still legible".
const waitingLineStyle: CSSProperties = {
  fontSize: '3.2cqh',
  marginTop: '1.6cqh',
  color: 'var(--carve)',
  fontWeight: 600,
  opacity: 0.7,
};

interface DrawViewProps {
  draw: DrawShowHostPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
}

// Task 56b/163d - the TV during DRAW. WHAT anyone is drawing is never sent to
// the host at all (see buildDrawHostPayload), so there is nothing here that
// could spoil it before the GUESS phase - the canvas is blank paper, a
// placeholder for "everyone is drawing right now", not a preview.
//
// Task 115 deleted the "N/M υπέβαλαν" counter and the submitted-avatar strip
// under it, with NO replacement: the score column already names everyone in
// the room. The server still counts submissions and still ends the phase
// early once everyone has submitted.
export function DrawView({ draw, roomCode, paused, pausedByName }: DrawViewProps) {
  return (
    <GameLayout roomCode={roomCode} paused={paused} pausedByName={pausedByName} standings={draw.standings}>
      <div className="enter-pop" style={styles.category}>
        Ζωγραφική
      </div>
      <MarbleSlab className="enter-pop" style={{ flex: '0 0 auto' }}>
        <div style={drawingGridStyle}>
          <div style={styles.drawingImageWrap} data-testid="draw-canvas" />
          <div>
            <div style={titleStyle} data-testid="draw-title">
              Ζωγραφίστε!
            </div>
            <div style={waitingLineStyle} data-testid="draw-subtitle">
              Στα κινητά σας
            </div>
          </div>
        </div>
      </MarbleSlab>
    </GameLayout>
  );
}
