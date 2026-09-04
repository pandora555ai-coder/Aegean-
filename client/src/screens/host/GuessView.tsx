import type { CSSProperties } from 'react';
import { type GuessShowHostPayload, type RoomCode } from '@game/shared';
import { Avatar } from '../../components/Avatar';
import { GameLayout } from './GameLayout';
import { MarbleSlab } from '../../components/MarbleSlab';
import { styles } from './hostStyles';

// Task 161 - the reference's .drawing grid: the picture on the left, the
// options beside it, on ONE slab. The read area is 57vh tall now that the
// sophists row owns the foot of the screen, and the old two-slab stack
// (picture above, options below) no longer fit in it.
const drawingGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: '1.5rem',
  alignItems: 'center',
  width: '100%',
};

// Boxed options, no letters - same treatment as RevealView (see that file's
// own optionsGridStyle/optionRowStyle). The correct index never reaches
// this payload, so there's no correctness to signal here.
const optionsGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '0.75rem',
  width: '100%',
  minWidth: 0,
};

const optionBoxStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '1rem',
  fontSize: '1.85rem',
  fontWeight: 600,
  color: 'var(--carve)',
  padding: '0.75rem 1.25rem',
  border: '1px solid var(--marble-3)',
  borderRadius: '0.5rem',
  minWidth: 0,
};

interface GuessViewProps {
  guess: GuessShowHostPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
}

// Task 56b - the TV during GUESS: the drawing large and the 4 options (the
// countdown is the krater at the top-right, Task 112/161). The correct index
// never reaches this payload at all (see buildGuessHostPayload) - every
// option renders identically until GUESS_REVEAL.
//
// Task 115 deleted the "N/M μάντεψαν" counter under the options, with NO
// replacement. The drawer heading ABOVE the drawing stays: it is not a
// duplicate of the sophists row, it says whose sketch this is, which is the
// whole point of the phase (the one standing exception to "nothing on the
// slab names a player"). The server still counts guesses and still ends the
// phase early once every guesser has answered.
export function GuessView({ guess, roomCode, paused, pausedByName }: GuessViewProps) {
  return (
    <GameLayout
      roomCode={roomCode}
      paused={paused}
      pausedByName={pausedByName}
      standings={guess.standings}
      contentKey={guess.roundIndex}
    >
      <div className="enter-pop" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Avatar avatarId={guess.drawerAvatarId} sizeRem={2} />
        <span style={styles.category} data-testid="guess-drawer-name">
          {guess.drawerName} ζωγράφισε αυτό
        </span>
      </div>
      <MarbleSlab className="enter-pop" style={{ flex: '0 0 auto', padding: '1rem 1.5rem' }}>
        <div style={drawingGridStyle}>
          <div style={styles.drawingImageWrap}>
            <img src={guess.image} alt="" style={styles.drawingImage} data-testid="guess-drawing" />
          </div>
          <div style={optionsGridStyle}>
            {guess.options.map((option, index) => (
              <div key={index} data-testid="guess-option" style={optionBoxStyle}>
                <span>{option}</span>
              </div>
            ))}
          </div>
        </div>
      </MarbleSlab>
    </GameLayout>
  );
}
