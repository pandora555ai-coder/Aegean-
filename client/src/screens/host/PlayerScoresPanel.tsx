import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { PlayerStanding } from '@game/shared';
import { Avatar } from '../../components/Avatar';
import { DEFAULT_DURATION_MS, useAnimatedNumber } from '../../hooks/useAnimatedNumber';
import { sidebarAvatarSize, sidebarListGap, sidebarRowSizeStyle, styles, type CSSVars } from './hostStyles';

interface PlayerScoresPanelProps {
  standings: PlayerStanding[];
  // STEAL (Task 32/38) - the thief/victim get a highlight colour so the
  // panel doubles as the transfer's "what's at stake" strip instead of
  // duplicating a second list elsewhere on screen. null outside STEAL.
  thiefPlayerId?: string | null;
  victimPlayerId?: string | null;
  // REVEAL/GUESS_REVEAL only - this round's points per playerId, shown as a
  // small +N next to the score. Every other phase passes nothing, so the
  // badge just isn't there rather than needing an explicit clear step.
  pointsThisRound?: Record<string, number> | null;
}

// Rows re-sort only after the score counters have finished tweening (Task
// 41) - matches useAnimatedNumber's own duration so "counters settle, THEN
// rows glide" never overlaps mid-move.
const REORDER_DELAY_MS = DEFAULT_DURATION_MS;
const GLIDE_MS = 400;

// Highest score first. Array.prototype.sort is stable (guaranteed since
// ES2019), and `standings` itself arrives in server join order, so tied
// players keep a fixed relative order render to render - no flicker.
function byScoreDesc(standings: PlayerStanding[]): PlayerStanding[] {
  return [...standings].sort((a, b) => b.score - a.score);
}

// Holds the visual row order back from the just-arrived sort order until
// REORDER_DELAY_MS has passed, so a score change tweens its number first and
// only reorders the rows once that settles. A later score change while a
// reorder is still pending simply reschedules the timer for the newest
// target - the column always converges on the true order.
function useDisplayOrder(standings: PlayerStanding[]): PlayerStanding[] {
  const targetIds = useMemo(() => byScoreDesc(standings).map((s) => s.playerId), [standings]);
  const targetKey = targetIds.join('|');
  const [displayIds, setDisplayIds] = useState<string[]>(targetIds);
  const displayIdsRef = useRef(displayIds);
  displayIdsRef.current = displayIds;

  useEffect(() => {
    if (targetKey === displayIdsRef.current.join('|')) {
      return;
    }
    const timer = window.setTimeout(() => {
      setDisplayIds(targetKey.split('|'));
    }, REORDER_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  const byId = useMemo(() => new Map(standings.map((s) => [s.playerId, s])), [standings]);
  return displayIds.map((id) => byId.get(id)).filter((s): s is PlayerStanding => Boolean(s));
}

// Classic FLIP: measures each row's position before the reorder above takes
// effect and after, then plays the delta back out as a transform transition
// - works regardless of the density-scaled row height, which is never a
// fixed pixel value here.
function useFlip(containerRef: RefObject<HTMLDivElement>, orderKey: string) {
  const prevRects = useRef<Map<string, DOMRect>>(new Map());
  const isFirst = useRef(true);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-row-id]'));
    const nextRects = new Map<string, DOMRect>();
    rows.forEach((row) => {
      nextRects.set(row.dataset.rowId as string, row.getBoundingClientRect());
    });

    if (!isFirst.current) {
      rows.forEach((row) => {
        const id = row.dataset.rowId as string;
        const prev = prevRects.current.get(id);
        const next = nextRects.get(id);
        if (!prev || !next) {
          return;
        }
        const dy = prev.top - next.top;
        if (Math.abs(dy) < 0.5) {
          return;
        }
        row.style.transition = 'none';
        row.style.transform = `translateY(${dy}px)`;
        // Forces layout to flush the transform above before the transition
        // below is set, so the browser animates FROM it instead of skipping
        // straight to the resting position.
        void row.offsetHeight;
        row.style.transition = `transform ${GLIDE_MS}ms ease`;
        row.style.transform = '';
      });
    }
    isFirst.current = false;
    prevRects.current = nextRects;
  }, [orderKey, containerRef]);
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
  delta,
}: {
  standing: PlayerStanding;
  avatarSize: number;
  rowSize: ReturnType<typeof sidebarRowSizeStyle>;
  isThief: boolean;
  isVictim: boolean;
  delta?: number;
}) {
  const displayScore = useAnimatedNumber(standing.score);
  // STEAL (Task 91) - thief and victim get the SAME spotlight, weight only:
  // no hue distinguishes which is which, and no red marks the victim.
  const involved = isThief || isVictim;
  const rowStyle = !standing.connected
    ? styles.scorePanelRowDisconnected
    : standing.rank === 1
      ? styles.scorePanelRowLeader
      : styles.scorePanelRow;

  return (
    <div
      data-testid="score-panel-row"
      data-row-id={standing.playerId}
      data-thief={isThief}
      data-victim={isVictim}
      style={{ ...rowStyle, ...rowSize }}
    >
      <span style={styles.scorePanelRank}>
        #{standing.rank}
      </span>
      <Avatar avatarId={standing.avatarId} sizeRem={avatarSize} ringColor={involved ? 'var(--gold)' : undefined} />
      <span style={{ ...styles.scorePanelName, fontWeight: involved ? 800 : styles.scorePanelName.fontWeight }}>
        {standing.name}
      </span>
      <span style={{ ...styles.scorePanelScore, fontWeight: involved ? 800 : styles.scorePanelScore.fontWeight }}>
        {displayScore}
      </span>
      {Boolean(delta) && (
        <span style={styles.scorePanelDelta} data-testid="score-panel-delta">
          +{delta}
        </span>
      )}
    </div>
  );
}

// Task 38/41 - the TV's persistent right-hand score column, rendered
// identically across QUESTION/POWER_UP/REVEAL/STEAL so scores never
// disappear between phases. Always sorted highest score first (competition
// ranking - ties share a rank). Rows don't snap straight to a new sort
// position when a score changes: useDisplayOrder holds the reorder back
// until the counters above have finished tweening, then useFlip glides the
// rows there via transform so the transfer reads before the standings move.
export function PlayerScoresPanel({
  standings,
  thiefPlayerId = null,
  victimPlayerId = null,
  pointsThisRound = null,
}: PlayerScoresPanelProps) {
  const count = standings.length;
  const rowSize = sidebarRowSizeStyle(count);
  const avatarSize = sidebarAvatarSize(count);
  const orderedStandings = useDisplayOrder(standings);
  const containerRef = useRef<HTMLDivElement>(null);
  useFlip(containerRef, orderedStandings.map((s) => s.playerId).join('|'));

  const panelStyle = { ...styles.gameLayoutRight, background: 'var(--panel)', borderRadius: '1rem', padding: '1rem' };

  return (
    <div style={panelStyle}>
      <div style={styles.scorePanelTitle}>Βαθμολογία</div>
      <div
        ref={containerRef}
        style={{ ...styles.scorePanelList, gap: sidebarListGap(count) }}
        data-testid="score-panel"
      >
        {orderedStandings.map((standing) => (
          <ScorePanelRow
            key={standing.playerId}
            standing={standing}
            avatarSize={avatarSize}
            rowSize={rowSize as CSSVars}
            isThief={standing.playerId === thiefPlayerId}
            isVictim={standing.playerId === victimPlayerId}
            delta={pointsThisRound?.[standing.playerId]}
          />
        ))}
      </div>
    </div>
  );
}
