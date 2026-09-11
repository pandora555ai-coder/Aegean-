import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CrowdMood, DuelWeapon, RoomCode } from '@game/shared';
import { greekUpper } from '../greekUpper';
import { styles as hostStyles, type CSSVars } from '../screens/host/hostStyles';
import { buildDuelVerdictLine } from './duelVerdict';

// Task 189 - Η Ανάβασις on the TV: the rock/stair/temple world for the climb
// finale's four phases (CLIMB_QUESTION/CLIMB_REVEAL/DUEL_PICK/DUEL_REVEAL)
// plus GAME_OVER's crowning. Ported from design/anavasis-reference.html (the
// approved look, committed for Task 189) - a SIBLING to TheatreScene/
// SophistsRow, not a replacement: HostScreen swaps this whole world in only
// while room.climb is in flight (isClimbFinale), same way it already swaps
// scene lighting via isSceneLit. Background SVG is scene ART - raw hex is
// the drawing-ink exception (CLAUDE.md); AnavasisClimbers/AnavasisDuel/
// AnavasisCrowning below use palette tokens throughout, same discipline as
// SophistsRow/GameOverView. No live filter: the marble feTurbulence stays
// HostScreen's single MarbleFilterDefs definition.

// ---------------------------------------------------------------------------
// Shared geometry - 12 VISUAL steps up the rock, fixed decorative art. The
// server's CLIMB_TOP (currently 10) is a DATA range mapped onto this fixed
// art by visualStepFor, never the reverse, so the art matches the reference
// exactly regardless of CLIMB_TOP's own value.
// ---------------------------------------------------------------------------
const VISUAL_STEPS = 12;
const stepBottomCqh = (i: number): number => 10 + i * 4.7;
const stepWidthPct = (i: number): number => 72 - i * 2.6;
// 720 viewBox units == 100cqh (the reference's own CQH = 720/100) - the one
// conversion factor between the background SVG's coordinate space and the
// cqh space the climber figures/temple sit in.
const VB_PER_CQH = 7.2;
const yOf = (i: number): number => 720 - stepBottomCqh(i) * VB_PER_CQH;
const wOf = (i: number): number => stepWidthPct(i) * 12.8;
const xOf = (i: number): number => (1280 - wOf(i)) / 2;

// The terrace (visual step 12) is where the temple and Socrates stand -
// exported so SocratesFigure's climb pose lands exactly on it.
export const ANAVASIS_TEMPLE_BOTTOM_CQH = stepBottomCqh(VISUAL_STEPS);

// A player's real step (0..top) onto the fixed 0..12 visual range.
function visualStepFor(step: number, top: number): number {
  if (top <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, step / top));
  return Math.round(ratio * VISUAL_STEPS);
}

// The reference's own LANE_F was a fixed 5-slot array ([-.36,-.18,0,.18,.36] -
// gap 0.18, total span 0.72) sized for its 5-player demo; MAX_PLAYERS is 8
// (shared), and %-wrapping that array past 5 climbers would seat two of them
// in the exact same lane. Generalized here to any climber count: the SAME
// gap formula (span 0.72, evenly spaced, centred on 0) that reproduces the
// reference's own 5 values exactly at n=5, packing tighter as n grows so the
// total span never exceeds 0.72 of the current step's width regardless of
// count - never off the stair, at any of the 2..MAX_PLAYERS climbers a
// finale can have.
function laneLeftPct(joinIndex: number, totalClimbers: number, visualStep: number): number {
  const n = Math.max(1, totalClimbers);
  const gap = n > 1 ? 0.72 / (n - 1) : 0;
  const offset = (joinIndex - (n - 1) / 2) * gap;
  return 50 + offset * stepWidthPct(visualStep);
}

// ---------------------------------------------------------------------------
// Deterministic background geometry - computed ONCE at module load (same
// discipline as TheatreScene's makeRng/buildGeometry), so every mount draws
// the identical stars/city.
// ---------------------------------------------------------------------------
function makeRng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

interface Star {
  cx: number;
  cy: number;
  r: number;
  opacity: number;
  delay: number;
}
interface Window {
  x: number;
  y: number;
  opacity: number;
}

interface AnavasisGeometry {
  stars: Star[];
  windows: Window[];
  rockface: string;
  rockl: string;
  rockr: string;
  stair: { x: number; y: number; w: number; h: number; lit: boolean }[];
  stairMass: string;
  temple: {
    columns: number[];
    pediment: string;
    gapX: number;
    gapW: number;
  };
  torches: { x: number; y: number }[];
}

