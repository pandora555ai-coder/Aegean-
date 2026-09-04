import type { RefObject } from 'react';
import {
  stagesForLength,
  totalQuestionsForLength,
  type GameModeId,
  type GameModeOption,
  type GamePhase,
  type RoomCode,
  type RoomSettings,
} from '@game/shared';
import { DIFFICULTY_MIX_LABELS } from '../../difficultyLabels';
import { MarbleSlab } from '../../components/MarbleSlab';
import { QR_SIZE_PX, styles } from './hostStyles';

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
  roomSettings: RoomSettings;
  // Task 57 - which game is selected, plus the registry-driven list (used
  // here only to look up the selected mode's own label - never a hardcoded
  // mode name).
  mode: GameModeId;
  availableModes: GameModeOption[];
}

// Task 163a - replaces the old centred code/QR/player-list/waiting-message/
// power-hint stack with design/theatre-reference.html's #lobby: brand left
// (the game's own name, serif, plus its tagline), the join slab right
// (Κωδικός, the code, the join URL, the QR), one settings-summary line
// under the slab. Nothing here names or counts a player - the sophists row
// (now visible through LOBBY too, HostScreen/SophistsRow) is where joining
// players show up, so this view stays about the ROOM, not its roster.
const STYLE_TAG = `
.lobby-root{position:fixed;inset:var(--tv-safe-top) 0 var(--tv-safe-bottom) 0;container-type:size;
  display:grid;grid-template-columns:1.1fr 1fr;column-gap:5%;align-items:start;padding:8% 6% 0;
  justify-items:start;text-align:left}
.lobby-root .brand{font-family:"Gentium Book Plus",Georgia,"Times New Roman",serif;font-size:13cqh;
  font-weight:700;line-height:.95;color:var(--marble);text-shadow:0 .6cqh 3cqh rgba(0,0,0,.8)}
.lobby-root .brand small{display:block;font-family:-apple-system,sans-serif;font-size:3cqh;
  font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:var(--ember);margin-top:1.6cqh}
.lobby-root .status{font-size:1.8cqh;color:var(--marble-3);margin-top:1.2cqh}
.lobby-root .right{display:flex;flex-direction:column;gap:1.4cqh;width:100%}
.lobby-root .join-inner{display:grid;grid-template-columns:1fr auto;gap:3cqh;align-items:center;width:100%}
.lobby-root .l{font-size:2.4cqh;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--marble-3)}
.lobby-root .code{font-size:12cqh;font-weight:900;line-height:1;letter-spacing:.05em;
  font-variant-numeric:tabular-nums;color:var(--carve)}
.lobby-root .u{font-size:2.5cqh;font-weight:700;color:var(--wine)}
.lobby-root .qr{width:max(20cqh,200px);height:max(20cqh,200px);background:var(--marble);border-radius:0.5cqh}
.lobby-root .settings{font-size:1.7cqh;color:var(--marble-2)}
`;

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
  roomSettings,
  mode,
  availableModes,
}: LobbyViewProps) {
  const modeLabel = availableModes.find((option) => option.id === mode)?.label ?? mode;
  const joinUrl = typeof window !== 'undefined' ? window.location.host : '';

  return (
    <div className="lobby-root screen-fade-in" data-testid="lobby-root">
      <style>{STYLE_TAG}</style>
      {roomCode !== null && (
        <button
          type="button"
          data-testid="mute-toggle"
          onClick={onToggleMuted}
          style={styles.muteToggle}
          aria-label={muted ? 'Ενεργοποίηση ήχου' : 'Σίγαση ήχου'}
        >
          <span style={{ opacity: muted ? 0.45 : 1 }}>♪</span>
        </button>
      )}

      <div>
        <div className="brand">
          Αιγαίον
          <small>Ο Σωκράτης εναντίον των Σοφιστών</small>
        </div>
        <div className="status">{connected ? 'connected' : 'disconnected'}</div>
        {phase === 'LOBBY' && wakeLockFailed && (
          <div className="status" data-testid="wake-lock-hint">
            Συμβουλή: απενεργοποιήστε το Eco Mode / Screen Saver στις ρυθμίσεις της τηλεόρασης
          </div>
        )}
      </div>

      <div className="right">
        {roomCode === null ? (
          isRejoining ? (
            <div className="status" data-testid="rejoining">
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
            <MarbleSlab data-testid="join-slab" style={{ display: 'grid', padding: '4cqh 5cqh' }}>
              <div className="join-inner">
                <div>
                  <div className="l">Κωδικός</div>
                  <div className="code" data-testid="room-code">
                    {roomCode.split('').join(' ')}
                  </div>
                  <div className="u">{joinUrl}</div>
                </div>
                <canvas
                  ref={qrCanvasRef}
                  data-testid="qr-code"
                  className="qr"
                  width={QR_SIZE_PX}
                  height={QR_SIZE_PX}
                />
              </div>
            </MarbleSlab>
            <div className="settings" data-testid="room-mode-summary">
              {modeLabel}
              {mode === 'quiz' &&
                ` · ${totalQuestionsForLength(roomSettings.gameLength)} ερωτήσεις σε ${
                  stagesForLength(roomSettings.gameLength).length
                } στάδια · ${roomSettings.questionTimeMs / 1000}΄΄ · ${DIFFICULTY_MIX_LABELS[roomSettings.difficultyMix]}`}
              {mode === 'draw' &&
                ` · ${roomSettings.drawRounds} ${roomSettings.drawRounds > 1 ? 'γύροι' : 'γύρος'}`}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
