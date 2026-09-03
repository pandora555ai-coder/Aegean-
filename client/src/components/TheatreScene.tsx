import type { CSSProperties } from 'react';
import type { CrowdMood, GamePhase } from '@game/shared';

// Task 158 - the theatre backdrop every /host phase sits in front of. Built
// from design/theatre-reference.html (the SVG/CSS there is the spec). Scene
// ART only: raw hex is allowed inside this SVG, same exception as drawing
// ink - nowhere else in the app.

// The one place that decides whether the scene is lit (Socrates centre
// stage) or dimmed (papyrus speaking) - keyed off phase so no view has to
// repeat this rhythm as a flag of its own. Moved here from the deleted
// SceneLayer (Task 159) since TheatreScene is now the only scene layer.
const LIT_PHASES: ReadonlySet<GamePhase> = new Set([
  'LOBBY',
  'STAGE_ANNOUNCE',
  'SOCRATES',
  'STEAL',
  'GAME_OVER',
]);

export function isSceneLit(phase: GamePhase): boolean {
  return LIT_PHASES.has(phase);
}

interface TheatreSceneProps {
  mood: CrowdMood;
  dimmed: boolean;
}

// Deterministic LCG matching design/theatre-reference.html's rnd() - run
// ONCE at module load, never per-render and never Math.random, so every
// mount (and every viewer's TV) draws the identical crowd, stars and
// foliage.
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

interface CrowdFigure {
  x: number;
  y: number;
  h: number;
  w: number;
  arm: boolean;
}

interface Torch {
  x: number;
  y: number;
}

interface Mote {
  cx: number;
  cy: number;
  r: number;
  duration: number;
  delay: number;
}

interface LeafSpeck {
  x: number;
  y: number;
  rotate: number;
  opacity: number;
}

interface LeafCluster {
  x: number;
  y: number;
  rx: number;
  ry: number;
  leaves: LeafSpeck[];
}

interface TheatreGeometry {
  stars: Star[];
  columns: number[];
  tiers: { rx: number; ry: number }[];
  crowd: CrowdFigure[][];
  torches: Torch[];
  motes: Mote[];
  leafClusters: LeafCluster[];
}

function buildGeometry(): TheatreGeometry {
  const rnd = makeRng(17);

  const stars: Star[] = Array.from({ length: 70 }, () => ({
    cx: rnd() * 1280,
    cy: rnd() * 230,
    r: 0.6 + rnd() * 1.2,
    opacity: 0.3 + rnd() * 0.6,
    delay: -rnd() * 3,
  }));

  const columns = Array.from({ length: 8 }, (_, i) => -104 + i * 30);

  const CX = 640;
  const CY = 700;
  const tiers = Array.from({ length: 7 }, (_, i) => ({ rx: 620 + i * 90, ry: 170 + i * 46 }));

  const crowd: CrowdFigure[][] = tiers.map(({ rx, ry }, i) => {
    const r = rx - 18;
    const rr = ry - 16;
    const n = Math.round(26 + i * 6);
    const figures: CrowdFigure[] = [];
    for (let k = 0; k <= n; k++) {
      const a = Math.PI + (k / n) * Math.PI + (rnd() - 0.5) * 0.02;
      const x = CX + r * Math.cos(a);
      const y = CY + rr * Math.sin(a);
      if (y > CY - 30) continue;
      const h = (26 - i * 2.2) * (0.85 + rnd() * 0.3);
      const w = h * 0.55;
      const arm = rnd() < 0.3;
      figures.push({ x, y, h, w, arm });
    }
    return figures;
  });

  const torchPoints: Array<[number, number]> = [
    [110, 612],
    [260, 556],
    [1020, 556],
    [1170, 612],
  ];
  const torches: Torch[] = torchPoints.map(([x, y]) => ({ x, y }));
  const motes: Mote[] = [];
  for (const [x, y] of torchPoints) {
    for (let k = 0; k < 10; k++) {
      motes.push({
        cx: x + (rnd() - 0.5) * 90,
        cy: y - 20 + (rnd() - 0.5) * 60,
        r: 0.8 + rnd() * 1.4,
        duration: 5 + rnd() * 6,
        delay: -rnd() * 8,
      });
    }
  }

  const clusterSeeds: Array<[number, number, number, number]> = [
    [10, -270, 120, 70],
    [110, -300, 130, 72],
    [-40, -230, 90, 52],
    [170, -250, 100, 58],
    [60, -330, 110, 60],
  ];
  const leafClusters: LeafCluster[] = clusterSeeds.map(([x, y, rx, ry]) => {
    const leaves: LeafSpeck[] = Array.from({ length: 26 }, () => {
      const a = rnd() * 6.28;
      const d = rnd();
      return {
        x: x + Math.cos(a) * rx * d,
        y: y + Math.sin(a) * ry * d,
        rotate: rnd() * 180,
        opacity: 0.35 + rnd() * 0.5,
      };
    });
    return { x, y, rx, ry, leaves };
  });

  return { stars, columns, tiers, crowd, torches, motes, leafClusters };
}