function buildGeometry(): AnavasisGeometry {
  const rnd = makeRng(189);

  const stars: Star[] = Array.from({ length: 80 }, () => ({
    cx: rnd() * 1280,
    cy: rnd() * 260,
    r: 0.6 + rnd() * 1.3,
    opacity: 0.3 + rnd() * 0.6,
    delay: -rnd() * 3,
  }));

  const windows: Window[] = [];
  for (let k = 0; k < 9; k++) {
    const bx = 330 + rnd() * 880;
    const by = 676 + rnd() * 20;
    const n = 5 + Math.floor(rnd() * 6);
    for (let j = 0; j < n; j++) {
      windows.push({ x: bx + (rnd() - 0.5) * 70, y: by + (rnd() - 0.5) * 14, opacity: 0.5 + rnd() * 0.5 });
    }
  }

  const y0 = yOf(0);
  const yT = yOf(12);
  const rockface = `M${xOf(0) - 40} ${y0 + 30} L${xOf(12) - 60} ${yT - 56} L${xOf(12) + wOf(12) + 60} ${yT - 56} L${xOf(0) + wOf(0) + 40} ${y0 + 30} L1280 720 L0 720 Z`;
  const rockl = `M0 720 L0 400 L120 360 L200 392 L290 350 L${xOf(12) - 40} ${yT - 30} L${xOf(6) - 20} ${yOf(6)} L${xOf(1) - 8} ${yOf(1)} L${xOf(0)} ${y0 + 34} Z`;
  const rockr = `M1280 720 L1280 380 L1170 350 L1080 388 L1000 344 L${xOf(12) + wOf(12) + 40} ${yT - 30} L${xOf(6) + wOf(6) + 20} ${yOf(6)} L${xOf(1) + wOf(1) + 8} ${yOf(1)} L${xOf(0) + wOf(0)} ${y0 + 34} Z`;

  const stair = Array.from({ length: 12 }, (_, k) => {
    const i = k + 1;
    return { x: xOf(i), y: yOf(i), w: wOf(i), h: i === 12 ? 4.5 : 3, lit: i === 12 };
  });
  const stairMass = `M${xOf(0)} ${yOf(0)} L${xOf(12)} ${yOf(12)} L${xOf(12) + wOf(12)} ${yOf(12)} L${xOf(0) + wOf(0)} ${yOf(0)} Z`;

  const cx = 640;
  const W = 470;
  const colH = 58;
  const x = cx - W / 2;
  const baseY = yT - 18 - colH;
  const columns = Array.from({ length: 8 }, (_, i) => x + 14 + i * ((W - 28 - 16) / 7));
  const pediment = `M${x - 14} ${baseY - 12} L${cx} ${baseY - 12 - 40} L${x + W + 14} ${baseY - 12} Z`;

  const torches = [3, 6, 9].flatMap((i) => {
    const y = yOf(i);
    return [
      { x: xOf(i) - 34, y: y - 46 },
      { x: xOf(i) + wOf(i) + 34, y: y - 46 },
    ];
  });

  return { stars, windows, rockface, rockl, rockr, stair, stairMass, temple: { columns, pediment, gapX: x, gapW: W }, torches };
}

const GEOMETRY = buildGeometry();

const SCENE_STYLE_TAG = `
.anavasis-scene-root{position:absolute;inset:0;overflow:hidden;pointer-events:none;transition:filter 500ms ease}
.anavasis-scene-root svg{width:100%;height:100%;display:block}
@media (prefers-reduced-motion:no-preference){
  .anavasis-flame{animation:anavasis-flick .17s steps(2) infinite alternate;transform-origin:50% 100%}
  @keyframes anavasis-flick{to{transform:scale(1.12,.92);opacity:.85}}
  .anavasis-glow{animation:anavasis-glow 1.3s ease-in-out infinite alternate}
  @keyframes anavasis-glow{to{opacity:.5}}
  .anavasis-star{animation:anavasis-twinkle 3s ease-in-out infinite alternate}
  @keyframes anavasis-twinkle{to{opacity:.25}}
  .anavasis-heart{animation:anavasis-heart 4s ease-in-out infinite alternate}
  @keyframes anavasis-heart{to{opacity:.9}}
  .anavasis-mist{animation:anavasis-mist 26s ease-in-out infinite alternate}
  @keyframes anavasis-mist{to{transform:translateX(3.5%)}}
}
@media (prefers-reduced-motion:reduce){.anavasis-scene-root,.anavasis-flame,.anavasis-glow,.anavasis-star,.anavasis-heart,.anavasis-mist{animation:none!important}}
`;

function sceneFilterFor(mood: CrowdMood, dimmed: boolean): string {
  const parts: string[] = [];
  if (dimmed) parts.push('brightness(0.5) saturate(0.8)');
  if (mood === 'cheer') parts.push('brightness(1.18) saturate(1.1)');
  else if (mood === 'boo') parts.push('brightness(0.6) saturate(0.6)');
  return parts.length > 0 ? parts.join(' ') : 'none';
}

interface AnavasisSceneProps {
  mood: CrowdMood;
  dimmed: boolean;
}

