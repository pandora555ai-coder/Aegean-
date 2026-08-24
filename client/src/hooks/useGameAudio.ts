import { useEffect, useRef, useState } from 'react';
import { SOCRATES_VOICE_DIR, lineHash } from '@game/shared';
import { getStoredHostMuted, setStoredHostMuted } from '../hostAudioPreference';

// One consistent key across every audio cue (Task 20) - A major pentatonic
// (A, B, C#, E, F#) - so the whole set reads as one game, not seven
// unrelated beeps. The Task 18 countdown tick (880Hz) and expiry tone
// (220Hz) are BOTH already "A" in different octaves (A5, A3) and stay
// unchanged; every new cue below was picked from the same five-note family.
const NOTE = {
  A3: 220.0,
  A4: 440.0,
  B4: 493.88,
  CS5: 554.37,
  E5: 659.25,
  FS5: 739.99,
  A5: 880.0,
  B5: 987.77,
  CS6: 1108.73,
  E6: 1318.51,
  FS6: 1479.98,
  A6: 1760.0,
} as const;

// Answer-received blips climb this scale with the running answered-count
// (1st answer = lowest note, 8th = highest) - up to MAX_PLAYERS entries.
const ANSWER_BLIP_SCALE = [NOTE.E5, NOTE.FS5, NOTE.A5, NOTE.B5, NOTE.CS6, NOTE.E6, NOTE.FS6, NOTE.A6];

