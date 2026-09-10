import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AGORA_COLOURS,
  AVATAR_CATALOGUE,
  ClientEvents,
  DEFAULT_AUDIO_VOLUME,
  DEFAULT_GAME_MODE,
  DEFAULT_ROOM_SETTINGS,
  DIFFICULTY_MIX_OPTIONS,
  DRAW_ROUNDS_OPTIONS,
  DRAW_WARNING_MS,
  DUEL_WEAPONS,
  FINALE_MODE_OPTIONS,
  GAME_LENGTH_OPTIONS,
  PRESET_NAMES,
  QUESTION_TIME_OPTIONS_MS,
  REVEAL_DURATION_MS,
  ServerEvents,
  isAgoraQuestionHostPayload,
  isAgoraRevealHostPayload,
  isBlitzRevealHostPayload,
  isBlitzShowHostPayload,
  isClimbQuestionHostPayload,
  isClimbRevealHostPayload,
  isDrawHostPayload,
  isDuelPickHostPayload,
  isDuelRevealHostPayload,
  isGuessHostPayload,
  isNumericQuestionHostPayload,
  isPowerUpHostPayload,
  isQuestionShowHostPayload,
  isRevealHostPayload,
  isSocratesHostPayload,
  isStealHostPayload,
  isTrialQuestionHostPayload,
  sanitizeCustomName,
  stagesForLength,
  totalQuestionsForLength,
  type ActiveSabotage,
  type AgoraExposeShowPayload,
  type AgoraQuestionShowPayload,
  type AgoraQuestionShowPlayerPayload,
  type AgoraRevealPlayerPayload,
  type AgoraRevealShowPayload,
  type AnswerAcceptedPayload,
  type BlitzRevealPayload,
  type BlitzRevealPlayerPayload,
  type BlitzShowPayload,
  type BlitzShowPlayerPayload,
  type ClimbQuestionShowPayload,
  type ClimbQuestionShowPlayerPayload,
  type ClimbRevealPayload,
  type ClimbRevealPlayerPayload,
  type DifficultyMix,
  type DrawShowPayload,
  type DrawShowPlayerPayload,
  type DuelPickShowPayload,
  type DuelPickShowPlayerPayload,
  type DuelRevealHostPayload,
  type DuelRevealPayload,
  type DuelWeapon,
  type FinaleMode,
  type GameLength,
  type GameModeId,
  type GameOverPayload,
  type GamePhase,
  type GuessRevealShowPayload,
  type GuessShowDrawerPayload,
  type GuessShowGuesserPayload,
  type GuessShowPayload,
  type JoinRejectedPayload,
  type LobbyUpdatePayload,
  type NumericQuestionShowPayload,
  type NumericQuestionShowPlayerPayload,
  type NumericRevealShowPayload,
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
  type ServerErrorPayload,
  type SettingsUpdatedPayload,
  type StateSyncPayload,
  type StealChoosePayload,
  type StealResolvedPayload,
  type StealShowPayload,
  type StealShowPlayerPayload,
  type TrialQuestionShowPayload,
  type TrialQuestionShowPlayerPayload,
  type TrialRevealShowPayload,
  type VipChangedPayload,
} from '@game/shared';
import { socket } from '../socket';
import { useSocketConnection } from '../useSocketConnection';
import { clearLastSession, getLastSession, saveLastSession } from '../lastSession';
import { getOrCreatePlayerId } from '../playerId';
import { DIFFICULTY_MIX_LABELS } from '../difficultyLabels';
import { GAME_LENGTH_LABELS } from '../gameLengthLabels';
import { greekUpper } from '../greekUpper';
import { Avatar } from '../components/Avatar';
import { BlitzSwipeCard } from '../components/BlitzSwipeCard';
import { DrawingCanvas, type DrawingCanvasHandle } from '../components/DrawingCanvas';
import { WeaponIcon } from '../components/AnavasisScene';
import { useAvailableAvatars } from '../hooks/useAvailableAvatars';
import { fullscreenSupported, useFullscreen } from '../hooks/useFullscreen';

// React's CSSProperties doesn't model CSS custom properties - this lets the
// `--glow-color` variable the .glow-pulse class reads (in
// palette-theatro.css) be set inline per-element, since each glow needs
// a different colour.
type CSSVars = CSSProperties & Record<`--${string}`, string>;

// "Slightly lighter panels with a subtle inner glow, so cards feel lit
// rather than painted on." Never combined with an element that also uses
// the .glow/.glow-pulse classes - an inline boxShadow always wins over a
// CSS class's boxShadow and would silently clobber the glow ring.
const SURFACE_GLOW = 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 22px rgba(122,92,210,0.12)';

// Θέατρο palette pass - matches RevealView.tsx's own WRONG_OPACITY on
// the TV: correctness reads as full-opacity/bold vs 42%-opacity/regular,
// never as a colour swap.
const WRONG_OPACITY = 0.42;

// Task 165 - the same chamfer MarbleSlab.tsx clips the TV's slabs to
// (design/theatre-reference.html's --slab). Duplicated here as a literal
// rather than exported/imported: the phone's flat --marble fill (no vein,
// no lit sheen, no filter - phone rule) is a strict subset of MarbleSlab's
// look, so sharing the shape is enough without sharing the component.
const OPTION_SLAB_CLIP = 'polygon(1.5% 0, 98.5% 0.6%, 100% 3%, 99.4% 97%, 98% 100%, 2% 99.4%, 0 96%, 0.6% 3%)';

// Task 177 - the two options for the powerUpsEnabled SegmentedRow. false
// first so it renders as the left (default) segment.
const POWER_UPS_ENABLED_OPTIONS = [false, true] as const;
// Task 191 - the finale toggle. FINALE_MODE_OPTIONS is ['trial', 'climb']
// (shared) - Greek labels only exist here, same split as
// DIFFICULTY_MIX_LABELS/GAME_LENGTH_LABELS living outside @game/shared.
const FINALE_MODE_LABELS: Record<FinaleMode, string> = { trial: 'Η Δίκη', climb: 'Η Ανάβασις' };

// Power-up (Task 30b) - the two choosable effects, phrased from the CASTER's
// side ("freeze them"), unlike the victim-side banner during QUESTION.
const POWER_UP_LABELS: Record<PowerUpEffect, { icon: string; title: string; blurb: string }> = {
  ice: { icon: '🧊', title: 'Πάγος', blurb: 'Παγώνει το κινητό του για λίγα δευτερόλεπτα' },
  ink: { icon: '🖋️', title: 'Μελάνι', blurb: 'Θολώνει τις απαντήσεις του' },
};

// Η Μονομαχία (Task 190) - weapon slab labels, in DUEL_WEAPONS' own order
// (the reveal's WEAPON_NAME/WEAPON_BEATEN in AnavasisScene.tsx is the same
// three, TV-phrased; this is the picker's short form).
const DUEL_WEAPON_LABELS: Record<DuelWeapon, string> = {
  xifos: 'Ξίφος',
  dory: 'Δόρυ',
  aspida: 'Ασπίδα',
};

