// Task 279 - criterion 4: the REAL coronation suffix, played from STAGING.
//
// Task 277's dev/277-splice-check.ts proved the splice mechanism using two
// arbitrary bank clips standing in for "a line" and "a vocative that will be
// recorded later". Task 279 actually recorded them, so this harness plays the
// real pair: set B's own last line ("Το δικό σου.") with the real vocative
// clip for Νίκος ("Νίκο") spliced after it.
//
// Both clips live ONLY in client/public/voice-staging - deliberately not in
// the bank, which is a symlink into /opt/party-game (production). Reaching
// them therefore needs staging served at BOTH ends, and this harness is the
// only place that happens:
//
//   1. SERVER side - AEGEAN_DEV_VOICE_DIR (Task 263's dev-only, NODE_ENV-
//      guarded SEARCH PATH, not a replacement) points at voice-staging, so
//      resolveSocratesClip can size the two new clips. Nothing in the shipped
//      lookup changes: with this env var unset, production resolves exactly
//      as before.
//   2. BROWSER side - the TV page hardcodes /voice/<hash>.mp3, which Vite
//      serves out of the symlinked bank where these clips do NOT exist. A
//      Playwright route shim rewrites just those requests onto the staging
//      file when one is present, and lets every other clip fall through to
//      the real bank untouched. Test-only interception - no committed code
//      teaches the client about staging.
//
// Otherwise this is 277's own shape verbatim: the REAL server in-process on a
// throwaway port set BEFORE the import, a throwaway Vite serving the real
// client, a real browser TV, real player sockets, and the beat driven straight
// through enterSocratesBeat - the same code path startSocratesSequence sets up
// for the coronation, without waiting out a ~14-minute game.
//
// Timing is READ, never inferred: an AudioBufferSourceNode.prototype.start
// probe records when each buffer really started and how long it decoded to
// (installed as a RAW JS STRING - Task 259's trap: tsx/esbuild rewrites a
// named TS closure into `__name(...)`, which throws in the page and kills the
// probe silently), and the armed backstop is read off the LIVE Room.
//
//   npx tsx dev/279-staging-splice-check.ts
process.env.PORT = process.env.SERVER_PORT ?? '3966';

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { io, type Socket } from 'socket.io-client';
import {
  AUDIO_BITRATE_KBPS,
  ClientEvents,
  ServerEvents,
  SOCRATES_BACKSTOP_MARGIN_MS,
  lineHash,
} from '@game/shared';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_DIR = path.join(ROOT, 'client');
const BANK_DIR = path.join(ROOT, 'client', 'public', 'voice');
const STAGING_DIR = path.join(ROOT, 'client', 'public', 'voice-staging');

// THE point of this harness: the server's own clip lookup is pointed at
// staging for this run only. Set before any server module is imported, since
// socratesAudio.ts reads it once at module load.
process.env.AEGEAN_DEV_VOICE_DIR = STAGING_DIR;

const SERVER_PORT = Number(process.env.SERVER_PORT ?? 3966);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5967);
const ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const CLIENT_ORIGIN = `http://127.0.0.1:${CLIENT_PORT}`;

let clientProc: ChildProcess | null = null;
let browser: Browser | null = null;
const sockets: Socket[] = [];

// --------------------------------------------------------------------------
// Server log tee - the armed backstop and each ack, straight from the server.
// --------------------------------------------------------------------------
interface LogLine {
  ts: number;
  text: string;
}
const serverLog: LogLine[] = [];
const realLog = console.log.bind(console);
console.log = (...args: unknown[]): void => {
  const text = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  serverLog.push({ ts: Date.now(), text });
};
function say(text: string): void {
  realLog(text);
}
function logsSince(ts: number, needle: string): LogLine[] {
  return serverLog.filter((l) => l.ts >= ts && l.text.includes(needle));
}

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail: string): void {
  if (ok) passed++;
  else failed++;
  say(`  ${ok ? 'ok  ' : 'FAIL'} ${label} — ${detail}`);
}

