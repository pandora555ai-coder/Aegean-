import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  ClientEvents,
  ServerEvents,
  stripPlaceholders,
  type DevVoiceAuditionEntry,
  type DevVoiceAuditionPayload,
  type DevVoiceLineActionResultPayload,
} from '@game/shared';
import { socket } from '../socket';
import { useSocketConnection } from '../useSocketConnection';

// Task 269 - "listen before you swap". /dev/voice and /dev/intro-lines both
// hardcode /voice/<hash>.mp3, which resolves to client/public/voice - the
// SYMLINK into /opt/party-game (see CLAUDE.md's Voice section). Neither can
// reach a freshly generated clip sitting in client/public/voice-staging
// (Task 266) without running dev/voice/swap-staging.sh first.
//
// Task 271 - now also the line audition & DELETION tool. Deleting a line
// does two independent things, both server-side (server/src/voiceDeletions.ts):
// (1) excludes the line's TEMPLATE from every pick* function in
// server/src/socrates.ts (pickLine/pickSequence/buildCoronationSequence) so it
// can never be selected in a game again, in THIS process, immediately - no
// restart needed; (2) moves (never unlinks) its mp3 out of bank/staging
// into client/public/voice-deleted/, so a mistake is recoverable via
// Restore. #1 never depends on filesystem permissions; #2 can only move a
// BANK file when this process owns /opt/party-game - it does not when run
// as a local dev server (argyrios), but DOES once deployed (the live
// server runs as `partygame`, the bank's own owner) - a stalled bank move
// is reported plainly (`bankMoveStatus: 'pending-no-access'`), never
// silently dropped or forced.
//
// Reachable at /dev/voice-audition, same Caddy basic-auth prefix as every
// other /dev/* route - no app-level auth code needed.
//
// One row per LINE already (collectVoiceLineEntries dedupes by exact line
// text - bank/staging/deleted are PROPERTIES of one row, never a second
// row). "Kept" (mark-reviewed, no file touched) plus "Deleted" together
// make up `status`, the same field a future mass rating pass would extend
// (e.g. a genius/bad scale) rather than restructure.

type SourceFilter = 'all' | 'bank' | 'staging' | 'both' | 'neither';
type View = 'active' | 'deleted';

const SOURCE_FILTERS: { key: SourceFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'bank', label: 'In bank' },
  { key: 'staging', label: 'In staging' },
  { key: 'both', label: 'In both' },
  { key: 'neither', label: 'Neither (not generated)' },
];

const ALL_MOMENTS = 'ALL';
const ALL_TAGS = 'ALL';
const NO_TAG = '(no tag)';

