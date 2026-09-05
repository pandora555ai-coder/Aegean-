import { useEffect, useMemo, useRef, useState } from 'react';
import type { GamePhase, PlayerSabotageState } from '@game/shared';
import { DEFAULT_DURATION_MS, useAnimatedNumber } from '../hooks/useAnimatedNumber';

// Task 163c - the ice crystal's glow. The palette has no ice-blue token (by
// design, same as Krater's KRATER_CRITICAL red) - this is the one other
// place a literal is warranted rather than inventing a token nothing else
// would use. The reference's own --ice:#BFE6FF.
const ICE_GLOW = '#BFE6FF';

// Task 161 - the players are the sophists Socrates debates. They stand in a
// row on the orchestra at the foot of the TV, each a figure with a marble
// plaque (name, score), and this row REPLACES the right-hand score column
// (PlayerScoresPanel, deleted). Mounted ONCE in HostScreen, never inside a
// phase view - every phase view is a different component type, so anything
// rendered inside one unmounts on every phase change, which is exactly what
// silently killed the settle-then-glide reorder before Task 107/112.
//
// Source: design/theatre-reference.html's .sophists/.soph/.plaque/.wreath/
// .d/.out rules, its layout() (absolute `left` = (rank+.5)/n, so the row
// re-spaces itself as it empties) and tween() (count first, THEN move).
// Animation is transform/opacity/left only - nothing here changes layout.

// The plaque's counter tween (useAnimatedNumber) runs first, the row holds
// still for GLIDE_MS more so the settled numbers can be read, THEN `left`
// changes and its own LEFT_TRANSITION_MS glide plays: 1800 + 400, then 700.
// An eliminated sophist's removal is scheduled on the same 2200ms clock
// after its .out sink+fade, so nothing about the trial's rhythm moved.
export const REORDER_DELAY_MS = DEFAULT_DURATION_MS;
export const GLIDE_MS = 400;
export const LEFT_TRANSITION_MS = 700;
const HOLD_BEFORE_MOVE_MS = REORDER_DELAY_MS + GLIDE_MS;

// Task 163b - how long the kylix token takes to fly from the victim's row
// position to the thief's (design/theatre-reference.html's own .token
// transition duration). Exported so HostScreen can hold the row at its
// pre-theft standings for exactly this long, so the delta/counter tween
// never appears before the token has actually arrived.
export const STEAL_TOKEN_FLIGHT_MS = 1100;

// The minimum a sophist needs to be placed: GameOverStanding has no
// `connected`, and LOBBY's roster (LobbyPlayer) has neither score nor rank
// until HostScreen fills them in - so the row asks for exactly the four
// fields it reads, not the full PlayerStanding.
export interface SophistStanding {
  playerId: string;
  name: string;
  score: number;
  // The server's competition rank (computeCompetitionRanks: 1,2,2,4 - a
  // duplicate is a genuine tie, not a bug). Sorting by it IS sorting by
  // score, ties kept in join order by the stable sort below - and it is
  // also what makes a trial GAME_OVER (rank = survival order, score = a
  // life that may have ended negative) put the winner at the front.
  rank: number;
  connected?: boolean;
}