// Computed once at module load - identical on every mount, never regenerated
// per render.
const GEOMETRY = buildGeometry();

const SCENE_STYLE_TAG = `
.theatre-scene-root{position:absolute;inset:0;overflow:hidden;pointer-events:none;transform-origin:50% 70%;transition:filter 500ms ease}
.theatre-scene-root svg{width:100%;height:100%;display:block}
@media (prefers-reduced-motion:no-preference){
  .theatre-scene-root{animation:theatre-drift 60s ease-in-out infinite alternate}
  @keyframes theatre-drift{to{transform:scale(1.035)}}
  .theatre-flame{animation:theatre-flick .17s steps(2) infinite alternate;transform-origin:50% 100%}
  .theatre-flame:nth-child(odd){animation-duration:.22s}
  @keyframes theatre-flick{to{transform:scale(1.12,.92);opacity:.85}}
  .theatre-glow{animation:theatre-glow 1.3s ease-in-out infinite alternate}
  @keyframes theatre-glow{to{opacity:.5}}
  .theatre-star{animation:theatre-twinkle 3s ease-in-out infinite alternate}
  @keyframes theatre-twinkle{to{opacity:.25}}
  .theatre-mote{animation:theatre-mote-drift linear infinite}
  @keyframes theatre-mote-drift{0%{transform:translate(0,0);opacity:0}15%{opacity:.8}100%{transform:translate(30px,-140px);opacity:0}}
  .theatre-leaves{animation:theatre-sway 6s ease-in-out infinite alternate;transform-origin:0 100%}
  @keyframes theatre-sway{to{transform:rotate(1.6deg)}}
}
.theatre-arm{transition:transform 350ms cubic-bezier(.2,.9,.3,1.3);transform-origin:50% 100%}
.theatre-arm--up{transform:rotate(-40deg) translateY(-4px)}
.theatre-tier{transition:transform 400ms ease}
.theatre-tier--boo{transform:translateY(5px) skewX(-3deg)}
@media (prefers-reduced-motion:reduce){
  .theatre-scene-root,.theatre-flame,.theatre-glow,.theatre-star,.theatre-mote,.theatre-leaves{animation:none!important}
}
`;

// Task 159 - dimmed (phase lighting) and mood (cheer/boo) used to be two
// separate filters on two different elements (root, crowd group). Combined
// here into ONE filter on the scene root so they compose as a single CSS
// property instead of two elements each owning their own.
function sceneFilterFor(mood: CrowdMood, dimmed: boolean): string {
  const parts: string[] = [];
  if (dimmed) parts.push('brightness(0.5) saturate(0.8)');
  if (mood === 'cheer') parts.push('brightness(1.18) saturate(1.1)');
  else if (mood === 'boo') parts.push('brightness(0.6) saturate(0.6)');
  return parts.length > 0 ? parts.join(' ') : 'none';
}

const rootStyle = (mood: CrowdMood, dimmed: boolean): CSSProperties => ({
  zIndex: 0,
  filter: sceneFilterFor(mood, dimmed),
});

