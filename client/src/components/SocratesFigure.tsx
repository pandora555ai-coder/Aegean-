import type { GamePhase } from '@game/shared';

// Task 164 - Socrates himself, standing on the orchestra. A separate layer
// between TheatreScene (the backdrop) and the read column/speech slab, so a
// later WebM/Rive swap only ever touches this one file. Built from
// design/theatre-reference.html's .socrates block: himation, head, beard,
// the .hand group that gestures while he speaks. SVG ART only - raw hex
// inside it is the same exception TheatreScene/DrawingCanvas already use.
//
// Nothing stood in for Socrates on /host before this - no image, no avatar,
// no placeholder of any kind.

const SPEAKING_PHASES: ReadonlySet<GamePhase> = new Set(['SOCRATES', 'STEAL']);
const RAISED_LEFT_PHASES: ReadonlySet<GamePhase> = new Set(['SOCRATES', 'STEAL']);
const CENTRE_STAGE_PHASES: ReadonlySet<GamePhase> = new Set(['LOBBY', 'STAGE_ANNOUNCE']);

function poseFor(phase: GamePhase): { left: string; scale: number } {
  // The reference's own SOCRATES/STEAL position is left:12% - measured here
  // (Task 164) to overlap the speech slab by ~6286px^2 at 1280x720, because
  // SpeechSlab was widened left:24%/w:52% -> left:14%/w:72% in Task 163b,
  // after this figure's reference position was authored. 5% clears the
  // slab's left edge (179px at 1280x720) with ~14px margin.
  if (RAISED_LEFT_PHASES.has(phase)) return { left: '5%', scale: 1.35 };
  if (CENTRE_STAGE_PHASES.has(phase)) return { left: '44%', scale: 1.15 };
  if (phase === 'GAME_OVER') return { left: '40%', scale: 1.3 };
  return { left: '7%', scale: 1 };
}

const STYLE_TAG = `
.socrates-figure-root{position:absolute;bottom:9cqh;width:12cqh;height:30cqh;
  transform-origin:50% 100%;transition:transform 450ms,left 450ms;z-index:1;
  filter:drop-shadow(-1cqh .5cqh .8cqh rgba(0,0,0,.55))}
.socrates-figure-root svg{width:100%;height:100%;display:block;overflow:visible}
@media (prefers-reduced-motion:no-preference){
  .socrates-figure-hand--speaking{animation:socrates-speak 2.6s ease-in-out infinite;transform-origin:15% 90%}
  @keyframes socrates-speak{40%{transform:rotate(-14deg)}70%{transform:rotate(5deg)}}
}
@media (prefers-reduced-motion:reduce){
  .socrates-figure-hand--speaking{animation:none!important}
}
`;

interface SocratesFigureProps {
  phase: GamePhase;
}

export function SocratesFigure({ phase }: SocratesFigureProps) {
  const { left, scale } = poseFor(phase);
  const handClassName = SPEAKING_PHASES.has(phase)
    ? 'socrates-figure-hand socrates-figure-hand--speaking'
    : 'socrates-figure-hand';

  return (
    <div
      className="socrates-figure-root"
      style={{ left, transform: `scale(${scale})` }}
      aria-hidden="true"
      data-testid="socrates-figure"
      data-phase={phase}
    >
      <style>{STYLE_TAG}</style>
      <svg viewBox="0 0 120 300">
        <defs>
          <linearGradient id="socrates-figure-him" x1="0" x2="1">
            <stop offset="0" stopColor="#F5EFE0" />
            <stop offset=".45" stopColor="#B8AD95" />
            <stop offset="1" stopColor="#5A5242" />
          </linearGradient>
          <linearGradient id="socrates-figure-sk" x1="0" x2="1">
            <stop offset="0" stopColor="#E8C49A" />
            <stop offset=".5" stopColor="#A07A54" />
            <stop offset="1" stopColor="#4A3524" />
          </linearGradient>
        </defs>
        <ellipse cx={60} cy={296} rx={40} ry={6} fill="#000" opacity={0.4} />
        <path
          d="M60 300 L18 300 C14 230 24 160 36 128 L50 118 L70 118 L84 128 C96 160 106 230 102 300 Z"
          fill="url(#socrates-figure-him)"
        />
        <path
          d="M42 130 C34 180 44 240 34 300 L52 300 C50 240 58 180 54 130 Z"
          fill="#5A5242"
          opacity={0.35}
        />
        <path d="M84 126 L110 100 L116 106 L92 136 Z" fill="url(#socrates-figure-sk)" />
        <g className={handClassName}>
          <path d="M20 180 C4 166 4 148 16 142 L30 156 Z" fill="url(#socrates-figure-sk)" />
        </g>
        <circle cx={60} cy={86} r={30} fill="url(#socrates-figure-sk)" />
        <path
          d="M32 94 C36 130 84 130 88 94 C80 116 40 116 32 94 Z"
          fill="#EDE6D6"
        />
        <path
          d="M30 80 C34 60 86 60 90 80 C82 70 38 70 30 80 Z"
          fill="#EDE6D6"
          opacity={0.7}
        />
      </svg>
    </div>
  );
}