function killGroup(child: ChildProcess | null): void {
  if (!child || child.pid === undefined || child.killed) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
}

async function waitForClient(): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`${CLIENT_ORIGIN}/`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await delay(500);
  }
  throw new Error('client dev server did not come up in time');
}

function connect(): Socket {
  const s = io(ORIGIN, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  return s;
}

function waitFor<T = Record<string, unknown>>(socket: Socket, event: string, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    function handler(p: T): void {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(p);
    }
    socket.on(event, handler);
  });
}

// Task 241/245 - names are strict membership in PRESET_NAMES. Νίκος is also
// the winner whose vocative this task generated, so it is the name under test.
const NAMES = ['Νίκος', 'Μαρία'];
const AVATARS = ['sphinx', 'minotaur'];

function joinPlayer(code: string, name: string, avatarIndex: number): Promise<Socket> {
  const s = connect();
  const playerId = randomUUID();
  const done = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`join for "${name}" timed out`)), 15000);
    s.once(ServerEvents.PLAYER_JOINED, () => {
      clearTimeout(timer);
      resolve();
    });
    s.once(ServerEvents.JOIN_REJECTED, (p: { reason: string }) => {
      clearTimeout(timer);
      reject(new Error(`join rejected for "${name}": ${p.reason}`));
    });
  });
  s.emit(ClientEvents.PLAYER_JOIN, { code, name, playerId, avatarId: AVATARS[avatarIndex % AVATARS.length] });
  return done.then(() => s);
}

// The page-side probe. A RAW STRING on purpose - see the note at the top.
const AUDIO_PROBE = `(() => {
  window.__aegeanClips = [];
  const proto = AudioBufferSourceNode.prototype;
  const originalStart = proto.start;
  proto.start = function () {
    try {
      window.__aegeanClips.push({
        t: performance.now(),
        durMs: this.buffer ? this.buffer.duration * 1000 : null,
        loop: !!this.loop,
      });
    } catch (err) {
      /* never break playback in order to observe it */
    }
    return originalStart.apply(this, arguments);
  };
})();`;

interface ProbeClip {
  t: number;
  durMs: number | null;
  loop: boolean;
}

// Every /voice/<hash>.mp3 this run served out of staging instead of the bank.
const servedFromStaging: string[] = [];

async function newTvPage(code: string): Promise<Page> {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 720 } });

  // BROWSER-side half of "point the resolver at staging". Only requests whose
  // hash is actually present in staging are rewritten; everything else falls
  // through to the real bank, so no other line is disturbed.
  await page.route('**/voice/*.mp3', async (route) => {
    const hash = path.basename(new URL(route.request().url()).pathname, '.mp3');
    const staged = path.join(STAGING_DIR, `${hash}.mp3`);
    if (existsSync(staged)) {
      servedFromStaging.push(hash);
      await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: readFileSync(staged) });
      return;
    }
    await route.continue();
  });

  await page.addInitScript(AUDIO_PROBE);
  await page.addInitScript((c: string) => {
    try {
      window.localStorage.setItem('hostRoomCode', c);
    } catch {
      /* opaque origin - the real navigation re-runs this */
    }
  }, code);
  await page.goto(`${CLIENT_ORIGIN}/host?clock=off`);
  // Task 259 - the gate both attaches the display AND constructs/resumes the
  // AudioContext inside a real gesture. Without this tap nothing sounds.
  try {
    const gate = page.getByTestId('audio-gate');
    if ((await gate.count()) > 0) await gate.click({ timeout: 5000 });
  } catch {
    /* no gate (already passed) - nothing to clear */
  }
  await delay(1200);
  return page;
}

type RoomLike = {
  code: string;
  phase: string;
  gameIntroPlayed: boolean;
  socratesBeatId: number;
  socratesBackstopMs: number;
  hostSocketId: string | null;
  pendingSocratesQueue: Array<Record<string, unknown>>;
  activeTimer: { kind: string; durationMs: number } | null;
};

