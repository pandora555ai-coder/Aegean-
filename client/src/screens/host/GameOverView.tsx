import type { GameOverPayload } from '@game/shared';
import type { CSSVars } from './hostStyles';

interface GameOverViewProps {
  gameOver: GameOverPayload;
}

// Task 163a - replaces the avatar-row/confetti/firework celebration with
// design/theatre-reference.html's #gameover: the same centred .overlay
// group STAGE_ANNOUNCE uses (n/t/r), its .t sized down to 11cqh for a name
// instead of a stage title, plus a one-shot fall of olive leaves
// (.leaves/.fall) instead of the old confetti burst. GameOverPayload
// carries no closing-line field of its own, so the line is always the
// reference's fixed one; ties are whatever `winnerName` already contains
// (server joins them with " & " - see payloads.ts, untouched here).
// The standings themselves are the sophists row (Task 161) - nothing here
// names or counts a player except the winner's own name, and the row keeps
// the wreath on whoever's leading (or the trial's survivor).
const LEAF_COUNT = 60;
const LEAVES = Array.from({ length: LEAF_COUNT }, (_, i) => {
  const left = (i * 37) % 100;
  const dx = (((i * 53) % 200) - 100) / 10; // -10cqh..10cqh
  const duration = 4 + ((i * 17) % 40) / 10; // 4s-8s
  const delay = ((i * 29) % 300) / 100; // 0-3s, staggered
  return {
    id: i,
    style: {
      left: `${left}%`,
      '--dx': `${dx}cqh`,
      animationDuration: `${duration}s`,
      animationDelay: `${delay}s`,
    } as CSSVars,
  };
});

const CLOSING_LINE = 'Η γνώση, όπως πάντα, μας διέφυγε. Ένας από εσάς όμως, λιγότερο.';

const STYLE_TAG = `
.gameover-root{position:fixed;inset:var(--tv-safe-top) 0 var(--tv-safe-bottom) 0;container-type:size;
  display:grid;place-items:center;text-align:center;pointer-events:none;z-index:45;overflow:hidden}
.gameover-root .n{font-size:3cqh;letter-spacing:.35em;text-transform:uppercase;color:var(--ember);font-weight:700}
.gameover-root .t{font-family:"Gentium Book Plus",Georgia,"Times New Roman",serif;font-size:11cqh;font-weight:700;
  line-height:1;color:var(--marble);margin-top:.6cqh;text-shadow:0 .6cqh 3cqh rgba(0,0,0,.8)}
.gameover-root .r{font-size:3.4cqh;color:var(--marble-2);margin-top:2.2cqh;max-width:40ch;
  text-shadow:0 2px 10px rgba(0,0,0,.8)}
.gameover-root .leaves{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.gameover-root .leaf{position:absolute;top:-6cqh;width:2.6cqh;height:1cqh;background:var(--olive);
  border-radius:50%;opacity:0;animation-name:leaf-fall;animation-timing-function:linear;animation-fill-mode:forwards}
@keyframes leaf-fall{to{transform:translate(var(--dx),110cqh) rotate(540deg);opacity:.9}}
@media (prefers-reduced-motion: reduce){.gameover-root .leaf{display:none}}
`;

export function GameOverView({ gameOver }: GameOverViewProps) {
  return (
    <div className="gameover-root screen-fade-in" data-testid="gameover-root">
      <style>{STYLE_TAG}</style>
      <div className="leaves" aria-hidden="true">
        {LEAVES.map((leaf) => (
          <div key={leaf.id} className="leaf" style={leaf.style} />
        ))}
      </div>
      <div>
        <div className="n">Ο μαθητής</div>
        <div className="t" data-testid="winner-banner">
          {gameOver.winnerName}
        </div>
        <div className="r">{CLOSING_LINE}</div>
      </div>
    </div>
  );
}
