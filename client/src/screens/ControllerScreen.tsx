import { useEffect, useState, type ChangeEvent, type CSSProperties, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ANSWER_IDENTITIES,
  ClientEvents,
  DEFAULT_ROOM_SETTINGS,
  DIFFICULTY_MIX_OPTIONS,
  MAX_NAME_LENGTH,
  MIN_PLAYERS,
  QUESTION_COUNT_OPTIONS,
  QUESTION_TIME_OPTIONS_MS,
  REVEAL_DURATION_MS,
  SCOREBOARD_DURATION_MS,
  ServerEvents,
  isQuestionShowHostPayload,
  isRevealHostPayload,
  type AnswerAcceptedPayload,
  type DifficultyMix,
  type GameOverPayload,
  type JoinRejectedPayload,
  type LobbyUpdatePayload,
  type PausedPayload,
  type PhaseChangedPayload,
  type PlayerJoinedPayload,
  type QuestionShowPayload,
  type QuestionShowPlayerPayload,
  type ResumedPayload,
  type RevealPlayerPayload,
  type RevealShowPayload,
  type RoomSettings,
  type ScoreboardPayload,
  type SettingsUpdatedPayload,
  type StateSyncPayload,
  type VipChangedPayload,
} from '@game/shared';
import { socket } from '../socket';
import { useSocketConnection } from '../useSocketConnection';
import { getOrCreatePlayerId } from '../playerId';
import { DIFFICULTY_MIX_LABELS } from '../difficultyLabels';
import { AnswerShape } from '../components/AnswerShape';

// React's CSSProperties doesn't model CSS custom properties - this lets the
// `--glow-color` variable the .glow-pulse class reads (see theme.css) be set
// inline per-element, since each glow needs a different colour.
type CSSVars = CSSProperties & Record<`--${string}`, string>;