// A clip's raw audio length from its file size - the same CBR arithmetic the
// server uses (Task 42b) but WITHOUT the 4000ms floor, for comparison against
// what the browser actually decoded.
function rawMsOf(dir: string, hash: string): number | null {
  const file = path.join(dir, `${hash}.mp3`);
  if (!existsSync(file)) return null;
  return Math.round((statSync(file).size * 8) / AUDIO_BITRATE_KBPS);
}

async function main(): Promise<void> {
  say(`booting in-process server on ${SERVER_PORT}`);
  say(`server clip search path (dev-only): ${path.relative(ROOT, STAGING_DIR)} then the bank`);
  await import('../server/src/index.js');
  const { getRoom } = await import('../server/src/state.js');
  const { enterSocratesBeat, advanceFromSocrates } = await import('../server/src/phases.js');
  const { collectVoiceLineEntries, coronationVocative, CORONATION_NAME_LINE, LINE_TAGS } = await import(
    '../server/src/socrates.js'
  );
  const { socratesBackstopMs, resolveSocratesClip } = await import('../server/src/socratesAudio.js');

  // THE REAL PAIR. Not stand-ins: set B's own name line, and the vocative
  // clip Task 279 generated for Νίκος - exactly what phases.ts splices when
  // this ceremony crowns him.
  const LINE_TEMPLATE = CORONATION_NAME_LINE;
  const LINE_TAG = (LINE_TAGS as Record<string, string>)[LINE_TEMPLATE] ?? null;
  const LINE_HASH = lineHash(LINE_TEMPLATE, LINE_TAG);
  const vocative = coronationVocative('Νίκος');
  if (!vocative) throw new Error('coronationVocative("Νίκος") returned null');
  const SUFFIX_TEMPLATE = vocative.template;
  const SUFFIX_TAG = vocative.tag;
  const SUFFIX_HASH = lineHash(SUFFIX_TEMPLATE, SUFFIX_TAG);

  const lineRawMs = rawMsOf(STAGING_DIR, LINE_HASH);
  const suffixRawMs = rawMsOf(STAGING_DIR, SUFFIX_HASH);

  say(`\n--- the pair under test ---`);
  say(`  line   : ${LINE_HASH}  ${lineRawMs}ms raw  ${LINE_TAG ?? '(no tag)'}  "${LINE_TEMPLATE}"`);
  say(`  suffix : ${SUFFIX_HASH}  ${suffixRawMs}ms raw  ${SUFFIX_TAG ?? '(no tag)'}  "${SUFFIX_TEMPLATE}"`);

  check(
    'both clips are in STAGING',
    existsSync(path.join(STAGING_DIR, `${LINE_HASH}.mp3`)) && existsSync(path.join(STAGING_DIR, `${SUFFIX_HASH}.mp3`)),
    `${LINE_HASH}.mp3 + ${SUFFIX_HASH}.mp3`,
  );
  check(
    'and NEITHER is in the bank symlink (so a pass here can only come from staging)',
    !existsSync(path.join(BANK_DIR, `${LINE_HASH}.mp3`)) && !existsSync(path.join(BANK_DIR, `${SUFFIX_HASH}.mp3`)),
    `bank: ${path.relative(ROOT, BANK_DIR)}`,
  );
  check(
    'the server resolves both through the staging search path',
    resolveSocratesClip(LINE_TEMPLATE, LINE_TAG).known && resolveSocratesClip(SUFFIX_TEMPLATE, SUFFIX_TAG).known,
    `line known=${resolveSocratesClip(LINE_TEMPLATE, LINE_TAG).known}, suffix known=${resolveSocratesClip(SUFFIX_TEMPLATE, SUFFIX_TAG).known}`,
  );
  check(
    'the vocative is a registered CORONATION-era line, not an invented string',
    collectVoiceLineEntries().some((e) => e.hash === SUFFIX_HASH),
    `${SUFFIX_HASH} present in collectVoiceLineEntries()`,
  );

  // A long real bank clip for the ack to drain onto, so it does not route
  // into a game that was never started (277's own sentinel technique).
  const tail = collectVoiceLineEntries()
    .filter((e) => existsSync(path.join(BANK_DIR, `${e.hash}.mp3`)))
    .map((e) => ({ ...e, fileMs: rawMsOf(BANK_DIR, e.hash)! }))
    .sort((a, b) => b.fileMs - a.fileMs)[0];
  if (!tail) throw new Error('no bank clip available for the drain tail');

  clientProc = spawn('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], {
    cwd: CLIENT_DIR,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, VITE_SERVER_URL: ORIGIN },
  });
  await waitForClient();
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  say('client + browser ready');

  // ---------------------------------------------------------------------
  const host = connect();
  const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
  host.emit(ClientEvents.CREATE_ROOM, { mode: 'quiz' });
  const { code } = await created;
  const players: Socket[] = [];
  for (let i = 0; i < NAMES.length; i++) players.push(await joinPlayer(code, NAMES[i], i));
  const room = getRoom(code) as unknown as RoomLike;
  // CLAUDE.md / Task 237 - or the ten-line opening narration fires instead.
  room.gameIntroPlayed = true;

  const page = await newTvPage(code);
  const pageWarnings: string[] = [];
  page.on('console', (msg) => {
    if (msg.text().includes('[socrates-audio]')) pageWarnings.push(msg.text().slice(0, 140));
  });
  check('the TV page is the attached host display', room.hostSocketId !== null, String(room.hostSocketId));

  room.pendingSocratesQueue = [{ line: tail.line, lineTemplate: tail.line, lineTag: tail.tag }];

  const showTs = Date.now();
  let backstopFired = false;
  enterSocratesBeat(
    room as never,
    'SOCRATES',
    {
      kind: 'WINNER',
      line: `${LINE_TEMPLATE} ${SUFFIX_TEMPLATE}.`,
      lineTemplate: LINE_TEMPLATE,
      lineTag: LINE_TAG,
      suffixTemplate: SUFFIX_TEMPLATE,
      suffixTag: SUFFIX_TAG,
    } as never,
    () => {
      backstopFired = true;
      advanceFromSocrates(room.code as never);
    },
  );
  const armed = room.activeTimer?.durationMs ?? -1;
  const beatId = room.socratesBeatId;

  const deadline = Date.now() + Math.max(armed, 20000) + 5000;
  let ended: LogLine | null = null;
  while (ended === null && Date.now() < deadline) {
    ended = logsSince(showTs, `Socrates beat ${beatId} ended`)[0] ?? null;
    await delay(25);
  }
  // Read the probe BEFORE the tail beat's own clip can join it.
  const clips = ((await page.evaluate('window.__aegeanClips')) ?? []) as ProbeClip[];
  room.phase = 'LOBBY'; // the tail's own ack/backstop must not route anywhere

  // Matched by ORDER, not duration: the chain is deterministic (line, then
  // suffix). Their decoded lengths are then CHECKED against the real files.
  const oneShots = clips.filter((c) => !c.loop && c.durMs !== null);
  const lineClip = oneShots[0] ?? null;
  const sufClip = oneShots[1] ?? null;

  say(`\n--- measured ---`);
  say(`  clips actually started in the page (non-looping): ${oneShots.length}`);
  for (const [i, c] of oneShots.entries()) {
    say(`    #${i + 1} start=${c.t.toFixed(1)}ms decoded=${(c.durMs ?? 0).toFixed(0)}ms`);
  }
  const gap = lineClip && sufClip ? sufClip.t - (lineClip.t + (lineClip.durMs ?? 0)) : null;
  const total = lineClip && sufClip ? sufClip.t + (sufClip.durMs ?? 0) - lineClip.t : null;
  say(`  gap line-end -> suffix-start : ${gap === null ? 'n/a' : `${gap.toFixed(1)}ms`}`);
  say(`  measured chain total         : ${total === null ? 'n/a' : `${total.toFixed(0)}ms`}`);
  say(`  armed backstop               : ${armed}ms`);
  say(`  ack landed                   : ${ended === null ? 'NEVER' : `${ended.ts - showTs}ms after the beat began`}`);
  say(`  advanced by                  : ${ended === null ? '(nothing)' : ended.text.includes('audio_ended') ? 'socrates:audio_ended' : ended.text}`);
  // Task 154's LOBBY prefetch pulls EVERY active clip, so the shim serves far
  // more than the pair under test - the count is expected to be in the
  // hundreds. What matters is that the two clips under test are among them,
  // since neither exists anywhere but staging.
  say(
    `  served from staging          : ${servedFromStaging.length} request(s) total ` +
      `(Task 154 prefetches the whole bank); line=${servedFromStaging.includes(LINE_HASH)} suffix=${servedFromStaging.includes(SUFFIX_HASH)}`,
  );
  say(`  page audio warnings          : ${pageWarnings.length === 0 ? 'none' : JSON.stringify(pageWarnings)}`);

  check(
    'the line and the suffix were both served out of STAGING (they exist nowhere else)',
    servedFromStaging.includes(LINE_HASH) && servedFromStaging.includes(SUFFIX_HASH),
    `line=${servedFromStaging.filter((h) => h === LINE_HASH).length}x suffix=${servedFromStaging.filter((h) => h === SUFFIX_HASH).length}x of ${servedFromStaging.length} shimmed`,
  );
  check(
    'both clips played, line first',
    lineClip !== null && sufClip !== null && sufClip.t > lineClip.t,
    `line@${lineClip?.t.toFixed(0)} suffix@${sufClip?.t.toFixed(0)}`,
  );
  check(
    'the two clips decoded to the two STAGING FILES, in chain order',
    lineClip !== null &&
      sufClip !== null &&
      Math.abs((lineClip.durMs ?? 0) - (lineRawMs ?? 0)) < 300 &&
      Math.abs((sufClip.durMs ?? 0) - (suffixRawMs ?? 0)) < 300,
    `${(lineClip?.durMs ?? 0).toFixed(0)}ms vs line ${lineRawMs}ms, ${(sufClip?.durMs ?? 0).toFixed(0)}ms vs suffix ${suffixRawMs}ms`,
  );
  check('the suffix starts as the line ends (gap < 250ms)', gap !== null && gap > -60 && gap < 250, `${gap?.toFixed(1)}ms`);
  check(
    'the ack waited for the SUFFIX, not the line',
    ended !== null && ended.ts - showTs > (lineRawMs ?? 0) + 300,
    `ack at ${ended === null ? -1 : ended.ts - showTs}ms, line alone is ${lineRawMs}ms`,
  );
  check('the whole chain fits inside the armed backstop', total !== null && total < armed, `${total?.toFixed(0)}ms < ${armed}ms`);
  check(
    'backstop = line + margin + suffix (both floored, both clips being short)',
    armed === socratesBackstopMs(LINE_TEMPLATE, LINE_TAG, SUFFIX_TEMPLATE, SUFFIX_TAG) &&
      armed ===
        resolveSocratesClip(LINE_TEMPLATE, LINE_TAG).durationMs +
          SOCRATES_BACKSTOP_MARGIN_MS +
          resolveSocratesClip(SUFFIX_TEMPLATE, SUFFIX_TAG).durationMs,
    `${armed}ms`,
  );
  check('the backstop never fired', !backstopFired, backstopFired ? 'IT FIRED' : 'never fired');
  check('no page audio warning (nothing failed to fetch or decode)', pageWarnings.length === 0, JSON.stringify(pageWarnings));

  await page.close();
  host.disconnect();
  for (const p of players) p.disconnect();

  say(`\n${passed} passed, ${failed} failed`);
}

main().then(
  async () => {
    for (const s of sockets) s.disconnect();
    if (browser) await browser.close();
    killGroup(clientProc);
    process.exit(failed === 0 ? 0 : 1);
  },
  async (err) => {
    realLog(err);
    for (const s of sockets) s.disconnect();
    if (browser) await browser.close();
    killGroup(clientProc);
    process.exit(1);
  },
);
