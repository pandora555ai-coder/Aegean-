import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ANSWER_IDENTITIES,
  ClientEvents,
  DEFAULT_ROOM_SETTINGS,
  MAX_PLAYERS,
  REVEAL_DURATION_MS,
  SCOREBOARD_DURATION_MS,
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
import { DIFFICULTY_MIX_LABELS } from '../difficultyLabels';
import { AnswerShape } from '../components/AnswerShape';
import { Avatar } from '../components/Avatar';

const QR_SIZE_PX = 240; // comfortably above the "at least 200px" floor

// Confetti pieces for the GAME_OVER celebration - a fixed module-level list
// (computed once, not per render) so remounts don't reshuffle it. Colours
// cycle through gold plus the 4 answer identities, tying the celebration
// back to the same palette instead of introducing new hues. Deterministic
// (index-derived, not Math.random) purely so a screenshot/test run is
// reproducible - there's no gameplay reason it needs to be.
//
// Task 23: roughly tripled (24 -> 72) and given real variety - size,
// rotation SPEED (not just a shared 540deg spin), and fall duration all
// vary per piece now, not just horizontal position. A POSITIVE, short
// stagger (0-1.1s, not the old negative "already mid-fall" trick) makes it
// read as a launched BURST rather than an ambient drizzle that was already
// running before you looked. Finite iteration count (2-3 falls) per piece
// so it settles rather than raining for the entire GAME_OVER screen.
const CONFETTI_COLORS = ['#d4af37', '#ef4444', '#3b82f6', '#eab308', '#22c55e'];
const CONFETTI_COUNT = 72;
const CONFETTI_PIECES = Array.from({ length: CONFETTI_COUNT }, (_, i) => {
  const left = (i * 13.7) % 100;
  const drift = ((i * 23) % 140) - 70;
  const duration = 3.6 + ((i * 11) % 28) / 10; // 3.6s-6.4s
  const delay = ((i * 47) % 110) / 100; // 0-1.09s - staggered burst-in
  const spin = 320 + ((i * 67) % 760); // 320-1080deg, some spin much faster than others
  const width = 0.45 + ((i * 7) % 6) / 10; // 0.45rem-1.05rem
  const height = width * (1.3 + ((i * 3) % 4) / 10); // varied aspect ratio
  const iterations = 2 + (i % 3); // 2-4 falls, then it settles
  return {
    id: i,
    style: {
      left: `${left}%`,
      backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      '--w': `${width}rem`,
      '--h': `${height}rem`,
      '--drift': `${drift}px`,
      '--spin': `${spin}deg`,
      '--duration': `${duration}s`,
      '--delay': `${delay}s`,
      '--iterations': String(iterations),
    } as CSSVars,
  };
});

// Firework bursts for GAME_OVER - several radial particle bursts, staggered
// across the first ~1.6s, positioned in the screen's side margins (never
// the centred title/name/standings column) so they frame the winner
// without ever obscuring it. Each particle's outward offset is computed
// once here (its angle around the burst circle * a radius), not left to
// CSS to guess - a plain radial spread, cheapest possible way to get a
// convincing "burst" from a single shared @keyframes.
const FIREWORK_ORIGINS = [
  { x: 12, y: 22 },
  { x: 88, y: 22 },
  { x: 15, y: 62 },
  { x: 85, y: 62 },
];
const PARTICLES_PER_BURST = 10;
const FIREWORK_PARTICLES = FIREWORK_ORIGINS.flatMap((origin, burstIndex) => {
  const burstDelay = burstIndex * 0.4; // 4 bursts, 400ms apart - all done within ~2.1s
  return Array.from({ length: PARTICLES_PER_BURST }, (_, p) => {
    const angle = (p / PARTICLES_PER_BURST) * 2 * Math.PI;
    const radius = 85 + ((burstIndex + p) % 3) * 25; // px - a little size variety per particle
    const fx = Math.cos(angle) * radius;
    const fy = Math.sin(angle) * radius;
    return {
      id: `${burstIndex}-${p}`,
      style: {
        left: `${origin.x}%`,
        top: `${origin.y}%`,
        backgroundColor: CONFETTI_COLORS[(burstIndex + p) % CONFETTI_COLORS.length],
        boxShadow: `0 0 6px 1px ${CONFETTI_COLORS[(burstIndex + p) % CONFETTI_COLORS.length]}`,
        '--fx': `${fx}px`,
        '--fy': `${fy}px`,
        '--delay': `${burstDelay}s`,
      } as CSSVars,
    };
  });
});

