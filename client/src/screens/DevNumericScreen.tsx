import { useEffect, useMemo, useState, type ChangeEvent, type CSSProperties } from 'react';
import { ClientEvents, NUMERIC_ROUND_VALUES, ServerEvents, type DevNumericQuestionsPayload } from '@game/shared';
import { socket } from '../socket';
import { useSocketConnection } from '../useSocketConnection';

// Task 67 - dev-only content-review tool for the numeric-estimate pool
// (server/src/numeric.ts's NUMERIC_QUESTIONS), reachable at /dev/numeric and
// linked from nowhere, same "gated" spirit as /dev/draw. Same PURPOSE as
// `npm run voice:index` (judge content before it ships, choices survive a
// reload) but a live route rather than a generated static page, since the
// whole point here is a slider you can actually drag.

type Verdict = 'keep' | 'cut';
type Filter = 'all' | Verdict | 'undecided';

const STORAGE_KEY = 'numeric-question-review-v1';

function loadVerdicts(): Record<string, Verdict> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {}; // private mode / quota / corrupt JSON - start clean rather than crash
  }
}

function saveVerdicts(verdicts: Record<string, Verdict>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(verdicts));
  } catch {
    // best-effort - a lost save just means this round's choices don't survive
  }
}

interface DerivedQuestion {
  text: string;
  category: string;
  answer: number;
  max: number;
  hasValidMax: boolean;
  sliderStep: number;
  percent: number;
}

// The EXACT same climb maxForAnswer (server/src/numeric.ts) runs, against
// the SAME table (NUMERIC_ROUND_VALUES, shared) - the whole point of this
// tool is checking the real formula, not a second copy of it that could
// silently drift from what production actually does.
function deriveQuestion(text: string, category: string, answer: number): DerivedQuestion {
  const threshold = 2.5 * answer;
  const found = NUMERIC_ROUND_VALUES.find((value) => value >= threshold);
  const hasValidMax = found !== undefined;
  const max = found ?? NUMERIC_ROUND_VALUES[NUMERIC_ROUND_VALUES.length - 1];
  return {
    text,
    category,
    answer,
    max,
    hasValidMax,
    sliderStep: max / 200,
    percent: (answer / max) * 100,
  };
}

