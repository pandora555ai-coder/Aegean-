import type { CSSProperties } from 'react';
import { type GuessProgressPayload, type GuessShowHostPayload, type RoomCode } from '@game/shared';
import { Avatar } from '../../components/Avatar';
import { GameLayout } from './GameLayout';
import { PapyrusPanel } from './PapyrusPanel';
import { styles } from './hostStyles';

// Boxed options, no letters - same treatment as RevealView (see that file's
// own optionsGridStyle/optionRowStyle). The correct index never reaches
// this payload, so there's no correctness to signal here.
const optionsGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '0.75rem',
  width: '100%',
  maxWidth: '1100px',
};

const optionBoxStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '1rem',
  fontSize: '1.85rem',
  fontWeight: 600,
  color: 'var(--ink)',
  padding: '0.75rem 1.25rem',
  border: '1px solid var(--wood)',
  borderRadius: '0.5rem',
};

interface GuessViewProps {
  guess: GuessShowHostPayload;
  progress: GuessProgressPayload | null;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
}

// Task 56b - the TV during GUESS: the drawing large and the 4 options (the
// countdown moved to the score column, Task 112). The correct index never reaches this payload at all (see
// buildGuessHostPayload) - every option renders identically until
// GUESS_REVEAL.
export function GuessView({ guess, progress, roomCode, paused, pausedByName }: GuessViewProps) {
  const guessedCount = progress?.guessedCount ?? guess.guessedCount;
  const totalGuessers = progress?.totalGuessers ?? guess.totalGuessers;

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
      <PapyrusPanel className="enter-pop" style={{ flex: '0 0 auto', justifyContent: 'center', padding: '1rem' }}>
        <div style={styles.drawingImageWrap}>
          <img src={guess.image} alt="" style={styles.drawingImage} data-testid="guess-drawing" />
        </div>
      </PapyrusPanel>
      <PapyrusPanel style={{ flex: '0 0 auto', padding: '1rem 1.5rem' }}>
        <div style={optionsGridStyle}>
          {guess.options.map((option, index) => (
            <div key={index} data-testid="guess-option" style={optionBoxStyle}>
              <span>{option}</span>
            </div>
          ))}
        </div>
      </PapyrusPanel>
      <div style={styles.answerCounter} data-testid="guess-progress">
        {guessedCount}/{totalGuessers} μάντεψαν
      </div>
    </GameLayout>
  );
}