export function TheatreScene({ mood, dimmed }: TheatreSceneProps) {
  const { stars, columns, tiers, crowd, torches, motes, leafClusters } = GEOMETRY;
  const tierOrder = [...tiers.keys()].reverse();

  return (
    <div className="theatre-scene-root" style={rootStyle(mood, dimmed)} aria-hidden="true" data-theatre-scene="" data-mood={mood} data-dimmed={dimmed}>
      <style>{SCENE_STYLE_TAG}</style>
      <svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="theatre-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#070C18" />
            <stop offset=".55" stopColor="#13213D" />
            <stop offset=".85" stopColor="#5A3350" />
            <stop offset="1" stopColor="#8A4A3E" />
          </linearGradient>
          <filter id="theatre-marble" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency=".012 .03" numOctaves={4} seed={3} result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 .55  0 0 0 0 .5  0 0 0 0 .42  0 0 0 -1.4 1.1" result="v" />
            <feGaussianBlur in="v" stdDeviation=".6" result="vb" />
            <feComposite in="vb" in2="SourceGraphic" operator="in" />
          </filter>
          <linearGradient id="theatre-tierL" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#D9D0BC" />
            <stop offset=".5" stopColor="#A89E88" />
            <stop offset="1" stopColor="#4A4436" />
          </linearGradient>
          <linearGradient id="theatre-orch" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#EDE6D6" />
            <stop offset="1" stopColor="#A89E88" />
          </linearGradient>
          <radialGradient id="theatre-torch">
            <stop offset="0" stopColor="#FFD98A" stopOpacity=".95" />
            <stop offset=".35" stopColor="#E8A14A" stopOpacity=".35" />
            <stop offset="1" stopColor="#E8A14A" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="theatre-moon">
            <stop offset="0" stopColor="#F6F0DC" />
            <stop offset=".5" stopColor="#F6F0DC" />
            <stop offset=".55" stopColor="#F6F0DC" stopOpacity=".25" />
            <stop offset="1" stopColor="#F6F0DC" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="theatre-fig" x1="0" x2="1">
            <stop offset="0" stopColor="#6E5A40" />
            <stop offset=".45" stopColor="#2A2218" />
            <stop offset="1" stopColor="#120E0A" />
          </linearGradient>
          <linearGradient id="theatre-trunk" x1="0" x2="1">
            <stop offset="0" stopColor="#6B5A3E" />
            <stop offset=".6" stopColor="#2E2618" />
            <stop offset="1" stopColor="#15110A" />
          </linearGradient>
          <radialGradient id="theatre-leafg">
            <stop offset="0" stopColor="#8C9A55" />
            <stop offset="1" stopColor="#2E3A1B" />
          </radialGradient>
          <linearGradient id="theatre-acro" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2B3550" />
            <stop offset="1" stopColor="#0C1526" />
          </linearGradient>
          <radialGradient id="theatre-vig" cx=".5" cy=".55" r=".75">
            <stop offset=".5" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity=".7" />
          </radialGradient>
        </defs>

        <rect width={1280} height={720} fill="url(#theatre-sky)" />

        <g fill="#EDE6D6">
          {stars.map((s, i) => (
            <circle
              key={i}
              className="theatre-star"
              cx={s.cx}
              cy={s.cy}
              r={s.r}
              opacity={s.opacity}
              style={{ animationDelay: `${s.delay}s` }}
            />
          ))}
        </g>

        <circle cx={1080} cy={110} r={60} fill="url(#theatre-moon)" />

        {/* Acropolis above the koilon: rock, Parthenon silhouette, moonlit */}
        <path
          d="M0 320 C160 280 320 300 480 262 C600 236 720 246 860 226 C1000 206 1140 250 1280 232 L1280 360 L0 360Z"
          fill="url(#theatre-acro)"
        />
        <path d="M470 262 C520 232 600 224 660 222 L820 222 C880 226 940 236 980 262 Z" fill="#1A2238" />
        <g transform="translate(725 222)" fill="#2E3A5A">
          <rect x={-120} y={-4} width={240} height={4} />
          <rect x={-110} y={-38} width={220} height={5} />
          <path d="M-116 -38 L0 -64 L116 -38 Z" />
          <g>
            {columns.map((x, i) => (
              <rect key={i} x={x} y={-33} width={7} height={29} />
            ))}
          </g>
        </g>

        <g>
          {tierOrder.map((i) => {
            const { rx, ry } = tiers[i];
            const rx2 = rx - 40;
            const ry2 = ry - 34;
            return (
              <g key={i} className={`theatre-tier ${mood === 'boo' ? 'theatre-tier--boo' : ''}`}>
                <path
                  d={`M${640 - rx} 700 A${rx} ${ry} 0 0 1 ${640 + rx} 700 L${640 + rx2} 700 A${rx2} ${ry2} 0 0 0 ${640 - rx2} 700 Z`}
                  fill="url(#theatre-tierL)"
                  opacity={0.55 + i * 0.06}
                />
                <path
                  d={`M${640 - rx} 700 A${rx} ${ry} 0 0 1 ${640 + rx} 700`}
                  fill="none"
                  stroke="#EDE6D6"
                  strokeWidth={2}
                  opacity={0.25}
                />
              </g>
            );
          })}
        </g>

        <g className="theatre-crowd">
          {crowd.map((figures, tierIndex) => (
            <g key={tierIndex}>
              {figures.map((f, figIndex) => (
                <g key={figIndex} className="theatre-figure">
                  <ellipse cx={f.x} cy={f.y - f.h * 0.35} rx={f.w} ry={f.h * 0.5} fill="url(#theatre-fig)" />
                  <circle cx={f.x} cy={f.y - f.h * 0.95} r={f.h * 0.28} fill="url(#theatre-fig)" />
                  {f.arm && (
                    <g className={`theatre-arm ${mood === 'cheer' ? 'theatre-arm--up' : ''}`}>
                      <rect
                        x={f.x + f.w * 0.5}
                        y={f.y - f.h * 1.05}
                        width={f.h * 0.13}
                        height={f.h * 0.6}
                        rx={2}
                        fill="url(#theatre-fig)"
                        transform={`rotate(25 ${f.x + f.w * 0.55} ${f.y - f.h * 0.5})`}
                      />
                    </g>
                  )}
                </g>
              ))}
            </g>
          ))}
        </g>

        <ellipse cx={640} cy={640} rx={560} ry={120} fill="url(#theatre-orch)" />
        <ellipse cx={640} cy={640} rx={560} ry={120} fill="#EDE6D6" filter="url(#theatre-marble)" opacity={0.9} />
        <ellipse cx={640} cy={640} rx={548} ry={110} fill="none" stroke="#8F8672" strokeWidth={2} opacity={0.5} />
        <ellipse cx={640} cy={640} rx={200} ry={40} fill="none" stroke="#8F8672" strokeWidth={2} opacity={0.35} />
        {/* thymele - the orchestra's altar */}
        <rect x={620} y={610} width={40} height={26} fill="#CFC5B0" />
        <rect x={614} y={606} width={52} height={8} fill="#EDE6D6" />
        <ellipse className="theatre-flame" cx={640} cy={600} rx={8} ry={12} fill="#FFD98A" />
        <circle className="theatre-glow" cx={640} cy={606} r={90} fill="url(#theatre-torch)" opacity={0.7} />

        <g>
          {torches.map((t, i) => (
            <g key={i}>
              <circle className="theatre-glow" cx={t.x} cy={t.y - 40} r={110} fill="url(#theatre-torch)" opacity={0.75} />
              <rect x={t.x - 3} y={t.y - 40} width={6} height={60} fill="#2A2218" />
              <ellipse className="theatre-flame" cx={t.x} cy={t.y - 52} rx={9} ry={16} fill="#FFD98A" />
            </g>
          ))}
        </g>
        <g fill="#FFD98A">
          {motes.map((m, i) => (
            <circle
              key={i}
              className="theatre-mote"
              cx={m.cx}
              cy={m.cy}
              r={m.r}
              style={{ animationDuration: `${m.duration}s`, animationDelay: `${m.delay}s` }}
            />
          ))}
        </g>

        <g transform="translate(60 720)">
          <path d="M40 0 C36 -80 60 -140 30 -230 L58 -232 C70 -150 62 -90 74 0Z" fill="url(#theatre-trunk)" />
          <path
            d="M46 -160 C20 -190 -10 -200 -30 -240 L-18 -246 C0 -210 30 -200 52 -172Z"
            fill="url(#theatre-trunk)"
          />
          <path
            d="M56 -200 C90 -230 120 -240 150 -290 L160 -282 C130 -240 100 -226 66 -192Z"
            fill="url(#theatre-trunk)"
          />
          <g className="theatre-leaves">
            {leafClusters.map((c, ci) => (
              <g key={ci}>
                <ellipse cx={c.x} cy={c.y} rx={c.rx} ry={c.ry} fill="url(#theatre-leafg)" />
                {c.leaves.map((l, li) => (
                  <ellipse
                    key={li}
                    cx={l.x}
                    cy={l.y}
                    rx={9}
                    ry={3}
                    transform={`rotate(${l.rotate} ${l.x} ${l.y})`}
                    fill="#9AA860"
                    opacity={l.opacity}
                  />
                ))}
              </g>
            ))}
          </g>
        </g>

        <rect width={1280} height={720} fill="url(#theatre-vig)" />
      </svg>
    </div>
  );
}