export function useGameAudio() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  // Decoded Socrates line audio (Task 42b), keyed by lineHash - a game only
  // ever plays each pool line at most once (recordRoundAndPickLine never
  // repeats one), so this mostly saves nothing within a single game, but
  // costs nothing either and means a re-shown line (state:sync) never
  // re-fetches. Tied to this hook instance, not module scope: an AudioBuffer
  // is meaningless once its AudioContext is gone.
  const socratesBufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  // Host-only mute toggle (Task 20) - LOBBY UI only, but every cue everywhere
  // (including the Task 18 countdown ticks) checks this before playing.
  const [muted, setMuted] = useState(() => getStoredHostMuted());
  // Mirrors `muted` for the SAME reason as phaseRef/secondsLeftRef in
  // HostScreen - every cue-playing call site lives inside a handler
  // registered once (empty-dependency-array useEffect) or a setInterval
  // callback, neither of which would otherwise see a toggle flipped after
  // they were created.
  const mutedRef = useRef(muted);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // Silent Web Audio keep-alive - best effort suppression of the TV's own
  // screensaver/idle detection, which (unlike the Wake Lock API) many smart
  // TV browsers respect for "still doing something" heuristics. Deliberately
  // no audio ASSET: the loop is generated entirely in code.
  useEffect(() => {
    return () => {
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, []);

  // AudioContexts get suspended when backgrounded - best effort retry once
  // the page is visible again.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        audioCtxRef.current?.resume().catch(() => {});
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Task 42b - freezes/unfreezes whatever's actually sounding (a Socrates
  // line, mid-playback) in step with the game pausing, the same way the
  // shared server timer freezes the phase itself. Suspending the ONE
  // AudioContext is the only way to do this for an AudioBufferSourceNode -
  // unlike an <audio> element, it has no pause(), only start/stop.
  function suspendAudio() {
    audioCtxRef.current?.suspend().catch(() => {});
  }

  function resumeAudio() {
    // Unconditional, like the visibilitychange resume above - the CONTEXT
    // running and the host being muted are independent: every play*
    // function already gates on mutedRef itself, so leaving the context
    // suspended here whenever muted would just permanently silence
    // everything (including a later un-mute) after one pause/resume cycle.
    audioCtxRef.current?.resume().catch(() => {});
  }

  function toggleMuted() {
    // A plain value read from this render's closure, not a setState
    // functional updater - the same StrictMode double-invoke trap that
    // doubled the Task 18 countdown ticks applies to ANY side effect
    // (localStorage write included) placed inside one.
    const next = !muted;
    setStoredHostMuted(next);
    setMuted(next);
  }

  // The ONE place that constructs an AudioContext - reads/writes
  // audioCtxRef directly so a second call (e.g. a StrictMode double-invoke
  // of whatever triggered it) is a no-op and returns the SAME instance
  // instead of leaking a second context.
  function getAudioCtx(): AudioContext | null {
    if (audioCtxRef.current) {
      return audioCtxRef.current;
    }
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return null; // unsupported - fail silently, this is best-effort only
    }
    try {
      audioCtxRef.current = new AudioContextCtor();
    } catch {
      return null; // AudioContext unavailable or blocked. Continue without it.
    }
    return audioCtxRef.current;
  }

  function startKeepAliveAudio() {
    const alreadyRunning = !!audioCtxRef.current;
    const ctx = getAudioCtx();
    if (!ctx || alreadyRunning) {
      return;
    }
    try {
      const gain = ctx.createGain();
      // NOT exactly 0 - some platforms treat true silence as "not playing"
      // and suspend/drop the context anyway, defeating the whole point.
      gain.gain.value = 0.0001;
      gain.connect(ctx.destination);
      const oscillator = ctx.createOscillator();
      oscillator.connect(gain);
      oscillator.start();
    } catch {
      // Best effort - AudioContext unavailable or blocked. Continue without it.
    }
  }

  // Countdown sounds - REUSE the keep-alive AudioContext from above rather
  // than creating a second one; a brand-new oscillator+gain per beep is
  // cheap and routine for the Web Audio API, only the AudioContext itself
  // is the thing worth not duplicating. UNCHANGED since Task 18 (frequency,
  // duration, envelope) other than the mute gate, which every cue in this
  // file needs - this is the one function both the old ticks/expire tone
  // and (indirectly, see playToneAt below) every new Task 20 cue funnel
  // audio-hardware access through.
  function playTone(frequency: number, durationMs: number) {
    const ctx = audioCtxRef.current;
    if (!ctx || mutedRef.current) {
      return; // no context, or the host muted everything - silently skip
    }
    try {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      // Clearly audible but not harsh, and ramped out (not cut off) so it
      // doesn't click.
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now);
      oscillator.stop(now + durationMs / 1000);
    } catch {
      // Best effort - the game continues silently either way.
    }
  }

  function playCountdownTick() {
    playTone(880, 80); // short, high tick for each of the last 5 seconds
  }

  function playCountdownExpire() {
    playTone(220, 160); // lower and slightly longer - clearly distinct "time's up"
  }

  // Low-level primitive for every OTHER cue (Task 20) - motifs and chords
  // need several notes scheduled relative to one another, which a single
  // immediate-start playTone() call can't express. `delaySec` schedules
  // the note ahead on the SAME AudioContext clock (ctx.currentTime read
  // once per call, same pattern as playTone), so a whole motif built from
  // several playToneAt calls in a row stays perfectly in time with itself
  // regardless of how long the calling function takes to run. Same mute/
  // missing-context guard and try/catch as playTone.
  function playToneAt(frequency: number, delaySec: number, durationMs: number, peakGain: number) {
    const ctx = audioCtxRef.current;
    if (!ctx || mutedRef.current) {
      return;
    }
    try {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      const startAt = ctx.currentTime + delaySec;
      const endAt = startAt + durationMs / 1000;
      // A short attack (not an instant jump to peakGain like playTone's
      // single notes use) avoids a click when several of these overlap to
      // form a chord.
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(peakGain, startAt + Math.min(0.015, durationMs / 4000));
      gain.gain.setValueAtTime(peakGain, Math.max(startAt, endAt - 0.02));
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(startAt);
      oscillator.stop(endAt + 0.02);
    } catch {
      // Best effort - the game continues silently either way.
    }
  }

  // Task 42b - Socrates' voice lines. Plays a real audio FILE (unlike every
  // other cue here, which is synthesized) through the same single
  // AudioContext, via a BufferSource - the only way Web Audio plays a
  // decoded file. `template` is the line's raw, un-substituted pool entry
  // (SocratesShowPayload.lineTemplate); hashing it is exactly how
  // dev/generate-voice-lines.ts named the file, so this is the one lookup
  // that can never drift from the generator (lineHash lives in shared).
  // Fails silently at every step - fetch 404, decode error, no
  // AudioContext - the line's TEXT is already on screen regardless, and per
  // spec a missing file must never break the phase.
  async function playSocratesLine(template: string) {
    const ctx = audioCtxRef.current;
    if (!ctx || mutedRef.current) {
      return;
    }
    try {
      const hash = lineHash(template);
      let buffer = socratesBufferCacheRef.current.get(hash);
      if (!buffer) {
        const res = await fetch(`/${SOCRATES_VOICE_DIR}/${hash}.mp3`);
        if (!res.ok) {
          return;
        }
        const arrayBuffer = await res.arrayBuffer();
        buffer = await ctx.decodeAudioData(arrayBuffer);
        socratesBufferCacheRef.current.set(hash, buffer);
      }
      // The context (or the mute toggle) may have changed while the fetch/
      // decode above was in flight - re-check before actually sounding it.
      if (audioCtxRef.current !== ctx || mutedRef.current) {
        return;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start();
    } catch {
      // Best effort - the game continues silently either way.
    }
  }

  // CUE 1 - QUESTION START, the most important cue: a rising 3-note motif
  // through the scale, ~450ms total, clearly "look at the TV now". Fires
  // once per LIVE question:show - never on a state:sync reconnect catching a
  // host up to a question already in progress, which would be a false "new
  // question" cue.
  function playQuestionStartCue() {
    playToneAt(NOTE.A4, 0, 140, 0.22);
    playToneAt(NOTE.CS5, 0.13, 140, 0.22);
    playToneAt(NOTE.FS5, 0.26, 190, 0.24);
  }

  // CUE 2 - ANSWER RECEIVED: very short and quiet (peakGain 0.08, well
  // under every other cue's 0.14-0.24) so 7 of these in a row read as a
  // light patter, not noise. Rises with the running answered-count.
  function playAnswerBlip(answeredCount: number) {
    const index = Math.min(Math.max(answeredCount, 1), ANSWER_BLIP_SCALE.length) - 1;
    playToneAt(ANSWER_BLIP_SCALE[index], 0, 55, 0.08);
  }

  // CUE 5 - REVEAL: an A-major triad struck together - a CHORD, not a
  // single tone, so it's unmistakably distinct in texture from the low
  // single-tone expiry cue it often lands right after.
  function playRevealCue() {
    playToneAt(NOTE.A4, 0, 380, 0.14);
    playToneAt(NOTE.CS5, 0, 380, 0.12);
    playToneAt(NOTE.E5, 0, 380, 0.12);
  }

  // CUE 7 - GAME OVER: the one cue allowed to be long (~1s) - an ascending
  // 4-note flourish resolving into a held 3-note chord, clearly a finale.
  function playGameOverFanfare() {
    playToneAt(NOTE.A4, 0, 130, 0.2);
    playToneAt(NOTE.CS5, 0.12, 130, 0.2);
    playToneAt(NOTE.E5, 0.24, 130, 0.2);
    playToneAt(NOTE.FS5, 0.36, 150, 0.22);
    playToneAt(NOTE.A5, 0.5, 480, 0.2);
    playToneAt(NOTE.CS6, 0.5, 480, 0.16);
    playToneAt(NOTE.E6, 0.5, 480, 0.14);
  }

  return {
    muted,
    toggleMuted,
    startKeepAliveAudio,
    suspendAudio,
    resumeAudio,
    playQuestionStartCue,
    playAnswerBlip,
    playCountdownTick,
    playCountdownExpire,
    playRevealCue,
    playGameOverFanfare,
    playSocratesLine,
  };
}
