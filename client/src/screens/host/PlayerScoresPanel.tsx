import type { PlayerStanding } from '@game/shared';
import { Avatar } from '../../components/Avatar';
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber';
import { sidebarAvatarSize, sidebarListGap, sidebarRowSizeStyle, styles, type CSSVars } from './hostStyles';

interface PlayerScoresPanelProps {
  standings: PlayerStanding[];
  // STEAL (Task 32/38) - the thief/victim get a highlight colour so the
  // panel doubles as the transfer's "what's at stake" strip instead of
  // duplicating a second list elsewhere on screen. null outside STEAL.
  thiefPlayerId?: string | null;
  victimPlayerId?: string | null;
}

// One row. Its own component (not inlined in the .map below) so
// useAnimatedNumber's hook state lives per-player, keyed by playerId - a
// score tweens from its old value to its new one instead of snapping,
// exactly like STEAL's old standings strip did.
function ScorePanelRow({
  standing,
  avatarSize,
  rowSize,
  isThief,
  isVictim,
}: {
  standing: PlayerStanding;
  avatarSize: number;
  rowSize: ReturnType<typeof sidebarRowSizeStyle>;
  isThief: boolean;
  isVictim: boolean;
}) {
  const displayScore = useAnimatedNumber(standing.score);
  const highlightColor = isThief ? 'var(--gold)' : isVictim ? 'var(--danger-text)' : undefined;
  const rowStyle = !standing.connected
    ? styles.scorePanelRowDisconnected
    : standing.rank === 1
      ? styles.scorePanelRowLeader
      : styles.scorePanelRow;

  return (
    <div
      data-testid="score-panel-row"
      data-thief={isThief}
      data-victim={isVictim}
      style={{ ...rowStyle, ...rowSize }}
    >
      <span style={styles.scorePanelRank}>#{standing.rank}</span>
      <Avatar avatarId={standing.avatarId} sizeRem={avatarSize} ringColor={highlightColor} />
      <span style={{ ...styles.scorePanelName, color: highlightColor ?? styles.scorePanelName.color }}>
        {standing.name}
      </span>
      <span style={{ ...styles.scorePanelScore, color: highlightColor ?? styles.scorePanelScore.color }}>
        {displayScore}
      </span>
    </div>
  );
}

// Task 38 - the TV's persistent right-hand score column, rendered
// identically across QUESTION/POWER_UP/REVEAL/STEAL so scores never
// disappear between phases. Rows stay in room.players' insertion (join)
// order (see PlayerStanding), NEVER re-sorted by score/rank - the column
// must never shift or resize as someone's total changes, only the numbers
// inside a row tween.
export function PlayerScoresPanel({ standings, thiefPlayerId = null, victimPlayerId = null }: PlayerScoresPanelProps) {
  const count = standings.length;
  const rowSize = sidebarRowSizeStyle(count);
  const avatarSize = sidebarAvatarSize(count);

  return (
    <div style={styles.gameLayoutRight}>
      <div style={styles.scorePanelTitle}>Βαθμολογία</div>
      <div style={{ ...styles.scorePanelList, gap: sidebarListGap(count) }} data-testid="score-panel">
        {standings.map((standing) => (
          <ScorePanelRow
            key={standing.playerId}
            standing={standing}
            avatarSize={avatarSize}
            rowSize={rowSize as CSSVars}
            isThief={standing.playerId === thiefPlayerId}
            isVictim={standing.playerId === victimPlayerId}
          />
        ))}
      </div>
    </div>
  );
}
