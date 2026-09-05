import { useEffect, useRef, useState } from 'react';
import {
  ClientEvents,
  DEFAULT_GAME_MODE,
  DEFAULT_ROOM_SETTINGS,
  ServerEvents,
  isBlitzRevealHostPayload,
  isBlitzShowHostPayload,
  isDrawHostPayload,
  isGuessHostPayload,
  isNumericQuestionHostPayload,
  isPowerUpHostPayload,
  isQuestionShowHostPayload,
  isRevealHostPayload,
  isSocratesHostPayload,
  isStealHostPayload,
  isTrialQuestionHostPayload,
  type AnswerProgressPayload,
  type BlitzRevealHostPayload,
  type BlitzRevealPayload,
  type BlitzShowHostPayload,
  type BlitzShowPayload,
  type CrowdIntensityPayload,
  type CrowdMood,
  type CrowdMoodPayload,
  type DrawShowHostPayload,
  type DrawShowPayload,
  type GameOverPayload,
  type GamePhase,
  type GuessRevealShowPayload,
  type GuessShowHostPayload,
  type GuessShowPayload,
  type LobbyUpdatePayload,
  type NumericQuestionShowHostPayload,
  type NumericQuestionShowPayload,
  type NumericRevealShowPayload,
  type PausedPayload,
  type PhaseChangedPayload,
  type PowerUpShowHostPayload,
  type PowerUpShowPayload,
  type QuestionShowHostPayload,
  type QuestionShowPayload,
  type ResumedPayload,
  type RevealHostPayload,
  type RevealShowPayload,
  type PlayerStanding,
  type RoomCode,
  type RoomCreatedPayload,
  type RoomSettings,
  type ServerErrorPayload,
  type SettingsUpdatedPayload,
  type SocratesShowPayload,
  type StageAnnouncePayload,
  type DevVoiceLinesPayload,
  type StateSyncPayload,
  type StealResolvedPayload,
  type StealShowHostPayload,
  type StealShowPayload,
  type TrialQuestionShowHostPayload,
  type TrialQuestionShowPayload,
  type TrialRevealShowPayload,
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
import { TrialQuestionView } from './host/TrialQuestionView';
import { TrialRevealView } from './host/TrialRevealView';
import { BlitzView } from './host/BlitzView';
import { BlitzRevealView } from './host/BlitzRevealView';
import { TheatreScene, isSceneLit } from '../components/TheatreScene';
import { SocratesFigure } from '../components/SocratesFigure';
import { MarbleFilterDefs } from '../components/MarbleSlab';
import { SophistsRow, STEAL_TOKEN_FLIGHT_MS, type SophistStanding } from '../components/SophistsRow';
import { Krater, type TimerState } from '../components/Krater';

export default function HostScreen() {
  const { connected } = useSocketConnection();
  const [roomCode, setRoomCode] = useState<RoomCode | null>(null);
  const [lobby, setLobby] = useState<LobbyUpdatePayload | null>(null);
  const [phase, setPhase] = useState<GamePhase>('LOBBY');
  // The theatre scene's crowd reaction (Task 158) - server-derived, HOST
  // ONLY (crowd:mood), consumed as-is. 'calm' is just the pre-first-event
  // rest state, not a value the server ever has to send before it's ready.
  const [crowdMood, setCrowdMood] = useState<CrowdMood>('calm');
  const [question, setQuestion] = useState<QuestionShowHostPayload | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(DEFAULT_ROOM_SETTINGS.questionTimeMs / 1000));
  // The krater's wine level needs remaining/total, not just remaining - one
  // shared value is enough since only one phase's timer is ever on screen
  // at a time (see timerForPhase). Set once at each phase's entry, next to
  // wherever that phase resets its own secondsLeft to the full duration;
  // never touched by a pause/resume correction, which only ever corrects
  // the remaining side.
  const [timerTotalSeconds, setTimerTotalSeconds] = useState(Math.ceil(DEFAULT_ROOM_SETTINGS.questionTimeMs / 1000));
  const [roomSettings, setRoomSettings] = useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);
  const [reveal, setReveal] = useState<RevealHostPayload | null>(null);
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null);
  const [revealSecondsLeft, setRevealSecondsLeft] = useState(0);
  // Power-up (Task 30b). One piece of state: the phase payload, set once per
  // phase - Task 115 deleted the TV's chosen counter and avatar strip, the
  // only thing power_up:progress fed, so there is no progress state left to
  // reset the countdown below.
  const [powerUp, setPowerUp] = useState<PowerUpShowHostPayload | null>(null);
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
  // Drawing mode (Task 56b) - the phase payload, set once per phase/reconnect.
  // The submitted/guessed progress tickers went with the counters and avatar
  // strips they fed (Task 115); the server still counts both and still ends
  // either phase early once everyone has acted.
  const [draw, setDraw] = useState<DrawShowHostPayload | null>(null);
  const [drawSecondsLeft, setDrawSecondsLeft] = useState(0);
  const [guess, setGuess] = useState<GuessShowHostPayload | null>(null);
  const [guessSecondsLeft, setGuessSecondsLeft] = useState(0);
  const [guessReveal, setGuessReveal] = useState<GuessRevealShowPayload | null>(null);
  const [guessRevealSecondsLeft, setGuessRevealSecondsLeft] = useState(0);
  // Numeric mode (Task 66) - the phase payload, set once per phase/reconnect.
  // There is no progress ticker state any more: Task 114 deleted the TV's
  // locked-in counter and avatar strip, the only thing numeric:progress fed.
  // The server still counts submissions and still ends the phase early once
  // everyone has locked in - that path never went through this screen.
  const [numericQuestion, setNumericQuestion] = useState<NumericQuestionShowHostPayload | null>(null);
  const [numericQuestionSecondsLeft, setNumericQuestionSecondsLeft] = useState(0);
  const [numericReveal, setNumericReveal] = useState<NumericRevealShowPayload | null>(null);
  const [numericRevealSecondsLeft, setNumericRevealSecondsLeft] = useState(0);
  // Task 156a - the blitz mode's phase payload, same one-per-phase pattern.
  const [blitz, setBlitz] = useState<BlitzShowHostPayload | null>(null);
  const [blitzSecondsLeft, setBlitzSecondsLeft] = useState(0);
  const [blitzReveal, setBlitzReveal] = useState<BlitzRevealHostPayload | null>(null);
  const [blitzRevealSecondsLeft, setBlitzRevealSecondsLeft] = useState(0);
  // Η Δίκη (Task 128) - same pattern as QUESTION/REVEAL: the payload is set
  // once per beat/reconnect, and durationMs/autoAdvanceMs is always the
  // server's live remaining time. trialQuestionSecondsLeft doubles as the
  // clock the cosmetic drain animates against (see trialDisplayStandings).
  const [trialQuestion, setTrialQuestion] = useState<TrialQuestionShowHostPayload | null>(null);
  const [trialQuestionSecondsLeft, setTrialQuestionSecondsLeft] = useState(0);
  const [trialReveal, setTrialReveal] = useState<TrialRevealShowPayload | null>(null);
  const [trialRevealSecondsLeft, setTrialRevealSecondsLeft] = useState(0);
  const wakeLockFailed = useWakeLock();
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();
  const {
    muted,
    toggleMuted,
    startKeepAliveAudio,
    suspendAudio,
    resumeAudio,
    loadCrowdSounds,
    applyCrowdIntensity,
    bumpCrowdIntensity,
    playCrowdOneShot,
    holdCrowdIntensity,
    playSocratesLine,
    prefetchSocratesLines,
  } = useGameAudio();
  const [paused, setPaused] = useState(false);
  const [pausedByName, setPausedByName] = useState<string | null>(null);
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

  // Every call site that sets `secondsLeft` goes through this, so the ref
  // never drifts from the displayed value.
  function applySecondsLeft(value: number) {
    secondsLeftRef.current = value;
    setSecondsLeft(value);
  }

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

    function handleCrowdMood(payload: CrowdMoodPayload) {
      setCrowdMood(payload.mood);
      // Task 36c - the one-shots (cheer/boo only; calm/tension play
      // nothing). Not gated on `paused`: a mood change while paused isn't
      // structurally reachable (phase transitions are frozen too), but the
      // hook itself is a no-op without a live AudioContext regardless.
      playCrowdOneShot(payload.mood);
    }

    // Task 36c - the crowd bed's ramp target. Host-only, exactly like
    // crowd:mood.
    function handleCrowdIntensity(payload: CrowdIntensityPayload) {
      applyCrowdIntensity(payload);
    }

    // Task 36d - each landed answer bumps the crowd ramp a step further;
    // phaseRef (not `phase`) because this handler is registered once.
    function handleAnswerProgress(_payload: AnswerProgressPayload) {
      bumpCrowdIntensity(phaseRef.current);
    }

    function handlePhaseChanged(payload: PhaseChangedPayload) {
      setPhase(payload.phase);
      phaseRef.current = payload.phase;
      if (payload.phase === 'LOBBY') {
        // A fresh game (via "play again") - clear every transient round view
        // so the lobby renders cleanly instead of a stale QUESTION/REVEAL/
        // GAME_OVER screen flashing first.
        setQuestion(null);
        setReveal(null);
        setGameOver(null);
        setPowerUp(null);
        setSteal(null);
        setStageAnnounce(null);
        setSocrates(null);
        setDraw(null);
        setGuess(null);
        setGuessReveal(null);
        setNumericQuestion(null);
        setNumericReveal(null);
        setTrialQuestion(null);
        setTrialReveal(null);
        setBlitz(null);
        setBlitzReveal(null);
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
        setTimerTotalSeconds(Math.ceil(payload.questionTimeMs / 1000));
        setReveal(null);
        // The question a POWER_UP phase preceded starts the instant that
        // phase ends - drop its view rather than leaving it behind.
        setPowerUp(null);
        // A steal belonged to the PREVIOUS question - it's over by now, and
        // so is the commentary beat that followed it.
        setSteal(null);
        setSocrates(null);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    // Power-up (Task 30b). The host branch of an asymmetric event - the
    // player payload (effects, targets, their own choice) is never meant for
    // the TV and is ignored here, the same way question:show/reveal:show are
    // filtered.
    function handlePowerUpShow(payload: PowerUpShowPayload) {
      if (isPowerUpHostPayload(payload)) {
        setQuestion(null);
        setReveal(null);
        setPowerUp(payload);
        setSocrates(null);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

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
      // Only for a LIVE entrance into the beat - never on a state:sync
      // reconnect catching a host up to a beat already in progress, which
      // would replay the line from its start (and could never legitimately
      // ack completion of a clip it didn't play).
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

    // Steal (Task 32) - the host branch of an asymmetric event. The thief's
    // target list is never sent to the TV at all, so there is nothing here
    // that could give the pick away before it happens.
    function handleStealShow(payload: StealShowPayload) {
      if (isStealHostPayload(payload)) {
        setQuestion(null);
        setReveal(null);
        setPowerUp(null);
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
    }

    function handleRevealShow(payload: RevealShowPayload) {
      if (isRevealHostPayload(payload)) {
        setReveal(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    // Η Δίκη (Task 128). The host branch of an asymmetric event, same
    // pattern as question:show - the phone's own life/onTrial/lockedIn is
    // never sent here (see isTrialQuestionHostPayload).
    function handleTrialQuestionShow(payload: TrialQuestionShowPayload) {
      if (isTrialQuestionHostPayload(payload)) {
        setTrialReveal(null);
        setTrialQuestion(payload);
        setTrialQuestionSecondsLeft(Math.ceil(payload.durationMs / 1000));
        setTimerTotalSeconds(Math.ceil(payload.durationMs / 1000));
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    // Public and symmetric, like reveal:show - the round is over, so the
    // correct answer and every player's life are both safe to show now.
    function handleTrialRevealShow(payload: TrialRevealShowPayload) {
      setTrialQuestion(null);
      setTrialReveal(payload);
      setPaused(payload.paused);
      setPausedByName(payload.pausedByName);
    }

    // Drawing mode (Task 56b). The host branch of an asymmetric event -
    // players get their own assigned word, never sent here (see
    // isDrawHostPayload).
    function handleDrawShow(payload: DrawShowPayload) {
      if (isDrawHostPayload(payload)) {
        setGuess(null);
        setGuessReveal(null);
        setDraw(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    // The host branch of GUESS's three-way asymmetric event - the drawing
    // and the 4 options, never the correct index (see isGuessHostPayload).
    function handleGuessShow(payload: GuessShowPayload) {
      if (isGuessHostPayload(payload)) {
        setDraw(null);
        setGuessReveal(null);
        setGuess(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    // Public and symmetric, like reveal:show - the round is over, so the
    // drawing and the correct index are both safe to show now.
    function handleGuessRevealShow(payload: GuessRevealShowPayload) {
      setGuess(null);
      setGuessReveal(payload);
      setPaused(payload.paused);
      setPausedByName(payload.pausedByName);
    }

    // Numeric mode (Task 66). The host branch of an asymmetric event -
    // players get their own submitted flag, never sent here (see
    // isNumericQuestionHostPayload).
    function handleNumericQuestionShow(payload: NumericQuestionShowPayload) {
      if (isNumericQuestionHostPayload(payload)) {
        setGuess(null);
        setGuessReveal(null);
        setNumericReveal(null);
        setNumericQuestion(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    // Public and symmetric, like reveal:show - the round is over, so every
    // player's value and the correct answer are both safe to show now.
    function handleNumericRevealShow(payload: NumericRevealShowPayload) {
      setNumericQuestion(null);
      setNumericReveal(payload);
      setPaused(payload.paused);
      setPausedByName(payload.pausedByName);
    }

    // Blitz mode (Task 156a). The host branch of an asymmetric event, same
    // pattern as numeric's own show/reveal handlers above.
    function handleBlitzShow(payload: BlitzShowPayload) {
      if (isBlitzShowHostPayload(payload)) {
        setBlitzReveal(null);
        setBlitz(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    function handleBlitzRevealShow(payload: BlitzRevealPayload) {
      if (isBlitzRevealHostPayload(payload)) {
        setBlitz(null);
        setBlitzReveal(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
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
      // Task 36c - the crowd bed itself is NOT scoped to SOCRATES: it keeps
      // humming through a pause in any phase, so pausing it means freezing
      // whatever ramp is in flight, not suspending playback.
      holdCrowdIntensity();
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
      } else if (phaseRef.current === 'TRIAL_QUESTION') {
        setTrialQuestionSecondsLeft(seconds);
      } else if (phaseRef.current === 'TRIAL_REVEAL') {
        setTrialRevealSecondsLeft(seconds);
      }
    }

    function handleGameOver(payload: GameOverPayload) {
      setGameOver(payload);
      // The game concluded - nothing left to recover on a future refresh
      // unless/until "play again" makes the room live again (see
      // handlePhaseChanged's LOBBY branch, which re-arms this).
      clearStoredHostRoomCode();
    }

    // Catches the TV display up to whatever's live right now - the normal
    // path after host:rejoin (a fresh page load recovering a stored room
    // code, or socket.io's own automatic reconnect after the TV wakes up).
    function handleStateSync(payload: StateSyncPayload) {
      setPhase(payload.phase);
      phaseRef.current = payload.phase;
      setQuestion(null);
      setReveal(null);
      setGameOver(null);
      setPowerUp(null);
      setSteal(null);
      setStageAnnounce(null);
      setSocrates(null);
      setDraw(null);
      setGuess(null);
      setGuessReveal(null);
      setNumericQuestion(null);
      setNumericReveal(null);
      setTrialQuestion(null);
      setTrialReveal(null);
      setBlitz(null);
      setBlitzReveal(null);

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
                setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        case 'GUESS':
          if (isGuessHostPayload(payload)) {
            setGuess(payload);
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
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        case 'NUMERIC_REVEAL':
          setNumericReveal(payload);
          setPaused(payload.paused);
          setPausedByName(payload.pausedByName);
          break;
        // Η Δίκη (Task 128) - same live-broadcast builders as the fresh
        // phase entry (see buildTrialQuestionHostPayload/
        // buildTrialRevealPayload, both durationMs/autoAdvanceMs "time
        // STILL LEFT"), so a reconnect mid-beat restores exactly the same
        // screen (criterion 1).
        case 'TRIAL_QUESTION':
          if (isTrialQuestionHostPayload(payload)) {
            setTrialQuestion(payload);
            setTrialQuestionSecondsLeft(Math.ceil(payload.durationMs / 1000));
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        case 'TRIAL_REVEAL':
          setTrialReveal(payload);
          setPaused(payload.paused);
          setPausedByName(payload.pausedByName);
          break;
        // Task 156a - the blitz mode, same live-broadcast builders as the
        // fresh phase entry.
        case 'BLITZ':
          if (isBlitzShowHostPayload(payload)) {
            setBlitz(payload);
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        case 'BLITZ_REVEAL':
          if (isBlitzRevealHostPayload(payload)) {
            setBlitzReveal(payload);
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
      }
    }

    // Task 154 - the active clip list (LINE_TAGS hashed by lineHash, from
    // the server's collectVoiceLineEntries), answered on every LOBBY entry -
    // see the DEV_GET_VOICE_LINES effect below. Prefetch itself runs once.
    function handleVoiceLines(payload: DevVoiceLinesPayload) {
      prefetchSocratesLines(payload.lines.map((line) => line.hash));
    }

    socket.on(ServerEvents.ROOM_CREATED, handleRoomCreated);
    socket.on(ServerEvents.DEV_VOICE_LINES, handleVoiceLines);
    socket.on(ServerEvents.ERROR, handleServerError);
    socket.on(ServerEvents.LOBBY_UPDATE, handleLobbyUpdate);
    socket.on(ServerEvents.PHASE_CHANGED, handlePhaseChanged);
    socket.on(ServerEvents.QUESTION_SHOW, handleQuestionShow);
    socket.on(ServerEvents.POWER_UP_SHOW, handlePowerUpShow);
    socket.on(ServerEvents.STAGE_ANNOUNCE, handleStageAnnounce);
    socket.on(ServerEvents.SOCRATES_SHOW, handleSocratesShow);
    socket.on(ServerEvents.STEAL_SHOW, handleStealShow);
    socket.on(ServerEvents.STEAL_RESOLVED, handleStealResolved);
    socket.on(ServerEvents.REVEAL_SHOW, handleRevealShow);
    socket.on(ServerEvents.DRAW_SHOW, handleDrawShow);
    socket.on(ServerEvents.GUESS_SHOW, handleGuessShow);
    socket.on(ServerEvents.GUESS_REVEAL_SHOW, handleGuessRevealShow);
    socket.on(ServerEvents.NUMERIC_QUESTION_SHOW, handleNumericQuestionShow);
    socket.on(ServerEvents.NUMERIC_REVEAL_SHOW, handleNumericRevealShow);
    socket.on(ServerEvents.TRIAL_QUESTION_SHOW, handleTrialQuestionShow);
    socket.on(ServerEvents.TRIAL_REVEAL_SHOW, handleTrialRevealShow);
    socket.on(ServerEvents.BLITZ_SHOW, handleBlitzShow);
    socket.on(ServerEvents.BLITZ_REVEAL_SHOW, handleBlitzRevealShow);
    socket.on(ServerEvents.GAME_OVER, handleGameOver);
    socket.on(ServerEvents.STATE_SYNC, handleStateSync);
    socket.on(ServerEvents.SETTINGS_UPDATED, handleSettingsUpdated);
    socket.on(ServerEvents.CROWD_MOOD, handleCrowdMood);
    socket.on(ServerEvents.CROWD_INTENSITY, handleCrowdIntensity);
    socket.on(ServerEvents.ANSWER_PROGRESS, handleAnswerProgress);
    socket.on(ServerEvents.GAME_PAUSED, handleGamePaused);
    socket.on(ServerEvents.GAME_RESUMED, handleGameResumed);

    return () => {
      socket.off(ServerEvents.ROOM_CREATED, handleRoomCreated);
      socket.off(ServerEvents.DEV_VOICE_LINES, handleVoiceLines);
      socket.off(ServerEvents.ERROR, handleServerError);
      socket.off(ServerEvents.LOBBY_UPDATE, handleLobbyUpdate);
      socket.off(ServerEvents.PHASE_CHANGED, handlePhaseChanged);
      socket.off(ServerEvents.QUESTION_SHOW, handleQuestionShow);
      socket.off(ServerEvents.POWER_UP_SHOW, handlePowerUpShow);
      socket.off(ServerEvents.STAGE_ANNOUNCE, handleStageAnnounce);
      socket.off(ServerEvents.SOCRATES_SHOW, handleSocratesShow);
      socket.off(ServerEvents.STEAL_SHOW, handleStealShow);
      socket.off(ServerEvents.STEAL_RESOLVED, handleStealResolved);
      socket.off(ServerEvents.REVEAL_SHOW, handleRevealShow);
      socket.off(ServerEvents.DRAW_SHOW, handleDrawShow);
      socket.off(ServerEvents.GUESS_SHOW, handleGuessShow);
      socket.off(ServerEvents.GUESS_REVEAL_SHOW, handleGuessRevealShow);
      socket.off(ServerEvents.NUMERIC_QUESTION_SHOW, handleNumericQuestionShow);
      socket.off(ServerEvents.NUMERIC_REVEAL_SHOW, handleNumericRevealShow);
      socket.off(ServerEvents.TRIAL_QUESTION_SHOW, handleTrialQuestionShow);
      socket.off(ServerEvents.TRIAL_REVEAL_SHOW, handleTrialRevealShow);
      socket.off(ServerEvents.BLITZ_SHOW, handleBlitzShow);
      socket.off(ServerEvents.BLITZ_REVEAL_SHOW, handleBlitzRevealShow);
      socket.off(ServerEvents.GAME_OVER, handleGameOver);
      socket.off(ServerEvents.STATE_SYNC, handleStateSync);
      socket.off(ServerEvents.SETTINGS_UPDATED, handleSettingsUpdated);
      socket.off(ServerEvents.CROWD_MOOD, handleCrowdMood);
      socket.off(ServerEvents.CROWD_INTENSITY, handleCrowdIntensity);
      socket.off(ServerEvents.ANSWER_PROGRESS, handleAnswerProgress);
      socket.off(ServerEvents.GAME_PAUSED, handleGamePaused);
      socket.off(ServerEvents.GAME_RESUMED, handleGameResumed);
    };
  }, []);

  // Ticks the QUESTION countdown every second while genuinely live - stops
  // entirely while paused, freezing the displayed value exactly where it
  // was (per-second reset to the full/authoritative value happens
  // explicitly in handleQuestionShow/handleStateSync/handleGameResumed
  // above, not here, so a reconnect mid-question or mid-pause never gets
  // clobbered back to the full duration). Task 36c retired the countdown
  // tick/expire tones this used to also drive - the crowd bed's own QUESTION
  // ramp (crowd:intensity) carries that tension now.
  useEffect(() => {
    if (phase !== 'QUESTION' || !question || paused) {
      return;
    }
    const interval = setInterval(() => {
      // Decrement via the ref, not a setState functional updater - React 18
      // StrictMode double-invokes updater functions in dev to catch impure
      // ones.
      const current = secondsLeftRef.current;
      const next = Math.max(0, current - 1);
      secondsLeftRef.current = next;
      setSecondsLeft(next); // plain value, immune to the double-invoke
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
  // (fresh phase or reconnect alike) - no progress tick ever lands in this
  // screen's state now, so a player locking in cannot rewind the clock.
  useEffect(() => {
    if (!powerUp) {
      return;
    }
    setPowerUpSecondsLeft(Math.ceil(powerUp.durationMs / 1000));
    setTimerTotalSeconds(Math.ceil(powerUp.durationMs / 1000));
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
    setTimerTotalSeconds(Math.ceil(steal.durationMs / 1000));
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
    setTimerTotalSeconds(Math.ceil(draw.durationMs / 1000));
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
    setTimerTotalSeconds(Math.ceil(guess.durationMs / 1000));
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
    setTimerTotalSeconds(Math.ceil(numericQuestion.durationMs / 1000));
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

  // Blitz mode (Task 156a) - same pattern as numeric's above.
  useEffect(() => {
    if (!blitz) {
      return;
    }
    setBlitzSecondsLeft(Math.ceil(blitz.durationMs / 1000));
    setTimerTotalSeconds(Math.ceil(blitz.durationMs / 1000));
  }, [blitz]);

  useEffect(() => {
    if (!blitz || paused) {
      return;
    }
    const interval = setInterval(() => {
      setBlitzSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [blitz, paused]);

  useEffect(() => {
    if (!blitzReveal) {
      return;
    }
    setBlitzRevealSecondsLeft(Math.ceil(blitzReveal.autoAdvanceMs / 1000));
  }, [blitzReveal]);

  useEffect(() => {
    if (!blitzReveal || paused) {
      return;
    }
    const interval = setInterval(() => {
      setBlitzRevealSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [blitzReveal, paused]);

  // Η Δίκη (Task 128) - TRIAL_QUESTION's own countdown, same pattern as
  // QUESTION's above. Its tick is also what the cosmetic drain (see
  // trialDisplayStandings) animates against - a stopped interval while
  // paused is exactly "a pause freezes the drain" on the display side too.
  useEffect(() => {
    if (!trialQuestion || paused) {
      return;
    }
    const interval = setInterval(() => {
      setTrialQuestionSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [trialQuestion, paused]);

  // TRIAL_REVEAL's progress bar - same pattern as REVEAL's above.
  useEffect(() => {
    if (!trialReveal) {
      return;
    }
    setTrialRevealSecondsLeft(Math.ceil(trialReveal.autoAdvanceMs / 1000));
  }, [trialReveal]);

  useEffect(() => {
    if (!trialReveal || paused) {
      return;
    }
    const interval = setInterval(() => {
      setTrialRevealSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [trialReveal, paused]);

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

  // Task 154 - warm the HTTP cache with every Socrates clip while the room
  // is still filling, so no first play races the server's backstop. Fire-
  // and-forget: nothing here waits on it, LOBBY renders regardless.
  useEffect(() => {
    if (!roomCode || phase !== 'LOBBY') {
      return;
    }
    socket.emit(ClientEvents.DEV_GET_VOICE_LINES);
  }, [roomCode, phase]);

  // Task 36c - decode the 7 crowd files on every LOBBY entry (first game
  // included - roomCode only ever becomes non-null via the ROOM_CREATED
  // handler, which already ran startKeepAliveAudio and so already has an
  // AudioContext to decode into). loadCrowdSounds guards its own decode/
  // loop-start against a StrictMode double-invoke, so this effect can fire
  // more than once with no duplicate loops.
  useEffect(() => {
    if (!roomCode || phase !== 'LOBBY') {
      return;
    }
    void loadCrowdSounds();
  }, [roomCode, phase]);

  function handleCreateRoom() {
    socket.emit(ClientEvents.CREATE_ROOM, {});
  }

  const players = lobby?.players ?? [];

  // Survives the one-render gap between a phase:changed and the payload
  // that carries that phase's standings - see its use below.
  const lastStandingsRef = useRef<SophistStanding[] | null>(null);

  // Task 163b - the steal flight: the row is held at its PRE-theft standings
  // for STEAL_FLIGHT_MS after a resolution lands, so the kylix token
  // (SophistsRow) actually finishes its flight before the ember delta and
  // the score tween appear - matching the reference's own setTimeout after
  // its .token transition. `stealSeenChoosingRef` gates this on having
  // actually witnessed the "choosing" sub-phase client-side THIS visit: a
  // reconnect that lands already resolved has no pre-theft standings to
  // hold, and would otherwise replay a fake flight on every late join.
  // `stealFlightKeyRef` (effect-owned) makes the setState trigger fire
  // exactly once per resolution. `stealSnapshotKeyRef` is the SEPARATE,
  // render-body-owned guard for the snapshot capture below: it has to be
  // set inline (not deferred to an effect) so a StrictMode double-invoke of
  // this whole render function - which happens BEFORE either invocation's
  // effects run - can't re-capture from an already-corrupted
  // lastStandingsRef (the first invocation's own overwrite further down,
  // still visible to the ref system on a second synchronous invocation).
  const stealSeenChoosingRef = useRef(false);
  const stealFlightKeyRef = useRef<string | null>(null);
  const stealSnapshotKeyRef = useRef<string | null>(null);
  const stealPreResolveStandingsRef = useRef<SophistStanding[] | null>(null);
  const [stealFlightActive, setStealFlightActive] = useState(false);

  useEffect(() => {
    if (!stealFlightActive) {
      return;
    }
    const timer = window.setTimeout(() => setStealFlightActive(false), STEAL_TOKEN_FLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [stealFlightActive]);

  // Η Δίκη (Task 128) - score IS life during the trial (see trialLives,
  // server/src/payloads.ts: `life: player.score`), so trialQuestion.standings
  // already carries it; this only makes the drain since question-start
  // COSMETIC (per-second, against trialQuestionSecondsLeft, exactly like the
  // QUESTION countdown above) rather than server-ticked. `lives[].alive`
  // (not "score <= 0") gates who's already out BEFORE this round: a player
  // can legitimately enter the trial already sitting at exactly 0 life (a
  // quiz stretch with no points at all) and is still ON TRIAL, per
  // trial.livingPlayerIds - "eliminated" isn't decided until THIS round's
  // reveal computes lifeAfter for them, so treating their pre-round 0 as
  // already-out here would fade/freeze their row a full round early. A
  // player this payload already knows locked in is left alone too - their
  // drain stopped for real, server-side, the instant they did. TRIAL_REVEAL
  // always shows the server's own corrected standings directly, no local
  // math.
  function trialDisplayStandings(): PlayerStanding[] {
    if (!trialQuestion) {
      return [];
    }
    const deadBeforeThisRound = new Set(
      trialQuestion.lives.filter((life) => !life.alive).map((life) => life.playerId),
    );
    const elapsedMs = Math.max(0, trialQuestion.questionTimeMs - trialQuestionSecondsLeft * 1000);
    const drain = Math.round((elapsedMs / 1000) * trialQuestion.drainPerSec);
    return trialQuestion.standings.map((standing) => {
      const lockedIn = trialQuestion.lockedInPlayerIds.includes(standing.playerId);
      if (deadBeforeThisRound.has(standing.playerId) || lockedIn || drain === 0) {
        return standing;
      }
      return { ...standing, score: standing.score - drain };
    });
  }

  // Who the sophists row should show as eliminated (sunk + faded, .out).
  // During TRIAL_QUESTION this is `lives[].alive` for the SAME "before this
  // round" reason as above. At TRIAL_REVEAL it is exactly the set
  // trialConfirmedOutPlayerIds below removes, plus everyone already out from
  // an earlier round - never `results[].eliminated` read on its own (see
  // that function for the sudden-death trap), and never "score <= 0".
  function trialEliminatedPlayerIds(): string[] {
    if (phase === 'TRIAL_QUESTION' && trialQuestion) {
      return trialQuestion.lives.filter((life) => !life.alive).map((life) => life.playerId);
    }
    if (phase === 'TRIAL_REVEAL' && trialReveal) {
      // Anyone in standings who wasn't a participant THIS round is there
      // only because an earlier round already eliminated them
      // (trial.livingPlayerIds only ever shrinks), so they stay sunk.
      const judgedThisRound = new Set(trialReveal.results.map((result) => result.playerId));
      const eliminatedEarlier = trialReveal.standings
        .filter((standing) => !judgedThisRound.has(standing.playerId))
        .map((standing) => standing.playerId);
      return [...trialConfirmedOutPlayerIds(), ...eliminatedEarlier];
    }
    return [];
  }

  // Task 137 - who the row REMOVES outright (after the sink+fade has played).
  // NOT `results[].eliminated` alone: a reveal whose OWN round declared
  // sudden death (`nextSuddenDeath`) flags EVERY duelist in it eliminated:
  // true - the eventual winner very possibly included, since landing on
  // exactly zero life off your own correct instant answer is normal - because
  // they all crossed zero together and go to the decider, not out. Server
  // mirrors this same gate for trial.eliminationOrder (server/src/phases.ts)
  // so GAME_OVER's survival order agrees with what actually left the row.
  // A sudden-death round's OWN reveal never marks anyone eliminated either
  // (scoreTrialRound forces it false for all its results - its loser can
  // sit at a negative life and still not be flagged), so this is naturally
  // empty there too - nothing further to remove once the trial's last
  // reveal has run.
  function trialConfirmedOutPlayerIds(): string[] {
    if (phase !== 'TRIAL_REVEAL' || !trialReveal || trialReveal.nextSuddenDeath) {
      return [];
    }
    return trialReveal.results.filter((result) => result.eliminated).map((result) => result.playerId);
  }

  // Standings for the sophists row, read from whichever payload the CURRENT
  // phase carries - never "first non-null", since a previous phase's payload
  // lingers in state and would show stale scores. LOBBY places the roster
  // at zero (hidden, but already coloured by join index so the figures are
  // simply there when stage 1 fades them in); GAME_OVER places the final
  // standings, whose rank is survival order after a trial. null only while
  // an in-game phase's own payload is still in flight (see below).
  function standingsForPhase(): SophistStanding[] | null {
    switch (phase) {
      case 'LOBBY':
        return players.map((player) => ({
          playerId: player.playerId,
          name: player.name,
          score: 0,
          rank: 1,
          connected: player.connected,
        }));
      case 'GAME_OVER':
        return gameOver?.standings ?? null;
      case 'QUESTION':
        return question?.standings ?? null;
      case 'REVEAL':
        return reveal?.standings ?? null;
      case 'POWER_UP':
        return powerUp?.standings ?? null;
      case 'STEAL':
        return steal?.standings ?? null;
      case 'SOCRATES':
        return socrates?.standings ?? null;
      case 'DRAW':
        return draw?.standings ?? null;
      case 'GUESS':
        return guess?.standings ?? null;
      case 'GUESS_REVEAL':
        return guessReveal?.standings ?? null;
      case 'NUMERIC_QUESTION':
        return numericQuestion?.standings ?? null;
      case 'NUMERIC_REVEAL':
        return numericReveal?.standings ?? null;
      case 'TRIAL_QUESTION':
        return trialQuestion ? trialDisplayStandings() : null;
      case 'TRIAL_REVEAL':
        return trialReveal?.standings ?? null;
      case 'BLITZ':
        return blitz?.standings ?? null;
      case 'BLITZ_REVEAL':
        return blitzReveal?.standings ?? null;
      default:
        return null;
    }
  }

  // This beat's SIGNED points per player, the ember delta above each figure.
  // REVEAL / GUESS_REVEAL / STEAL (once resolved: the thief up, the victim
  // down by what actually moved) / NUMERIC_REVEAL / TRIAL_REVEAL (life lost
  // to drain and a wrong answer, so always <= 0) - every other phase passes
  // null, so the delta just isn't there rather than needing an explicit
  // clear step. Zero deltas are dropped by the row itself.
  function deltasThisRound(): Record<string, number> | null {
    if (phase === 'REVEAL' && reveal) {
      return Object.fromEntries(reveal.results.map((result) => [result.playerId, result.pointsAwarded]));
    }
    if (phase === 'GUESS_REVEAL' && guessReveal) {
      return {
        ...Object.fromEntries(guessReveal.results.map((result) => [result.playerId, result.pointsAwarded])),
        [guessReveal.drawerPlayerId]: guessReveal.drawerPointsAwarded,
      };
    }
    // Held back while the kylix token is still in flight (see
    // stealFlightActive above) - the delta appears the same moment the
    // token arrives, never before.
    if (phase === 'STEAL' && steal?.resolved && steal.resolved.victimPlayerId && !stealFlightActive) {
      return {
        [steal.resolved.thiefPlayerId]: steal.resolved.stolenAmount,
        [steal.resolved.victimPlayerId]: -steal.resolved.stolenAmount,
      };
    }
    if (phase === 'NUMERIC_REVEAL' && numericReveal) {
      return Object.fromEntries(numericReveal.results.map((result) => [result.playerId, result.pointsAwarded]));
    }
    if (phase === 'TRIAL_REVEAL' && trialReveal) {
      return Object.fromEntries(
        trialReveal.results.map((result) => [result.playerId, result.lifeAfter - result.lifeBefore]),
      );
    }
    if (phase === 'BLITZ_REVEAL' && blitzReveal) {
      return Object.fromEntries(blitzReveal.results.map((result) => [result.playerId, result.pointsAwarded]));
    }
    return null;
  }

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
        <SocratesView socrates={socrates} roomCode={roomCode} paused={paused} pausedByName={pausedByName} />
      );
    }

    if (phase === 'STEAL' && steal) {
      return (
        <StealView
          steal={steal}
          roomCode={roomCode}
          paused={paused}
          pausedByName={pausedByName}
        />
      );
    }

    if (phase === 'POWER_UP' && powerUp) {
      return (
        <PowerUpView powerUp={powerUp} roomCode={roomCode} paused={paused} pausedByName={pausedByName} />
      );
    }

    if (phase === 'QUESTION' && question) {
      return (
        <QuestionView question={question} roomCode={roomCode} paused={paused} pausedByName={pausedByName} />
      );
    }

    // Drawing mode (Task 56b).
    if (phase === 'DRAW' && draw) {
      return (
        <DrawView draw={draw} roomCode={roomCode} paused={paused} pausedByName={pausedByName} />
      );
    }

    if (phase === 'GUESS' && guess) {
      return (
        <GuessView guess={guess} roomCode={roomCode} paused={paused} pausedByName={pausedByName} />
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
          roomCode={roomCode}
          paused={paused}
          pausedByName={pausedByName}
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

    // Η Δίκη (Task 128) - the quiz's finale, reusing the QUESTION/REVEAL
    // pattern (papyrus reads, column carries players).
    if (phase === 'TRIAL_QUESTION' && trialQuestion) {
      return (
        <TrialQuestionView
          trialQuestion={trialQuestion}
          roomCode={roomCode}
          paused={paused}
          pausedByName={pausedByName}
        />
      );
    }

    if (phase === 'TRIAL_REVEAL' && trialReveal) {
      return (
        <TrialRevealView
          trialReveal={trialReveal}
          roomCode={roomCode}
          paused={paused}
          pausedByName={pausedByName}
          revealSecondsLeft={trialRevealSecondsLeft}
        />
      );
    }

    // Blitz mode (Task 156a, stub views - 156b builds the real screen).
    if (phase === 'BLITZ' && blitz) {
      return <BlitzView blitz={blitz} roomCode={roomCode} paused={paused} pausedByName={pausedByName} />;
    }

    if (phase === 'BLITZ_REVEAL' && blitzReveal) {
      return (
        <BlitzRevealView
          reveal={blitzReveal}
          roomCode={roomCode}
          paused={paused}
          pausedByName={pausedByName}
          secondsLeft={blitzRevealSecondsLeft}
        />
      );
    }

    // An in-game phase whose own payload is still in flight (phase:changed
    // always lands before it) renders NOTHING for that one beat - the row
    // and the scene are still there. Falling through to the lobby here put
    // a 648px-tall LobbyView inside the read column for 35-145ms on every
    // transition (measured, Task 161), a visible flash off the bottom.
    if (phase !== 'LOBBY') {
      return null;
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
        roomSettings={roomSettings}
        mode={lobby?.mode ?? DEFAULT_GAME_MODE}
        availableModes={lobby?.availableModes ?? []}
      />
    );
  }

  // Hidden mid-play once it's actually active, so it never competes with
  // question/reveal/steal overlays - Esc (or a system gesture) still brings
  // it back via fullscreenchange, letting the host re-enter. During
  // LOBBY/GAME_OVER it's always shown either way.
  const isPlayPhase = phase !== 'LOBBY' && phase !== 'GAME_OVER';
  const showFullscreenToggle = fullscreenSupported && !(isPlayPhase && isFullscreen);

  // The read column (the marble slab, top of the screen) and the sophists
  // row (the orchestra, bottom) are both owned HERE, not inside GameLayout,
  // so the row keeps its React identity across a phase change - every phase
  // view is a different component type, so anything rendered inside one is
  // unmounted when the phase advances. See GameLayout's own comment: that
  // unmount was silently defeating the settle-then-glide reorder (1800ms +
  // 400ms, Task 112) on the one transition that changes scores.
  // Task 112 - the phase countdown, hoisted out of the phase views (Task 161
  // stands the krater at the top-right, where the column used to be). Each
  // phase keeps its OWN "nearly out" threshold (the one thing that differed
  // between the six rings this replaced), and a phase with no clock of its
  // own returns null so the krater is simply absent. STEAL's clock stops
  // existing the moment the theft resolves, which is exactly when its view
  // swaps to the announcement.
  function timerForPhase(): TimerState | null {
    const ring = (secondsLeftValue: number, criticalAt: number): TimerState => ({
      secondsLeft: secondsLeftValue,
      totalSeconds: timerTotalSeconds,
      critical: !paused && secondsLeftValue <= criticalAt && secondsLeftValue > 0,
    });
    switch (phase) {
      case 'QUESTION':
        return ring(secondsLeft, 5);
      case 'POWER_UP':
        return ring(powerUpSecondsLeft, 5);
      case 'STEAL':
        return steal?.resolved ? null : ring(stealSecondsLeft, 3);
      case 'DRAW':
        return ring(drawSecondsLeft, 10);
      case 'GUESS':
        return ring(guessSecondsLeft, 5);
      case 'NUMERIC_QUESTION':
        return ring(numericQuestionSecondsLeft, 5);
      case 'TRIAL_QUESTION':
        return ring(trialQuestionSecondsLeft, 5);
      case 'BLITZ':
        return ring(blitzSecondsLeft, 5);
      default:
        // REVEAL/GUESS_REVEAL/NUMERIC_REVEAL/TRIAL_REVEAL show their
        // remaining time as the progress bar at the foot of their own
        // panel, not as a ring.
        return null;
    }
  }

  // The phase's own standings, with the LAST ones as a fallback while a
  // phase's payload is still in flight. phase:changed always lands before
  // the payload that follows it (endQuestion emits PHASE_CHANGED, then
  // REVEAL_SHOW), and handleQuestionShow has already cleared the previous
  // reveal - so without this fallback the row had null standings for exactly
  // one render on EVERY question->reveal, emptying the row and refilling it
  // with the new scores already in place. That is what silently killed the
  // counter tween (measured: 0ms, one frame) that Task 41 built and Task 112
  // doubled. The row itself is ALWAYS mounted (hidden in LOBBY and
  // STAGE_ANNOUNCE by opacity only), so it never loses its state at all now.
  // Detect a FRESH steal resolution before overwriting lastStandingsRef
  // below - it still holds the pre-theft standings at this point, exactly
  // what the flight needs to hold the row at. Pure ref mutations only here
  // (matches lastStandingsRef's own established pattern just below) - the
  // actual setState lives in a useEffect (see stealResolutionKey), NOT
  // here: calling a state setter directly in the render body raced badly
  // with StrictMode's dev-only double render-invoke, observed (via
  // temporary logging) flipping stealFlightActive true then immediately
  // back to false within the same tick instead of holding for
  // STEAL_TOKEN_FLIGHT_MS.
  if (phase === 'STEAL' && steal && !steal.resolved) {
    stealSeenChoosingRef.current = true;
  } else if (phase !== 'STEAL') {
    stealSeenChoosingRef.current = false;
  }
  const stealResolutionKey =
    phase === 'STEAL' && steal?.resolved && steal.resolved.victimPlayerId && stealSeenChoosingRef.current
      ? `${steal.questionIndex}:${steal.resolved.thiefPlayerId}:${steal.resolved.victimPlayerId}:${steal.resolved.stolenAmount}`
      : null;
  if (stealResolutionKey && stealSnapshotKeyRef.current !== stealResolutionKey) {
    stealSnapshotKeyRef.current = stealResolutionKey;
    stealPreResolveStandingsRef.current = lastStandingsRef.current;
  }
  // The actual trigger - deliberately an effect, not called here in the
  // render body directly (see the comment above). stealFlightKeyRef is the
  // idempotency guard: StrictMode's dev-only double-invoke of this effect
  // only re-triggers the timer if the key genuinely changed since the
  // guard was last set.
  useEffect(() => {
    if (!stealResolutionKey || stealFlightKeyRef.current === stealResolutionKey) {
      return;
    }
    stealFlightKeyRef.current = stealResolutionKey;
    setStealFlightActive(true);
  }, [stealResolutionKey]);

  const phaseStandings = standingsForPhase();
  const inGamePhase = phase !== 'LOBBY' && phase !== 'STAGE_ANNOUNCE' && phase !== 'GAME_OVER';
  if (phaseStandings) {
    lastStandingsRef.current = phaseStandings;
  }
  const stealFlightHolding =
    phase === 'STEAL' && stealFlightActive && stealPreResolveStandingsRef.current !== null;
  const rowStandings = stealFlightHolding
    ? (stealPreResolveStandingsRef.current as SophistStanding[])
    : (phaseStandings ?? lastStandingsRef.current ?? []);
  const stealFlightTargets =
    phase === 'STEAL' && steal?.resolved && steal.resolved.victimPlayerId && stealFlightActive
      ? { thiefPlayerId: steal.resolved.thiefPlayerId, victimPlayerId: steal.resolved.victimPlayerId }
      : null;
  // The read column - every in-game phase renders inside it (SOCRATES too);
  // LOBBY, STAGE_ANNOUNCE and GAME_OVER render their own full-bleed root.
  const showShell = inGamePhase;

  const isTrialPhase = phase === 'TRIAL_QUESTION' || phase === 'TRIAL_REVEAL';
  const eliminatedPlayerIds = isTrialPhase ? trialEliminatedPlayerIds() : null;
  const confirmedOutPlayerIds = phase === 'TRIAL_REVEAL' ? trialConfirmedOutPlayerIds() : null;
  const lockedInPlayerIds = phase === 'TRIAL_QUESTION' ? (trialQuestion?.lockedInPlayerIds ?? null) : null;
  const timer = showShell ? timerForPhase() : null;

  const phaseView = renderPhaseView();

  return (
    <>
      <MarbleFilterDefs />
      <TheatreScene mood={crowdMood} dimmed={!isSceneLit(phase)} />
      <SocratesFigure phase={phase} />
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
      {showShell ? <div style={hostStyles.gameLayout}>{phaseView}</div> : phaseView}
      {timer && (
        <div style={hostStyles.kraterCorner} data-testid="krater-corner">
          <Krater timer={timer} playerCount={rowStandings.length} />
        </div>
      )}
      <SophistsRow
        standings={rowStandings}
        phase={phase}
        deltas={deltasThisRound()}
        eliminatedPlayerIds={eliminatedPlayerIds}
        confirmedOutPlayerIds={confirmedOutPlayerIds}
        lockedInPlayerIds={lockedInPlayerIds}
        thiefPlayerId={phase === 'STEAL' ? (steal?.thiefPlayerId ?? null) : null}
        victimPlayerId={phase === 'STEAL' ? (steal?.resolved?.victimPlayerId ?? null) : null}
        hideScores={phase === 'GAME_OVER' && (gameOver?.isTrialResult ?? false)}
        stealFlight={stealFlightTargets}
        sabotageByPlayerId={phase === 'QUESTION' ? (question?.sabotage ?? null) : null}
      />
    </>
  );
}
