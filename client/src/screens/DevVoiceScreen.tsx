import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ClientEvents, ServerEvents, type DevVoiceLinesPayload } from '@game/shared';
import { socket } from '../socket';
import { useSocketConnection } from '../useSocketConnection';

// Task 142 - dev-only voice-line review harness, reachable at /dev/voice and
// linked from nowhere, same "gated" spirit as /dev/numeric. Same PURPOSE and
// same rating scheme/storage as `npm run voice:index`'s generated
// client/public/voice-index.html (dev/generate-voice-index.ts) - a live
// route rather than a static file so it's reachable on the deployed site
// without localhost, but it shares that page's exact localStorage key and
// rating set on purpose: rating a line on either page rates it on both.

type Rating = 'bad' | 'okish' | 'good' | 'genius';
type Filter = 'all' | 'unrated' | Rating;

const RATINGS: Rating[] = ['bad', 'okish', 'good', 'genius'];
const RATING_LABELS: Record<Rating, string> = { bad: 'Bad', okish: 'Okish', good: 'Good', genius: 'Genius' };
const STORAGE_KEY = 'voiceIndexRatings';

// Task 143 - localStorage ratings don't carry over from wherever the first
// 186 lines were rated (a different origin - localhost/file://). A moment
// filter lets Argyrios jump straight to just the lines that are actually
// new, by MOMENT rather than by rating, so the "unrated" filter above isn't
// load-bearing for that anymore.
const ALL_MOMENTS = 'ALL';
const PRESET_DRAW_NUMERIC = '__preset_draw_numeric__';
// The 9 draw/numeric moments (Task 138/139) plus Η Συκοφαντία's STAGE_INTRO
// pool. That pool's moment key is generated at runtime by
// collectVoiceLineEntries (server/src/socrates.ts) from whichever stage
// number it meets FIRST while iterating STAGE_INTRO_LINES - it's keyed
// under both stage 3 (quiz) and stage 4 (full show) with the SAME array,
// and object key iteration order for integer-like keys is ascending, so
// stage 3 always wins and "stage 4" never appears as its own moment.
const PRESET_DRAW_NUMERIC_MOMENTS = [
  'DRAW_INTRO',
  'NOBODY_GUESSED',
  'EVERYBODY_GUESSED',
  'SPLIT_GUESS',
  'DRAW_WINNER',
  'EXACT_HIT',
  'WILDLY_OFF',
  'ALL_CLUSTERED',
  'NOBODY_CLOSE',
  'STAGE_INTRO (stage 3)',
];

function loadRatings(): Record<string, Rating> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {}; // private mode / quota / corrupt JSON - start clean rather than crash
  }
}

function saveRatings(ratings: Record<string, Rating>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ratings));
  } catch {
    // best-effort - a lost save just means this round's ratings don't persist
  }
}

