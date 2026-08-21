import type { GameOverPayload } from '@game/shared';
import { Avatar } from '../../components/Avatar';
import {
  SURFACE_GLOW,
  standingAvatarSize,
  standingRowSizeStyle,
  standingsListGap,
  styles,
  type CSSVars,
} from './hostStyles';

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
const CONFETTI_COLORS = ['#d4af37', '#ef4444', '#3b82f6', '#eab308', '#22c55e'];
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

export function GameOverView({ gameOver }: GameOverViewProps) {
  const sortedFinalStandings = [...gameOver.standings].sort((a, b) => a.rank - b.rank);
  const winners = sortedFinalStandings.filter((standing) => standing.rank === 1);
  const count = sortedFinalStandings.length;
  const rowSize = standingRowSizeStyle(count);

  return (
    <div style={styles.container} className="screen-fade-in">
      {CONFETTI_PIECES.map((piece) => (
        <div key={piece.id} className="confetti-piece" aria-hidden="true" style={piece.style} />
      ))}
      {FIREWORK_PARTICLES.map((particle) => (
        <div key={particle.id} className="firework-particle" aria-hidden="true" style={particle.style} />
      ))}
      <div style={styles.gameOverTitleWrap}>
        <div style={styles.gameOverTitle}>Τέλος παιχνιδιού!</div>
        <div style={styles.winnerAvatarRow} data-testid="winner-avatars">
          {winners.map((winner) => (
            <div key={winner.playerId} className="glow-pulse gold-pulse" style={{ '--glow-color': 'rgba(212, 175, 55, 0.6)' } as CSSVars}>
              <Avatar avatarId={winner.avatarId} sizeRem={6} ringColor="var(--gold)" />
            </div>
          ))}
        </div>
        <div
          className="text-glow-gold gold-pulse enter-pop"
          style={styles.winnerBanner}
          data-testid="winner-banner"
        >
          {gameOver.isTie ? 'Ισοπαλία: ' : 'Νικητής/τρια: '}
          {gameOver.winnerName}
        </div>
      </div>
      <div style={{ ...styles.standingsList, gap: standingsListGap(count) }}>
        {sortedFinalStandings.map((standing, index) => (
          <div
            key={standing.playerId}
            data-testid="final-standing-row"
            className={standing.rank === 1 ? 'glow-pulse enter-rise' : 'enter-rise'}
            style={
              standing.rank === 1
                ? ({
                    ...styles.standingRowWinner,
                    ...rowSize,
                    '--glow-color': 'rgba(212, 175, 55, 0.5)',
                    '--i': String(index),
                  } as CSSVars)
                : ({ ...styles.standingRow, ...rowSize, boxShadow: SURFACE_GLOW, '--i': String(index) } as CSSVars)
            }
          >
            <span style={styles.standingRank}>#{standing.rank}</span>
            <Avatar avatarId={standing.avatarId} sizeRem={standingAvatarSize(count)} ringColor={standing.rank === 1 ? 'var(--gold)' : undefined} />
            <span style={styles.standingName}>{standing.name}</span>
            <span style={styles.standingScore}>{standing.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
