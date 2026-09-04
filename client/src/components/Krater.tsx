import { useLayoutEffect, useRef } from 'react';
import { densityScale, styles } from '../screens/host/hostStyles';

export interface TimerState {
  secondsLeft: number;
  // The full duration this countdown started from, so the wine level can be
  // rendered as a proportion (remaining/total) rather than an absolute
  // count. Set once at phase entry, alongside secondsLeft's own reset - a
  // pause/resume correction only ever touches secondsLeft, never this.
  totalSeconds: number;
  // Each phase decides its own "nearly out of time" threshold (QUESTION 5s,
  // DRAW 10s, STEAL 3s), so the phase computes this and the krater only
  // reads it - no threshold table needed here.
  critical: boolean;
}

// The one sanctioned raw hex on the host TV (see CLAUDE.md's colour rule) -
// urgency, not correctness, so it stays a literal rather than inventing a
// palette token nothing else would use. Carried over verbatim from the old
// countdown ring's .timer-critical rule (Task 162 moved it here so the CSS
// class itself no longer needs to hold it).
const KRATER_CRITICAL = '#ef4444';
const KRATER_CRITICAL_GLOW = 'rgba(239, 68, 68, 0.65)';

// Task 162 - the timer is a wine krater: the wine level IS the remaining
// time. Replaces the old countdown ring at the same mount point
// (PlayerScoresPanel, top of the score column) with the same props, so
// nothing else about the column moves - repositioning is Task 161's job.
//
// design/theatre-reference.html's .krater is the source: a bowl clipPath
// holding a wine rect scaled by scaleY(remaining/total) with a 1s linear
// transform transition, and the number below it. Animation is transform
// only (never height), and a phase's fresh full glass on entry must SNAP
// in rather than animate up from wherever the last phase's glass drained
// to - the same jump-cut-then-transition-on trick the reference's own JS
// uses (startTimer()), reproduced here by detecting an increase in
// secondsLeft between renders.
export function Krater({ timer, playerCount }: { timer: TimerState; playerCount: number }) {
  const s = densityScale(playerCount);
  const { secondsLeft, totalSeconds, critical } = timer;
  const ratio = totalSeconds > 0 ? Math.max(0, Math.min(1, secondsLeft / totalSeconds)) : 0;

  const wineRef = useRef<SVGRectElement>(null);
  const prevSecondsRef = useRef(secondsLeft);

  useLayoutEffect(() => {
    const el = wineRef.current;
    const prev = prevSecondsRef.current;
    prevSecondsRef.current = secondsLeft;
    if (!el) return;
    // A fresh phase's glass jumping up from wherever the last one drained
    // to (any increase of more than the odd resume-correction tick) snaps
    // in instantly; every other frame (the normal once-a-second decrement,
    // or the identical value a pause/resume replays) gets the transition.
    if (secondsLeft > prev + 1) {
      el.style.transition = 'none';
      el.style.transform = `scaleY(${ratio})`;
      void el.getBoundingClientRect();
      requestAnimationFrame(() => {
        el.style.transition = 'transform 1s linear';
      });
    }
  }, [secondsLeft, ratio]);

  return (
    <div
      style={{
        ...styles.kraterWrap,
        flex: '0 0 auto',
        alignSelf: 'center',
        marginBottom: `${(0.75 * s).toFixed(2)}rem`,
      }}
    >
      <svg
        viewBox="0 0 100 180"
        style={{ width: `${(3.0 * s).toFixed(2)}rem`, height: `${(5.6 * s).toFixed(2)}rem`, display: 'block' }}
      >
        <path d="M14 8 H86 L80 40 Q50 60 20 40 Z" fill="none" stroke="var(--marble)" strokeWidth={3} />
        <path d="M20 40 Q50 60 80 40 L74 120 Q50 132 26 120 Z" fill="none" stroke="var(--marble)" strokeWidth={3} />
        <clipPath id="krater-bowl">
          <path d="M21 41 Q50 60 79 41 L73 119 Q50 130 27 119 Z" />
        </clipPath>
        <g clipPath="url(#krater-bowl)">
          <rect
            ref={wineRef}
            x={0}
            y={0}
            width={100}
            height={132}
            fill="var(--wine)"
            style={{
              transformOrigin: '50% 100%',
              transform: `scaleY(${ratio})`,
              transition: 'transform 1s linear',
            }}
          />
          <rect x={0} y={0} width={100} height={132} fill="var(--wine-2)" opacity={0.25} />
        </g>
        <path d="M42 120 L58 120 L60 150 L40 150 Z" fill="var(--marble)" />
        <rect x={28} y={150} width={44} height={8} fill="var(--marble)" />
        <path d="M8 26 Q0 44 14 50 M92 26 Q100 44 86 50" fill="none" stroke="var(--marble)" strokeWidth={3} />
      </svg>
      <div
        className={critical ? 'timer-critical' : undefined}
        style={{
          ...styles.kraterNumber,
          fontSize: `${(2.0 * s).toFixed(2)}rem`,
          color: critical ? KRATER_CRITICAL : styles.kraterNumber.color,
          textShadow: critical ? `0 0 18px ${KRATER_CRITICAL_GLOW}` : undefined,
        }}
        data-testid="countdown"
      >
        {secondsLeft}
      </div>
    </div>
  );
}