// Task 171 - a control must stay visibly (not just functionally) disabled
// until the socket is actually connected, so a tap in the pre-connect
// window lands on something the player can see is not ready, rather than
// a silent no-op.
function withDisabled<T extends CSSProperties>(style: T, disabled: boolean): T {
  return disabled ? { ...style, opacity: 0.35, cursor: 'not-allowed' } : style;
}

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
function SegmentedRow<T extends string | number | boolean>({
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

// Η Ανάβασις (Task 190) - the delta glyph CLIMB_REVEAL shows: +2 fastest
// correct, +1 other correct, -1 wrong, -2 no answer (ClimbRevealResult's own
// doc comment, shared/src/index.ts). No digits on this phone, same
// no-score-numbers rule the trial's phone view already follows.
function climbDeltaGlyph(delta: number): string {
  if (delta >= 2) {
    return '↑↑';
  }
  if (delta === 1) {
    return '↑';
  }
  if (delta <= -2) {
    return '↓↓';
  }
  return '↓';
}

// Η Μνήμη της Αγοράς (Task 209) - a `kind: 'colour'` question's options are
// plain Greek colour names (buildColourQuestion, shared/src/agora.ts's
// colourNameGr) - the wire payload deliberately carries no hex of its own
// (AgoraQuestionShowPlayerPayload). Matching an option's own text back
// against the shared AGORA_COLOURS table is what lets the swatch avoid
// hardcoding a hex here; a name with no match (should never happen - every
// colour option comes from this same table) renders no swatch at all.
function agoraSwatchHex(optionLabel: string): string | undefined {
  return AGORA_COLOURS.find((colour) => colour.nameGr === optionLabel)?.hex;
}

// Η Ανάβασις (Task 190) - the compact strip above CLIMB_QUESTION's answer
// grid and below CLIMB_REVEAL's delta: a static row of `top` notches, this
// phone's own step filled and nothing else - no digits, no other players
// (payload rule: ClimbQuestionShowPlayerPayload/ClimbRevealPlayerPayload
// only ever carry THIS phone's own step).
function ClimbStrip({ step, top }: { step: number; top: number }) {
  const notches = Array.from({ length: top }, (_, i) => i + 1);
  return (
    <div style={styles.climbStrip} data-testid="climb-step-strip">
      {notches.map((notch) => (
        <div
          key={notch}
          data-testid="climb-step-notch"
          data-filled={notch === step}
          style={notch === step ? styles.climbNotchFilled : styles.climbNotchEmpty}
        />
      ))}
    </div>
  );
}

// Task 174 - a dropped socket mid-game. Pure state, no transition: it
// mounts/unmounts on `visible` flipping rather than fading, matching the
// "no motion not driven by the finger" phone rule. `position: fixed` so it
// reads the same regardless of where in a phase view it's rendered from.
function ConnectionBanner({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }
  return (
    <div style={styles.connectionBanner} data-testid="connection-banner">
      Χάθηκε η σύνδεση…
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

// Task 178 - VIP-only crowd/voice sliders for the host's live playback
// levels. Fires on every drag tick (not a locked-in submit, unlike the
// numeric mode's own slider) - there is nothing to "lock in", the host
// applies whatever the VIP last set. `value` is percent (0-100); style
// matches the numeric slider (accentColor var(--wine-2)).
// Task 192 - collapsed behind one toggle button by default: ten call sites
// across the phone's phases were putting two full-width sliders on screen
// for every VIP on every phase, permanently. The two rows only ever render
// while `expanded` is true; collapsed is this component's own mount state,
// so every call site starts collapsed with no prop wiring of its own.
function VipAudioControls({
  crowdVolume,
  voiceVolume,
  onChange,
}: {
  crowdVolume: number;
  voiceVolume: number;
  onChange: (partial: { crowdVolume?: number; voiceVolume?: number }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={styles.vipAudioControls} data-testid="vip-audio-controls">
      <button
        type="button"
        style={styles.vipAudioToggle}
        onClick={() => setExpanded((current) => !current)}
        data-testid="vip-audio-toggle"
        aria-expanded={expanded}
      >
        <span>🔊 Ήχος</span>
        <span aria-hidden="true">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <>
          <div style={styles.vipAudioRow}>
            <div style={styles.vipAudioLabel}>
              <span>Πλήθος</span>
              <span data-testid="vip-crowd-volume-value">{crowdVolume}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={crowdVolume}
              onChange={(event) => onChange({ crowdVolume: Number(event.target.value) })}
              style={styles.vipAudioSlider}
              data-testid="vip-crowd-volume-slider"
            />
          </div>
          <div style={styles.vipAudioRow}>
            <div style={styles.vipAudioLabel}>
              <span>Φωνή</span>
              <span data-testid="vip-voice-volume-value">{voiceVolume}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={voiceVolume}
              onChange={(event) => onChange({ voiceVolume: Number(event.target.value) })}
              style={styles.vipAudioSlider}
              data-testid="vip-voice-volume-slider"
            />
          </div>
        </>
      )}
    </div>
  );
}

export default function ControllerScreen() {
  const { connected } = useSocketConnection();
  const [playerId] = useState(() => getOrCreatePlayerId());
  const [searchParams] = useSearchParams();

  // Task 173 - a deep-linked ?room=XXXX. Read ONCE at mount into plain
  // state (not derived from `searchParams` on every render): the code
  // field lets the player edit `code` freely afterwards, and this value
  // must stay fixed at whatever the link actually said so the "was this a
  // deep link" question below never flips mid-session.
  const [deepLinkCode] = useState(() => {
    const param = searchParams.get('room');
    return param && /^\d{4}$/.test(param) ? param : null;
  });
  // A ref mirror for the socket-listener effect below (registered once,
  // empty deps) to close over - same reasoning as codeRef, though this one
  // never actually changes after mount.
  const deepLinkCodeRef = useRef(deepLinkCode);
  // Pre-fills from the deep link, but never auto-joins - a name is still
  // required, so the player must still tap Join themselves. A malformed
  // param (not exactly 4 digits) is silently ignored (manual form, no
  // notice - see the acceptance criteria in tasks/173-qr-deeplink.md).
  const [code, setCode] = useState(() => deepLinkCode ?? '');
  // null = not checked yet (room:peek hasn't answered for this code, or
  // there's no deep link at all - the manual-entry path never touches
  // this). Only meaningful while `deepLinkCode` is set: it decides whether
  // the code field stays hidden (assume valid until told otherwise) or
  // reappears with an invalid-code notice.
  const [deepLinkRoomFound, setDeepLinkRoomFound] = useState<boolean | null>(null);
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
  // Task 175 - the ONE thing that decides whether the LOBBY-waiting view
  // below may render «Έναρξη»: set from player:joined (the only signal
  // ALWAYS present, even for a phase state:sync has no payload for yet -
  // see PlayerJoinedPayload's own doc comment), kept current after that by
  // phase:changed and state:sync. A second real vip:start_game tap is
  // already rejected server-side (room.phase !== 'LOBBY'); this is the
  // cosmetic half of that same guard.
  const [phase, setPhase] = useState<GamePhase>('LOBBY');
  const [question, setQuestion] = useState<QuestionShowPlayerPayload | null>(null);
  const [pendingChoice, setPendingChoice] = useState<number | null>(null);
  const [acceptedChoice, setAcceptedChoice] = useState<number | null>(null);
  // Task 223 - a malformed/malicious SUBMIT_ANSWER (server:error) never has
  // a button to mark, so it gets its own banner rather than reusing
  // pendingChoice/acceptedChoice. Cleared on the next question, same as the
  // other per-question state above.
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<RevealPlayerPayload | null>(null);
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null);
  const [vipPlayerId, setVipPlayerId] = useState<string | null>(null);
  const [vipName, setVipName] = useState<string | null>(null);
  const [roomSettings, setRoomSettings] = useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);
  // Task 178 - VIP crowd/voice sliders. Local-only: nothing echoes the
  // room's real value back to the VIP's own phone (AUDIO_VOLUME_CHANGED is
  // host-socket-targeted only), so this is purely "where the VIP last left
  // it this session" - starts at the same 100/100 default the host applies
  // before any change ever lands.
  const [audioVolume, setAudioVolume] = useState(DEFAULT_AUDIO_VOLUME);
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
  // Drawing mode (Task 56b). `draw.submitted` is only ever real on a
  // state:sync catching a phone up after it already submitted - a fresh
  // draw:show always carries `submitted: false`. The send guard is a ref
  // for the same one-send reasoning as powerUpSentRef/stealSentRef above.
  const [draw, setDraw] = useState<DrawShowPlayerPayload | null>(null);
  const drawCanvasRef = useRef<DrawingCanvasHandle>(null);
  const [drawStrokeCount, setDrawStrokeCount] = useState(0);
  const drawSentRef = useRef(false);
  // Task 165 - the drawer's own countdown, same "remaining snapshot + local
  // elapsed clock" idiom as the sabotage stack above: draw.durationMs is the
  // server's remaining-time snapshot at broadcast time (never a fresh full
  // duration), reset to 0 in applyDraw whenever a new one arrives.
  const [drawElapsedMs, setDrawElapsedMs] = useState(0);
  const drawElapsedRef = useRef(0);
  // One-shot guard for the DRAW_WARNING_MS flip (ember + one size step,
  // vibrate once) - must never re-fire on every subsequent tick.
  const [drawWarningActive, setDrawWarningActive] = useState(false);
  const drawWarningFiredRef = useRef(false);
  // GUESS. `guess.isDrawer` decides which of the two views renders - the
  // drawer's own payload has no `options` field AT ALL (see
  // GuessShowDrawerPayload), so there is nothing here that could even be
  // tapped into a guess on their own drawing.
  const [guess, setGuess] = useState<GuessShowGuesserPayload | GuessShowDrawerPayload | null>(null);
  const [guessChoice, setGuessChoice] = useState<number | null>(null);
  const guessSentRef = useRef(false);
  // GUESS_REVEAL - public and symmetric, so every phone (drawer included)
  // gets the same payload the TV does.
  const [guessReveal, setGuessReveal] = useState<GuessRevealShowPayload | null>(null);
  // Numeric mode (Task 66). `numericValue` is the ONE state the slider and
  // the number input both read and write - dragging sets it directly,
  // typing parses and clamps into it (see handleNumericInputChange). The
  // send guard is a ref for the same one-send reasoning as drawSentRef.
  const [numericQuestion, setNumericQuestion] = useState<NumericQuestionShowPlayerPayload | null>(null);
  const [numericValue, setNumericValue] = useState(0);
  const numericSentRef = useRef(false);
  // NUMERIC_REVEAL - public and symmetric, so every phone gets the same
  // payload the TV does; this phone's own row is found by playerId.
  const [numericReveal, setNumericReveal] = useState<NumericRevealShowPayload | null>(null);
  // Blitz mode (Task 156a). `blitzIndex` is the next statement to show - it
  // starts at the server's answeredCount (non-zero only on a reconnect) and
  // only ever advances, one per accepted swipe. BLITZ_REVEAL is this phone's
  // OWN counts and nothing about anyone else. The swipe surface itself
  // (156b/156c) isn't built yet - this is a STUB render only.
  const [blitz, setBlitz] = useState<BlitzShowPlayerPayload | null>(null);
  const [blitzIndex, setBlitzIndex] = useState(0);
  const [blitzReveal, setBlitzReveal] = useState<BlitzRevealPlayerPayload | null>(null);
  // Η Δίκη (Task 129). `trialQuestion.onTrial` decides picker vs spectator -
  // there is no per-choice ack event (see TRIAL_SUBMIT's doc comment in
  // shared), so `trialPendingChoice` is this phone's OWN optimistic tap and
  // nothing more; a state:sync catching a phone up after it already locked
  // in only carries the boolean `lockedIn`, never which button it was, so a
  // reconnect mid-question shows every option dimmed with none highlighted -
  // a real limit of the payload, not a shortcut taken here. The send guard
  // is a ref for the same one-send reasoning as drawSentRef/guessSentRef.
  const [trialQuestion, setTrialQuestion] = useState<TrialQuestionShowPlayerPayload | null>(null);
  const [trialPendingChoice, setTrialPendingChoice] = useState<number | null>(null);
  const trialSentRef = useRef(false);
  // TRIAL_REVEAL - public and symmetric, like reveal:show. Deliberately does
  // NOT clear `trialQuestion` when it arrives (mirrors handleRevealShow not
  // clearing `question`) so this view can still look up the text of this
  // phone's own choice out of `trialQuestion.options`.
  const [trialReveal, setTrialReveal] = useState<TrialRevealShowPayload | null>(null);
  // Η Ανάβασις (Task 190) - same one-tap, no-ack shape as the trial's
  // CLIMB_SUBMIT above: `climbSentRef` guards the double-tap race, and
  // CLIMB_REVEAL is public/symmetric like TRIAL_REVEAL (does not clear
  // `climbQuestion`, same reasoning).
  const [climbQuestion, setClimbQuestion] = useState<ClimbQuestionShowPlayerPayload | null>(null);
  const [climbPendingChoice, setClimbPendingChoice] = useState<number | null>(null);
  const climbSentRef = useRef(false);
  const [climbReveal, setClimbReveal] = useState<ClimbRevealPlayerPayload | null>(null);
  // Η Μονομαχία (Task 190) - same shape again: one tap (a weapon), no ack,
  // `duelSentRef` guards the double-tap race. DUEL_REVEAL is public and
  // symmetric; a tie re-enters DUEL_PICK, which arrives as a fresh
  // duel_pick:show (picked: false) and overwrites this through
  // applyDuelPick - no separate "re-arm" branch needed.
  const [duelPick, setDuelPick] = useState<DuelPickShowPlayerPayload | null>(null);
  const [duelPendingWeapon, setDuelPendingWeapon] = useState<DuelWeapon | null>(null);
  const duelSentRef = useRef(false);
  const [duelReveal, setDuelReveal] = useState<DuelRevealPayload | null>(null);
  // Η Μνήμη της Αγοράς (Task 209). AGORA_EXPOSE carries the full scene
  // (symmetric to TV/phone alike) but this phone never reads any of it, so
  // it gets no state of its own - only `phase` gates its hold view.
  // AGORA_QUESTION follows the trial/climb/duel one-tap-no-reconciling-ack
  // idiom: AGORA_SUBMIT's ack happens to reuse the shared ANSWER_ACCEPTED
  // event, but the tap is already optimistically final here regardless, so
  // the ack is ignored. AGORA_REVEAL is public/symmetric and, like
  // trialReveal/climbReveal, deliberately does NOT clear `agoraQuestion` on
  // arrival - this view looks up the text of this phone's own choice out of
  // `agoraQuestion.options`.
  const [agoraQuestion, setAgoraQuestion] = useState<AgoraQuestionShowPlayerPayload | null>(null);
  const [agoraPendingChoice, setAgoraPendingChoice] = useState<number | null>(null);
  const agoraSentRef = useRef(false);
  const [agoraReveal, setAgoraReveal] = useState<AgoraRevealPlayerPayload | null>(null);

  // Task 174 - auto-resume. A stored session (written on every successful
  // join/reconnect, see handleJoined) means this playerId belongs to a room
  // as of the LAST page load - `resuming` gates the dedicated "Επανασύνδεση…"
  // screen below (shown only until the first join attempt of THIS page load
  // resolves one way or the other) while `identityRef` is the ONE thing the
  // reconnect effect further down actually needs, kept as a ref rather than
  // state since it's read from inside socket handlers registered once at
  // mount (the same staleness reason codeRef/deepLinkCodeRef exist below).
  // No stored session at all (a first-ever visit, or after a cleared
  // identity) leaves both at their inert defaults and this page behaves
  // exactly as it did before this task.
  const [pendingResume] = useState(() => getLastSession());
  const [resuming, setResuming] = useState(() => pendingResume !== null);
  const identityRef = useRef(pendingResume);

  useEffect(() => {
    function handleJoined(payload: PlayerJoinedPayload) {
      setJoined(payload);
      setError(null);
      // Task 175 - the only signal that's ALWAYS present on a join/reconnect,
      // even for a phase state:sync below has no payload for yet.
      setPhase(payload.phase);
      // Task 174 - every accepted join (fresh, manual reconnect, or this
      // page load's own auto-resume) becomes the identity a LATER socket
      // reconnect replays automatically (see the `connected`-keyed effect
      // below) and the one restored on a full page reload after that.
      identityRef.current = { code: payload.code, name: payload.name, avatarId: payload.avatarId };
      saveLastSession(identityRef.current);
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

    // Drawing mode (Task 56b) - set together for the same reason
    // applyPowerUp/applySteal are: the canvas/waiting view and the send
    // guard can never disagree about whether this phone already submitted.
    // `submitted` is only ever true on a state:sync catching a phone up.
    function applyDraw(payload: DrawShowPlayerPayload | null) {
      setDraw(payload);
      drawSentRef.current = payload?.submitted ?? false;
      // Task 165 - payload.durationMs is a fresh remaining-time snapshot
      // computed by the server this instant, same reasoning as
      // applySabotages above: the local clock restarts at 0.
      drawElapsedRef.current = 0;
      setDrawElapsedMs(0);
      drawWarningFiredRef.current = false;
      setDrawWarningActive(false);
    }

    // `yourGuess` only exists (and is only ever non-null) on the GUESSER
    // variant - the drawer's own payload has no such field, matching what
    // the server actually sends them (see GuessShowDrawerPayload).
    function applyGuess(payload: GuessShowGuesserPayload | GuessShowDrawerPayload | null) {
      setGuess(payload);
      const yourGuess = payload && !payload.isDrawer ? payload.yourGuess : null;
      setGuessChoice(yourGuess);
      guessSentRef.current = yourGuess !== null;
    }

    // Numeric mode (Task 66) - set together for the same reason applyDraw
    // is: the slider/input view and the send guard can never disagree about
    // whether this phone already submitted. `submitted` is only ever true
    // on a state:sync catching a phone up after it already locked in.
    function applyNumericQuestion(payload: NumericQuestionShowPlayerPayload | null) {
      setNumericQuestion(payload);
      numericSentRef.current = payload?.submitted ?? false;
      if (payload && !payload.submitted) {
        setNumericValue(Math.round(payload.max / 2 / payload.sliderStep) * payload.sliderStep);
      }
    }

    // Η Δίκη (Task 129) - set together for the same reason applyPowerUp/
    // applyDraw are: the answer grid and the send guard can never disagree
    // about whether this phone already locked in. `lockedIn` is only ever
    // true on a state:sync catching a phone up after it already answered.
    function applyTrialQuestion(payload: TrialQuestionShowPlayerPayload | null) {
      setTrialQuestion(payload);
      setTrialPendingChoice(null);
      trialSentRef.current = payload?.lockedIn ?? false;
    }

    // Η Ανάβασις (Task 190) - same pairing as applyTrialQuestion: the ladder
    // strip/answer grid and the send guard can never disagree about whether
    // this phone already locked in.
    function applyClimbQuestion(payload: ClimbQuestionShowPlayerPayload | null) {
      setClimbQuestion(payload);
      setClimbPendingChoice(null);
      climbSentRef.current = payload?.lockedIn ?? false;
    }

    // Η Μονομαχία (Task 190) - same pairing again, `picked` instead of
    // `lockedIn`.
    function applyDuelPick(payload: DuelPickShowPlayerPayload | null) {
      setDuelPick(payload);
      setDuelPendingWeapon(null);
      duelSentRef.current = payload?.picked ?? false;
    }

    // Η Μνήμη της Αγοράς (Task 209) - same pairing again, `answered` instead
    // of `lockedIn`/`picked`.
    function applyAgoraQuestion(payload: AgoraQuestionShowPlayerPayload | null) {
      setAgoraQuestion(payload);
      setAgoraPendingChoice(null);
      agoraSentRef.current = payload?.answered ?? false;
    }

    // Blitz mode (Task 156a) - set together for the same reason applyDraw
    // is: the swipe surface and the next-index can never disagree about how
    // far this phone already got.
    function applyBlitz(payload: BlitzShowPlayerPayload | null) {
      setBlitz(payload);
      setBlitzIndex(payload?.answeredCount ?? 0);
    }

    function handlePhaseChanged(payload: PhaseChangedPayload) {
      setPhase(payload.phase);
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
        applyDraw(null);
        applyGuess(null);
        setGuessReveal(null);
        applyNumericQuestion(null);
        setNumericReveal(null);
        applyBlitz(null);
        setBlitzReveal(null);
        applyTrialQuestion(null);
        setTrialReveal(null);
        applyClimbQuestion(null);
        setClimbReveal(null);
        applyDuelPick(null);
        setDuelReveal(null);
        applyAgoraQuestion(null);
        setAgoraReveal(null);
        // Pause is impossible in LOBBY - reset defensively.
        setPaused(false);
        setPausedByName(null);
      }
      // Blitz (Task 156a) - the Task 140 trap: phase-scoped state is cleared
      // on EVERY transition that could follow it, not just the one that
      // "normally" ends it. BLITZ_REVEAL clears `blitz` in its own handler
      // and GAME_OVER clears both in handleGameOver; any other phase
      // arriving means this phone must not still be swiping.
      if (payload.phase !== 'BLITZ' && payload.phase !== 'BLITZ_REVEAL' && payload.phase !== 'GAME_OVER') {
        applyBlitz(null);
        setBlitzReveal(null);
      }
    }

    // Task 223 - a rejected SUBMIT_ANSWER (out-of-range or non-numeric
    // choice). The button tap that produced it was never valid, so there is
    // no answer to mark; this just surfaces the server's own message.
    function handleServerError(payload: ServerErrorPayload) {
      console.warn(`server error: ${payload.message}`);
      setAnswerError(payload.message);
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
      // Task 174 - a stored identity that no longer holds (the room is gone,
      // most commonly - see PLAYER_JOIN's existing-player fast path, which
      // is the only route a resume ever takes and bypasses every OTHER
      // rejection reason). Drop it so this page falls through to the normal
      // form instead of retrying it forever, and a later reconnect effect
      // run can't replay a code that just got rejected.
      identityRef.current = null;
      clearLastSession();
      setResuming(false);
    }

    function handleRoomPeekResult(payload: RoomPeekResultPayload) {
      if (payload.code === codeRef.current) {
        setPeekedTakenAvatarIds(payload.takenAvatarIds);
        if (payload.code === deepLinkCodeRef.current) {
          setDeepLinkRoomFound(payload.found);
        }
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
        setAnswerError(null);
        setReveal(null);
        // POWER_UP flows straight into the question it preceded - whatever
        // was chosen is now the server's business, and lands right here.
        applyPowerUp(null);
        applySteal(null); // any steal belonged to the previous question
        // Full mode (Task 134) only: this is also the FIRST event of the
        // quiz stage that follows the numeric stage, and numericReveal is
        // never otherwise cleared past the numeric segment's own last round
        // (nothing else ever fires a fresh numeric_question:show to clear
        // it). Left set, it outranks `question` in the render order below
        // and the phone gets stuck showing the last numeric reveal forever -
        // no answer buttons at this question OR, since nothing after this
        // clears it either, at the trial that follows it (Task 140).
        setNumericReveal(null);
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

    // Drawing mode (Task 56b) - the player branch of an asymmetric event.
    // The host variant (submission counts, never a word) is not this
    // screen's business.
    function handleDrawShow(payload: DrawShowPayload) {
      if (!isDrawHostPayload(payload)) {
        setQuestion(null);
        setReveal(null);
        applyPowerUp(null);
        applySteal(null);
        applyGuess(null);
        setGuessReveal(null);
        applyDraw(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    // GUESS's player branch - carries EITHER the guesser shape (options, no
    // image) or the drawer shape (no options at all), never the host's
    // image+options combination. Which one this phone gets is entirely the
    // server's call (see submitGuess rejecting the drawer's own guess).
    function handleGuessShow(payload: GuessShowPayload) {
      if (!isGuessHostPayload(payload)) {
        applyDraw(null);
        setGuessReveal(null);
        applyGuess(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    // Public and symmetric, like reveal:show - every phone (drawer
    // included) gets the same payload the TV does, since the round is over.
    function handleGuessRevealShow(payload: GuessRevealShowPayload) {
      applyGuess(null);
      setGuessReveal(payload);
      setPaused(payload.paused);
      setPausedByName(payload.pausedByName);
    }

    // Numeric mode (Task 66) - the player branch of an asymmetric event. The
    // host variant (submission counts, never a value) is not this screen's
    // business.
    function handleNumericQuestionShow(payload: NumericQuestionShowPayload) {
      if (!isNumericQuestionHostPayload(payload)) {
        setQuestion(null);
        setReveal(null);
        applyPowerUp(null);
        applySteal(null);
        applyDraw(null);
        applyGuess(null);
        setGuessReveal(null);
        setNumericReveal(null);
        applyNumericQuestion(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    // Public and symmetric, like guess_reveal:show - every phone gets the
    // same payload the TV does, since the round is over.
    function handleNumericRevealShow(payload: NumericRevealShowPayload) {
      applyNumericQuestion(null);
      setNumericReveal(payload);
      setPaused(payload.paused);
      setPausedByName(payload.pausedByName);
    }

    // Blitz mode (Task 156a) - the player branch of an asymmetric event. The
    // host variant (progress per player, no texts) is not this screen's
    // business.
    function handleBlitzShow(payload: BlitzShowPayload) {
      if (!isBlitzShowHostPayload(payload)) {
        setQuestion(null);
        setReveal(null);
        applyPowerUp(null);
        applySteal(null);
        applyDraw(null);
        applyGuess(null);
        setGuessReveal(null);
        applyNumericQuestion(null);
        setNumericReveal(null);
        setBlitzReveal(null);
        applyBlitz(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    // This phone's own counts only - the host's per-player variant never
    // reaches a phone.
    function handleBlitzRevealShow(payload: BlitzRevealPayload) {
      if (!isBlitzRevealHostPayload(payload)) {
        applyBlitz(null);
        setBlitzReveal(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    // Η Δίκη (Task 129) - the player branch of an asymmetric event. The host
    // variant (everyone's life and lock-in state, in aggregate) is not this
    // screen's business.
    function handleTrialQuestionShow(payload: TrialQuestionShowPayload) {
      if (!isTrialQuestionHostPayload(payload)) {
        setQuestion(null);
        setPendingChoice(null);
        setAcceptedChoice(null);
        setReveal(null);
        applyPowerUp(null);
        applySteal(null);
        setTrialReveal(null);
        applyTrialQuestion(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    // Public and symmetric, like reveal:show - the round is over, so every
    // phone (eliminated or not) gets the same payload the TV does. Does NOT
    // clear `trialQuestion` - see its own declaration for why.
    function handleTrialRevealShow(payload: TrialRevealShowPayload) {
      setTrialReveal(payload);
      setPaused(payload.paused);
      setPausedByName(payload.pausedByName);
    }

    // Η Ανάβασις (Task 190) - the player branch of an asymmetric event, same
    // pairing as handleTrialQuestionShow above. The host variant (every
    // climber's step, in aggregate) is not this screen's business. Also
    // clears trial* defensively - a room can play a trial-finale game and a
    // climb-finale one back to back (Task 140 corollary: this is the first
    // event of a fresh climb, and nothing else would clear a stale trial
    // view left over from an earlier game in the same session).
    function handleClimbQuestionShow(payload: ClimbQuestionShowPayload) {
      if (!isClimbQuestionHostPayload(payload)) {
        setQuestion(null);
        setPendingChoice(null);
        setAcceptedChoice(null);
        setReveal(null);
        applyPowerUp(null);
        applySteal(null);
        applyTrialQuestion(null);
        setTrialReveal(null);
        setClimbReveal(null);
        applyDuelPick(null);
        setDuelReveal(null);
        applyClimbQuestion(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    // Public and symmetric, like trial_reveal:show. Does NOT clear
    // `climbQuestion` - same reasoning as handleTrialRevealShow.
    function handleClimbRevealShow(payload: ClimbRevealPayload) {
      if (!isClimbRevealHostPayload(payload)) {
        setClimbReveal(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    // Η Μονομαχία (Task 190) - the player branch of an asymmetric event; the
    // host variant (both duelists, who has picked) is not this screen's
    // business. Fires only after a CLIMB_REVEAL sends two players to the
    // duel, or after a tied DUEL_REVEAL re-enters DUEL_PICK - either way the
    // climb race itself is over (or paused), so climbQuestion/climbReveal
    // clear here too.
    function handleDuelPickShow(payload: DuelPickShowPayload) {
      if (!isDuelPickHostPayload(payload)) {
        applyClimbQuestion(null);
        setClimbReveal(null);
        setDuelReveal(null);
        applyDuelPick(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    // Public and symmetric, like duel_reveal:show. Does NOT clear
    // `duelPick` - a tie's re-arm arrives as a fresh duel_pick:show anyway
    // (applyDuelPick resets picked to false from that payload alone).
    function handleDuelRevealShow(payload: DuelRevealPayload | DuelRevealHostPayload) {
      if (!isDuelRevealHostPayload(payload)) {
        setDuelReveal(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    // Η Μνήμη της Αγοράς (Task 209) - symmetric like agora_expose:show
    // itself: every phone gets the identical payload the TV does. The scene
    // it carries is deliberately never touched here - only phase/pause
    // matter to this screen's plain hold view. Clears every OTHER mode's
    // state defensively, the same "first event of a fresh game" reasoning
    // handleClimbQuestionShow documents above - agora is reachable
    // standalone from the lobby mode-picker just like climb/trial/duel are.
    function handleAgoraExposeShow(payload: AgoraExposeShowPayload) {
      setQuestion(null);
      setPendingChoice(null);
      setAcceptedChoice(null);
      setReveal(null);
      applyPowerUp(null);
      applySteal(null);
      applyDraw(null);
      applyGuess(null);
      setGuessReveal(null);
      applyNumericQuestion(null);
      setNumericReveal(null);
      applyBlitz(null);
      setBlitzReveal(null);
      applyTrialQuestion(null);
      setTrialReveal(null);
      applyClimbQuestion(null);
      setClimbReveal(null);
      applyDuelPick(null);
      setDuelReveal(null);
      applyAgoraQuestion(null);
      setAgoraReveal(null);
      setPaused(payload.paused);
      setPausedByName(payload.pausedByName);
    }

    // The player branch of an asymmetric event - the host variant (question
    // text, standings, who has answered) is not this screen's business.
    // Clears `agoraReveal` from the previous round - the round's own
    // AGORA_EXPOSE already cleared everything else once at round start.
    function handleAgoraQuestionShow(payload: AgoraQuestionShowPayload) {
      if (!isAgoraQuestionHostPayload(payload)) {
        setAgoraReveal(null);
        applyAgoraQuestion(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    // Public and symmetric, like trial_reveal:show/climb_reveal:show. Does
    // NOT clear `agoraQuestion` - same reasoning: this view looks up the
    // text of this phone's own choice out of `agoraQuestion.options`.
    function handleAgoraRevealShow(payload: AgoraRevealShowPayload) {
      if (!isAgoraRevealHostPayload(payload)) {
        setAgoraReveal(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
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
      applyDraw(null);
      applyGuess(null);
      setGuessReveal(null);
      applyNumericQuestion(null);
      setNumericReveal(null);
      applyBlitz(null);
      setBlitzReveal(null);
      applyTrialQuestion(null);
      setTrialReveal(null);
      applyClimbQuestion(null);
      setClimbReveal(null);
      applyDuelPick(null);
      setDuelReveal(null);
      applyAgoraQuestion(null);
      setAgoraReveal(null);
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
      setPhase(payload.phase);
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
      applyDraw(null);
      applyGuess(null);
      setGuessReveal(null);
      applyNumericQuestion(null);
      setNumericReveal(null);
      applyBlitz(null);
      setBlitzReveal(null);
      applyTrialQuestion(null);
      setTrialReveal(null);
      applyClimbQuestion(null);
      setClimbReveal(null);
      applyDuelPick(null);
      setDuelReveal(null);
      applyAgoraQuestion(null);
      setAgoraReveal(null);

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
        // Drawing mode (Task 56b) - same reconnect reasoning as POWER_UP/
        // STEAL above: applyDraw/applyGuess read whatever this phone
        // already did (submitted a drawing, locked in a guess) straight
        // from the server's own state, never from anything the client
        // remembered.
        case 'DRAW':
          if (!isDrawHostPayload(payload)) {
            applyDraw(payload);
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        case 'GUESS':
          if (!isGuessHostPayload(payload)) {
            applyGuess(payload);
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        case 'GUESS_REVEAL':
          setGuessReveal(payload);
          setPaused(payload.paused);
          setPausedByName(payload.pausedByName);
          break;
        // Numeric mode (Task 66) - same reconnect reasoning as DRAW/GUESS
        // above: applyNumericQuestion reads whatever this phone already did
        // (locked in a value) straight from the server's own state.
        case 'NUMERIC_QUESTION':
          if (!isNumericQuestionHostPayload(payload)) {
            applyNumericQuestion(payload);
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        case 'NUMERIC_REVEAL':
          setNumericReveal(payload);
          setPaused(payload.paused);
          setPausedByName(payload.pausedByName);
          break;
        // Blitz mode (Task 156a) - same reconnect reasoning: applyBlitz
        // reads how far this phone already got (answeredCount) straight
        // from the server's own state, so a reconnect resumes at the right
        // statement.
        case 'BLITZ':
          if (!isBlitzShowHostPayload(payload)) {
            applyBlitz(payload);
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        case 'BLITZ_REVEAL':
          if (!isBlitzRevealHostPayload(payload)) {
            setBlitzReveal(payload);
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        // Η Δίκη (Task 129) - same reconnect reasoning as QUESTION above:
        // applyTrialQuestion reads whatever this phone already did (locked
        // in) straight from the server's own state. TRIAL_REVEAL, like
        // REVEAL, cannot restore `trialQuestion` (already cleared above), so
        // this phone's own choice text is simply not shown after a reconnect
        // mid-reveal - the same limit REVEAL's own case has.
        case 'TRIAL_QUESTION':
          if (!isTrialQuestionHostPayload(payload)) {
            applyTrialQuestion(payload);
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        case 'TRIAL_REVEAL':
          setTrialReveal(payload);
          setPaused(payload.paused);
          setPausedByName(payload.pausedByName);
          break;
        // Η Ανάβασις / Η Μονομαχία (Task 190) - same reconnect reasoning as
        // TRIAL_QUESTION/TRIAL_REVEAL above.
        case 'CLIMB_QUESTION':
          if (!isClimbQuestionHostPayload(payload)) {
            applyClimbQuestion(payload);
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        case 'CLIMB_REVEAL':
          if (!isClimbRevealHostPayload(payload)) {
            setClimbReveal(payload);
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        case 'DUEL_PICK':
          if (!isDuelPickHostPayload(payload)) {
            applyDuelPick(payload);
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        case 'DUEL_REVEAL':
          if (!isDuelRevealHostPayload(payload)) {
            setDuelReveal(payload);
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        // Η Μνήμη της Αγοράς (Task 209) - AGORA_EXPOSE is symmetric (no
        // host/player split), so no isXHostPayload guard is needed; the
        // scene it carries stays untouched here regardless.
        case 'AGORA_EXPOSE':
          setPaused(payload.paused);
          setPausedByName(payload.pausedByName);
          break;
        // Same reconnect reasoning as CLIMB_QUESTION/CLIMB_REVEAL above.
        case 'AGORA_QUESTION':
          if (!isAgoraQuestionHostPayload(payload)) {
            applyAgoraQuestion(payload);
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
        case 'AGORA_REVEAL':
          if (!isAgoraRevealHostPayload(payload)) {
            setAgoraReveal(payload);
            setPaused(payload.paused);
            setPausedByName(payload.pausedByName);
          }
          break;
      }
    }

    socket.on(ServerEvents.PLAYER_JOINED, handleJoined);
    socket.on(ServerEvents.JOIN_REJECTED, handleRejected);
    socket.on(ServerEvents.ERROR, handleServerError);
    socket.on(ServerEvents.LOBBY_UPDATE, handleLobbyUpdate);
    socket.on(ServerEvents.PHASE_CHANGED, handlePhaseChanged);
    socket.on(ServerEvents.QUESTION_SHOW, handleQuestionShow);
    socket.on(ServerEvents.ANSWER_ACCEPTED, handleAnswerAccepted);
    socket.on(ServerEvents.POWER_UP_SHOW, handlePowerUpShow);
    socket.on(ServerEvents.POWER_UP_CHOICE_ACCEPTED, handlePowerUpChoiceAccepted);
    socket.on(ServerEvents.STEAL_SHOW, handleStealShow);
    socket.on(ServerEvents.STEAL_RESOLVED, handleStealResolved);
    socket.on(ServerEvents.REVEAL_SHOW, handleRevealShow);
    socket.on(ServerEvents.DRAW_SHOW, handleDrawShow);
    socket.on(ServerEvents.GUESS_SHOW, handleGuessShow);
    socket.on(ServerEvents.GUESS_REVEAL_SHOW, handleGuessRevealShow);
    socket.on(ServerEvents.NUMERIC_QUESTION_SHOW, handleNumericQuestionShow);
    socket.on(ServerEvents.NUMERIC_REVEAL_SHOW, handleNumericRevealShow);
    socket.on(ServerEvents.BLITZ_SHOW, handleBlitzShow);
    socket.on(ServerEvents.BLITZ_REVEAL_SHOW, handleBlitzRevealShow);
    socket.on(ServerEvents.TRIAL_QUESTION_SHOW, handleTrialQuestionShow);
    socket.on(ServerEvents.TRIAL_REVEAL_SHOW, handleTrialRevealShow);
    socket.on(ServerEvents.CLIMB_QUESTION_SHOW, handleClimbQuestionShow);
    socket.on(ServerEvents.CLIMB_REVEAL_SHOW, handleClimbRevealShow);
    socket.on(ServerEvents.DUEL_PICK_SHOW, handleDuelPickShow);
    socket.on(ServerEvents.DUEL_REVEAL_SHOW, handleDuelRevealShow);
    socket.on(ServerEvents.AGORA_EXPOSE_SHOW, handleAgoraExposeShow);
    socket.on(ServerEvents.AGORA_QUESTION_SHOW, handleAgoraQuestionShow);
    socket.on(ServerEvents.AGORA_REVEAL_SHOW, handleAgoraRevealShow);
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
      socket.off(ServerEvents.ERROR, handleServerError);
      socket.off(ServerEvents.LOBBY_UPDATE, handleLobbyUpdate);
      socket.off(ServerEvents.PHASE_CHANGED, handlePhaseChanged);
      socket.off(ServerEvents.QUESTION_SHOW, handleQuestionShow);
      socket.off(ServerEvents.ANSWER_ACCEPTED, handleAnswerAccepted);
      socket.off(ServerEvents.POWER_UP_SHOW, handlePowerUpShow);
      socket.off(ServerEvents.POWER_UP_CHOICE_ACCEPTED, handlePowerUpChoiceAccepted);
      socket.off(ServerEvents.STEAL_SHOW, handleStealShow);
      socket.off(ServerEvents.STEAL_RESOLVED, handleStealResolved);
      socket.off(ServerEvents.REVEAL_SHOW, handleRevealShow);
      socket.off(ServerEvents.DRAW_SHOW, handleDrawShow);
      socket.off(ServerEvents.GUESS_SHOW, handleGuessShow);
      socket.off(ServerEvents.GUESS_REVEAL_SHOW, handleGuessRevealShow);
      socket.off(ServerEvents.NUMERIC_QUESTION_SHOW, handleNumericQuestionShow);
      socket.off(ServerEvents.NUMERIC_REVEAL_SHOW, handleNumericRevealShow);
      socket.off(ServerEvents.BLITZ_SHOW, handleBlitzShow);
      socket.off(ServerEvents.BLITZ_REVEAL_SHOW, handleBlitzRevealShow);
      socket.off(ServerEvents.TRIAL_QUESTION_SHOW, handleTrialQuestionShow);
      socket.off(ServerEvents.TRIAL_REVEAL_SHOW, handleTrialRevealShow);
      socket.off(ServerEvents.CLIMB_QUESTION_SHOW, handleClimbQuestionShow);
      socket.off(ServerEvents.CLIMB_REVEAL_SHOW, handleClimbRevealShow);
      socket.off(ServerEvents.DUEL_PICK_SHOW, handleDuelPickShow);
      socket.off(ServerEvents.DUEL_REVEAL_SHOW, handleDuelRevealShow);
      socket.off(ServerEvents.AGORA_EXPOSE_SHOW, handleAgoraExposeShow);
      socket.off(ServerEvents.AGORA_QUESTION_SHOW, handleAgoraQuestionShow);
      socket.off(ServerEvents.AGORA_REVEAL_SHOW, handleAgoraRevealShow);
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

  // Task 174 - fires on EVERY transition into `connected`, which covers both
  // cases this task cares about with one emit: the very first connect of a
  // fresh page load (auto-resume, `identityRef` seeded from localStorage)
  // and a later socket.io auto-reconnect after a mid-game drop (identityRef
  // by then holds whatever handleJoined last confirmed, since a new
  // underlying socket.id means the server has no association for this
  // phone until it re-announces itself). A page with no stored identity and
  // no join yet leaves identityRef.current null, so this is a no-op until
  // the manual form's own handleJoin sends the first PLAYER_JOIN itself.
  useEffect(() => {
    if (connected && identityRef.current) {
      const { code: resumeCode, name, avatarId } = identityRef.current;
      socket.emit(ClientEvents.PLAYER_JOIN, { code: resumeCode, name, playerId, avatarId });
    }
  }, [connected, playerId]);

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

  // Task 165 - the drawer's own countdown, same anchoring discipline as the
  // sabotage ticker above: torn down while paused (freezes it, same as the
  // server's pause-aware timer), stops once nothing is left to count.
  useEffect(() => {
    if (!draw || draw.submitted || paused) {
      return;
    }
    const anchoredAt = Date.now();
    const alreadyElapsedMs = drawElapsedRef.current;
    const handle = setInterval(() => {
      const elapsed = alreadyElapsedMs + (Date.now() - anchoredAt);
      drawElapsedRef.current = elapsed;
      setDrawElapsedMs(elapsed);
      if (elapsed >= draw.durationMs) {
        clearInterval(handle);
      }
    }, 100);
    return () => clearInterval(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, paused]);

  // Task 165 - the ONE flip, guarded so it can never re-fire once the
  // remaining time has already crossed the threshold this round.
  useEffect(() => {
    if (!draw || draw.submitted || drawWarningFiredRef.current) {
      return;
    }
    const remainingMs = draw.durationMs - drawElapsedMs;
    if (remainingMs <= DRAW_WARNING_MS) {
      drawWarningFiredRef.current = true;
      setDrawWarningActive(true);
      if (typeof navigator.vibrate === 'function') {
        navigator.vibrate(200);
      }
    }
  }, [draw, drawElapsedMs]);

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
  // Task 174 - every in-game tap/slider/submit gates on this, not `paused`
  // alone: a dropped socket must lock inputs exactly like a VIP pause does,
  // so a buffered emit can never fire against a phase this phone never saw
  // (socket.io queues emits made while disconnected and flushes them on
  // reconnect otherwise). The connection banner's own visibility is a
  // separate check (`!connected && joined !== null`) - this is only the
  // input-disabling half.
  const inputsLocked = paused || !connected;

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
    if (pendingChoice !== null || inputsLocked || icedMs > 0) {
      return; // optimistic lock - first tap is final, no changing the answer
    }
    setPendingChoice(index);
    socket.emit(ClientEvents.SUBMIT_ANSWER, { choice: index });
  }

  // Power-up (Task 30b). Step 1 sends NOTHING - picking an effect only moves
  // this phone to the target list, so the back button below is a pure local
  // undo with no server round-trip to take back.
  function handlePowerUpPickEffect(effect: PowerUpEffect) {
    if (powerUpSentRef.current || inputsLocked) {
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
    if (powerUpSentRef.current || powerUpEffect === null || inputsLocked) {
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
    if (stealSentRef.current || inputsLocked) {
      return;
    }
    stealSentRef.current = true;
    const choice: StealChoosePayload = { targetPlayerId };
    setSteal((current) => (current ? { ...current, yourChoice: choice } : current));
    socket.emit(ClientEvents.STEAL_CHOOSE, choice);
  }

  // Drawing mode (Task 56b). One tap, one send, guarded by a ref for the
  // same reason handleStealPick's is - a double tap can't slip a second
  // draw:submit through the gap before React re-renders.
  function handleDrawSubmit() {
    if (drawSentRef.current || inputsLocked) {
      return;
    }
    const image = drawCanvasRef.current?.exportDataUrl();
    if (!image) {
      return;
    }
    drawSentRef.current = true;
    setDraw((current) => (current ? { ...current, submitted: true } : current));
    socket.emit(ClientEvents.DRAW_SUBMIT, { image });
  }

  // GUESS. Same one-tap, one-send, ref-guarded discipline - never reachable
  // for the drawer's own round since that view renders no option buttons
  // at all (criterion 3), but guarded here too as defense in depth.
  function handleGuessTap(index: number) {
    if (guessSentRef.current || inputsLocked || !guess || guess.isDrawer) {
      return;
    }
    guessSentRef.current = true;
    setGuessChoice(index);
    socket.emit(ClientEvents.DRAW_GUESS, { choice: index });
  }

  // Η Δίκη (Task 129). One tap, one send - there is no reconciling ack (see
  // TRIAL_SUBMIT's doc comment in shared), so a ref guards the double-tap
  // race the same way handleDrawSubmit/handleGuessTap's do.
  function handleTrialAnswerTap(index: number) {
    if (trialSentRef.current || inputsLocked) {
      return;
    }
    trialSentRef.current = true;
    setTrialPendingChoice(index);
    socket.emit(ClientEvents.TRIAL_SUBMIT, { choice: index });
  }

  // Η Ανάβασις (Task 190). Same one-tap, no-ack, ref-guarded shape as
  // handleTrialAnswerTap.
  function handleClimbAnswerTap(index: number) {
    if (climbSentRef.current || inputsLocked) {
      return;
    }
    climbSentRef.current = true;
    setClimbPendingChoice(index);
    socket.emit(ClientEvents.CLIMB_SUBMIT, { choice: index });
  }

  // Η Μονομαχία (Task 190). Same shape again - one weapon, one send, no
  // taking it back; the server ignores a repick regardless, this just keeps
  // the phone's own UI from offering one.
  function handleDuelWeaponPick(weapon: DuelWeapon) {
    if (duelSentRef.current || inputsLocked) {
      return;
    }
    duelSentRef.current = true;
    setDuelPendingWeapon(weapon);
    socket.emit(ClientEvents.DUEL_PICK, { weapon });
  }

  // Η Μνήμη της Αγοράς (Task 209). Same one-tap, no-ack, ref-guarded shape
  // as handleTrialAnswerTap/handleClimbAnswerTap - AGORA_SUBMIT's ack
  // happens to reuse the shared ANSWER_ACCEPTED event, but the tap is
  // optimistically final here regardless, like every other non-plain-quiz
  // mode.
  function handleAgoraAnswerTap(index: number) {
    if (agoraSentRef.current || inputsLocked) {
      return;
    }
    agoraSentRef.current = true;
    setAgoraPendingChoice(index);
    socket.emit(ClientEvents.AGORA_SUBMIT, { choice: index });
  }

  // Numeric mode (Task 66). Dragging the slider sets numericValue directly -
  // a range input's own min/max already keep it in bounds. Typing goes
  // through a clamp: an out-of-range value is accepted and snapped into
  // 0..max rather than rejected (criterion 2), which is also what makes a
  // value typed past max visibly clamp as each digit lands.
  function handleNumericSliderChange(event: ChangeEvent<HTMLInputElement>) {
    if (!numericQuestion) {
      return;
    }
    setNumericValue(Math.min(numericQuestion.max, Math.max(0, Number(event.target.value))));
  }

  function handleNumericInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (!numericQuestion) {
      return;
    }
    const raw = event.target.value;
    if (raw === '' || raw === '-') {
      return; // mid-edit (field cleared to retype) - nothing to clamp yet
    }
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      setNumericValue(Math.min(numericQuestion.max, Math.max(0, parsed)));
    }
  }

  // One tap, one send, ref-guarded like handleDrawSubmit.
  function handleNumericSubmit() {
    if (numericSentRef.current || inputsLocked || !numericQuestion) {
      return;
    }
    numericSentRef.current = true;
    setNumericQuestion((current) => (current ? { ...current, submitted: true } : current));
    socket.emit(ClientEvents.NUMERIC_SUBMIT, { value: numericValue });
  }

  // Task 156c - one swipe, one send, no ack (see BLITZ_SWIPE's own doc
  // comment in shared): the phone advances optimistically and the server is
  // the one that validates (phase, pause, next-index-only). `index` guards
  // against a stray double-fire re-sending the statement this phone already
  // advanced past.
  function handleBlitzSwipe(index: number, answeredTrue: boolean) {
    if (inputsLocked || !blitz || index !== blitzIndex || index >= blitz.total) {
      return;
    }
    setBlitzIndex(index + 1);
    socket.emit(ClientEvents.BLITZ_SWIPE, { index, answeredTrue });
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

  // Task 178 - unlike handleSettingChange, this fires live on every drag
  // tick (see VipAudioControls' onChange below), not on a locked-in choice,
  // and works every phase, not just LOBBY.
  function handleAudioVolumeChange(partial: { crowdVolume?: number; voiceVolume?: number }) {
    setAudioVolume((current) => ({ ...current, ...partial }));
    socket.emit(ClientEvents.VIP_SET_AUDIO_VOLUME, partial);
  }

  // Task 57 - separate event from handleSettingChange: mode isn't a
  // RoomSettings field (see VipSetModePayload's own doc comment in shared).
  function handleModeChange(mode: GameModeId) {
    socket.emit(ClientEvents.VIP_SET_MODE, { mode });
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

  // Task 174 - shown only until THIS page load's own auto-resume attempt
  // resolves (handleJoined lands on the real phase view below via `joined`/
  // state:sync; handleRejected flips `resuming` off and falls through to
  // the normal form further down). Never reappears after that first
  // resolution - a LATER mid-game drop gets the connection banner instead,
  // not this full-screen replacement.
  if (resuming && !joined) {
    return (
      <div style={styles.container}>
        <div style={styles.title} data-testid="resuming-notice">
          Επανασύνδεση…
        </div>
      </div>
    );
  }

  // Η Δίκη (Task 129) - the spectator view, shared by TRIAL_QUESTION
  // (`onTrial: false`) and TRIAL_REVEAL (no entry in `results`, or an entry
  // with `eliminated: true`). A static statement and nothing else - no
  // standings, no other player's data (payload rule) - that stays on screen
  // through every remaining round until GAME_OVER. Generalized (Task 190)
  // to take its own title so Η Ανάβασις's non-climbing spectator (never
  // eliminated - just not connected at finale entry) can reuse the same
  // shape with different wording instead of a second near-identical block.
  function renderSpectatorNotice(testId: string, title: string) {
    return (
      <div style={styles.container}>
        {joined && (
          <div style={styles.avatarCorner} data-testid="my-avatar-corner">
            <Avatar avatarId={joined.avatarId} sizeRem={2.2} />
          </div>
        )}
        <div style={styles.title} data-testid={testId}>
          {title}
        </div>
        <div style={styles.lookAtTv}>Κοίτα την τηλεόραση</div>
        <ConnectionBanner visible={!connected && joined !== null} />
        <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
      </div>
    );
  }

  function renderTrialSpectator(testId: string) {
    return renderSpectatorNotice(testId, 'Αποκλείστηκες');
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
        {/* Task 165 - the player's own score as a plaque: the TV plaque's
            shape (name over score), phone units (rem, not the TV's cqh). */}
        <div style={styles.plaque} data-testid="gameover-plaque">
          <div style={styles.plaqueName}>{joined?.name ? greekUpper(joined.name) : ''}</div>
          <div style={styles.plaqueScore} data-testid="gameover-score">
            {me ? me.score : 0} πόντοι
          </div>
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
                  disabled={inputsLocked || steal.yourChoice !== null}
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
        <ConnectionBanner visible={!connected && joined !== null} />
        <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
        {isVip && (
          <VipAudioControls
            crowdVolume={audioVolume.crowdVolume}
            voiceVolume={audioVolume.voiceVolume}
            onChange={handleAudioVolumeChange}
          />
        )}
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
          <div style={reveal.yourCorrect ? styles.revealCorrect : styles.revealWrong} data-testid="reveal-verdict">
            {reveal.yourCorrect ? 'Σωστά!' : 'Λάθος'}
          </div>
        </div>
        <div style={styles.revealCorrectOption}>Σωστή απάντηση: {reveal.correctOption}</div>
        {!reveal.yourCorrect && reveal.yourChoice !== null && question && (
          <div style={styles.revealYourChoice} data-testid="reveal-your-choice">
            Η επιλογή σου: {question.options[reveal.yourChoice]}
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
        {isVip && !inputsLocked && (
          <button data-testid="continue-button" style={styles.skipButton} type="button" onClick={handleNext}>
            Παράλειψη
          </button>
        )}
        <ConnectionBanner visible={!connected && joined !== null} />
        <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
        {isVip && (
          <VipAudioControls
            crowdVolume={audioVolume.crowdVolume}
            voiceVolume={audioVolume.voiceVolume}
            onChange={handleAudioVolumeChange}
          />
        )}
        {isVip && <ResetToLobbyControl onConfirm={handleResetToLobby} />}
      </div>
    );
  }

  // Η Δίκη (Task 129) - TRIAL_REVEAL. Public and symmetric like the quiz's
  // own reveal above: this branches on OUR OWN entry within `results`
  // rather than a role the server assigned this phone. No entry at all
  // (already eliminated in an earlier round, or sat this sudden-death round
  // out) or an entry with `eliminated: true` (crossed to zero THIS reveal)
  // both read as the spectator view - elimination flips the phone straight
  // to it, never showing a detailed "you lost" breakdown first.
  if (trialReveal) {
    const myTrialResult = trialReveal.results.find((result) => result.playerId === playerId) ?? null;
    if (!myTrialResult || myTrialResult.eliminated) {
      return renderTrialSpectator('trial-eliminated-title');
    }
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
          <div
            style={myTrialResult.correct ? styles.revealCorrect : styles.revealWrong}
            data-testid="trial-reveal-verdict"
          >
            {myTrialResult.correct ? 'Σωστά!' : 'Λάθος'}
          </div>
        </div>
        <div style={styles.revealCorrectOption}>Σωστή απάντηση: {trialReveal.correctOption}</div>
        {!myTrialResult.correct && myTrialResult.choice !== null && trialQuestion && (
          <div style={styles.revealYourChoice} data-testid="trial-reveal-your-choice">
            Η επιλογή σου: {trialQuestion.options[myTrialResult.choice]}
          </div>
        )}
        <div style={styles.trialLife} data-testid="trial-reveal-life">
          Ζωή: {Math.max(0, myTrialResult.lifeAfter)}
        </div>
        <ConnectionBanner visible={!connected && joined !== null} />
        <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
        {isVip && (
          <VipAudioControls
            crowdVolume={audioVolume.crowdVolume}
            voiceVolume={audioVolume.voiceVolume}
            onChange={handleAudioVolumeChange}
          />
        )}
        {isVip && <ResetToLobbyControl onConfirm={handleResetToLobby} />}
      </div>
    );
  }

  // Η Ανάβασις (Task 190) - CLIMB_REVEAL. Public and symmetric like
  // TRIAL_REVEAL above, but there is no elimination here (a spectator stays
  // a spectator the whole climb, decided once at CLIMB_QUESTION) so this
  // never branches into renderSpectatorNotice - a non-climber simply never
  // gets a climb_reveal:show at all (the payload only reaches climbers).
  if (climbReveal) {
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
          <div
            style={climbReveal.yourCorrect ? styles.revealCorrect : styles.revealWrong}
            data-testid="climb-reveal-verdict"
          >
            {climbReveal.yourCorrect ? 'Σωστά!' : 'Λάθος'}
          </div>
        </div>
        <div style={styles.revealCorrectOption}>Σωστή απάντηση: {climbReveal.correctOption}</div>
        <div style={styles.climbDelta} data-testid="climb-reveal-delta">
          {climbDeltaGlyph(climbReveal.yourDelta)}
        </div>
        <ClimbStrip step={climbReveal.yourStep} top={climbReveal.top} />
        <ConnectionBanner visible={!connected && joined !== null} />
        <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
        {isVip && (
          <VipAudioControls
            crowdVolume={audioVolume.crowdVolume}
            voiceVolume={audioVolume.voiceVolume}
            onChange={handleAudioVolumeChange}
          />
        )}
        {isVip && <ResetToLobbyControl onConfirm={handleResetToLobby} />}
      </div>
    );
  }

  // Η Μονομαχία (Task 190) - DUEL_REVEAL. Public and symmetric; branches on
  // whether THIS phone was one of the two duelists to decide whether to
  // emphasize its own side.
  if (duelReveal) {
    const myDuelist = duelReveal.duelists.find((duelist) => duelist.playerId === playerId) ?? null;
    const opponent = duelReveal.duelists.find((duelist) => duelist.playerId !== playerId) ?? null;
    const iWon = duelReveal.winnerPlayerId === playerId;
    const iLost = !duelReveal.tie && duelReveal.winnerPlayerId !== null && !iWon && myDuelist !== null;
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
        <div style={styles.title} data-testid="duel-reveal-title">
          Μονομαχία
        </div>
        <div style={styles.duelRevealWeapons} data-testid="duel-reveal-weapons">
          {duelReveal.duelists.map((duelist) => {
            const mine = duelist.playerId === playerId;
            const won = duelist.playerId === duelReveal.winnerPlayerId;
            return (
              <div
                key={duelist.playerId}
                style={won ? styles.duelRevealSlabWon : styles.duelRevealSlab}
                data-testid="duel-reveal-slab"
                data-mine={mine}
              >
                <div style={styles.duelWeaponIconWrap}>
                  <WeaponIcon weapon={duelist.weapon} />
                </div>
                <span style={styles.duelRevealName}>{greekUpper(duelist.name)}</span>
                <span style={styles.duelRevealWeaponName}>{DUEL_WEAPON_LABELS[duelist.weapon]}</span>
              </div>
            );
          })}
        </div>
        {duelReveal.tie ? (
          <div style={styles.duelTieAgain} data-testid="duel-reveal-tie">
            Ίδια όπλα — Ξανά
          </div>
        ) : (
          <div style={styles.duelVerdict} data-testid="duel-reveal-verdict">
            {myDuelist ? (iWon ? 'Κέρδισες!' : iLost ? 'Έχασες' : '') : `Νίκησε ο/η ${duelReveal.winnerName}`}
          </div>
        )}
        {opponent && myDuelist && (
          <div style={styles.lookAtTv}>Αντίπαλος: {greekUpper(opponent.name)}</div>
        )}
        <ConnectionBanner visible={!connected && joined !== null} />
        <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
        {isVip && (
          <VipAudioControls
            crowdVolume={audioVolume.crowdVolume}
            voiceVolume={audioVolume.voiceVolume}
            onChange={handleAudioVolumeChange}
          />
        )}
        {isVip && <ResetToLobbyControl onConfirm={handleResetToLobby} />}
      </div>
    );
  }

  // Drawing mode (Task 56b) - GUESS_REVEAL. Public and symmetric like the
  // quiz's own reveal above: everyone (drawer included) gets the same
  // payload, so this branches on OUR OWN result within it rather than on
  // a role the server assigned this phone for the phase.
  if (guessReveal) {
    const amDrawer = guessReveal.drawerPlayerId === playerId;
    const myResult = guessReveal.results.find((result) => result.playerId === playerId) ?? null;
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
        <div style={styles.revealCorrectOption} data-testid="guess-reveal-word">
          Σωστή απάντηση: {guessReveal.correctWord}
        </div>
        {amDrawer ? (
          <>
            <div style={styles.revealPoints} data-testid="guess-reveal-drawer-points">
              +{guessReveal.drawerPointsAwarded} πόντοι
            </div>
            <div style={styles.revealTotal} data-testid="guess-reveal-total">
              Σύνολο: {guessReveal.drawerTotalScore}
            </div>
          </>
        ) : myResult ? (
          <>
            <div style={myResult.correct ? styles.revealCorrect : styles.revealWrong} data-testid="guess-reveal-verdict">
              {myResult.correct ? 'Σωστά!' : 'Λάθος'}
            </div>
            <div style={styles.revealPoints} data-testid="guess-reveal-points">
              +{myResult.pointsAwarded} πόντοι
            </div>
            <div style={styles.revealTotal} data-testid="guess-reveal-total">
              Σύνολο: {myResult.totalScore}
            </div>
          </>
        ) : null}
        <div style={styles.lookAtTv}>Κοίτα την τηλεόραση</div>
        <ConnectionBanner visible={!connected && joined !== null} />
        <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
        {isVip && (
          <VipAudioControls
            crowdVolume={audioVolume.crowdVolume}
            voiceVolume={audioVolume.voiceVolume}
            onChange={handleAudioVolumeChange}
          />
        )}
        {isVip && <ResetToLobbyControl onConfirm={handleResetToLobby} />}
      </div>
    );
  }

  // Numeric mode (Task 66) - NUMERIC_QUESTION. A slider and a number input
  // drive ONE state (numericValue): dragging sets it directly, typing
  // parses and clamps into it (see handleNumericInputChange/
  // handleNumericSliderChange). The current value renders LARGE and ABOVE
  // the input, since the numeric keyboard covers the lower half of the
  // screen once that field is focused.
  if (numericQuestion) {
    const decimals = numericQuestion.sliderStep < 1 ? 1 : 0;
    const formattedValue = numericValue.toFixed(decimals);
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
        {numericQuestion.submitted ? (
          <div style={styles.powerUpLocked} data-testid="numeric-submitted">
            <div style={styles.powerUpLockedIcon}>🔢</div>
            <div style={styles.powerUpLockedTitle}>Κλειδώθηκε!</div>
            <div style={styles.powerUpLockedDetail}>Περίμενε τους υπόλοιπους...</div>
          </div>
        ) : (
          <>
            <div style={styles.category}>{greekUpper(numericQuestion.category)}</div>
            <div style={styles.title} data-testid="numeric-question-text">
              {numericQuestion.text}
            </div>
            <div style={styles.numericValueDisplay} data-testid="numeric-value">
              {formattedValue}
            </div>
            <input
              type="range"
              min={0}
              max={numericQuestion.max}
              step={numericQuestion.sliderStep}
              value={numericValue}
              onChange={handleNumericSliderChange}
              style={styles.numericSlider}
              data-testid="numeric-slider"
              disabled={inputsLocked}
            />
            <div style={styles.numericRangeLabels}>
              <span>0</span>
              <span>{numericQuestion.max}</span>
            </div>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={numericQuestion.max}
              step={numericQuestion.sliderStep}
              value={formattedValue}
              onChange={handleNumericInputChange}
              style={styles.numericNumberInput}
              data-testid="numeric-number-input"
              disabled={inputsLocked}
            />
            <button
              type="button"
              data-testid="numeric-submit-button"
              style={inputsLocked ? styles.buttonDisabled : styles.button}
              onClick={handleNumericSubmit}
              disabled={inputsLocked}
            >
              Υποβολή
            </button>
          </>
        )}
        <ConnectionBanner visible={!connected && joined !== null} />
        <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
      </div>
    );
  }

  // Numeric mode (Task 66) - NUMERIC_REVEAL. Public and symmetric like
  // guess_reveal:show - every phone gets the same payload the TV does, so
  // this finds its own row by playerId rather than being told a role.
  if (numericReveal) {
    const myResult = numericReveal.results.find((result) => result.playerId === playerId) ?? null;
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
        <div style={styles.revealCorrectOption} data-testid="numeric-reveal-answer">
          Σωστή απάντηση: {numericReveal.answer}
        </div>
        {myResult && (
          <>
            <div style={styles.revealTotal} data-testid="numeric-reveal-your-value">
              {myResult.value !== null ? `Η εκτίμησή σου: ${myResult.value}` : 'Δεν πρόλαβες να απαντήσεις'}
            </div>
            <div
              style={myResult.exact ? styles.revealCorrect : styles.revealTotal}
              data-testid="numeric-reveal-verdict"
            >
              {myResult.exact ? 'Ακριβώς σωστά!' : `Θέση #${myResult.rank}`}
            </div>
            <div style={styles.revealPoints} data-testid="numeric-reveal-points">
              +{myResult.pointsAwarded} πόντοι
            </div>
            <div style={styles.revealTotal} data-testid="numeric-reveal-total">
              Σύνολο: {myResult.totalScore}
            </div>
          </>
        )}
        <div style={styles.lookAtTv}>Κοίτα την τηλεόραση</div>
        <ConnectionBanner visible={!connected && joined !== null} />
        <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
        {isVip && (
          <VipAudioControls
            crowdVolume={audioVolume.crowdVolume}
            voiceVolume={audioVolume.voiceVolume}
            onChange={handleAudioVolumeChange}
          />
        )}
        {isVip && <ResetToLobbyControl onConfirm={handleResetToLobby} />}
      </div>
    );
  }

  // Blitz mode (Task 156c) - BLITZ. Drag right for ΣΩΣΤΟ, left for ΛΑΘΟΣ
  // (BlitzSwipeCard) - no correctness feedback here, the truth isn't on
  // this device until BLITZ_REVEAL.
  if (blitz) {
    const finished = blitzIndex >= blitz.total;
    const currentText = blitz.statements[blitzIndex] ?? null;
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
        <div style={styles.category}>{greekUpper('Η Παλαίστρα')}</div>
        <div style={styles.blitzProgress} data-testid="blitz-progress">
          {Math.min(blitzIndex, blitz.total)}/{blitz.total}
        </div>
        {finished || !currentText ? (
          <div style={styles.lookAtTv} data-testid="blitz-finished">
            Περίμενε τους υπόλοιπους...
          </div>
        ) : (
          <BlitzSwipeCard
            key={blitzIndex}
            text={currentText}
            disabled={inputsLocked}
            onCommit={(answeredTrue) => handleBlitzSwipe(blitzIndex, answeredTrue)}
          />
        )}
        <ConnectionBanner visible={!connected && joined !== null} />
        <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
      </div>
    );
  }

  // Blitz mode (Task 156a) - BLITZ_REVEAL. This phone's own three counts and
  // nothing else - points and standings are on the TV's column.
  if (blitzReveal) {
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
        <div style={styles.category}>{greekUpper('Η Παλαίστρα')}</div>
        <div style={styles.revealCorrect} data-testid="blitz-reveal-correct">
          Σωστά: {blitzReveal.correct}
        </div>
        <div style={styles.revealTotal} data-testid="blitz-reveal-wrong">
          Λάθος: {blitzReveal.wrong}
        </div>
        <div style={styles.revealTotal} data-testid="blitz-reveal-unanswered">
          Αναπάντητα: {blitzReveal.unanswered}
        </div>
        <div style={styles.lookAtTv}>Κοίτα την τηλεόραση</div>
        <ConnectionBanner visible={!connected && joined !== null} />
        <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
        {isVip && (
          <VipAudioControls
            crowdVolume={audioVolume.crowdVolume}
            voiceVolume={audioVolume.voiceVolume}
            onChange={handleAudioVolumeChange}
          />
        )}
        {isVip && <ResetToLobbyControl onConfirm={handleResetToLobby} />}
      </div>
    );
  }

  // Drawing mode (Task 56b) - DRAW. The existing /dev/draw canvas, plus the
  // assigned word and a submit button; a waiting screen once submitted.
  if (draw) {
    return (
      <div style={styles.drawContainer}>
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
        {draw.submitted ? (
          <div style={styles.powerUpLocked} data-testid="draw-submitted">
            <div style={styles.powerUpLockedIcon}>🎨</div>
            <div style={styles.powerUpLockedTitle}>Υποβλήθηκε!</div>
            <div style={styles.powerUpLockedDetail}>Περίμενε τους υπόλοιπους...</div>
          </div>
        ) : (
          <>
            <div style={styles.drawHeaderRow}>
              <div style={styles.title} data-testid="draw-word">
                Ζωγράφισε: {draw.wordToDraw}
              </div>
              <div
                style={drawWarningActive ? styles.drawTimeWarning : styles.drawTime}
                data-testid="draw-time-remaining"
              >
                {Math.ceil(Math.max(0, draw.durationMs - drawElapsedMs) / 1000)}΄΄
              </div>
            </div>
            <DrawingCanvas ref={drawCanvasRef} onStrokeCountChange={setDrawStrokeCount} />
            <button
              type="button"
              data-testid="draw-submit-button"
              style={drawStrokeCount === 0 || inputsLocked ? styles.buttonDisabled : styles.button}
              onClick={handleDrawSubmit}
              disabled={drawStrokeCount === 0 || inputsLocked}
            >
              Υποβολή
            </button>
          </>
        )}
        <ConnectionBanner visible={!connected && joined !== null} />
        <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
      </div>
    );
  }

  // Drawing mode (Task 56b) - GUESS. The drawer gets a "this one is yours"
  // screen with NO options at all (criterion 3) - `guess.isDrawer` is what
  // the server itself decided (see buildGuessPlayerPayload), not a client
  // guess about its own role.
  if (guess) {
    if (guess.isDrawer) {
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
          <div style={styles.title} data-testid="guess-drawer-title">
            Το σχέδιό σου!
          </div>
          <div style={styles.subtitle}>Οι υπόλοιποι μαντεύουν τι ζωγράφισες</div>
          <div style={styles.lookAtTv}>Κοίτα την τηλεόραση</div>
          <ConnectionBanner visible={!connected && joined !== null} />
          <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
        </div>
      );
    }

    const answered = guessChoice !== null;
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
          <div style={styles.category}>{greekUpper(`Τι ζωγράφισε ο/η ${guess.drawerName};`)}</div>
          {answered ? (
            <div style={styles.lookAtTv} data-testid="waiting-message">
              Περίμενε τους υπόλοιπους...
            </div>
          ) : (
            <div style={styles.lookAtTv}>Κοίτα την τηλεόραση</div>
          )}
        </div>
        <div style={styles.answerGrid}>
          {guess.options.map((option, index) => {
            const isMine = index === guessChoice;
            const dimmed = answered && !isMine;
            const disabled = answered || inputsLocked;
            return (
              <button
                key={index}
                type="button"
                data-testid="guess-option-button"
                data-selected={isMine}
                className={isMine ? 'glow' : undefined}
                style={
                  dimmed
                    ? styles.answerButtonDim
                    : ({
                        ...styles.answerButton,
                        ...(isMine ? styles.answerButtonSelected : undefined),
                        boxShadow: isMine ? undefined : SURFACE_GLOW,
                        ...(isMine ? { '--glow-color': 'color-mix(in srgb, var(--wine-2) 50%, transparent)' } : {}),
                      } as CSSVars)
                }
                onClick={() => handleGuessTap(index)}
                disabled={disabled}
              >
                <span style={dimmed ? styles.answerTextDim : styles.answerText}>{option}</span>
              </button>
            );
          })}
        </div>
        <div style={styles.questionFooter}>
          <ConnectionBanner visible={!connected && joined !== null} />
          <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
        </div>
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
                  disabled={inputsLocked}
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
                  disabled={inputsLocked}
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
        <ConnectionBanner visible={!connected && joined !== null} />
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
          <div style={styles.category}>{greekUpper(question.category)}</div>
          {answered ? (
            <div style={styles.lookAtTv} data-testid="waiting-message">
              Περίμενε τους υπόλοιπους...
            </div>
          ) : (
            <div style={styles.lookAtTv}>Κοίτα την τηλεόραση για την ερώτηση</div>
          )}
          {answerError && (
            <div style={styles.error} data-testid="answer-error">
              {answerError}
            </div>
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
            const isMine = index === myChoice;
            const dimmed = answered && !isMine;
            const disabled = answered || inputsLocked || icedMs > 0;
            return (
              <button
                key={index}
                type="button"
                data-testid="answer-button"
                data-selected={isMine}
                className={isMine ? 'glow' : undefined}
                style={
                  dimmed
                    ? styles.answerButtonDim
                    : ({
                        ...styles.answerButton,
                        ...(isMine ? styles.answerButtonSelected : undefined),
                        boxShadow: isMine ? undefined : SURFACE_GLOW,
                        ...(isMine ? { '--glow-color': 'color-mix(in srgb, var(--wine-2) 50%, transparent)' } : {}),
                      } as CSSVars)
                }
                onClick={() => handleAnswerTap(index)}
                disabled={disabled}
              >
                <span style={{ ...(dimmed ? styles.answerTextDim : styles.answerText), ...inkStyle }}>{option}</span>
              </button>
            );
          })}
        </div>
        <div style={styles.questionFooter}>
          <ConnectionBanner visible={!connected && joined !== null} />
        <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
          {isVip && (
          <VipAudioControls
            crowdVolume={audioVolume.crowdVolume}
            voiceVolume={audioVolume.voiceVolume}
            onChange={handleAudioVolumeChange}
          />
        )}
        {isVip && <ResetToLobbyControl onConfirm={handleResetToLobby} />}
        </div>
      </div>
    );
  }

  // Η Δίκη (Task 129) - TRIAL_QUESTION. Reuses the quiz QUESTION view's
  // category + 2x2 grid + lock-in pattern exactly (no question text, no
  // timer - the TV carries both). Adds ONE static life line, read straight
  // off `yourLife` at question-show time - it never updates again until the
  // next question:show, so there is no drain animation on the phone; that
  // drama lives entirely on the TV. `onTrial: false` (eliminated, or
  // sitting a sudden-death round out as a non-duelist) is the spectator
  // branch - answered normally otherwise.
  if (trialQuestion) {
    if (!trialQuestion.onTrial) {
      return renderTrialSpectator('trial-spectator-title');
    }
    const myChoice = trialPendingChoice;
    const answered = myChoice !== null || trialQuestion.lockedIn;
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
          <div style={styles.category}>{greekUpper(trialQuestion.category)}</div>
          <div style={styles.trialLife} data-testid="trial-your-life">
            Ζωή: {trialQuestion.yourLife}
          </div>
          {answered ? (
            <div style={styles.lookAtTv} data-testid="waiting-message">
              Περίμενε τους υπόλοιπους...
            </div>
          ) : (
            <div style={styles.lookAtTv}>Κοίτα την τηλεόραση για την ερώτηση</div>
          )}
        </div>
        <div style={styles.answerGrid}>
          {trialQuestion.options.map((option, index) => {
            const isMine = index === myChoice;
            const dimmed = answered && !isMine;
            const disabled = answered || inputsLocked;
            return (
              <button
                key={index}
                type="button"
                data-testid="trial-answer-button"
                data-selected={isMine}
                className={isMine ? 'glow' : undefined}
                style={
                  dimmed
                    ? styles.answerButtonDim
                    : ({
                        ...styles.answerButton,
                        ...(isMine ? styles.answerButtonSelected : undefined),
                        boxShadow: isMine ? undefined : SURFACE_GLOW,
                        ...(isMine ? { '--glow-color': 'color-mix(in srgb, var(--wine-2) 50%, transparent)' } : {}),
                      } as CSSVars)
                }
                onClick={() => handleTrialAnswerTap(index)}
                disabled={disabled}
              >
                <span style={dimmed ? styles.answerTextDim : styles.answerText}>{option}</span>
              </button>
            );
          })}
        </div>
        <div style={styles.questionFooter}>
          <ConnectionBanner visible={!connected && joined !== null} />
        <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
          {isVip && (
          <VipAudioControls
            crowdVolume={audioVolume.crowdVolume}
            voiceVolume={audioVolume.voiceVolume}
            onChange={handleAudioVolumeChange}
          />
        )}
        {isVip && <ResetToLobbyControl onConfirm={handleResetToLobby} />}
        </div>
      </div>
    );
  }

  // Η Ανάβασις (Task 190) - CLIMB_QUESTION. Climb questions ARE quiz
  // questions (scope note in tasks/190-climb-phone.md): the same
  // 'answer-button' testid and answerGrid/answerButton styling as the plain
  // QUESTION view above, unchanged - only the compact step strip above it
  // (ClimbStrip) and the CLIMB_SUBMIT event underneath are new. `climbing:
  // false` (not connected at finale entry) is the entry spectator branch;
  // `eliminated` (Task 205, the spear) is a DIFFERENT reason to spectate -
  // same shared notice, reused trial wording ('Αποκλείστηκες'), since it's
  // the exact same fact about the player either way.
  if (climbQuestion) {
    if (climbQuestion.eliminated) {
      return renderTrialSpectator('climb-eliminated-title');
    }
    if (!climbQuestion.climbing) {
      return renderSpectatorNotice('climb-spectator-title', 'Παρακολουθείς');
    }
    const myChoice = climbPendingChoice;
    const answered = myChoice !== null || climbQuestion.lockedIn;
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
          <div style={styles.category}>{greekUpper(climbQuestion.category)}</div>
          <ClimbStrip step={climbQuestion.yourStep} top={climbQuestion.top} />
          {answered ? (
            <div style={styles.lookAtTv} data-testid="waiting-message">
              Περίμενε τους υπόλοιπους...
            </div>
          ) : (
            <div style={styles.lookAtTv}>Κοίτα την τηλεόραση για την ερώτηση</div>
          )}
        </div>
        <div style={styles.answerGrid}>
          {climbQuestion.options.map((option, index) => {
            const isMine = index === myChoice;
            const dimmed = answered && !isMine;
            const disabled = answered || inputsLocked;
            return (
              <button
                key={index}
                type="button"
                data-testid="answer-button"
                data-selected={isMine}
                className={isMine ? 'glow' : undefined}
                style={
                  dimmed
                    ? styles.answerButtonDim
                    : ({
                        ...styles.answerButton,
                        ...(isMine ? styles.answerButtonSelected : undefined),
                        boxShadow: isMine ? undefined : SURFACE_GLOW,
                        ...(isMine ? { '--glow-color': 'color-mix(in srgb, var(--wine-2) 50%, transparent)' } : {}),
                      } as CSSVars)
                }
                onClick={() => handleClimbAnswerTap(index)}
                disabled={disabled}
              >
                <span style={dimmed ? styles.answerTextDim : styles.answerText}>{option}</span>
              </button>
            );
          })}
        </div>
        <div style={styles.questionFooter}>
          <ConnectionBanner visible={!connected && joined !== null} />
          <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
          {isVip && (
            <VipAudioControls
              crowdVolume={audioVolume.crowdVolume}
              voiceVolume={audioVolume.voiceVolume}
              onChange={handleAudioVolumeChange}
            />
          )}
          {isVip && <ResetToLobbyControl onConfirm={handleResetToLobby} />}
        </div>
      </div>
    );
  }

  // Η Μονομαχία (Task 190) - DUEL_PICK. A duelist (youDuel) gets three
  // weapon slabs; a spectator gets the caption and NOTHING else - no weapon
  // UI in the DOM at all (scope note: "no weapon UI exists in the
  // spectator DOM"), so this branches before rendering any slab, not after
  // via a disabled/hidden one.
  if (duelPick) {
    if (!duelPick.youDuel) {
      return (
        <div style={styles.container}>
          {joined && (
            <div style={styles.avatarCorner} data-testid="my-avatar-corner">
              <Avatar avatarId={joined.avatarId} sizeRem={2.2} />
            </div>
          )}
          <div style={styles.title} data-testid="duel-pick-caption">
            Μονομαχία
          </div>
          <div style={styles.lookAtTv}>Κοίτα την τηλεόραση</div>
          <ConnectionBanner visible={!connected && joined !== null} />
          <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
        </div>
      );
    }
    const myWeapon = duelPendingWeapon;
    const locked = myWeapon !== null || duelPick.picked;
    return (
      <div style={styles.container}>
        {joined && (
          <div style={styles.avatarCorner} data-testid="my-avatar-corner">
            <Avatar avatarId={joined.avatarId} sizeRem={2.2} />
          </div>
        )}
        <div style={styles.title} data-testid="duel-pick-caption">
          Μονομαχία{duelPick.opponentName ? ` — εναντίον ${duelPick.opponentName}` : ''}
        </div>
        <div style={styles.powerUpEffectGrid}>
          {DUEL_WEAPONS.map((weapon) => {
            const isMine = weapon === myWeapon;
            const dimmed = locked && !isMine;
            return (
              <button
                key={weapon}
                type="button"
                data-testid="duel-weapon-option"
                data-weapon={weapon}
                data-selected={isMine}
                style={
                  dimmed
                    ? { ...styles.powerUpEffectButton, opacity: 0.42 }
                    : ({
                        ...styles.powerUpEffectButton,
                        ...(isMine ? styles.duelWeaponSelected : undefined),
                      } as CSSVars)
                }
                onClick={() => handleDuelWeaponPick(weapon)}
                disabled={locked || inputsLocked}
              >
                <div style={styles.duelWeaponIconWrap}>
                  <WeaponIcon weapon={weapon} />
                </div>
                <span style={styles.powerUpEffectTitle}>{DUEL_WEAPON_LABELS[weapon]}</span>
              </button>
            );
          })}
        </div>
        {locked && (
          <div style={styles.lookAtTv} data-testid="waiting-message">
            Περίμενε τον αντίπαλο...
          </div>
        )}
        <ConnectionBanner visible={!connected && joined !== null} />
        <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
      </div>
    );
  }

  // Η Μνήμη της Αγοράς (Task 209) - AGORA_REVEAL. Public/symmetric like
  // trial/climb's reveal above, and for the same reason does NOT clear
  // `agoraQuestion` on arrival: the "your choice was X" line below reads
  // its text out of `agoraQuestion.options`. No proof/scene rendered here
  // at all (asymmetric by design - the payload carries none) and no VIP
  // skip button, matching trial/climb/duel's reveal cards rather than
  // plain quiz's.
  if (agoraReveal) {
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
          <div
            style={agoraReveal.yourCorrect ? styles.revealCorrect : styles.revealWrong}
            data-testid="agora-reveal-verdict"
          >
            {agoraReveal.yourCorrect ? 'Σωστά!' : 'Λάθος'}
          </div>
        </div>
        <div style={styles.revealCorrectOption}>Σωστή απάντηση: {agoraReveal.correctOption}</div>
        {!agoraReveal.yourCorrect && agoraReveal.yourChoice !== null && agoraQuestion && (
          <div style={styles.revealYourChoice} data-testid="agora-reveal-your-choice">
            Η επιλογή σου: {agoraQuestion.options[agoraReveal.yourChoice]}
          </div>
        )}
        <div style={styles.revealPoints} data-testid="agora-reveal-points">
          +{agoraReveal.pointsAwarded} πόντοι
        </div>
        <div style={styles.revealTotal} data-testid="agora-reveal-total">
          Σύνολο: {agoraReveal.totalScore}
        </div>
        <div style={styles.revealRank} data-testid="agora-reveal-rank">
          Θέση #{agoraReveal.rank}
        </div>
        {agoraReveal.yourCorrect && agoraReveal.yourAnswerRank !== null && (
          <div style={styles.revealSpeedRank} data-testid="agora-reveal-answer-rank">
            Ταχύτητα: #{agoraReveal.yourAnswerRank}
            {agoraReveal.yourTimeMs !== null && ` — ${(agoraReveal.yourTimeMs / 1000).toFixed(1)}΄΄`}
          </div>
        )}
        <ConnectionBanner visible={!connected && joined !== null} />
        <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
        {isVip && (
          <VipAudioControls
            crowdVolume={audioVolume.crowdVolume}
            voiceVolume={audioVolume.voiceVolume}
            onChange={handleAudioVolumeChange}
          />
        )}
        {isVip && <ResetToLobbyControl onConfirm={handleResetToLobby} />}
      </div>
    );
  }

  // Η Μνήμη της Αγοράς (Task 209) - AGORA_QUESTION. No category/question
  // text travels to a player at all (AgoraQuestionShowPlayerPayload) - only
  // a question-progress readout fills the header slot that plain QUESTION/
  // CLIMB_QUESTION give to `category`. Same answer grid/testid/tap-lock
  // discipline as every other quiz-shaped question view. A `kind ===
  // 'colour'` question's options are plain Greek colour names
  // (buildColourQuestion, shared/src/agora.ts) - agoraSwatchHex matches
  // each option's own text back against the shared AGORA_COLOURS table
  // (never a literal hex of its own) to render a swatch chip; every other
  // kind renders zero swatch nodes.
  if (agoraQuestion) {
    const myChoice = agoraPendingChoice;
    const answered = myChoice !== null || agoraQuestion.answered;
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
          <div style={styles.category} data-testid="agora-question-progress">
            Ερώτηση {agoraQuestion.questionIndex + 1}/{agoraQuestion.totalQuestions}
          </div>
          {answered ? (
            <div style={styles.lookAtTv} data-testid="waiting-message">
              Περίμενε τους υπόλοιπους...
            </div>
          ) : (
            <div style={styles.lookAtTv}>Κοίτα την τηλεόραση για την ερώτηση</div>
          )}
        </div>
        <div style={styles.answerGrid}>
          {agoraQuestion.options.map((option, index) => {
            const isMine = index === myChoice;
            const dimmed = answered && !isMine;
            const disabled = answered || inputsLocked;
            const swatchHex = agoraQuestion.kind === 'colour' ? agoraSwatchHex(option) : undefined;
            return (
              <button
                key={index}
                type="button"
                data-testid="answer-button"
                data-selected={isMine}
                className={isMine ? 'glow' : undefined}
                style={
                  dimmed
                    ? styles.answerButtonDim
                    : ({
                        ...styles.answerButton,
                        ...(isMine ? styles.answerButtonSelected : undefined),
                        boxShadow: isMine ? undefined : SURFACE_GLOW,
                        ...(isMine ? { '--glow-color': 'color-mix(in srgb, var(--wine-2) 50%, transparent)' } : {}),
                      } as CSSVars)
                }
                onClick={() => handleAgoraAnswerTap(index)}
                disabled={disabled}
              >
                {swatchHex && <span style={{ ...styles.agoraSwatch, background: swatchHex }} data-testid="agora-swatch" />}
                <span style={dimmed ? styles.answerTextDim : styles.answerText}>{option}</span>
              </button>
            );
          })}
        </div>
        <div style={styles.questionFooter}>
          <ConnectionBanner visible={!connected && joined !== null} />
          <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
          {isVip && (
            <VipAudioControls
              crowdVolume={audioVolume.crowdVolume}
              voiceVolume={audioVolume.voiceVolume}
              onChange={handleAudioVolumeChange}
            />
          )}
          {isVip && <ResetToLobbyControl onConfirm={handleResetToLobby} />}
        </div>
      </div>
    );
  }

  // Η Μνήμη της Αγοράς (Task 209) - AGORA_EXPOSE. The payload carries the
  // full scene (buildAgoraExposeShow, symmetric to TV and phone alike - see
  // shared/src/index.ts's own design note) precisely because everyone is
  // meant to be looking at the TV anyway; this phone deliberately never
  // reads any of it - a plain hold screen, matching every other "look at
  // the TV" wait screen in this file. None of those render a per-phase
  // countdown of their own even though several of their payloads carry
  // timing fields (this one's `durationMs` included - the phone never
  // renders a countdown, only the TV does), so this doesn't either.
  if (joined && phase === 'AGORA_EXPOSE') {
    return (
      <div style={styles.container}>
        <div style={styles.avatarCorner} data-testid="my-avatar-corner">
          <Avatar avatarId={joined.avatarId} sizeRem={2.2} />
        </div>
        <div style={styles.lookAtTv} data-testid="agora-expose-hold">
          Κοίτα την τηλεόραση
        </div>
        <ConnectionBanner visible={!connected && joined !== null} />
        <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
      </div>
    );
  }

  if (joined) {
    const connectedCount = lobby?.players.filter((player) => player.connected).length ?? 1;
    // Task 57 - the registry-driven list (never a hardcoded array here): a
    // new mode module appears in this picker automatically, with nothing in
    // this file to edit.
    const mode: GameModeId = lobby?.mode ?? DEFAULT_GAME_MODE;
    const availableModes = lobby?.availableModes ?? [];
    const modeIds = availableModes.map((option) => option.id);
    const selectedModeOption = availableModes.find((option) => option.id === mode);
    // canStart is already mode-aware server-side (buildLobbyUpdate compares
    // against modeForRoom(room).minPlayers, not a flat floor) - this just
    // spells out WHY for whoever's looking at a disabled button.
    const canStart = lobby?.canStart ?? false;
    const startBlockedReason =
      !canStart && selectedModeOption ? `χρειάζονται ${selectedModeOption.minPlayers}+ παίκτες για ${selectedModeOption.label}` : '';
    return (
      <div style={styles.container}>
        <ConnectionBanner visible={!connected} />
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
        <div style={styles.lobbyCount}>
          {connectedCount} {connectedCount === 1 ? 'παίκτης' : 'παίκτες'} στο δωμάτιο
        </div>

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
          {/* Task 57 - the mode picker. `options` comes from the registry-
              driven `availableModes`, never a hardcoded array - adding a
              mode module makes it appear here automatically. */}
          <SegmentedRow
            label="Παιχνίδι"
            options={modeIds}
            current={mode}
            format={(id: GameModeId) => availableModes.find((option) => option.id === id)?.label ?? id}
            onSelect={(id) => handleModeChange(id)}
            readOnly={!isVip}
            testIdPrefix="setting-mode"
          />
          {/* Quiz-only settings - hidden for any other mode (not just a
              draw-specific check), so a future third mode never inherits a
              stale quiz panel by accident. */}
          {mode === 'quiz' && (
            <>
              <SegmentedRow
                label="Διάρκεια"
                options={GAME_LENGTH_OPTIONS}
                current={roomSettings.gameLength}
                format={(length: GameLength) => GAME_LENGTH_LABELS[length]}
                onSelect={(length) => handleSettingChange({ gameLength: length })}
                readOnly={!isVip}
                testIdPrefix="setting-length"
              />
              {/* Not a control of its own (Task 31a/33): the stage table
                  decides how many questions a game is and how they're
                  split, once the Διάρκεια row above picks how many of those
                  stages are in play. */}
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
              {/* Task 177 - POWER_UP is off by default; this is the one VIP
                  knob that turns the sophist-trick round back on. */}
              <SegmentedRow
                label="Σοφιστικά τεχνάσματα"
                options={POWER_UPS_ENABLED_OPTIONS}
                current={roomSettings.powerUpsEnabled}
                format={(enabled: boolean) => (enabled ? 'Ενεργά' : 'Ανενεργά')}
                onSelect={(enabled) => handleSettingChange({ powerUpsEnabled: enabled })}
                readOnly={!isVip}
                testIdPrefix="setting-powerups"
              />
              {/* Task 191 - which finale ends the game. Η Δίκη (default) or
                  Η Ανάβασις (188a's climb, previously reachable only by a
                  redeploy flipping the default). */}
              <SegmentedRow
                label="Φινάλε"
                options={FINALE_MODE_OPTIONS}
                current={roomSettings.finaleMode}
                format={(mode: FinaleMode) => FINALE_MODE_LABELS[mode]}
                onSelect={(mode) => handleSettingChange({ finaleMode: mode })}
                readOnly={!isVip}
                testIdPrefix="setting-finale"
              />
              <div style={styles.estimatedLength} data-testid="estimated-length">
                ~{estimatedMinutes} λεπτά
              </div>
            </>
          )}
          {/* Drawing mode (Task 57) - its own game-shape setting, parallel
              to Διάρκεια above: how many full draw-then-guess rounds. */}
          {mode === 'draw' && (
            <SegmentedRow
              label="Γύροι"
              options={DRAW_ROUNDS_OPTIONS}
              current={roomSettings.drawRounds}
              format={(n) => String(n)}
              onSelect={(n) => handleSettingChange({ drawRounds: n })}
              readOnly={!isVip}
              testIdPrefix="setting-draw-rounds"
            />
          )}
        </div>

        {phase === 'LOBBY' ? (
          isVip ? (
            <button
              data-testid="start-button"
              style={canStart ? styles.button : styles.buttonDisabled}
              type="button"
              onClick={handleStartGame}
              disabled={!canStart}
            >
              Έναρξη{startBlockedReason && ` (${startBlockedReason})`}
            </button>
          ) : (
            <div style={styles.subtitle} data-testid="waiting-for-vip">
              Ο/Η {vipName ?? '...'} θα ξεκινήσει το παιχνίδι
            </div>
          )
        ) : (
          // Task 175 - the game already left LOBBY server-side (the game
          // intro/stage announce beat this phone has no view of yet - see
          // PlayerJoinedPayload's phase field), so «Έναρξη» must not still
          // be tappable here: a second vip:start_game is rejected server-
          // side regardless, but the button reappearing at all invited the
          // accidental second tap this task exists to remove.
          <div style={styles.lookAtTv} data-testid="game-started-notice">
            Το παιχνίδι ξεκίνησε — κοίτα την τηλεόραση
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.title}>PLAYER</div>
      <div style={styles.status}>{connected ? 'connected' : 'disconnected'}</div>
      {!connected && (
        <div style={styles.connectingIndicator} data-testid="connecting-indicator">
          Σύνδεση με τον διακομιστή...
        </div>
      )}

      {/* Task 173 - a deep link hides the code field outright (assumed
          valid until room:peek says otherwise); it reappears, with a
          notice, only once the peek comes back not-found. No deep link at
          all renders exactly as before. */}
      {!(deepLinkCode && deepLinkRoomFound !== false) && (
        <input
          style={withDisabled(styles.input, !connected)}
          disabled={!connected}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          placeholder="Κωδικός"
          value={code}
          onChange={handleCodeChange}
          data-testid="code-input"
        />
      )}
      {deepLinkCode && deepLinkRoomFound === false && (
        <div style={styles.error} data-testid="deep-link-invalid-notice">
          Ο κωδικός από τον σύνδεσμο δεν βρέθηκε - πληκτρολόγησέ τον
        </div>
      )}

      {joinStep === 'name' &&
        (!customNameMode ? (
          <>
            <input
              style={withDisabled(styles.input, !connected)}
              disabled={!connected}
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
                  style={withDisabled(styles.nameOption, !connected)}
                  disabled={!connected}
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
              style={withDisabled(styles.customNameButton, !connected)}
              disabled={!connected}
              data-testid="custom-name-toggle"
              onClick={() => setCustomNameMode(true)}
            >
              Άλλο όνομα
            </button>
          </>
        ) : (
          <>
            <input
              style={withDisabled(styles.input, !connected)}
              disabled={!connected}
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
              style={connected && customDraft.trim().length > 0 ? styles.button : styles.buttonDisabled}
              type="button"
              onClick={handleConfirmCustomName}
              disabled={!connected || customDraft.trim().length === 0}
              data-testid="custom-name-confirm"
            >
              Επόμενο
            </button>
            <button
              type="button"
              style={withDisabled(styles.skipButton, !connected)}
              disabled={!connected}
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
              <Avatar avatarId={selectedAvatarId} sizeRem={4.5} ringColor="var(--wine-2)" />
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
              const avatarDisabled = taken || !connected;
              return (
                <button
                  key={avatar.id}
                  type="button"
                  data-testid="avatar-option"
                  data-taken={taken}
                  data-selected={selected}
                  disabled={avatarDisabled}
                  style={avatarDisabled ? styles.avatarOptionTaken : selected ? styles.avatarOptionSelected : styles.avatarOption}
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
            style={withDisabled(styles.skipButton, !connected)}
            disabled={!connected}
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
    background: 'var(--night-0)',
    color: 'var(--marble)',
    minHeight: '100dvh',
    boxSizing: 'border-box',
  },
  title: { fontSize: '1.5rem', fontWeight: 700, textAlign: 'center', color: 'var(--marble)' },
  // Task 169 - a FIXED-height (not minHeight) column so the flex children
  // below can actually divide up a bounded space: DrawingCanvas's own
  // wrapper is the one child that opts into shrinking (flex + minHeight:0),
  // so it's the only thing that gives up height when the viewport is short
  // - everything else here (header, submit, pause) keeps its natural
  // content-driven minimum for free (a flex item's default min-height:auto
  // already refuses to shrink below its own content unless it opts out via
  // overflow, which none of these do). overflow:hidden is the backstop in
  // case some other content still doesn't fit; it should never be visibly
  // clipping anything once DrawingCanvas's own square shrinks to fit.
  drawContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '0.6rem',
    padding: '0.75rem 1rem',
    maxWidth: '480px',
    margin: '0 auto',
    background: 'var(--night-0)',
    color: 'var(--marble)',
    height: '100dvh',
    overflow: 'hidden',
    boxSizing: 'border-box',
  },
  // Task 165 - shares ONE row with draw-word (title's own line-height
  // already covers it) rather than a separate block, so a new element here
  // must add zero extra height - see drawContainer above and
  // DrawingCanvas.tsx for how the canvas itself absorbs the rest (Task 169).
  drawHeaderRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  // The drawer's own countdown, text on the ground (--marble) until
  // DRAW_WARNING_MS, then a plain state-driven swap (no transition) to
  // --ember one size up. Never an animation - phone motion is finger-driven
  // only.
  drawTime: { fontSize: '1.1rem', fontWeight: 700, color: 'var(--marble)', flexShrink: 0 },
  drawTimeWarning: { fontSize: '1.35rem', fontWeight: 700, color: 'var(--ember)', flexShrink: 0 },
  status: { textAlign: 'center', color: 'var(--marble-3)' },
  connectingIndicator: {
    textAlign: 'center',
    fontSize: '0.95rem',
    fontWeight: 600,
    color: 'var(--ember)',
  },
  subtitle: { fontSize: '1.1rem', color: 'var(--marble-3)', textAlign: 'center' },
  lobbyCount: { fontSize: '1rem', color: 'var(--marble-3)', textAlign: 'center' },
  settingsPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
    padding: '0.9rem',
    borderRadius: '0.75rem',
    background: 'var(--marble)',
    border: '1px solid var(--marble-3)',
    boxShadow: SURFACE_GLOW,
  },
  settingsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  settingsRowLabel: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--carve)',
  },
  settingsRowValue: {
    fontSize: '0.9rem',
    fontWeight: 700,
    color: 'var(--wine-2)',
  },
  // Task 178 - VIP crowd/voice sliders, same panel chrome as settingsPanel.
  vipAudioControls: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
    width: '100%',
    padding: '0.9rem',
    borderRadius: '0.75rem',
    background: 'var(--marble)',
    border: '1px solid var(--marble-3)',
    boxShadow: SURFACE_GLOW,
    boxSizing: 'border-box',
  },
  // Task 192 - the single toggle that reveals/hides the two rows below.
  vipAudioToggle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '0.35rem 0',
    border: 'none',
    background: 'transparent',
    color: 'var(--carve)',
    fontSize: '0.9rem',
    fontWeight: 600,
  },
  vipAudioRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
  },
  vipAudioLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--carve)',
  },
  vipAudioSlider: {
    width: '100%',
    accentColor: 'var(--wine-2)',
    height: '2.75rem',
  },
  segmentedGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: '0.35rem',
  },
  segmentActive: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.85rem',
    fontWeight: 700,
    minHeight: '44px',
    padding: '0.4rem 0.7rem',
    borderRadius: '0.5rem',
    border: '2px solid var(--wine-2)',
    background: 'var(--wine-2)',
    color: 'var(--marble)',
    boxSizing: 'border-box',
  },
  segmentInactive: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.85rem',
    fontWeight: 700,
    minHeight: '44px',
    padding: '0.4rem 0.7rem',
    borderRadius: '0.5rem',
    border: '2px solid var(--marble-3)',
    background: 'var(--marble)',
    color: 'var(--carve)',
    boxSizing: 'border-box',
  },
  estimatedLength: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--carve)',
    textAlign: 'center',
  },
  input: {
    width: '100%',
    fontSize: '1.5rem',
    padding: '0.9rem 1rem',
    boxSizing: 'border-box',
    borderRadius: '0.5rem',
    border: '1px solid var(--marble-3)',
    background: 'var(--marble)',
    color: 'var(--carve)',
  },
  // Numeric mode (Task 66) - the value renders LARGE and ABOVE the slider/
  // input on purpose: once the number input is focused, the on-screen
  // keyboard covers roughly the lower half of the phone, and this is the
  // one thing that still has to be visible above it.
  numericValueDisplay: {
    fontSize: '4rem',
    fontWeight: 800,
    fontFamily: 'monospace',
    textAlign: 'center',
    color: 'var(--ember)',
  },
  numericSlider: {
    width: '100%',
    accentColor: 'var(--wine-2)',
    height: '2.75rem',
  },
  numericRangeLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: '-0.5rem',
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--marble-3)',
    fontFamily: 'monospace',
  },
  numericNumberInput: {
    width: '100%',
    fontSize: '1.5rem',
    fontWeight: 700,
    padding: '0.9rem 1rem',
    boxSizing: 'border-box',
    borderRadius: '0.5rem',
    border: '1px solid var(--marble-3)',
    background: 'var(--marble)',
    color: 'var(--carve)',
    textAlign: 'center',
  },
  button: {
    width: '100%',
    fontSize: '1.25rem',
    padding: '1rem',
    borderRadius: '0.5rem',
    border: 'none',
    background: 'var(--wine-2)',
    color: 'var(--marble)',
    fontWeight: 600,
  },
  buttonDisabled: {
    width: '100%',
    fontSize: '1.25rem',
    padding: '1rem',
    borderRadius: '0.5rem',
    border: 'none',
    background: 'var(--marble-3)',
    color: 'var(--night-0)',
    fontWeight: 600,
    cursor: 'not-allowed',
  },
  vipBadge: {
    alignSelf: 'center',
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--marble)',
    background: 'var(--wine-2)',
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
    background: 'var(--marble)',
    border: '1px solid var(--marble-3)',
  },
  nameOption: {
    fontSize: '1.1rem',
    fontWeight: 600,
    padding: '0.65rem 0.9rem',
    borderRadius: '0.5rem',
    border: '1px solid var(--marble-3)',
    background: 'var(--marble)',
    color: 'var(--carve)',
    textAlign: 'left',
  },
  nameListEmpty: {
    padding: '0.75rem',
    textAlign: 'center',
    color: 'var(--carve)',
    fontWeight: 600,
  },
  customNameButton: {
    width: '100%',
    fontSize: '1rem',
    padding: '0.7rem',
    borderRadius: '0.5rem',
    border: '1px dashed var(--marble-3)',
    background: 'transparent',
    color: 'var(--marble-3)',
    fontWeight: 600,
  },
  previewRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.75rem',
    borderRadius: '0.75rem',
    background: 'var(--marble)',
    border: '1px solid var(--marble-3)',
  },
  previewName: {
    flex: 1,
    minWidth: 0,
    fontSize: '1.4rem',
    fontWeight: 700,
    color: 'var(--carve)',
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
    background: 'var(--marble)',
    color: 'var(--carve)',
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
    border: '2px solid var(--marble-3)',
    background: 'var(--marble)',
    color: 'var(--carve)',
  },
  avatarOptionSelected: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.5rem',
    borderRadius: '0.75rem',
    border: '2px solid var(--wine-2)',
    background: 'color-mix(in srgb, var(--wine-2) 12%, var(--marble))',
    color: 'var(--carve)',
  },
  avatarOptionTaken: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.5rem',
    borderRadius: '0.75rem',
    border: '2px solid var(--marble-3)',
    background: 'var(--marble)',
    color: 'var(--carve)',
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
    border: '1px solid var(--marble-3)',
    background: 'transparent',
    color: 'var(--marble-3)',
    fontWeight: 600,
  },
  pauseButton: {
    width: '100%',
    minHeight: '2.75rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1rem',
    padding: '0.6rem 1rem',
    borderRadius: '0.5rem',
    border: '1px solid var(--marble-3)',
    background: 'transparent',
    color: 'var(--marble-3)',
    fontWeight: 600,
  },
  pausedNotice: {
    fontSize: '1rem',
    fontWeight: 700,
    textAlign: 'center',
    color: 'var(--marble)',
    background: 'color-mix(in srgb, var(--wine-2) 12%, var(--night-0))',
    border: '1px solid var(--wine-2)',
    borderRadius: '0.5rem',
    padding: '0.6rem 1rem',
  },
  connectionBanner: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    fontSize: '0.85rem',
    fontWeight: 700,
    textAlign: 'center',
    color: 'var(--marble)',
    background: 'var(--night-1)',
    borderBottom: '1px solid var(--marble-3)',
    padding: '0.5rem 1rem',
  },
  // Θέατρο pass - the palette has no red. A destructive action reads
  // as heavier, not hued: --marble-3 (a solid fill, not the thin outline every
  // other button on this screen uses) is the one border/background this
  // screen reserves for "this commits something irreversible".
  resetToLobbyButton: {
    width: '100%',
    fontSize: '0.85rem',
    padding: '0.5rem 1rem',
    borderRadius: '0.5rem',
    border: '1px solid var(--marble-3)',
    background: 'transparent',
    color: 'var(--marble-3)',
    fontWeight: 600,
  },
  resetConfirmBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.75rem',
    borderRadius: '0.5rem',
    border: '2px solid var(--marble-3)',
    background: 'var(--marble)',
  },
  resetConfirmText: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--carve)',
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
    background: 'var(--marble-3)',
    color: 'var(--night-0)',
    fontWeight: 700,
  },
  resetCancelButton: {
    flex: 1,
    fontSize: '0.85rem',
    padding: '0.5rem',
    borderRadius: '0.5rem',
    border: '1px solid var(--marble-3)',
    background: 'var(--marble)',
    color: 'var(--carve)',
    fontWeight: 600,
  },
  error: { color: 'var(--marble)', fontWeight: 700, textAlign: 'center' },
  // Task 181 - no textTransform:uppercase (it keeps the Greek tonos);
  // every call site passes its text through greekUpper() instead.
  category: {
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--marble-3)',
    textAlign: 'center',
    letterSpacing: '0.05em',
  },
  // Task 156c - the "n/12" progress readout above the swipe card.
  blitzProgress: {
    fontSize: '1.4rem',
    fontWeight: 800,
    textAlign: 'center',
    color: 'var(--marble)',
    fontVariantNumeric: 'tabular-nums',
  },
  lookAtTv: {
    fontSize: '1.1rem',
    fontWeight: 600,
    textAlign: 'center',
    color: 'var(--marble)',
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
    background: 'var(--night-0)',
    color: 'var(--marble)',
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
    color: 'var(--carve)',
    background: 'var(--marble)',
    border: '2px solid var(--marble-3)',
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
  // Task 165 - the option becomes a marble slab: MarbleSlab's own chamfer
  // clip-path, flat --marble (no vein/lit/filter - TV-only texture, banned
  // on the phone), --carve text. Selected reads as heavier weight + a
  // --wine-2 edge, not a colour swap - correctness only ever reads through
  // opacity (WRONG_OPACITY, reveal text), never through hue.
  answerButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    minHeight: '44px',
    fontSize: '1.15rem',
    fontWeight: 700,
    padding: '0.75rem',
    clipPath: OPTION_SLAB_CLIP,
    border: '3px solid',
    borderColor: 'var(--marble-3)',
    background: 'var(--marble)',
    color: 'var(--carve)',
    textAlign: 'center',
  },
  answerButtonSelected: {
    fontWeight: 800,
    borderColor: 'var(--wine-2)',
    background: 'color-mix(in srgb, var(--wine-2) 12%, var(--marble))',
  },
  answerButtonDim: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    minHeight: '44px',
    fontSize: '1.15rem',
    fontWeight: 700,
    padding: '0.75rem',
    clipPath: OPTION_SLAB_CLIP,
    border: '3px solid',
    borderColor: 'var(--marble-3)',
    background: 'var(--marble)',
    color: 'var(--carve)',
    textAlign: 'center',
    opacity: 0.35,
  },
  answerText: {
    color: 'var(--carve)',
  },
  answerTextDim: {
    color: 'var(--carve)',
  },
  // Η Μνήμη της Αγοράς (Task 209) - the colour-question swatch chip. Sits
  // beside the option text as a second flex child of the same button
  // (answerButton/answerButtonDim are already display:flex row-centered),
  // never encoding correctness - dimming still happens via the button's
  // own opacity, not this chip's colour.
  agoraSwatch: {
    display: 'inline-block',
    width: '1rem',
    height: '1rem',
    borderRadius: '50%',
    marginRight: '0.4rem',
    border: '1px solid var(--marble-3)',
    flexShrink: 0,
  },
  revealVerdictRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
  },
  // Θέατρο pass - correctness is never colour-coded, matching the TV
  // (see RevealView.tsx's WRONG_OPACITY): both read as the same --marble,
  // and only opacity/weight tell correct from wrong.
  revealCorrect: {
    fontSize: '2.5rem',
    fontWeight: 800,
    textAlign: 'center',
    color: 'var(--marble)',
    opacity: 1,
  },
  revealWrong: {
    fontSize: '2.5rem',
    fontWeight: 500,
    textAlign: 'center',
    color: 'var(--marble)',
    opacity: WRONG_OPACITY,
  },
  revealCorrectOption: {
    fontSize: '1.1rem',
    fontWeight: 600,
    textAlign: 'center',
    color: 'var(--marble-3)',
  },
  revealYourChoice: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.4rem',
    fontSize: '1rem',
    fontWeight: 600,
    textAlign: 'center',
    color: 'var(--marble-3)',
  },
  revealPoints: {
    fontSize: '1.75rem',
    fontWeight: 700,
    textAlign: 'center',
    color: 'var(--marble)',
  },
  revealTotal: {
    fontSize: '1.25rem',
    fontWeight: 600,
    textAlign: 'center',
    color: 'var(--marble-3)',
  },
  revealRank: {
    fontSize: '1.25rem',
    fontWeight: 600,
    textAlign: 'center',
    color: 'var(--marble-3)',
  },
  revealSpeedRank: {
    fontSize: '1.1rem',
    fontWeight: 700,
    textAlign: 'center',
    color: 'var(--ember)',
  },
  // Η Δίκη (Task 129) - the one static life figure QUESTION and REVEAL both
  // show. Gold like revealSpeedRank: it's the number the whole trial turns
  // on, not just informational dim text.
  trialLife: {
    fontSize: '1.1rem',
    fontWeight: 700,
    textAlign: 'center',
    color: 'var(--ember)',
  },
  scoreboardRank: {
    fontSize: '3rem',
    fontWeight: 800,
    textAlign: 'center',
    color: 'var(--ember)',
  },
  // Task 165 - the player's own score as a plaque: design/theatre-reference.
  // html's .plaque shape (name over score), same background(--marble)/
  // color(--carve) as an option slab, phone units instead of the TV's cqh.
  plaque: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.15rem',
    alignSelf: 'center',
    minWidth: '44px',
    minHeight: '44px',
    padding: '0.6rem 1.4rem',
    borderRadius: '0.6rem',
    background: 'var(--marble)',
    color: 'var(--carve)',
  },
  // --carve, not the TV plaque's --marble-3 - the phone rule is stricter
  // than the TV's (never --marble-3 for anything read); the name/score
  // hierarchy comes from size and weight instead. Task 182 - no
  // textTransform:uppercase (it kept the Greek tonos); the call site passes
  // the name through greekUpper() instead.
  plaqueName: {
    fontSize: '0.85rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: 'var(--carve)',
    lineHeight: 1,
  },
  plaqueScore: {
    fontSize: '1.75rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.2,
    color: 'var(--carve)',
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
    border: '3px solid var(--marble-3)',
    background: 'var(--marble)',
    color: 'var(--carve)',
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
    color: 'var(--carve)',
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
    border: '2px solid var(--marble-3)',
    background: 'var(--marble)',
    color: 'var(--carve)',
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
    border: '3px solid var(--marble-3)',
    background: 'var(--marble)',
    boxShadow: SURFACE_GLOW,
  },
  powerUpLockedIcon: {
    fontSize: '3rem',
    lineHeight: 1,
  },
  powerUpLockedTitle: {
    fontSize: '1.75rem',
    fontWeight: 800,
    color: 'var(--wine-2)',
  },
  powerUpLockedDetail: {
    fontSize: '1.2rem',
    fontWeight: 700,
    color: 'var(--carve)',
    textAlign: 'center',
  },
  powerUpLockedHint: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: 'var(--carve)',
    textAlign: 'center',
  },
  // Steal (Task 32) - what this target actually stands to lose, already
  // clamped to their score, shown on the right of each picker row.
  stealTargetScore: {
    fontSize: '1.2rem',
    fontWeight: 800,
    color: 'var(--wine-2)',
  },
  gameOverWon: {
    fontSize: '2rem',
    fontWeight: 800,
    textAlign: 'center',
    color: 'var(--ember)',
  },
  gameOverLost: {
    fontSize: '1.75rem',
    fontWeight: 700,
    textAlign: 'center',
    color: 'var(--marble-3)',
  },
  // Η Ανάβασις (Task 190) - the ladder strip: `top` fixed-size notches,
  // never more than 10 wide (CLIMB_TOP), so a flat row never overflows
  // 360px. The filled notch is ember + heavier weight, exactly the same
  // "weight/opacity, never hue" rule QUESTION's own selected slab follows.
  climbStrip: {
    display: 'flex',
    justifyContent: 'center',
    gap: '0.3rem',
    flexWrap: 'wrap',
  },
  climbNotchEmpty: {
    width: '1.3rem',
    height: '0.45rem',
    minWidth: '0',
    minHeight: '0',
    borderRadius: '0.25rem',
    background: 'var(--marble-3)',
    opacity: 0.4,
  },
  climbNotchFilled: {
    width: '1.3rem',
    height: '0.45rem',
    minWidth: '0',
    minHeight: '0',
    borderRadius: '0.25rem',
    background: 'var(--ember)',
  },
  climbDelta: {
    fontSize: '2.25rem',
    fontWeight: 800,
    textAlign: 'center',
    color: 'var(--ember)',
  },
  // Η Μονομαχία (Task 190) - the picker reuses powerUpEffectButton's
  // stacked-slab shape (see the JSX); this is only the SELECTED override,
  // the same --wine-2 edge + weight QUESTION's answerButtonSelected uses.
  duelWeaponSelected: {
    fontWeight: 800,
    borderColor: 'var(--wine-2)',
    background: 'color-mix(in srgb, var(--wine-2) 12%, var(--marble))',
  },
  // WeaponIcon's own <svg> sizes itself at 60%/60% of ITS containing block
  // (AnavasisScene.tsx, sized there via cqh-height ancestors) - percentage
  // height needs a definite basis to resolve to anything but 0, so this
  // wrapper gives it one instead of collapsing invisibly inside a
  // flex-column button with no fixed height of its own.
  duelWeaponIconWrap: {
    width: '3rem',
    height: '3rem',
  },
  duelRevealWeapons: {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'center',
  },
  duelRevealSlab: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.3rem',
    flex: 1,
    padding: '1rem 0.5rem',
    borderRadius: '1rem',
    border: '3px solid var(--marble-3)',
    background: 'var(--marble)',
    color: 'var(--carve)',
    opacity: 0.7,
  },
  duelRevealSlabWon: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.3rem',
    flex: 1,
    padding: '1rem 0.5rem',
    borderRadius: '1rem',
    border: '3px solid var(--wine-2)',
    background: 'var(--marble)',
    color: 'var(--carve)',
    fontWeight: 800,
  },
  duelRevealName: {
    fontSize: '1rem',
    fontWeight: 700,
    textAlign: 'center',
  },
  duelRevealWeaponName: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--carve)',
  },
  duelVerdict: {
    fontSize: '1.5rem',
    fontWeight: 800,
    textAlign: 'center',
    color: 'var(--ember)',
  },
  duelTieAgain: {
    fontSize: '1.3rem',
    fontWeight: 700,
    textAlign: 'center',
    color: 'var(--marble-3)',
  },
};
