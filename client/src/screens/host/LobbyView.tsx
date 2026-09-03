import type { RefObject } from 'react';
import {
  MAX_PLAYERS,
  stagesForLength,
  totalQuestionsForLength,
  type GameModeId,
  type GameModeOption,
  type GamePhase,
  type LobbyPlayer,
  type RoomCode,
  type RoomSettings,
} from '@game/shared';
import { DIFFICULTY_MIX_LABELS } from '../../difficultyLabels';
import { Avatar } from '../../components/Avatar';
import { QR_SIZE_PX, densityScale, lobbyAvatarSize, lobbyPlayerListStyle, styles } from './hostStyles';

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
  // Task 57 - which game is selected, plus the registry-driven list (used
  // here only to look up the selected mode's own label - never a hardcoded
  // mode name).
  mode: GameModeId;
  availableModes: GameModeOption[];
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
  mode,
  availableModes,
  vip,
  powerHintDismissed,
  onDismissPowerHint,
}: LobbyViewProps) {
  const modeLabel = availableModes.find((option) => option.id === mode)?.label ?? mode;
  // Fixed at MAX_PLAYERS' own density step, NOT players.length (Task 103) -
  // the code/QR/counter/settings/waiting-message/power-hint stack is the
  // SAME height regardless of how many players have joined (the player
  // list is the only part of this screen that actually grows), so scaling
  // it by players.length left the very first frame of every game - VIP
  // alone, 0-2 players, before the list has anything to shrink - at full
  // (unscaled) size, which alone already overflowed 100vh. Fixed compact
  // sizing from frame one also means the screen never visibly resizes as
  // players join. Floored so the room code (criterion 1 - the one thing
  // read from a couch) still reads clearly as the largest element.
  const s = densityScale(MAX_PLAYERS);
  const codeScale = Math.max(s, 0.68);
  const qrScale = Math.max(s, 0.84); // never below QR_SIZE_PX*0.84 (~200px) - the scan-reliability floor
  const containerStyle = {
    ...styles.container,
    gap: `${(0.65 * s).toFixed(2)}rem`,
    padding: `${(1.1 * Math.max(s, 0.45)).toFixed(2)}rem 2rem`,
  };
  return (
    <div style={containerStyle} className="screen-fade-in">
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
          {/* Θέατρο palette (Task 96) - no colour emoji: the same
              monochrome note glyph both ways, muted state read via opacity
              only (styles.muteToggle), same rule as everywhere else. */}
          <span style={{ opacity: muted ? 0.45 : 1 }}>♪</span>
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
          <div
            data-testid="room-code"
            className="text-glow-gold gold-pulse"
            style={{ ...styles.code, fontSize: `${(8 * codeScale).toFixed(2)}rem` }}
          >
            {roomCode.split('').join(' ')}
          </div>

          <div style={{ ...styles.qrWrapper, padding: `${(1 * qrScale).toFixed(2)}rem` }}>
            <canvas
              ref={qrCanvasRef}
              data-testid="qr-code"
              width={QR_SIZE_PX}
              height={QR_SIZE_PX}
              style={{ width: `${Math.round(QR_SIZE_PX * qrScale)}px`, height: `${Math.round(QR_SIZE_PX * qrScale)}px` }}
            />
          </div>

          <div
            data-testid="player-counter"
            style={{ ...styles.counter, fontSize: `${(2.5 * Math.max(s, 0.55)).toFixed(2)}rem` }}
          >
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
                  {/* Was a colour crown emoji - plain text reads the same
                      info without any colour (Task 96). */}
                  {player.isVip && 'VIP '}
                  {player.name}
                  {!player.connected && ' (αποσυνδέθηκε)'}
                </span>
              </div>
            ))}
          </div>

          <div
            data-testid="room-mode-summary"
            style={{ ...styles.settingsSummary, fontSize: `${(1.25 * Math.max(s, 0.6)).toFixed(2)}rem` }}
          >
            {modeLabel}
          </div>
          {/* Task 57 - quiz-only settings, hidden for any other mode rather
              than a hardcoded `=== 'draw'` check, so a future third mode
              doesn't inherit a stale quiz summary by accident. */}
          {mode === 'quiz' && (
            <div
              data-testid="room-settings-summary"
              style={{ ...styles.settingsSummary, fontSize: `${(1.25 * Math.max(s, 0.6)).toFixed(2)}rem` }}
            >
              {totalQuestionsForLength(roomSettings.gameLength)} ερωτήσεις σε{' '}
              {stagesForLength(roomSettings.gameLength).length} στάδια ·{' '}
              {roomSettings.questionTimeMs / 1000}΄΄ · {DIFFICULTY_MIX_LABELS[roomSettings.difficultyMix]}
            </div>
          )}
          {mode === 'draw' && (
            <div
              data-testid="room-settings-summary"
              style={{ ...styles.settingsSummary, fontSize: `${(1.25 * Math.max(s, 0.6)).toFixed(2)}rem` }}
            >
              {roomSettings.drawRounds} {roomSettings.drawRounds > 1 ? 'γύροι' : 'γύρος'}
            </div>
          )}

          {vip ? (
            <div
              data-testid="waiting-message"
              style={{ ...styles.waitingMessage, fontSize: `${(2.5 * Math.max(s, 0.5)).toFixed(2)}rem` }}
            >
              Ο/Η {vip.name} ξεκινά το παιχνίδι
            </div>
          ) : (
            <div
              data-testid="waiting-message"
              style={{ ...styles.waitingMessage, fontSize: `${(2.5 * Math.max(s, 0.5)).toFixed(2)}rem` }}
            >
              Περιμένουμε παίκτες...
            </div>
          )}

          {!powerHintDismissed && (
            <div
              style={{ ...styles.powerHint, fontSize: `${(0.85 * Math.max(s, 0.65)).toFixed(2)}rem` }}
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
