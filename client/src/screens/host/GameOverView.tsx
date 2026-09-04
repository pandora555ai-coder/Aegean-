import { useRef } from 'react';
import { ANSWER_IDENTITIES, type GameOverPayload } from '@game/shared';
import { Avatar } from '../../components/Avatar';
import { useFitScale } from '../../hooks/useFitScale';
import { MarbleSlab } from '../../components/MarbleSlab';
import { READ_AREA_HEIGHT, densityScale, styles, type CSSVars } from './hostStyles';

// Confetti pieces for the GAME_OVER celebration - a fixed module-level list
// (computed once, not per render) so remounts don't reshuffle it. Colours
// cycle through gold plus the 4 answer identities, tying the celebration
// back to the same palette instead of introducing new hues. Deterministic
// (index-derived, not Math.random) purely so a screenshot/test run is
// reproducible - there's no gameplay reason it needs to be.
//
// Task 23: roughly tripled (24 -> 72) and given real variety - size,
// rotation SPEED (not just a shared 540deg spin), and fall duration all
// vary per piece now, not just horizontal position. A POSITIVE, short
// stagger (0-1.1s, not the old negative "already mid-fall" trick) makes it
// read as a launched BURST rather than an ambient drizzle that was already
// running before you looked. Finite iteration count (2-3 falls) per piece
// so it settles rather than raining for the entire GAME_OVER screen.
// Gold plus the 4 answer identities' own colours (shared/src/index.ts) -
// referenced, not copied, so this can never drift from the identity
// mapping the TV and phones already share.
const CONFETTI_COLORS = ['var(--olive)', ...ANSWER_IDENTITIES.map((identity) => identity.color)];
const CONFETTI_COUNT = 72;
const CONFETTI_PIECES = Array.from({ length: CONFETTI_COUNT }, (_, i) => {
  const left = (i * 13.7) % 100;
  const drift = ((i * 23) % 140) - 70;
  const duration = 3.6 + ((i * 11) % 28) / 10; // 3.6s-6.4s
  const delay = ((i * 47) % 110) / 100; // 0-1.09s - staggered burst-in
  const spin = 320 + ((i * 67) % 760); // 320-1080deg, some spin much faster than others
  const width = 0.45 + ((i * 7) % 6) / 10; // 0.45rem-1.05rem
  const height = width * (1.3 + ((i * 3) % 4) / 10); // varied aspect ratio
  const iterations = 2 + (i % 3); // 2-4 falls, then it settles
  return {
    id: i,
    style: {
      left: `${left}%`,
      backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      '--w': `${width}rem`,
      '--h': `${height}rem`,
      '--drift': `${drift}px`,
      '--spin': `${spin}deg`,
      '--duration': `${duration}s`,
      '--delay': `${delay}s`,
      '--iterations': String(iterations),
    } as CSSVars,
  };
});

// Firework bursts for GAME_OVER - several radial particle bursts, staggered
// across the first ~1.6s, positioned in the screen's side margins (never
// the centred title/name/standings column) so they frame the winner
// without ever obscuring it. Each particle's outward offset is computed
// once here (its angle around the burst circle * a radius), not left to
// CSS to guess - a plain radial spread, cheapest possible way to get a
// convincing "burst" from a single shared @keyframes.
const FIREWORK_ORIGINS = [
  { x: 12, y: 22 },
  { x: 88, y: 22 },
  { x: 15, y: 62 },
  { x: 85, y: 62 },
];
const PARTICLES_PER_BURST = 10;
const FIREWORK_PARTICLES = FIREWORK_ORIGINS.flatMap((origin, burstIndex) => {
  const burstDelay = burstIndex * 0.4; // 4 bursts, 400ms apart - all done within ~2.1s
  return Array.from({ length: PARTICLES_PER_BURST }, (_, p) => {
    const angle = (p / PARTICLES_PER_BURST) * 2 * Math.PI;
    const radius = 85 + ((burstIndex + p) % 3) * 25; // px - a little size variety per particle
    const fx = Math.cos(angle) * radius;
    const fy = Math.sin(angle) * radius;
    return {
      id: `${burstIndex}-${p}`,
      style: {
        left: `${origin.x}%`,
        top: `${origin.y}%`,
        backgroundColor: CONFETTI_COLORS[(burstIndex + p) % CONFETTI_COLORS.length],
        boxShadow: `0 0 6px 1px ${CONFETTI_COLORS[(burstIndex + p) % CONFETTI_COLORS.length]}`,
        '--fx': `${fx}px`,
        '--fy': `${fy}px`,
        '--delay': `${burstDelay}s`,
      } as CSSVars,
    };
  });
});

