import type { CSSProperties, ReactNode } from 'react';
import { AGORA_COLOURS, type AgoraRenderSpec, type AgoraStall, type AgoraSubject } from '@game/shared';

// Task 208 - Η Μνήμη της Αγοράς's own backdrop, TheatreScene's sibling for
// the three agora phases (AGORA_EXPOSE/AGORA_QUESTION/AGORA_REVEAL). Built
// from design/agora-reference.html (the SVG there is the spec, same role
// that file plays for TheatreScene) - the coordinate system below is the
// reference's OWN 1600x900, copied verbatim rather than rescaled onto
// TheatreScene's 1280x720: a viewBox is resolution-independent (the <svg>
// itself is sized by CSS), so there is no reason to rework every literal
// pixel offset in drawGoods/drawDog/etc onto a different internal scale.
// Scene ART only - raw hex is allowed inside this SVG, the same exception
// TheatreScene/AnavasisScene/SocratesFigure already use.
//
// TWO LAYERS, exactly as the task requires. The sky (stars, moon, distant
// Acropolis) is STATIC geometry, built once at module load - like
// TheatreScene's own crowd - and stays visible, full brightness, through
// every agora phase, AGORA_QUESTION included: nothing here ever dims it.
// The market group (stalls, torches, ground, animals) is drawn fresh from
// `spec` every render and is the ONLY thing the fairness rule hides: when
// `marketVisible` is false its whole <g> simply ISN'T RENDERED (no opacity
// trick, no display:none) - a DOM query for it during AGORA_QUESTION finds
// zero nodes, not a hidden one.
//
// Nothing here calls Math.random, and nothing is seeded from the round at
// all: the sky is fixed forever, and the market's own layout (which of the
// 3 fixed slots a stall sits in, how many goods, which animals) comes
// straight from `spec` with no randomised placement of its own - so a
// reconnect's redraw is byte-for-byte identical to the first render by
// construction, with no seed of any kind to thread through.

const W = 1600;
const H = 900;

// The reference's own decor-only LCG (design/agora-reference.html's
// mulberry32), fixed at a constant never touched by a round's own data -
// this draws the star field ONCE, forever, the same way TheatreScene's
// makeRng(17) draws its crowd once, forever.
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Star {
  cx: number;
  cy: number;
  r: number;
  opacity: number;
  delay: number;
}

function buildStars(): Star[] {
  const rnd = makeRng(0x9e3779b9);
  return Array.from({ length: 70 }, () => ({
    cx: rnd() * W,
    cy: rnd() * H * 0.4,
    r: rnd() < 0.85 ? 1.3 : 2.2,
    opacity: 0.3 + rnd() * 0.6,
    delay: -rnd() * 3,
  }));
}

// Computed once at module load - identical on every mount, never touched by
// a round's spec.
const STARS = buildStars();

const SLOT_X_FRAC = [0.185, 0.5, 0.815] as const;
const STALL_W = W * 0.26;

function colourHex(colourId: AgoraStall['colour']): string {
  return AGORA_COLOURS.find((c) => c.id === colourId)?.hex ?? '#8E2440';
}

// design/agora-reference.html's ring() - the ONE highlight shape an animal
// gets, gold, stroke-only. A stall's own highlight is an outline rect drawn
// inline where the stall itself is (see renderStall) rather than a ring,
// exactly like the reference.
function AnimalRing({ x, y, r }: { x: number; y: number; r: number }) {
  return <circle data-testid="agora-highlight" cx={x} cy={y} r={r} fill="none" stroke="#FFD98A" strokeWidth={5} />;
}

