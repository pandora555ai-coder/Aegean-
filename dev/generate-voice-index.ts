// Dev-only: (re)generates client/public/voice-index.html - a throwaway
// review page listing every Socrates line (server/src/socrates.ts), grouped
// by moment, each with its tag and a playable <audio> pointing at the mp3
// dev/generate-voice-lines.ts produced for it. Not part of any workspace
// build or route - open the file directly, or via `npm run dev` at
// /voice-index.html.
//
//   tsx dev/generate-voice-index.ts
//
// Task 49 - the list is DERIVED from socrates.ts every run, never
// hand-maintained, so it can never drift from the actual line pools.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { collectVoiceLineEntries, type VoiceLineEntry } from '../server/src/socrates.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_FILE = path.join(ROOT, 'client', 'public', 'voice-index.html');

// Task 142: collectVoiceLineEntries (server/src/socrates.ts) is the single
// source for "every line across every pool" - the DEV_GET_VOICE_LINES socket
// handler (/dev/voice) uses the exact same function, so this static page and
// that live route can never list a different set of lines.
interface LineEntry extends VoiceLineEntry {
  file: string;
}

function collectEntries(): LineEntry[] {
  return collectVoiceLineEntries().map((entry) => ({ ...entry, file: `voice/${entry.hash}.mp3` }));
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function groupByMoment(entries: LineEntry[]): Map<string, LineEntry[]> {
  const grouped = new Map<string, LineEntry[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.moment) ?? [];
    list.push(entry);
    grouped.set(entry.moment, list);
  }
  return grouped;
}

const RATINGS = ['bad', 'okish', 'good', 'genius'] as const;
const RATING_LABELS: Record<(typeof RATINGS)[number], string> = {
  bad: 'Bad',
  okish: 'Okish',
  good: 'Good',
  genius: 'Genius',
};

function renderSection(moment: string, entries: LineEntry[]): string {
  const rows = entries
    .map((entry) => {
      const buttons = RATINGS.map(
        (r) => `<button type="button" class="rate-btn" data-rating="${r}">${RATING_LABELS[r]}</button>`
      ).join('');
      return `      <tr data-hash="${entry.hash}">
        <td class="rate-cell">${buttons}</td>
        <td class="line-cell">${esc(entry.line)}</td>
        <td>${entry.tag ? esc(entry.tag) : '<em>(none)</em>'}</td>
        <td><audio controls preload="none" src="${entry.file}"></audio></td>
      </tr>`;
    })
    .join('\n');
  return `    <h2>${esc(moment)} <span class="count">(${entries.length})</span></h2>
    <table>
      <thead><tr><th>Rating</th><th>Line</th><th>Tag</th><th>Audio</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table>`;
}

