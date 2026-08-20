import { useEffect, useRef, useState } from 'react';
import {
  ClientEvents,
  DEFAULT_ROOM_SETTINGS,
  ServerEvents,
  isQuestionShowHostPayload,
  isRevealHostPayload,
  type AnswerProgressPayload,
  type GameOverPayload,
  type GamePhase,
  type LobbyUpdatePayload,
  type PausedPayload,
  type PhaseChangedPayload,
  type QuestionShowHostPayload,
  type QuestionShowPayload,
  type ResumedPayload,
  type RevealHostPayload,
  type RevealShowPayload,
  type RoomCode,
  type RoomCreatedPayload,
  type RoomSettings,
  type ScoreboardPayload,
  type ServerErrorPayload,
  type SettingsUpdatedPayload,
  type StateSyncPayload,
} from '@game/shared';
import QRCode from 'qrcode';
import { socket } from '../socket';
import { useSocketConnection } from '../useSocketConnection';
import { clearStoredHostRoomCode, getStoredHostRoomCode, setStoredHostRoomCode } from '../hostRoomCode';
import { getStoredHostMuted, setStoredHostMuted } from '../hostAudioPreference';
import { QR_SIZE_PX } from './host/hostStyles';
import { LobbyView } from './host/LobbyView';
import { QuestionView } from './host/QuestionView';
import { RevealView } from './host/RevealView';
import { ScoreboardView } from './host/ScoreboardView';
import { GameOverView } from './host/GameOverView';

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