function drawGoods(stall: AgoraStall, x: number, ty: number, w: number): ReactNode[] {
  const n = stall.count;
  const pad = 55;
  const step = n > 1 ? (w - 2 * pad) / (n - 1) : 0;
  const items: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const gx = x + pad + (n === 1 ? w / 2 - pad : i * step);
    const gy = ty;
    const key = `${stall.type}-${i}`;
    if (stall.type === 'amphorae') {
      items.push(
        <g key={key} data-testid="agora-good" data-good-type="amphorae">
          <path
            d={`M${gx - 6} ${gy} L${gx + 6} ${gy} L${gx + 16} ${gy - 28} Q${gx + 20} ${gy - 58} ${gx + 9} ${gy - 74} L${gx - 9} ${gy - 74} Q${gx - 20} ${gy - 58} ${gx - 16} ${gy - 28} Z`}
            fill="#B98A5E"
            stroke="#6e4c2e"
            strokeWidth={3}
          />
          <rect x={gx - 11} y={gy - 86} width={22} height={12} fill="#8a6644" />
          <path
            d={`M${gx - 15} ${gy - 74} q-13 10 -2 22 M${gx + 15} ${gy - 74} q13 10 2 22`}
            stroke="#8a6644"
            strokeWidth={5}
            fill="none"
          />
        </g>,
      );
    } else if (stall.type === 'fish') {
      items.push(
        <g key={key} data-testid="agora-good" data-good-type="fish">
          <path
            d={`M${gx - 26} ${gy - 34} Q${gx} ${gy - 58} ${gx + 18} ${gy - 34} Q${gx} ${gy - 12} ${gx - 26} ${gy - 34} Z`}
            fill="#BFE6FF"
            stroke="#5f7d96"
            strokeWidth={3}
          />
          <path
            d={`M${gx + 18} ${gy - 34} L${gx + 34} ${gy - 46} L${gx + 34} ${gy - 22} Z`}
            fill="#BFE6FF"
            stroke="#5f7d96"
            strokeWidth={3}
          />
          <circle cx={gx - 16} cy={gy - 38} r={3} fill="#13213D" />
        </g>,
      );
    } else if (stall.type === 'cloth') {
      items.push(
        <g key={key} data-testid="agora-good" data-good-type="cloth">
          <rect
            x={gx - 16}
            y={gy - 84}
            width={32}
            height={84}
            rx={8}
            fill={i % 2 ? '#C2A08F' : '#8E9BAD'}
            stroke="#544636"
            strokeWidth={3}
          />
          <path
            d={`M${gx - 16} ${gy - 64} h32 M${gx - 16} ${gy - 42} h32 M${gx - 16} ${gy - 20} h32`}
            stroke="rgba(0,0,0,.25)"
            strokeWidth={3}
          />
        </g>,
      );
    } else if (stall.type === 'pottery') {
      items.push(
        <g key={key} data-testid="agora-good" data-good-type="pottery">
          <path
            d={`M${gx - 24} ${gy} Q${gx - 30} ${gy - 34} ${gx} ${gy - 40} Q${gx + 30} ${gy - 34} ${gx + 24} ${gy} Z`}
            fill="#9a6a44"
            stroke="#5f3f26"
            strokeWidth={3}
          />
          <ellipse cx={gx} cy={gy - 40} rx={19} ry={6} fill="#6e462c" />
        </g>,
      );
    } else {
      items.push(
        <g key={key} data-testid="agora-good" data-good-type="fruit">
          <path
            d={`M${gx - 28} ${gy - 26} Q${gx} ${gy + 4} ${gx + 28} ${gy - 26} L${gx + 22} ${gy - 2} Q${gx} ${gy + 14} ${gx - 22} ${gy - 2} Z`}
            fill="#8a6a3c"
            stroke="#54401f"
            strokeWidth={3}
          />
          {[0, 1, 2, 3, 4].map((f) => (
            <circle key={f} cx={gx - 16 + f * 8} cy={gy - 26} r={8} fill={f % 2 ? '#8E2440' : '#9AA860'} stroke="#3a2a10" strokeWidth={2} />
          ))}
        </g>,
      );
    }
  }
  return items;
}