function buildHtml(entries: LineEntry[]): string {
  const grouped = groupByMoment(entries);
  const sections: string[] = [];
  for (const [moment, pool] of grouped) {
    sections.push(renderSection(moment, pool));
  }

  // Hash -> raw, un-escaped line text - what the export button copies.
  // Keyed by the same hash used for the audio filename (lineHash), so
  // ratings saved in localStorage under that hash survive a regenerate:
  // re-running voice:index reproduces the same hash for an unchanged line.
  const linesByHashJson = JSON.stringify(Object.fromEntries(entries.map((e) => [e.hash, e.line])));

  return `<!doctype html>
<html lang="el">
<head>
<meta charset="utf-8" />
<title>Socrates voice line index (dev only)</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem 6rem; }
  h2 { margin-top: 2.5rem; border-bottom: 1px solid #ccc; padding-bottom: 0.25rem; }
  .count { color: #888; font-weight: normal; font-size: 0.8em; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
  th, td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid #eee; vertical-align: middle; }
  audio { height: 32px; }
  tr[data-hidden="1"] { display: none; }
  .rate-cell { white-space: nowrap; }
  .rate-btn { font-size: 0.75em; padding: 0.2rem 0.45rem; margin-right: 0.25rem; border: 1px solid #ccc; background: #fff; border-radius: 3px; cursor: pointer; color: #333; }
  .rate-btn:hover { border-color: #999; }
  .rate-btn[data-rating="bad"].active { background: #d9534f; border-color: #d9534f; color: #fff; }
  .rate-btn[data-rating="okish"].active { background: #f0ad4e; border-color: #f0ad4e; color: #fff; }
  .rate-btn[data-rating="good"].active { background: #5cb85c; border-color: #5cb85c; color: #fff; }
  .rate-btn[data-rating="genius"].active { background: #7c3aed; border-color: #7c3aed; color: #fff; }
  tr[data-rating="bad"] .line-cell { color: #b33; }
  tr[data-rating="genius"] .line-cell { font-weight: 600; }
  #filter-bar { position: sticky; top: 0; z-index: 1; background: #fff; border-bottom: 1px solid #ccc; padding: 0.6rem 0; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  #filter-bar button { font-size: 0.85em; padding: 0.3rem 0.6rem; border: 1px solid #ccc; background: #fff; border-radius: 3px; cursor: pointer; }
  #filter-bar button.active { background: #333; color: #fff; border-color: #333; }
  #rated-count { margin-left: auto; color: #666; font-size: 0.9em; }
  #copy-bar { position: fixed; left: 0; right: 0; bottom: 0; background: #fff; border-top: 1px solid #ccc; padding: 0.75rem 1rem; display: flex; align-items: center; gap: 1rem; }
  #copy-bar button { padding: 0.5rem 1rem; }
  #copy-status { color: #666; font-size: 0.9em; }
</style>
</head>
<body>
<h1>Socrates voice line index (dev only, throwaway)</h1>
<p>Every line, grouped by moment, with its eleven_v3 tag and its generated clip. Rate each line Bad/Okish/Good/Genius. Ratings save to this browser's localStorage, keyed by the line's hash, so they survive a reload and a re-run of voice:index.</p>
<div id="filter-bar">
  <span>Filter:</span>
  <button type="button" class="filter-btn active" data-filter="all">All</button>
  <button type="button" class="filter-btn" data-filter="unrated">Unrated</button>
  <button type="button" class="filter-btn" data-filter="bad">Bad</button>
  <button type="button" class="filter-btn" data-filter="okish">Okish</button>
  <button type="button" class="filter-btn" data-filter="good">Good</button>
  <button type="button" class="filter-btn" data-filter="genius">Genius</button>
  <span id="rated-count"></span>
</div>
${sections.join('\n')}
<div id="copy-bar">
  <button id="export-rated">Export rated lines</button>
  <span id="copy-status"></span>
</div>
<script>
  const LINES_BY_HASH = ${linesByHashJson};
  const RATINGS = ${JSON.stringify(RATINGS)};
  const RATING_LABELS = ${JSON.stringify(RATING_LABELS)};
  const STORAGE_KEY = 'voiceIndexRatings';

  function loadRatings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      return {};
    }
  }

  function saveRatings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ratings));
    } catch (err) {
      // localStorage can be unavailable (private mode, quota) - ratings
      // just won't persist for this session, nothing else to do about it.
    }
  }

  const ratings = loadRatings();
  const rows = [...document.querySelectorAll('tr[data-hash]')];
  let currentFilter = 'all';

  function applyRowState(row) {
    const rating = ratings[row.dataset.hash] || '';
    row.dataset.rating = rating;
    row.querySelectorAll('.rate-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.rating === rating);
    });
  }

  function updateCounter() {
    const total = rows.length;
    const rated = rows.filter((row) => row.dataset.rating).length;
    document.getElementById('rated-count').textContent = rated + ' / ' + total + ' rated';
  }

  function applyFilter() {
    for (const row of rows) {
      const rating = row.dataset.rating;
      const visible =
        currentFilter === 'all' ||
        (currentFilter === 'unrated' && !rating) ||
        currentFilter === rating;
      row.dataset.hidden = visible ? '0' : '1';
    }
  }

  rows.forEach(applyRowState);
  updateCounter();
  applyFilter();

  document.querySelectorAll('.rate-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('tr');
      const hash = row.dataset.hash;
      const rating = btn.dataset.rating;
      if (ratings[hash] === rating) {
        delete ratings[hash];
      } else {
        ratings[hash] = rating;
      }
      saveRatings();
      applyRowState(row);
      updateCounter();
      applyFilter();
    });
  });

  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
      applyFilter();
    });
  });

  document.getElementById('export-rated').addEventListener('click', async () => {
    const status = document.getElementById('copy-status');
    const groups = RATINGS.map((r) => ({ rating: r, lines: [] }));
    for (const [hash, rating] of Object.entries(ratings)) {
      const line = LINES_BY_HASH[hash];
      if (line === undefined) continue; // stale rating from a removed line
      const group = groups.find((g) => g.rating === rating);
      if (group) group.lines.push(line);
    }

    const text = groups
      .filter((g) => g.lines.length > 0)
      .map((g) => '== ' + RATING_LABELS[g.rating].toUpperCase() + ' (' + g.lines.length + ') ==\\n' + g.lines.join('\\n'))
      .join('\\n\\n');

    if (!text) {
      status.textContent = 'Nothing rated yet.';
      return;
    }

    const ratedCount = Object.keys(ratings).length;
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = 'Copied ' + ratedCount + ' rated line(s) to clipboard.';
    } catch (err) {
      // Clipboard API can refuse outside a secure context (e.g. a plain
      // file:// open) - fall back to a selected textarea the user can
      // copy manually rather than failing silently.
      const existing = document.getElementById('copy-fallback');
      if (existing) {
        existing.remove();
      }
      const textarea = document.createElement('textarea');
      textarea.id = 'copy-fallback';
      textarea.value = text;
      textarea.style.width = '100%';
      textarea.style.height = '6rem';
      document.getElementById('copy-bar').before(textarea);
      textarea.focus();
      textarea.select();
      status.textContent = 'Clipboard unavailable - text selected above, copy manually.';
    }
  });
</script>
</body>
</html>
`;
}

function main() {
  const entries = collectEntries();
  writeFileSync(OUT_FILE, buildHtml(entries), 'utf-8');
  console.log(`wrote client/public/voice-index.html (${entries.length} lines)`);
}

main();
