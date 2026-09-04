import { useEffect, useRef, useState } from 'react';
import { SOCRATES_VOICE_DIR, lineHash, type CrowdIntensityPayload, type CrowdMood } from '@game/shared';
import { getStoredHostMuted, setStoredHostMuted } from '../hostAudioPreference';

// Task 36c - the crowd bed (Task 36a's generated set, client/public/crowd/):
// three loops crossfaded by crowd:intensity, plus four one-shots keyed off
// crowd:mood. This retires the whole synthesized cue set that used to live
// here (Task 20's tone motifs, the Task 18 countdown ticks) - see the git
// history for that set if it's ever needed again.
const CROWD_LOOP_NAMES = ['murmur', 'unrest', 'roar'] as const;
type CrowdLoopName = (typeof CROWD_LOOP_NAMES)[number];
const CROWD_ONE_SHOT_NAMES = ['cheer-small', 'cheer-big', 'boo-small', 'boo-big'] as const;
type CrowdOneShotName = (typeof CROWD_ONE_SHOT_NAMES)[number];

// The bed's own master gain, BEFORE the mute-gated output gain - a fixed mix
// level for the loops relative to a one-shot or a Socrates line, not a mute.
const CROWD_BED_GAIN = 0.6;
// One-shots never go quieter than this even at the calmest intensity - per
// spec, a cheer/boo should still read as an event, not vanish into the bed.
const ONE_SHOT_MIN_GAIN = 0.3;
// How long the mute toggle takes to ramp - short enough to feel immediate,
// long enough not to click.
const MUTE_RAMP_SEC = 0.05;
// The intensity assumed before the first crowd:intensity event of a game -
// matches the server's own LOBBY value (crowdIntensityFor in shared), so a
// one-shot that could theoretically fire before any ramp lands still picks
// a sane (small) variant.
const DEFAULT_CROWD_INTENSITY = 0.1;

// Equal-power crossfade across two adjacent zones of a 3-point ramp (murmur
// -> unrest -> roar) - identical math to the /dev/crowd reference mixer
// (DevCrowdScreen's zoneGains): `t` is the local position within the active
// zone, 0..1, and cos/sin (not a linear ramp) keeps perceived loudness
// constant through the crossfade.
function crowdZoneGains(intensity: number): Record<CrowdLoopName, number> {
  const clamped = Math.min(1, Math.max(0, intensity));
  if (clamped <= 0.5) {
    const t = clamped / 0.5;
    const angle = t * (Math.PI / 2);
    return { murmur: Math.cos(angle), unrest: Math.sin(angle), roar: 0 };
  }
  const t = (clamped - 0.5) / 0.5;
  const angle = t * (Math.PI / 2);
  return { murmur: 0, unrest: Math.cos(angle), roar: Math.sin(angle) };
}

