import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { PlayerStanding } from '@game/shared';
import { Avatar } from '../../components/Avatar';
import { DEFAULT_DURATION_MS, useAnimatedNumber } from '../../hooks/useAnimatedNumber';
import { sidebarAvatarSize, sidebarListGap, sidebarRowSizeStyle, styles, type CSSVars } from './hostStyles';
import { Krater, type TimerState } from '../../components/Krater';

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
  // Task 112 - the phase countdown, which now lives at the TOP of this
  // column instead of the top of the scene (a real set cropped it there).
  // null for a phase that has no timer of its own, so the rows simply sit
  // where they always did.
  timer?: TimerState | null;
  // Η Δίκη (Task 128) - "Βαθμολογία" outside the trial, "Ζωές" during it:
  // score IS life there, so the column's own label says so.
  title?: string;
  // Sinks to the bottom (via the SAME byScoreDesc sort every phase already
  // uses - an eliminated life is never positive, so it sorts last on its
  // own) and fades - never passed outside TRIAL_QUESTION/TRIAL_REVEAL. Can be
  // PROVISIONAL (a round that ties everyone at zero together flags the
  // eventual winner too, until the decider round settles it) - see
  // confirmedOutPlayerIds below for the one this component trusts to REMOVE
  // a row.
  eliminatedPlayerIds?: string[] | null;
  // Task 137 - who is REALLY, permanently out as of THIS render: a strict
  // subset of eliminatedPlayerIds that excludes a reveal whose own round
  // declared sudden death (HostScreen.trialConfirmedOutPlayerIds). Row
  // removal is scheduled off this, never off eliminatedPlayerIds, so a
  // sudden-death winner's row is never yanked out from under the decider
  // that's about to declare them the winner.
  confirmedOutPlayerIds?: string[] | null;
  // TRIAL_QUESTION only - whoever this payload already knows has locked in.
  lockedInPlayerIds?: string[] | null;
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

// Task 137 - eliminated rows don't sink+fade forever: once that reorder
// tween (REORDER_DELAY_MS then GLIDE_MS - the SAME machinery below, so the
// removal lands exactly when the sink+fade finishes rather than cutting it
// off) has fully played, the row leaves the column outright and the column
// itself gets shorter. `scheduledRef` remembers every id already given a
// timer so a re-render with the same confirmedOutPlayerIds (a fresh array
// instance every time - the caller rebuilds it each render) never restarts
// the clock, and nothing is ever un-scheduled: once removed, gone for the
// rest of the game. Keyed on a joined string, not the array itself, so the
// effect only re-runs when membership actually changes.
function useRemovedIds(confirmedOutPlayerIds: string[] | null): Set<string> {
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const scheduledRef = useRef<Set<string>>(new Set());
  const key = (confirmedOutPlayerIds ?? []).join('|');

  useEffect(() => {
    const pending = (confirmedOutPlayerIds ?? []).filter((id) => !scheduledRef.current.has(id));
    if (pending.length === 0) {
      return;
    }
    pending.forEach((id) => scheduledRef.current.add(id));
    const timer = window.setTimeout(() => {
      setRemovedIds((prev) => {
        const next = new Set(prev);
        pending.forEach((id) => next.add(id));
        return next;
      });
    }, REORDER_DELAY_MS + GLIDE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return removedIds;
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
  isEliminated,
  isLockedIn,
  delta,
}: {
  standing: PlayerStanding;
  avatarSize: number;
  rowSize: ReturnType<typeof sidebarRowSizeStyle>;
  isThief: boolean;
  isVictim: boolean;
  isEliminated: boolean;
  isLockedIn: boolean;
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
      data-eliminated={isEliminated}
      style={{ ...rowStyle, ...rowSize, ...(isEliminated ? styles.scorePanelRowEliminated : null) }}
    >
      <span style={styles.scorePanelRank}>
        #{standing.rank}
      </span>
      <Avatar avatarId={standing.avatarId} sizeRem={avatarSize} ringColor={involved ? 'var(--wine-2)' : undefined} />
      <span style={{ ...styles.scorePanelName, fontWeight: involved ? 800 : styles.scorePanelName.fontWeight }}>
        {standing.name}
      </span>
      <span style={{ ...styles.scorePanelScore, fontWeight: involved ? 800 : styles.scorePanelScore.fontWeight }}>
        {displayScore}
      </span>
      {isLockedIn && (
        <span style={styles.scorePanelLockIcon} data-testid="score-panel-locked">
          🔒
        </span>
      )}
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
  timer = null,
  title = 'Βαθμολογία',
  eliminatedPlayerIds = null,
  confirmedOutPlayerIds = null,
  lockedInPlayerIds = null,
}: PlayerScoresPanelProps) {
  // `standings` still carries every player - see useDisplayOrder above,
  // which needs the full set to sort correctly - so removal is a final
  // filter applied AFTER ordering, not baked into the order/delay pipeline.
  // That keeps the two timings independent: the sink+fade reorders on its
  // own schedule (score-driven, as it always has), and once removedIds
  // flips for a row this render simply stops including it - the row's
  // sudden absence is exactly what useFlip below needs to glide the rest of
  // the column up, with no SECOND REORDER_DELAY_MS wait bolted on.
  const orderedStandings = useDisplayOrder(standings);
  const removedIds = useRemovedIds(confirmedOutPlayerIds);
  const visibleStandings = useMemo(
    () => orderedStandings.filter((standing) => !removedIds.has(standing.playerId)),
    [orderedStandings, removedIds],
  );
  const count = visibleStandings.length;
  const rowSize = sidebarRowSizeStyle(count);
  const avatarSize = sidebarAvatarSize(count);
  const containerRef = useRef<HTMLDivElement>(null);
  useFlip(containerRef, visibleStandings.map((s) => s.playerId).join('|'));

  const panelStyle = { ...styles.gameLayoutRight, background: 'var(--marble)', borderRadius: '1rem', padding: '1rem' };

  return (
    <div style={panelStyle}>
      {timer && <Krater timer={timer} playerCount={count} />}
      <div style={styles.scorePanelTitle} data-testid="score-panel-title">
        {title}
      </div>
      <div
        ref={containerRef}
        style={{ ...styles.scorePanelList, gap: sidebarListGap(count) }}
        data-testid="score-panel"
      >
        {visibleStandings.map((standing) => (
          <ScorePanelRow
            key={standing.playerId}
            standing={standing}
            avatarSize={avatarSize}
            rowSize={rowSize as CSSVars}
            isThief={standing.playerId === thiefPlayerId}
            isVictim={standing.playerId === victimPlayerId}
            isEliminated={eliminatedPlayerIds?.includes(standing.playerId) ?? false}
            isLockedIn={lockedInPlayerIds?.includes(standing.playerId) ?? false}
            delta={pointsThisRound?.[standing.playerId]}
          />
        ))}
      </div>
    </div>
  );
}
