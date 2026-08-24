import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ANSWER_IDENTITIES,
  AVATAR_CATALOGUE,
  ClientEvents,
  DEFAULT_ROOM_SETTINGS,
  DIFFICULTY_MIX_OPTIONS,
  GAME_LENGTH_OPTIONS,
  MIN_PLAYERS,
  PRESET_NAMES,
  QUESTION_TIME_OPTIONS_MS,
  REVEAL_DURATION_MS,
  ServerEvents,
  isPowerUpHostPayload,
  isQuestionShowHostPayload,
  isRevealHostPayload,
  isSocratesHostPayload,
  isStealHostPayload,
  sanitizeCustomName,
  stagesForLength,
  totalQuestionsForLength,
  type ActiveSabotage,
  type AnswerAcceptedPayload,
  type DifficultyMix,
  type GameLength,
  type GameOverPayload,
  type JoinRejectedPayload,
  type LobbyUpdatePayload,
  type PausedPayload,
  type PhaseChangedPayload,
  type PlayerJoinedPayload,
  type PowerUpChoiceAcceptedPayload,
  type PowerUpChoosePayload,
  type PowerUpEffect,
  type PowerUpShowPayload,
  type PowerUpShowPlayerPayload,
  type QuestionShowPayload,
  type QuestionShowPlayerPayload,
  type ResumedPayload,
  type RevealPlayerPayload,
  type RevealShowPayload,
  type RoomPeekResultPayload,
  type RoomSettings,
  type SabotageEffect,
  type SettingsUpdatedPayload,
  type StateSyncPayload,
  type StealChoosePayload,
  type StealResolvedPayload,
  type StealShowPayload,
  type StealShowPlayerPayload,
  type VipChangedPayload,
} from '@game/shared';
import { socket } from '../socket';
import { useSocketConnection } from '../useSocketConnection';
import { getOrCreatePlayerId } from '../playerId';
import { DIFFICULTY_MIX_LABELS } from '../difficultyLabels';
import { GAME_LENGTH_LABELS } from '../gameLengthLabels';
import { AnswerShape } from '../components/AnswerShape';
import { Avatar } from '../components/Avatar';
import { useAvailableAvatars } from '../hooks/useAvailableAvatars';
import { fullscreenSupported, useFullscreen } from '../hooks/useFullscreen';

// React's CSSProperties doesn't model CSS custom properties - this lets the
// `--glow-color` variable the .glow-pulse class reads (see theme.css) be set
// inline per-element, since each glow needs a different colour.
type CSSVars = CSSProperties & Record<`--${string}`, string>;

// "Slightly lighter panels with a subtle inner glow, so cards feel lit
// rather than painted on." Never combined with an element that also uses
// the .glow/.glow-pulse classes - an inline boxShadow always wins over a
// CSS class's boxShadow and would silently clobber the glow ring.
const SURFACE_GLOW = 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 22px rgba(122,92,210,0.12)';

// Power-up (Task 30b) - the two choosable effects, phrased from the CASTER's
// side ("freeze them"), unlike the victim-side banner during QUESTION.
const POWER_UP_LABELS: Record<PowerUpEffect, { icon: string; title: string; blurb: string }> = {
  ice: { icon: '🧊', title: 'Πάγος', blurb: 'Παγώνει το κινητό του για λίγα δευτερόλεπτα' },
  ink: { icon: '🖋️', title: 'Μελάνι', blurb: 'Θολώνει τις απαντήσεις του' },
};

const REJECTION_MESSAGES: Record<JoinRejectedPayload['reason'], string> = {
  ROOM_NOT_FOUND: 'Λάθος κωδικός δωματίου',
  ROOM_FULL: 'Το δωμάτιο είναι γεμάτο',
  INVALID_NAME: 'Μη έγκυρο όνομα',
  INVALID_AVATAR: 'Μη έγκυρος χαρακτήρας',
  AVATAR_TAKEN: 'Ο χαρακτήρας μόλις πιάστηκε από άλλον παίκτη',
};