// The backdrop only: rock, stair, temple, far city/theatre, mist, torches.
// No player, no Socrates, no duel content lives here - see the exports below.
export function AnavasisScene({ mood, dimmed }: AnavasisSceneProps) {
  const g = GEOMETRY;
  return (
    <div
      className="anavasis-scene-root"
      style={{ filter: sceneFilterFor(mood, dimmed) }}
      aria-hidden="true"
      data-testid="anavasis-scene"
      data-mood={mood}
      data-dimmed={dimmed}
    >
      <style>{SCENE_STYLE_TAG}</style>
      <svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id="anavasis-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#04070F" />
            <stop offset=".45" stopColor="#0B1428" />
            <stop offset=".8" stopColor="#22284A" />
            <stop offset="1" stopColor="#3A2C4E" />
          </linearGradient>
          <radialGradient id="anavasis-torch">
            <stop offset="0" stopColor="#FFD98A" stopOpacity=".95" />
            <stop offset=".35" stopColor="#E8A14A" stopOpacity=".35" />
            <stop offset="1" stopColor="#E8A14A" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="anavasis-moon">
            <stop offset="0" stopColor="#F6F0DC" />
            <stop offset=".5" stopColor="#F6F0DC" />
            <stop offset=".55" stopColor="#F6F0DC" stopOpacity=".25" />
            <stop offset="1" stopColor="#F6F0DC" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="anavasis-temple-glow">
            <stop offset="0" stopColor="#FFD98A" stopOpacity=".55" />
            <stop offset=".5" stopColor="#E8A14A" stopOpacity=".2" />
            <stop offset="1" stopColor="#E8A14A" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="anavasis-rockl" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#0A101F" />
            <stop offset="1" stopColor="#1C2438" />
          </linearGradient>
          <linearGradient id="anavasis-rockr" x1="1" y1="0" x2="0" y2="0">
            <stop offset="0" stopColor="#0A101F" />
            <stop offset="1" stopColor="#1C2438" />
          </linearGradient>
          <linearGradient id="anavasis-rockface" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#242E48" />
            <stop offset="1" stopColor="#121A2C" />
          </linearGradient>
          <linearGradient id="anavasis-tread" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#D8CFBA" />
            <stop offset="1" stopColor="#948B76" />
          </linearGradient>
          <linearGradient id="anavasis-col" x1="0" x2="1">
            <stop offset="0" stopColor="#F0E9D8" />
            <stop offset=".5" stopColor="#C9BFA8" />
            <stop offset="1" stopColor="#7E7560" />
          </linearGradient>
          <radialGradient id="anavasis-vig" cx=".5" cy=".55" r=".78">
            <stop offset=".5" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity=".72" />
          </radialGradient>
        </defs>

        <rect width={1280} height={720} fill="url(#anavasis-sky)" />
        <g fill="#EDE6D6">
          {g.stars.map((s, i) => (
            <circle
              key={i}
              className="anavasis-star"
              cx={s.cx}
              cy={s.cy}
              r={s.r}
              opacity={s.opacity}
              style={{ animationDelay: `${s.delay}s` }}
            />
          ))}
        </g>
        <circle cx={200} cy={105} r={58} fill="url(#anavasis-moon)" />

        {/* the sacred rock: a face behind the stair, two dark shoulders framing it */}
        <path d={g.rockface} fill="url(#anavasis-rockface)" />
        <path d={g.rockl} fill="url(#anavasis-rockl)" />
        <path d={g.rockr} fill="url(#anavasis-rockr)" />

        {/* the sleeping city, far below, and the theatre we came from */}
        <g fill="#FFD98A">
          {g.windows.map((w, i) => (
            <rect key={i} x={w.x} y={w.y} width={4} height={5} opacity={w.opacity} />
          ))}
        </g>
        <g opacity={0.95} transform="translate(30 -18) scale(1.15)">
          <path d="M118 700 A72 26 0 0 1 262 700 Z" fill="none" stroke="#CFC5B0" strokeWidth={3.5} opacity={0.8} />
          <path d="M132 700 A58 20 0 0 1 248 700 Z" fill="none" stroke="#CFC5B0" strokeWidth={2.5} opacity={0.65} />
          <path d="M146 700 A44 15 0 0 1 234 700 Z" fill="none" stroke="#CFC5B0" strokeWidth={2} opacity={0.5} />
          <circle cx={190} cy={694} r={2.6} fill="#FFD98A" />
          <circle cx={152} cy={698} r={1.8} fill="#FFD98A" opacity={0.8} />
          <circle cx={228} cy={698} r={1.8} fill="#FFD98A" opacity={0.8} />
        </g>

        {/* the temple, above the last step */}
        <circle className="anavasis-heart" cx={640} cy={yOf(12) - 86 * 0.45} r={150} fill="url(#anavasis-temple-glow)" opacity={0.65} />
        <rect x={g.temple.gapX - 16} y={yOf(12) - 10} width={g.temple.gapW + 32} height={10} fill="#B6AC94" />
        <rect x={g.temple.gapX - 8} y={yOf(12) - 18} width={g.temple.gapW + 16} height={8} fill="#CFC5B0" />
        {g.temple.columns.map((colX, i) => (
          <g key={i}>
            <rect x={colX} y={yOf(12) - 18 - 58} width={16} height={58} fill="url(#anavasis-col)" />
            <rect x={colX - 2} y={yOf(12) - 18 - 58 - 5} width={20} height={5} fill="#D8CFBA" />
          </g>
        ))}
        <rect x={g.temple.gapX - 6} y={yOf(12) - 18 - 58 - 12} width={g.temple.gapW + 12} height={8} fill="#CFC5B0" />
        <path d={g.temple.pediment} fill="#DAD1BC" stroke="#8F8672" strokeWidth={2} opacity={0.9} />

        {/* the stair carved into the rock */}
        <path d={g.stairMass} fill="url(#anavasis-tread)" />
        {g.stair.map((s, i) => (
          <g key={i}>
            <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="#2B2418" opacity={0.5} />
            <rect x={s.x} y={s.y - 2.2} width={s.w} height={2.2} fill="#F6F0DE" opacity={0.75} />
          </g>
        ))}

        {/* torch pairs beside the stair */}
        {g.torches.map((t, i) => (
          <g key={i}>
            <circle className="anavasis-glow" cx={t.x} cy={t.y} r={80} fill="url(#anavasis-torch)" opacity={0.7} />
            <rect x={t.x - 2.5} y={t.y + 4} width={5} height={42} fill="#2A2218" />
            <ellipse className="anavasis-flame" cx={t.x} cy={t.y - 1} rx={7} ry={12} fill="#FFD98A" />
          </g>
        ))}

        {/* drifting mist across the rock */}
        <g className="anavasis-mist" opacity={0.1}>
          <ellipse cx={380} cy={430} rx={330} ry={26} fill="#EDE6D6" />
          <ellipse cx={900} cy={470} rx={300} ry={22} fill="#EDE6D6" />
        </g>
        <g className="anavasis-mist" opacity={0.07} style={{ animationDelay: '-13s' }}>
          <ellipse cx={700} cy={330} rx={360} ry={24} fill="#EDE6D6" />
        </g>

        <rect width={1280} height={720} fill="url(#anavasis-vig)" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Climbers - the players on the stair. No SophistsRow reuse: positions are
// lane fractions of the narrowing stair (LANE_F), not a fixed bottom band,
// and NO digits are ever shown here (a step is not a score).
// ---------------------------------------------------------------------------
const HIMATION_HUES = ['#C9B7A0', '#9FB2C2', '#C2A08F', '#A8B29A', '#B7A6C4'];

// Task 192 - the climb's per-round frame alternation: Frame A (CLIMB_QUESTION)
// is a motionless read, Frame B (CLIMB_REVEAL) opens with a still ~800ms beat
// showing each player's up/down arrow on a MOTIONLESS board, then glides
// everyone to their new step over 1400-1600ms. Fallback values per the task
// spec (measured timings differ from the design reference's own numbers).
export const CLIMB_BEAT_MS = 800;
export const CLIMB_GLIDE_MS = 1500;

const CLIMBERS_STYLE_TAG = `
.anavasis-climbers-root{position:fixed;inset:0;container-type:size;pointer-events:none;z-index:2}
.anavasis-soph{position:absolute;width:8cqh;text-align:center;transform:translateX(-50%);
  transition:left ${CLIMB_GLIDE_MS}ms cubic-bezier(.4,0,.2,1),bottom ${CLIMB_GLIDE_MS}ms cubic-bezier(.35,0,.25,1.12),opacity 600ms;}
.anavasis-soph svg.fig{width:100%;height:9.2cqh;display:block;overflow:visible;filter:drop-shadow(-.45cqh .25cqh .4cqh rgba(0,0,0,.55))}
.anavasis-soph .nm{display:inline-block;background:var(--marble);color:var(--carve);font-size:1.6cqh;font-weight:700;
  letter-spacing:.05em;padding:.35cqh .7cqh .25cqh;margin-top:.2cqh;
  clip-path:polygon(3% 0,97% 0,100% 12%,100% 88%,97% 100%,3% 100%,0 88%,0 12%);box-shadow:0 .4cqh .9cqh rgba(0,0,0,.5)}
.anavasis-soph .dl{position:absolute;left:0;right:0;top:-2.8cqh;font-size:2.6cqh;font-weight:800;color:var(--ember);
  opacity:0;transition:opacity 300ms;text-shadow:0 2px 8px rgba(0,0,0,.85)}
.anavasis-soph .dl.on{opacity:1}
.anavasis-soph.win .nm{background:linear-gradient(180deg,#F5EFE0,var(--marble));color:var(--wine)}
.anavasis-soph.faded{opacity:.45}
.anavasis-soph.hidden{opacity:0}
@media (prefers-reduced-motion:reduce){.anavasis-soph{transition:none}}
`;

function ClimberFigure({ joinIndex }: { joinIndex: number }) {
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

function formatClimbDelta(delta: number): string {
  return delta > 0 ? '↑'.repeat(Math.min(2, delta)) : '↓'.repeat(Math.min(2, Math.abs(delta)));
}

export interface AnavasisClimberData {
  playerId: string;
  name: string;
  joinIndex: number;
  step: number;
  delta?: number | null;
  isLeader?: boolean;
  // Task 205 - true from the reveal that struck this climber out onward.
  // HostScreen feeds it into hiddenPlayerIds (the same fade the live duel
  // already uses) and, since climbSteps drops an eliminated player from
  // every payload one round later, this flag - and the climber itself -
  // simply stop being fed to this component's `climbers` prop after that.
  eliminated?: boolean;
}

interface AnavasisClimbersProps {
  climbers: AnavasisClimberData[];
  top: number;
  // Duelists are shown by AnavasisDuel instead, while their duel is live.
  hiddenPlayerIds?: readonly string[];
  // Everyone but the winner fades once the game is over.
  fadeExcept?: string | null;
  // Task 192 - identifies the LIVE reveal round (e.g. String(roundIndex)),
  // null whenever no reveal is in flight (CLIMB_QUESTION, the duel, GAME_OVER
  // holding the last positions). Changing to a NEW non-null value is what
  // starts the beat-then-glide sequence below; every other prop change
  // (a re-render with the same round, or the null state) applies at once.
  revealKey?: string | null;
  // Task 227 - the fixed lane count laneLeftPct spreads `joinIndex` across.
  // MUST be the total number of distinct climbers this climb has ever
  // seen, never the current (possibly elimination-shrunk) `climbers.length`
  // - the caller (HostScreen) is the one holding that count, since it's the
  // one assigning stable per-playerId lanes in the first place. Falls back
  // to climbers.length only for a caller with no such count to give.
  totalClimbers?: number;
}

// Holds `climbers` positions back by CLIMB_BEAT_MS whenever `revealKey`
// changes to a genuinely new round, then releases them together (the glide),
// clearing `moving` once the CSS transition (CLIMB_GLIDE_MS) has finished -
// the same "hold the old state, then commit" shape SophistsRow's own
// useDisplayOrder uses for its settle-then-glide reorder, just timed for the
// climb's read-then-move rhythm instead of a score tween.
function useClimbMovement(
  climbers: AnavasisClimberData[],
  revealKey: string | null,
): { displayed: AnavasisClimberData[]; moving: boolean } {
  const [displayed, setDisplayed] = useState(climbers);
  const [moving, setMoving] = useState(false);
  const lastKeyRef = useRef(revealKey);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    // No new reveal round in flight (climb entry, the duel holding last
    // positions, GAME_OVER's crowning) - OR a fresh mount landing mid-round
    // (a host reload during a live CLIMB_REVEAL, where revealKey and its
    // ref's own initial value are the SAME thing): either way, apply the
    // target positions at once rather than replaying a beat/glide that may
    // already be over.
    if (revealKey === null || revealKey === lastKeyRef.current) {
      lastKeyRef.current = revealKey;
      setDisplayed(climbers);
      return;
    }
    lastKeyRef.current = revealKey;
    timersRef.current.forEach(window.clearTimeout);
    const beatTimer = window.setTimeout(() => {
      setDisplayed(climbers);
      setMoving(true);
      const glideTimer = window.setTimeout(() => setMoving(false), CLIMB_GLIDE_MS);
      timersRef.current.push(glideTimer);
    }, CLIMB_BEAT_MS);
    timersRef.current = [beatTimer];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `climbers` is read
    // from the closure at schedule time deliberately: only a genuinely NEW
    // revealKey should restart this sequence, never a re-render that leaves
    // the round unchanged (the countdown ticks the parent every second).
  }, [revealKey]);

  useEffect(() => () => timersRef.current.forEach(window.clearTimeout), []);

  // Task 225 - with no reveal in flight (climb entry, a duel, GAME_OVER)
  // there is no beat-then-glide to sequence, so the CURRENT props are what
  // must paint. The effect above only re-runs on a NEW revealKey, so a
  // `climbers` list that changes while revealKey stays null kept painting
  // the previous round's positions - which is exactly what GAME_OVER does,
  // since PHASE_CHANGED lands one render BEFORE the game_over payload (the
  // house pattern): render 1 has no standings yet, render 2 has them and
  // never reached this state. The winner was left standing on whatever step
  // the last reveal left them on instead of the temple.
  return { displayed: revealKey === null ? climbers : displayed, moving };
}

export function AnavasisClimbers({
  climbers,
  top,
  hiddenPlayerIds = [],
  fadeExcept = null,
  revealKey = null,
  totalClimbers,
}: AnavasisClimbersProps) {
  const { displayed, moving } = useClimbMovement(climbers, revealKey);
  const displayedById = new Map(displayed.map((c) => [c.playerId, c]));
  const n = totalClimbers ?? climbers.length;
  return (
    <div className="anavasis-climbers-root" aria-hidden="true" data-testid="anavasis-climbers" data-moving={moving}>
      <style>{CLIMBERS_STYLE_TAG}</style>
      {climbers.map((climber) => {
        const shown = displayedById.get(climber.playerId) ?? climber;
        const visualStep = visualStepFor(shown.step, top);
        const hidden = hiddenPlayerIds.includes(climber.playerId);
        const faded = fadeExcept !== null && climber.playerId !== fadeExcept;
        // Task 192 - the invariant for this whole scene: zero visible text
        // while a figure is in motion. The arrow (from the TARGET data,
        // shown from the still beat onward) and the name plaque both blank
        // for the glide's duration, not merely hide - see the task's own
        // "blank or hide the text for the glide".
        const showDelta = !moving && climber.delta !== undefined && climber.delta !== null && climber.delta !== 0;
        const className = ['anavasis-soph', climber.isLeader ? 'win' : '', faded ? 'faded' : '', hidden ? 'hidden' : '']
          .filter(Boolean)
          .join(' ');
        return (
          <div
            key={climber.playerId}
            className={className}
            style={{ bottom: `${stepBottomCqh(visualStep)}cqh`, left: `${laneLeftPct(climber.joinIndex, n, visualStep)}%` }}
            data-testid="anavasis-climber"
            data-player-id={climber.playerId}
            data-step={shown.step}
            // Task 227 - the STABLE lane, for verification: `left`'s pixel
            // value legitimately shifts round to round even for a player who
            // never changes lane, because the stair narrows with height
            // (stepWidthPct scales the offset) - this is the value that must
            // never change while a player is on the stair.
            data-lane={climber.joinIndex}
          >
            <div className={showDelta ? 'dl on' : 'dl'} data-testid="anavasis-climber-delta">
              {showDelta ? formatClimbDelta(climber.delta as number) : ''}
            </div>
            <ClimberFigure joinIndex={climber.joinIndex} />
            <div className="nm" data-testid="anavasis-climber-name">
              {moving ? '' : greekUpper(shown.name)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The duel - Η Μονομαχία. Two large duelists, face-down tablets that flip on
// reveal, a verdict line, tie count.
// ---------------------------------------------------------------------------
const WEAPON_PATHS: Record<DuelWeapon, ReactNode> = {
  xifos: (
    <g stroke="var(--carve)" strokeLinecap="round" fill="var(--carve)">
      <path d="M20 8 L34 22 L44 44 L40 48 L18 38 L8 20 Z" strokeWidth={2} opacity={0.92} />
      <path d="M38 42 L48 52" strokeWidth={5} fill="none" />
      <path d="M42 54 L54 46" strokeWidth={4} fill="none" />
      <circle cx={55} cy={53} r={3.4} />
    </g>
  ),
  dory: (
    <g stroke="var(--carve)" strokeLinecap="round">
      <path d="M14 46 L46 14" strokeWidth={4} />
      <path d="M46 14 L54 2 L58 10 L50 18 Z" fill="var(--carve)" strokeWidth={1.5} />
      <path d="M14 46 L8 56" strokeWidth={3} />
    </g>
  ),
  aspida: (
    <g>
      <circle cx={30} cy={30} r={23} fill="none" stroke="var(--carve)" strokeWidth={4.5} />
      <circle cx={30} cy={30} r={15} fill="none" stroke="var(--carve)" strokeWidth={1.8} opacity={0.55} />
      <circle cx={30} cy={30} r={6.5} fill="var(--carve)" />
    </g>
  ),
};

// Exported for ControllerScreen's DUEL_PICK weapon slabs (Task 190) - same
// icon, same --carve-on-marble reading, so the phone's picker and the TV's
// duel tablets never drift into two different weapon glyphs.
export function WeaponIcon({ weapon }: { weapon: DuelWeapon }) {
  return (
    <svg viewBox="0 0 60 60" width="60%" height="60%" aria-hidden="true">
      {WEAPON_PATHS[weapon]}
    </svg>
  );
}

const DUEL_STYLE_TAG = `
.anavasis-duel-root{position:fixed;inset:0;container-type:size;z-index:4;pointer-events:none}
.anavasis-duel-scrim{position:absolute;inset:0;background:radial-gradient(ellipse 70% 80% at 50% 62%,rgba(7,12,24,.2),rgba(7,12,24,.8))}
.anavasis-duelist{position:absolute;bottom:9cqh;width:17cqh;text-align:center}
.anavasis-duelist svg.fig{width:100%;height:27cqh;overflow:visible;filter:drop-shadow(-.8cqh .4cqh .7cqh rgba(0,0,0,.6))}
.anavasis-duelist--b svg.fig{transform:scaleX(-1)}
.anavasis-duelist .nm{display:inline-block;background:var(--marble);color:var(--carve);font-size:2.5cqh;font-weight:800;
  letter-spacing:.06em;padding:.7cqh 1.4cqh .5cqh;margin-top:.5cqh;
  clip-path:polygon(3% 0,97% 0,100% 12%,100% 88%,97% 100%,3% 100%,0 88%,0 12%)}
.anavasis-tablet{position:absolute;top:-12.5cqh;left:50%;transform:translateX(-50%);width:10.5cqh;height:10.5cqh;perspective:600px}
.anavasis-tablet .card{position:absolute;inset:0;transform-style:preserve-3d;transition:transform 700ms cubic-bezier(.3,0,.2,1.1)}
.anavasis-tablet.open .card{transform:rotateY(180deg)}
.anavasis-face{position:absolute;inset:0;backface-visibility:hidden;display:grid;place-items:center;
  clip-path:polygon(1.5% 0,98.5% .6%,100% 3%,99.4% 97%,98% 100%,2% 99.4%,0 96%,.6% 3%);box-shadow:0 1.4cqh 2.4cqh rgba(0,0,0,.6)}
.anavasis-face--back{background:linear-gradient(160deg,#3A3140,#241E2C)}
.anavasis-face--back::after{content:"?";font-family:"Gentium Book Plus",Georgia,serif;font-size:6cqh;font-weight:700;color:var(--marble-3)}
.anavasis-face--front{background:var(--marble);transform:rotateY(180deg)}
.anavasis-duelist--won .anavasis-face--front{background:linear-gradient(180deg,#F5EFE0,var(--marble));outline:.45cqh solid var(--olive)}
.anavasis-duelist--lost{opacity:.4;transition:opacity 500ms 900ms}
.anavasis-verdict{position:absolute;left:0;right:0;top:4cqh;text-align:center;font-family:"Gentium Book Plus",Georgia,serif;
  font-size:4.6cqh;font-weight:700;color:var(--marble);text-shadow:0 .5cqh 2.5cqh rgba(0,0,0,.9);opacity:0;transition:opacity 400ms 1s}
.anavasis-duel-root.reveal .anavasis-verdict{opacity:1}
.anavasis-tiecount{position:absolute;left:0;right:0;top:0.5cqh;text-align:center;font-size:2.4cqh;font-weight:700;
  color:var(--ember);letter-spacing:.1em}
.anavasis-picked{position:absolute;top:-3cqh;left:50%;transform:translateX(-50%);font-size:2.4cqh}
@media (prefers-reduced-motion:reduce){.anavasis-tablet .card{transition:none}}
`;

export interface AnavasisDuelistData {
  playerId: string;
  name: string;
  joinIndex: number;
}

interface AnavasisDuelProps {
  a: AnavasisDuelistData;
  b: AnavasisDuelistData;
  // Reveal-only. null while picking, or for whichever side hasn't locked yet.
  weaponA?: DuelWeapon | null;
  weaponB?: DuelWeapon | null;
  pickedA?: boolean;
  pickedB?: boolean;
  revealed: boolean;
  tie?: boolean;
  tieCount: number;
  winnerPlayerId?: string | null;
}

export function AnavasisDuel({ a, b, weaponA = null, weaponB = null, pickedA = false, pickedB = false, revealed, tie = false, tieCount, winnerPlayerId = null }: AnavasisDuelProps) {
  const verdict = !revealed
    ? ''
    : buildDuelVerdictLine({ weaponA, weaponB, tie, winnerPlayerId, aPlayerId: a.playerId, aName: a.name, bName: b.name });
  return (
    <div className={revealed ? 'anavasis-duel-root reveal' : 'anavasis-duel-root'} aria-hidden="true" data-testid="anavasis-duel">
      <style>{DUEL_STYLE_TAG}</style>
      <div className="anavasis-duel-scrim" />
      {tieCount > 0 && <div className="anavasis-tiecount">Ξανά ×{tieCount}</div>}
      <Duelist side="a" data={a} weapon={weaponA} picked={pickedA} revealed={revealed} won={revealed && winnerPlayerId === a.playerId} lost={revealed && !tie && winnerPlayerId !== null && winnerPlayerId !== a.playerId} />
      <Duelist side="b" data={b} weapon={weaponB} picked={pickedB} revealed={revealed} won={revealed && winnerPlayerId === b.playerId} lost={revealed && !tie && winnerPlayerId !== null && winnerPlayerId !== b.playerId} />
      <div className="anavasis-verdict" data-testid="anavasis-duel-verdict">
        {verdict}
      </div>
    </div>
  );
}

function Duelist({
  side,
  data,
  weapon,
  picked,
  revealed,
  won,
  lost,
}: {
  side: 'a' | 'b';
  data: AnavasisDuelistData;
  weapon: DuelWeapon | null;
  picked: boolean;
  revealed: boolean;
  won: boolean;
  lost: boolean;
}) {
  const left = side === 'a' ? '29%' : '71%';
  const className = ['anavasis-duelist', side === 'b' ? 'anavasis-duelist--b' : '', won ? 'anavasis-duelist--won' : '', lost ? 'anavasis-duelist--lost' : ''].filter(Boolean).join(' ');
  const tabletClassName = revealed ? 'anavasis-tablet open' : 'anavasis-tablet';
  return (
    <div className={className} style={{ left, transform: 'translateX(-50%)' }} data-testid={`anavasis-duelist-${side}`}>
      <div className={tabletClassName}>
        <div className="card">
          <div className="anavasis-face anavasis-face--back" />
          <div className="anavasis-face anavasis-face--front">{weapon && <WeaponIcon weapon={weapon} />}</div>
        </div>
      </div>
      {!revealed && <div className="anavasis-picked" data-testid={`anavasis-duelist-${side}-picked`}>{picked ? '✓' : ''}</div>}
      <ClimberFigure joinIndex={data.joinIndex} />
      <div className="nm">{greekUpper(data.name)}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The crowning - GAME_OVER for the climb. The winner steps into the temple
// beside Socrates; the wreath descends, leaves fall. NO digits (isTrialResult
// gates the whole finale, climb included).
// ---------------------------------------------------------------------------
const CROWNING_STYLE_TAG = `
.anavasis-crown-root{position:fixed;inset:0;container-type:size;z-index:5;pointer-events:none;overflow:hidden}
.anavasis-crown-text{position:absolute;left:4.5%;top:13cqh;text-align:left;width:36cqw}
.anavasis-crown-n{font-size:2.8cqh;letter-spacing:.35em;text-transform:uppercase;color:var(--ember);font-weight:700}
.anavasis-crown-t{font-family:"Gentium Book Plus",Georgia,serif;font-size:10.5cqh;font-weight:700;line-height:1;
  color:var(--marble);margin-top:.6cqh;text-shadow:0 .6cqh 3cqh rgba(0,0,0,.8)}
.anavasis-crown-r{font-size:3.1cqh;color:var(--marble-2);margin-top:2cqh;max-width:22ch;text-shadow:0 2px 10px rgba(0,0,0,.8)}
.anavasis-wreath{position:absolute;width:10cqh;height:4.6cqh;transform:translateX(-50%);opacity:.95}
.anavasis-crown-leaves{position:absolute;inset:0}
.anavasis-crown-leaf{position:absolute;top:-6cqh;width:2.6cqh;height:1cqh;background:var(--olive);border-radius:50%;opacity:0;
  animation-name:anavasis-leaf-fall;animation-timing-function:linear;animation-fill-mode:forwards}
@keyframes anavasis-leaf-fall{to{transform:translate(var(--dx),110cqh) rotate(540deg);opacity:.9}}
@media (prefers-reduced-motion:reduce){.anavasis-crown-leaf{display:none}}
`;

const CROWNING_LEAF_COUNT = 50;
const CROWNING_LEAVES = Array.from({ length: CROWNING_LEAF_COUNT }, (_, i) => {
  const left = (i * 37) % 100;
  const dx = (((i * 53) % 200) - 100) / 10;
  const duration = 4 + ((i * 17) % 40) / 10;
  const delay = ((i * 29) % 300) / 100;
  return { id: i, style: { left: `${left}%`, '--dx': `${dx}cqh`, animationDuration: `${duration}s`, animationDelay: `${delay}s` } as CSSVars };
});

interface AnavasisCrowningProps {
  winnerName: string;
  winnerLeft: number; // the winner climber's own `left` %, so the wreath lands right above them
}

export function AnavasisCrowning({ winnerName, winnerLeft }: AnavasisCrowningProps) {
  return (
    <div className="anavasis-crown-root screen-fade-in" aria-hidden="true" data-testid="anavasis-crowning">
      <style>{CROWNING_STYLE_TAG}</style>
      <div className="anavasis-crown-leaves">
        {CROWNING_LEAVES.map((leaf) => (
          <div key={leaf.id} className="anavasis-crown-leaf" style={leaf.style} />
        ))}
      </div>
      <svg
        className="anavasis-wreath"
        viewBox="0 0 90 40"
        style={{ left: `${winnerLeft}%`, bottom: `${ANAVASIS_TEMPLE_BOTTOM_CQH + 9.4}cqh` }}
        data-testid="anavasis-wreath"
      >
        <path d="M45 34 Q10 30 6 8 Q30 6 45 34 Q60 6 84 8 Q80 30 45 34" fill="none" stroke="var(--olive)" strokeWidth={3} />
        <g fill="var(--olive)">
          <ellipse cx={18} cy={18} rx={7} ry={3} transform="rotate(-40 18 18)" />
          <ellipse cx={30} cy={26} rx={7} ry={3} transform="rotate(-30 30 26)" />
          <ellipse cx={72} cy={18} rx={7} ry={3} transform="rotate(40 72 18)" />
          <ellipse cx={60} cy={26} rx={7} ry={3} transform="rotate(30 60 26)" />
        </g>
      </svg>
      <div className="anavasis-crown-text">
        <div className="anavasis-crown-n">{greekUpper('Ο μαθητής')}</div>
        <div className="anavasis-crown-t" data-testid="anavasis-winner-banner">
          {winnerName}
        </div>
        <div className="anavasis-crown-r">Ανέβηκε ως τον ναό. Η πόλη, από κάτω, το είδε.</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chrome - the room code corner + pause overlay every in-game phase gets from
// GameLayout. The four climb/duel views bypass GameLayout entirely (no read
// column, no gap-by-player-count - the whole scene is the layout), so they
// render this instead of GameLayout to keep the same two fixed pieces.
// ---------------------------------------------------------------------------
interface AnavasisChromeProps {
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
}

export function AnavasisChrome({ roomCode, paused, pausedByName }: AnavasisChromeProps) {
  return (
    <>
      {roomCode && (
        <div style={hostStyles.cornerRoomCode} data-testid="corner-room-code">
          {roomCode}
        </div>
      )}
      {paused && (
        <div style={hostStyles.pauseOverlay} data-testid="pause-overlay">
          <div style={hostStyles.pauseTitle}>ΠΑΥΣΗ</div>
          <div style={hostStyles.pauseSubtitle}>Ο/Η {pausedByName} έκανε παύση</div>
        </div>
      )}
    </>
  );
}

export { stepBottomCqh, laneLeftPct, visualStepFor, VISUAL_STEPS };