function renderStall(stall: AgoraStall, highlighted: boolean): ReactNode {
  const cx = W * SLOT_X_FRAC[stall.slot];
  const x = cx - STALL_W / 2;
  const y = H * 0.44;
  const ty = H * 0.76;
  const hex = colourHex(stall.colour);
  return (
    <g key={stall.type} data-testid="agora-stall" data-type={stall.type} data-colour={stall.colour} data-count={stall.count}>
      {highlighted && (
        <rect
          data-testid="agora-highlight"
          x={x - 20}
          y={y - 46}
          width={STALL_W + 40}
          height={H * 0.44}
          fill="none"
          stroke="#FFD98A"
          strokeWidth={8}
          rx={18}
        />
      )}
      <rect x={x} y={y + 26} width={18} height={H * 0.36} fill="#3A2E1E" />
      <rect x={x + STALL_W - 18} y={y + 26} width={18} height={H * 0.36} fill="#3A2E1E" />
      <path d={`M${x - 20} ${y + 30} L${cx} ${y - 42} L${x + STALL_W + 20} ${y + 30} Z`} fill={hex} />
      <path
        d={`M${x - 20} ${y + 30} L${x + STALL_W + 20} ${y + 30} L${x + STALL_W + 12} ${y + 52} L${x - 12} ${y + 52} Z`}
        fill={hex}
        opacity={0.75}
      />
      <rect x={x - 10} y={ty} width={STALL_W + 20} height={20} fill="#5A4426" />
      <rect x={x + 6} y={ty + 20} width={14} height={H * 0.1} fill="#3A2E1E" />
      <rect x={x + STALL_W - 20} y={ty + 20} width={14} height={H * 0.1} fill="#3A2E1E" />
      {drawGoods(stall, x, ty, STALL_W)}
    </g>
  );
}

function DogFigure({ x, y, highlighted }: { x: number; y: number; highlighted: boolean }) {
  const C = '#A07A54';
  return (
    <g data-testid="agora-animal" data-kind="dog">
      {highlighted && <AnimalRing x={x} y={y - 18} r={52} />}
      <ellipse cx={x} cy={y - 16} rx={34} ry={15} fill={C} />
      <circle cx={x + 32} cy={y - 30} r={11} fill={C} />
      <path d={`M${x + 40} ${y - 30} l14 4 l-14 5 Z`} fill={C} />
      <path d={`M${x + 26} ${y - 39} l4 -11 l6 9 Z`} fill={C} />
      {[-24, -8, 8, 24].map((dx) => (
        <rect key={dx} x={x + dx} y={y - 6} width={6} height={19} fill={C} />
      ))}
      <path d={`M${x - 32} ${y - 20} q-14 -4 -12 -24`} stroke={C} strokeWidth={6} fill="none" />
    </g>
  );
}

function GoatFigure({ x, y, highlighted }: { x: number; y: number; highlighted: boolean }) {
  const C = '#CFC5B0';
  return (
    <g data-testid="agora-animal" data-kind="goat">
      {highlighted && <AnimalRing x={x} y={y - 18} r={48} />}
      <ellipse cx={x} cy={y - 16} rx={28} ry={15} fill={C} />
      <circle cx={x - 26} cy={y - 30} r={9} fill={C} />
      <path d={`M${x - 30} ${y - 38} q-8 -10 -2 -16`} stroke={C} strokeWidth={4} fill="none" />
      <path d={`M${x - 24} ${y - 38} q0 -12 8 -14`} stroke={C} strokeWidth={4} fill="none" />
      {[-18, -4, 10, 22].map((dx) => (
        <rect key={dx} x={x + dx} y={y - 4} width={5} height={17} fill={C} />
      ))}
      <path d={`M${x - 26} ${y - 22} q-2 8 2 10`} stroke="#8F8672" strokeWidth={3} fill="none" />
    </g>
  );
}