interface SophistsRowProps {
  // In JOIN order - the index here is what picks each figure's himation
  // colour and mirroring, so it must be stable for the whole game.
  standings: SophistStanding[];
  phase: GamePhase;
  // This beat's signed points per playerId (REVEAL/GUESS_REVEAL/STEAL/
  // NUMERIC_REVEAL/TRIAL_REVEAL) - shown as an ember delta above the figure,
  // the SIGN carrying direction. null everywhere else.
  deltas?: Record<string, number> | null;
  // Η Δίκη - who sinks+fades (.out). Can include a player who is NOT yet
  // out for good; see confirmedOutPlayerIds.
  eliminatedPlayerIds?: string[] | null;
  // Task 137 - who is REALLY, permanently out as of this render: a strict
  // subset of eliminatedPlayerIds that excludes the reveal whose own round
  // declared sudden death (every duelist in it - the eventual winner very
  // possibly included - is flagged eliminated:true there, because they all
  // go to the decider, not out). Removal from the row is scheduled off
  // THIS, never off eliminatedPlayerIds, or the winner vanishes.
  confirmedOutPlayerIds?: string[] | null;
  // TRIAL_QUESTION only - whoever this payload already knows has locked in.
  lockedInPlayerIds?: string[] | null;
  // STEAL - the two parties get a heavier name, nothing else.
  thiefPlayerId?: string | null;
  victimPlayerId?: string | null;
  // A trial's GAME_OVER shows NO digits (score is life there and can end
  // negative) - the plaques carry the name alone.
  hideScores?: boolean;
  // Task 163b - present for exactly the ~1.1s the kylix token should be
  // flying from the victim's row position to the thief's (HostScreen owns
  // the timing; this only says whether to show it and between whom). Read
  // against THIS render's own left-position lookup, so the token always
  // starts/ends exactly where the two figures currently stand.
  stealFlight?: { thiefPlayerId: string; victimPlayerId: string } | null;
  // Task 163c - QUESTION only (HostScreen passes null everywhere else,
  // REVEAL included - the effect stops mattering the instant answers lock
  // in). Sparse per QuestionShowHostPayload.sabotage: a playerId absent
  // here is under neither effect.
  sabotageByPlayerId?: Record<string, PlayerSabotageState> | null;
}

// The five himation colours from the reference's `hues`, by join index
// (cycled past five). Figure art - the same raw-hex exception TheatreScene's
// own SVG has (CLAUDE.md's colour rule); the plaque, wreath and delta use
// palette tokens.
const HIMATION_HUES = ['#C9B7A0', '#9FB2C2', '#C2A08F', '#A8B29A', '#B7A6C4'];

// Copied from the reference's CSS with its custom properties swapped for the
// palette's tokens. cqh, not vh: the root below is a size container the
// exact size of the viewport, so the two are equal on the TV - and a scaled
// preview box (a container of its own) would keep the same proportions.
const ROW_STYLE_TAG = `
.sophists-root{position:fixed;inset:0;container-type:size;pointer-events:none;z-index:2}
.sophists{position:absolute;left:10%;right:10%;bottom:6.5cqh;height:30cqh;transition:opacity 400ms}
.sophists--hidden{opacity:0}
.sophists--dim{opacity:.6}
.soph{position:absolute;bottom:0;width:14cqh;text-align:center;transform:translateX(-50%);
  transition:left ${LEFT_TRANSITION_MS}ms cubic-bezier(.4,0,.2,1),opacity 600ms,transform 600ms}
.soph svg.fig{width:100%;height:19cqh;display:block;overflow:visible;filter:drop-shadow(-.8cqh .4cqh .6cqh rgba(0,0,0,.5))}
.plaque{background:var(--marble);color:var(--carve);padding:.9cqh 1cqh .7cqh;margin-top:.4cqh;
  clip-path:polygon(2% 0,98% 0,100% 8%,100% 92%,98% 100%,2% 100%,0 92%,0 8%);box-shadow:0 .8cqh 1.6cqh rgba(0,0,0,.55)}
.plaque .n{font-size:2.2cqh;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--marble-3);line-height:1;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.plaque .n--involved{font-weight:900;color:var(--carve)}
.plaque .s{font-size:3.8cqh;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.1}
.plaque--disconnected{opacity:.5}
.soph.lead .plaque{background:linear-gradient(180deg,var(--marble),var(--marble-2))}
.soph.lead .plaque .s{color:var(--wine)}
.d{position:absolute;left:0;right:0;top:-3.6cqh;font-size:3cqh;font-weight:800;color:var(--ember);opacity:0;transition:opacity 300ms;
  text-shadow:0 2px 8px rgba(0,0,0,.8)}
.d.on{opacity:1}
.wreath{position:absolute;top:-1.4cqh;left:50%;transform:translateX(-50%);width:8cqh;height:3.6cqh;display:none}
.soph.lead .wreath{display:block}
.soph.out{opacity:0;transform:translateX(-50%) translateY(8cqh) scale(.9)}
.soph.out .plaque{background:var(--marble-3)}
.fx{position:absolute;left:50%;top:1cqh;transform:translateX(-50%);width:11cqh;height:14cqh;opacity:0;
  transition:opacity 400ms;pointer-events:none}
.fx svg{width:100%;height:100%;overflow:visible}
.soph.iced .fx.ice{opacity:1}
.soph.inked .fx.ink{opacity:1}
.soph.iced svg.fig{filter:drop-shadow(0 0 1cqh ${ICE_GLOW}) saturate(.3) brightness(1.2)}
.soph.inked svg.fig{filter:brightness(.55)}
.soph.iced.inked svg.fig{filter:drop-shadow(0 0 1cqh ${ICE_GLOW}) saturate(.3) brightness(.66)}
.steal-token{position:absolute;bottom:22cqh;width:5cqh;height:6cqh;z-index:4;opacity:0;
  transition:left ${STEAL_TOKEN_FLIGHT_MS}ms cubic-bezier(.3,0,.2,1),transform ${STEAL_TOKEN_FLIGHT_MS}ms cubic-bezier(.3,-.6,.2,1.3),opacity 300ms}
@media (prefers-reduced-motion:reduce){.sophists,.soph,.d,.steal-token,.fx{transition:none}}
`;

