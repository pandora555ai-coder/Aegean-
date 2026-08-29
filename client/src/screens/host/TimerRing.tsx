import { densityScale, styles } from './hostStyles';

export interface TimerState {
  secondsLeft: number;
  // Each phase decides its own "nearly out of time" threshold (QUESTION 5s,
  // DRAW 10s, STEAL 3s), so the phase computes this and the ring only draws
  // it - no threshold table needed here.
  critical: boolean;
}

// Task 112 - the countdown, moved out of the top of the scene (real sets
// cropped it: there was a --tv-safe-bottom but no top equivalent) and into
// the score column, which had room to spare. It is still the live remaining
// time, not decoration. Sized by player count like everything else in the
// column so it never squeezes the rows below it at 8 players.
export function TimerRing({ timer, playerCount }: { timer: TimerState; playerCount: number }) {
  const s = densityScale(playerCount);
  return (
    <div
      className={timer.critical ? 'timer-ring timer-ring-critical' : 'timer-ring'}
      style={{
        ...styles.timerRingWrap,
        width: `${(5.5 * s).toFixed(2)}rem`,
        height: `${(5.5 * s).toFixed(2)}rem`,
        flex: '0 0 auto',
        alignSelf: 'center',
        marginBottom: `${(0.75 * s).toFixed(2)}rem`,
      }}
    >
      <div
        className={timer.critical ? 'timer-critical' : undefined}
        style={{ ...styles.timer, fontSize: `${(2.4 * s).toFixed(2)}rem` }}
        data-testid="countdown"
      >
        {timer.secondsLeft}
      </div>
    </div>
  );
}