// React's CSSProperties doesn't model CSS custom properties - this lets the
// `--glow-color` variable the .glow/.glow-pulse classes read (see theme.css)
// be set inline per-element, since each glow needs a different colour.
type CSSVars = CSSProperties & Record<`--${string}`, string>;

// "Slightly lighter panels with a subtle inner glow, so cards feel lit
// rather than painted on." Applied to every plain surface panel EXCEPT ones
// that also use the .glow/.glow-pulse classes - an inline boxShadow always
// wins over a CSS class's boxShadow, so combining the two would silently
// clobber the glow ring.
const SURFACE_GLOW = 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 22px rgba(122,92,210,0.12)';

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
    const sortedFinalStandings = [...gameOver.standings].sort((a, b) => a.rank - b.rank);
    const winners = sortedFinalStandings.filter((standing) => standing.rank === 1);

    return (
      <div style={styles.container} className="screen-fade-in">
        {CONFETTI_PIECES.map((piece) => (
          <div key={piece.id} className="confetti-piece" aria-hidden="true" style={piece.style} />
        ))}
        {FIREWORK_PARTICLES.map((particle) => (
          <div key={particle.id} className="firework-particle" aria-hidden="true" style={particle.style} />
        ))}
        <div style={styles.gameOverTitleWrap}>
          <div style={styles.gameOverTitle}>Τέλος παιχνιδιού!</div>
          <div style={styles.winnerAvatarRow} data-testid="winner-avatars">
            {winners.map((winner) => (
              <div key={winner.playerId} className="glow-pulse gold-pulse" style={{ '--glow-color': 'rgba(212, 175, 55, 0.6)' } as CSSVars}>
                <Avatar avatarId={winner.avatarId} sizeRem={6} ringColor="var(--gold)" />
              </div>
            ))}
          </div>
          <div
            className="text-glow-gold gold-pulse enter-pop"
            style={styles.winnerBanner}
            data-testid="winner-banner"
          >
            {gameOver.isTie ? 'Ισοπαλία: ' : 'Νικητής/τρια: '}
            {gameOver.winnerName}
          </div>
        </div>
        <div style={styles.standingsList}>
          {sortedFinalStandings.map((standing, index) => (
            <div
              key={standing.playerId}
              data-testid="final-standing-row"
              className={standing.rank === 1 ? 'glow-pulse enter-rise' : 'enter-rise'}
              style={
                standing.rank === 1
                  ? ({
                      ...styles.standingRowWinner,
                      '--glow-color': 'rgba(212, 175, 55, 0.5)',
                      '--i': String(index),
                    } as CSSVars)
                  : ({ ...styles.standingRow, boxShadow: SURFACE_GLOW, '--i': String(index) } as CSSVars)
              }
            >
              <span style={styles.standingRank}>#{standing.rank}</span>
              <Avatar avatarId={standing.avatarId} sizeRem={2.25} ringColor={standing.rank === 1 ? 'var(--gold)' : undefined} />
              <span style={styles.standingName}>{standing.name}</span>
              <span style={styles.standingScore}>{standing.score}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (phase === 'REVEAL' && reveal && question) {
    return (
      <div style={styles.container} className="screen-fade-in" key={question.questionIndex}>
        {roomCode && (
          <div style={styles.cornerRoomCode} data-testid="corner-room-code">
            {roomCode}
          </div>
        )}
        {paused && (
          <div style={styles.pauseOverlay} data-testid="pause-overlay">
            <div style={styles.pauseTitle}>ΠΑΥΣΗ</div>
            <div style={styles.pauseSubtitle}>Ο/Η {pausedByName} έκανε παύση</div>
          </div>
        )}
        <div style={styles.progress}>
          Ερώτηση {question.questionIndex + 1}/{question.totalQuestions}
        </div>
        {/* Game Master (Task 24) - HOST ONLY. Plain block flow, not an
            overlay, so it can never cover the results or the correct
            answer - it just takes its own line, pushing the rest down a
            little. Conditionally rendered (not a fixed-height placeholder)
            so a null gmLine (rare - only if every applicable line pool
            happened to already be exhausted this game) leaves no empty
            gap; in normal play gmLine is essentially always present. */}
        {reveal.gmLine && (
          <div className="enter-pop" style={styles.gmLineBanner} data-testid="gm-line">
            {reveal.gmLine}
          </div>
        )}
        {/* Running standings stay glanceable during REVEAL - a compact strip,
            not the full SCOREBOARD phase, so skipping SCOREBOARD (Task 22)
            never loses information. Sorted client-side straight from
            reveal.results, which already carries every connected player's
            current totalScore - no extra server payload needed. */}
        <div style={styles.revealStandingsStrip} data-testid="reveal-standings-strip">
          {[...reveal.results]
            .sort((a, b) => b.totalScore - a.totalScore)
            .map((result, index) => (
              <span key={result.playerId} style={styles.revealStandingsItem} data-testid="reveal-standings-item">
                <span style={styles.revealStandingsRank}>{index + 1}.</span>
                <Avatar avatarId={result.avatarId} sizeRem={1.4} />
                <span style={styles.revealStandingsName}>{result.name}</span>
                <span style={styles.revealStandingsScore}>{result.totalScore}</span>
              </span>
            ))}
        </div>
        <div style={styles.optionsGrid}>
          {question.options.map((option, index) => {
            const identity = ANSWER_IDENTITIES[index];
            const isCorrect = index === reveal.correctIndex;
            return (
              <div
                key={index}
                data-testid="reveal-option"
                data-correct={isCorrect}
                className={isCorrect ? 'glow-pulse correct-pop' : undefined}
                style={
                  isCorrect
                    ? ({
                        ...styles.optionCardCorrect,
                        borderColor: identity.color,
                        background: `${identity.color}14`,
                        // The burst glow is GOLD (not the identity colour) -
                        // gold means "this matters", and it's what makes the
                        // correct card read as CELEBRATED rather than just
                        // "still coloured like it was during the question".
                        '--glow-color': 'rgba(212, 175, 55, 0.55)',
                      } as CSSVars)
                    : { ...styles.optionCardWrong, borderColor: identity.color, boxShadow: SURFACE_GLOW }
                }
              >
                <AnswerShape index={index} sizeRem={1.75} muted={!isCorrect} />
                {/* Letter text is always neutral, never the identity colour -
                    red/blue as small TEXT drop under 4.5:1 on this lighter
                    stage background (see theme.css's --danger-text comment).
                    The identity colour still pops via the shape, the full
                    border, and (when correct) the tinted background + gold
                    glow. */}
                <span style={styles.optionLabel}>{identity.letter}</span>
                <span style={isCorrect ? undefined : styles.optionTextWrong}>{option}</span>
                <span style={styles.answerCount} data-testid="answer-count">
                  {reveal.answerCounts[index]}
                </span>
              </div>
            );
          })}
        </div>
        <div style={styles.resultsList}>
          {/* Rendered in the order the server sent them - correct-by-speed,
              then wrong, then non-answerers. Never re-sorted here. */}
          {reveal.results.map((result, index) => {
            const previous = reveal.results[index - 1];
            const enteringWrongOrNoAnswer = !result.correct && (previous === undefined || previous.correct);
            const isFastest = result.answerRank === 1;
            return (
              <Fragment key={result.playerId}>
                {enteringWrongOrNoAnswer && <div style={styles.resultsDivider} data-testid="results-divider" />}
                <div
                  className={isFastest ? 'glow-pulse' : undefined}
                  style={
                    isFastest
                      ? ({ ...styles.resultRowFastest, '--glow-color': 'rgba(212, 175, 55, 0.35)' } as CSSVars)
                      : styles.resultRow
                  }
                  data-testid="reveal-result"
                  data-correct={result.correct}
                  data-answer-rank={result.answerRank ?? ''}
                >
                  <span style={result.correct ? styles.resultNameCorrect : styles.resultNameWrong}>
                    <Avatar avatarId={result.avatarId} sizeRem={1.75} />
                    <span style={styles.resultNameText}>
                      {result.correct
                        ? `${result.answerRank}. ${result.name}${result.timeMs !== null ? ` — ${(result.timeMs / 1000).toFixed(1)}΄΄` : ''}`
                        : `${result.timeMs !== null ? '✗' : '–'} ${result.name}`}
                    </span>
                  </span>
                  <span style={styles.resultPoints}>
                    +{result.pointsAwarded} ({result.totalScore})
                  </span>
                </div>
              </Fragment>
            );
          })}
        </div>
        <div style={styles.progressBarTrack} data-testid="reveal-progress">
          <div
            style={{
              ...styles.progressBarFill,
              width: `${(revealSecondsLeft / Math.ceil(REVEAL_DURATION_MS / 1000)) * 100}%`,
            }}
          />
        </div>
      </div>
    );
  }

  if (phase === 'SCOREBOARD' && scoreboard) {
    const sortedStandings = [...scoreboard.standings].sort((a, b) => a.rank - b.rank);

    return (
      <div style={styles.container} className="screen-fade-in" key={scoreboard.questionIndex}>
        {roomCode && (
          <div style={styles.cornerRoomCode} data-testid="corner-room-code">
            {roomCode}
          </div>
        )}
        {paused && (
          <div style={styles.pauseOverlay} data-testid="pause-overlay">
            <div style={styles.pauseTitle}>ΠΑΥΣΗ</div>
            <div style={styles.pauseSubtitle}>Ο/Η {pausedByName} έκανε παύση</div>
          </div>
        )}
        <div style={styles.progress}>
          Ερώτηση {scoreboard.questionIndex + 1}/{scoreboard.totalQuestions} ολοκληρώθηκε
        </div>
        <div style={styles.standingsList}>
          {/* Rows are already in rank order (leader first) - the stagger
              delay below (--i = row position) makes them visibly slide in
              "from the leader down". */}
          {sortedStandings.map((standing, index) => {
            const isLeader = standing.rank === 1 && standing.connected;
            return (
              <div
                key={standing.playerId}
                data-testid="standing-row"
                data-connected={standing.connected}
                data-leader={isLeader}
                className="enter-rise"
                style={
                  !standing.connected
                    ? ({ ...styles.standingRowDisconnected, boxShadow: SURFACE_GLOW, '--i': String(index) } as CSSVars)
                    : isLeader
                      ? ({ ...styles.standingRowLeader, '--i': String(index) } as CSSVars)
                      : ({ ...styles.standingRow, boxShadow: SURFACE_GLOW, '--i': String(index) } as CSSVars)
                }
              >
                <span style={styles.standingRank}>#{standing.rank}</span>
                <Avatar avatarId={standing.avatarId} sizeRem={2.25} ringColor={isLeader ? 'var(--gold)' : undefined} />
                <span style={styles.standingName}>
                  {standing.name}
                  {!standing.connected && ' (αποσυνδέθηκε)'}
                </span>
                <span style={styles.standingScore}>{standing.score}</span>
              </div>
            );
          })}
        </div>
        <div style={styles.progressBarTrack} data-testid="scoreboard-progress">
          <div
            style={{
              ...styles.progressBarFill,
              width: `${(scoreboardSecondsLeft / Math.ceil(SCOREBOARD_DURATION_MS / 1000)) * 100}%`,
            }}
          />
        </div>
      </div>
    );
  }

  if (phase === 'QUESTION' && question) {
    const answeredIds = new Set(answerProgress?.answeredPlayerIds ?? []);
    const answeredCount = answerProgress?.answered ?? 0;
    const totalCount = answerProgress?.total ?? connectedCount;

    const timerCritical = !paused && secondsLeft <= 5 && secondsLeft > 0;
    return (
      <div style={styles.container} className="screen-fade-in" key={question.questionIndex}>
        {roomCode && (
          <div style={styles.cornerRoomCode} data-testid="corner-room-code">
            {roomCode}
          </div>
        )}
        {paused && (
          <div style={styles.pauseOverlay} data-testid="pause-overlay">
            <div style={styles.pauseTitle}>ΠΑΥΣΗ</div>
            <div style={styles.pauseSubtitle}>Ο/Η {pausedByName} έκανε παύση</div>
          </div>
        )}
        {/* Game Master (Task 24) - HOST ONLY, briefly shown then fades on
            its own via CSS (gm-intro-fade, see theme.css) - no JS timer, so
            it can never delay anything else on this screen. The player
            side's answer buttons are unaffected regardless, since gmIntro
            is never even sent in the player payload. Conditionally
            rendered, same reasoning as gmLine on REVEAL - no gap when
            null. */}
        {question.gmIntro && (
          <div className="gm-intro-fade" style={styles.gmIntroBanner} data-testid="gm-intro">
            {question.gmIntro}
          </div>
        )}
        <div className={timerCritical ? 'timer-ring timer-ring-critical' : 'timer-ring'} style={styles.timerRingWrap}>
          <div className={timerCritical ? 'timer-critical' : undefined} style={styles.timer} data-testid="countdown">
            {secondsLeft}
          </div>
        </div>
        <div className="enter-pop">
          <div style={styles.category}>{question.category}</div>
          <div style={styles.progress} data-testid="question-progress">
            Ερώτηση {question.questionIndex + 1}/{question.totalQuestions}
          </div>
          <div style={styles.questionText} data-testid="question-text">
            {question.question}
          </div>
        </div>
        <div style={styles.optionsGrid}>
          {question.options.map((option, index) => {
            const identity = ANSWER_IDENTITIES[index];
            return (
              <div
                key={index}
                className="enter-rise"
                style={
                  {
                    // Plain --surface, deliberately NOT tinted by the
                    // identity colour - a same-hue wash behind a
                    // full-strength shape/border crushes their contrast
                    // against each other. The full-strength colour border
                    // already reads clearly as "lit in its own colour".
                    ...styles.optionCard,
                    borderColor: identity.color,
                    boxShadow: SURFACE_GLOW,
                    '--i': String(index),
                  } as CSSVars
                }
                data-testid="host-option"
              >
                <AnswerShape index={index} sizeRem={1.75} />
                {/* Neutral letter text - see the matching comment in the
                    REVEAL view for why identity colour never fills text. */}
                <span style={styles.optionLabel}>{identity.letter}</span>
                <span>{option}</span>
              </div>
            );
          })}
        </div>
        <div style={styles.answerCounter} data-testid="answer-progress">
          {answeredCount}/{totalCount} απάντησαν
        </div>
        <div style={styles.answeredNames}>
          {players.map((player) => {
            const answered = answeredIds.has(player.playerId);
            return (
              <span
                key={player.playerId}
                data-testid="answered-marker"
                data-answered={answered}
                style={answered ? styles.nameAnswered : styles.nameNotAnswered}
              >
                <Avatar avatarId={player.avatarId} sizeRem={1.5} ringColor={answered ? 'var(--success)' : undefined} />
                {answered ? '✓ ' : ''}
                {player.name}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container} className="screen-fade-in">
      {/* LOBBY only, per spec - a fixed top-left chip so it never competes
          with the centred room code / QR column. Only shown once a room
          actually exists (nothing to mute before then). */}
      {roomCode !== null && (
        <button
          type="button"
          data-testid="mute-toggle"
          onClick={handleToggleMuted}
          style={styles.muteToggle}
          aria-label={muted ? 'Ενεργοποίηση ήχου' : 'Σίγαση ήχου'}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      )}
      <div style={styles.status}>{connected ? 'connected' : 'disconnected'}</div>
      {phase === 'LOBBY' && wakeLockFailed && (
        <div style={styles.wakeLockHint} data-testid="wake-lock-hint">
          Συμβουλή: απενεργοποιήστε το Eco Mode / Screen Saver στις ρυθμίσεις της τηλεόρασης
        </div>
      )}

      {roomCode === null ? (
        isRejoining ? (
          <div style={styles.status} data-testid="rejoining">
            Επανασύνδεση...
          </div>
        ) : (
          <button
            style={connected ? styles.createButton : styles.createButtonDisabled}
            type="button"
            onClick={handleCreateRoom}
            disabled={!connected}
          >
            Create Room
          </button>
        )
      ) : (
        <>
          <div data-testid="room-code" className="text-glow-gold gold-pulse" style={styles.code}>
            {roomCode.split('').join(' ')}
          </div>

          <div style={styles.qrWrapper}>
            <canvas ref={qrCanvasRef} data-testid="qr-code" width={QR_SIZE_PX} height={QR_SIZE_PX} />
          </div>

          <div data-testid="player-counter" style={styles.counter}>
            {connectedCount}/{MAX_PLAYERS} παίκτες
          </div>

          <div style={styles.playerList}>
            {players.map((player) => (
              <div
                key={player.playerId}
                data-testid="player-row"
                data-connected={player.connected}
                data-vip={player.isVip}
                style={styles.playerRow}
              >
                <Avatar avatarId={player.avatarId} sizeRem={2.75} />
                <span style={player.connected ? styles.playerName : styles.playerNameDisconnected}>
                  {player.isVip && '👑 '}
                  {player.name}
                  {!player.connected && ' (αποσυνδέθηκε)'}
                </span>
              </div>
            ))}
          </div>

          <div data-testid="room-settings-summary" style={styles.settingsSummary}>
            {roomSettings.questionCount} ερωτήσεις · {roomSettings.questionTimeMs / 1000}΄΄ ·{' '}
            {DIFFICULTY_MIX_LABELS[roomSettings.difficultyMix]}
          </div>

          {vip ? (
            <div data-testid="waiting-message" style={styles.waitingMessage}>
              Ο/Η {vip.name} ξεκινά το παιχνίδι
            </div>
          ) : (
            <div data-testid="waiting-message" style={styles.waitingMessage}>
              Περιμένουμε παίκτες...
            </div>
          )}

          {!powerHintDismissed && (
            <div
              style={styles.powerHint}
              data-testid="power-hint"
              onClick={() => setPowerHintDismissed(true)}
              role="button"
              tabIndex={0}
            >
              Αν σβήνει η οθόνη: Ρυθμίσεις TV → Eco / Εξοικονόμηση ενέργειας → Απενεργοποίηση{' '}
              <span style={styles.powerHintDismiss}>✕</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.5rem',
    padding: '3rem 2rem',
    minHeight: '100vh',
    width: '100%',
    background: 'var(--bg)',
    color: 'var(--text)',
    // Stacks above the fixed .confetti-piece / .firework-particle layers
    // (both z-index: 0) regardless of DOM order. The background light
    // sweep this originally also stacked above (Task 21) was removed in
    // Task 22; the GAME_OVER light rays (Task 21) were removed in Task 23.
    position: 'relative',
    zIndex: 1,
  },
  status: { fontSize: '1.25rem', color: 'var(--text-faint)' },
  createButton: {
    fontSize: '2rem',
    padding: '1.5rem 3rem',
    borderRadius: '0.75rem',
    border: 'none',
    background: 'var(--gold)',
    color: '#14161c',
    fontWeight: 700,
  },
  createButtonDisabled: {
    fontSize: '2rem',
    padding: '1.5rem 3rem',
    borderRadius: '0.75rem',
    border: 'none',
    background: 'var(--border)',
    color: 'var(--text-faint)',
    fontWeight: 700,
  },
  code: {
    fontSize: '8rem',
    fontWeight: 700,
    fontFamily: 'monospace',
    letterSpacing: '0.5em',
    color: 'var(--gold)',
  },
  qrWrapper: {
    // Explicit white background regardless of theme - QR scanning fails on
    // dark/inverted codes on many phone cameras, so this can't just inherit
    // whatever the page background happens to be.
    background: '#ffffff',
    padding: '1rem',
    borderRadius: '1rem',
    lineHeight: 0,
  },
  muteToggle: {
    position: 'fixed',
    top: '1rem',
    left: '1rem',
    fontSize: '1.5rem',
    lineHeight: 1,
    background: 'var(--surface)',
    border: '1px solid var(--border-strong)',
    borderRadius: '999px',
    padding: '0.5rem 0.7rem',
    boxShadow: SURFACE_GLOW,
    cursor: 'pointer',
    zIndex: 50,
  },
  cornerRoomCode: {
    position: 'fixed',
    top: '1rem',
    right: '1rem',
    fontSize: '1rem',
    fontWeight: 700,
    fontFamily: 'monospace',
    letterSpacing: '0.15em',
    color: 'var(--text)',
    background: 'var(--surface)',
    border: '1px solid var(--border-strong)',
    padding: '0.35rem 0.75rem',
    borderRadius: '0.5rem',
    boxShadow: SURFACE_GLOW,
    // Above the pause overlay - players may still need the room code while
    // paused (e.g. someone new scanning the QR mid-break isn't possible,
    // but the code itself must never be hidden).
    zIndex: 50,
  },
  pauseOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(10, 7, 22, 0.92)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem',
    zIndex: 40,
  },
  pauseTitle: {
    fontSize: '5rem',
    fontWeight: 900,
    color: 'var(--text)',
    letterSpacing: '0.15em',
  },
  pauseSubtitle: {
    fontSize: '1.75rem',
    fontWeight: 600,
    color: 'var(--text-dim)',
  },
  counter: {
    fontSize: '2.5rem',
    fontWeight: 700,
    color: 'var(--text)',
  },
  playerList: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '0.5rem',
    fontSize: '2.5rem',
    minHeight: '3rem',
    width: '100%',
    maxWidth: '640px',
  },
  playerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
  },
  playerName: {
    fontWeight: 600,
    color: 'var(--text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  playerNameDisconnected: {
    fontWeight: 600,
    color: 'var(--text-faint)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
    opacity: 0.6,
  },
  waitingMessage: {
    fontSize: '2.5rem',
    fontWeight: 600,
    color: 'var(--text-dim)',
  },
  settingsSummary: {
    fontSize: '1.25rem',
    fontWeight: 600,
    color: 'var(--text-faint)',
  },
  category: {
    fontSize: '1.75rem',
    fontWeight: 600,
    color: 'var(--text-dim)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  progress: {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: 'var(--text-faint)',
  },
  questionText: {
    fontSize: '4rem',
    fontWeight: 700,
    textAlign: 'center',
    lineHeight: 1.3,
    maxWidth: '90%',
    color: 'var(--text)',
  },
  optionsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1.5rem',
    width: '100%',
    maxWidth: '1100px',
  },
  optionCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    fontSize: '2.25rem',
    fontWeight: 600,
    padding: '1.5rem 2rem',
    borderRadius: '1rem',
    background: 'var(--surface)',
    border: '3px solid var(--border)',
    color: 'var(--text)',
  },
  optionLabel: {
    fontWeight: 800,
    minWidth: '2rem',
  },
  timerRingWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '7rem',
    height: '7rem',
    borderRadius: '50%',
    background: 'var(--surface)',
  },
  timer: {
    fontSize: '3rem',
    fontWeight: 800,
    fontFamily: 'monospace',
    color: 'var(--gold)',
  },
  answerCounter: {
    fontSize: '2rem',
    fontWeight: 700,
    color: 'var(--text-dim)',
  },
  answeredNames: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: '0.75rem',
    fontSize: '1.5rem',
    fontWeight: 600,
  },
  nameAnswered: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    color: 'var(--text)',
  },
  nameNotAnswered: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    color: 'var(--text-faint)',
  },
  optionCardCorrect: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    fontSize: '2.25rem',
    fontWeight: 700,
    padding: '1.5rem 2rem',
    borderRadius: '1rem',
    border: '3px solid',
    color: 'var(--text)',
  },
  optionCardWrong: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    fontSize: '2.25rem',
    fontWeight: 600,
    padding: '1.5rem 2rem',
    borderRadius: '1rem',
    background: 'var(--surface)',
    border: '3px solid',
    color: 'var(--text-faint)',
    opacity: 0.45,
    filter: 'grayscale(0.6)',
  },
  optionTextWrong: {
    color: 'var(--text-faint)',
  },
  answerCount: {
    marginLeft: 'auto',
    fontWeight: 800,
    color: 'var(--text-dim)',
  },
  gmLineBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '0.6rem 1.5rem',
    borderRadius: '0.75rem',
    background: 'rgba(212, 175, 55, 0.12)',
    border: '2px solid var(--gold)',
    color: 'var(--gold)',
    fontSize: '1.35rem',
    fontWeight: 700,
    textAlign: 'center',
    width: '100%',
    maxWidth: '900px',
  },
  gmIntroBanner: {
    padding: '0.5rem 1.25rem',
    borderRadius: '0.75rem',
    background: 'rgba(212, 175, 55, 0.12)',
    border: '2px solid var(--gold)',
    color: 'var(--gold)',
    fontSize: '1.15rem',
    fontWeight: 700,
    textAlign: 'center',
    maxWidth: '700px',
  },
  revealStandingsStrip: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'baseline',
    gap: '0.5rem 1.25rem',
    width: '100%',
    maxWidth: '900px',
    fontSize: '1.1rem',
    fontWeight: 600,
    color: 'var(--text-dim)',
  },
  revealStandingsItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    whiteSpace: 'nowrap',
  },
  revealStandingsRank: {
    color: 'var(--gold)',
    fontWeight: 800,
  },
  revealStandingsName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '10rem',
  },
  revealStandingsScore: {
    fontFamily: 'monospace',
    color: 'var(--text)',
  },
  resultsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    width: '100%',
    maxWidth: '700px',
  },
  resultRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    fontSize: '1.75rem',
    fontWeight: 600,
    padding: '0.5rem 1rem',
  },
  resultRowFastest: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    fontSize: '1.9rem',
    fontWeight: 800,
    padding: '0.6rem 1.25rem',
    borderRadius: '0.75rem',
    background: 'rgba(212, 175, 55, 0.12)',
    border: '2px solid var(--gold)',
  },
  resultsDivider: {
    height: '1px',
    background: 'var(--border)',
    margin: '0.4rem 0',
  },
  resultNameCorrect: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    flex: 1,
    minWidth: 0,
    color: 'var(--success)',
  },
  resultNameWrong: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    flex: 1,
    minWidth: 0,
    // --danger-text, not --danger - the raw answer-A red hex drops under
    // 4.5:1 as small text on the new, lighter stage background.
    color: 'var(--danger-text)',
  },
  resultNameText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  resultPoints: {
    flexShrink: 0,
    fontFamily: 'monospace',
    fontWeight: 700,
    color: 'var(--text)',
  },
  standingsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    width: '100%',
    maxWidth: '800px',
  },
  standingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    fontSize: '2.25rem',
    fontWeight: 700,
    padding: '1rem 1.5rem',
    borderRadius: '0.75rem',
    background: 'var(--surface)',
    color: 'var(--text)',
  },
  standingRowDisconnected: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    fontSize: '2.25rem',
    fontWeight: 700,
    padding: '1rem 1.5rem',
    borderRadius: '0.75rem',
    background: 'var(--surface)',
    color: 'var(--text-faint)',
    opacity: 0.5,
  },
  standingRowLeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    fontSize: '2.25rem',
    fontWeight: 700,
    padding: '1rem 1.5rem',
    borderRadius: '0.75rem',
    background: 'rgba(212, 175, 55, 0.1)',
    border: '2px solid var(--gold)',
    color: 'var(--text)',
  },
  standingRank: {
    color: 'var(--text-dim)',
    minWidth: '3rem',
  },
  standingName: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  standingScore: {
    flexShrink: 0,
    fontFamily: 'monospace',
  },
  gameOverTitleWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
    padding: '1.5rem 0',
  },
  winnerAvatarRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: '1.5rem',
  },
  gameOverTitle: {
    position: 'relative',
    zIndex: 1,
    fontSize: '2.5rem',
    fontWeight: 700,
    color: 'var(--text-dim)',
  },
  winnerBanner: {
    position: 'relative',
    zIndex: 1,
    fontSize: '3.5rem',
    fontWeight: 800,
    color: 'var(--gold)',
    textAlign: 'center',
  },
  standingRowWinner: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    fontSize: '2.25rem',
    fontWeight: 700,
    padding: '1rem 1.5rem',
    borderRadius: '0.75rem',
    background: 'rgba(212, 175, 55, 0.14)',
    border: '3px solid var(--gold)',
    color: 'var(--text)',
  },
  wakeLockHint: {
    fontSize: '0.9rem',
    color: 'var(--text-faint)',
  },
  powerHint: {
    fontSize: '0.85rem',
    color: 'var(--text-faint)',
    textAlign: 'center',
    cursor: 'pointer',
    maxWidth: '32rem',
  },
  powerHintDismiss: {
    fontWeight: 700,
  },
  progressBarTrack: {
    width: '100%',
    maxWidth: '500px',
    height: '0.5rem',
    borderRadius: '999px',
    background: 'var(--border)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    background: 'var(--gold)',
    borderRadius: '999px',
    transition: 'width 1s linear',
  },
};
