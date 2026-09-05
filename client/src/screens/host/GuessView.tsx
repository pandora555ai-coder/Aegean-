import type { CSSProperties } from 'react';
import { type GuessShowHostPayload, type RoomCode } from '@game/shared';
import { Avatar } from '../../components/Avatar';
import { GameLayout } from './GameLayout';
import { MarbleSlab } from '../../components/MarbleSlab';
import { styles } from './hostStyles';

// Task 161/163d - the reference's .drawing grid: the picture on the left,
// the options beside it, on ONE slab. Doubled from the reference's literal
// cqh figures (see CheckMark.tsx's comment - this container measures
// roughly half the reference's own).
const drawingGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: '8cqh',
  alignItems: 'center',
  width: '100%',
};

// ONE column (design/theatre-reference.html's guess(): .opts with an inline
// grid-template-columns:1fr override) - four short words read better as a
// list beside a square picture than as a cramped 2x2 grid would.
const optionsColumnStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: '2.4cqh',
  width: '100%',
  minWidth: 0,
};

const optionRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  fontSize: '6.8cqh',
  fontWeight: 700,
  color: 'var(--carve)',
  minWidth: 0,
};

const optionTextStyle: CSSProperties = {
  flex: '1 1 0',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

interface GuessViewProps {
  guess: GuessShowHostPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
}

// Task 56b/163d - the TV during GUESS: the drawing large and the 4 options
// (the countdown is the krater at the top-right, Task 112/161). The correct
// index never reaches this payload at all (see buildGuessHostPayload) -
// every option renders identically until GUESS_REVEAL.
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
      <MarbleSlab className="enter-pop" style={{ flex: '0 0 auto' }}>
        <div style={drawingGridStyle}>
          <div style={styles.drawingImageWrap}>
            <img src={guess.image} alt="" style={styles.drawingImage} data-testid="guess-drawing" />
          </div>
          <div style={optionsColumnStyle}>
            {guess.options.map((option, index) => (
              <div key={index} data-testid="guess-option" style={optionRowStyle}>
                <span style={optionTextStyle}>{option}</span>
              </div>
            ))}
          </div>
        </div>
      </MarbleSlab>
    </GameLayout>
  );
}
