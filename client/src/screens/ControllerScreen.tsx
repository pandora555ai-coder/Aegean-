import { useEffect, useState, type ChangeEvent, type CSSProperties } from 'react';
import {
  ClientEvents,
  MAX_NAME_LENGTH,
  ServerEvents,
  isQuestionShowHostPayload,
  isRevealHostPayload,
  type AnswerAcceptedPayload,
  type JoinRejectedPayload,
  type LobbyUpdatePayload,
  type PlayerJoinedPayload,
  type QuestionShowPayload,
  type QuestionShowPlayerPayload,
  type RevealPlayerPayload,
  type RevealShowPayload,
} from '@game/shared';
import { socket } from '../socket';
import { useSocketConnection } from '../useSocketConnection';
import { getOrCreatePlayerId } from '../playerId';

const OPTION_LABELS = ['Α', 'Β', 'Γ', 'Δ'];

const REJECTION_MESSAGES: Record<JoinRejectedPayload['reason'], string> = {
  ROOM_NOT_FOUND: 'Λάθος κωδικός δωματίου',
  NAME_TAKEN: 'Το όνομα χρησιμοποιείται ήδη',
  ROOM_FULL: 'Το δωμάτιο είναι γεμάτο',
  INVALID_NAME: 'Μη έγκυρο όνομα',
};

export default function ControllerScreen() {
  const { connected } = useSocketConnection();
  const [playerId] = useState(() => getOrCreatePlayerId());

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<PlayerJoinedPayload | null>(null);
  const [lobby, setLobby] = useState<LobbyUpdatePayload | null>(null);
  const [question, setQuestion] = useState<QuestionShowPlayerPayload | null>(null);
  const [pendingChoice, setPendingChoice] = useState<number | null>(null);
  const [acceptedChoice, setAcceptedChoice] = useState<number | null>(null);
  const [reveal, setReveal] = useState<RevealPlayerPayload | null>(null);

  useEffect(() => {
    function handleJoined(payload: PlayerJoinedPayload) {
      setJoined(payload);
      setError(null);
    }

    function handleRejected(payload: JoinRejectedPayload) {
      setError(REJECTION_MESSAGES[payload.reason]);
    }

    function handleLobbyUpdate(payload: LobbyUpdatePayload) {
      setLobby(payload);
    }

    function handleQuestionShow(payload: QuestionShowPayload) {
      if (!isQuestionShowHostPayload(payload)) {
        setQuestion(payload);
        setPendingChoice(null);
        setAcceptedChoice(null);
        setReveal(null);
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

    socket.on(ServerEvents.PLAYER_JOINED, handleJoined);
    socket.on(ServerEvents.JOIN_REJECTED, handleRejected);
    socket.on(ServerEvents.LOBBY_UPDATE, handleLobbyUpdate);
    socket.on(ServerEvents.QUESTION_SHOW, handleQuestionShow);
    socket.on(ServerEvents.ANSWER_ACCEPTED, handleAnswerAccepted);
    socket.on(ServerEvents.REVEAL_SHOW, handleRevealShow);

    return () => {
      socket.off(ServerEvents.PLAYER_JOINED, handleJoined);
      socket.off(ServerEvents.JOIN_REJECTED, handleRejected);
      socket.off(ServerEvents.LOBBY_UPDATE, handleLobbyUpdate);
      socket.off(ServerEvents.QUESTION_SHOW, handleQuestionShow);
      socket.off(ServerEvents.ANSWER_ACCEPTED, handleAnswerAccepted);
      socket.off(ServerEvents.REVEAL_SHOW, handleRevealShow);
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

  function handleAnswerTap(index: number) {
    if (pendingChoice !== null) {
      return; // optimistic lock - first tap is final, no changing the answer
    }
    setPendingChoice(index);
    socket.emit(ClientEvents.SUBMIT_ANSWER, { choice: index });
  }

  if (reveal) {
    return (
      <div style={styles.container}>
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
      </div>
    );
  }

  if (question && acceptedChoice !== null) {
    return (
      <div style={styles.container}>
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
    return (
      <div style={styles.container}>
        <div style={styles.title}>{joined.name}</div>
        <div style={styles.subtitle}>waiting for the game to start</div>
        <div style={styles.lobbyCount}>{connectedCount} παίκτες στο δωμάτιο</div>
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
};