// One row of the VIP settings panel - either a row of tappable segmented
// buttons (VIP) or plain read-only text (everyone else). `T` is inferred
// from the props at each call site, no explicit type argument needed.
function SegmentedRow<T extends string | number>({
  label,
  options,
  current,
  format,
  onSelect,
  readOnly,
  testIdPrefix,
}: {
  label: string;
  options: readonly T[];
  current: T;
  format: (option: T) => ReactNode;
  onSelect: (option: T) => void;
  readOnly: boolean;
  testIdPrefix: string;
}) {
  return (
    <div style={styles.settingsRow}>
      <span style={styles.settingsRowLabel}>{label}</span>
      {readOnly ? (
        <span style={styles.settingsRowValue} data-testid={`${testIdPrefix}-readonly`}>
          {format(current)}
        </span>
      ) : (
        <div style={styles.segmentedGroup}>
          {options.map((option) => (
            <button
              key={String(option)}
              type="button"
              data-testid={`${testIdPrefix}-${option}`}
              style={option === current ? styles.segmentActive : styles.segmentInactive}
              onClick={() => onSelect(option)}
            >
              {format(option)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Available to EVERY player (not just the VIP) during QUESTION, REVEAL and
// STEAL - deliberately not VIP-gated, since anyone might need a break.
function PauseControl({
  paused,
  pausedByName,
  onPause,
  onResume,
}: {
  paused: boolean;
  pausedByName: string | null;
  onPause: () => void;
  onResume: () => void;
}) {
  if (paused) {
    return (
      <>
        <div style={styles.pausedNotice} data-testid="paused-notice">
          Ο/Η {pausedByName} έκανε παύση
        </div>
        <button data-testid="resume-button" style={styles.button} type="button" onClick={onResume}>
          Συνέχεια
        </button>
      </>
    );
  }
  return (
    <button data-testid="pause-button" style={styles.pauseButton} type="button" onClick={onPause}>
      Παύση
    </button>
  );
}

// VIP-only, available during QUESTION/REVEAL/STEAL. Requires a second
// confirming tap - it wipes every score, so a single accidental tap must
// never trigger it. Confirm state is local to this component instance, so
// it naturally resets whenever the surrounding view unmounts (e.g. the
// phase actually changes) without any extra plumbing.
function ResetToLobbyControl({ onConfirm }: { onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div style={styles.resetConfirmBox}>
        <div style={styles.resetConfirmText}>Σίγουρα; Θα μηδενιστούν όλοι οι βαθμοί.</div>
        <div style={styles.resetConfirmButtons}>
          <button
            data-testid="reset-confirm-button"
            style={styles.resetConfirmButton}
            type="button"
            onClick={onConfirm}
          >
            Ναι, επιστροφή
          </button>
          <button
            data-testid="reset-cancel-button"
            style={styles.resetCancelButton}
            type="button"
            onClick={() => setConfirming(false)}
          >
            Άκυρο
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      data-testid="reset-to-lobby-button"
      style={styles.resetToLobbyButton}
      type="button"
      onClick={() => setConfirming(true)}
    >
      Επιστροφή στο lobby
    </button>
  );
}

export default function ControllerScreen() {
  const { connected } = useSocketConnection();
  const [playerId] = useState(() => getOrCreatePlayerId());
  const [searchParams] = useSearchParams();

  // Pre-fills from a QR/join link's ?code=XXXX, but never auto-joins - a
  // name is still required, so the player must still tap Join themselves.
  // A malformed param (not exactly 4 digits) is silently ignored.
  const [code, setCode] = useState(() => {
    const param = searchParams.get('code');
    return param && /^\d{4}$/.test(param) ? param : '';
  });
  // The identity picker (Task 26) - NAME then AVATAR, each one tap (or one
  // typed line + confirm for a custom name) to move on, ending on a preview
  // + the actual Join button, all on the avatar step - never a third
  // screen. `selectedName` is the committed choice (preset tap OR a
  // confirmed custom entry); `customDraft` is only the in-progress text
  // field's own value, kept separate so switching back to the preset list
  // never loses what was typed.
  const [joinStep, setJoinStep] = useState<'name' | 'avatar'>('name');
  const [nameFilter, setNameFilter] = useState('');
  const [customNameMode, setCustomNameMode] = useState(false);
  const [customDraft, setCustomDraft] = useState('');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  // Best-effort UI hint only (see room:peek's doc comment in shared) - the
  // real, race-proof check happens server-side at the actual join attempt.
  const [peekedTakenAvatarIds, setPeekedTakenAvatarIds] = useState<string[]>([]);
  const availableAvatars = useAvailableAvatars();
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();
  // The main socket-listener effect below is registered ONCE (empty deps,
  // same convention as the rest of this file) - `code` changes as the user
  // types, so handleRoomPeekResult needs a ref to read its LATEST value
  // rather than closing over the value from mount.
  const codeRef = useRef(code);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<PlayerJoinedPayload | null>(null);
  const [lobby, setLobby] = useState<LobbyUpdatePayload | null>(null);
  const [question, setQuestion] = useState<QuestionShowPlayerPayload | null>(null);
  const [pendingChoice, setPendingChoice] = useState<number | null>(null);
  const [acceptedChoice, setAcceptedChoice] = useState<number | null>(null);
  const [reveal, setReveal] = useState<RevealPlayerPayload | null>(null);
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null);
  const [vipPlayerId, setVipPlayerId] = useState<string | null>(null);
  const [vipName, setVipName] = useState<string | null>(null);
  const [roomSettings, setRoomSettings] = useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);
  const [paused, setPaused] = useState(false);
  const [pausedByName, setPausedByName] = useState<string | null>(null);
  // Sabotage (Task 28b, stacked in Task 31a) - everything running against ME
  // this question, one entry per effect, and how long this phone has been
  // counting since the server last told it. The server hands over each
  // effect's REMAINING time (never a fresh full duration), so every countdown
  // below is `remainingMs - sabotageElapsedMs`: ONE local clock for the whole
  // stack, which is what keeps an ice and an ink landing together from
  // drifting apart on screen.
  const [sabotages, setSabotages] = useState<ActiveSabotage[]>([]);
  const [sabotageElapsedMs, setSabotageElapsedMs] = useState(0);
  // Mirrors `sabotageElapsedMs` so the ticker below can re-anchor from the
  // value already counted (after a pause) without taking it as a dependency
  // and re-anchoring on every single tick.
  const sabotageElapsedRef = useRef(0);
  // Power-up (Task 30b) - two steps on one screen. `powerUpEffect` IS the
  // step: null = pick an effect, set = pick a target, and the back button is
  // just clearing it again. `powerUpChoice` is the locked-in state, set
  // optimistically on the target tap (same discipline as pendingChoice) and
  // re-confirmed by the server's ack with identical values.
  const [powerUp, setPowerUp] = useState<PowerUpShowPlayerPayload | null>(null);
  const [powerUpEffect, setPowerUpEffect] = useState<PowerUpEffect | null>(null);
  const [powerUpChoice, setPowerUpChoice] = useState<PowerUpChoosePayload | null>(null);
  // The one-send guard. A ref, not the state above: two taps landing in the
  // same React batch would both read a stale `powerUpChoice === null`, and
  // the server would log a rejected duplicate. Reset only when a NEW phase's
  // power_up:show arrives, so going back to step 1 can never re-open it.
  const powerUpSentRef = useRef(false);
  // Steal (Task 32). ONE piece of state for the whole phase: `youAreThief`
  // decides whether this phone is the picker or a spectator, and `resolved`
  // turns either of them into the announcement. Both come from the server on
  // every send, so a reconnect never has to be told twice which one this is.
  const [steal, setSteal] = useState<StealShowPlayerPayload | null>(null);
  // The one-send guard, a ref for the same reason as powerUpSentRef above.
  const stealSentRef = useRef(false);

  useEffect(() => {
    function handleJoined(payload: PlayerJoinedPayload) {
      setJoined(payload);
      setError(null);
    }

    // Power-up (Task 30b) - always set together, so the step, the locked-in
    // view and the send guard can never disagree about what this phone has
    // already done. `yourChoice` is null on a fresh phase and only ever real
    // on a state:sync catching a phone up after it already chose.
    function applyPowerUp(payload: PowerUpShowPlayerPayload | null) {
      setPowerUp(payload);
      setPowerUpEffect(null);
      setPowerUpChoice(payload?.yourChoice ?? null);
      powerUpSentRef.current = payload?.yourChoice != null;
    }

    // Steal (Task 32) - set together for the same reason applyPowerUp is: the
    // picker, the send guard and the announcement can never disagree about
    // what this phone has already done. `yourChoice` is only ever real on a
    // state:sync catching a thief up after they already picked.
    function applySteal(payload: StealShowPlayerPayload | null) {
      setSteal(payload);
      stealSentRef.current = payload?.yourChoice != null || payload?.resolved != null;
    }

    function handlePhaseChanged(payload: PhaseChangedPayload) {
      if (payload.phase === 'LOBBY') {
        // A fresh game (via "play again") - clear every transient round
        // view so we fall back to the `joined` waiting view below, with no
        // need to re-enter the room code.
        setQuestion(null);
        setPendingChoice(null);
        setAcceptedChoice(null);
        setReveal(null);
        setGameOver(null);
        applyPowerUp(null);
        applySteal(null);
        // Pause is impossible in LOBBY - reset defensively.
        setPaused(false);
        setPausedByName(null);
      }
    }

    function handleRejected(payload: JoinRejectedPayload) {
      setError(REJECTION_MESSAGES[payload.reason]);
      if (payload.reason === 'AVATAR_TAKEN' || payload.reason === 'INVALID_AVATAR') {
        // Someone else just claimed it (or it disappeared) - drop the pick
        // and let them choose again from the grid, which a fresh peek below
        // will also re-grey.
        setSelectedAvatarId(null);
        setJoinStep('avatar');
      }
    }

    function handleRoomPeekResult(payload: RoomPeekResultPayload) {
      if (payload.code === codeRef.current) {
        setPeekedTakenAvatarIds(payload.takenAvatarIds);
      }
    }

    function handleLobbyUpdate(payload: LobbyUpdatePayload) {
      setLobby(payload);
      setRoomSettings(payload.settings);
      const vip = payload.players.find((player) => player.isVip);
      setVipPlayerId(vip ? vip.playerId : null);
      if (vip) {
        setVipName(vip.name);
      }
    }

    function handleVipChanged(payload: VipChangedPayload) {
      setVipPlayerId(payload.playerId);
      setVipName(payload.name);
    }

    function handleSettingsUpdated(payload: SettingsUpdatedPayload) {
      setRoomSettings(payload);
    }

    // Sabotage (Task 28b) - the stack and its countdown are always set
    // together from the server's own figures, so they can never disagree.
    // Elapsed always restarts at 0: every `remainingMs` in `next` was
    // computed by the server this instant.
    function applySabotages(next: ActiveSabotage[]) {
      setSabotages(next);
      sabotageElapsedRef.current = 0;
      setSabotageElapsedMs(0);
    }

    function handleQuestionShow(payload: QuestionShowPayload) {
      if (!isQuestionShowHostPayload(payload)) {
        setQuestion(payload);
        setPendingChoice(null);
        setAcceptedChoice(null);
        setReveal(null);
        // POWER_UP flows straight into the question it preceded - whatever
        // was chosen is now the server's business, and lands right here.
        applyPowerUp(null);
        applySteal(null); // any steal belonged to the previous question
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
        applySabotages(payload.yourSabotages);
      }
    }

    // The player branch of an asymmetric event - the host variant (which
    // carries who has locked in) is not this screen's business.
    function handlePowerUpShow(payload: PowerUpShowPayload) {
      if (!isPowerUpHostPayload(payload)) {
        setQuestion(null);
        setPendingChoice(null);
        setAcceptedChoice(null);
        setReveal(null);
        applySabotages([]);
        applyPowerUp(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    // The ack for THIS phone's own choice alone - it says nothing about
    // anyone else's. Confirms what was already shown optimistically.
    function handlePowerUpChoiceAccepted(payload: PowerUpChoiceAcceptedPayload) {
      powerUpSentRef.current = true;
      setPowerUpChoice({ effect: payload.effect, targetPlayerId: payload.targetPlayerId });
    }

    // Steal (Task 32) - the player branch of an asymmetric event. Only ONE
    // phone in the room gets a payload with `youAreThief: true` and a target
    // list; the rest get a spectator view naming the thief.
    function handleStealShow(payload: StealShowPayload) {
      if (!isStealHostPayload(payload)) {
        setQuestion(null);
        setPendingChoice(null);
        setAcceptedChoice(null);
        setReveal(null); // the steal replaces the reveal it followed
        applySabotages([]);
        applyPowerUp(null);
        applySteal(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    // Public - the points have already moved. The steal:show that follows
    // carries the same object; merging here too means the announcement lands
    // even if that one is missed.
    function handleStealResolved(payload: StealResolvedPayload) {
      stealSentRef.current = true;
      setSteal((current) => (current ? { ...current, resolved: payload } : current));
    }

    function handleAnswerAccepted(payload: AnswerAcceptedPayload) {
      setAcceptedChoice(payload.choice);
    }

    function handleRevealShow(payload: RevealShowPayload) {
      if (!isRevealHostPayload(payload)) {
        setReveal(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
        applySabotages([]); // the question it belonged to is over
        applySteal(null); // as is any steal from the round before it
      }
    }

    function handleGameOver(payload: GameOverPayload) {
      setGameOver(payload);
      applySabotages([]);
      applySteal(null);
    }

    function handleGamePaused(payload: PausedPayload) {
      setPaused(true);
      setPausedByName(payload.byName);
    }

    // The phone doesn't render a countdown of its own (only the TV does),
    // so unlike HostScreen there's no remainingMs correction to apply here.
    function handleGameResumed(_payload: ResumedPayload) {
      setPaused(false);
      setPausedByName(null);
    }

    function handleStateSync(payload: StateSyncPayload) {
      // Always start from a clean slate - only ONE of these ends up set,
      // matching whatever phase we're catching up to.
      setQuestion(null);
      setPendingChoice(null);
      setAcceptedChoice(null);
      setReveal(null);
      setGameOver(null);
      applySabotages([]);
      applyPowerUp(null);
      applySteal(null);

      switch (payload.phase) {
        case 'LOBBY':
          // Never actually sent (state:sync only fires when phase !==
          // 'LOBBY') - lobby:update already covers the waiting view.
          break;
        case 'POWER_UP':
          // The reconnect case that matters: applyPowerUp reads `yourChoice`
          // and lands this phone on the locked-in view if it already chose,
          // or back at step 1 if it didn't. `durationMs` is the time still
          // left, and `targets` is rebuilt from who is connected NOW.
          if (!isPowerUpHostPayload(payload)) {
            applyPowerUp(payload);
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        case 'QUESTION':
          if (!isQuestionShowHostPayload(payload)) {
            setQuestion({
              questionIndex: payload.questionIndex,
              totalQuestions: payload.totalQuestions,
              options: payload.options,
              category: payload.category,
              questionTimeMs: payload.questionTimeMs,
              paused: payload.paused,
              pausedByName: payload.pausedByName,
              yourSabotages: payload.yourSabotages,
            });
            // Landed mid-question having already answered - go straight to
            // the SUBMITTED view instead of a fresh (re-tappable) one.
            if (payload.yourChoice !== null) {
              setAcceptedChoice(payload.yourChoice);
            }
            // Resumes every ice/ink already in progress at whatever the
            // server says is LEFT of it - stacked or not, reconnecting never
            // re-runs anything from zero.
            applySabotages(payload.yourSabotages);
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        case 'REVEAL':
          if (!isRevealHostPayload(payload)) {
            setReveal(payload);
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        // SOCRATES (Task 39) is the TV's beat - the phone has no view of its
        // own for it and simply stays on its reveal result, which is exactly
        // what the server sends a PLAYER for this phase.
        case 'SOCRATES':
          if (!isSocratesHostPayload(payload)) {
            setReveal(payload);
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        case 'STEAL':
          // The reconnect case that matters: the server says whether THIS
          // phone is the thief, whether it already picked, and how much time
          // is really left - none of which the client is trusted to remember.
          if (!isStealHostPayload(payload)) {
            applySteal(payload);
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        case 'GAME_OVER':
          setGameOver(payload);
          break;
      }
    }

    socket.on(ServerEvents.PLAYER_JOINED, handleJoined);
    socket.on(ServerEvents.JOIN_REJECTED, handleRejected);
    socket.on(ServerEvents.LOBBY_UPDATE, handleLobbyUpdate);
    socket.on(ServerEvents.PHASE_CHANGED, handlePhaseChanged);
    socket.on(ServerEvents.QUESTION_SHOW, handleQuestionShow);
    socket.on(ServerEvents.ANSWER_ACCEPTED, handleAnswerAccepted);
    socket.on(ServerEvents.POWER_UP_SHOW, handlePowerUpShow);
    socket.on(ServerEvents.POWER_UP_CHOICE_ACCEPTED, handlePowerUpChoiceAccepted);
    socket.on(ServerEvents.STEAL_SHOW, handleStealShow);
    socket.on(ServerEvents.STEAL_RESOLVED, handleStealResolved);
    socket.on(ServerEvents.REVEAL_SHOW, handleRevealShow);
    socket.on(ServerEvents.GAME_OVER, handleGameOver);
    socket.on(ServerEvents.STATE_SYNC, handleStateSync);
    socket.on(ServerEvents.VIP_CHANGED, handleVipChanged);
    socket.on(ServerEvents.SETTINGS_UPDATED, handleSettingsUpdated);
    socket.on(ServerEvents.GAME_PAUSED, handleGamePaused);
    socket.on(ServerEvents.GAME_RESUMED, handleGameResumed);
    socket.on(ServerEvents.ROOM_PEEK_RESULT, handleRoomPeekResult);

    return () => {
      socket.off(ServerEvents.PLAYER_JOINED, handleJoined);
      socket.off(ServerEvents.JOIN_REJECTED, handleRejected);
      socket.off(ServerEvents.LOBBY_UPDATE, handleLobbyUpdate);
      socket.off(ServerEvents.PHASE_CHANGED, handlePhaseChanged);
      socket.off(ServerEvents.QUESTION_SHOW, handleQuestionShow);
      socket.off(ServerEvents.ANSWER_ACCEPTED, handleAnswerAccepted);
      socket.off(ServerEvents.POWER_UP_SHOW, handlePowerUpShow);
      socket.off(ServerEvents.POWER_UP_CHOICE_ACCEPTED, handlePowerUpChoiceAccepted);
      socket.off(ServerEvents.STEAL_SHOW, handleStealShow);
      socket.off(ServerEvents.STEAL_RESOLVED, handleStealResolved);
      socket.off(ServerEvents.REVEAL_SHOW, handleRevealShow);
      socket.off(ServerEvents.GAME_OVER, handleGameOver);
      socket.off(ServerEvents.STATE_SYNC, handleStateSync);
      socket.off(ServerEvents.VIP_CHANGED, handleVipChanged);
      socket.off(ServerEvents.SETTINGS_UPDATED, handleSettingsUpdated);
      socket.off(ServerEvents.GAME_PAUSED, handleGamePaused);
      socket.off(ServerEvents.GAME_RESUMED, handleGameResumed);
      socket.off(ServerEvents.ROOM_PEEK_RESULT, handleRoomPeekResult);
    };
  }, []);

  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  // Sabotage (Task 28b) - the only countdown the phone runs, and since Task
  // 31a ONE countdown for the whole stack: it advances `sabotageElapsedMs`,
  // which every effect's own remaining time is measured against. Deliberately
  // torn down while `paused`, which is what freezes the effects on this side;
  // resuming re-anchors from the elapsed time frozen in the ref, so a pause
  // can't burn off an ice. Anchoring to a wall-clock start (not "add 100 each
  // tick") keeps a throttled background tab honest. `sabotageElapsedMs` is
  // intentionally NOT a dependency - it would re-anchor on every tick; the
  // effect already re-reads it (via the ref) whenever the two things that
  // matter, the stack itself or the pause, change.
  useEffect(() => {
    if (sabotages.length === 0 || paused) {
      return;
    }
    const anchoredAt = Date.now();
    const alreadyElapsedMs = sabotageElapsedRef.current;
    const longestMs = Math.max(...sabotages.map((effect) => effect.remainingMs));
    const handle = setInterval(() => {
      const elapsed = alreadyElapsedMs + (Date.now() - anchoredAt);
      sabotageElapsedRef.current = elapsed;
      setSabotageElapsedMs(elapsed);
      if (elapsed >= longestMs) {
        clearInterval(handle); // nothing in the stack is still running
      }
    }, 100);
    return () => clearInterval(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sabotages, paused]);

  // Fires a fresh room:peek whenever the code reaches a complete 4 digits -
  // covers both "just finished typing" and "came back to fix a typo", so
  // the avatar grid's grey-outs never silently go stale mid-flow.
  useEffect(() => {
    if (connected && code.length === 4) {
      socket.emit(ClientEvents.ROOM_PEEK, { code });
    }
  }, [connected, code]);

  function handleCodeChange(event: ChangeEvent<HTMLInputElement>) {
    setCode(event.target.value.replace(/\D/g, '').slice(0, 4));
  }

  function handleCustomDraftChange(event: ChangeEvent<HTMLInputElement>) {
    // Strip as-you-type - the same sanitizer the server re-runs, so what's
    // on screen is always exactly what would be stored.
    setCustomDraft(sanitizeCustomName(event.target.value));
  }

  function handleSelectPresetName(presetName: string) {
    setSelectedName(presetName);
    setCustomNameMode(false);
    setJoinStep('avatar');
  }

  function handleConfirmCustomName() {
    const cleaned = sanitizeCustomName(customDraft);
    if (cleaned.length === 0) {
      return;
    }
    setSelectedName(cleaned);
    setJoinStep('avatar');
  }

  function handleBackToName() {
    setJoinStep('name');
  }

  function handleSelectAvatar(avatarId: string) {
    setSelectedAvatarId(avatarId);
  }

  function handleJoin() {
    if (!selectedName || !selectedAvatarId) {
      return;
    }
    setError(null);
    socket.emit(ClientEvents.PLAYER_JOIN, { code, name: selectedName, playerId, avatarId: selectedAvatarId });
  }

  const filteredPresetNames = useMemo(() => {
    const query = nameFilter.trim().toLocaleLowerCase('el');
    if (query.length === 0) {
      return PRESET_NAMES;
    }
    return PRESET_NAMES.filter((presetName) => presetName.toLocaleLowerCase('el').startsWith(query));
  }, [nameFilter]);

  // Once every AVAILABLE avatar is already taken (see allAvailableAvatarsTaken
  // server-side), the grid stops graying anything out - an Nth player past
  // the shipped-avatar count must still be able to finish joining, just
  // with a duplicate, rather than getting stuck with nothing tappable.
  const poolExhausted =
    availableAvatars.length > 0 && availableAvatars.every((avatar) => peekedTakenAvatarIds.includes(avatar.id));

  const canJoin = connected && code.length === 4 && selectedName !== null && selectedAvatarId !== null;
  const isVip = vipPlayerId === playerId;

  // Sabotage (Task 28b). Ice blocks answering for its first N seconds; ink
  // only obscures, so inked buttons stay fully tappable throughout. Both are
  // read out of the STACK (Task 31a) by effect - at most one entry each, the
  // server having already folded multiple casts into a longer ice or a
  // stronger ink. `icedMs` counts DOWN to 0 - the server enforces the same
  // window from the same clock, and since this is anchored on a server figure
  // that arrived over the network, it can only ever expire later than the
  // server's, never earlier. A tap can't slip through and be silently dropped.
  function remainingMsFor(effect: SabotageEffect): number {
    const active = sabotages.find((candidate) => candidate.effect === effect);
    return active ? Math.max(0, active.remainingMs - sabotageElapsedMs) : 0;
  }

  const icedMs = remainingMsFor('ice');
  const inkRemainingMs = remainingMsFor('ink');
  const ink = sabotages.find((candidate) => candidate.effect === 'ink') ?? null;
  // 1 -> 0 across the ink's window, exactly as before stacking; the extra
  // instances show up as `intensity` below, never as a longer window.
  const inkedFraction = ink && inkRemainingMs > 0 ? inkRemainingMs / ink.durationMs : 0;
  const inkIntensity = ink ? ink.intensity : 1;

  function handleAnswerTap(index: number) {
    if (pendingChoice !== null || paused || icedMs > 0) {
      return; // optimistic lock - first tap is final, no changing the answer
    }
    setPendingChoice(index);
    socket.emit(ClientEvents.SUBMIT_ANSWER, { choice: index });
  }

  // Power-up (Task 30b). Step 1 sends NOTHING - picking an effect only moves
  // this phone to the target list, so the back button below is a pure local
  // undo with no server round-trip to take back.
  function handlePowerUpPickEffect(effect: PowerUpEffect) {
    if (powerUpSentRef.current || paused) {
      return;
    }
    setPowerUpEffect(effect);
  }

  function handlePowerUpBack() {
    if (powerUpSentRef.current) {
      return; // already committed - there is nothing to go back to
    }
    setPowerUpEffect(null);
  }

  // Step 2 - the ONLY send. Guarded by a ref rather than the state it sets,
  // so a double tap can't slip a second player:power_up_choose through the
  // gap before React re-renders; the server rejects duplicates anyway, but
  // this phone should never be the one asking.
  function handlePowerUpPickTarget(targetPlayerId: string) {
    if (powerUpSentRef.current || powerUpEffect === null || paused) {
      return;
    }
    powerUpSentRef.current = true;
    const choice: PowerUpChoosePayload = { effect: powerUpEffect, targetPlayerId };
    setPowerUpChoice(choice); // optimistic, exactly like an answer tap
    socket.emit(ClientEvents.POWER_UP_CHOOSE, choice);
  }

  // Steal (Task 32). One tap, one send, and it resolves server-side
  // immediately - there is no second step and no taking it back. Guarded by a
  // ref rather than the state it sets, so a double tap can't slip a second
  // player:steal_choose through the gap before React re-renders.
  function handleStealPick(targetPlayerId: string) {
    if (stealSentRef.current || paused) {
      return;
    }
    stealSentRef.current = true;
    const choice: StealChoosePayload = { targetPlayerId };
    setSteal((current) => (current ? { ...current, yourChoice: choice } : current));
    socket.emit(ClientEvents.STEAL_CHOOSE, choice);
  }

  function handleStartGame() {
    socket.emit(ClientEvents.VIP_START_GAME, {});
  }

  function handleNext() {
    socket.emit(ClientEvents.VIP_NEXT, {});
  }

  function handlePlayAgain() {
    socket.emit(ClientEvents.VIP_PLAY_AGAIN, {});
  }

  function handleSettingChange(partial: Partial<RoomSettings>) {
    socket.emit(ClientEvents.VIP_UPDATE_SETTINGS, partial);
  }

  function handlePause() {
    socket.emit(ClientEvents.GAME_PAUSE, {});
  }

  function handleResume() {
    socket.emit(ClientEvents.GAME_RESUME, {});
  }

  function handleResetToLobby() {
    socket.emit(ClientEvents.VIP_RESET_TO_LOBBY, {});
  }

  // Question count is the stage table's, not a setting of its own (Task
  // 31a) - but how many of those stages are IN the game is (Task 33).
  const estimatedMinutes = Math.round(
    (totalQuestionsForLength(roomSettings.gameLength) * (roomSettings.questionTimeMs + REVEAL_DURATION_MS)) / 60000,
  );

  if (gameOver) {
    const me = gameOver.standings.find((standing) => standing.playerId === playerId);
    const won = me ? me.rank === 1 : false;

    return (
      <div style={styles.container}>
        {joined && (
          <div style={styles.avatarCorner} data-testid="my-avatar-corner">
            <Avatar avatarId={joined.avatarId} sizeRem={2.2} />
          </div>
        )}
        {isVip && (
          <div style={styles.vipBadge} data-testid="vip-badge">
            👑 VIP
          </div>
        )}
        <div style={won ? styles.gameOverWon : styles.gameOverLost} data-testid="gameover-verdict">
          {won ? (gameOver.isTie ? 'Ισοπαλία στην κορυφή!' : 'Κέρδισες!') : 'Τέλος παιχνιδιού'}
        </div>
        <div style={styles.scoreboardRank} data-testid="gameover-rank">
          #{me ? me.rank : '-'}
        </div>
        <div style={styles.scoreboardScore} data-testid="gameover-score">
          {me ? me.score : 0} πόντοι
        </div>
        <div style={styles.lookAtTv}>Κοίτα την τηλεόραση για τα τελικά αποτελέσματα</div>
        {isVip && (
          <button data-testid="play-again-button" style={styles.button} type="button" onClick={handlePlayAgain}>
            Ξανά
          </button>
        )}
      </div>
    );
  }

  // Steal (Task 32). Three views out of ONE payload: the thief gets a picker,
  // everyone else gets a "they're choosing" wait, and once `resolved` arrives
  // all of them get the outcome - phrased from this phone's own side, so the
  // victim reads "σου έκλεψε" and the thief "έκλεψες".
  if (steal) {
    const resolved = steal.resolved;
    const iAmThief = resolved ? resolved.thiefPlayerId === playerId : steal.youAreThief;
    const iAmVictim = resolved?.victimPlayerId === playerId;
    return (
      <div style={styles.container}>
        {joined && (
          <div style={styles.avatarCorner} data-testid="my-avatar-corner">
            <Avatar avatarId={joined.avatarId} sizeRem={2.2} />
          </div>
        )}
        {isVip && (
          <div style={styles.vipBadge} data-testid="vip-badge">
            👑 VIP
          </div>
        )}
        <div style={styles.title}>Κλοπή πόντων</div>

        {resolved ? (
          <div style={styles.powerUpLocked} data-testid="steal-outcome">
            <div style={styles.powerUpLockedIcon}>{resolved.victimName === null ? '⌛' : '💰'}</div>
            <div style={styles.powerUpLockedTitle}>
              {resolved.victimName === null
                ? 'Χάθηκε η ευκαιρία'
                : iAmThief
                  ? `+${resolved.stolenAmount}`
                  : iAmVictim
                    ? `−${resolved.stolenAmount}`
                    : 'Κλοπή!'}
            </div>
            <div style={styles.powerUpLockedDetail} data-testid="steal-outcome-detail">
              {resolved.victimName === null
                ? iAmThief
                  ? 'Δεν πρόλαβες να διαλέξεις'
                  : `Ο/Η ${resolved.thiefName} δεν πρόλαβε να διαλέξει`
                : iAmThief
                  ? `Έκλεψες ${resolved.stolenAmount} από τον/την ${resolved.victimName}`
                  : iAmVictim
                    ? `Ο/Η ${resolved.thiefName} σου έκλεψε ${resolved.stolenAmount}`
                    : `Ο/Η ${resolved.thiefName} έκλεψε ${resolved.stolenAmount} από τον/την ${resolved.victimName}`}
            </div>
            {(iAmThief || iAmVictim) && (
              <div style={styles.powerUpLockedHint} data-testid="steal-outcome-total">
                Σύνολο: {iAmThief ? resolved.thiefScore : resolved.victimScore}
              </div>
            )}
          </div>
        ) : steal.youAreThief ? (
          <>
            <div style={styles.subtitle} data-testid="steal-step">
              Ήσουν ο πιο γρήγορος! Κλέψε {steal.amount} πόντους από:
            </div>
            <div style={styles.powerUpTargetList} data-testid="steal-target-list">
              {steal.targets.map((target) => (
                <button
                  key={target.playerId}
                  type="button"
                  data-testid="steal-target-option"
                  style={styles.powerUpTargetButton}
                  onClick={() => handleStealPick(target.playerId)}
                  disabled={paused || steal.yourChoice !== null}
                >
                  <Avatar avatarId={target.avatarId} sizeRem={2.4} />
                  <span style={styles.powerUpTargetName}>{target.name}</span>
                  {/* What is actually on the table for this target - the
                      amount is clamped to it, so a 150-point player can only
                      ever lose 150 no matter how fast the thief was. */}
                  <span style={styles.stealTargetScore}>
                    {Math.min(steal.amount, Math.max(0, target.score))}
                  </span>
                </button>
              ))}
              {steal.targets.length === 0 && (
                <div style={styles.nameListEmpty}>Κανένας άλλος παίκτης συνδεδεμένος</div>
              )}
            </div>
          </>
        ) : (
          <div style={styles.powerUpLocked} data-testid="steal-waiting">
            <div style={styles.powerUpLockedIcon}>
              <Avatar avatarId={steal.thiefAvatarId} sizeRem={3} />
            </div>
            <div style={styles.powerUpLockedDetail}>Ο/Η {steal.thiefName} διαλέγει θύμα...</div>
            <div style={styles.powerUpLockedHint}>Μπορεί να είσαι εσύ</div>
          </div>
        )}

        <div style={styles.lookAtTv}>Κοίτα την τηλεόραση</div>
        <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
        {isVip && <ResetToLobbyControl onConfirm={handleResetToLobby} />}
      </div>
    );
  }

  if (reveal) {
    return (
      <div style={styles.container}>
        {joined && (
          <div style={styles.avatarCorner} data-testid="my-avatar-corner">
            <Avatar avatarId={joined.avatarId} sizeRem={2.2} />
          </div>
        )}
        {isVip && (
          <div style={styles.vipBadge} data-testid="vip-badge">
            👑 VIP
          </div>
        )}
        <div style={styles.revealVerdictRow}>
          <AnswerShape index={reveal.correctIndex} sizeRem={2.75} />
          <div style={reveal.yourCorrect ? styles.revealCorrect : styles.revealWrong} data-testid="reveal-verdict">
            {reveal.yourCorrect ? 'Σωστά!' : 'Λάθος'}
          </div>
        </div>
        <div style={styles.revealCorrectOption}>
          Σωστή απάντηση: {ANSWER_IDENTITIES[reveal.correctIndex].letter}. {reveal.correctOption}
        </div>
        {!reveal.yourCorrect && reveal.yourChoice !== null && (
          <div style={styles.revealYourChoice} data-testid="reveal-your-choice">
            <AnswerShape index={reveal.yourChoice} sizeRem={1.1} muted />
            Η επιλογή σου: {ANSWER_IDENTITIES[reveal.yourChoice].letter}
          </div>
        )}
        <div style={styles.revealPoints} data-testid="reveal-points">
          +{reveal.pointsAwarded} πόντοι
        </div>
        <div style={styles.revealTotal} data-testid="reveal-total">
          Σύνολο: {reveal.totalScore}
        </div>
        <div style={styles.revealRank} data-testid="reveal-rank">
          Θέση #{reveal.rank}
        </div>
        {reveal.yourCorrect && reveal.yourAnswerRank !== null && (
          <div style={styles.revealSpeedRank} data-testid="reveal-answer-rank">
            Ταχύτητα: #{reveal.yourAnswerRank}
            {reveal.yourTimeMs !== null && ` — ${(reveal.yourTimeMs / 1000).toFixed(1)}΄΄`}
          </div>
        )}
        {isVip && !paused && (
          <button data-testid="continue-button" style={styles.skipButton} type="button" onClick={handleNext}>
            Παράλειψη
          </button>
        )}
        <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
        {isVip && <ResetToLobbyControl onConfirm={handleResetToLobby} />}
      </div>
    );
  }

  // Power-up (Task 30b). Two steps, ONE screen: pick an effect, then pick who
  // gets it. Only the second step talks to the server. The phone shows no
  // countdown of its own - the TV owns the clock here, same as during a
  // question.
  if (powerUp) {
    const lockedTargetName = powerUpChoice
      ? (powerUp.targets.find((target) => target.playerId === powerUpChoice.targetPlayerId)?.name ?? '...')
      : '';
    return (
      <div style={styles.container}>
        {joined && (
          <div style={styles.avatarCorner} data-testid="my-avatar-corner">
            <Avatar avatarId={joined.avatarId} sizeRem={2.2} />
          </div>
        )}
        {isVip && (
          <div style={styles.vipBadge} data-testid="vip-badge">
            👑 VIP
          </div>
        )}
        <div style={styles.title}>Ώρα για σαμποτάζ!</div>

        {powerUpChoice ? (
          <div style={styles.powerUpLocked} data-testid="power-up-locked">
            <div style={styles.powerUpLockedIcon}>{POWER_UP_LABELS[powerUpChoice.effect].icon}</div>
            <div style={styles.powerUpLockedTitle}>Κλειδώθηκε!</div>
            <div style={styles.powerUpLockedDetail}>
              {POWER_UP_LABELS[powerUpChoice.effect].title} στον/στην {lockedTargetName}
            </div>
            <div style={styles.powerUpLockedHint}>Θα χτυπήσει στην επόμενη ερώτηση</div>
          </div>
        ) : powerUpEffect === null ? (
          <>
            <div style={styles.subtitle} data-testid="power-up-step">
              1. Διάλεξε όπλο
            </div>
            <div style={styles.powerUpEffectGrid}>
              {powerUp.effects.map((effect) => (
                <button
                  key={effect}
                  type="button"
                  data-testid="power-up-effect-option"
                  data-effect={effect}
                  style={styles.powerUpEffectButton}
                  onClick={() => handlePowerUpPickEffect(effect)}
                  disabled={paused}
                >
                  <span style={styles.powerUpEffectIcon}>{POWER_UP_LABELS[effect].icon}</span>
                  <span style={styles.powerUpEffectTitle}>{POWER_UP_LABELS[effect].title}</span>
                  <span style={styles.powerUpEffectBlurb}>{POWER_UP_LABELS[effect].blurb}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={styles.subtitle} data-testid="power-up-step">
              2. {POWER_UP_LABELS[powerUpEffect].icon} {POWER_UP_LABELS[powerUpEffect].title} — σε ποιον;
            </div>
            <div style={styles.powerUpTargetList} data-testid="power-up-target-list">
              {powerUp.targets.map((target) => (
                <button
                  key={target.playerId}
                  type="button"
                  data-testid="power-up-target-option"
                  style={styles.powerUpTargetButton}
                  onClick={() => handlePowerUpPickTarget(target.playerId)}
                  disabled={paused}
                >
                  <Avatar avatarId={target.avatarId} sizeRem={2.4} />
                  <span style={styles.powerUpTargetName}>{target.name}</span>
                </button>
              ))}
              {powerUp.targets.length === 0 && (
                <div style={styles.nameListEmpty}>Κανένας άλλος παίκτης συνδεδεμένος</div>
              )}
            </div>
            <button type="button" data-testid="power-up-back" style={styles.skipButton} onClick={handlePowerUpBack}>
              ‹ Πίσω στα όπλα
            </button>
          </>
        )}

        <div style={styles.lookAtTv}>Κανείς δεν βλέπει τι διάλεξες</div>
        <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
      </div>
    );
  }

  if (question) {
    // pendingChoice is the immediate local tap (set the instant a button is
    // pressed, before the server even acks it); acceptedChoice only exists
    // for a reconnect landing mid-question via state:sync, where the tap
    // itself never happened on this page load. Either way, exactly one of
    // the four buttons is "mine" and gets highlighted - the other three dim.
    const myChoice = pendingChoice !== null ? pendingChoice : acceptedChoice;
    const answered = myChoice !== null;
    // Ink obscures the option TEXT only - the letter and shape stay crisp, so
    // a tap is always aimable even at full strength. Fades to nothing as
    // `inkedFraction` runs 1 -> 0 across the effect's duration. Stacked ink
    // (Task 31a) multiplies the blur and the wash for that SAME window - it
    // never lengthens it - and the crisp letter/shape are what keep even a
    // triple-strength ink answerable rather than a lockout by another name.
    const inkStyle: CSSProperties | undefined =
      inkedFraction > 0
        ? {
            filter: `blur(${(inkedFraction * 8 * inkIntensity).toFixed(2)}px)`,
            opacity: 1 - inkedFraction * Math.min(0.45 * inkIntensity, 0.8),
            transition: 'filter 120ms linear, opacity 120ms linear',
          }
        : undefined;
    return (
      <div style={styles.questionContainer}>
        {joined && (
          <div style={styles.avatarCorner} data-testid="my-avatar-corner">
            <Avatar avatarId={joined.avatarId} sizeRem={2.2} />
          </div>
        )}
        {isVip && (
          <div style={styles.vipBadge} data-testid="vip-badge">
            👑 VIP
          </div>
        )}
        <div style={styles.questionHeader}>
          <div style={styles.category}>{question.category}</div>
          {answered ? (
            <div style={styles.lookAtTv} data-testid="waiting-message">
              Περίμενε τους υπόλοιπους...
            </div>
          ) : (
            <div style={styles.lookAtTv}>Κοίτα την τηλεόραση για την ερώτηση</div>
          )}
          {/* One banner per EFFECT (Task 31a) - a stacked victim can be under
              an ice and an ink at once, and each has its own countdown. The
              server already folded repeats of the same effect together, so
              this never grows past one row per effect. */}
          {sabotages.map((active) => {
            const remainingMs = remainingMsFor(active.effect);
            if (remainingMs <= 0 && active.effect !== 'shuffle') {
              return null;
            }
            return (
              <div
                key={active.effect}
                style={styles.sabotageBanner}
                data-testid="sabotage-banner"
                data-effect={active.effect}
                data-intensity={active.intensity}
              >
                {active.effect === 'ice'
                  ? `🧊 Πάγωσες! ${Math.ceil(remainingMs / 1000)}΄΄`
                  : active.effect === 'ink'
                    ? `🖋️ Μελάνι${active.intensity > 1 ? ` ×${active.intensity}` : ''}! Καθαρίζει σε ${Math.ceil(remainingMs / 1000)}΄΄`
                    : // Shuffle (Task 28c) lasts the whole question and has no
                      // countdown to show - the server already reordered the
                      // options below; this only warns them not to trust the TV.
                      '🔀 Ανακάτεμα! Οι απαντήσεις σου δεν είναι στη σειρά της τηλεόρασης'}
              </div>
            );
          })}
        </div>
        <div style={styles.answerGrid}>
          {question.options.map((option, index) => {
            const identity = ANSWER_IDENTITIES[index];
            const isMine = index === myChoice;
            const dimmed = answered && !isMine;
            const disabled = answered || paused || icedMs > 0;
            return (
              <button
                key={index}
                type="button"
                data-testid="answer-button"
                data-selected={isMine}
                className={isMine ? 'glow' : undefined}
                style={
                  dimmed
                    ? { ...styles.answerButtonDim, borderColor: identity.color }
                    : ({
                        // Plain --surface when not selected - a same-hue
                        // wash behind a full-strength shape crushes its own
                        // contrast against its background; the full-colour
                        // border already reads clearly.
                        ...styles.answerButton,
                        borderColor: identity.color,
                        background: isMine ? `${identity.color}1a` : 'var(--surface)',
                        boxShadow: isMine ? undefined : SURFACE_GLOW,
                        ...(isMine ? { '--glow-color': `${identity.color}80` } : {}),
                      } as CSSVars)
                }
                onClick={() => handleAnswerTap(index)}
                disabled={disabled}
              >
                <span style={styles.answerShapeRow}>
                  <AnswerShape index={index} sizeRem={2.25} muted={dimmed} />
                  {/* Letter stays neutral, never the identity colour - red
                      and blue drop under 4.5:1 as small text on this
                      lighter stage background. The identity colour still
                      pops via the shape, the full border, and the tinted
                      background. */}
                  <span style={styles.answerLabel}>{identity.letter}</span>
                </span>
                <span style={{ ...(dimmed ? styles.answerTextDim : styles.answerText), ...inkStyle }}>{option}</span>
              </button>
            );
          })}
        </div>
        <div style={styles.questionFooter}>
          <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
          {isVip && <ResetToLobbyControl onConfirm={handleResetToLobby} />}
        </div>
      </div>
    );
  }

  if (joined) {
    const connectedCount = lobby?.players.filter((player) => player.connected).length ?? 1;
    const canStart = lobby?.canStart ?? false;
    return (
      <div style={styles.container}>
        {joined && (
          <div style={styles.avatarCorner} data-testid="my-avatar-corner">
            <Avatar avatarId={joined.avatarId} sizeRem={2.2} />
          </div>
        )}
        {isVip && (
          <div style={styles.vipBadge} data-testid="vip-badge">
            👑 VIP
          </div>
        )}
        <div style={styles.title}>{joined.name}</div>
        <div style={styles.subtitle}>waiting for the game to start</div>
        <div style={styles.lobbyCount}>{connectedCount} παίκτες στο δωμάτιο</div>

        <div style={styles.settingsPanel} data-testid="settings-panel">
          {fullscreenSupported && (
            <div style={styles.settingsRow}>
              <span style={styles.settingsRowLabel}>Πλήρης οθόνη</span>
              <button
                type="button"
                data-testid="fullscreen-toggle"
                style={isFullscreen ? styles.segmentActive : styles.segmentInactive}
                onClick={toggleFullscreen}
              >
                {isFullscreen ? '⤡ Έξοδος' : '⤢ Ενεργοποίηση'}
              </button>
            </div>
          )}
          <SegmentedRow
            label="Διάρκεια"
            options={GAME_LENGTH_OPTIONS}
            current={roomSettings.gameLength}
            format={(length: GameLength) => GAME_LENGTH_LABELS[length]}
            onSelect={(length) => handleSettingChange({ gameLength: length })}
            readOnly={!isVip}
            testIdPrefix="setting-length"
          />
          {/* Not a control of its own (Task 31a/33): the stage table decides
              how many questions a game is and how they're split, once the
              Διάρκεια row above picks how many of those stages are in play. */}
          <div style={styles.estimatedLength} data-testid="stage-summary">
            {totalQuestionsForLength(roomSettings.gameLength)} ερωτήσεις σε{' '}
            {stagesForLength(roomSettings.gameLength).length} στάδια (
            {stagesForLength(roomSettings.gameLength)
              .map((stage) => stage.questionCount)
              .join(' + ')}
            )
          </div>
          <SegmentedRow
            label="Χρόνος"
            options={QUESTION_TIME_OPTIONS_MS}
            current={roomSettings.questionTimeMs}
            format={(ms) => `${ms / 1000}΄΄`}
            onSelect={(ms) => handleSettingChange({ questionTimeMs: ms })}
            readOnly={!isVip}
            testIdPrefix="setting-time"
          />
          <SegmentedRow
            label="Δυσκολία"
            options={DIFFICULTY_MIX_OPTIONS}
            current={roomSettings.difficultyMix}
            format={(mix: DifficultyMix) => DIFFICULTY_MIX_LABELS[mix]}
            onSelect={(mix) => handleSettingChange({ difficultyMix: mix })}
            readOnly={!isVip}
            testIdPrefix="setting-difficulty"
          />
          <div style={styles.estimatedLength} data-testid="estimated-length">
            ~{estimatedMinutes} λεπτά
          </div>
        </div>

        {isVip ? (
          <button
            data-testid="start-button"
            style={canStart ? styles.button : styles.buttonDisabled}
            type="button"
            onClick={handleStartGame}
            disabled={!canStart}
          >
            Έναρξη{!canStart && ` (χρειάζονται ${MIN_PLAYERS}+ παίκτες)`}
          </button>
        ) : (
          <div style={styles.subtitle} data-testid="waiting-for-vip">
            Ο/Η {vipName ?? '...'} θα ξεκινήσει το παιχνίδι
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.title}>PLAYER</div>
      <div style={styles.status}>{connected ? 'connected' : 'disconnected'}</div>

      <input
        style={styles.input}
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        placeholder="Κωδικός"
        value={code}
        onChange={handleCodeChange}
        data-testid="code-input"
      />

      {joinStep === 'name' &&
        (!customNameMode ? (
          <>
            <input
              style={styles.input}
              placeholder="Αναζήτηση ονόματος"
              value={nameFilter}
              onChange={(event) => setNameFilter(event.target.value)}
              data-testid="name-search"
            />
            <div style={styles.nameList} data-testid="name-list">
              {filteredPresetNames.map((presetName) => (
                <button
                  key={presetName}
                  type="button"
                  style={styles.nameOption}
                  data-testid="preset-name-option"
                  onClick={() => handleSelectPresetName(presetName)}
                >
                  {presetName}
                </button>
              ))}
              {filteredPresetNames.length === 0 && (
                <div style={styles.nameListEmpty}>Κανένα όνομα δεν ταιριάζει</div>
              )}
            </div>
            <button
              type="button"
              style={styles.customNameButton}
              data-testid="custom-name-toggle"
              onClick={() => setCustomNameMode(true)}
            >
              Άλλο όνομα
            </button>
          </>
        ) : (
          <>
            <input
              style={styles.input}
              // NOT MAX_NAME_LENGTH - that cap belongs on the SANITIZED
              // result (sanitizeCustomName's own .slice), applied AFTER
              // stripping. A native maxLength here would count raw
              // keystrokes BEFORE stripping, so typed junk (digits,
              // symbols) would eat into the letter budget - e.g. typing
              // 17 raw characters where 5 are digits/symbols would cap at
              // the first 12 raw chars, leaving only 9 real letters after
              // stripping, instead of the full 12 the player is entitled
              // to. This is just a generous paste/typing buffer.
              maxLength={40}
              placeholder="Το όνομά σου"
              value={customDraft}
              onChange={handleCustomDraftChange}
              data-testid="custom-name-input"
              autoFocus
            />
            <button
              style={customDraft.trim().length > 0 ? styles.button : styles.buttonDisabled}
              type="button"
              onClick={handleConfirmCustomName}
              disabled={customDraft.trim().length === 0}
              data-testid="custom-name-confirm"
            >
              Επόμενο
            </button>
            <button
              type="button"
              style={styles.skipButton}
              data-testid="custom-name-cancel"
              onClick={() => setCustomNameMode(false)}
            >
              ‹ Πίσω στη λίστα
            </button>
          </>
        ))}

      {joinStep === 'avatar' && (
        <>
          <div style={styles.previewRow} data-testid="join-preview">
            {selectedAvatarId ? (
              <Avatar avatarId={selectedAvatarId} sizeRem={4.5} ringColor="var(--gold)" />
            ) : (
              <div style={styles.avatarPlaceholder}>?</div>
            )}
            <div style={styles.previewName} data-testid="join-preview-name">
              {selectedName}
            </div>
          </div>
          <div style={styles.avatarGrid} data-testid="avatar-grid">
            {availableAvatars.map((avatar) => {
              const taken = !poolExhausted && avatar.id !== selectedAvatarId && peekedTakenAvatarIds.includes(avatar.id);
              const selected = avatar.id === selectedAvatarId;
              return (
                <button
                  key={avatar.id}
                  type="button"
                  data-testid="avatar-option"
                  data-taken={taken}
                  data-selected={selected}
                  disabled={taken}
                  style={taken ? styles.avatarOptionTaken : selected ? styles.avatarOptionSelected : styles.avatarOption}
                  onClick={() => handleSelectAvatar(avatar.id)}
                >
                  <Avatar avatarId={avatar.id} sizeRem={3} />
                  <span style={styles.avatarLabel}>{avatar.name}</span>
                </button>
              );
            })}
            {availableAvatars.length === 0 && <div style={styles.nameListEmpty}>Φόρτωση χαρακτήρων...</div>}
          </div>
          <button
            type="button"
            style={styles.skipButton}
            data-testid="back-to-name"
            onClick={handleBackToName}
          >
            ‹ Πίσω στο όνομα
          </button>
          <button
            style={canJoin ? styles.button : styles.buttonDisabled}
            type="button"
            onClick={handleJoin}
            disabled={!canJoin}
            data-testid="join-button"
          >
            Join
          </button>
        </>
      )}

      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '1rem',
    padding: '2rem 1.25rem',
    maxWidth: '480px',
    margin: '0 auto',
    background: 'var(--bg)',
    color: 'var(--text)',
    minHeight: '100dvh',
    boxSizing: 'border-box',
  },
  title: { fontSize: '1.5rem', fontWeight: 700, textAlign: 'center', color: 'var(--text)' },
  status: { textAlign: 'center', color: 'var(--text-faint)' },
  subtitle: { fontSize: '1.1rem', color: 'var(--text-dim)', textAlign: 'center' },
  lobbyCount: { fontSize: '1rem', color: 'var(--text-faint)', textAlign: 'center' },
  settingsPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
    padding: '0.9rem',
    borderRadius: '0.75rem',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    boxShadow: SURFACE_GLOW,
  },
  settingsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  settingsRowLabel: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--text-dim)',
  },
  settingsRowValue: {
    fontSize: '0.9rem',
    fontWeight: 700,
    color: 'var(--gold)',
  },
  segmentedGroup: {
    display: 'flex',
    gap: '0.35rem',
  },
  segmentActive: {
    fontSize: '0.85rem',
    fontWeight: 700,
    padding: '0.4rem 0.7rem',
    borderRadius: '0.5rem',
    border: '2px solid var(--gold)',
    background: 'var(--gold)',
    color: '#14161c',
  },
  segmentInactive: {
    fontSize: '0.85rem',
    fontWeight: 700,
    padding: '0.4rem 0.7rem',
    borderRadius: '0.5rem',
    border: '2px solid var(--border-strong)',
    background: 'var(--surface)',
    color: 'var(--text-dim)',
  },
  estimatedLength: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--text-faint)',
    textAlign: 'center',
  },
  input: {
    width: '100%',
    fontSize: '1.5rem',
    padding: '0.9rem 1rem',
    boxSizing: 'border-box',
    borderRadius: '0.5rem',
    border: '1px solid var(--border-strong)',
    background: 'var(--surface)',
    color: 'var(--text)',
  },
  button: {
    width: '100%',
    fontSize: '1.25rem',
    padding: '1rem',
    borderRadius: '0.5rem',
    border: 'none',
    background: 'var(--gold)',
    color: '#14161c',
    fontWeight: 600,
  },
  buttonDisabled: {
    width: '100%',
    fontSize: '1.25rem',
    padding: '1rem',
    borderRadius: '0.5rem',
    border: 'none',
    background: 'var(--border)',
    color: 'var(--text-faint)',
    fontWeight: 600,
    cursor: 'not-allowed',
  },
  vipBadge: {
    alignSelf: 'center',
    fontSize: '1rem',
    fontWeight: 700,
    color: '#14161c',
    background: 'var(--gold)',
    borderRadius: '999px',
    padding: '0.25rem 0.9rem',
  },
  avatarCorner: {
    position: 'fixed',
    top: '0.75rem',
    left: '0.75rem',
    zIndex: 5,
  },
  nameList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
    maxHeight: '38vh',
    overflowY: 'auto',
    padding: '0.4rem',
    borderRadius: '0.5rem',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
  },
  nameOption: {
    fontSize: '1.1rem',
    fontWeight: 600,
    padding: '0.65rem 0.9rem',
    borderRadius: '0.5rem',
    border: '1px solid var(--border-strong)',
    background: 'var(--surface-strong)',
    color: 'var(--text)',
    textAlign: 'left',
  },
  nameListEmpty: {
    padding: '0.75rem',
    textAlign: 'center',
    color: 'var(--text-faint)',
    fontWeight: 600,
  },
  customNameButton: {
    width: '100%',
    fontSize: '1rem',
    padding: '0.7rem',
    borderRadius: '0.5rem',
    border: '1px dashed var(--border-strong)',
    background: 'transparent',
    color: 'var(--text-dim)',
    fontWeight: 600,
  },
  previewRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.75rem',
    borderRadius: '0.75rem',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
  },
  previewName: {
    flex: 1,
    minWidth: 0,
    fontSize: '1.4rem',
    fontWeight: 700,
    color: 'var(--text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  avatarPlaceholder: {
    width: '4.5rem',
    height: '4.5rem',
    minWidth: '4.5rem',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--surface-strong)',
    color: 'var(--text-faint)',
    fontSize: '1.75rem',
    fontWeight: 700,
  },
  avatarGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.6rem',
  },
  avatarOption: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.5rem',
    borderRadius: '0.75rem',
    border: '2px solid var(--border-strong)',
    background: 'var(--surface)',
    color: 'var(--text-dim)',
  },
  avatarOptionSelected: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.5rem',
    borderRadius: '0.75rem',
    border: '2px solid var(--gold)',
    background: 'rgba(212, 175, 55, 0.12)',
    color: 'var(--text)',
  },
  avatarOptionTaken: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.5rem',
    borderRadius: '0.75rem',
    border: '2px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text-faint)',
    opacity: 0.35,
    filter: 'grayscale(0.7)',
  },
  avatarLabel: {
    fontSize: '0.75rem',
    fontWeight: 600,
    textAlign: 'center',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '100%',
  },
  skipButton: {
    width: '100%',
    fontSize: '1rem',
    padding: '0.6rem 1rem',
    borderRadius: '0.5rem',
    border: '1px solid var(--border-strong)',
    background: 'transparent',
    color: 'var(--text-dim)',
    fontWeight: 600,
  },
  pauseButton: {
    width: '100%',
    fontSize: '1rem',
    padding: '0.6rem 1rem',
    borderRadius: '0.5rem',
    border: '1px solid var(--border-strong)',
    background: 'transparent',
    color: 'var(--text-dim)',
    fontWeight: 600,
  },
  pausedNotice: {
    fontSize: '1rem',
    fontWeight: 700,
    textAlign: 'center',
    color: 'var(--gold)',
    background: 'rgba(212, 175, 55, 0.12)',
    border: '1px solid var(--gold)',
    borderRadius: '0.5rem',
    padding: '0.6rem 1rem',
  },
  resetToLobbyButton: {
    width: '100%',
    fontSize: '0.85rem',
    padding: '0.5rem 1rem',
    borderRadius: '0.5rem',
    border: '1px solid var(--danger)',
    background: 'transparent',
    // --danger-text, not --danger - the raw red hex drops under 4.5:1 as
    // small text on the new, lighter stage background. The border can stay
    // the stronger --danger since border colour isn't held to text-contrast
    // rules.
    color: 'var(--danger-text)',
    fontWeight: 600,
  },
  resetConfirmBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.75rem',
    borderRadius: '0.5rem',
    border: '1px solid var(--danger)',
    background: 'rgba(239, 68, 68, 0.1)',
  },
  resetConfirmText: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--text)',
    textAlign: 'center',
  },
  resetConfirmButtons: {
    display: 'flex',
    gap: '0.5rem',
  },
  resetConfirmButton: {
    flex: 1,
    fontSize: '0.85rem',
    padding: '0.5rem',
    borderRadius: '0.5rem',
    border: 'none',
    // --danger-strong, not --danger - white text on the raw #ef4444 fill
    // measures 3.76:1; the deeper red clears 4.5:1 with room to spare.
    background: 'var(--danger-strong)',
    color: 'white',
    fontWeight: 700,
  },
  resetCancelButton: {
    flex: 1,
    fontSize: '0.85rem',
    padding: '0.5rem',
    borderRadius: '0.5rem',
    border: '1px solid var(--border-strong)',
    background: 'var(--surface)',
    color: 'var(--text-dim)',
    fontWeight: 600,
  },
  error: { color: 'var(--danger-text)', fontWeight: 600, textAlign: 'center' },
  category: {
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--text-dim)',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  lookAtTv: {
    fontSize: '1.1rem',
    fontWeight: 600,
    textAlign: 'center',
    color: 'var(--text)',
  },
  questionContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
    padding: '1rem 1rem calc(0.75rem + env(safe-area-inset-bottom, 0px))',
    maxWidth: '480px',
    margin: '0 auto',
    height: '100dvh',
    boxSizing: 'border-box',
    background: 'var(--bg)',
    color: 'var(--text)',
  },
  questionHeader: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.3rem',
    flexShrink: 0,
  },
  // Sabotage (Task 28b) - deliberately loud, and always paired with a
  // countdown, so a frozen phone never reads as a broken one.
  sabotageBanner: {
    fontSize: '1rem',
    fontWeight: 800,
    textAlign: 'center',
    color: 'var(--text)',
    background: 'var(--surface)',
    border: '2px solid #7c3aed',
    borderRadius: '0.6rem',
    padding: '0.3rem 0.7rem',
  },
  questionFooter: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    flexShrink: 0,
  },
  answerGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gridTemplateRows: '1fr 1fr',
    gap: '0.75rem',
    flex: 1,
    minHeight: 0,
  },
  answerButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    width: '100%',
    height: '100%',
    minHeight: '44px',
    fontSize: '1.15rem',
    fontWeight: 700,
    padding: '0.75rem',
    borderRadius: '1rem',
    border: '3px solid',
    background: 'var(--surface)',
    color: 'var(--text)',
    textAlign: 'center',
  },
  answerButtonDim: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    width: '100%',
    height: '100%',
    minHeight: '44px',
    fontSize: '1.15rem',
    fontWeight: 700,
    padding: '0.75rem',
    borderRadius: '1rem',
    border: '3px solid',
    background: 'var(--surface)',
    color: 'var(--text-faint)',
    textAlign: 'center',
    opacity: 0.35,
    filter: 'grayscale(0.7)',
  },
  answerShapeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  answerLabel: {
    fontWeight: 800,
  },
  answerText: {
    color: 'var(--text)',
  },
  answerTextDim: {
    color: 'var(--text-faint)',
  },
  revealVerdictRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
  },
  revealCorrect: {
    fontSize: '2.5rem',
    fontWeight: 800,
    textAlign: 'center',
    color: 'var(--success)',
  },
  revealWrong: {
    fontSize: '2.5rem',
    fontWeight: 800,
    textAlign: 'center',
    // --danger-text, not --danger - the raw red hex is under 4.5:1 here.
    color: 'var(--danger-text)',
  },
  revealCorrectOption: {
    fontSize: '1.1rem',
    fontWeight: 600,
    textAlign: 'center',
    color: 'var(--text-dim)',
  },
  revealYourChoice: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.4rem',
    fontSize: '1rem',
    fontWeight: 600,
    textAlign: 'center',
    color: 'var(--text-faint)',
  },
  revealPoints: {
    fontSize: '1.75rem',
    fontWeight: 700,
    textAlign: 'center',
    color: 'var(--text)',
  },
  revealTotal: {
    fontSize: '1.25rem',
    fontWeight: 600,
    textAlign: 'center',
    color: 'var(--text-dim)',
  },
  revealRank: {
    fontSize: '1.25rem',
    fontWeight: 600,
    textAlign: 'center',
    color: 'var(--text-dim)',
  },
  revealSpeedRank: {
    fontSize: '1.1rem',
    fontWeight: 700,
    textAlign: 'center',
    color: 'var(--gold)',
  },
  scoreboardRank: {
    fontSize: '3rem',
    fontWeight: 800,
    textAlign: 'center',
    color: 'var(--gold)',
  },
  scoreboardScore: {
    fontSize: '1.75rem',
    fontWeight: 700,
    textAlign: 'center',
    color: 'var(--text)',
  },
  // Power-up (Task 30b) - big tap targets, since both steps are decided
  // under a 10 second clock the phone doesn't even display.
  powerUpEffectGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  powerUpEffectButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.35rem',
    padding: '1.25rem 1rem',
    borderRadius: '1rem',
    border: '3px solid #7c3aed',
    background: 'var(--surface)',
    color: 'var(--text)',
    boxShadow: SURFACE_GLOW,
  },
  powerUpEffectIcon: {
    fontSize: '2.5rem',
    lineHeight: 1,
  },
  powerUpEffectTitle: {
    fontSize: '1.5rem',
    fontWeight: 800,
  },
  powerUpEffectBlurb: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--text-dim)',
    textAlign: 'center',
  },
  powerUpTargetList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
    maxHeight: '48vh',
    overflowY: 'auto',
  },
  powerUpTargetButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.9rem',
    padding: '0.7rem 1rem',
    borderRadius: '0.9rem',
    border: '2px solid var(--border-strong)',
    background: 'var(--surface)',
    color: 'var(--text)',
    textAlign: 'left',
  },
  powerUpTargetName: {
    flex: 1,
    minWidth: 0,
    fontSize: '1.3rem',
    fontWeight: 700,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  powerUpLocked: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '1.5rem 1rem',
    borderRadius: '1rem',
    border: '3px solid #7c3aed',
    background: 'var(--surface)',
    boxShadow: SURFACE_GLOW,
  },
  powerUpLockedIcon: {
    fontSize: '3rem',
    lineHeight: 1,
  },
  powerUpLockedTitle: {
    fontSize: '1.75rem',
    fontWeight: 800,
    color: 'var(--gold)',
  },
  powerUpLockedDetail: {
    fontSize: '1.2rem',
    fontWeight: 700,
    color: 'var(--text)',
    textAlign: 'center',
  },
  powerUpLockedHint: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: 'var(--text-dim)',
    textAlign: 'center',
  },
  // Steal (Task 32) - what this target actually stands to lose, already
  // clamped to their score, shown on the right of each picker row.
  stealTargetScore: {
    fontSize: '1.2rem',
    fontWeight: 800,
    color: 'var(--gold)',
  },
  gameOverWon: {
    fontSize: '2rem',
    fontWeight: 800,
    textAlign: 'center',
    color: 'var(--gold)',
  },
  gameOverLost: {
    fontSize: '1.75rem',
    fontWeight: 700,
    textAlign: 'center',
    color: 'var(--text-dim)',
  },
};
