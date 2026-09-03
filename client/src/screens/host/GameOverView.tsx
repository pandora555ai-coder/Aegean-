import { useRef } from 'react';
import { ANSWER_IDENTITIES, type GameOverPayload } from '@game/shared';
import { Avatar } from '../../components/Avatar';
import { useFitScale } from '../../hooks/useFitScale';
import { PapyrusPanel } from './PapyrusPanel';
import {
  SURFACE_GLOW,
  densityScale,
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

export function GameOverView({ gameOver }: GameOverViewProps) {
  const sortedFinalStandings = [...gameOver.standings].sort((a, b) => a.rank - b.rank);
  const winners = sortedFinalStandings.filter((standing) => standing.rank === 1);
  const count = sortedFinalStandings.length;
  const rowSize = standingRowSizeStyle(count);
  // Up to MAX_PLAYERS (8) standing rows have to share 100vh with the whole
  // celebration header (title/avatar/winner papyrus) above them - the same
  // density-step scaling every other TV view uses at high player counts,
  // applied here to the header since standingRowSizeStyle already covers
  // the list itself.
  const s = densityScale(count);
  const containerStyle = { ...styles.container, padding: `${(3 * Math.max(s, 0.55)).toFixed(2)}rem 2rem` };
  const titleWrapStyle = {
    ...styles.gameOverTitleWrap,
    gap: `${(1 * Math.max(s, 0.6)).toFixed(2)}rem`,
    padding: `${(1.5 * Math.max(s, 0.5)).toFixed(2)}rem 0`,
  };
  const winnerAvatarSize = 6 * Math.max(s, 0.55);

  // The density steps above shrink the parts; this shrinks whatever is
  // still left over. GAME_OVER is the one host screen whose content is a
  // celebration header AND a list that grows with the room, and at 720p
  // (where the TV safe area now costs 10vh, Task 112) the two together ran
  // past the panel from 5 players up - measured, not assumed. Centred flex
  // overflow is invisible to scrollHeight, so nothing here would have said
  // so on its own.
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
        <PapyrusPanel className="enter-pop" style={{ flex: '0 0 auto', padding: `${(1.5 * Math.max(s, 0.6)).toFixed(2)}rem` }}>
          <div
            style={{ ...styles.winnerBanner, color: 'var(--carve)', fontSize: `${(3.5 * Math.max(s, 0.55)).toFixed(2)}rem` }}
            data-testid="winner-banner"
          >
            {gameOver.isTie ? 'Ισοπαλία: ' : 'Νικητής/τρια: '}
            {gameOver.winnerName}
          </div>
        </PapyrusPanel>
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
                    '--glow-color': 'rgba(154, 168, 96, 0.5)',
                    '--i': String(index),
                  } as CSSVars)
                : ({ ...styles.standingRow, ...rowSize, boxShadow: SURFACE_GLOW, '--i': String(index) } as CSSVars)
            }
          >
            {/* Task 137 - a trial's GAME_OVER shows no numbers at all: score
                is life there and can end negative, and the row ORDER is
                already the survival ranking, so a "#N" badge would be the
                only digit left on the whole screen for no reason. */}
            {!gameOver.isTrialResult && <span style={styles.standingRank}>#{standing.rank}</span>}
            <Avatar avatarId={standing.avatarId} sizeRem={standingAvatarSize(count)} ringColor={standing.rank === 1 ? 'var(--olive)' : undefined} />
            <span style={styles.standingName}>{standing.name}</span>
            {!gameOver.isTrialResult && <span style={styles.standingScore}>{standing.score}</span>}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
