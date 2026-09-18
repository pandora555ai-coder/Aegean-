import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ClientEvents, ServerEvents, stripPlaceholders, type DevVoiceAuditionPayload } from '@game/shared';
import { socket } from '../socket';
import { useSocketConnection } from '../useSocketConnection';

// Task 269 - "listen before you swap". /dev/voice and /dev/intro-lines both
// hardcode /voice/<hash>.mp3, which resolves to client/public/voice - the
// SYMLINK into /opt/party-game (see CLAUDE.md's Voice section). Neither can
// reach a freshly generated clip sitting in client/public/voice-staging
// (Task 266) without running dev/voice/swap-staging.sh first - backwards
// for auditioning 201 vocatives and 36 regenerations before they ship.
//
// This page is READ-ONLY: it never writes, deletes, moves, or generates
// anything (no ElevenLabs call, no swap-staging.sh, nothing under
// /opt/party-game) - server/src/voiceAudition.ts only ever statSyncs both
// directories. Reachable at /dev/voice-audition, same Caddy basic-auth
// prefix as every other /dev/* route (no app-level auth code needed - see
// /dev/intro-lines, which relies on the exact same thing).
//
// Deliberately built on the SAME data source as /dev/voice
// (collectVoiceLineEntries, one walk over every pool) so it can never
// disagree about what an "active line" is, and shaped as one row per hash -
// the note-for-the-record ask (a future mass keep/kill rating pass over the
// whole bank) is DevVoiceScreen's own rating scheme (a Rating type + a
// localStorage-backed ratings map + a row of buttons per entry) bolted onto
// this exact same row shape, not a rewrite. Not built here, on purpose.

type SourceFilter = 'all' | 'bank' | 'staging' | 'both' | 'neither';

const SOURCE_FILTERS: { key: SourceFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'bank', label: 'In bank' },
  { key: 'staging', label: 'In staging' },
  { key: 'both', label: 'In both' },
  { key: 'neither', label: 'Neither (not generated)' },
];

const ALL_MOMENTS = 'ALL';