function GooseFigure({ x, y, highlighted }: { x: number; y: number; highlighted: boolean }) {
  return (
    <g data-testid="agora-animal" data-kind="geese">
      {highlighted && <AnimalRing x={x} y={y - 12} r={26} />}
      <ellipse cx={x} cy={y - 8} rx={14} ry={9} fill="#EDE6D6" />
      <path d={`M${x + 10} ${y - 12} q4 -14 -2 -18`} stroke="#EDE6D6" strokeWidth={5} fill="none" />
      <circle cx={x + 7} cy={y - 30} r={5} fill="#EDE6D6" />
      <path d={`M${x + 11} ${y - 30} l8 2 l-8 3 Z`} fill="#E8A14A" />
      <rect x={x - 3} y={y} width={3} height={9} fill="#E8A14A" />
      <rect x={x + 3} y={y} width={3} height={9} fill="#E8A14A" />
    </g>
  );
}

function CatFigure({ x, y, highlighted }: { x: number; y: number; highlighted: boolean }) {
  return (
    <g data-testid="agora-animal" data-kind="cat">
      {highlighted && <AnimalRing x={x} y={y - 10} r={32} />}
      <ellipse cx={x} cy={y - 6} rx={18} ry={10} fill="#8F8672" />
      <circle cx={x - 16} cy={y - 16} r={8} fill="#8F8672" />
      <path d={`M${x - 21} ${y - 22} l-2 -8 l6 4 Z M${x - 13} ${y - 23} l0 -8 l6 6 Z`} fill="#8F8672" />
      <path d={`M${x + 16} ${y - 8} q14 -4 10 -18`} stroke="#8F8672" strokeWidth={4} fill="none" />
    </g>
  );
}

const TORCH_X_FRAC = [0.05, 0.3425, 0.6575, 0.95] as const;
const GLOW_X_FRAC = [0.185, 0.5, 0.815] as const;
const ANIMAL_AY = H * 0.955;

interface MarketProps {
  spec: AgoraRenderSpec;
  highlight: AgoraSubject | null;
}

function isStallHighlighted(highlight: AgoraSubject | null, type: string): boolean {
  return !!highlight && highlight.present && highlight.kind === 'stall' && highlight.type === type;
}

function isAnimalHighlighted(highlight: AgoraSubject | null, kind: string): boolean {
  return !!highlight && highlight.present && highlight.kind === 'animal' && highlight.animal === kind;
}

// The market group - stalls, torches, ground, animals - drawn fresh from
// `spec` every render. Rendered ONLY when the fairness rule allows it (see
// AgoraScene below): this component is never mounted at all during
// AGORA_QUESTION, so there is nothing to hide, only something to not render.
function Market({ spec, highlight }: MarketProps) {
  return (
    <g data-testid="agora-market">
      <rect x={0} y={H * 0.645} width={W} height={H * 0.355} fill="url(#agora-ground)" />
      <rect x={0} y={H * 0.645} width={W} height={14} fill="#5A4830" />
      {GLOW_X_FRAC.map((fx, i) => (
        <ellipse key={i} cx={W * fx} cy={H * 0.72} rx={W * 0.17} ry={H * 0.26} fill="url(#agora-glow)" />
      ))}
      {spec.stalls.map((stall) => renderStall(stall, isStallHighlighted(highlight, stall.type)))}
      {TORCH_X_FRAC.map((fx, i) => {
        const x = W * fx;
        const y = H * 0.62;
        return (
          <g key={i}>
            <rect x={x - 5} y={y} width={10} height={H * 0.26} fill="#3A2E1E" />
            <ellipse cx={x} cy={y - 16} rx={15} ry={26} fill="#E8A14A" />
            <ellipse cx={x} cy={y - 22} rx={8} ry={14} fill="#FFD98A" />
          </g>
        );
      })}
      {spec.animals.dog && <DogFigure x={W * 0.13} y={ANIMAL_AY - 6} highlighted={isAnimalHighlighted(highlight, 'dog')} />}
      {spec.animals.goat && <GoatFigure x={W * 0.6} y={ANIMAL_AY - 10} highlighted={isAnimalHighlighted(highlight, 'goat')} />}
      {spec.animals.cat && <CatFigure x={W * 0.925} y={ANIMAL_AY - 14} highlighted={isAnimalHighlighted(highlight, 'cat')} />}
      {Array.from({ length: spec.animals.geeseN }, (_, i) => (
        <GooseFigure
          key={i}
          x={W * (0.33 + i * 0.05)}
          y={ANIMAL_AY + (i % 2 === 1 ? -10 : 0)}
          highlighted={isAnimalHighlighted(highlight, 'geese')}
        />
      ))}
    </g>
  );
}

