import type { CSSProperties } from 'react';
import { GUESS_REVEAL_DURATION_MS, type GuessRevealShowPayload, type RoomCode } from '@game/shared';
import { Avatar } from '../../components/Avatar';
import { GameLayout } from './GameLayout';
import { PapyrusPanel } from './PapyrusPanel';
import { guessRevealImageWrapStyle, styles } from './hostStyles';

// Ελαιογραφία palette pass - GUESS_REVEAL's own content, mirroring
// RevealView's redesign exactly: correctness reads as opacity/weight only
// (no hue), and the picture/word/options all sit on papyrus. optionCard*
// (hostStyles.ts) is now unused by any other phase after this - kept local
// here instead of edited in place, same reasoning as RevealView's own local
// overrides.
//
// The per-player result list was deleted (names/scores already live in the
// score column - see GameLayout) because at 8 players it pushed this
// panel's bottom edge to 717px of a 720px TV, and real TVs crop 2-3% at
// the edges - it was already off-screen there.
//
// Task 115 finished that: the drawer's own bonus line and the aggregate
// "N/M μάντεψαν σωστά" are gone too. Nothing under the papyrus names a
// player or counts them - the drawer's +N is in the score column like
// everyone else's. The drawer heading ABOVE the drawing stays: it says whose
// sketch this is, not who scored.
const WRONG_OPACITY = 0.42;

// Boxed option, no letter - same treatment as RevealView. Border colour is
// fixed regardless of correctness; only opacity/weight signal it.
const optionRowStyle = (isCorrect: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '1rem',
  fontSize: '2.25rem',
  lineHeight: 1.15,
  fontWeight: isCorrect ? 800 : 500,
  opacity: isCorrect ? 1 : WRONG_OPACITY,
  color: 'var(--ink)',
  // Tighter vertical padding than RevealView's box - this panel already
  // stacks a heading word and the drawer's bonus line above the results
  // list, with no vertical room to spare (Task 103's flex-shrink:0 rule
  // means this panel never gives it back either).
  padding: '0.25rem 1.25rem',
  border: '1px solid var(--wood)',
  borderRadius: '0.5rem',
  minWidth: 0,
});

// Task 103 - independent fix, not the overflow bug's cause (see
// PapyrusPanel.tsx for that): a long option word had nowhere to shrink to,
// so it wrapped to a second line inside its cell instead of eating the
// panel's spare width. A flex item's `min-width` defaults to `auto` (its
// own content size), not 0 - nested one level deep (row -> cell -> this
// span), EVERY level needs its own `flex`+`minWidth:0` or the ellipsis
// truncation below never engages. Keeps every option on one line
// regardless of word length ("Υδραγωγείο", "Κρεμάστρα" verified).
const optionTextStyle: CSSProperties = {
  flex: '1 1 0',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const correctWordStyle: CSSProperties = {
  fontSize: '1.75rem',
  lineHeight: 1.15,
  fontWeight: 800,
  color: 'var(--ink)',
  textAlign: 'center',
};

const progressBarTrackStyle: CSSProperties = {
  width: '100%',
  maxWidth: '500px',
  height: '0.5rem',
  borderRadius: '999px',
  background: 'var(--panel)',
  overflow: 'hidden',
};

interface GuessRevealViewProps {
  guessReveal: GuessRevealShowPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  secondsLeft: number;
}

// Task 56b - the TV during GUESS_REVEAL: correct option green, who guessed
// right, and points - both the guessers' and the drawer's own bonus. The
// round is over, so the drawing and the correct index are both safe here.
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
      <PapyrusPanel className="enter-pop" style={{ flex: '0 0 auto', justifyContent: 'center' }}>
        <div style={guessRevealImageWrapStyle(guessReveal.standings.length)}>
          <img src={guessReveal.image} alt="" style={styles.drawingImage} data-testid="guess-reveal-drawing" />
        </div>
      </PapyrusPanel>
      <PapyrusPanel style={{ flex: '0 0 auto', padding: '1rem 1.5rem' }}>
        {/* Task 103 - flattened to ONE flex column (word heading + the two
            option rows as direct siblings), not word-wrapper > rows-wrapper
            > row - one fewer level of flex-in-flex nesting, kept for its
            own sake. The actual overflow bug this panel had wasn't nesting
            depth at all: it was PapyrusPanel's flex-shrink (see that
            file's own comment) - fixed there, not here. */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', width: '100%' }}>
          <div style={correctWordStyle} data-testid="guess-reveal-word">
            {guessReveal.correctWord}
          </div>
          {[0, 1].map((rowStart) => (
            <div key={rowStart} style={{ display: 'flex', gap: '1.5rem', width: '100%', maxWidth: '1100px' }}>
              {guessReveal.options.slice(rowStart * 2, rowStart * 2 + 2).map((option, colIndex) => {
                const index = rowStart * 2 + colIndex;
                const isCorrect = index === guessReveal.correctIndex;
                return (
                  <div
                    key={index}
                    data-testid="guess-reveal-option"
                    data-correct={isCorrect}
                    className={isCorrect ? 'correct-pop' : undefined}
                    style={{ ...optionRowStyle(isCorrect), flex: '1 1 0' }}
                  >
                    <span style={optionTextStyle}>{option}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </PapyrusPanel>
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
