// Task 321 - TV subtitle capture by an in-page MutationObserver, shared by
// dev/end-state-timer-subtitles-check.ts and dev/321-climb-intro-check.ts.
//
// Replaces the old sampler (sampleCurrentBeat), which read the subtitle only
// when the VIP phone was about to press skip: a beat nobody skipped was never
// read at all, and a sample taken before the TV re-rendered stamped the
// PREVIOUS line onto the new beat. Here the page itself logs every change to
// the subtitle (text appearing, changing, disappearing) the moment the DOM
// mutates, with Date.now() so entries share a clock with the harness's own
// websocket-frame timestamps. Nothing depends on a phone doing anything.
//
// Installed as a RAW STRING via addInitScript, not a TS function: tsx/esbuild's
// keep-names rewrites named functions into `__name(...)` calls, which throw in
// the browser (CLAUDE.md, Task 259's probe trap).
import type { Page } from 'playwright';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SubtitleLogEntry {
  t: number;
  // The subtitle's own line, with Task 300's skip-vote counter child removed
  // (it renders INSIDE the same testid node once a vote is cast). null = no
  // subtitle node in the DOM at this moment.
  text: string | null;
  // Boxes measured at mutation time, then again ~600ms later once any entry
  // transition has settled (the card/subtitle can animate in without a
  // further DOM mutation).
  subBox: Box | null;
  cardBox: Box | null;
  settledSubBox: Box | null;
  settledCardBox: Box | null;
  // Which world is on screen: the Anavasis container's presence.
  temple: boolean;
}

const OBSERVER_SCRIPT = `
(() => {
  if (window.__subLog) return;
  const log = [];
  window.__subLog = log;
  let lastKey = null;
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  };
  const SUB = '[data-testid="socrates-subtitle"]';
  const CARD = '[data-testid="stage-announce"] > div';
  const read = () => {
    const sub = document.querySelector(SUB);
    let text = null;
    if (sub) {
      const clone = sub.cloneNode(true);
      clone.querySelectorAll('[data-testid="skip-vote-counter"]').forEach((n) => n.remove());
      text = clone.textContent;
    }
    const card = document.querySelector(CARD);
    const temple = !!document.querySelector('[data-testid="anavasis-scene-container"]');
    const key = JSON.stringify([text, !!card, temple]);
    if (key === lastKey) return;
    lastKey = key;
    const entry = { t: Date.now(), text, subBox: box(sub), cardBox: box(card), settledSubBox: null, settledCardBox: null, temple };
    log.push(entry);
    setTimeout(() => {
      entry.settledSubBox = box(document.querySelector(SUB));
      entry.settledCardBox = box(document.querySelector(CARD));
    }, 600);
  };
  new MutationObserver(read).observe(document, { subtree: true, childList: true, characterData: true });
})();
`;

export async function installSubtitleObserver(page: Page): Promise<void> {
  await page.addInitScript(OBSERVER_SCRIPT);
}

export async function readSubtitleLog(page: Page): Promise<SubtitleLogEntry[]> {
  return (await page.evaluate('window.__subLog ?? []')) as SubtitleLogEntry[];
}

// Clears the page-side log (between game 1 and game 2 of the same page).
export async function resetSubtitleLog(page: Page): Promise<void> {
  await page.evaluate('window.__subLog && window.__subLog.splice(0)');
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function boxInViewport(b: Box, width = 1280, height = 720): boolean {
  return b.x >= 0 && b.y >= 0 && b.x + b.width <= width && b.y + b.height <= height;
}

// socket.io frames look like `42["event",{...}]`.
export function parseFrame(payload: string): { event: string; data: Record<string, unknown> } | null {
  const match = payload.match(/^\d+(\[[\s\S]*\])$/);
  if (!match) return null;
  try {
    const arr = JSON.parse(match[1]) as [string, Record<string, unknown>];
    return { event: arr[0], data: arr[1] ?? {} };
  } catch {
    return null;
  }
}

// Matches beats to renders by ORDER, not by time window: beat i takes the
// first log entry with exactly its line AFTER the entry beat i-1 took. The
// harness's frame timestamp (Playwright's framereceived, delivered to the Node
// process that also hosts the in-process server) can lag the page's own
// render by hundreds of ms when that event loop is busy - a 50ms window
// rejected a real render of Εισαγωγή#1 at game start that way (321, series B
// run 1). Order cannot lag. Returns one entry (or null) per beat line.
export function matchRenders(log: SubtitleLogEntry[], lines: string[]): Array<SubtitleLogEntry | null> {
  let cursor = 0;
  return lines.map((line) => {
    const index = log.findIndex((e, i) => i >= cursor && e.text === line);
    if (index === -1) return null;
    cursor = index + 1;
    return log[index];
  });
}
