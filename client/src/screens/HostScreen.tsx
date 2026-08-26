import { useEffect, useRef, useState } from 'react';
import {
  ClientEvents,
  DEFAULT_GAME_MODE,
  DEFAULT_ROOM_SETTINGS,
  ServerEvents,
  isDrawHostPayload,
  isGuessHostPayload,
  isNumericQuestionHostPayload,
  isPowerUpHostPayload,
  isQuestionShowHostPayload,
  isRevealHostPayload,
  isSocratesHostPayload,
  isStealHostPayload,
  type AnswerProgressPayload,
  type DrawProgressPayload,
  type DrawShowHostPayload,
  type DrawShowPayload,
  type GameOverPayload,
  type GamePhase,
  type GuessProgressPayload,
  type GuessRevealShowPayload,
  type GuessShowHostPayload,
  type GuessShowPayload,
  type LobbyUpdatePayload,
  type NumericProgressPayload,
  type NumericQuestionShowHostPayload,
  type NumericQuestionShowPayload,
  type NumericRevealShowPayload,
  type PausedPayload,
  type PhaseChangedPayload,
  type PowerUpProgressPayload,
  type PowerUpShowHostPayload,
  type PowerUpShowPayload,
  type QuestionShowHostPayload,
  type QuestionShowPayload,
  type ResumedPayload,
  type RevealHostPayload,
  type RevealShowPayload,
  type RoomCode,
  type RoomCreatedPayload,
  type RoomSettings,
  type ServerErrorPayload,
  type SettingsUpdatedPayload,
  type SocratesShowPayload,
  type StageAnnouncePayload,
  type StateSyncPayload,
  type StealResolvedPayload,
  type StealShowHostPayload,
  type StealShowPayload,
} from '@game/shared';
import QRCode from 'qrcode';
import { socket } from '../socket';
import { useSocketConnection } from '../useSocketConnection';
import { clearStoredHostRoomCode, getStoredHostRoomCode, setStoredHostRoomCode } from '../hostRoomCode';
import { useGameAudio } from '../hooks/useGameAudio';
import { useWakeLock } from '../hooks/useWakeLock';
import { fullscreenSupported, useFullscreen } from '../hooks/useFullscreen';
import { styles as hostStyles, QR_SIZE_PX } from './host/hostStyles';
import { LobbyView } from './host/LobbyView';
import { PowerUpView } from './host/PowerUpView';
import { StealView } from './host/StealView';
import { StageAnnounceOverlay } from './host/StageAnnounceOverlay';
import { SocratesView } from './host/SocratesView';
import { QuestionView } from './host/QuestionView';
import { RevealView } from './host/RevealView';
import { GameOverView } from './host/GameOverView';
import { DrawView } from './host/DrawView';
import { GuessView } from './host/GuessView';
import { GuessRevealView } from './host/GuessRevealView';
import { NumericQuestionView } from './host/NumericQuestionView';
import { NumericRevealView } from './host/NumericRevealView';

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
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null);
  const [revealSecondsLeft, setRevealSecondsLeft] = useState(0);
  // Power-up (Task 30b). Two pieces of state, exactly like question/
  // answerProgress: the phase payload is set ONCE per phase, and the ticker
  // that follows updates only the progress - so the countdown below can key
  // off `powerUp` alone without every new chooser resetting it.
  const [powerUp, setPowerUp] = useState<PowerUpShowHostPayload | null>(null);
  const [powerUpProgress, setPowerUpProgress] = useState<PowerUpProgressPayload | null>(null);
  const [powerUpSecondsLeft, setPowerUpSecondsLeft] = useState(0);
  // Steal (Task 32) - ONE piece of state for both beats of the phase: the
  // payload carries `resolved`, so the announcement is just a later version of
  // the same object rather than a second screen's worth of state.
  const [steal, setSteal] = useState<StealShowHostPayload | null>(null);
  const [stealSecondsLeft, setStealSecondsLeft] = useState(0);
  // Stage announcement (Task 31a, Task 35) - the TV is the only screen that
  // shows it. Set by stage:announce (which the server emits exactly once per
  // stage, just before the STAGE_ANNOUNCE phase it belongs to) and dropped by
  // the server ending that phase - never on a timer of our own, so the card
  // can never outlive its beat or vanish while the game is still holding.
  const [stageAnnounce, setStageAnnounce] = useState<StageAnnouncePayload | null>(null);
  // Socrates' own phase (Task 39) - same shape as every other held phase:
  // the payload is set once when the beat begins (or on a reconnect into it),
  // and its durationMs is always the server's live remaining time, so the
  // countdown below can key off the object alone.
  const [socrates, setSocrates] = useState<SocratesShowPayload | null>(null);
  const [socratesSecondsLeft, setSocratesSecondsLeft] = useState(0);
  // Drawing mode (Task 56b) - same two-piece pattern as POWER_UP: the phase
  // payload set once per phase/reconnect, and a separate progress ticker so
  // a submission/guess landing never resets the countdown effect below.
  const [draw, setDraw] = useState<DrawShowHostPayload | null>(null);
  const [drawProgress, setDrawProgress] = useState<DrawProgressPayload | null>(null);
  const [drawSecondsLeft, setDrawSecondsLeft] = useState(0);
  const [guess, setGuess] = useState<GuessShowHostPayload | null>(null);
  const [guessProgress, setGuessProgress] = useState<GuessProgressPayload | null>(null);
  const [guessSecondsLeft, setGuessSecondsLeft] = useState(0);
  const [guessReveal, setGuessReveal] = useState<GuessRevealShowPayload | null>(null);
  const [guessRevealSecondsLeft, setGuessRevealSecondsLeft] = useState(0);
  // Numeric mode (Task 66) - same two-piece pattern as DRAW: the phase
  // payload set once per phase/reconnect, and a separate progress ticker so
  // a submission landing never resets the countdown effect below.
  const [numericQuestion, setNumericQuestion] = useState<NumericQuestionShowHostPayload | null>(null);
  const [numericProgress, setNumericProgress] = useState<NumericProgressPayload | null>(null);
  const [numericQuestionSecondsLeft, setNumericQuestionSecondsLeft] = useState(0);
  const [numericReveal, setNumericReveal] = useState<NumericRevealShowPayload | null>(null);
  const [numericRevealSecondsLeft, setNumericRevealSecondsLeft] = useState(0);
  const wakeLockFailed = useWakeLock();
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();
  const {
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
  } = useGameAudio();
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
  // of secondsLeft/revealSecondsLeft/powerUpSecondsLeft/stealSecondsLeft to
  // correct.
  const phaseRef = useRef<GamePhase>('LOBBY');
  // Mirrors `secondsLeft` so the countdown-sound decision can be made from
  // a plain setInterval callback instead of inside setSecondsLeft's
  // functional updater - React 18 StrictMode deliberately double-invokes
  // updater functions in dev to catch impure ones, which would double-fire
  // any side effect (like playing a tone) placed inside one.
  const secondsLeftRef = useRef(Math.ceil(DEFAULT_ROOM_SETTINGS.questionTimeMs / 1000));
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Mirrors `paused` - answer:progress cues must not play mid-pause, and the
  // handler that receives them is registered once, same stale-closure issue.
  const pausedRef = useRef(false);

  // Every call site that sets `secondsLeft` goes through this, so the ref
  // never drifts from the displayed value.
  function applySecondsLeft(value: number) {
    secondsLeftRef.current = value;
    setSecondsLeft(value);
  }

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
        // GAME_OVER screen flashing first.
        setQuestion(null);
        setAnswerProgress(null);
        setReveal(null);
        setGameOver(null);
        setPowerUp(null);
        setPowerUpProgress(null);
        setSteal(null);
        setStageAnnounce(null);
        setSocrates(null);
        setDraw(null);
        setDrawProgress(null);
        setGuess(null);
        setGuessProgress(null);
        setGuessReveal(null);
        setNumericQuestion(null);
        setNumericProgress(null);
        setNumericReveal(null);
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
        // The question a POWER_UP phase preceded starts the instant that
        // phase ends - drop its view rather than leaving it behind.
        setPowerUp(null);
        setPowerUpProgress(null);
        // A steal belonged to the PREVIOUS question - it's over by now, and
        // so is the commentary beat that followed it.
        setSteal(null);
        setSocrates(null);
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

    // Power-up (Task 30b). The host branch of an asymmetric event - the
    // player payload (effects, targets, their own choice) is never meant for
    // the TV and is ignored here, the same way question:show/reveal:show are
    // filtered.
    function handlePowerUpShow(payload: PowerUpShowPayload) {
      if (isPowerUpHostPayload(payload)) {
        setQuestion(null);
        setAnswerProgress(null);
        setReveal(null);
        setPowerUp(payload);
        setPowerUpProgress(payload);
        setSocrates(null);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    // WHO has locked in, never what they picked or at whom - that is all the
    // server sends the host, and all the TV ever shows.
    function handleStageAnnounce(payload: StageAnnouncePayload) {
      setStageAnnounce(payload);
    }

    // Socrates' own phase (Task 39) - host-only, so unlike question:show/
    // reveal:show there is no player variant to filter out. The reveal it
    // follows is dropped here: he speaks alone.
    function handleSocratesShow(payload: SocratesShowPayload) {
      setReveal(null);
      setSteal(null);
      setSocrates(payload);
      setPaused(payload.paused);
      setPausedByName(payload.pausedByName);
      // Only for a LIVE entrance into the beat, exactly like playRevealCue
      // below - never on a state:sync reconnect catching a host up to a beat
      // already in progress, which would replay the line from its start (and
      // could never legitimately ack completion of a clip it didn't play).
      if (!payload.paused) {
        // Task 42c - tells the server the instant this clip genuinely ends,
        // so the phase advances exactly then instead of at a guessed
        // duration. Never fires for a missing/muted/failed clip - the
        // server's own fallback timer covers that case.
        playSocratesLine(payload.lineTemplate, payload.lineTag, () => {
          socket.emit(ClientEvents.SOCRATES_AUDIO_ENDED, {});
        });
      }
    }

    function handlePowerUpProgress(payload: PowerUpProgressPayload) {
      setPowerUpProgress(payload);
    }

    // Steal (Task 32) - the host branch of an asymmetric event. The thief's
    // target list is never sent to the TV at all, so there is nothing here
    // that could give the pick away before it happens.
    function handleStealShow(payload: StealShowPayload) {
      if (isStealHostPayload(payload)) {
        setQuestion(null);
        setAnswerProgress(null);
        setReveal(null);
        setPowerUp(null);
        setPowerUpProgress(null);
        setSteal(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    // Public and symmetric - the points have already moved server-side. The
    // steal:show that follows carries the same `resolved` object; merging it
    // in here too means the announcement lands even if that one is missed.
    function handleStealResolved(payload: StealResolvedPayload) {
      setSteal((current) => (current ? { ...current, resolved: payload } : current));
      if (!pausedRef.current) {
        playRevealCue();
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

    // Drawing mode (Task 56b). The host branch of an asymmetric event -
    // players get their own assigned word, never sent here (see
    // isDrawHostPayload).
    function handleDrawShow(payload: DrawShowPayload) {
      if (isDrawHostPayload(payload)) {
        setGuess(null);
        setGuessProgress(null);
        setGuessReveal(null);
        setDraw(payload);
        setDrawProgress(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    function handleDrawProgress(payload: DrawProgressPayload) {
      setDrawProgress(payload);
    }

    // The host branch of GUESS's three-way asymmetric event - the drawing
    // and the 4 options, never the correct index (see isGuessHostPayload).
    function handleGuessShow(payload: GuessShowPayload) {
      if (isGuessHostPayload(payload)) {
        setDraw(null);
        setDrawProgress(null);
        setGuessReveal(null);
        setGuess(payload);
        // No guessedPlayerIds to seed here (GuessShowHostPayload only
        // carries the counts, never who - see buildGuessHostPayload) -
        // GuessView reads guess.guessedCount/totalGuessers directly until
        // the first guess:progress tick arrives.
        setGuessProgress(null);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    function handleGuessProgress(payload: GuessProgressPayload) {
      setGuessProgress(payload);
    }

    // Public and symmetric, like reveal:show - the round is over, so the
    // drawing and the correct index are both safe to show now.
    function handleGuessRevealShow(payload: GuessRevealShowPayload) {
      setGuess(null);
      setGuessProgress(null);
      setGuessReveal(payload);
      setPaused(payload.paused);
      setPausedByName(payload.pausedByName);
      if (!pausedRef.current) {
        playRevealCue();
      }
    }

    // Numeric mode (Task 66). The host branch of an asymmetric event -
    // players get their own submitted flag, never sent here (see
    // isNumericQuestionHostPayload).
    function handleNumericQuestionShow(payload: NumericQuestionShowPayload) {
      if (isNumericQuestionHostPayload(payload)) {
        setGuess(null);
        setGuessProgress(null);
        setGuessReveal(null);
        setNumericReveal(null);
        setNumericQuestion(payload);
        setNumericProgress(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    function handleNumericProgress(payload: NumericProgressPayload) {
      setNumericProgress(payload);
    }

    // Public and symmetric, like reveal:show - the round is over, so every
    // player's value and the correct answer are both safe to show now.
    function handleNumericRevealShow(payload: NumericRevealShowPayload) {
      setNumericQuestion(null);
      setNumericProgress(null);
      setNumericReveal(payload);
      setPaused(payload.paused);
      setPausedByName(payload.pausedByName);
      if (!pausedRef.current) {
        playRevealCue();
      }
    }

    function handleGamePaused(payload: PausedPayload) {
      setPaused(true);
      setPausedByName(payload.byName);
      // Freezes a Socrates line mid-playback (Task 42b), in step with the
      // phase itself. Scoped to SOCRATES specifically - suspending the
      // context also silences the anti-screensaver keep-alive tone (Task
      // 20's silent oscillator), which every OTHER phase's pause should
      // leave running for as long as the pause lasts.
      if (phaseRef.current === 'SOCRATES') {
        suspendAudio();
      }
    }

    function handleGameResumed(payload: ResumedPayload) {
      setPaused(false);
      setPausedByName(null);
      if (phaseRef.current === 'SOCRATES') {
        resumeAudio();
      }
      // Authoritative correction, not a guess - whichever countdown is
      // currently on screen jumps to the server's real remaining time
      // rather than trusting wherever the local interval happened to freeze.
      const seconds = Math.ceil(payload.remainingMs / 1000);
      if (phaseRef.current === 'QUESTION') {
        applySecondsLeft(seconds);
      } else if (phaseRef.current === 'REVEAL') {
        setRevealSecondsLeft(seconds);
      } else if (phaseRef.current === 'POWER_UP') {
        setPowerUpSecondsLeft(seconds);
      } else if (phaseRef.current === 'STEAL') {
        setStealSecondsLeft(seconds);
      } else if (phaseRef.current === 'SOCRATES') {
        setSocratesSecondsLeft(seconds);
      } else if (phaseRef.current === 'DRAW') {
        setDrawSecondsLeft(seconds);
      } else if (phaseRef.current === 'GUESS') {
        setGuessSecondsLeft(seconds);
      } else if (phaseRef.current === 'GUESS_REVEAL') {
        setGuessRevealSecondsLeft(seconds);
      } else if (phaseRef.current === 'NUMERIC_QUESTION') {
        setNumericQuestionSecondsLeft(seconds);
      } else if (phaseRef.current === 'NUMERIC_REVEAL') {
        setNumericRevealSecondsLeft(seconds);
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
      setGameOver(null);
      setPowerUp(null);
      setPowerUpProgress(null);
      setSteal(null);
      setStageAnnounce(null);
      setSocrates(null);
      setDraw(null);
      setDrawProgress(null);
      setGuess(null);
      setGuessProgress(null);
      setGuessReveal(null);
      setNumericQuestion(null);
      setNumericProgress(null);
      setNumericReveal(null);

      switch (payload.phase) {
        case 'STAGE_ANNOUNCE':
          // Unlike Socrates' question intro, this one DOES catch a
          // reconnect up: the game is genuinely holding on it, so a TV that
          // reattaches mid-beat must show the card, not the next view early.
          setStageAnnounce(payload);
          break;
        case 'LOBBY':
          setRoomCode(payload.code);
          roomCodeRef.current = payload.code;
          setLobby({
            code: payload.code,
            players: payload.players,
            canStart: payload.canStart,
            settings: payload.settings,
            mode: payload.mode,
            availableModes: payload.availableModes,
          });
          setRoomSettings(payload.settings);
          setPaused(false);
          setPausedByName(null);
          break;
        case 'POWER_UP':
          // durationMs is already the time STILL LEFT (see
          // buildPowerUpHostPayload), so the countdown effect below picks
          // up mid-phase rather than restarting from a full 10s.
          if (isPowerUpHostPayload(payload)) {
            setPowerUp(payload);
            setPowerUpProgress(payload);
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
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
        case 'STEAL':
          // durationMs is already the time STILL LEFT on whichever of the
          // phase's two timers is running, so the countdown below picks up
          // mid-phase; `resolved` decides which of the two views is shown.
          if (isStealHostPayload(payload)) {
            setSteal(payload);
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        case 'SOCRATES':
          // A real hold, like STAGE_ANNOUNCE - a TV reattaching mid-line gets
          // the same line back and `durationMs` is what's actually LEFT of the
          // beat, so the bar picks up mid-phase instead of restarting.
          if (isSocratesHostPayload(payload)) {
            setSocrates(payload);
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        case 'GAME_OVER':
          setGameOver(payload);
          break;
        // Drawing mode (Task 56b) - same live-broadcast builders as the
        // fresh phase entry, so a reconnect mid-DRAW/GUESS/GUESS_REVEAL
        // restores exactly the same screen (criterion 1).
        case 'DRAW':
          if (isDrawHostPayload(payload)) {
            setDraw(payload);
            setDrawProgress(payload);
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        case 'GUESS':
          if (isGuessHostPayload(payload)) {
            setGuess(payload);
            setGuessProgress(null); // see handleGuessShow's comment
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        case 'GUESS_REVEAL':
          setGuessReveal(payload);
          setPaused(payload.paused);
          setPausedByName(payload.pausedByName);
          break;
        // Numeric mode (Task 66) - same live-broadcast builders as the fresh
        // phase entry, so a reconnect mid-NUMERIC_QUESTION/NUMERIC_REVEAL
        // restores exactly the same screen (criterion 1).
        case 'NUMERIC_QUESTION':
          if (isNumericQuestionHostPayload(payload)) {
            setNumericQuestion(payload);
            setNumericProgress(payload);
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        case 'NUMERIC_REVEAL':
          setNumericReveal(payload);
          setPaused(payload.paused);
          setPausedByName(payload.pausedByName);
          break;
      }
    }

    socket.on(ServerEvents.ROOM_CREATED, handleRoomCreated);
    socket.on(ServerEvents.ERROR, handleServerError);
    socket.on(ServerEvents.LOBBY_UPDATE, handleLobbyUpdate);
    socket.on(ServerEvents.PHASE_CHANGED, handlePhaseChanged);
    socket.on(ServerEvents.QUESTION_SHOW, handleQuestionShow);
    socket.on(ServerEvents.ANSWER_PROGRESS, handleAnswerProgress);
    socket.on(ServerEvents.POWER_UP_SHOW, handlePowerUpShow);
    socket.on(ServerEvents.POWER_UP_PROGRESS, handlePowerUpProgress);
    socket.on(ServerEvents.STAGE_ANNOUNCE, handleStageAnnounce);
    socket.on(ServerEvents.SOCRATES_SHOW, handleSocratesShow);
    socket.on(ServerEvents.STEAL_SHOW, handleStealShow);
    socket.on(ServerEvents.STEAL_RESOLVED, handleStealResolved);
    socket.on(ServerEvents.REVEAL_SHOW, handleRevealShow);
    socket.on(ServerEvents.DRAW_SHOW, handleDrawShow);
    socket.on(ServerEvents.DRAW_PROGRESS, handleDrawProgress);
    socket.on(ServerEvents.GUESS_SHOW, handleGuessShow);
    socket.on(ServerEvents.GUESS_PROGRESS, handleGuessProgress);
    socket.on(ServerEvents.GUESS_REVEAL_SHOW, handleGuessRevealShow);
    socket.on(ServerEvents.NUMERIC_QUESTION_SHOW, handleNumericQuestionShow);
    socket.on(ServerEvents.NUMERIC_PROGRESS, handleNumericProgress);
    socket.on(ServerEvents.NUMERIC_REVEAL_SHOW, handleNumericRevealShow);
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
      socket.off(ServerEvents.POWER_UP_SHOW, handlePowerUpShow);
      socket.off(ServerEvents.POWER_UP_PROGRESS, handlePowerUpProgress);
      socket.off(ServerEvents.STAGE_ANNOUNCE, handleStageAnnounce);
      socket.off(ServerEvents.SOCRATES_SHOW, handleSocratesShow);
      socket.off(ServerEvents.STEAL_SHOW, handleStealShow);
      socket.off(ServerEvents.STEAL_RESOLVED, handleStealResolved);
      socket.off(ServerEvents.REVEAL_SHOW, handleRevealShow);
      socket.off(ServerEvents.DRAW_SHOW, handleDrawShow);
      socket.off(ServerEvents.DRAW_PROGRESS, handleDrawProgress);
      socket.off(ServerEvents.GUESS_SHOW, handleGuessShow);
      socket.off(ServerEvents.GUESS_PROGRESS, handleGuessProgress);
      socket.off(ServerEvents.GUESS_REVEAL_SHOW, handleGuessRevealShow);
      socket.off(ServerEvents.NUMERIC_QUESTION_SHOW, handleNumericQuestionShow);
      socket.off(ServerEvents.NUMERIC_PROGRESS, handleNumericProgress);
      socket.off(ServerEvents.NUMERIC_REVEAL_SHOW, handleNumericRevealShow);
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

  // Local countdown driving REVEAL's progress bar - purely cosmetic, so the
  // moment doesn't feel abrupt. The server's own timer is what actually
  // advances the game; this never has to be trusted. `reveal.autoAdvanceMs`
  // is ALWAYS the live server-computed remaining time (fresh or reconnect
  // alike), so resetting from it whenever the object itself changes is
  // always correct.
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

  // POWER_UP's own countdown (Task 30b) - same pattern as the one above, and
  // for the same reason it can key off `powerUp`: that object is set once per
  // phase, and its durationMs is always the server's live remaining time
  // (fresh phase or reconnect alike). Progress ticks live in separate state,
  // so a player locking in never rewinds the clock on screen.
  useEffect(() => {
    if (!powerUp) {
      return;
    }
    setPowerUpSecondsLeft(Math.ceil(powerUp.durationMs / 1000));
  }, [powerUp]);

  useEffect(() => {
    if (!powerUp || paused) {
      return;
    }
    const interval = setInterval(() => {
      setPowerUpSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [powerUp, paused]);

  // STEAL's own countdown (Task 32) - same pattern as POWER_UP's above. Only
  // the picking beat shows it; once `resolved` is set the view is an
  // announcement, and the (shorter) timer underneath is nobody's business.
  useEffect(() => {
    if (!steal) {
      return;
    }
    setStealSecondsLeft(Math.ceil(steal.durationMs / 1000));
  }, [steal]);

  useEffect(() => {
    if (!steal || steal.resolved || paused) {
      return;
    }
    const interval = setInterval(() => {
      setStealSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [steal, paused]);

  // SOCRATES' own countdown (Task 39) - same pattern as REVEAL's above, and
  // for the same reason it can key off `socrates`: that object is set once
  // per beat, and its durationMs is always the server's live remaining time
  // (fresh phase or reconnect alike).
  useEffect(() => {
    if (!socrates) {
      return;
    }
    setSocratesSecondsLeft(Math.ceil(socrates.durationMs / 1000));
  }, [socrates]);

  useEffect(() => {
    if (!socrates || paused) {
      return;
    }
    const interval = setInterval(() => {
      setSocratesSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [socrates, paused]);

  // Drawing mode (Task 56b) - DRAW/GUESS's own countdowns, same pattern as
  // POWER_UP's above: `durationMs` is always the server's live remaining
  // time (fresh phase or reconnect alike), so the interval can key off the
  // phase object alone without a submission/guess resetting it.
  useEffect(() => {
    if (!draw) {
      return;
    }
    setDrawSecondsLeft(Math.ceil(draw.durationMs / 1000));
  }, [draw]);

  useEffect(() => {
    if (!draw || paused) {
      return;
    }
    const interval = setInterval(() => {
      setDrawSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [draw, paused]);

  useEffect(() => {
    if (!guess) {
      return;
    }
    setGuessSecondsLeft(Math.ceil(guess.durationMs / 1000));
  }, [guess]);

  useEffect(() => {
    if (!guess || paused) {
      return;
    }
    const interval = setInterval(() => {
      setGuessSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [guess, paused]);

  // GUESS_REVEAL's progress bar - same pattern as REVEAL's above.
  useEffect(() => {
    if (!guessReveal) {
      return;
    }
    setGuessRevealSecondsLeft(Math.ceil(guessReveal.autoAdvanceMs / 1000));
  }, [guessReveal]);

  useEffect(() => {
    if (!guessReveal || paused) {
      return;
    }
    const interval = setInterval(() => {
      setGuessRevealSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [guessReveal, paused]);

  // Numeric mode (Task 66) - same pattern as DRAW/GUESS's above: `durationMs`
  // is always the server's live remaining time (fresh phase or reconnect
  // alike), so the interval can key off the phase object alone without a
  // submission resetting it.
  useEffect(() => {
    if (!numericQuestion) {
      return;
    }
    setNumericQuestionSecondsLeft(Math.ceil(numericQuestion.durationMs / 1000));
  }, [numericQuestion]);

  useEffect(() => {
    if (!numericQuestion || paused) {
      return;
    }
    const interval = setInterval(() => {
      setNumericQuestionSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [numericQuestion, paused]);

  // NUMERIC_REVEAL's progress bar - same pattern as REVEAL's above.
  useEffect(() => {
    if (!numericReveal) {
      return;
    }
    setNumericRevealSecondsLeft(Math.ceil(numericReveal.autoAdvanceMs / 1000));
  }, [numericReveal]);

  useEffect(() => {
    if (!numericReveal || paused) {
      return;
    }
    const interval = setInterval(() => {
      setNumericRevealSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [numericReveal, paused]);

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

  function renderPhaseView() {
    // The announcement is a phase of its own (Task 35), so it renders ALONE:
    // the question it precedes hasn't started server-side yet, and nothing
    // else may be on screen underneath it.
    if (phase === 'STAGE_ANNOUNCE' && stageAnnounce) {
      return <StageAnnounceOverlay announce={stageAnnounce} />;
    }

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

    // Socrates has the screen to himself for his beat (Task 39) - the reveal
    // it follows is already gone by the time this renders.
    if (phase === 'SOCRATES' && socrates) {
      return (
        <SocratesView
          socrates={socrates}
          roomCode={roomCode}
          paused={paused}
          pausedByName={pausedByName}
          secondsLeft={socratesSecondsLeft}
        />
      );
    }

    if (phase === 'STEAL' && steal) {
      return (
        <StealView
          steal={steal}
          roomCode={roomCode}
          paused={paused}
          pausedByName={pausedByName}
          secondsLeft={stealSecondsLeft}
        />
      );
    }

    if (phase === 'POWER_UP' && powerUp) {
      return (
        <PowerUpView
          powerUp={powerUp}
          progress={powerUpProgress}
          roomCode={roomCode}
          paused={paused}
          pausedByName={pausedByName}
          secondsLeft={powerUpSecondsLeft}
          players={players}
          connectedCount={connectedCount}
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

    // Drawing mode (Task 56b).
    if (phase === 'DRAW' && draw) {
      return (
        <DrawView
          draw={draw}
          progress={drawProgress}
          roomCode={roomCode}
          paused={paused}
          pausedByName={pausedByName}
          secondsLeft={drawSecondsLeft}
          players={players}
        />
      );
    }

    if (phase === 'GUESS' && guess) {
      return (
        <GuessView
          guess={guess}
          progress={guessProgress}
          roomCode={roomCode}
          paused={paused}
          pausedByName={pausedByName}
          secondsLeft={guessSecondsLeft}
        />
      );
    }

    if (phase === 'GUESS_REVEAL' && guessReveal) {
      return (
        <GuessRevealView
          guessReveal={guessReveal}
          roomCode={roomCode}
          paused={paused}
          pausedByName={pausedByName}
          secondsLeft={guessRevealSecondsLeft}
        />
      );
    }

    // Numeric mode (Task 66).
    if (phase === 'NUMERIC_QUESTION' && numericQuestion) {
      return (
        <NumericQuestionView
          question={numericQuestion}
          progress={numericProgress}
          roomCode={roomCode}
          paused={paused}
          pausedByName={pausedByName}
          secondsLeft={numericQuestionSecondsLeft}
          players={players}
        />
      );
    }

    if (phase === 'NUMERIC_REVEAL' && numericReveal) {
      return (
        <NumericRevealView
          reveal={numericReveal}
          roomCode={roomCode}
          paused={paused}
          pausedByName={pausedByName}
          secondsLeft={numericRevealSecondsLeft}
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
        onToggleMuted={toggleMuted}
        onCreateRoom={handleCreateRoom}
        qrCanvasRef={qrCanvasRef}
        players={players}
        connectedCount={connectedCount}
        roomSettings={roomSettings}
        mode={lobby?.mode ?? DEFAULT_GAME_MODE}
        availableModes={lobby?.availableModes ?? []}
        vip={vip}
        powerHintDismissed={powerHintDismissed}
        onDismissPowerHint={() => setPowerHintDismissed(true)}
      />
    );
  }

  // Hidden mid-play once it's actually active, so it never competes with
  // question/reveal/steal overlays - Esc (or a system gesture) still brings
  // it back via fullscreenchange, letting the host re-enter. During
  // LOBBY/GAME_OVER it's always shown either way.
  const isPlayPhase = phase !== 'LOBBY' && phase !== 'GAME_OVER';
  const showFullscreenToggle = fullscreenSupported && !(isPlayPhase && isFullscreen);

  return (
    <>
      {showFullscreenToggle && (
        <button
          type="button"
          data-testid="fullscreen-toggle"
          onClick={toggleFullscreen}
          style={hostStyles.fullscreenToggle}
          aria-label={isFullscreen ? 'Έξοδος από πλήρη οθόνη' : 'Πλήρης οθόνη'}
        >
          {isFullscreen ? '⤡' : '⤢'}
        </button>
      )}
      {renderPhaseView()}
    </>
  );
}
