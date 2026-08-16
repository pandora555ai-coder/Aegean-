import { useEffect, useState, type ChangeEvent, type CSSProperties, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
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
  type PhaseChangedPayload,
  type PlayerJoinedPayload,
  type QuestionShowPayload,
  type QuestionShowPlayerPayload,
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

const OPTION_LABELS = ['Α', 'Β', 'Γ', 'Δ'];

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
      }
    }

    function handleAnswerAccepted(payload: AnswerAcceptedPayload) {
      setAcceptedChoice(payload.choice);
    }

    function handleRevealShow(payload: RevealShowPayload) {
      if (!isRevealHostPayload(payload)) {
        setReveal(payload);
      }
    }

    function handleScoreboardShow(payload: ScoreboardPayload) {
      setReveal(null);
      setScoreboard(payload);
    }

    function handleGameOver(payload: GameOverPayload) {
      setScoreboard(null);
      setGameOver(payload);
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
            });
            // Landed mid-question having already answered - go straight to
            // the SUBMITTED view instead of a fresh (re-tappable) one.
            if (payload.yourChoice !== null) {
              setAcceptedChoice(payload.yourChoice);
            }
          }
          break;
        case 'REVEAL':
          if (!isRevealHostPayload(payload)) {
            setReveal(payload);
          }
          break;
        case 'SCOREBOARD':
          setScoreboard(payload);
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
    if (pendingChoice !== null) {
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
        {isVip && (
          <button data-testid="next-button" style={styles.skipButton} type="button" onClick={handleNext}>
            Παράλειψη
          </button>
        )}
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
        <div style={reveal.yourCorrect ? styles.revealCorrect : styles.revealWrong} data-testid="reveal-verdict">
          {reveal.yourCorrect ? 'Σωστά!' : 'Λάθος'}
        </div>
        <div style={styles.revealCorrectOption}>
          Σωστή απάντηση: {reveal.correctOption}
        </div>
        <div style={styles.revealPoints} data-testid="reveal-points">
          +{reveal.pointsAwarded} πόντοι
        </div>
        <div style={styles.revealTotal} data-testid="reveal-total">
          Σύνολο: {reveal.totalScore}
        </div>
        <div style={styles.revealRank} data-testid="reveal-rank">
          Θέση #{reveal.rank}
        </div>
        {isVip && (
          <button data-testid="continue-button" style={styles.skipButton} type="button" onClick={handleNext}>
            Παράλειψη
          </button>
        )}
      </div>
    );
  }

  if (question && acceptedChoice !== null) {
    return (
      <div style={styles.container}>
        {isVip && (
          <div style={styles.vipBadge} data-testid="vip-badge">
            👑 VIP
          </div>
        )}
        <div style={styles.category}>{question.category}</div>
        <div style={styles.submittedChoice} data-testid="submitted-choice">
          {OPTION_LABELS[acceptedChoice]}. {question.options[acceptedChoice]}
        </div>
        <div style={styles.lookAtTv} data-testid="waiting-message">
          Περίμενε τους υπόλοιπους...
        </div>
      </div>
    );
  }

  if (question) {
    return (
      <div style={styles.container}>
        {isVip && (
          <div style={styles.vipBadge} data-testid="vip-badge">
            👑 VIP
          </div>
        )}
        <div style={styles.category}>{question.category}</div>
        <div style={styles.lookAtTv}>Κοίτα την τηλεόραση για την ερώτηση</div>
        <div style={styles.answerGrid}>
          {question.options.map((option, index) => (
            <button
              key={index}
              type="button"
              data-testid="answer-button"
              style={pendingChoice !== null ? styles.answerButtonDisabled : styles.answerButton}
              onClick={() => handleAnswerTap(index)}
              disabled={pendingChoice !== null}
            >
              <span style={styles.answerLabel}>{OPTION_LABELS[index]}</span>
              <span>{option}</span>
            </button>
          ))}
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
  },
  title: { fontSize: '1.5rem', fontWeight: 700, textAlign: 'center' },
  status: { textAlign: 'center', color: '#666' },
  subtitle: { fontSize: '1.1rem', color: '#555', textAlign: 'center' },
  lobbyCount: { fontSize: '1rem', color: '#777', textAlign: 'center' },
  settingsPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
    padding: '0.9rem',
    borderRadius: '0.75rem',
    background: '#f8fafc',
    border: '1px solid #e5e7eb',
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
    color: '#555',
  },
  settingsRowValue: {
    fontSize: '0.9rem',
    fontWeight: 700,
    color: '#2563eb',
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
    border: '2px solid #2563eb',
    background: '#2563eb',
    color: 'white',
  },
  segmentInactive: {
    fontSize: '0.85rem',
    fontWeight: 700,
    padding: '0.4rem 0.7rem',
    borderRadius: '0.5rem',
    border: '2px solid #d1d5db',
    background: 'white',
    color: '#555',
  },
  estimatedLength: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#999',
    textAlign: 'center',
  },
  input: {
    width: '100%',
    fontSize: '1.5rem',
    padding: '0.9rem 1rem',
    boxSizing: 'border-box',
    borderRadius: '0.5rem',
    border: '1px solid #ccc',
  },
  button: {
    width: '100%',
    fontSize: '1.25rem',
    padding: '1rem',
    borderRadius: '0.5rem',
    border: 'none',
    background: '#2563eb',
    color: 'white',
    fontWeight: 600,
  },
  buttonDisabled: {
    width: '100%',
    fontSize: '1.25rem',
    padding: '1rem',
    borderRadius: '0.5rem',
    border: 'none',
    background: '#9ca3af',
    color: 'white',
    fontWeight: 600,
    cursor: 'not-allowed',
  },
  vipBadge: {
    alignSelf: 'center',
    fontSize: '1rem',
    fontWeight: 700,
    color: '#92400e',
    background: '#fef3c7',
    border: '1px solid #f59e0b',
    borderRadius: '999px',
    padding: '0.25rem 0.9rem',
  },
  skipButton: {
    width: '100%',
    fontSize: '1rem',
    padding: '0.6rem 1rem',
    borderRadius: '0.5rem',
    border: '1px solid #d1d5db',
    background: 'transparent',
    color: '#888',
    fontWeight: 600,
  },
  error: { color: '#dc2626', fontWeight: 600, textAlign: 'center' },
  category: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#666',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  lookAtTv: {
    fontSize: '1.1rem',
    fontWeight: 600,
    textAlign: 'center',
    color: '#333',
  },
  submittedChoice: {
    fontSize: '1.75rem',
    fontWeight: 700,
    textAlign: 'center',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    background: '#eff6ff',
    border: '2px solid #2563eb',
  },
  answerGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  answerButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    width: '100%',
    fontSize: '1.25rem',
    fontWeight: 600,
    padding: '1.25rem 1rem',
    borderRadius: '0.75rem',
    border: '2px solid #2563eb',
    background: 'white',
    color: '#111',
    textAlign: 'left',
  },
  answerButtonDisabled: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    width: '100%',
    fontSize: '1.25rem',
    fontWeight: 600,
    padding: '1.25rem 1rem',
    borderRadius: '0.75rem',
    border: '2px solid #d1d5db',
    background: '#f3f4f6',
    color: '#999',
    textAlign: 'left',
    opacity: 0.6,
  },
  answerLabel: {
    fontWeight: 800,
    color: '#2563eb',
    minWidth: '1.5rem',
  },
  revealCorrect: {
    fontSize: '2.5rem',
    fontWeight: 800,
    textAlign: 'center',
    color: '#16a34a',
  },
  revealWrong: {
    fontSize: '2.5rem',
    fontWeight: 800,
    textAlign: 'center',
    color: '#dc2626',
  },
  revealCorrectOption: {
    fontSize: '1.1rem',
    fontWeight: 600,
    textAlign: 'center',
    color: '#333',
  },
  revealPoints: {
    fontSize: '1.75rem',
    fontWeight: 700,
    textAlign: 'center',
  },
  revealTotal: {
    fontSize: '1.25rem',
    fontWeight: 600,
    textAlign: 'center',
    color: '#555',
  },
  revealRank: {
    fontSize: '1.25rem',
    fontWeight: 600,
    textAlign: 'center',
    color: '#555',
  },
  scoreboardRank: {
    fontSize: '3rem',
    fontWeight: 800,
    textAlign: 'center',
    color: '#2563eb',
  },
  scoreboardScore: {
    fontSize: '1.75rem',
    fontWeight: 700,
    textAlign: 'center',
  },
  scoreboardGap: {
    fontSize: '1.1rem',
    fontWeight: 600,
    textAlign: 'center',
    color: '#555',
  },
  gameOverWon: {
    fontSize: '2rem',
    fontWeight: 800,
    textAlign: 'center',
    color: '#f59e0b',
  },
  gameOverLost: {
    fontSize: '1.75rem',
    fontWeight: 700,
    textAlign: 'center',
    color: '#555',
  },
};