interface GameOverViewProps {
  gameOver: GameOverPayload;
}

// Task 161 - the final standings list is gone from this view: the sophists
// row at the foot of the screen IS the standings now (sorted, the winner
// wreathed, and after a trial only the survivor still on the orchestra), so
// a second roster on the slab would name and count the same players twice.
// What is left is the celebration header alone, kept inside the read area
// above the row.
export function GameOverView({ gameOver }: GameOverViewProps) {
  const winners = gameOver.standings.filter((standing) => standing.rank === 1);
  const count = gameOver.standings.length;
  // The same density-step scaling every other TV view uses at high player
  // counts, applied to the header.
  const s = densityScale(count);
  const containerStyle = {
    ...styles.container,
    height: READ_AREA_HEIGHT,
    padding: `${(3 * Math.max(s, 0.55)).toFixed(2)}rem 2rem`,
  };
  const titleWrapStyle = {
    ...styles.gameOverTitleWrap,
    gap: `${(1 * Math.max(s, 0.6)).toFixed(2)}rem`,
    padding: `${(1.5 * Math.max(s, 0.5)).toFixed(2)}rem 0`,
  };
  const winnerAvatarSize = 6 * Math.max(s, 0.55);

  // The density steps above shrink the parts; this shrinks whatever is
  // still left over. The header (title, winner avatar, winner slab) is
  // taller than the 57vh read area at 720p on its own, so it scales down
  // to fit rather than running into the sophists row. Centred flex overflow
  // is invisible to scrollHeight, so nothing here would say so on its own.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fitRef = useRef<HTMLDivElement | null>(null);
  useFitScale(containerRef, fitRef, [count, gameOver.winnerName, gameOver.isTie]);

  return (
    <div style={containerStyle} className="screen-fade-in" ref={containerRef}>
      {CONFETTI_PIECES.map((piece) => (
        <div key={piece.id} className="confetti-piece" aria-hidden="true" style={piece.style} />
      ))}
      {FIREWORK_PARTICLES.map((particle) => (
        <div key={particle.id} className="firework-particle" aria-hidden="true" style={particle.style} />
      ))}
      <div ref={fitRef} style={styles.gameOverFitBlock}>
      <div style={titleWrapStyle}>
        <div style={{ ...styles.gameOverTitle, fontSize: `${(2.5 * Math.max(s, 0.7)).toFixed(2)}rem` }}>
          Τέλος παιχνιδιού!
        </div>
        <div style={styles.winnerAvatarRow} data-testid="winner-avatars">
          {winners.map((winner) => (
            <div key={winner.playerId} className="glow-pulse gold-pulse" style={{ '--glow-color': 'rgba(154, 168, 96, 0.6)' } as CSSVars}>
              <Avatar avatarId={winner.avatarId} sizeRem={winnerAvatarSize} ringColor="var(--olive)" />
            </div>
          ))}
        </div>
        <MarbleSlab className="enter-pop" style={{ flex: '0 0 auto', padding: `${(1.5 * Math.max(s, 0.6)).toFixed(2)}rem` }}>
          <div
            style={{ ...styles.winnerBanner, color: 'var(--carve)', fontSize: `${(3.5 * Math.max(s, 0.55)).toFixed(2)}rem` }}
            data-testid="winner-banner"
          >
            {gameOver.isTie ? 'Ισοπαλία: ' : 'Νικητής/τρια: '}
            {gameOver.winnerName}
          </div>
        </MarbleSlab>
      </div>
      </div>
    </div>
  );
}
