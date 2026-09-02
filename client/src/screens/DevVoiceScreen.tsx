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

  const visible = useMemo(() => {
    const list = lines ?? [];
    if (filter === 'all') return list;
    if (filter === 'unrated') return list.filter((l) => !ratings[l.hash]);
    return list.filter((l) => ratings[l.hash] === filter);
  }, [lines, ratings, filter]);

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
      </div>

      <div style={styles.toolbar}>
        <div style={styles.filterGroup}>
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
    background: 'var(--deep)',
    color: 'var(--cream)',
    boxSizing: 'border-box',
  },
  title: { fontSize: '1.5rem', fontWeight: 700, margin: 0 },
  status: { fontSize: '0.9rem', color: 'var(--dim)' },
  summary: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1.25rem',
    fontSize: '1rem',
    fontWeight: 600,
    padding: '0.75rem 1rem',
    borderRadius: '0.5rem',
    background: 'var(--panel)',
    border: '1px solid var(--wood)',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '0.75rem',
  },
  filterGroup: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap' },
  filterActive: {
    fontSize: '0.85rem',
    fontWeight: 700,
    padding: '0.4rem 0.8rem',
    borderRadius: '0.5rem',
    border: '2px solid var(--gold)',
    background: 'var(--gold)',
    color: 'var(--ink)',
    textTransform: 'capitalize',
  },
  filterInactive: {
    fontSize: '0.85rem',
    fontWeight: 700,
    padding: '0.4rem 0.8rem',
    borderRadius: '0.5rem',
    border: '2px solid var(--wood)',
    background: 'var(--panel)',
    color: 'var(--dim)',
    textTransform: 'capitalize',
  },
  exportGroup: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  exportButton: {
    fontSize: '0.9rem',
    fontWeight: 700,
    padding: '0.5rem 1rem',
    borderRadius: '0.5rem',
    border: 'none',
    background: 'var(--gold)',
    color: 'var(--ink)',
  },
  rows: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.9rem 1rem',
    borderRadius: '0.6rem',
    background: 'var(--panel)',
    border: '1px solid var(--wood)',
  },
  rowHeader: { display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' },
  moment: {
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--dim)',
  },
  tag: {
    fontSize: '0.75rem',
    fontStyle: 'italic',
    color: 'var(--gold)',
  },
  hash: {
    fontSize: '0.7rem',
    fontFamily: 'monospace',
    color: 'var(--dim)',
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
    border: '2px solid var(--gold)',
    background: 'var(--gold)',
    color: 'var(--ink)',
  },
  rateInactive: {
    fontSize: '0.8rem',
    fontWeight: 700,
    padding: '0.3rem 0.7rem',
    borderRadius: '0.4rem',
    border: '2px solid var(--wood)',
    background: 'var(--panel)',
    color: 'var(--dim)',
  },
};