// Highest rank first. Array.prototype.sort is stable (guaranteed since
// ES2019), and `standings` itself arrives in server join order, so tied
// players keep a fixed relative order render to render - no flicker.
function byRank(standings: SophistStanding[]): SophistStanding[] {
  return [...standings].sort((a, b) => a.rank - b.rank);
}

// Holds the visual order (and who wears the wreath) back from the
// just-arrived sort order until HOLD_BEFORE_MOVE_MS has passed, so a score
// change tweens its number first and only reorders the figures once that
// has settled and been read. A later score change while a reorder is still
// pending simply reschedules the timer for the newest target - the row
// always converges on the true order. Moved from PlayerScoresPanel's
// useDisplayOrder, with the leader held back on the same clock (the
// reference's layout() toggles .lead in the same pass that sets `left`).
function useDisplayOrder(standings: SophistStanding[]): { orderedIds: string[]; leaderIds: Set<string> } {
  const targetKey = useMemo(() => {
    const sorted = byRank(standings);
    const leaders = sorted.filter((s) => s.rank === 1).map((s) => s.playerId);
    return `${sorted.map((s) => s.playerId).join('|')}#${leaders.join('|')}`;
  }, [standings]);
  const [displayKey, setDisplayKey] = useState(targetKey);
  const displayKeyRef = useRef(displayKey);
  displayKeyRef.current = displayKey;

  useEffect(() => {
    if (targetKey === displayKeyRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      setDisplayKey(targetKey);
    }, HOLD_BEFORE_MOVE_MS);
    return () => window.clearTimeout(timer);
  }, [targetKey]);

  return useMemo(() => {
    const [ids, leaders] = displayKey.split('#');
    return {
      orderedIds: ids ? ids.split('|') : [],
      leaderIds: new Set(leaders ? leaders.split('|') : []),
    };
  }, [displayKey]);
}

