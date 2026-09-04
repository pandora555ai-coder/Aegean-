import type { PlayerStanding, RoomCode } from '@game/shared';
import type { ReactNode } from 'react';
import { containerGap, styles } from './hostStyles';

interface GameLayoutProps {
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  // Only for spacing the read column's own children by player count - no
  // player is rendered here (see below).
  standings: PlayerStanding[];
  // Forces the read column (only) to remount and re-fade, e.g. on every new
  // question - the sophists row lives outside this component entirely, so
  // it never flashes just because the phase content changed.
  contentKey?: string | number;
  children: ReactNode;
}

// Task 38 - the read column of the in-game shell: phase content, plus the
// viewport-fixed room code and pause overlay, which live here once instead
// of being duplicated in every phase view.
//
// The players are NOT rendered here (Task 161: the sophists row, at the
// foot of the screen, replaces the old right-hand score column). They never
// can be: every phase view returns a DIFFERENT component from HostScreen's
// phase switch, so React sees a new element type at that position on every
// phase change and unmounts this whole subtree. That would discard the
// row's own state (the held-back order, useAnimatedNumber's tween), so its
// "counters settle, THEN figures glide" sequence could never run across the
// one transition where scores actually change (QUESTION -> REVEAL).
// HostScreen owns the column container AND the row, so the row keeps its
// identity while only its data changes - and, since Task 112, also holds
// the last standings through the one render where the new phase's payload
// hasn't arrived yet. Measured after that fix: the reordered row reached
// its final position 2177-2200ms after reveal:show (1800ms tween + 400ms
// glide), against 0ms - no tween at all - before it.
export function GameLayout({ roomCode, paused, pausedByName, standings, contentKey, children }: GameLayoutProps) {
  return (
    <>
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
    </>
  );
}