interface AgoraSceneProps {
  // Fully absent (no <g>) during AGORA_QUESTION - the fairness rule (Task
  // 207/208: the market is closed while a question is live). Present, with
  // no highlight, during AGORA_EXPOSE. Present WITH a highlight during
  // AGORA_REVEAL's proof beat, once the reveal slab has left the screen -
  // see AgoraRevealView's own two-stage timing, driven by HostScreen.
  spec: AgoraRenderSpec | null;
  highlight: AgoraSubject | null;
}

const rootStyle: CSSProperties = { position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 };
const svgStyle: CSSProperties = { width: '100%', height: '100%', display: 'block' };

export function AgoraScene({ spec, highlight }: AgoraSceneProps) {
  return (
    <div style={rootStyle} aria-hidden="true" data-agora-scene="">
      <svg viewBox={`0 0 ${W} ${H}`} style={svgStyle} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="agora-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#070C18" />
            <stop offset="1" stopColor="#13213D" />
          </linearGradient>
          <linearGradient id="agora-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4A3A22" />
            <stop offset="1" stopColor="#2E2416" />
          </linearGradient>
          <radialGradient id="agora-glow">
            <stop offset="0" stopColor="#FFD98A" stopOpacity={0.28} />
            <stop offset="1" stopColor="#FFD98A" stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* Sky layer - static, always visible, never dimmed or hidden. */}
        <rect x={0} y={0} width={W} height={H * 0.645} fill="url(#agora-sky)" />
        <g fill="#F6F0DC">
          {STARS.map((s, i) => (
            <circle key={i} cx={s.cx} cy={s.cy} r={s.r} opacity={s.opacity} />
          ))}
        </g>
        <circle cx={W * 0.86} cy={H * 0.13} r={38} fill="#F6F0DC" opacity={0.92} />
        <circle cx={W * 0.845} cy={H * 0.122} r={34} fill="#0b1226" opacity={0.55} />
        <g transform={`translate(0 ${H * 0.125})`}>
          <path
            d={`M0 ${H * 0.52} L${W * 0.18} ${H * 0.44} L${W * 0.3} ${H * 0.47} L${W * 0.42} ${H * 0.4} L${W * 0.55} ${H * 0.46} L${W * 0.7} ${H * 0.42} L${W} ${H * 0.5} L${W} ${H * 0.52} Z`}
            fill="#0d1428"
          />
          {(() => {
            const tx = W * 0.42;
            const ty = H * 0.335;
            return (
              <>
                {[0, 1, 2, 3, 4, 5].map((c) => (
                  <rect key={c} x={tx - 42 + c * 15} y={ty + 14} width={6} height={34} fill="#232B44" />
                ))}
                <path d={`M${tx - 52} ${ty + 14} L${tx} ${ty - 6} L${tx + 52} ${ty + 14} Z`} fill="#2A3350" />
                <rect x={tx - 52} y={ty + 48} width={104} height={8} fill="#232B44" />
              </>
            );
          })()}
        </g>

        {/* Market layer - the fairness rule's whole subject. Absent (no <g>
            at all) when spec is null. */}
        {spec && <Market spec={spec} highlight={highlight} />}
      </svg>
    </div>
  );
}
