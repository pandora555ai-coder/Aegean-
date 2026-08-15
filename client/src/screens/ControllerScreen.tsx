import { useEffect, useState, type ChangeEvent, type CSSProperties } from 'react';
import {
  ClientEvents,
  MAX_NAME_LENGTH,
  ServerEvents,
  type JoinRejectedPayload,
  type LobbyUpdatePayload,
  type PlayerJoinedPayload,
} from '@game/shared';
import { socket } from '../socket';
import { useSocketConnection } from '../useSocketConnection';
import { getOrCreatePlayerId } from '../playerId';

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

    socket.on(ServerEvents.PLAYER_JOINED, handleJoined);
    socket.on(ServerEvents.JOIN_REJECTED, handleRejected);
    socket.on(ServerEvents.LOBBY_UPDATE, handleLobbyUpdate);

    return () => {
      socket.off(ServerEvents.PLAYER_JOINED, handleJoined);
      socket.off(ServerEvents.JOIN_REJECTED, handleRejected);
      socket.off(ServerEvents.LOBBY_UPDATE, handleLobbyUpdate);
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
};
