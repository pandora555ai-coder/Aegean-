import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { BLITZ_DURATIONS_SEC, BLITZ_STATEMENTS, drawBlitzStatements, type BlitzStatement } from '@game/shared';

// Task 69 - solo swipe minigame, reachable at /dev/blitz and linked from
// nowhere, same gated spirit as /dev/draw and /dev/numeric. NO server, NO
// sockets, NO room: every bit of state is local (React state + localStorage).
// The statement pool lives in @game/shared (BLITZ_STATEMENTS) because the
// real mode will draw from the same one. NO COLOUR anywhere in the round -
// weight and opacity only.

// --- localStorage -----------------------------------------------------------
// Exactly the three keys the task names, plus blitz:seen for the selection
// memory. read* swallow every failure (private mode / quota / corrupt JSON)
// and hand back an empty list so the screen never crashes on storage.
const K_SWIPES = 'swipes';
const K_ROUNDS = 'rounds';
const K_HIGHSCORES = 'highscores';
const K_SEEN = 'blitz:seen';

interface SwipeEntry {
  statementText: string;
  answeredTrue: boolean;
  correct: boolean;
  msSincePrevious: number;
}
interface RoundEntry {
  durationSec: number;
  answered: number;
  correct: number;
  endedAt: number;
}
interface HighscoreEntry {
  name: string;
  correct: number;
}

function readList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}
function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best-effort - a lost write just means this round isn't remembered
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

// --- gesture constants -----------------------------------------------------
const COMMIT_FRACTION = 0.15; // of viewport width
const FLICK_VELOCITY = 0.6; // px per ms - a fast flick commits regardless of distance
const TAP_SLOP = 10; // px of total travel below which a press counts as a tap
const MAX_TILT_DEG = 12;

type Screen = 'start' | 'round' | 'end';

interface ExitingCard {
  id: number;
  text: string;
  dir: 1 | -1;
  fromX: number;
  fromRot: number;
}

interface RoundSummary {
  durationSec: number;
  answered: number;
  correct: number;
  accuracy: number; // 0..1
  medianMs: number;
  perStatement: { text: string; ms: number; answeredTrue: boolean; correct: boolean }[];
}