export default function DevVoiceScreen() {
  const { connected } = useSocketConnection();
  const [lines, setLines] = useState<DevVoiceLinesPayload['lines'] | null>(null);
  const [ratings, setRatings] = useState<Record<string, Rating>>(() => loadRatings());
  const [filter, setFilter] = useState<Filter>('unrated');
  const [momentSelection, setMomentSelection] = useState<string>(ALL_MOMENTS);
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    function handleLines(payload: DevVoiceLinesPayload) {
      setLines(payload.lines);
    }
    socket.on(ServerEvents.DEV_VOICE_LINES, handleLines);
    return () => {
      socket.off(ServerEvents.DEV_VOICE_LINES, handleLines);
    };
  }, []);

  useEffect(() => {
    if (connected) {
      socket.emit(ClientEvents.DEV_GET_VOICE_LINES);
    }
  }, [connected]);

  function setRating(hash: string, rating: Rating) {
    setRatings((current) => {
      // A second click on the already-active rating clears it back to
      // unrated - "toggle", not a one-way stamp.
      const next = { ...current };
      if (current[hash] === rating) {
        delete next[hash];
      } else {
        next[hash] = rating;
      }
      saveRatings(next);
      return next;
    });
  }

  const counts = useMemo(() => {
    const list = lines ?? [];
    const rated = list.filter((l) => ratings[l.hash]).length;
    return { total: list.length, rated, unrated: list.length - rated };
  }, [lines, ratings]);

  // Every distinct moment key actually present in the data, alphabetized -
  // NOT hardcoded, so this can never drift from what the server sends.
  const moments = useMemo(() => {
    const set = new Set((lines ?? []).map((l) => l.moment));
    return Array.from(set).sort();
  }, [lines]);

  // null = no moment restriction ("all"); otherwise the exact set of moment
  // keys currently allowed through (one, for a single selection, or the
  // draw/numeric + Συκοφαντία preset's ten).
  const activeMoments = useMemo(() => {
    if (momentSelection === ALL_MOMENTS) return null;
    if (momentSelection === PRESET_DRAW_NUMERIC) return new Set(PRESET_DRAW_NUMERIC_MOMENTS);
    return new Set([momentSelection]);
  }, [momentSelection]);

  const visible = useMemo(() => {
    let list = lines ?? [];
    if (activeMoments) {
      list = list.filter((l) => activeMoments.has(l.moment));
    }
    // The rating filter stays independent of the moment filter - both apply
    // together (intersection), same as any two filters that don't target
    // the same field.
    if (filter === 'unrated') {
      list = list.filter((l) => !ratings[l.hash]);
    } else if (filter !== 'all') {
      list = list.filter((l) => ratings[l.hash] === filter);
    }
    return list;
  }, [lines, ratings, filter, activeMoments]);

  function handleExport() {
    const groups = RATINGS.map((r) => ({ rating: r, lines: [] as string[] }));
    for (const line of lines ?? []) {
      const rating = ratings[line.hash];
      if (!rating) continue;
      const group = groups.find((g) => g.rating === rating);
      group?.lines.push(line.line);
    }
    const text = groups
      .filter((g) => g.lines.length > 0)
      .map((g) => `== ${RATING_LABELS[g.rating].toUpperCase()} (${g.lines.length}) ==\n${g.lines.join('\n')}`)
      .join('\n\n');
    if (!text) {
      setCopyStatus('Nothing rated yet.');
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => setCopyStatus(`Copied ${counts.rated} rated line(s) to clipboard.`))
      .catch(() => setCopyStatus('Clipboard unavailable - could not copy.'));
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Φωνή Σωκράτη (dev review)</h1>
      <div style={styles.status}>{connected ? 'connected' : 'disconnected'}</div>

      <div style={styles.summary}>
        <span>Σύνολο: {counts.total}</span>
        <span>Rated: {counts.rated}</span>
        <span>Unrated: {counts.unrated}</span>
        <span>Showing: {visible.length}</span>
      </div>

      <div style={styles.toolbar}>
        <div style={styles.filterGroup}>
          <label style={styles.momentLabel}>
            Moment:{' '}
            <select
              value={momentSelection}
              onChange={(e) => setMomentSelection(e.target.value)}
              style={styles.momentSelect}
            >
              <option value={ALL_MOMENTS}>All ({counts.total})</option>
              <option value={PRESET_DRAW_NUMERIC}>Draw/numeric + Συκοφαντία preset</option>
              {moments.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          {(['all', 'unrated', ...RATINGS] as const).map((f) => (
            <button
              key={f}
              type="button"
              style={filter === f ? styles.filterActive : styles.filterInactive}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'unrated' ? 'Unrated' : RATING_LABELS[f]}
            </button>
          ))}
        </div>
        <div style={styles.exportGroup}>
          <button type="button" style={styles.exportButton} onClick={handleExport}>
            Export rated lines
          </button>
          {copyStatus && <span style={styles.status}>{copyStatus}</span>}
        </div>
      </div>

      {lines === null && <div style={styles.status}>loading lines...</div>}

      <div style={styles.rows}>
        {visible.map((entry) => {
          const rating = ratings[entry.hash];
          return (
            <div key={entry.hash} style={styles.row}>
              <div style={styles.rowHeader}>
                <span style={styles.moment}>{entry.moment}</span>
                <span style={styles.tag}>{entry.tag ?? '(no tag)'}</span>
                <span style={styles.hash}>{entry.hash}</span>
              </div>
              <div style={styles.lineText}>{entry.line}</div>
              <div style={styles.rowFooter}>
                <audio controls preload="none" src={`/voice/${entry.hash}.mp3`} style={styles.audio} />
                <div style={styles.rateGroup}>
                  {RATINGS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      style={rating === r ? styles.rateActive : styles.rateInactive}
                      onClick={() => setRating(entry.hash, r)}
                    >
                      {RATING_LABELS[r]}
                    </button>
                  ))}
                </div>
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
    maxWidth: '900px',
    margin: '0 auto',
    minHeight: '100dvh',
    background: 'var(--night-0)',
    color: 'var(--marble)',
    boxSizing: 'border-box',
  },
  title: { fontSize: '1.5rem', fontWeight: 700, margin: 0 },
  status: { fontSize: '0.9rem', color: 'var(--marble-3)' },
  summary: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1.25rem',
    fontSize: '1rem',
    fontWeight: 600,
    padding: '0.75rem 1rem',
    borderRadius: '0.5rem',
    background: 'var(--marble)',
    border: '1px solid var(--marble-3)',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '0.75rem',
  },
  filterGroup: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' },
  momentLabel: { fontSize: '0.85rem', fontWeight: 600, color: 'var(--marble-3)', marginRight: '0.4rem' },
  momentSelect: {
    fontSize: '0.85rem',
    fontWeight: 600,
    padding: '0.35rem 0.5rem',
    borderRadius: '0.5rem',
    border: '2px solid var(--marble-3)',
    background: 'var(--marble)',
    color: 'var(--carve)',
  },
  filterActive: {
    fontSize: '0.85rem',
    fontWeight: 700,
    padding: '0.4rem 0.8rem',
    borderRadius: '0.5rem',
    border: '2px solid var(--wine-2)',
    background: 'var(--wine-2)',
    color: 'var(--carve)',
    textTransform: 'capitalize',
  },
  filterInactive: {
    fontSize: '0.85rem',
    fontWeight: 700,
    padding: '0.4rem 0.8rem',
    borderRadius: '0.5rem',
    border: '2px solid var(--marble-3)',
    background: 'var(--marble)',
    color: 'var(--marble-3)',
    textTransform: 'capitalize',
  },
  exportGroup: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  exportButton: {
    fontSize: '0.9rem',
    fontWeight: 700,
    padding: '0.5rem 1rem',
    borderRadius: '0.5rem',
    border: 'none',
    background: 'var(--wine-2)',
    color: 'var(--carve)',
  },
  rows: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.9rem 1rem',
    borderRadius: '0.6rem',
    background: 'var(--marble)',
    border: '1px solid var(--marble-3)',
  },
  rowHeader: { display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' },
  moment: {
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--marble-3)',
  },
  tag: {
    fontSize: '0.75rem',
    fontStyle: 'italic',
    color: 'var(--wine-2)',
  },
  hash: {
    fontSize: '0.7rem',
    fontFamily: 'monospace',
    color: 'var(--marble-3)',
  },
  lineText: { fontSize: '1.05rem', fontWeight: 600 },
  rowFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem' },
  audio: { height: '32px' },
  rateGroup: { display: 'flex', gap: '0.4rem' },
  rateActive: {
    fontSize: '0.8rem',
    fontWeight: 700,
    padding: '0.3rem 0.7rem',
    borderRadius: '0.4rem',
    border: '2px solid var(--wine-2)',
    background: 'var(--wine-2)',
    color: 'var(--carve)',
  },
  rateInactive: {
    fontSize: '0.8rem',
    fontWeight: 700,
    padding: '0.3rem 0.7rem',
    borderRadius: '0.4rem',
    border: '2px solid var(--marble-3)',
    background: 'var(--marble)',
    color: 'var(--marble-3)',
  },
};