export function useGameAudio() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  // Task 36c - the ONE mute-gated node every audible thing (crowd AND
  // Socrates) connects through instead of ctx.destination directly, so the
  // host mute toggle silences both together with one live gain ramp rather
  // than two separate ad-hoc checks. Created alongside the AudioContext
  // itself in getAudioCtx, never elsewhere.
  const outputGainRef = useRef<GainNode | null>(null);
  // Decoded Socrates line audio (Task 42b), keyed by lineHash - a game only
  // ever plays each pool line at most once (recordRoundAndPickLine never
  // repeats one), so this mostly saves nothing within a single game, but
  // costs nothing either and means a re-shown line (state:sync) never
  // re-fetches. Tied to this hook instance, not module scope: an AudioBuffer
  // is meaningless once its AudioContext is gone.
  const socratesBufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  // Task 36c - the crowd bed/one-shot buffers, decoded (not just HTTP-cache
  // warmed like the 254 Socrates mp3s - there are only 7 of these, and they
  // loop/replay all game, so decoding once is worth the memory).
  const crowdBuffersRef = useRef<Partial<Record<CrowdLoopName | CrowdOneShotName, AudioBuffer>>>({});
  const crowdLoopGainsRef = useRef<Record<CrowdLoopName, GainNode> | null>(null);
  // The last crowd:intensity TARGET value (not a live-sampled AudioParam
  // read) - good enough for "is this a small or big one-shot", since mood
  // and intensity land within the same server-side moment (see phases.ts).
  const crowdIntensityRef = useRef(DEFAULT_CROWD_INTENSITY);
  // StrictMode-safe guards, same pattern as prefetchStartedRef below: decode
  // must happen at most once, and the loops must start at most once, however
  // many times the effects that trigger them re-run.
  const crowdLoadStartedRef = useRef(false);
  const crowdLoopsStartedRef = useRef(false);
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

  // Task 36c - the crowd bed keeps humming through a pause in every OTHER
  // phase (suspendAudio above stays SOCRATES-scoped), so pausing it means
  // freezing its RAMP, not stopping the audio: cancel whatever's scheduled
  // and hold each loop's gain at wherever it currently sits. The server
  // re-emits crowd:intensity on resume (Task 36b's emitCrowdIntensityResume)
  // with the real remaining rampMs, so nothing here has to remember to
  // restart anything.
  function holdCrowdIntensity() {
    const ctx = audioCtxRef.current;
    const loopGains = crowdLoopGainsRef.current;
    if (!ctx || !loopGains) {
      return;
    }
    const now = ctx.currentTime;
    for (const name of CROWD_LOOP_NAMES) {
      const param = loopGains[name].gain;
      const value = param.value;
      param.cancelScheduledValues(now);
      param.setValueAtTime(value, now);
    }
  }

  function toggleMuted() {
    // A plain value read from this render's closure, not a setState
    // functional updater - the same StrictMode double-invoke trap that
    // doubled the Task 18 countdown ticks applies to ANY side effect
    // (localStorage write included) placed inside one.
    const next = !muted;
    setStoredHostMuted(next);
    setMuted(next);
    // Task 36c - the single mechanism that mutes crowd AND Socrates
    // together: a short live ramp on the shared output gain, not a stop/
    // restart of anything already playing.
    const ctx = audioCtxRef.current;
    const output = outputGainRef.current;
    if (ctx && output) {
      const now = ctx.currentTime;
      output.gain.cancelScheduledValues(now);
      output.gain.setValueAtTime(output.gain.value, now);
      output.gain.linearRampToValueAtTime(next ? 0 : 1, now + MUTE_RAMP_SEC);
    }
  }

  // The ONE place that constructs an AudioContext - reads/writes
  // audioCtxRef directly so a second call (e.g. a StrictMode double-invoke
  // of whatever triggered it) is a no-op and returns the SAME instance
  // instead of leaking a second context. Also creates the shared output
  // gain (Task 36c) in lockstep, so the two refs never drift apart.
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
      const ctx = new AudioContextCtor();
      const output = ctx.createGain();
      output.gain.value = mutedRef.current ? 0 : 1;
      output.connect(ctx.destination);
      audioCtxRef.current = ctx;
      outputGainRef.current = output;
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

  // Task 36c - decodes the 7 crowd files. Called on LOBBY entry (every one,
  // first game included - see HostScreen's effect mirroring the Task 154
  // voice-line prefetch's [roomCode, phase] trigger), well after
  // getAudioCtx() has already run from the "Create Room" click that produced
  // roomCode. Starts the three loops the moment decoding finishes, which
  // (per spec) IS "the first host gesture" in practice.
  async function loadCrowdSounds(): Promise<void> {
    if (crowdLoadStartedRef.current) {
      return;
    }
    crowdLoadStartedRef.current = true;
    const ctx = getAudioCtx();
    if (!ctx) {
      return;
    }
    const names = [...CROWD_LOOP_NAMES, ...CROWD_ONE_SHOT_NAMES];
    await Promise.all(
      names.map(async (name) => {
        try {
          const res = await fetch(`/crowd/${name}.ogg`);
          if (!res.ok) {
            return;
          }
          const arrayBuffer = await res.arrayBuffer();
          crowdBuffersRef.current[name] = await ctx.decodeAudioData(arrayBuffer);
        } catch {
          // Best effort - a missing/undecodable file just stays silent.
        }
      }),
    );
    startCrowdLoops();
  }

  // Starts murmur/unrest/roar together, at whatever intensity is already
  // known (or the LOBBY default), and never stops them again for the life
  // of this hook instance.
  function startCrowdLoops(): void {
    if (crowdLoopsStartedRef.current) {
      return;
    }
    const ctx = audioCtxRef.current;
    const output = outputGainRef.current;
    if (!ctx || !output) {
      return;
    }
    crowdLoopsStartedRef.current = true;

    const bedGain = ctx.createGain();
    bedGain.gain.value = CROWD_BED_GAIN;
    bedGain.connect(output);

    const zoneGains = crowdZoneGains(crowdIntensityRef.current);
    const loopGains = {} as Record<CrowdLoopName, GainNode>;
    for (const name of CROWD_LOOP_NAMES) {
      const gainNode = ctx.createGain();
      gainNode.gain.value = zoneGains[name];
      gainNode.connect(bedGain);
      loopGains[name] = gainNode;
      const buffer = crowdBuffersRef.current[name];
      if (buffer) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(gainNode);
        source.start();
      }
    }
    crowdLoopGainsRef.current = loopGains;
  }

  // Task 36c - crowd:intensity's ramp. `from` (if given) SNAPS the loop
  // gains there first (a fresh phase entry's opening value); with no `from`,
  // the ramp continues from wherever each gain node currently sits (a
  // pause's held value, or mid-ramp). Either way the actual move to `value`
  // is a scheduled AudioParam ramp over rampMs, never a JS timer stepping
  // the gain by hand.
  function applyCrowdIntensity(payload: CrowdIntensityPayload): void {
    crowdIntensityRef.current = payload.value;
    const ctx = audioCtxRef.current;
    const loopGains = crowdLoopGainsRef.current;
    if (!ctx || !loopGains) {
      return;
    }
    const now = ctx.currentTime;
    const targetGains = crowdZoneGains(payload.value);
    const fromGains = payload.from !== undefined ? crowdZoneGains(payload.from) : null;
    for (const name of CROWD_LOOP_NAMES) {
      const param = loopGains[name].gain;
      param.cancelScheduledValues(now);
      if (fromGains) {
        param.setValueAtTime(fromGains[name], now);
      } else {
        param.setValueAtTime(param.value, now);
      }
      param.linearRampToValueAtTime(targetGains[name], now + payload.rampMs / 1000);
    }
  }

  // Task 36c - the four one-shots, keyed off crowd:mood. calm/tension play
  // nothing (per spec); cheer/boo pick small vs big off the last known
  // intensity and play at gain max(intensity, ONE_SHOT_MIN_GAIN), layered
  // over the bed through the same shared output gain (never touching the
  // bed's own gain nodes - this is a separate, one-shot GainNode per play).
  function playCrowdOneShot(mood: CrowdMood): void {
    if (mood !== 'cheer' && mood !== 'boo') {
      return;
    }
    const ctx = audioCtxRef.current;
    const output = outputGainRef.current;
    if (!ctx || !output || mutedRef.current) {
      return;
    }
    const intensity = crowdIntensityRef.current;
    const size = intensity < 0.5 ? 'small' : 'big';
    const name = `${mood}-${size}` as CrowdOneShotName;
    const buffer = crowdBuffersRef.current[name];
    if (!buffer) {
      return;
    }
    try {
      const gainNode = ctx.createGain();
      gainNode.gain.value = Math.max(intensity, ONE_SHOT_MIN_GAIN);
      gainNode.connect(output);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gainNode);
      source.start();
    } catch {
      // Best effort - the game continues silently either way.
    }
  }

  // Task 42b - Socrates' voice lines. Plays a real audio FILE (unlike the
  // crowd bed's OGGs, this one always was a file) through the same single
  // AudioContext, via a BufferSource - the only way Web Audio plays a
  // decoded file. `template` is the line's raw, un-substituted pool entry
  // (SocratesShowPayload.lineTemplate) and `tag` is its optional eleven_v3
  // voice tag (SocratesShowPayload.lineTag, Task 43); hashing the pair is
  // exactly how dev/generate-voice-lines.ts named the file, so this is the
  // one lookup that can never drift from the generator (lineHash lives in
  // shared).
  // Fails silently at every step - fetch 404, decode error, no
  // AudioContext - the line's TEXT is already on screen regardless, and per
  // spec a missing file must never break the phase.
  //
  // Task 42c: `onEnded` fires ONLY when this clip genuinely finishes playing
  // (source.onended, which - because suspending the ONE AudioContext is how
  // pause freezes it - only ever fires once total real playback time has
  // elapsed, pause included). It does NOT fire for any failure path below
  // (muted, missing file, decode error): there's nothing playing to finish,
  // so the caller's server-side fallback timer is what ends the phase
  // instead. The caller (HostScreen) uses this to tell the server the beat
  // is really over, rather than the server guessing a fixed duration up
  // front and risking ending the phase mid-clip.
  async function playSocratesLine(template: string, tag: string | null, onEnded: () => void) {
    const ctx = audioCtxRef.current;
    if (!ctx || mutedRef.current) {
      return;
    }
    try {
      const hash = lineHash(template, tag);
      let buffer = socratesBufferCacheRef.current.get(hash);
      if (!buffer) {
        const res = await fetch(`/${SOCRATES_VOICE_DIR}/${hash}.mp3`);
        if (!res.ok) {
          onEnded(); // Task 154 - a missing clip ends the beat now, not at the backstop
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
      source.onended = onEnded;
      // Task 36c - through the shared output gain, not ctx.destination
      // directly, so the one mute toggle covers this too.
      source.connect(outputGainRef.current ?? ctx.destination);
      source.start();
    } catch {
      // Task 154 - a fetch/decode/start failure used to leave the phase
      // sitting silent until the server's SOCRATES_MAX_DURATION_MS backstop
      // (observed: 11010ms on a 404). A room reads 11 silent seconds as
      // "broken", so a dead clip now ends the beat immediately instead.
      onEnded();
    }
  }

  // Task 154 - warms the browser's HTTP cache with every active Socrates
  // clip (the host asks the server for the hash list on entering LOBBY) so
  // the first play of any line is a cache hit instead of a network fetch
  // racing that same backstop - the longest clip is 10919ms, 81ms under it.
  // Bytes are read and DROPPED, never decoded: 254 decoded AudioBuffers is
  // too much memory for a TV browser, so playSocratesLine still decodes on
  // demand. Low priority, four in flight, once per hook instance.
  const prefetchStartedRef = useRef(false);
  function prefetchSocratesLines(hashes: readonly string[]): void {
    if (prefetchStartedRef.current) {
      return;
    }
    prefetchStartedRef.current = true;
    const queue = [...hashes];
    async function worker() {
      for (let hash = queue.shift(); hash !== undefined; hash = queue.shift()) {
        try {
          const res = await fetch(`/${SOCRATES_VOICE_DIR}/${hash}.mp3`, { priority: 'low' });
          if (res.ok) {
            await res.arrayBuffer();
          }
        } catch {
          // Best effort - playSocratesLine fetches on demand regardless.
        }
      }
    }
    void Promise.all(Array.from({ length: 4 }, worker));
  }

  return {
    muted,
    toggleMuted,
    startKeepAliveAudio,
    suspendAudio,
    resumeAudio,
    loadCrowdSounds,
    applyCrowdIntensity,
    playCrowdOneShot,
    holdCrowdIntensity,
    playSocratesLine,
    prefetchSocratesLines,
  };
}