function formatDuration(ms: number | null): string {
  return ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`;
}

export default function DevVoiceAuditionScreen() {
  const { connected } = useSocketConnection();
  const [entries, setEntries] = useState<DevVoiceAuditionPayload['entries'] | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [momentSelection, setMomentSelection] = useState<string>(ALL_MOMENTS);

  useEffect(() => {
    function handleAudition(payload: DevVoiceAuditionPayload) {
      setEntries(payload.entries);
    }
    socket.on(ServerEvents.DEV_VOICE_AUDITION, handleAudition);
    return () => {
      socket.off(ServerEvents.DEV_VOICE_AUDITION, handleAudition);
    };
  }, []);

  useEffect(() => {
    if (connected) {
      socket.emit(ClientEvents.DEV_GET_VOICE_AUDITION);
    }
  }, [connected]);

  const counts = useMemo(() => {
    const list = entries ?? [];
    return {
      total: list.length,
      bank: list.filter((e) => e.inBank).length,
      staging: list.filter((e) => e.inStaging).length,
      both: list.filter((e) => e.inBank && e.inStaging).length,
      neither: list.filter((e) => !e.inBank && !e.inStaging).length,
    };
  }, [entries]);

  // Every distinct pool key actually present in the data, alphabetized - not
  // hardcoded, so this can never drift from what the server sends (the same
  // reasoning /dev/voice's own moment dropdown already uses).
  const moments = useMemo(() => {
    const set = new Set((entries ?? []).map((e) => e.moment));
    return Array.from(set).sort();
  }, [entries]);

  const visible = useMemo(() => {
    let list = entries ?? [];
    if (momentSelection !== ALL_MOMENTS) {
      list = list.filter((e) => e.moment === momentSelection);
    }
    if (sourceFilter === 'bank') list = list.filter((e) => e.inBank);
    else if (sourceFilter === 'staging') list = list.filter((e) => e.inStaging);
    else if (sourceFilter === 'both') list = list.filter((e) => e.inBank && e.inStaging);
    else if (sourceFilter === 'neither') list = list.filter((e) => !e.inBank && !e.inStaging);
    return list;
  }, [entries, sourceFilter, momentSelection]);

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Ακρόαση σταδίου (dev, read-only)</h1>
      <div style={styles.status}>{connected ? 'connected' : 'disconnected'}</div>

      <div style={styles.summary}>
        <span data-testid="voice-audition-count-total">Σύνολο: {counts.total}</span>
        <span data-testid="voice-audition-count-bank">Bank: {counts.bank}</span>
        <span data-testid="voice-audition-count-staging">Staging: {counts.staging}</span>
        <span data-testid="voice-audition-count-both">Both: {counts.both}</span>
        <span data-testid="voice-audition-count-neither">Neither: {counts.neither}</span>
        <span data-testid="voice-audition-count-showing">Showing: {visible.length}</span>
      </div>

      <div style={styles.toolbar}>
        <div style={styles.filterGroup}>
          <label style={styles.momentLabel}>
            Pool:{' '}
            <select value={momentSelection} onChange={(e) => setMomentSelection(e.target.value)} style={styles.momentSelect}>
              <option value={ALL_MOMENTS}>All ({counts.total})</option>
              {moments.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          {SOURCE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              data-testid={`voice-audition-filter-${f.key}`}
              style={sourceFilter === f.key ? styles.filterActive : styles.filterInactive}
              onClick={() => setSourceFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {entries === null && <div style={styles.status}>loading entries...</div>}

      <div style={styles.rows}>
        {visible.map((entry) => {
          const spoken = entry.tag ? `${entry.tag} ${stripPlaceholders(entry.template)}` : stripPlaceholders(entry.template);
          const status = entry.inBank && entry.inStaging ? 'BOTH' : entry.inBank ? 'BANK ONLY' : entry.inStaging ? 'STAGING ONLY' : 'NEITHER';
          return (
            <div key={entry.hash} style={styles.row} data-testid="voice-audition-row" data-hash={entry.hash} data-status={status}>
              <div style={styles.rowHeader}>
                <span style={styles.moment}>{entry.moment}</span>
                <span style={styles.tag}>{entry.tag ?? '(no tag)'}</span>
                <span style={styles.hash}>{entry.hash}</span>
                <span style={status === 'NEITHER' ? styles.statusMissing : styles.statusPresent} data-testid="voice-audition-status">
                  {status}
                </span>
              </div>
              <div style={styles.lineText} data-testid="voice-audition-text">
                {spoken}
              </div>
              <div style={styles.sources}>
                <div style={styles.source}>
                  <span style={styles.sourceLabel} data-testid="voice-audition-bank-duration">
                    Bank ({formatDuration(entry.bankDurationMs)})
                  </span>
                  {entry.inBank ? (
                    <audio controls preload="none" src={`/voice/${entry.hash}.mp3`} style={styles.audio} data-testid="voice-audition-bank-audio" />
                  ) : (
                    <span style={styles.sourceAbsent}>not in bank</span>
                  )}
                </div>
                <div style={styles.source}>
                  <span style={styles.sourceLabel} data-testid="voice-audition-staging-duration">
                    Staging ({formatDuration(entry.stagingDurationMs)})
                  </span>
                  {entry.inStaging ? (
                    <audio
                      controls
                      preload="none"
                      src={`/voice-staging/${entry.hash}.mp3`}
                      style={styles.audio}
                      data-testid="voice-audition-staging-audio"
                    />
                  ) : (
                    <span style={styles.sourceAbsent}>not in staging</span>
                  )}
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
  },
  filterInactive: {
    fontSize: '0.85rem',
    fontWeight: 700,
    padding: '0.4rem 0.8rem',
    borderRadius: '0.5rem',
    border: '2px solid var(--marble-3)',
    background: 'var(--marble)',
    color: 'var(--marble-3)',
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
  tag: { fontSize: '0.75rem', fontStyle: 'italic', color: 'var(--wine-2)' },
  hash: { fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--marble-3)' },
  statusPresent: {
    fontSize: '0.7rem',
    fontWeight: 700,
    padding: '0.15rem 0.5rem',
    borderRadius: '0.3rem',
    background: 'var(--olive)',
    color: 'var(--carve)',
  },
  statusMissing: {
    fontSize: '0.7rem',
    fontWeight: 700,
    padding: '0.15rem 0.5rem',
    borderRadius: '0.3rem',
    background: 'var(--marble-3)',
    color: 'var(--carve)',
  },
  lineText: { fontSize: '1.05rem', fontWeight: 600 },
  sources: { display: 'flex', flexWrap: 'wrap', gap: '1.2rem' },
  source: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  sourceLabel: { fontSize: '0.75rem', fontWeight: 700, color: 'var(--marble-3)' },
  sourceAbsent: { fontSize: '0.8rem', fontStyle: 'italic', color: 'var(--marble-3)' },
  audio: { height: '32px' },
};
