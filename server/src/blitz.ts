// Blitz mode (Task 156) - the PURE mechanic, mode-agnostic like numeric.ts:
// the per-game draw, the swipe tally, the score and the most-missed pick.
// No Room, no io, no timers, no constants read from inside - every number is
// a call-site parameter (modes/blitz.ts passes the shared defaults; a
// composing mode can pass its own), so nothing here ever asks which mode is
// running.
import { BLITZ_STATEMENTS, type BlitzMostMissed, type BlitzStatement } from '@game/shared';

// One recorded swipe. `atMs` is stamped server-side at receipt - the phone
// never sends a time.
export interface BlitzSwipe {
  index: number;
  answeredTrue: boolean;
  atMs: number;
}

export interface BlitzTally {
  correct: number;
  wrong: number;
  unanswered: number;
}

// Fisher-Yates, same shape as questions.ts's shuffle.
function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// The game's K statements: ceil(K/2) true and floor(K/2) false, drawn at
// random from the pool, then shuffled together so the order carries no
// signal. Falls back to whatever the pool has if one side runs short (the
// shipped pool is 109/109, so that is theoretical).
export function drawBlitzGameStatements(
  count: number,
  rng: () => number = Math.random,
  pool: readonly BlitzStatement[] = BLITZ_STATEMENTS,
): BlitzStatement[] {
  const trueCount = Math.ceil(count / 2);
  const falseCount = count - trueCount;
  const trues = shuffle(pool.filter((s) => s.isTrue), rng).slice(0, trueCount);
  const falses = shuffle(pool.filter((s) => !s.isTrue), rng).slice(0, falseCount);
  return shuffle([...trues, ...falses], rng);
}

// Correct / wrong / unanswered for one player's ordered swipes against the
// dealt statements. A swipe whose index is out of range is ignored (the shell
// never records one, but the tally shouldn't trust that).
export function tallyBlitzSwipes(statements: readonly BlitzStatement[], swipes: readonly BlitzSwipe[]): BlitzTally {
  let correct = 0;
  let wrong = 0;
  for (const swipe of swipes) {
    const statement = statements[swipe.index];
    if (!statement) {
      continue;
    }
    if (swipe.answeredTrue === statement.isTrue) {
      correct += 1;
    } else {
      wrong += 1;
    }
  }
  return { correct, wrong, unanswered: Math.max(0, statements.length - correct - wrong) };
}

// The round's points. `scale` (Task 135's one scale, default 1) multiplies
// the raw total before rounding, exactly like calculatePoints' - a composing
// mode passes its own factor; nothing in here asks who is calling.
export function scoreBlitzTally(
  tally: BlitzTally,
  correctPoints: number,
  wrongPoints: number,
  scale = 1,
): number {
  return Math.round((tally.correct * correctPoints - tally.wrong * wrongPoints) * scale);
}

// The statement most players got WRONG (unanswered is not a miss). Ties go
// to the earlier index - the one more players actually reached. null when
// nobody got anything wrong.
export function mostMissedBlitzStatement(
  statements: readonly BlitzStatement[],
  swipesByPlayer: Iterable<readonly BlitzSwipe[]>,
): BlitzMostMissed | null {
  const missed = new Array<number>(statements.length).fill(0);
  for (const swipes of swipesByPlayer) {
    for (const swipe of swipes) {
      const statement = statements[swipe.index];
      if (statement && swipe.answeredTrue !== statement.isTrue) {
        missed[swipe.index] += 1;
      }
    }
  }
  let bestIndex = -1;
  for (let i = 0; i < missed.length; i++) {
    if (missed[i] > 0 && (bestIndex === -1 || missed[i] > missed[bestIndex])) {
      bestIndex = i;
    }
  }
  if (bestIndex === -1) {
    return null;
  }
  const statement = statements[bestIndex];
  return { text: statement.text, isTrue: statement.isTrue, missedCount: missed[bestIndex] };
}
