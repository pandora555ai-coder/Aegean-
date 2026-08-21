// The ONE shared timer mechanism behind the question timer, the REVEAL
// auto-advance, and the SCOREBOARD auto-advance - previously three ad-hoc
// setTimeout fields. Whichever phase-advancing timer is currently running
// (at most one at a time - a room is only ever in one phase) lives here.
export interface ActiveTimer {
  // STEAL runs TWO of these back to back: 'STEAL' while the thief is picking,
  // then 'STEAL_ANNOUNCE' for the beat the TV spends announcing the result.
  kind: 'POWER_UP' | 'QUESTION' | 'REVEAL' | 'STEAL' | 'STEAL_ANNOUNCE' | 'SCOREBOARD';
  handle: NodeJS.Timeout | null;
  startedAt: number;
  durationMs: number;
  // Set only while paused: how much of `durationMs` was left when
  // pauseActiveTimer() froze it. null whenever the timer is actually
  // running (including right after a fresh arm).
  remainingAtPause: number | null;
}

// A structural type (not the full Room) so this module never has to import
// from state.ts - it only ever touches the one field it cares about, which
// keeps this a true leaf with zero internal imports.
interface TimedRoom {
  activeTimer: ActiveTimer | null;
}

// Arms a fresh timer for `kind`, replacing whatever was active before (its
// handle is cleared first, if any) - the ONE place any phase-advance timer
// gets created, whether that's a brand-new phase starting or (via
// resumeActiveTimer) a paused one picking back up.
export function armActiveTimer(
  room: TimedRoom,
  kind: ActiveTimer['kind'],
  durationMs: number,
  onFire: () => void,
): void {
  if (room.activeTimer?.handle) {
    clearTimeout(room.activeTimer.handle);
  }
  room.activeTimer = {
    kind,
    handle: setTimeout(onFire, durationMs),
    startedAt: Date.now(),
    durationMs,
    remainingAtPause: null,
  };
}

// Freezes the active timer without discarding it: clears the underlying
// setTimeout and records exactly how much time was left, clamped at >= 0.
// A no-op if there's no active timer.
export function pauseActiveTimer(room: TimedRoom): void {
  const timer = room.activeTimer;
  if (!timer) {
    return;
  }
  if (timer.handle) {
    clearTimeout(timer.handle);
    timer.handle = null;
  }
  const elapsed = Date.now() - timer.startedAt;
  timer.remainingAtPause = Math.max(0, timer.durationMs - elapsed);
}

// Resumes a frozen timer for EXACTLY its remaining time - never the full
// original duration. `onFire` must be the continuation appropriate for the
// timer's `kind` (endQuestion / advanceFromReveal / advanceFromScoreboard)
// - the caller picks it, since those live in index.ts and reach into `io`.
// A no-op if there's no timer, or it isn't actually paused.
export function resumeActiveTimer(room: TimedRoom, onFire: () => void): void {
  const timer = room.activeTimer;
  if (!timer || timer.remainingAtPause === null) {
    return;
  }
  const remaining = timer.remainingAtPause;
  timer.startedAt = Date.now();
  timer.durationMs = remaining;
  timer.remainingAtPause = null;
  timer.handle = setTimeout(onFire, remaining);
}

// How much time is left on the active timer RIGHT NOW - the frozen value
// while paused, or a live countdown against the server clock otherwise.
// The ONE source of truth for every remainingMs/autoAdvanceMs a client
// ever sees, replacing three separate ad-hoc computations (one each for
// QUESTION/REVEAL/SCOREBOARD).
export function remainingActiveTimerMs(room: TimedRoom): number {
  const timer = room.activeTimer;
  if (!timer) {
    return 0;
  }
  if (timer.remainingAtPause !== null) {
    return timer.remainingAtPause;
  }
  return Math.max(0, timer.durationMs - (Date.now() - timer.startedAt));
}

export function clearActiveTimer(room: TimedRoom): void {
  if (room.activeTimer?.handle) {
    clearTimeout(room.activeTimer.handle);
  }
  room.activeTimer = null;
}
