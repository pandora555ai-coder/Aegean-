import type { CSSProperties } from 'react';
import { REVEAL_DURATION_MS, type ClimbRevealHostPayload, type RoomCode } from '@game/shared';
import { CheckMark } from '../../components/CheckMark';
import { MarbleSlab } from '../../components/MarbleSlab';
import { AnavasisChrome } from '../../components/AnavasisScene';
import { styles } from './hostStyles';

interface ClimbRevealViewProps {
  climbReveal: ClimbRevealHostPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  revealSecondsLeft: number;
}

const SLAB_WRAP_STYLE: CSSProperties = { position: 'fixed', left: '16%', top: '9%', width: '52%', zIndex: 1 };

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '1.6cqh',
  fontSize: '3.2cqh',
  fontWeight: 800,
  color: 'var(--carve)',
};

const progressBarTrackStyle: CSSProperties = {
  width: '100%',
  height: '0.4rem',
  borderRadius: '999px',
  background: 'var(--marble)',
  overflow: 'hidden',
  marginTop: '1rem',
};

const noteStyle: CSSProperties = {
  textAlign: 'center',
  fontSize: '1.7cqh',
  fontWeight: 700,
  color: 'var(--carve)',
  marginTop: '0.6rem',
};

// Task 189 - the climb's reveal beat: same check-mark-carries-correctness
// row TrialRevealView uses (CheckMark, --carve), plus a one-line note when
// this reveal is about to send two climbers into the duel - the reference's
// own tietop() line. The steps/deltas themselves are read off the climbers
// on the stair (AnavasisClimbers, mounted at the HostScreen level), never
// repeated here.
export function ClimbRevealView({ climbReveal, roomCode, paused, pausedByName, revealSecondsLeft }: ClimbRevealViewProps) {
  return (
    <>
      <AnavasisChrome roomCode={roomCode} paused={paused} pausedByName={pausedByName} />
      <div style={SLAB_WRAP_STYLE} key={climbReveal.roundIndex} className="screen-fade-in">
        <MarbleSlab className="enter-pop" data-testid="climb-reveal-slab">
          <div style={{ width: '100%' }}>
            <div className="correct-pop" style={rowStyle} data-testid="climb-correct-answer">
              <CheckMark visible />
              <span>{climbReveal.correctOption}</span>
            </div>
            {climbReveal.duelistIds && (
              <div style={noteStyle} data-testid="climb-duel-announce">
                Δύο φτάσατε μαζί στον ναό. Η γνώση δεν σας χώρισε — τα όπλα θα το κάνουν.
              </div>
            )}
            {!climbReveal.duelistIds && climbReveal.winnerName && (
              <div style={noteStyle} data-testid="climb-winner-announce">
                {climbReveal.winnerName} έφτασε πρώτος/η στον ναό.
              </div>
            )}
            <div style={progressBarTrackStyle} data-testid="climb-reveal-progress">
              <div
                style={{
                  ...styles.progressBarFill,
                  width: `${(revealSecondsLeft / Math.ceil(REVEAL_DURATION_MS / 1000)) * 100}%`,
                }}
              />
            </div>
          </div>
        </MarbleSlab>
      </div>
    </>
  );
}
