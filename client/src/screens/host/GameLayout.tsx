import type { PlayerStanding, RoomCode } from '@game/shared';
import type { ReactNode } from 'react';
import { PlayerScoresPanel } from './PlayerScoresPanel';
import { containerGap, styles } from './hostStyles';

interface GameLayoutProps {
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  standings: PlayerStanding[];
  thiefPlayerId?: string | null;
  victimPlayerId?: string | null;
  // Forces the LEFT column (only) to remount and re-fade, e.g. on every new
  // question - the RIGHT column stays mounted throughout so the score
  // column never flashes just because the phase content changed.
  contentKey?: string | number;
  // Ελαιογραφία palette pass (Task 87) - QUESTION only, opt-in. Every other
  // phase omits this prop and renders exactly as before.
  theme?: 'elaiografia';
  children: ReactNode;
}

// Task 38 - the fixed two-column shell shared by every in-game phase
// (QUESTION, POWER_UP, REVEAL, STEAL): phase content on the left, the
// always-visible score column on the right. Pause overlay and the corner
// room code are viewport-fixed, so they live here once instead of being
// duplicated in every phase view.
export function GameLayout({
  roomCode,
  paused,
  pausedByName,
  standings,
  thiefPlayerId = null,
  victimPlayerId = null,
  contentKey,
  theme,
  children,
}: GameLayoutProps) {
  const themedLayout =
    theme === 'elaiografia' ? { ...styles.gameLayout, background: 'var(--ground)', color: 'var(--cream)' } : styles.gameLayout;
  return (
    <div style={themedLayout}>
      {roomCode && (
        <div style={styles.cornerRoomCode} data-testid="corner-room-code">
          {roomCode}
        </div>
      )}
      {paused && (
        <div style={styles.pauseOverlay} data-testid="pause-overlay">
          <div style={styles.pauseTitle}>ΠΑΥΣΗ</div>
          <div style={styles.pauseSubtitle}>Ο/Η {pausedByName} έκανε παύση</div>
        </div>
      )}
      <div
        key={contentKey}
        className="screen-fade-in"
        style={{ ...styles.gameLayoutLeft, gap: containerGap(standings.length) }}
      >
        {children}
      </div>
      <PlayerScoresPanel standings={standings} thiefPlayerId={thiefPlayerId} victimPlayerId={victimPlayerId} theme={theme} />
    </div>
  );
}
