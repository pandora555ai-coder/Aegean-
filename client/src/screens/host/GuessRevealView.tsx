import type { CSSProperties } from 'react';
import { GUESS_REVEAL_DURATION_MS, type GuessRevealShowPayload, type RoomCode } from '@game/shared';
import { Avatar } from '../../components/Avatar';
import { CheckMark } from '../../components/CheckMark';
import { GameLayout } from './GameLayout';
import { MarbleSlab } from '../../components/MarbleSlab';
import { styles } from './hostStyles';

// Task 163d - correctness is never colour-coded: full opacity + heavier
// weight + the check-mark shape (CheckMark, --wine-2) for the right word,
// 42% opacity for the rest - the SAME language RevealView uses. One column
// (matching GUESS's own layout, design/theatre-reference.html's guess()),
// sized in cqh off the read column's own container.
//
// The per-player result list was deleted (names/scores live in the sophists
// row - see HostScreen) because at 8 players it pushed this panel's bottom
// edge to 717px of a 720px TV, and real TVs crop 2-3% at the edges - it was
// already off-screen there.
//
// Task 115 finished that: the drawer's own bonus line and the aggregate
// "N/M μάντεψαν σωστά" are gone too. Nothing under the heading names a
// player or counts them - the drawer's +N is above their figure like
// everyone else's. The drawer heading ABOVE the drawing stays: it says whose
// sketch this is, not who scored.
// The literal reference figures - see CheckMark.tsx's comment for why
// these no longer need doubling.
const WRONG_OPACITY = 0.42;

const drawingGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: '4cqh',
  alignItems: 'center',
  width: '100%',
};

const optionsColumnStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: '1.2cqh',
  width: '100%',
  minWidth: 0,
};

const optionRowStyle = (isCorrect: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '1.2cqh',
  fontSize: '3.4cqh',
  fontWeight: isCorrect ? 800 : 700,
  opacity: isCorrect ? 1 : WRONG_OPACITY,
  color: 'var(--carve)',
  minWidth: 0,
});

const optionTextStyle: CSSProperties = {
  flex: '1 1 0',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const progressBarTrackStyle: CSSProperties = {
  width: '100%',
  maxWidth: '500px',
  height: '0.5rem',
  borderRadius: '999px',
  background: 'var(--marble)',
  overflow: 'hidden',
};

interface GuessRevealViewProps {
  guessReveal: GuessRevealShowPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  secondsLeft: number;
}

// Task 56b - the TV during GUESS_REVEAL: the correct option full-weight, the
// rest faded. The round is over, so the drawing and the correct index are
// both safe here.
export function GuessRevealView({ guessReveal, roomCode, paused, pausedByName, secondsLeft }: GuessRevealViewProps) {
  return (
    <GameLayout
      roomCode={roomCode}
      paused={paused}
      pausedByName={pausedByName}
      standings={guessReveal.standings}
      contentKey={guessReveal.roundIndex}
    >
      <div className="enter-pop" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Avatar avatarId={guessReveal.drawerAvatarId} sizeRem={2} />
        <span style={styles.category} data-testid="guess-reveal-drawer-name">
          {guessReveal.drawerName} ζωγράφισε:
        </span>
      </div>
      <MarbleSlab className="enter-pop" style={{ flex: '0 0 auto' }}>
        <div style={drawingGridStyle}>
          <div style={styles.drawingImageWrap}>
            <img src={guessReveal.image} alt="" style={styles.drawingImage} data-testid="guess-reveal-drawing" />
          </div>
          <div style={optionsColumnStyle}>
            {guessReveal.options.map((option, index) => {
              const isCorrect = index === guessReveal.correctIndex;
              return (
                <div
                  key={index}
                  data-testid="guess-reveal-option"
                  data-correct={isCorrect}
                  className={isCorrect ? 'correct-pop' : undefined}
                  style={optionRowStyle(isCorrect)}
                >
                  <CheckMark visible={isCorrect} />
                  <span style={optionTextStyle}>{option}</span>
                </div>
              );
            })}
          </div>
        </div>
      </MarbleSlab>
      <div style={progressBarTrackStyle} data-testid="guess-reveal-progress">
        <div
          style={{
            ...styles.progressBarFill,
            width: `${(secondsLeft / Math.ceil(GUESS_REVEAL_DURATION_MS / 1000)) * 100}%`,
          }}
        />
      </div>
    </GameLayout>
  );
}