// Task 137 - eliminated sophists don't sink+fade forever: once that tween
// (REORDER_DELAY_MS then GLIDE_MS) has fully played, the figure leaves the
// row outright and the rest re-space. `scheduledRef` remembers every id
// already given a timer so a re-render with the same confirmedOutPlayerIds
// (a fresh array instance every time - the caller rebuilds it each render)
// never restarts the clock, and nothing is ever un-scheduled: once removed,
// gone for the rest of the game. The row is mounted for the whole session
// (it used to unmount at LOBBY with the column), so `reset` - true in LOBBY
// - is what clears it for the next game.
function useRemovedIds(confirmedOutPlayerIds: string[] | null, reset: boolean): Set<string> {
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const scheduledRef = useRef<Set<string>>(new Set());
  const key = (confirmedOutPlayerIds ?? []).join('|');

  useEffect(() => {
    if (!reset) {
      return;
    }
    scheduledRef.current.clear();
    setRemovedIds((prev) => (prev.size === 0 ? prev : new Set()));
  }, [reset]);

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

// The reference's sophist(i): one figure, mirrored for every odd join index.
function Figure({ joinIndex }: { joinIndex: number }) {
  const flip = joinIndex % 2 ? -1 : 1;
  const hue = HIMATION_HUES[joinIndex % HIMATION_HUES.length];
  return (
    <svg className="fig" viewBox="0 0 120 200" aria-hidden="true">
      <g transform={`translate(60 0) scale(${flip} 1) translate(-60 0)`}>
        <ellipse cx={60} cy={196} rx={30} ry={5} fill="#000" opacity={0.4} />
        <path d="M60 200 L24 200 C22 150 30 110 40 88 L52 80 L68 80 L80 88 C90 110 98 150 96 200 Z" fill={hue} />
        <path d="M44 90 C38 130 44 170 40 200 L54 200 C52 170 58 130 54 90 Z" fill="#000" opacity={0.22} />
        <path d="M80 88 L100 66 L106 72 L86 96 Z" fill="#A07A54" />
        <circle cx={60} cy={58} r={22} fill="#B58C63" />
        <path d="M40 52 C44 34 76 34 80 52 C74 44 46 44 40 52Z" fill="#2A2218" />
      </g>
    </svg>
  );
}

function Wreath() {
  return (
    <svg className="wreath" viewBox="0 0 90 40" aria-hidden="true" data-testid="sophist-wreath">
      <path d="M45 34 Q10 30 6 8 Q30 6 45 34 Q60 6 84 8 Q80 30 45 34" fill="none" stroke="var(--olive)" strokeWidth={3} />
      <g fill="var(--olive)">
        <ellipse cx={18} cy={18} rx={7} ry={3} transform="rotate(-40 18 18)" />
        <ellipse cx={30} cy={26} rx={7} ry={3} transform="rotate(-30 30 26)" />
        <ellipse cx={72} cy={18} rx={7} ry={3} transform="rotate(40 72 18)" />
        <ellipse cx={60} cy={26} rx={7} ry={3} transform="rotate(30 60 26)" />
      </g>
    </svg>
  );
}

function formatDelta(delta: number): string {
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`;
}

// The reference's kylix (.token svg), recoloured onto the palette: its wine
// fill and marble rim are exact matches for --wine-2/--marble, so this
// needs no new raw hex the way the figure art below legitimately does.
function Kylix() {
  return (
    <svg viewBox="0 0 50 60" aria-hidden="true">
      <path
        d="M12 8 H38 L34 22 Q40 40 30 56 H20 Q10 40 16 22 Z"
        fill="var(--wine-2)"
        stroke="var(--marble)"
        strokeWidth={2}
      />
      <path d="M8 14 Q2 22 10 28 M42 14 Q48 22 40 28" fill="none" stroke="var(--marble)" strokeWidth={2} />
    </svg>
  );
}

// The reference's .fx.ice svg - a crystal of cracks over the figure. The
// stroke is ICE_GLOW (the palette has no ice-blue token); decorative FX
// art, the same exemption Figure()'s own hexes already use.
function IceCrystal() {
  return (
    <svg viewBox="0 0 60 80" aria-hidden="true">
      <g stroke={ICE_GLOW} strokeWidth={3} strokeLinecap="round" fill="none">
        <path d="M30 6 V74 M8 20 L52 60 M52 20 L8 60 M30 6 L22 14 M30 6 L38 14 M30 74 L22 66 M30 74 L38 66" />
      </g>
      <circle cx={30} cy={40} r={6} fill={ICE_GLOW} />
    </svg>
  );
}

// The reference's .fx.ink svg - a spreading blot. Raw hex, same as
// IceCrystal above: decorative FX art, not a palette-token colour.
function InkBlot() {
  return (
    <svg viewBox="0 0 60 80" aria-hidden="true">
      <path
        d="M30 10 C50 10 58 30 50 44 C60 56 40 74 30 66 C18 76 2 58 12 44 C2 30 12 10 30 10Z"
        fill="#12101A"
      />
      <circle cx={22} cy={30} r={4} fill="#3A3650" />
    </svg>
  );
}

// Task 163b - the steal flight: appears at the victim's row position and
// flies to the thief's over STEAL_TOKEN_FLIGHT_MS. Mirrors the reference's
// own trick (steal(): snap to the start position with no transition, force
// a reflow, then enable the transition and set the target on the next
// frame) via the same double-rAF pattern Krater uses for its own snap.
// Vertical movement is a `transform: translateY` (not `bottom`), and
// horizontal is `left`, per the task's "transform/opacity/left only" rule.
// Keyed by the caller on the flight's own identity, so a NEW steal always
// remounts a fresh token rather than re-animating a stale one mid-flight.
function StealToken({ fromLeft, toLeft }: { fromLeft: string; toLeft: string }) {
  const elRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) {
      return;
    }
    el.style.transition = 'none';
    el.style.left = fromLeft;
    el.style.transform = 'translateX(-50%) translateY(0)';
    el.style.opacity = '1';
    void el.getBoundingClientRect();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = '';
        el.style.left = toLeft;
        el.style.transform = 'translateX(-50%) translateY(-8cqh)';
      });
    });
  }, [fromLeft, toLeft]);

  return (
    <div ref={elRef} className="steal-token" data-testid="steal-token" aria-hidden="true">
      <Kylix />
    </div>
  );
}

// One sophist. Its own component (not inlined in the .map below) so
// useAnimatedNumber's hook state lives per-player, keyed by playerId - a
// score tweens from its old value to its new one instead of snapping.
function Sophist({
  standing,
  joinIndex,
  left,
  isLeader,
  isOut,
  isLockedIn,
  isInvolved,
  delta,
  hideScore,
  sabotage,
}: {
  standing: SophistStanding;
  joinIndex: number;
  left: string;
  isLeader: boolean;
  isOut: boolean;
  isLockedIn: boolean;
  isInvolved: boolean;
  delta: number | undefined;
  hideScore: boolean;
  sabotage: PlayerSabotageState | undefined;
}) {
  const displayScore = useAnimatedNumber(standing.score);
  const showDelta = delta !== undefined && delta !== 0;
  const iced = sabotage?.iceMs !== undefined;
  const inked = sabotage?.inkLevel !== undefined;
  const className = [
    'soph',
    isLeader ? 'lead' : '',
    isOut ? 'out' : '',
    iced ? 'iced' : '',
    inked ? 'inked' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const disconnected = standing.connected === false;
  return (
    <div
      className={className}
      style={{ left }}
      data-testid="sophist"
      data-player-id={standing.playerId}
      data-join={joinIndex}
      data-rank={standing.rank}
      data-score={standing.score}
      data-lead={isLeader}
      data-out={isOut}
      data-iced={iced}
      data-inked={inked}
    >
      <div className={showDelta ? 'd on' : 'd'} data-testid="sophist-delta">
        {showDelta ? formatDelta(delta) : ''}
      </div>
      <div className="fx ice" data-testid="sophist-ice">
        <IceCrystal />
      </div>
      <div className="fx ink" data-testid="sophist-ink">
        <InkBlot />
      </div>
      <Figure joinIndex={joinIndex} />
      <Wreath />
      <div className={disconnected ? 'plaque plaque--disconnected' : 'plaque'}>
        <div className={isInvolved ? 'n n--involved' : 'n'} data-testid="sophist-name">
          {isLockedIn ? '🔒 ' : ''}
          {standing.name}
        </div>
        {!hideScore && (
          <div className="s" data-testid="sophist-score">
            {displayScore}
          </div>
        )}
      </div>
    </div>
  );
}

export function SophistsRow({
  standings,
  phase,
  deltas = null,
  eliminatedPlayerIds = null,
  confirmedOutPlayerIds = null,
  lockedInPlayerIds = null,
  thiefPlayerId = null,
  victimPlayerId = null,
  hideScores = false,
  stealFlight = null,
  sabotageByPlayerId = null,
}: SophistsRowProps) {
  // `standings` still carries every player - useDisplayOrder needs the full
  // set to sort correctly - so removal is a final filter applied AFTER
  // ordering, not baked into the order/delay pipeline. The two timings stay
  // independent: the sink+fade reorders on its own (score-driven) schedule,
  // and once removedIds flips for a sophist this render simply stops placing
  // them - the survivors' `left` changes, and the transition re-spaces them.
  const { orderedIds, leaderIds } = useDisplayOrder(standings);
  const removedIds = useRemovedIds(confirmedOutPlayerIds, phase === 'LOBBY');
  const byId = useMemo(() => new Map(standings.map((s) => [s.playerId, s])), [standings]);
  // Display slot per player. The DOM below is rendered in JOIN order and
  // never reordered - only each figure's `left` changes - because React
  // reorders keyed children by moving the nodes (remove + insert), and a
  // moved node has no before-change style for the `left` transition to
  // start from, so the glide would simply not play.
  const slotById = new Map<string, number>();
  orderedIds.filter((id) => !removedIds.has(id) && byId.has(id)).forEach((id, index) => slotById.set(id, index));
  const n = slotById.size;
  const leftForSlot = (slot: number): string => `${(((slot + 0.5) / n) * 100).toFixed(3)}%`;

  // Task 163b - the flying kylix, positioned in the EXACT same coordinate
  // system as the figures (it's rendered as their sibling inside `.sophists`
  // below, not `.sophists-root`), so `left` always starts/ends precisely at
  // the victim's/thief's own slot - no separate lookup that could drift out
  // of sync with a mid-flight reorder.
  const stealFlightSlots =
    stealFlight && n > 0 && slotById.has(stealFlight.victimPlayerId) && slotById.has(stealFlight.thiefPlayerId)
      ? {
          fromLeft: leftForSlot(slotById.get(stealFlight.victimPlayerId) as number),
          toLeft: leftForSlot(slotById.get(stealFlight.thiefPlayerId) as number),
        }
      : null;

  // Task 163a - LOBBY no longer hides the row: it's how joining players
  // show up now that the lobby overlay names no one. STAGE_ANNOUNCE still
  // hides it (the stage card takes the whole screen, same as before).
  const hidden = phase === 'STAGE_ANNOUNCE';
  const dim = phase === 'SOCRATES' || phase === 'STEAL';
  const rowClass = ['sophists', hidden ? 'sophists--hidden' : '', dim ? 'sophists--dim' : ''].filter(Boolean).join(' ');

  return (
    <div className="sophists-root" aria-hidden="true">
      <style>{ROW_STYLE_TAG}</style>
      <div className={rowClass} data-testid="sophists-row" data-hidden={hidden}>
        {standings.map((standing, joinIndex) => {
          const id = standing.playerId;
          const slot = slotById.get(id);
          if (slot === undefined) {
            return null;
          }
          return (
            <Sophist
              key={id}
              standing={standing}
              joinIndex={joinIndex}
              left={leftForSlot(slot)}
              isLeader={leaderIds.has(id)}
              isOut={eliminatedPlayerIds?.includes(id) ?? false}
              isLockedIn={lockedInPlayerIds?.includes(id) ?? false}
              isInvolved={id === thiefPlayerId || id === victimPlayerId}
              delta={deltas?.[id]}
              hideScore={hideScores}
              sabotage={sabotageByPlayerId?.[id]}
            />
          );
        })}
        {stealFlightSlots && (
          <StealToken
            key={`${stealFlight?.victimPlayerId}-${stealFlight?.thiefPlayerId}`}
            fromLeft={stealFlightSlots.fromLeft}
            toLeft={stealFlightSlots.toLeft}
          />
        )}
      </div>
    </div>
  );
}
