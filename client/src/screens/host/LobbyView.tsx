import type { RefObject } from 'react';
import {
  MAX_PLAYERS,
  stagesForLength,
  totalQuestionsForLength,
  type GamePhase,
  type LobbyPlayer,
  type RoomCode,
  type RoomSettings,
} from '@game/shared';
import { DIFFICULTY_MIX_LABELS } from '../../difficultyLabels';
import { Avatar } from '../../components/Avatar';
import { QR_SIZE_PX, lobbyAvatarSize, lobbyPlayerListStyle, styles } from './hostStyles';

interface LobbyViewProps {
  connected: boolean;
  roomCode: RoomCode | null;
  isRejoining: boolean;
  wakeLockFailed: boolean;
  phase: GamePhase;
  muted: boolean;
  onToggleMuted: () => void;
  onCreateRoom: () => void;
  qrCanvasRef: RefObject<HTMLCanvasElement>;
  players: LobbyPlayer[];
  connectedCount: number;
  roomSettings: RoomSettings;
  vip: LobbyPlayer | null;
  powerHintDismissed: boolean;
  onDismissPowerHint: () => void;
}

export function LobbyView({
  connected,
  roomCode,
  isRejoining,
  wakeLockFailed,
  phase,
  muted,
  onToggleMuted,
  onCreateRoom,
  qrCanvasRef,
  players,
  connectedCount,
  roomSettings,
  vip,
  powerHintDismissed,
  onDismissPowerHint,
}: LobbyViewProps) {
  return (
    <div style={styles.container} className="screen-fade-in">
      {/* LOBBY only, per spec - a fixed top-left chip so it never competes
          with the centred room code / QR column. Only shown once a room
          actually exists (nothing to mute before then). */}
      {roomCode !== null && (
        <button
          type="button"
          data-testid="mute-toggle"
          onClick={onToggleMuted}
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
            onClick={onCreateRoom}
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

          <div style={lobbyPlayerListStyle(players.length)}>
            {players.map((player) => (
              <div
                key={player.playerId}
                data-testid="player-row"
                data-connected={player.connected}
                data-vip={player.isVip}
                style={styles.playerRow}
              >
                <Avatar avatarId={player.avatarId} sizeRem={lobbyAvatarSize(players.length)} />
                <span style={player.connected ? styles.playerName : styles.playerNameDisconnected}>
                  {player.isVip && '👑 '}
                  {player.name}
                  {!player.connected && ' (αποσυνδέθηκε)'}
                </span>
              </div>
            ))}
          </div>

          <div data-testid="room-settings-summary" style={styles.settingsSummary}>
            {totalQuestionsForLength(roomSettings.gameLength)} ερωτήσεις σε{' '}
            {stagesForLength(roomSettings.gameLength).length} στάδια ·{' '}
            {roomSettings.questionTimeMs / 1000}΄΄ · {DIFFICULTY_MIX_LABELS[roomSettings.difficultyMix]}
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
              onClick={onDismissPowerHint}
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
