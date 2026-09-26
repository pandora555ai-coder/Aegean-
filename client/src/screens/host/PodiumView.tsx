import { useEffect, useRef, useState } from 'react';
import type { GameOverPayload } from '@game/shared';
import { Avatar } from '../../components/Avatar';
import { greekUpper } from '../../greekUpper';
import { densityScale } from './hostStyles';

interface PodiumViewProps {
  gameOver: GameOverPayload;
  vipName: string | null;
  // Task 322 - the two post-game actions (host:play_again / host:new_game).
  onSamePlayers: () => void;
  onNewGame: () => void;
}

// Task 239 - the end state, shown a beat after whatever ceremony just played
// (GameOverView's leaf-fall, or Η Ανάβασις's own crowning) - see HostScreen's
// showPodium timer. `gameOver.standings` is ALREADY in the right order for
// every finale (score order for a plain quiz, survival order for the trial,
// step order for the climb - buildGameOver, server-side); this view only
// ever reads that order, never re-derives it.
//
// ZERO digits anywhere: no rank number, no score, no step count - position
// on screen IS the rank, the same "the row IS the standings" idiom
// SophistsRow already established for the in-game score column. The winner
// gets a small laurel + the brighter ink; nothing else marks rank at all.
const STYLE_TAG = `
.podium-root{position:fixed;inset:var(--tv-safe-top) 0 var(--tv-safe-bottom) 0;container-type:size;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2cqh;
  text-align:center;pointer-events:none;z-index:45;overflow:hidden}
.podium-title{font-size:3cqh;letter-spacing:.35em;color:var(--ember);font-weight:700}
.podium-list{display:flex;flex-direction:column;gap:1.2cqh;width:100%;max-width:64cqw;overflow:hidden}
.podium-row{display:flex;align-items:center;gap:1.4cqh;justify-content:center;
  font-family:"Gentium Book Plus",Georgia,"Times New Roman",serif;
  color:var(--marble-2);text-shadow:0 2px 8px rgba(0,0,0,.8)}
.podium-row.winner{color:var(--marble)}
.podium-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:44cqw}
.podium-wreath{flex-shrink:0}
.podium-actions{display:flex;flex-direction:column;align-items:center;gap:1.6cqh;pointer-events:auto}
.podium-buttons{display:flex;gap:2cqw}
.podium-btn{font-family:"Gentium Book Plus",Georgia,"Times New Roman",serif;font-size:3cqh;font-weight:700;
  padding:1.4cqh 3cqw;color:var(--marble);background:var(--night-1);border:.3cqh solid var(--marble-3);
  border-radius:1cqh;cursor:pointer}
.podium-btn:focus,.podium-btn:focus-visible{outline:.5cqh solid var(--ember);outline-offset:.4cqh;background:var(--wine)}
.podium-btn:disabled{opacity:.42;cursor:default}
.podium-decider{font-size:2.4cqh;color:var(--marble-2);font-family:"Gentium Book Plus",Georgia,serif}
`;

// A small laurel, olive-coloured like AnavasisCrowning's own wreath (a
// simplified pair of leaves rather than that component's full ring - this
// one sits inline next to a single name, not around a whole figure).
function PodiumLaurel({ sizeCqh }: { sizeCqh: number }) {
  return (
    <svg
      className="podium-wreath"
      viewBox="0 0 40 24"
      style={{ width: `${sizeCqh * 1.6}cqh`, height: `${sizeCqh}cqh` }}
      data-testid="podium-wreath"
      aria-hidden="true"
    >
      <g fill="var(--olive)">
        <ellipse cx={8} cy={12} rx={7} ry={3} transform="rotate(-20 8 12)" />
        <ellipse cx={17} cy={6} rx={7} ry={3} transform="rotate(-45 17 6)" />
        <ellipse cx={32} cy={12} rx={7} ry={3} transform="rotate(20 32 12)" />
        <ellipse cx={23} cy={6} rx={7} ry={3} transform="rotate(45 23 6)" />
      </g>
    </svg>
  );
}

export function PodiumView({ gameOver, vipName, onSamePlayers, onNewGame }: PodiumViewProps) {
  const count = gameOver.standings.length;
  const s = densityScale(count);
  const avatarRem = 2.6 * s;
  const winnerAvatarRem = 3.4 * s;
  const [pressed, setPressed] = useState(false);
  const firstButtonRef = useRef<HTMLButtonElement>(null);
  const secondButtonRef = useRef<HTMLButtonElement>(null);

  // A TV remote has no pointer: first button takes focus on mount.
  useEffect(() => {
    firstButtonRef.current?.focus();
  }, []);

  function press(action: () => void) {
    if (pressed) {
      return;
    }
    setPressed(true);
    action();
  }

  // Arrow keys move focus between the two buttons; Tab works natively and
  // Enter presses the focused button (native button behaviour).
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      secondButtonRef.current?.focus();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      firstButtonRef.current?.focus();
    }
  }

  return (
    <div className="podium-root screen-fade-in" data-testid="podium-root">
      <style>{STYLE_TAG}</style>
      <div className="podium-title">{greekUpper('Τελική κατάταξη')}</div>
      <div className="podium-list">
        {gameOver.standings.map((standing) => {
          const isWinner = standing.rank === 1;
          return (
            <div
              key={standing.playerId}
              className={isWinner ? 'podium-row winner' : 'podium-row'}
              style={{ fontSize: `${(isWinner ? 4.2 : 3.2) * s}cqh`, fontWeight: isWinner ? 800 : 600 }}
              data-testid="podium-standing"
              data-winner={isWinner}
            >
              {isWinner && <PodiumLaurel sizeCqh={2.2 * s} />}
              <Avatar avatarId={standing.avatarId} sizeRem={isWinner ? winnerAvatarRem : avatarRem} />
              <span className="podium-name" data-testid="podium-name">
                {standing.name}
              </span>
              {isWinner && <PodiumLaurel sizeCqh={2.2 * s} />}
            </div>
          );
        })}
      </div>
      <div className="podium-actions" data-testid="podium-actions" onKeyDown={handleKeyDown}>
        <div className="podium-buttons">
          <button
            ref={firstButtonRef}
            className="podium-btn"
            type="button"
            data-testid="tv-play-again"
            disabled={pressed}
            onClick={() => press(onSamePlayers)}
          >
            Ξανά, ίδια παρέα
          </button>
          <button
            ref={secondButtonRef}
            className="podium-btn"
            type="button"
            data-testid="tv-new-game"
            disabled={pressed}
            onClick={() => press(onNewGame)}
          >
            Νέο παιχνίδι
          </button>
        </div>
        <div className="podium-decider" data-testid="tv-decider">
          Αποφασίζει: {vipName ?? '...'}
        </div>
      </div>
    </div>
  );
}
