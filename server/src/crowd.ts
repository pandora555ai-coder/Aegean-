// Crowd mood (Task 35). Logic layer only - nothing plays yet, this just
// decides what the crowd is feeling and tells the host, which is where the
// audio will eventually live. Server-derived and HOST ONLY: the client never
// computes a mood itself, and phones never receive crowd:mood at all.
import { crowdIntensityFor, ServerEvents, type CrowdIntensityContext, type CrowdMood } from '@game/shared';
import { io } from './realtime.js';
import type { Room } from './state.js';
import {
  armSimpleTimer,
  clearSimpleTimer,
  pauseSimpleTimer,
  remainingActiveTimerMs,
  resumeSimpleTimer,
} from './timers.js';

// Sets the room's mood and tells the host, if one is attached. Always
// emits, even when the mood is unchanged - every phase transition is
// supposed to emit one (Task 35 acceptance criteria), and a re-affirmed
// 'calm' costs nothing.
export function setCrowdMood(room: Room, mood: CrowdMood): void {
  room.crowdMood = mood;
  if (room.hostSocketId) {
    io.to(room.hostSocketId).emit(ServerEvents.CROWD_MOOD, { mood });
  }
}

// Arms the mid-QUESTION switch into 'tension' for the last third of the
// timer - fires at 2/3 of questionTimeMs, i.e. exactly when a third of the
// time is left. Runs ALONGSIDE the room's normal QUESTION activeTimer, on
// its own SimpleTimer, so pausing the game has to freeze this one too (see
// pauseCrowdTensionTimer/resumeCrowdTensionTimer) - `paused` must never let
// the crowd's mood drift while nobody is playing.
export function armCrowdTensionTimer(room: Room, questionTimeMs: number): void {
  clearCrowdTensionTimer(room);
  const tensionAtMs = Math.floor((questionTimeMs * 2) / 3);
  room.crowdTensionTimer = armSimpleTimer(tensionAtMs, () => {
    room.crowdTensionTimer = null;
    setCrowdMood(room, 'tension');
  });
}

export function pauseCrowdTensionTimer(room: Room): void {
  pauseSimpleTimer(room.crowdTensionTimer);
}

// Re-arms with the SAME onFire closure shape as armCrowdTensionTimer, since
// resumeSimpleTimer needs a fresh callback every time (it isn't stored on
// the timer itself).
export function resumeCrowdTensionTimer(room: Room): void {
  resumeSimpleTimer(room.crowdTensionTimer, () => {
    room.crowdTensionTimer = null;
    setCrowdMood(room, 'tension');
  });
}

// Task 36b - crowd:intensity, a SECOND signal alongside crowd:mood above
// (that one is untouched). Host-only, same as every other crowd emit. `ctx`
// is stashed on the room so a pause/resume (see below) can recompute the
// exact same target without every caller having to remember its own ctx.
// `rampMsOverride`, when given, replaces the phase's own nominal rampMs -
// the ONE thing a resume needs different from a fresh phase entry.
export function emitCrowdIntensity(room: Room, ctx: CrowdIntensityContext = {}, rampMsOverride?: number): void {
  room.crowdIntensityCtx = ctx;
  if (!room.hostSocketId) {
    return;
  }
  const computed = crowdIntensityFor(room.phase, ctx);
  const payload =
    rampMsOverride === undefined ? computed : { value: computed.value, rampMs: rampMsOverride };
  io.to(room.hostSocketId).emit(ServerEvents.CROWD_INTENSITY, payload);
}

// Re-emits the CURRENT phase's target on resume, ramping over whatever time
// is actually left on the pause-aware timer rather than the phase's full
// nominal duration - and with no `from`, so the client ramps onward from
// wherever it was frozen instead of snapping back to the phase's opening
// value.
export function emitCrowdIntensityResume(room: Room): void {
  emitCrowdIntensity(room, room.crowdIntensityCtx ?? {}, remainingActiveTimerMs(room));
}

// Called whenever QUESTION ends (on time or early, once every connected
// player has answered) - the tension switch must never fire late, into
// REVEAL, and stomp the cheer/boo mood REVEAL is about to set.
export function clearCrowdTensionTimer(room: Room): void {
  clearSimpleTimer(room.crowdTensionTimer);
  room.crowdTensionTimer = null;
}