export default function DevNumericScreen() {
  const { connected } = useSocketConnection();
  const [questions, setQuestions] = useState<DerivedQuestion[] | null>(null);
  const [liveValues, setLiveValues] = useState<Record<string, number>>({});
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>(() => loadVerdicts());
  const [filter, setFilter] = useState<Filter>('all');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function handleQuestions(payload: DevNumericQuestionsPayload) {
      setQuestions(payload.questions.map((q) => deriveQuestion(q.text, q.category, q.answer)));
    }
    socket.on(ServerEvents.DEV_NUMERIC_QUESTIONS, handleQuestions);
    return () => {
      socket.off(ServerEvents.DEV_NUMERIC_QUESTIONS, handleQuestions);
    };
  }, []);

  useEffect(() => {
    if (connected) {
      socket.emit(ClientEvents.DEV_GET_NUMERIC_QUESTIONS);
    }
  }, [connected]);

  function setVerdict(text: string, verdict: Verdict) {
    setVerdicts((current) => {
      // A second click on the already-active choice clears it back to
      // undecided - "toggle", not a one-way stamp.
      const next = { ...current };
      if (current[text] === verdict) {
        delete next[text];
      } else {
        next[text] = verdict;
      }
      saveVerdicts(next);
      return next;
    });
  }

  function handleSliderChange(text: string, max: number, event: ChangeEvent<HTMLInputElement>) {
    const value = Math.min(max, Math.max(0, Number(event.target.value)));
    setLiveValues((current) => ({ ...current, [text]: value }));
  }

  const counts = useMemo(() => {
    const list = questions ?? [];
    let kept = 0;
    let cut = 0;
    let warnings = 0;
    for (const q of list) {
      if (verdicts[q.text] === 'keep') kept += 1;
      else if (verdicts[q.text] === 'cut') cut += 1;
      if (!q.hasValidMax) warnings += 1;
    }
    return { total: list.length, kept, cut, undecided: list.length - kept - cut, warnings };
  }, [questions, verdicts]);

  const visible = useMemo(() => {
    const list = questions ?? [];
    if (filter === 'all') return list;
    if (filter === 'undecided') return list.filter((q) => !verdicts[q.text]);
    return list.filter((q) => verdicts[q.text] === filter);
  }, [questions, verdicts, filter]);

  function handleExport() {
    const kept = (questions ?? []).filter((q) => verdicts[q.text] === 'keep');
    const text = JSON.stringify(
      kept.map((q) => ({ text: q.text, answer: q.answer, category: q.category })),
      null,
      2,
    );
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err: unknown) => console.warn('clipboard write failed', err));
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Εκτίμηση αριθμού (dev review)</h1>
      <div style={styles.status}>{connected ? 'connected' : 'disconnected'}</div>

      <div style={styles.summary} data-testid="numeric-review-summary">
        <span>Σύνολο: {counts.total}</span>
        <span data-testid="summary-kept">Keep: {counts.kept}</span>
        <span data-testid="summary-cut">Cut: {counts.cut}</span>
        <span data-testid="summary-undecided">Undecided: {counts.undecided}</span>
        <span style={counts.warnings > 0 ? styles.warningCount : styles.warningCountZero} data-testid="summary-warnings">
          ⚠ no valid max: {counts.warnings}
        </span>
      </div>

      <div style={styles.toolbar}>
        <div style={styles.filterGroup}>
          {(['all', 'keep', 'cut', 'undecided'] as const).map((f) => (
            <button
              key={f}
              type="button"
              data-testid={`filter-${f}`}
              style={filter === f ? styles.filterActive : styles.filterInactive}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <button type="button" data-testid="export-button" style={styles.exportButton} onClick={handleExport}>
          {copied ? 'Copied!' : `Export kept (${counts.kept})`}
        </button>
      </div>

      {questions === null && <div style={styles.status}>loading pool...</div>}

      <div style={styles.rows}>
        {visible.map((q) => {
          const liveValue = liveValues[q.text] ?? 0;
          const verdict = verdicts[q.text];
          return (
            <div key={q.text} style={styles.row} data-testid="numeric-review-row" data-verdict={verdict ?? 'undecided'}>
              <div style={styles.rowHeader}>
                <span style={styles.category}>{q.category}</span>
                {!q.hasValidMax && (
                  <span style={styles.warningBadge} data-testid="warning-badge">
                    ⚠ answer {q.answer} exceeds the round-value table (max {NUMERIC_ROUND_VALUES[NUMERIC_ROUND_VALUES.length - 1]}) - fell back, not a real max
                  </span>
                )}
              </div>
              <div style={styles.questionText} data-testid="question-text">
                {q.text}
              </div>
              <div style={styles.sliderRow}>
                <div style={styles.sliderTrackWrap}>
                  <input
                    type="range"
                    min={0}
                    max={q.max}
                    step={q.sliderStep}
                    value={liveValue}
                    onChange={(e) => handleSliderChange(q.text, q.max, e)}
                    style={styles.slider}
                    data-testid="numeric-review-slider"
                  />
                  <div
                    style={{ ...styles.answerMarker, left: `${q.percent}%` }}
                    data-testid="answer-marker"
                    title={`Σωστή απάντηση: ${q.answer} (${q.percent.toFixed(1)}%)`}
                  />
                </div>
                <div style={styles.sliderReadout}>
                  <span data-testid="live-value">τιμή: {liveValue}</span>
                  <span>0 – {q.max}</span>
                  <span data-testid="answer-percent">
                    σωστή: {q.answer} ({q.percent.toFixed(1)}%)
                  </span>
                </div>
              </div>
              <div style={styles.verdictRow}>
                <button
                  type="button"
                  data-testid="keep-button"
                  style={verdict === 'keep' ? styles.keepActive : styles.keepInactive}
                  onClick={() => setVerdict(q.text, 'keep')}
                >
                  Keep
                </button>
                <button
                  type="button"
                  data-testid="cut-button"
                  style={verdict === 'cut' ? styles.cutActive : styles.cutInactive}
                  onClick={() => setVerdict(q.text, 'cut')}
                >
                  Cut
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    padding: '1.5rem',
    maxWidth: '860px',
    margin: '0 auto',
    minHeight: '100dvh',
    background: 'var(--bg)',
    color: 'var(--text)',
    boxSizing: 'border-box',
  },
  title: { fontSize: '1.5rem', fontWeight: 700, margin: 0 },
  status: { fontSize: '0.9rem', color: 'var(--text-faint)' },
  summary: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1.25rem',
    fontSize: '1rem',
    fontWeight: 600,
    padding: '0.75rem 1rem',
    borderRadius: '0.5rem',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
  },
  warningCount: { color: 'var(--danger-text)' },
  warningCountZero: { color: 'var(--text-dim)' },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '0.75rem',
  },
  filterGroup: { display: 'flex', gap: '0.4rem' },
  filterActive: {
    fontSize: '0.85rem',
    fontWeight: 700,
    padding: '0.4rem 0.8rem',
    borderRadius: '0.5rem',
    border: '2px solid var(--gold)',
    background: 'var(--gold)',
    color: '#14161c',
    textTransform: 'capitalize',
  },
  filterInactive: {
    fontSize: '0.85rem',
    fontWeight: 700,
    padding: '0.4rem 0.8rem',
    borderRadius: '0.5rem',
    border: '2px solid var(--border-strong)',
    background: 'var(--surface)',
    color: 'var(--text-dim)',
    textTransform: 'capitalize',
  },
  exportButton: {
    fontSize: '0.9rem',
    fontWeight: 700,
    padding: '0.5rem 1rem',
    borderRadius: '0.5rem',
    border: 'none',
    background: 'var(--gold)',
    color: '#14161c',
  },
  rows: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.9rem 1rem',
    borderRadius: '0.6rem',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
  },
  rowHeader: { display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' },
  category: {
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--text-faint)',
  },
  warningBadge: {
    fontSize: '0.75rem',
    fontWeight: 700,
    color: 'var(--danger-text)',
    background: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid var(--danger-text)',
    borderRadius: '0.4rem',
    padding: '0.15rem 0.5rem',
  },
  questionText: { fontSize: '1.05rem', fontWeight: 600 },
  sliderRow: { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  sliderTrackWrap: { position: 'relative', width: '100%', padding: '0.6rem 0' },
  slider: { width: '100%', accentColor: 'var(--gold)' },
  // Absolute over the range track - not pixel-perfect against the native
  // thumb's own inset across every browser, but close enough to eyeball
  // "does the correct answer sit where the formula says" (criterion 1).
  answerMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '3px',
    background: 'var(--danger-text)',
    transform: 'translateX(-50%)',
    pointerEvents: 'none',
  },
  sliderReadout: {
    display: 'flex',
    gap: '1.25rem',
    fontSize: '0.85rem',
    fontFamily: 'monospace',
    color: 'var(--text-dim)',
  },
  verdictRow: { display: 'flex', gap: '0.5rem' },
  keepActive: {
    fontSize: '0.85rem',
    fontWeight: 700,
    padding: '0.4rem 1rem',
    borderRadius: '0.5rem',
    border: '2px solid var(--success)',
    background: 'var(--success)',
    color: '#14161c',
  },
  keepInactive: {
    fontSize: '0.85rem',
    fontWeight: 700,
    padding: '0.4rem 1rem',
    borderRadius: '0.5rem',
    border: '2px solid var(--border-strong)',
    background: 'var(--surface)',
    color: 'var(--text-dim)',
  },
  cutActive: {
    fontSize: '0.85rem',
    fontWeight: 700,
    padding: '0.4rem 1rem',
    borderRadius: '0.5rem',
    border: '2px solid var(--danger-text)',
    background: 'var(--danger-text)',
    color: '#14161c',
  },
  cutInactive: {
    fontSize: '0.85rem',
    fontWeight: 700,
    padding: '0.4rem 1rem',
    borderRadius: '0.5rem',
    border: '2px solid var(--border-strong)',
    background: 'var(--surface)',
    color: 'var(--text-dim)',
  },
};