export default function HostScreen() {
  const { connected } = useSocketConnection();
  const [roomCode, setRoomCode] = useState<RoomCode | null>(null);
  const [lobby, setLobby] = useState<LobbyUpdatePayload | null>(null);
  const [phase, setPhase] = useState<GamePhase>('LOBBY');
  const [question, setQuestion] = useState<QuestionShowHostPayload | null>(null);
  const [answerProgress, setAnswerProgress] = useState<AnswerProgressPayload | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(DEFAULT_ROOM_SETTINGS.questionTimeMs / 1000));
  const [roomSettings, setRoomSettings] = useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);
  const [reveal, setReveal] = useState<RevealHostPayload | null>(null);
  const [scoreboard, setScoreboard] = useState<ScoreboardPayload | null>(null);
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null);
  const [revealSecondsLeft, setRevealSecondsLeft] = useState(0);
  const [scoreboardSecondsLeft, setScoreboardSecondsLeft] = useState(0);
  const [wakeLockFailed, setWakeLockFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pausedByName, setPausedByName] = useState<string | null>(null);
  // A one-time dismissible hint, not tied to server state - purely local
  // UI. Both Samsung and LG TVs sleep mid-game regardless of Wake Lock
  // succeeding; the only real fix is a one-time TV setting.
  const [powerHintDismissed, setPowerHintDismissed] = useState(false);
  // True from mount only when a stored room code exists - keeps the
  // "Create Room" button from flashing while a host:rejoin is in flight.
  const [isRejoining, setIsRejoining] = useState(() => !!getStoredHostRoomCode());
  // Mirrors `roomCode` for handlers registered once (empty dep array) that
  // still need the LATEST value - avoids a stale-closure read of `roomCode`.
  const roomCodeRef = useRef<RoomCode | null>(null);
  // Mirrors `phase` for the SAME reason - game:resumed needs to know which
  // of secondsLeft/revealSecondsLeft/scoreboardSecondsLeft to correct.
  const phaseRef = useRef<GamePhase>('LOBBY');
  // Mirrors `secondsLeft` so the countdown-sound decision can be made from
  // a plain setInterval callback instead of inside setSecondsLeft's
  // functional updater - React 18 StrictMode deliberately double-invokes
  // updater functions in dev to catch impure ones, which would double-fire
  // any side effect (like playing a tone) placed inside one.
  const secondsLeftRef = useRef(Math.ceil(DEFAULT_ROOM_SETTINGS.questionTimeMs / 1000));
  const audioCtxRef = useRef<AudioContext | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Host-only mute toggle (Task 20) - LOBBY UI only, but every cue everywhere
  // (including the Task 18 countdown ticks) checks this before playing.
  const [muted, setMuted] = useState(() => getStoredHostMuted());
  // Mirrors `muted` for the SAME reason as phaseRef/secondsLeftRef above -
  // every cue-playing call site lives inside a handler registered once
  // (empty-dependency-array useEffect) or a setInterval callback, neither of
  // which would otherwise see a toggle flipped after they were created.
  const mutedRef = useRef(muted);
  // Mirrors `paused` - answer:progress cues must not play mid-pause, and the
  // handler that receives them is registered once, same stale-closure issue.
  const pausedRef = useRef(false);

  // Every call site that sets `secondsLeft` goes through this, so the ref
  // never drifts from the displayed value.
  function applySecondsLeft(value: number) {
    secondsLeftRef.current = value;
    setSecondsLeft(value);
  }

  function handleToggleMuted() {
    // A plain value read from this render's closure, not a setState
    // functional updater - the same StrictMode double-invoke trap that
    // doubled the Task 18 countdown ticks applies to ANY side effect
    // (localStorage write included) placed inside one.
    const next = !muted;
    setStoredHostMuted(next);
    setMuted(next);
  }

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    function handleRoomCreated(payload: RoomCreatedPayload) {
      setRoomCode(payload.code);
      roomCodeRef.current = payload.code;
      setIsRejoining(false);
      setStoredHostRoomCode(payload.code);
      startKeepAliveAudio();
    }

    // A failed host:rejoin (the stored room no longer exists server-side) -
    // the only thing that currently emits server:error. Drop the stale
    // code and fall back to the create screen.
    function handleServerError(payload: ServerErrorPayload) {
      console.warn(`server error: ${payload.message}`);
      clearStoredHostRoomCode();
      roomCodeRef.current = null;
      setRoomCode(null);
      setIsRejoining(false);
    }

    function handleLobbyUpdate(payload: LobbyUpdatePayload) {
      setLobby(payload);
      setRoomSettings(payload.settings);
    }

    function handleSettingsUpdated(payload: SettingsUpdatedPayload) {
      setRoomSettings(payload);
    }

    function handlePhaseChanged(payload: PhaseChangedPayload) {
      setPhase(payload.phase);
      phaseRef.current = payload.phase;
      if (payload.phase === 'LOBBY') {
        // A fresh game (via "play again") - clear every transient round view
        // so the lobby renders cleanly instead of a stale QUESTION/REVEAL/
        // SCOREBOARD/GAME_OVER screen flashing first.
        setQuestion(null);
        setAnswerProgress(null);
        setReveal(null);
        setScoreboard(null);
        setGameOver(null);
        // Pause is impossible in LOBBY - reset defensively, in case a
        // player somehow paused right as the room reset.
        setPaused(false);
        setPausedByName(null);
        // Re-arm recovery for game 2+: GAME_OVER clears the stored code
        // below, so a fresh "play again" round needs it set again for a
        // mid-game refresh to still auto-rejoin.
        if (roomCodeRef.current) {
          setStoredHostRoomCode(roomCodeRef.current);
        }
      }
    }

    function handleQuestionShow(payload: QuestionShowPayload) {
      if (isQuestionShowHostPayload(payload)) {
        setQuestion(payload);
        // A fresh question:show always means "just started" - nothing has
        // elapsed yet, so the full duration IS the correct countdown start.
        applySecondsLeft(Math.ceil(payload.questionTimeMs / 1000));
        setAnswerProgress(null);
        setReveal(null);
        setScoreboard(null);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
        // The "look at the TV" cue - fires on EVERY live question:show
        // (first question after Έναρξη, and every question after a
        // scoreboard alike), never on a state:sync reconnect catching a
        // host up to a question already in progress (that's a different
        // handler, below). A fresh question is never already paused in
        // practice, but the guard is here defensively either way.
        if (!payload.paused) {
          playQuestionStartCue();
        }
      }
    }

    function handleAnswerProgress(payload: AnswerProgressPayload) {
      setAnswerProgress(payload);
      if (!pausedRef.current) {
        playAnswerBlip(payload.answered);
      }
    }

    function handleRevealShow(payload: RevealShowPayload) {
      if (isRevealHostPayload(payload)) {
        setReveal(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
        // The expire tone can't safely be decided from inside the QUESTION
        // countdown interval: the server ends the round on its OWN clock,
        // and that authoritative end routinely beats the client's local
        // "seconds -> 0" tick across the network, so the interval's final
        // tick is often cancelled (its cleanup runs on this very phase
        // change) before it gets a chance to fire. Deciding it here instead
        // - a low leftover local count means time genuinely ran out; a
        // still-high count means everyone answered early, and per spec no
        // tone should play for that case.
        if (secondsLeftRef.current <= 1) {
          playCountdownExpire();
        }
        // Unlike the expire tone, the reveal cue plays REGARDLESS of how
        // the question ended (timeout or everyone answering early) - per
        // spec, REVEAL still plays even when the expiry tone doesn't.
        if (!payload.paused) {
          playRevealCue();
        }
      }
    }

    function handleScoreboardShow(payload: ScoreboardPayload) {
      setScoreboard(payload);
      setPaused(payload.paused);
      setPausedByName(payload.pausedByName);
      if (!payload.paused) {
        playScoreboardCue();
      }
    }

    function handleGamePaused(payload: PausedPayload) {
      setPaused(true);
      setPausedByName(payload.byName);
    }

    function handleGameResumed(payload: ResumedPayload) {
      setPaused(false);
      setPausedByName(null);
      // Authoritative correction, not a guess - whichever countdown is
      // currently on screen jumps to the server's real remaining time
      // rather than trusting wherever the local interval happened to freeze.
      const seconds = Math.ceil(payload.remainingMs / 1000);
      if (phaseRef.current === 'QUESTION') {
        applySecondsLeft(seconds);
      } else if (phaseRef.current === 'REVEAL') {
        setRevealSecondsLeft(seconds);
      } else if (phaseRef.current === 'SCOREBOARD') {
        setScoreboardSecondsLeft(seconds);
      }
    }

    function handleGameOver(payload: GameOverPayload) {
      setGameOver(payload);
      // The game concluded - nothing left to recover on a future refresh
      // unless/until "play again" makes the room live again (see
      // handlePhaseChanged's LOBBY branch, which re-arms this).
      clearStoredHostRoomCode();
      // The game can't be paused once it's over, so this always plays -
      // the finale, timed with the confetti/firework entrance.
      playGameOverFanfare();
    }

    // Catches the TV display up to whatever's live right now - the normal
    // path after host:rejoin (a fresh page load recovering a stored room
    // code, or socket.io's own automatic reconnect after the TV wakes up).
    function handleStateSync(payload: StateSyncPayload) {
      setPhase(payload.phase);
      phaseRef.current = payload.phase;
      setQuestion(null);
      setAnswerProgress(null);
      setReveal(null);
      setScoreboard(null);
      setGameOver(null);

      switch (payload.phase) {
        case 'LOBBY':
          setRoomCode(payload.code);
          roomCodeRef.current = payload.code;
          setLobby({ code: payload.code, players: payload.players, canStart: payload.canStart, settings: payload.settings });
          setRoomSettings(payload.settings);
          setPaused(false);
          setPausedByName(null);
          break;
        case 'QUESTION':
          if (isQuestionShowHostPayload(payload)) {
            setQuestion(payload);
            applySecondsLeft(Math.ceil(payload.remainingMs / 1000));
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        case 'REVEAL':
          if (isRevealHostPayload(payload)) {
            setReveal(payload);
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        case 'SCOREBOARD':
          setScoreboard(payload);
          setPaused(payload.paused);
          setPausedByName(payload.pausedByName);
          break;
        case 'GAME_OVER':
          setGameOver(payload);
          break;
      }
    }

    socket.on(ServerEvents.ROOM_CREATED, handleRoomCreated);
    socket.on(ServerEvents.ERROR, handleServerError);
    socket.on(ServerEvents.LOBBY_UPDATE, handleLobbyUpdate);
    socket.on(ServerEvents.PHASE_CHANGED, handlePhaseChanged);
    socket.on(ServerEvents.QUESTION_SHOW, handleQuestionShow);
    socket.on(ServerEvents.ANSWER_PROGRESS, handleAnswerProgress);
    socket.on(ServerEvents.REVEAL_SHOW, handleRevealShow);
    socket.on(ServerEvents.SCOREBOARD_SHOW, handleScoreboardShow);
    socket.on(ServerEvents.GAME_OVER, handleGameOver);
    socket.on(ServerEvents.STATE_SYNC, handleStateSync);
    socket.on(ServerEvents.SETTINGS_UPDATED, handleSettingsUpdated);
    socket.on(ServerEvents.GAME_PAUSED, handleGamePaused);
    socket.on(ServerEvents.GAME_RESUMED, handleGameResumed);

    return () => {
      socket.off(ServerEvents.ROOM_CREATED, handleRoomCreated);
      socket.off(ServerEvents.ERROR, handleServerError);
      socket.off(ServerEvents.LOBBY_UPDATE, handleLobbyUpdate);
      socket.off(ServerEvents.PHASE_CHANGED, handlePhaseChanged);
      socket.off(ServerEvents.QUESTION_SHOW, handleQuestionShow);
      socket.off(ServerEvents.ANSWER_PROGRESS, handleAnswerProgress);
      socket.off(ServerEvents.REVEAL_SHOW, handleRevealShow);
      socket.off(ServerEvents.SCOREBOARD_SHOW, handleScoreboardShow);
      socket.off(ServerEvents.GAME_OVER, handleGameOver);
      socket.off(ServerEvents.STATE_SYNC, handleStateSync);
      socket.off(ServerEvents.SETTINGS_UPDATED, handleSettingsUpdated);
      socket.off(ServerEvents.GAME_PAUSED, handleGamePaused);
      socket.off(ServerEvents.GAME_RESUMED, handleGameResumed);
    };
  }, []);

  // Ticks the QUESTION countdown every second while genuinely live - stops
  // entirely while paused, freezing the displayed value exactly where it
  // was (per-second reset to the full/authoritative value happens
  // explicitly in handleQuestionShow/handleStateSync/handleGameResumed
  // above, not here, so a reconnect mid-question or mid-pause never gets
  // clobbered back to the full duration). Also drives the per-second tick
  // sound: since this interval only runs while live (not paused) and stops
  // the instant the phase changes away from QUESTION, a tick can only ever
  // fire for a second that was genuinely, live-ly reached. The expire tone
  // is handled separately in handleRevealShow (see its comment).
  useEffect(() => {
    if (phase !== 'QUESTION' || !question || paused) {
      return;
    }
    const interval = setInterval(() => {
      // Decrement via the ref, not a setState functional updater - React 18
      // StrictMode double-invokes updater functions in dev to catch impure
      // ones, which would double-fire the tone side effects below.
      const current = secondsLeftRef.current;
      const next = Math.max(0, current - 1);
      secondsLeftRef.current = next;
      setSecondsLeft(next); // plain value, immune to the double-invoke
      // The expire tone is NOT fired from here - see the comment in
      // handleRevealShow for why that decision lives there instead.
      if (next >= 1 && next <= 5) {
        playCountdownTick();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, question?.questionIndex, paused]);

  // Local countdowns driving the REVEAL/SCOREBOARD progress bars - purely
  // cosmetic, so the moment doesn't feel abrupt. The server's own timers are
  // what actually advance the game; these never have to be trusted. Unlike
  // QUESTION above, `reveal`/`scoreboard.autoAdvanceMs` is ALWAYS the live
  // server-computed remaining time (fresh or reconnect alike), so resetting
  // from it whenever the object itself changes is always correct.
  useEffect(() => {
    if (!reveal) {
      return;
    }
    setRevealSecondsLeft(Math.ceil(reveal.autoAdvanceMs / 1000));
  }, [reveal]);

  useEffect(() => {
    if (!reveal || paused) {
      return;
    }
    const interval = setInterval(() => {
      setRevealSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [reveal, paused]);

  useEffect(() => {
    if (!scoreboard) {
      return;
    }
    setScoreboardSecondsLeft(Math.ceil(scoreboard.autoAdvanceMs / 1000));
  }, [scoreboard]);

  useEffect(() => {
    if (!scoreboard || paused) {
      return;
    }
    const interval = setInterval(() => {
      setScoreboardSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [scoreboard, paused]);

  // Screen wake lock - the TV/tablet must not sleep mid-game, or the
  // WebSocket freezes and the host connection drops. Tracks whether it
  // actually succeeded (Tizen and others silently ignore this API entirely)
  // so the lobby can hint at a manual fallback instead of failing silently.
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;

    async function requestWakeLock() {
      if (!('wakeLock' in navigator)) {
        setWakeLockFailed(true);
        return;
      }
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        setWakeLockFailed(false);
      } catch {
        // e.g. some browsers reject while the tab is hidden - visibilitychange
        // below retries once the page is visible again.
        setWakeLockFailed(true);
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
        // AudioContexts get suspended when backgrounded - best effort retry.
        audioCtxRef.current?.resume().catch(() => {});
      }
    }

    requestWakeLock();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      wakeLock?.release().catch(() => {});
    };
  }, []);

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

  function startKeepAliveAudio() {
    if (audioCtxRef.current) {
      return; // already running
    }
    try {
      const AudioContextCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        return; // unsupported - fail silently, this is best-effort only
      }
      const ctx = new AudioContextCtor();
      const gain = ctx.createGain();
      // NOT exactly 0 - some platforms treat true silence as "not playing"
      // and suspend/drop the context anyway, defeating the whole point.
      gain.gain.value = 0.0001;
      gain.connect(ctx.destination);
      const oscillator = ctx.createOscillator();
      oscillator.connect(gain);
      oscillator.start();
      audioCtxRef.current = ctx;
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

  // CUE 1 - QUESTION START, the most important cue: a rising 3-note motif
  // through the scale, ~450ms total, clearly "look at the TV now". Fires
  // once per LIVE question:show (handleQuestionShow below) - never on a
  // state:sync reconnect catching a host up to a question already in
  // progress, which would be a false "new question" cue.
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

  // CUE 6 - SCOREBOARD: a brief two-note transition - smaller than the
  // question-start motif, since this means "moving on", not "look now".
  function playScoreboardCue() {
    playToneAt(NOTE.CS5, 0, 90, 0.16);
    playToneAt(NOTE.E5, 0.09, 110, 0.16);
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

  // Auto-recovery: on EVERY successful connection - the very first one on
  // mount, and every automatic reconnect socket.io performs after the TV
  // wakes back up - reattach as this room's host display if we have a
  // stored code. This is the one mechanism that covers all three recovery
  // paths (fresh page load, reconnect-after-sleep, and a plain refresh)
  // with a single code path.
  useEffect(() => {
    function attemptRejoin() {
      const stored = getStoredHostRoomCode();
      if (stored) {
        socket.emit(ClientEvents.HOST_REJOIN, { code: stored });
      }
    }

    socket.on('connect', attemptRejoin);
    if (socket.connected) {
      attemptRejoin();
    }

    return () => {
      socket.off('connect', attemptRejoin);
    };
  }, []);

  // Renders the join QR code onto the canvas - only mounted during LOBBY,
  // so this re-runs (and redraws) every time we land back there, including
  // after "play again" resets the phase with the SAME room code.
  useEffect(() => {
    if (!roomCode || phase !== 'LOBBY') {
      return;
    }
    const canvas = qrCanvasRef.current;
    if (!canvas) {
      return;
    }
    // Never hardcode the domain - derive from wherever this page was
    // actually served from, so dev/staging/prod all just work.
    const joinUrl = `${window.location.origin}/play?code=${roomCode}`;
    QRCode.toCanvas(canvas, joinUrl, {
      width: QR_SIZE_PX,
      margin: 2,
      // Forced light background regardless of any future theme - QR
      // scanning fails on dark/inverted codes on many phone cameras.
      color: { dark: '#000000', light: '#ffffff' },
    }).catch((err: unknown) => {
      console.warn('failed to render QR code', err);
    });
  }, [roomCode, phase]);

  function handleCreateRoom() {
    socket.emit(ClientEvents.CREATE_ROOM, {});
  }

  const players = lobby?.players ?? [];
  const connectedCount = players.filter((player) => player.connected).length;
  const vip = players.find((player) => player.isVip) ?? null;

  if (phase === 'GAME_OVER' && gameOver) {
    return <GameOverView gameOver={gameOver} />;
  }

  if (phase === 'REVEAL' && reveal && question) {
    return (
      <RevealView
        reveal={reveal}
        question={question}
        roomCode={roomCode}
        paused={paused}
        pausedByName={pausedByName}
        revealSecondsLeft={revealSecondsLeft}
      />
    );
  }

  if (phase === 'SCOREBOARD' && scoreboard) {
    return (
      <ScoreboardView
        scoreboard={scoreboard}
        roomCode={roomCode}
        paused={paused}
        pausedByName={pausedByName}
        scoreboardSecondsLeft={scoreboardSecondsLeft}
      />
    );
  }

  if (phase === 'QUESTION' && question) {
    return (
      <QuestionView
        question={question}
        answerProgress={answerProgress}
        roomCode={roomCode}
        paused={paused}
        pausedByName={pausedByName}
        secondsLeft={secondsLeft}
        players={players}
        connectedCount={connectedCount}
      />
    );
  }

  return (
    <LobbyView
      connected={connected}
      roomCode={roomCode}
      isRejoining={isRejoining}
      wakeLockFailed={wakeLockFailed}
      phase={phase}
      muted={muted}
      onToggleMuted={handleToggleMuted}
      onCreateRoom={handleCreateRoom}
      qrCanvasRef={qrCanvasRef}
      players={players}
      connectedCount={connectedCount}
      roomSettings={roomSettings}
      vip={vip}
      powerHintDismissed={powerHintDismissed}
      onDismissPowerHint={() => setPowerHintDismissed(true)}
    />
  );
}