export default function DevBlitzScreen() {
  const [screen, setScreen] = useState<Screen>('start');
  const [durationSec, setDurationSec] = useState<number>(45);
  const [highscores, setHighscores] = useState<HighscoreEntry[]>(() => readList<HighscoreEntry>(K_HIGHSCORES));

  // round state
  const [current, setCurrent] = useState<BlitzStatement | null>(null);
  const [stmtSeq, setStmtSeq] = useState(0); // bumps each advance so the live text remounts fresh
  const [answered, setAnswered] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(durationSec);
  const [drag, setDrag] = useState({ dx: 0, dy: 0 });
  const [springing, setSpringing] = useState(false);
  const [exiting, setExiting] = useState<ExitingCard[]>([]);
  const [summary, setSummary] = useState<RoundSummary | null>(null);
  const [copied, setCopied] = useState(false);

  // refs the timer / pointer closures read without going stale
  const seenRef = useRef<string[]>(readList<string>(K_SEEN));
  const currentRef = useRef<BlitzStatement | null>(null);
  const roundSwipesRef = useRef<SwipeEntry[]>([]);
  const roundStartRef = useRef(0);
  const lastCommitRef = useRef(0);
  const endTimeRef = useRef(0);
  const finishedRef = useRef(false);
  const exitIdRef = useRef(0);
  const pointerRef = useRef<
    | null
    | { id: number; startX: number; startY: number; lastX: number; lastT: number; vx: number; moved: number; done: boolean }
  >(null);
  const springTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const advance = useCallback(() => {
    const { picks, seen } = drawBlitzStatements(seenRef.current, 1);
    seenRef.current = seen;
    writeJSON(K_SEEN, seen);
    const next = picks[0] ?? null;
    currentRef.current = next;
    setCurrent(next);
    setStmtSeq((n) => n + 1);
  }, []);

  const finishRound = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    const swipes = roundSwipesRef.current;
    const correct = swipes.filter((s) => s.correct).length;
    const answeredCount = swipes.length;

    // persist swipes + this round
    writeJSON(K_SWIPES, [...readList<SwipeEntry>(K_SWIPES), ...swipes]);
    const roundEntry: RoundEntry = {
      durationSec,
      answered: answeredCount,
      correct,
      endedAt: Date.now(),
    };
    writeJSON(K_ROUNDS, [...readList<RoundEntry>(K_ROUNDS), roundEntry]);

    // highscore - top 5 by correct, name prompted ONLY when this round makes the cut
    const board = readList<HighscoreEntry>(K_HIGHSCORES);
    const qualifies = answeredCount > 0 && (board.length < 5 || correct > Math.min(...board.map((h) => h.correct)));
    if (qualifies) {
      const name = (window.prompt('Μπήκες στο top 5! Όνομα;', '') ?? '').trim() || 'Ανώνυμος';
      const nextBoard = [...board, { name, correct }].sort((a, b) => b.correct - a.correct).slice(0, 5);
      writeJSON(K_HIGHSCORES, nextBoard);
      setHighscores(nextBoard);
    } else {
      setHighscores(board);
    }

    setSummary({
      durationSec,
      answered: answeredCount,
      correct,
      accuracy: answeredCount > 0 ? correct / answeredCount : 0,
      medianMs: median(swipes.map((s) => s.msSincePrevious)),
      perStatement: swipes
        .map((s) => ({ text: s.statementText, ms: s.msSincePrevious, answeredTrue: s.answeredTrue, correct: s.correct }))
        .sort((a, b) => b.ms - a.ms),
    });
    setScreen('end');
  }, [durationSec]);

  // ONE commit function. All three commit paths - drag past threshold, fast
  // flick, and tap on a screen half - call this and nothing else. Right =>
  // ΣΩΣΤΟ (answeredTrue true), left => ΛΑΘΟΣ (false).
  const commitAnswer = useCallback(
    (answeredTrue: boolean) => {
      const stmt = currentRef.current;
      if (!stmt || finishedRef.current) return;

      const now = Date.now();
      roundSwipesRef.current.push({
        statementText: stmt.text,
        answeredTrue,
        correct: answeredTrue === stmt.isTrue,
        msSincePrevious: now - lastCommitRef.current,
      });
      lastCommitRef.current = now;
      setAnswered(roundSwipesRef.current.length);

      // The outgoing statement flies off on ITS OWN, in a pointer-events:none
      // layer, keyed by a fresh id. Input is never gated on this animation.
      const id = exitIdRef.current++;
      const dir: 1 | -1 = answeredTrue ? 1 : -1;
      setExiting((list) => [
        ...list,
        { id, text: stmt.text, dir, fromX: drag.dx, fromRot: tiltFor(drag.dx) },
      ]);
      window.setTimeout(() => {
        setExiting((list) => list.filter((c) => c.id !== id));
      }, 420);

      // The next statement is mounted synchronously, at rest, right now -
      // BEFORE the exit animation above has run a single frame.
      setSpringing(false);
      setDrag({ dx: 0, dy: 0 });
      advance();
    },
    [advance, drag.dx],
  );

  const springBack = useCallback(() => {
    setSpringing(true);
    setDrag({ dx: 0, dy: 0 });
    if (springTimerRef.current) clearTimeout(springTimerRef.current);
    springTimerRef.current = setTimeout(() => setSpringing(false), 260);
  }, []);

  // --- pointer handling: the ONE gesture resolver feeds commitAnswer ---
  const onPointerDown = (e: ReactPointerEvent) => {
    if (finishedRef.current) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointerRef.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastT: e.timeStamp,
      vx: 0,
      moved: 0,
      done: false,
    };
    if (springTimerRef.current) clearTimeout(springTimerRef.current);
    setSpringing(false);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const p = pointerRef.current;
    if (!p || p.done || e.pointerId !== p.id) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    p.moved = Math.max(p.moved, Math.hypot(dx, dy));
    const dt = e.timeStamp - p.lastT;
    if (dt > 0) p.vx = (e.clientX - p.lastX) / dt;
    p.lastX = e.clientX;
    p.lastT = e.timeStamp;
    setDrag({ dx, dy: dy * 0.12 }); // 1:1 horizontal, vertical heavily damped
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const p = pointerRef.current;
    if (!p || p.done || e.pointerId !== p.id) return;
    p.done = true;
    pointerRef.current = null;

    const dx = e.clientX - p.startX;
    const vw = window.innerWidth;
    if (Math.abs(p.vx) >= FLICK_VELOCITY) {
      commitAnswer(p.vx > 0); // fast flick - direction from velocity, distance irrelevant
    } else if (Math.abs(dx) >= COMMIT_FRACTION * vw) {
      commitAnswer(dx > 0); // dragged past the threshold
    } else if (p.moved < TAP_SLOP) {
      commitAnswer(e.clientX >= vw / 2); // a tap - right half = ΣΩΣΤΟ, left half = ΛΑΘΟΣ
    } else {
      springBack(); // below threshold, no flick - spring home
    }
  };

  // --- round lifecycle ---
  const startRound = () => {
    roundSwipesRef.current = [];
    finishedRef.current = false;
    const now = Date.now();
    roundStartRef.current = now;
    lastCommitRef.current = now;
    endTimeRef.current = now + durationSec * 1000;
    setAnswered(0);
    setSecondsLeft(durationSec);
    setDrag({ dx: 0, dy: 0 });
    setExiting([]);
    setSummary(null);
    setScreen('round');
    advance();
  };

  useEffect(() => {
    if (screen !== 'round') return;
    const tick = () => {
      const msLeft = endTimeRef.current - Date.now();
      setSecondsLeft(Math.max(0, Math.ceil(msLeft / 1000)));
      if (msLeft <= 0) finishRound();
    };
    tick();
    const iv = setInterval(tick, 100);
    return () => clearInterval(iv);
  }, [screen, finishRound]);

  useEffect(() => () => {
    if (springTimerRef.current) clearTimeout(springTimerRef.current);
  }, []);

  if (screen === 'start') {
    return <StartScreen durationSec={durationSec} onPick={setDurationSec} onStart={startRound} highscores={highscores} />;
  }
  if (screen === 'end' && summary) {
    return (
      <EndScreen
        summary={summary}
        copied={copied}
        onCopy={() => {
          const blob = {
            swipes: readList<SwipeEntry>(K_SWIPES),
            rounds: readList<RoundEntry>(K_ROUNDS),
            highscores: readList<HighscoreEntry>(K_HIGHSCORES),
          };
          navigator.clipboard
            .writeText(JSON.stringify(blob, null, 2))
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            })
            .catch((err: unknown) => console.warn('clipboard write failed', err));
        }}
        onAgain={() => setScreen('start')}
      />
    );
  }

  // --- round screen ---
  const progress = Math.max(-1, Math.min(1, drag.dx / (window.innerWidth * COMMIT_FRACTION)));
  const rightWeight = progress > 0.45 ? 800 : 400;
  const leftWeight = progress < -0.45 ? 800 : 400;

  return (
    <div
      style={styles.roundRoot}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <span style={styles.hudLeft} data-testid="answered-count">
        {answered}
      </span>
      <span style={styles.hudRight} data-testid="seconds-left">
        {secondsLeft}
      </span>

      <span style={{ ...styles.edgeLabel, ...styles.edgeLeft, opacity: 0.22 + 0.78 * Math.max(0, -progress), fontWeight: leftWeight }}>
        ΛΑΘΟΣ
      </span>
      <span style={{ ...styles.edgeLabel, ...styles.edgeRight, opacity: 0.22 + 0.78 * Math.max(0, progress), fontWeight: rightWeight }}>
        ΣΩΣΤΟ
      </span>

      {exiting.map((card) => (
        <span
          key={card.id}
          style={{
            ...styles.statement,
            pointerEvents: 'none',
            animation: 'none',
            transform: `translateX(${card.dir * (window.innerWidth * 0.9)}px) rotate(${card.dir * 22}deg)`,
            opacity: 0,
            transition: 'transform 0.4s ease-out, opacity 0.4s ease-out',
          }}
        >
          {card.text}
        </span>
      ))}

      {current && (
        <span
          key={stmtSeq}
          data-testid="live-statement"
          style={{
            ...styles.statement,
            transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(${tiltFor(drag.dx)}deg)`,
            transition: springing ? 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
            opacity: 1 - 0.28 * Math.min(1, Math.abs(progress)),
          }}
        >
          {current.text}
        </span>
      )}
    </div>
  );
}

function tiltFor(dx: number): number {
  const raw = dx * 0.04;
  return Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, raw));
}

// --------------------------------------------------------------------------
function StartScreen({
  durationSec,
  onPick,
  onStart,
  highscores,
}: {
  durationSec: number;
  onPick: (s: number) => void;
  onStart: () => void;
  highscores: HighscoreEntry[];
}) {
  return (
    <div style={styles.centeredRoot}>
      <h1 style={styles.title}>Blitz</h1>

      <div style={styles.durationRow}>
        {BLITZ_DURATIONS_SEC.map((d) => {
          const selected = d === durationSec;
          return (
            <button
              key={d}
              type="button"
              data-testid={`duration-${d}`}
              onClick={() => onPick(d)}
              style={{
                ...styles.plainButton,
                opacity: selected ? 1 : 0.45,
                fontWeight: selected ? 800 : 400,
                borderColor: selected ? 'rgba(248,246,251,0.65)' : 'rgba(248,246,251,0.2)',
              }}
            >
              {d}s
            </button>
          );
        })}
      </div>

      <button type="button" data-testid="start-button" onClick={onStart} style={{ ...styles.plainButton, ...styles.startButton }}>
        Ξεκίνα
      </button>

      <div style={styles.highscoreBlock}>
        <div style={styles.highscoreHead}>Top 5</div>
        {highscores.length === 0 && <div style={styles.faint}>— κανένα ακόμη —</div>}
        {highscores.map((h, i) => (
          <div key={`${h.name}-${i}`} style={styles.highscoreRow}>
            <span style={{ opacity: 0.6 }}>{i + 1}.</span>
            <span style={{ flex: 1 }}>{h.name}</span>
            <span style={{ fontWeight: 700 }}>{h.correct}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
function EndScreen({
  summary,
  copied,
  onCopy,
  onAgain,
}: {
  summary: RoundSummary;
  copied: boolean;
  onCopy: () => void;
  onAgain: () => void;
}) {
  const pct = useMemo(() => `${Math.round(summary.accuracy * 100)}%`, [summary.accuracy]);
  return (
    <div style={styles.centeredRoot}>
      <h1 style={styles.title}>Τέλος</h1>

      <div style={styles.statGrid}>
        <Stat label="answered" value={String(summary.answered)} />
        <Stat label="correct" value={String(summary.correct)} />
        <Stat label="accuracy" value={pct} />
        <Stat label="median ms" value={String(summary.medianMs)} />
      </div>

      <div style={styles.toolbar}>
        <button type="button" data-testid="copy-data" onClick={onCopy} style={{ ...styles.plainButton }}>
          {copied ? 'Copied!' : 'Copy data'}
        </button>
        <button type="button" onClick={onAgain} style={{ ...styles.plainButton }}>
          Ξανά
        </button>
      </div>

      <div style={styles.perStatementList}>
        <div style={styles.highscoreHead}>Ανά πρόταση — πιο αργή πρώτη</div>
        {summary.perStatement.map((row, i) => (
          <div key={`${row.text}-${i}`} style={styles.perRow} data-testid="per-statement-row">
            <span style={{ flex: 1, opacity: row.correct ? 1 : 0.55, fontWeight: row.correct ? 600 : 400 }}>{row.text}</span>
            <span style={{ fontFamily: 'monospace', opacity: 0.8 }}>{row.ms} ms</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

// --- styles: weight + opacity only in the round, greyscale everywhere ------
const styles: Record<string, CSSProperties> = {
  roundRoot: {
    position: 'fixed',
    inset: 0,
    background: 'var(--bg-edge)',
    color: 'var(--text)',
    overflow: 'hidden',
    touchAction: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hudLeft: {
    position: 'absolute',
    top: '1rem',
    left: '1.1rem',
    fontSize: '1.4rem',
    fontVariantNumeric: 'tabular-nums',
    opacity: 0.7,
  },
  hudRight: {
    position: 'absolute',
    top: '1rem',
    right: '1.1rem',
    fontSize: '1.4rem',
    fontVariantNumeric: 'tabular-nums',
    opacity: 0.7,
  },
  edgeLabel: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: '0.95rem',
    letterSpacing: '0.14em',
    writingMode: 'vertical-rl',
    textOrientation: 'mixed',
  },
  edgeLeft: { left: '0.5rem' },
  edgeRight: { right: '0.5rem', transform: 'translateY(-50%) rotate(180deg)' },
  statement: {
    position: 'absolute',
    maxWidth: '78vw',
    textAlign: 'center',
    fontSize: '1.9rem',
    lineHeight: 1.3,
    fontWeight: 500,
    padding: '0 1rem',
    willChange: 'transform',
  },

  centeredRoot: {
    minHeight: '100dvh',
    background: 'var(--bg-edge)',
    color: 'var(--text)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.4rem',
    padding: '2.5rem 1.5rem',
    boxSizing: 'border-box',
  },
  title: { fontSize: '2rem', fontWeight: 800, margin: 0, letterSpacing: '0.02em' },
  durationRow: { display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' },
  plainButton: {
    fontSize: '1.05rem',
    padding: '0.7rem 1.3rem',
    borderRadius: '0.6rem',
    border: '1px solid rgba(248,246,251,0.28)',
    background: 'transparent',
    color: 'var(--text)',
    cursor: 'pointer',
  },
  startButton: { fontSize: '1.25rem', fontWeight: 800, padding: '0.85rem 2.6rem', borderColor: 'rgba(248,246,251,0.6)' },
  highscoreBlock: { width: 'min(420px, 100%)', display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '1rem' },
  highscoreHead: { fontSize: '0.8rem', letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.55, marginBottom: '0.3rem' },
  highscoreRow: { display: 'flex', gap: '0.6rem', fontSize: '1.05rem', padding: '0.15rem 0' },
  faint: { opacity: 0.4, fontSize: '0.95rem' },

  statGrid: { display: 'flex', gap: '1.6rem', flexWrap: 'wrap', justifyContent: 'center' },
  stat: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' },
  statValue: { fontSize: '2.1rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' },
  statLabel: { fontSize: '0.78rem', letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.55 },
  toolbar: { display: 'flex', gap: '0.75rem' },
  perStatementList: { width: 'min(560px, 100%)', display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.5rem' },
  perRow: { display: 'flex', gap: '0.8rem', fontSize: '0.95rem', padding: '0.25rem 0', borderBottom: '1px solid rgba(248,246,251,0.08)' },
};