const REJECTION_MESSAGES: Record<JoinRejectedPayload['reason'], string> = {
  ROOM_NOT_FOUND: 'Λάθος κωδικός δωματίου',
  NAME_TAKEN: 'Το όνομα χρησιμοποιείται ήδη',
  ROOM_FULL: 'Το δωμάτιο είναι γεμάτο',
  INVALID_NAME: 'Μη έγκυρο όνομα',
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
// SCOREBOARD - deliberately not VIP-gated, since anyone might need a break.
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

// VIP-only, available during QUESTION/REVEAL/SCOREBOARD. Requires a second
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
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<PlayerJoinedPayload | null>(null);
  const [lobby, setLobby] = useState<LobbyUpdatePayload | null>(null);
  const [question, setQuestion] = useState<QuestionShowPlayerPayload | null>(null);
  const [pendingChoice, setPendingChoice] = useState<number | null>(null);
  const [acceptedChoice, setAcceptedChoice] = useState<number | null>(null);
  const [reveal, setReveal] = useState<RevealPlayerPayload | null>(null);
  const [scoreboard, setScoreboard] = useState<ScoreboardPayload | null>(null);
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null);
  const [vipPlayerId, setVipPlayerId] = useState<string | null>(null);
  const [vipName, setVipName] = useState<string | null>(null);
  const [roomSettings, setRoomSettings] = useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);
  const [paused, setPaused] = useState(false);
  const [pausedByName, setPausedByName] = useState<string | null>(null);

  useEffect(() => {
    function handleJoined(payload: PlayerJoinedPayload) {
      setJoined(payload);
      setError(null);
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
        setScoreboard(null);
        setGameOver(null);
        // Pause is impossible in LOBBY - reset defensively.
        setPaused(false);
        setPausedByName(null);
      }
    }

    function handleRejected(payload: JoinRejectedPayload) {
      setError(REJECTION_MESSAGES[payload.reason]);
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

    function handleQuestionShow(payload: QuestionShowPayload) {
      if (!isQuestionShowHostPayload(payload)) {
        setQuestion(payload);
        setPendingChoice(null);
        setAcceptedChoice(null);
        setReveal(null);
        setScoreboard(null);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    function handleAnswerAccepted(payload: AnswerAcceptedPayload) {
      setAcceptedChoice(payload.choice);
    }

    function handleRevealShow(payload: RevealShowPayload) {
      if (!isRevealHostPayload(payload)) {
        setReveal(payload);
        setPaused(payload.paused);
        setPausedByName(payload.pausedByName);
      }
    }

    function handleScoreboardShow(payload: ScoreboardPayload) {
      setReveal(null);
      setScoreboard(payload);
      setPaused(payload.paused);
      setPausedByName(payload.pausedByName);
    }

    function handleGameOver(payload: GameOverPayload) {
      setScoreboard(null);
      setGameOver(payload);
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
      setScoreboard(null);
      setGameOver(null);

      switch (payload.phase) {
        case 'LOBBY':
          // Never actually sent (state:sync only fires when phase !==
          // 'LOBBY') - lobby:update already covers the waiting view.
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
            });
            // Landed mid-question having already answered - go straight to
            // the SUBMITTED view instead of a fresh (re-tappable) one.
            if (payload.yourChoice !== null) {
              setAcceptedChoice(payload.yourChoice);
            }
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

    socket.on(ServerEvents.PLAYER_JOINED, handleJoined);
    socket.on(ServerEvents.JOIN_REJECTED, handleRejected);
    socket.on(ServerEvents.LOBBY_UPDATE, handleLobbyUpdate);
    socket.on(ServerEvents.PHASE_CHANGED, handlePhaseChanged);
    socket.on(ServerEvents.QUESTION_SHOW, handleQuestionShow);
    socket.on(ServerEvents.ANSWER_ACCEPTED, handleAnswerAccepted);
    socket.on(ServerEvents.REVEAL_SHOW, handleRevealShow);
    socket.on(ServerEvents.SCOREBOARD_SHOW, handleScoreboardShow);
    socket.on(ServerEvents.GAME_OVER, handleGameOver);
    socket.on(ServerEvents.STATE_SYNC, handleStateSync);
    socket.on(ServerEvents.VIP_CHANGED, handleVipChanged);
    socket.on(ServerEvents.SETTINGS_UPDATED, handleSettingsUpdated);
    socket.on(ServerEvents.GAME_PAUSED, handleGamePaused);
    socket.on(ServerEvents.GAME_RESUMED, handleGameResumed);

    return () => {
      socket.off(ServerEvents.PLAYER_JOINED, handleJoined);
      socket.off(ServerEvents.JOIN_REJECTED, handleRejected);
      socket.off(ServerEvents.LOBBY_UPDATE, handleLobbyUpdate);
      socket.off(ServerEvents.PHASE_CHANGED, handlePhaseChanged);
      socket.off(ServerEvents.QUESTION_SHOW, handleQuestionShow);
      socket.off(ServerEvents.ANSWER_ACCEPTED, handleAnswerAccepted);
      socket.off(ServerEvents.REVEAL_SHOW, handleRevealShow);
      socket.off(ServerEvents.SCOREBOARD_SHOW, handleScoreboardShow);
      socket.off(ServerEvents.GAME_OVER, handleGameOver);
      socket.off(ServerEvents.STATE_SYNC, handleStateSync);
      socket.off(ServerEvents.VIP_CHANGED, handleVipChanged);
      socket.off(ServerEvents.SETTINGS_UPDATED, handleSettingsUpdated);
      socket.off(ServerEvents.GAME_PAUSED, handleGamePaused);
      socket.off(ServerEvents.GAME_RESUMED, handleGameResumed);
    };
  }, []);

  function handleCodeChange(event: ChangeEvent<HTMLInputElement>) {
    setCode(event.target.value.replace(/\D/g, '').slice(0, 4));
  }

  function handleNameChange(event: ChangeEvent<HTMLInputElement>) {
    setName(event.target.value.slice(0, MAX_NAME_LENGTH));
  }

  function handleJoin() {
    socket.emit(ClientEvents.PLAYER_JOIN, { code, name, playerId });
  }

  const canJoin = connected && code.length === 4 && name.trim().length > 0;
  const isVip = vipPlayerId === playerId;

  function handleAnswerTap(index: number) {
    if (pendingChoice !== null || paused) {
      return; // optimistic lock - first tap is final, no changing the answer
    }
    setPendingChoice(index);
    socket.emit(ClientEvents.SUBMIT_ANSWER, { choice: index });
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

  const estimatedMinutes = Math.round(
    (roomSettings.questionCount * (roomSettings.questionTimeMs + REVEAL_DURATION_MS + SCOREBOARD_DURATION_MS)) / 60000,
  );

  if (gameOver) {
    const me = gameOver.standings.find((standing) => standing.playerId === playerId);
    const won = me ? me.rank === 1 : false;

    return (
      <div style={styles.container}>
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

  if (scoreboard) {
    const sorted = [...scoreboard.standings].sort((a, b) => a.rank - b.rank);
    const myIndex = sorted.findIndex((standing) => standing.playerId === playerId);
    const me = myIndex >= 0 ? sorted[myIndex] : null;
    const above = myIndex > 0 ? sorted[myIndex - 1] : null;
    const gap = me && above ? above.score - me.score : 0;

    return (
      <div style={styles.container}>
        {isVip && (
          <div style={styles.vipBadge} data-testid="vip-badge">
            👑 VIP
          </div>
        )}
        <div style={styles.scoreboardRank} data-testid="scoreboard-rank">
          #{me ? me.rank : '-'}
        </div>
        <div style={styles.scoreboardScore} data-testid="scoreboard-score">
          {me ? me.score : 0} πόντοι
        </div>
        {above ? (
          <div style={styles.scoreboardGap} data-testid="scoreboard-gap">
            {gap} πόντοι πίσω από τον/την {above.name}
          </div>
        ) : (
          <div style={styles.scoreboardGap} data-testid="scoreboard-gap">
            Είσαι πρώτος/η!
          </div>
        )}
        <div style={styles.lookAtTv}>Κοίτα την τηλεόραση για τη βαθμολογία</div>
        {isVip && !paused && (
          <button data-testid="next-button" style={styles.skipButton} type="button" onClick={handleNext}>
            Παράλειψη
          </button>
        )}
        <PauseControl paused={paused} pausedByName={pausedByName} onPause={handlePause} onResume={handleResume} />
        {isVip && <ResetToLobbyControl onConfirm={handleResetToLobby} />}
      </div>
    );
  }

  if (reveal) {
    return (
      <div style={styles.container}>
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

  if (question) {
    // pendingChoice is the immediate local tap (set the instant a button is
    // pressed, before the server even acks it); acceptedChoice only exists
    // for a reconnect landing mid-question via state:sync, where the tap
    // itself never happened on this page load. Either way, exactly one of
    // the four buttons is "mine" and gets highlighted - the other three dim.
    const myChoice = pendingChoice !== null ? pendingChoice : acceptedChoice;
    const answered = myChoice !== null;
    return (
      <div style={styles.questionContainer}>
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
        </div>
        <div style={styles.answerGrid}>
          {question.options.map((option, index) => {
            const identity = ANSWER_IDENTITIES[index];
            const isMine = index === myChoice;
            const dimmed = answered && !isMine;
            const disabled = answered || paused;
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
                        ...styles.answerButton,
                        borderColor: identity.color,
                        background: isMine ? `${identity.color}33` : 'var(--surface)',
                        ...(isMine ? { '--glow-color': `${identity.color}80` } : {}),
                      } as CSSVars)
                }
                onClick={() => handleAnswerTap(index)}
                disabled={disabled}
              >
                <span style={styles.answerShapeRow}>
                  <AnswerShape index={index} sizeRem={2.25} muted={dimmed} />
                  <span style={{ ...styles.answerLabel, color: dimmed ? 'var(--text-faint)' : identity.color }}>
                    {identity.letter}
                  </span>
                </span>
                <span style={dimmed ? styles.answerTextDim : styles.answerText}>{option}</span>
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
        {isVip && (
          <div style={styles.vipBadge} data-testid="vip-badge">
            👑 VIP
          </div>
        )}
        <div style={styles.title}>{joined.name}</div>
        <div style={styles.subtitle}>waiting for the game to start</div>
        <div style={styles.lobbyCount}>{connectedCount} παίκτες στο δωμάτιο</div>

        <div style={styles.settingsPanel} data-testid="settings-panel">
          <SegmentedRow
            label="Ερωτήσεις"
            options={QUESTION_COUNT_OPTIONS}
            current={roomSettings.questionCount}
            format={(count) => String(count)}
            onSelect={(count) => handleSettingChange({ questionCount: count })}
            readOnly={!isVip}
            testIdPrefix="setting-count"
          />
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
      />
      <input
        style={styles.input}
        maxLength={MAX_NAME_LENGTH}
        placeholder="Όνομα"
        value={name}
        onChange={handleNameChange}
      />
      <button style={styles.button} type="button" onClick={handleJoin} disabled={!canJoin}>
        Join
      </button>

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
    background: 'rgba(245, 183, 0, 0.12)',
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
    color: 'var(--danger)',
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
    background: 'var(--danger)',
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
  error: { color: 'var(--danger)', fontWeight: 600, textAlign: 'center' },
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
    color: 'var(--danger)',
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
  scoreboardGap: {
    fontSize: '1.1rem',
    fontWeight: 600,
    textAlign: 'center',
    color: 'var(--text-dim)',
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
