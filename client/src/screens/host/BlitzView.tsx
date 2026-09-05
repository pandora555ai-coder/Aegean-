import type { CSSProperties } from 'react';
import { type BlitzShowHostPayload, type RoomCode } from '@game/shared';
import { GameLayout } from './GameLayout';
import { MarbleSlab } from '../../components/MarbleSlab';
import { styles } from './hostStyles';

// Same serif treatment as DrawView's titleStyle - the one thing on this
// slab that is actually READ as a headline, everything about players lives
// in the row below (Task 156b's TOP=read/BOTTOM=players split).
const titleStyle: CSSProperties = {
  fontFamily: '"Gentium Book Plus", Georgia, "Times New Roman", serif',
  fontSize: '5.8cqh',
  lineHeight: 1.2,
  fontWeight: 700,
  color: 'var(--carve)',
};

// --carve, not --marble-3 (the reference's own .mid) - same substitution
// DrawView's waitingLineStyle already makes: --marble-3 is a dark-ground
// colour and would be nearly invisible on this light marble slab.
const detailLineStyle: CSSProperties = {
  fontSize: '3.2cqh',
  marginTop: '1.6cqh',
  color: 'var(--carve)',
  fontWeight: 600,
  opacity: 0.7,
};

interface BlitzViewProps {
  blitz: BlitzShowHostPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
}

// Task 156b - the TV during BLITZ. The statements themselves are on the
// phones (each player reads at their own pace, and the TV showing one
// would put everyone on the same one) - the slab carries only the rules;
// each player's own live progress is the ember counter above their plaque
// in the sophists row (HostScreen's counterByPlayerId), not anything here.
export function BlitzView({ blitz, roomCode, paused, pausedByName }: BlitzViewProps) {
  return (
    <GameLayout roomCode={roomCode} paused={paused} pausedByName={pausedByName} standings={blitz.standings} contentKey="blitz">
      <div className="enter-pop" style={styles.category}>
        Η Παλαίστρα
      </div>
      <MarbleSlab className="enter-pop" style={{ flex: '0 0 auto' }}>
        <div>
          <div style={titleStyle} data-testid="blitz-title">
            Δεξιά το σωστό, αριστερά το λάθος.
          </div>
          <div style={detailLineStyle} data-testid="blitz-instruction">
            Δώδεκα προτάσεις, τριάντα δευτερόλεπτα.
          </div>
        </div>
      </MarbleSlab>
    </GameLayout>
  );
}