function formatDuration(ms: number | null): string {
  return ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`;
}

function spokenTextOf(entry: DevVoiceAuditionEntry): string {
  const stripped = stripPlaceholders(entry.template);
  return entry.tag ? `${entry.tag} ${stripped}` : stripped;
}

export default function DevVoiceAuditionScreen() {
  const { connected } = useSocketConnection();
  const [entries, setEntries] = useState<DevVoiceAuditionPayload['entries'] | null>(null);
  const [view, setView] = useState<View>('active');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [momentSelection, setMomentSelection] = useState<string>(ALL_MOMENTS);
  const [tagSelection, setTagSelection] = useState<string>(ALL_TAGS);
  const [search, setSearch] = useState('');
  const [actionMessage, setActionMessage] = useState<DevVoiceLineActionResultPayload | null>(null);
  const [confirmingDeleteHash, setConfirmingDeleteHash] = useState<string | null>(null);

  useEffect(() => {
    function handleAudition(payload: DevVoiceAuditionPayload) {
      setEntries(payload.entries);
    }
    function handleActionResult(payload: DevVoiceLineActionResultPayload) {
      setActionMessage(payload);
      setConfirmingDeleteHash(null);
    }
    socket.on(ServerEvents.DEV_VOICE_AUDITION, handleAudition);
    socket.on(ServerEvents.DEV_VOICE_LINE_ACTION_RESULT, handleActionResult);
    return () => {
      socket.off(ServerEvents.DEV_VOICE_AUDITION, handleAudition);
      socket.off(ServerEvents.DEV_VOICE_LINE_ACTION_RESULT, handleActionResult);
    };
  }, []);

  useEffect(() => {
    if (connected) {
      socket.emit(ClientEvents.DEV_GET_VOICE_AUDITION);
    }
  }, [connected]);

  // Requirement 1 - true distinct count. collectVoiceLineEntries (the one
  // source both this page and dev/generate-voice-lines.ts share) already
  // dedupes by exact line TEXT, so `entries.length` IS the distinct-line
  // count - bank/staging/both are properties of these SAME rows, never a
  // second row. Verified here too (not just trusted): duplicate hashes
  // would collapse in this Map and shrink `distinctHashes` below `total`.
  const counts = useMemo(() => {
    const list = entries ?? [];
    const active = list.filter((e) => e.status !== 'deleted');
    const distinctHashes = new Set(list.map((e) => e.hash)).size;
    const judged = list.filter((e) => e.status !== 'active').length;
    return {
      total: list.length,
      distinctHashes,
      bank: active.filter((e) => e.inBank).length,
      staging: active.filter((e) => e.inStaging).length,
      both: active.filter((e) => e.inBank && e.inStaging).length,
      noFile: active.filter((e) => !e.inBank && !e.inStaging).length,
      deleted: list.filter((e) => e.status === 'deleted').length,
      kept: list.filter((e) => e.status === 'kept').length,
      judged,
      remaining: list.length - judged,
    };
  }, [entries]);

  // Requirement 6's own "which pools are at risk" - every pool (moment)
  // currently down to exactly 1 ACTIVE (non-deleted) line, one delete away
  // from going silent.
  const atRiskMoments = useMemo(() => {
    const list = (entries ?? []).filter((e) => e.status !== 'deleted');
    const byMoment = new Map<string, number>();
    for (const e of list) byMoment.set(e.moment, (byMoment.get(e.moment) ?? 0) + 1);
    return [...byMoment.entries()]
      .filter(([, n]) => n === 1)
      .map(([m]) => m)
      .sort();
  }, [entries]);

  const moments = useMemo(() => {
    const set = new Set((entries ?? []).map((e) => e.moment));
    return Array.from(set).sort();
  }, [entries]);

  const tags = useMemo(() => {
    const set = new Set((entries ?? []).map((e) => e.tag ?? NO_TAG));
    return Array.from(set).sort();
  }, [entries]);

  const visible = useMemo(() => {
    let list = (entries ?? []).filter((e) => (view === 'deleted' ? e.status === 'deleted' : e.status !== 'deleted'));
    if (momentSelection !== ALL_MOMENTS) list = list.filter((e) => e.moment === momentSelection);
    if (tagSelection !== ALL_TAGS) list = list.filter((e) => (e.tag ?? NO_TAG) === tagSelection);
    if (view === 'active') {
      if (sourceFilter === 'bank') list = list.filter((e) => e.inBank);
      else if (sourceFilter === 'staging') list = list.filter((e) => e.inStaging);
      else if (sourceFilter === 'both') list = list.filter((e) => e.inBank && e.inStaging);
      else if (sourceFilter === 'neither') list = list.filter((e) => !e.inBank && !e.inStaging);
    }
    const needle = search.trim().toLowerCase();
    if (needle) {
      list = list.filter((e) => spokenTextOf(e).toLowerCase().includes(needle));
    }
    return list;
  }, [entries, view, sourceFilter, momentSelection, tagSelection, search]);

  // Would deleting `hash` leave its pool with zero ACTIVE lines? Computed
  // client-side from the already-loaded list - no round trip needed to warn.
  function wouldEmptyPool(entry: DevVoiceAuditionEntry): boolean {
    const siblings = (entries ?? []).filter((e) => e.moment === entry.moment && e.status !== 'deleted');
    return siblings.length <= 1;
  }

  function requestDelete(entry: DevVoiceAuditionEntry) {
    if (wouldEmptyPool(entry) && confirmingDeleteHash !== entry.hash) {
      setConfirmingDeleteHash(entry.hash);
      return;
    }
    socket.emit(ClientEvents.DEV_DELETE_VOICE_LINE, { hash: entry.hash });
  }

  function restore(hash: string) {
    socket.emit(ClientEvents.DEV_RESTORE_VOICE_LINE, { hash });
  }

  function toggleKept(entry: DevVoiceAuditionEntry) {
    socket.emit(ClientEvents.DEV_MARK_VOICE_LINE, { hash: entry.hash, status: entry.status === 'kept' ? 'active' : 'kept' });
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Ακρόαση σταδίου</h1>
      <div style={styles.status}>{connected ? 'connected' : 'disconnected'}</div>

      {actionMessage && (
        <div style={actionMessage.ok ? styles.bannerOk : styles.bannerError} data-testid="voice-audition-action-banner">
          [{actionMessage.action}] {actionMessage.hash} — {actionMessage.message}
        </div>
      )}

      <div style={styles.summary}>
        <span data-testid="voice-audition-count-total">Σύνολο (distinct): {counts.total}</span>
        <span data-testid="voice-audition-count-distinct-hashes">Distinct hashes: {counts.distinctHashes}</span>
        <span data-testid="voice-audition-count-bank">Bank: {counts.bank}</span>
        <span data-testid="voice-audition-count-staging">Staging: {counts.staging}</span>
        <span data-testid="voice-audition-count-both">Both: {counts.both}</span>
        <span data-testid="voice-audition-count-nofile">No file: {counts.noFile}</span>
        <span data-testid="voice-audition-count-deleted">Deleted: {counts.deleted}</span>
        <span data-testid="voice-audition-count-showing">Showing: {visible.length}</span>
      </div>

      <div style={styles.summary}>
        <span data-testid="voice-audition-progress">
          Judged: {counts.judged} / {counts.total} ({counts.total > 0 ? Math.round((counts.judged / counts.total) * 100) : 0}%) —
          Remaining: {counts.remaining}
        </span>
      </div>

      {atRiskMoments.length > 0 && (
        <div style={styles.atRisk} data-testid="voice-audition-at-risk">
          ⚠ Pools one delete away from silent: {atRiskMoments.join(', ')}
        </div>
      )}

      <div style={styles.toolbar}>
        <div style={styles.filterGroup}>
          <button
            type="button"
            data-testid="voice-audition-view-active"
            style={view === 'active' ? styles.filterActive : styles.filterInactive}
            onClick={() => setView('active')}
          >
            Active
          </button>
          <button
            type="button"
            data-testid="voice-audition-view-deleted"
            style={view === 'deleted' ? styles.filterActive : styles.filterInactive}
            onClick={() => setView('deleted')}
          >
            Deleted ({counts.deleted})
          </button>
        </div>
      </div>

      <div style={styles.toolbar}>
        <div style={styles.filterGroup}>
          <input
            type="text"
            placeholder="Search spoken text (e.g. Δίκη, μαθητ)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={styles.searchInput}
            data-testid="voice-audition-search"
          />
          <label style={styles.momentLabel}>
            Pool:{' '}
            <select value={momentSelection} onChange={(e) => setMomentSelection(e.target.value)} style={styles.momentSelect} data-testid="voice-audition-pool-select">
              <option value={ALL_MOMENTS}>All ({counts.total})</option>
              {moments.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label style={styles.momentLabel}>
            Tag:{' '}
            <select value={tagSelection} onChange={(e) => setTagSelection(e.target.value)} style={styles.momentSelect} data-testid="voice-audition-tag-select">
              <option value={ALL_TAGS}>All</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {view === 'active' && (
        <div style={styles.toolbar}>
          <div style={styles.filterGroup}>
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
      )}

      {entries === null && <div style={styles.status}>loading entries...</div>}

      <div style={styles.rows}>
        {visible.map((entry) => {
          const spoken = spokenTextOf(entry);
          const sourceStatus = entry.inBank && entry.inStaging ? 'BOTH' : entry.inBank ? 'BANK ONLY' : entry.inStaging ? 'STAGING ONLY' : 'NO FILE';
          const risky = view === 'active' && wouldEmptyPool(entry);
          return (
            <div key={entry.hash} style={styles.row} data-testid="voice-audition-row" data-hash={entry.hash} data-status={sourceStatus}>
              <div style={styles.rowHeader}>
                <span style={styles.moment}>{entry.moment}</span>
                <span style={styles.tag}>{entry.tag ?? NO_TAG}</span>
                <span style={styles.hash}>{entry.hash}</span>
                <span style={sourceStatus === 'NO FILE' ? styles.statusMissing : styles.statusPresent} data-testid="voice-audition-status">
                  {sourceStatus}
                </span>
                {entry.status === 'kept' && <span style={styles.statusKept}>KEPT</span>}
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
                {view === 'deleted' && (
                  <div style={styles.source}>
                    <span style={styles.sourceLabel} data-testid="voice-audition-deleted-duration">
                      Deleted ({formatDuration(entry.deletedDurationMs)})
                    </span>
                    {entry.inDeleted ? (
                      <audio
                        controls
                        preload="none"
                        src={`/voice-deleted/${entry.hash}.mp3`}
                        style={styles.audio}
                        data-testid="voice-audition-deleted-audio"
                      />
                    ) : (
                      <span style={styles.sourceAbsent}>no archived file</span>
                    )}
                  </div>
                )}
              </div>
              {view === 'deleted' ? (
                <div style={styles.rowFooter}>
                  <span style={styles.moveStatus}>
                    bank: {entry.bankMoveStatus ?? 'n/a'} · staging: {entry.stagingMoveStatus ?? 'n/a'}
                  </span>
                  <button type="button" style={styles.restoreButton} data-testid="voice-audition-restore" onClick={() => restore(entry.hash)}>
                    Restore
                  </button>
                </div>
              ) : (
                <div style={styles.rowFooter}>
                  <button type="button" style={styles.keepButton} data-testid="voice-audition-keep" onClick={() => toggleKept(entry)}>
                    {entry.status === 'kept' ? 'Un-mark' : '✓ Keep (reviewed)'}
                  </button>
                  {confirmingDeleteHash === entry.hash ? (
                    <>
                      <span style={styles.riskWarning} data-testid="voice-audition-empty-pool-warning">
                        ⚠ Last line in «{entry.moment}» — deleting makes this moment SILENT.
                      </span>
                      <button type="button" style={styles.deleteButtonConfirm} data-testid="voice-audition-delete-confirm" onClick={() => requestDelete(entry)}>
                        Confirm delete
                      </button>
                      <button type="button" style={styles.keepButton} onClick={() => setConfirmingDeleteHash(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      style={risky ? styles.deleteButtonRisky : styles.deleteButton}
                      data-testid="voice-audition-delete"
                      onClick={() => requestDelete(entry)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
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
    maxWidth: '960px',
    margin: '0 auto',
    minHeight: '100dvh',
    background: 'var(--night-0)',
    color: 'var(--marble)',
    boxSizing: 'border-box',
  },
  title: { fontSize: '1.5rem', fontWeight: 700, margin: 0 },
  status: { fontSize: '0.9rem', color: 'var(--marble-3)' },
  bannerOk: {
    fontSize: '0.85rem',
    fontWeight: 600,
    padding: '0.5rem 0.75rem',
    borderRadius: '0.4rem',
    background: 'var(--olive)',
    color: 'var(--carve)',
  },
  bannerError: {
    fontSize: '0.85rem',
    fontWeight: 600,
    padding: '0.5rem 0.75rem',
    borderRadius: '0.4rem',
    background: 'var(--wine)',
    color: 'var(--marble)',
  },
  summary: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1.25rem',
    fontSize: '0.95rem',
    fontWeight: 600,
    padding: '0.75rem 1rem',
    borderRadius: '0.5rem',
    background: 'var(--marble)',
    border: '1px solid var(--marble-3)',
    color: 'var(--carve)',
  },
  atRisk: {
    fontSize: '0.85rem',
    fontWeight: 600,
    padding: '0.5rem 0.75rem',
    borderRadius: '0.4rem',
    background: 'var(--ember)',
    color: 'var(--carve)',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '0.75rem',
  },
  filterGroup: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' },
  searchInput: {
    fontSize: '0.85rem',
    padding: '0.35rem 0.6rem',
    borderRadius: '0.5rem',
    border: '2px solid var(--marble-3)',
    background: 'var(--marble)',
    color: 'var(--carve)',
    minWidth: '260px',
  },
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
  statusKept: {
    fontSize: '0.7rem',
    fontWeight: 700,
    padding: '0.15rem 0.5rem',
    borderRadius: '0.3rem',
    background: 'var(--wine-2)',
    color: 'var(--carve)',
  },
  lineText: { fontSize: '1.05rem', fontWeight: 600, color: 'var(--carve)' },
  sources: { display: 'flex', flexWrap: 'wrap', gap: '1.2rem' },
  source: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  sourceLabel: { fontSize: '0.75rem', fontWeight: 700, color: 'var(--marble-3)' },
  sourceAbsent: { fontSize: '0.8rem', fontStyle: 'italic', color: 'var(--marble-3)' },
  audio: { height: '32px' },
  rowFooter: { display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' },
  moveStatus: { fontSize: '0.75rem', color: 'var(--marble-3)' },
  riskWarning: { fontSize: '0.8rem', fontWeight: 700, color: 'var(--wine)' },
  keepButton: {
    fontSize: '0.8rem',
    fontWeight: 700,
    padding: '0.3rem 0.7rem',
    borderRadius: '0.4rem',
    border: '2px solid var(--marble-3)',
    background: 'var(--marble)',
    color: 'var(--carve)',
  },
  deleteButton: {
    fontSize: '0.8rem',
    fontWeight: 700,
    padding: '0.3rem 0.7rem',
    borderRadius: '0.4rem',
    border: '2px solid var(--wine)',
    background: 'var(--marble)',
    color: 'var(--wine)',
  },
  deleteButtonRisky: {
    fontSize: '0.8rem',
    fontWeight: 700,
    padding: '0.3rem 0.7rem',
    borderRadius: '0.4rem',
    border: '2px solid var(--wine)',
    background: 'var(--wine)',
    color: 'var(--marble)',
  },
  deleteButtonConfirm: {
    fontSize: '0.8rem',
    fontWeight: 700,
    padding: '0.3rem 0.7rem',
    borderRadius: '0.4rem',
    border: '2px solid var(--wine)',
    background: 'var(--wine)',
    color: 'var(--marble)',
  },
  restoreButton: {
    fontSize: '0.8rem',
    fontWeight: 700,
    padding: '0.3rem 0.7rem',
    borderRadius: '0.4rem',
    border: '2px solid var(--olive)',
    background: 'var(--olive)',
    color: 'var(--carve)',
  },
};
