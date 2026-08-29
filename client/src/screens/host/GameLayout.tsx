import type { PlayerStanding, RoomCode } from '@game/shared';
import type { ReactNode } from 'react';
import { containerGap, styles } from './hostStyles';

interface GameLayoutProps {
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  // Only for spacing the left column's own children by player count - the
  // score column itself is no longer rendered here (see below).
  standings: PlayerStanding[];
  // Forces the LEFT column (only) to remount and re-fade, e.g. on every new
  // question - the score column lives outside this component entirely, so
  // it never flashes just because the phase content changed.
  contentKey?: string | number;
  children: ReactNode;
}

// Task 38 - the left-hand half of the fixed two-column in-game shell:
// phase content, plus the viewport-fixed room code and pause overlay, which
// live here once instead of being duplicated in every phase view.
//
// The score column is NOT rendered here any more. It used to be, but every
// phase view returns a DIFFERENT component from HostScreen's phase switch,
// so React saw a new element type at that position on every phase change and
// unmounted this whole subtree - the panel included. That discarded
// PlayerScoresPanel's own state (useDisplayOrder's held-back row order,
// useAnimatedNumber's tween, useFlip's previous rects), so its "counters
// settle, THEN rows glide for 400ms" sequence could never run across the one
// transition where scores actually change (QUESTION -> REVEAL): the panel
// simply remounted already in final order. HostScreen now owns the grid
// container AND the panel, so the panel keeps its identity while only its
// data changes - and, since Task 112, also holds the shell mounted through
// the one render where the new phase's payload hasn't arrived yet, which was
// still unmounting it on every reveal. Measured after that fix: the reordered
// row reaches its final position 2177-2200ms after reveal:show (1800ms tween
// + 400ms glide), against 0ms - no tween at all - before it.
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
