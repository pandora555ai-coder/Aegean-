// Task 278 - the coronation rebuilt: TWO agender three-line sets, no gender
// branch, no WINNER_LINES fallback, and the winner's name spliced onto set
// B's last line as a Task 277 SUFFIX.
//
// Descended from the Task 263 harness this file used to be (and reusing its
// infra verbatim): the REAL server in-process on a throwaway port set BEFORE
// the import, a throwaway Vite serving the real client, a real browser TV,
// real player sockets. The climb is SEEDED (startClimb, then one player
// forced to the top) rather than played out over ~14 minutes - the coronation
// is the last thing before GAME_OVER either way, and the game genuinely ends
// here.
//
// FIVE things drive the shape of this harness:
//
//   1. NO AUDIO EXISTS for any of the six coronation lines, by design (Task
//      278 generates nothing). A missing clip makes the host call onEnded()
//      at once (Task 154), so every beat ends on a real ack at ~0ms rather
//      than its backstop. That is what makes the SEQUENCING observable
//      without sound, and it is the whole point of building this before the
//      recordings.
//   2. Proving the SUFFIX branch needs a vocative clip "on disk" - but in
//      this checkout client/public/voice is a SYMLINK into /opt/party-game.
//      So the server is booted with AEGEAN_DEV_VOICE_DIR (Task 263, dev-only,
//      searched BEFORE the real dir) pointed at a throwaway directory, and
//      scenario B writes ONE dummy file there and deletes it again. Nothing
//      is ever written under /opt/party-game.
//   3. The set is a UNIFORM RANDOM pick per game, so a live scenario pins it
//      with FORCE_CORONATION_SET (Task 278's dev-only hook, the same NODE_ENV
//      gate as questions.ts's FORCE_QUESTION_ID) rather than replaying games
//      until the coin lands. Scenario D measures the UNFORCED distribution.
//   4. The TV page IS the host display. A second raw socket emitting
//      HOST_REJOIN would steal it, so each beat's LINE is read from the
//      server's own log via a console.log tee, not from a socket. Subtitles
//      are captured by a MutationObserver installed in the page (a RAW JS
//      STRING - Task 259's `__name` trap), because with no clips these beats
//      end in ~20ms and a 50ms DOM poll misses them outright.
//   5. Task 259's tap-to-start gate covers /host for any room without ?bot=,
//      so the gate is tapped before anything else can be clicked.
//
//   npx tsx dev/263-coronation-check.ts            all scenarios
//   SCENARIO=A npx tsx dev/263-coronation-check.ts  one (A|B|C|D)
process.env.PORT = process.env.SERVER_PORT ?? '3961';

import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { io, type Socket } from 'socket.io-client';
import { AUDIO_BITRATE_KBPS, ClientEvents, ServerEvents, CLIMB_TOP, NAME_GENDER, PRESET_NAMES, lineHash, getVocative, stripPlaceholders } from '@game/shared';
import { statSync } from 'node:fs';

// The dev-only voice search path MUST be set before the server (and with it
// socratesAudio.ts, which reads it once at module load) is imported below.
const DEV_VOICE_DIR = mkdtempSync(path.join(tmpdir(), 'aegean-278-voice-'));
process.env.AEGEAN_DEV_VOICE_DIR = DEV_VOICE_DIR;

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_DIR = path.join(ROOT, 'client');
const SERVER_PORT = Number(process.env.SERVER_PORT ?? 3961);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5962);
const ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const CLIENT_ORIGIN = `http://127.0.0.1:${CLIENT_PORT}`;
const SCENARIO = process.env.SCENARIO ?? '';
const REAL_VOICE_DIR = path.join(ROOT, 'client', 'public', 'voice');

// Task 310 - the vocative clip's own length, off its byte size (the server's
// estimate; the browser's decoded duration runs within ~70ms of it).
function getVocativeClipMs(winnerName: string): number {
  const v = getVocative(winnerName);
  return Math.round((statSync(path.join(REAL_VOICE_DIR, `${lineHash(v, null)}.mp3`)).size * 8) / AUDIO_BITRATE_KBPS);
}

let clientProc: ChildProcess | null = null;
let browser: Browser | null = null;
const sockets: Socket[] = [];

// --------------------------------------------------------------------------
// Server log tee - every beat's own line, straight from the server, stamped.
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

const AVATARS = ['sphinx', 'minotaur', 'medusa', 'cyclops', 'pegasus', 'centaur'];

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

// Every subtitle this page EVER renders, captured by a MutationObserver
// rather than polled. With no clip on disk each coronation beat ends in
// ~20ms, far faster than any practical poll interval - the Task 263 harness
// polled at 50ms and could only ever see whichever beat it happened to catch.
//
// A RAW JS STRING, never a TS closure: tsx/esbuild's keep-names support
// rewrites a named function into `function P(){} __name(P,"P")`, and shipping
// that into the browser throws "__name is not defined" and silently kills the
// whole probe (Task 259's own trap, documented in CLAUDE.md).
// Observes `document`, NOT document.documentElement: an init script runs at
// document-start, where documentElement can still be null, and observe(null)
// throws - which kills the rest of this IIFE while leaving the array above
// assigned, so the probe reports an empty result rather than an error. That
// is exactly how this harness's first run came back "0 subtitles" on beats
// that demonstrably render them.
//
// Belt and braces, because a beat with no clip ends in ~15ms: the observer
// catches every mutation, AND a 5ms in-page interval catches anything React
// commits and tears down between microtask checkpoints (an out-of-process
// Playwright poll could never run tight enough to see these at all).
const SUBTITLE_PROBE = `
  window.__aegeanSubs = [];
  (function () {
    var collect = function () {
      var nodes = document.querySelectorAll('[data-testid="socrates-subtitle"]');
      for (var i = 0; i < nodes.length; i++) {
        var t = (nodes[i].textContent || '').trim();
        if (t && window.__aegeanSubs.indexOf(t) === -1) window.__aegeanSubs.push(t);
      }
    };
    try {
      new MutationObserver(collect).observe(document, {
        childList: true, subtree: true, characterData: true,
      });
    } catch (e) {
      window.__aegeanProbeError = String(e);
    }
    setInterval(collect, 5);
    collect();
  })();
`;

// Task 310 - lineHash values a scenario pretends have NO clip. The server half
// is AEGEAN_DEV_HIDE_CLIPS (socratesAudio.ts, dev-only); this is the browser
// half, so the TV cannot fetch a clip the server says is absent. The bank is
// never touched. Empty outside scenario A.
let hiddenHashes: string[] = [];

async function newTvPage(code: string): Promise<Page> {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 720 } });
  for (const h of hiddenHashes) {
    await page.route(`**/voice/${h}.mp3`, (route) => route.fulfill({ status: 404, body: 'hidden by 263 harness' }));
  }
  await page.addInitScript((c: string) => {
    try {
      window.localStorage.setItem('hostRoomCode', c);
    } catch {
      /* opaque origin - the real navigation re-runs this */
    }
  }, code);
  await page.addInitScript({ content: SUBTITLE_PROBE });
  // Task 310 - every non-looping AudioBufferSourceNode start, so a beat's
  // spliced suffix is proved by SOUNDING (a decoded clip of the suffix's own
  // length), not by the payload carrying it. RAW STRING (Task 259's trap).
  await page.addInitScript({
    content: `(() => { window.__aegeanClips = []; const p = AudioBufferSourceNode.prototype; const o = p.start;
      p.start = function () { try { if (!this.loop && this.buffer) window.__aegeanClips.push(Math.round(this.buffer.duration * 1000)); } catch (e) {} return o.apply(this, arguments); }; })();`,
  });
  // Task 310 - surface the client's own audio diagnostics (a spliced clip that
  // fails to decode is DROPPED silently by design, Task 277) so a beat that
  // "has a suffix" on the wire but never sounds it cannot pass unnoticed.
  page.on('console', (msg) => {
    if (msg.text().includes('[socrates-audio]')) say(`    [page] ${msg.text().slice(0, 200)}`);
  });
  // Task 243 - ?clock=off, exactly as dev/climb-ceremony-check.ts does it:
  // Task 239's GameClock renders an mm:ss readout, so a page-wide digit sweep
  // would otherwise pick up cosmetic chrome and read as a ceremony violation.
  await page.goto(`${CLIENT_ORIGIN}/host?clock=off`);
  // Task 259 - the tap-to-start gate covers /host for any room without ?bot=.
  // It must be cleared before the page will attach as a host display at all.
  try {
    const gate = page.getByTestId('audio-gate');
    if ((await gate.count()) > 0) await gate.click({ timeout: 5000 });
  } catch {
    /* no gate (already passed) - nothing to clear */
  }
  await delay(800);
  return page;
}

type RoomLike = {
  phase: string;
  gameIntroPlayed: boolean;
  players: Map<string, { playerId: string; name: string }>;
  socrates: { usedLines: Set<string> };
  climb: {
    questions: Array<{ correctIndex: number }>;
    questionIndex: number;
    steps: Map<string, number>;
    winnerPlayerId: string | null;
  } | null;
};

async function waitForPhase(room: RoomLike, phase: string, timeoutMs = 60000): Promise<void> {
  const started = Date.now();
  while (room.phase !== phase) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${phase} (still ${room.phase})`);
    await delay(40);
  }
}

interface Beat {
  id: number;
  backstopMs: number;
  line: string;
  prefix: string | null;
  suffix: string | null;
  startTs: number;
  endTs: number | null;
  endedBy: string | null;
}

interface LiveResult {
  winnerName: string;
  beats: Beat[];
  subtitles: string[];
  clipMs: number[];
  usedWinnerPoolLines: string[];
  winnerTitle: string;
}

// One whole game: a seeded climb whose named player is forced to the top,
// then the coronation and GAME_OVER.
async function runLive(winnerName: string, others: string[], forcedSet: 'B' | 'C'): Promise<LiveResult> {
  const logMark = serverLog.length;
  // Task 278's dev-only hook - read by pickCoronationSet at ceremony BUILD
  // time, which happens inside endClimb below.
  process.env.FORCE_CORONATION_SET = forcedSet;

  const host = connect();
  const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
  host.emit(ClientEvents.CREATE_ROOM, { mode: 'quiz' });
  const { code } = await created;

  const roster = [winnerName, ...others];
  const players: Socket[] = [];
  for (let i = 0; i < roster.length; i++) players.push(await joinPlayer(code, roster[i], i));

  const page = await newTvPage(code);

  const { getRoom } = await import('../server/src/state.js');
  const { startClimb } = await import('../server/src/phases.js');
  const room = getRoom(code) as unknown as RoomLike;
  room.gameIntroPlayed = true; // Task 237 - or GAME_INTRO_SEQUENCE plays here instead

  startClimb(room as never);
  await waitForPhase(room, 'CLIMB_QUESTION');

  const winnerId = [...room.players.values()].find((p) => p.name === winnerName)!.playerId;
  for (const player of room.players.values()) {
    room.climb!.steps.set(player.playerId, player.playerId === winnerId ? CLIMB_TOP - 1 : 2);
  }
  const correct = room.climb!.questions[room.climb!.questionIndex].correctIndex;
  players[0].emit(ClientEvents.CLIMB_SUBMIT, { choice: correct });

  await waitForPhase(room, 'GAME_OVER', 120000);
  await delay(600);

  const subtitles = (await page.evaluate('window.__aegeanSubs')) as string[];
  const clipMs = (await page.evaluate('window.__aegeanClips')) as number[];

  // The crowning is up; PodiumView replaces it 6s later, so read it now.
  let winnerTitle = '(never rendered)';
  for (let i = 0; i < 40; i++) {
    if ((await page.locator('[data-testid="winner-title"]').count()) > 0) {
      winnerTitle = ((await page.locator('[data-testid="winner-title"]').first().textContent()) ?? '').trim();
      break;
    }
    await delay(100);
  }

  // Did the ceremony consult the OLD fallback pool at all? pickLine marks
  // every line it returns in state.usedLines, so a WINNER_LINES entry landing
  // there is the fingerprint of the degrade path Task 278 deleted.
  const { WINNER_LINES } = await import('../server/src/socrates.js');
  const usedWinnerPoolLines = WINNER_LINES.filter((line) => room.socrates.usedLines.has(line));

  // Rebuild the beat timeline from the server's own log.
  const beats: Beat[] = [];
  for (const { ts, text } of serverLog.slice(logMark)) {
    const start = text.match(
      /Socrates \(WINNER\) beat (\d+) backstop=(\d+)ms(?: prefix="([^"]*)")?(?: suffix="([^"]*)")? — "(.*)"$/,
    );
    if (start) {
      beats.push({
        id: Number(start[1]),
        backstopMs: Number(start[2]),
        prefix: start[3] ?? null,
        suffix: start[4] ?? null,
        line: start[5],
        startTs: ts,
        endTs: null,
        endedBy: null,
      });
      continue;
    }
    const end = text.match(/Socrates beat (\d+) ended \((.*)\) - advancing/);
    if (end) {
      const beat = beats.find((b) => b.id === Number(end[1]) && b.endTs === null);
      if (beat) {
        beat.endTs = ts;
        beat.endedBy = end[2];
      }
    }
  }

  await page.close();
  host.disconnect();
  for (const p of players) p.disconnect();
  delete process.env.FORCE_CORONATION_SET;

  return { winnerName, beats, subtitles, clipMs, usedWinnerPoolLines, winnerTitle };
}

async function reportLive(
  title: string,
  r: LiveResult,
  expectSet: 'B' | 'C',
  expectSuffix: boolean,
): Promise<void> {
  const { CORONATION_SET_B, CORONATION_SET_C, CORONATION_NAME_LINE } = await import('../server/src/socrates.js');
  const set = expectSet === 'B' ? CORONATION_SET_B : CORONATION_SET_C;
  const vocative = getVocative(r.winnerName);

  say(`\n=== ${title} ===`);
  say(`  winner: ${r.winnerName}  (vocative "${vocative}", NAME_GENDER=${(NAME_GENDER as Record<string, string>)[r.winnerName] ?? 'ABSENT'})`);
  say(`  beats emitted: ${r.beats.length}`);
  for (const [i, b] of r.beats.entries()) {
    const held = b.endTs === null ? '(never ended)' : `${b.endTs - b.startTs}ms`;
    say(`    #${i + 1} id=${b.id} backstop=${b.backstopMs}ms held=${held} endedBy=${b.endedBy ?? 'BACKSTOP'} suffix=${b.suffix === null ? 'none' : `"${b.suffix}"`}`);
    say(`        "${b.line}"`);
  }
  check(`${title}: exactly 3 beats`, r.beats.length === 3, `${r.beats.length}`);
  check(
    `${title}: the three beats ARE set ${expectSet}, in order`,
    r.beats.length === 3 && r.beats.every((b, i) => b.line.startsWith(set[i])),
    r.beats.map((b) => b.line.slice(0, 18) + '…').join(' | '),
  );
  check(
    `${title}: every beat ended on a real audio ack`,
    r.beats.length > 0 && r.beats.every((b) => b.endedBy === ClientEvents.SOCRATES_AUDIO_ENDED),
    r.beats.map((b) => b.endedBy ?? 'BACKSTOP').join(', '),
  );
  const helds = r.beats.filter((b) => b.endTs !== null).map((b) => b.endTs! - b.startTs);
  // Task 310 - was "held < 1000ms (missing clips ack at ~0ms)", a premise that
  // died when 306/307 recorded the six lines. Every LINE has a clip now, so a
  // beat is held for real audio: longer than a 404's instant ack (>1000ms) and
  // ended by the ack well before its own armed backstop.
  check(
    `${title}: each beat held for real audio - over 1000ms, and 1000ms+ inside its backstop`,
    helds.length === r.beats.length && helds.every((h, i) => h > 1000 && h < r.beats[i].backstopMs - 1000),
    `held = ${helds.join(', ')}ms against backstops ${r.beats.map((b) => b.backstopMs).join(', ')}ms`,
  );

  // The SUFFIX - the spliced vocative clip, the only audio that ever carries
  // the name.
  const last = r.beats[r.beats.length - 1];
  check(
    `${title}: spliced suffix ${expectSuffix ? `present ("${vocative}")` : 'ABSENT (vocative clip hidden from server + browser)'}`,
    expectSuffix ? last?.suffix === vocative : r.beats.every((b) => b.suffix === null),
    r.beats.map((b) => (b.suffix === null ? 'none' : `"${b.suffix}"`)).join(', '),
  );
  // Task 310 - the suffix must actually SOUND. The coronation's three lines
  // each start one clip; a sounded suffix is a fourth, of the vocative's own
  // (byte-size-estimated) length. Absent when the vocative is hidden.
  say(`  clips the TV started: [${r.clipMs.join(', ')}]ms`);
  const vocClip = getVocativeClipMs(r.winnerName);
  check(
    `${title}: the browser ${expectSuffix ? 'SOUNDED' : 'did NOT sound'} the vocative clip (${vocClip}ms)`,
    r.clipMs.some((ms) => Math.abs(ms - vocClip) < 150) === expectSuffix,
    `clips [${r.clipMs.join(', ')}]ms`,
  );
  check(
    `${title}: no beat carries a PREFIX (Task 278 moved the splice to the end)`,
    r.beats.every((b) => b.prefix === null),
    r.beats.map((b) => String(b.prefix)).join(', '),
  );

  // The SUBTITLE - which must carry the name in set B whether or not any clip
  // exists, since that is the whole fallback rule.
  say(`  subtitles rendered (${r.subtitles.length}):`);
  for (const s of r.subtitles) say(`      "${s}"`);
  const nameLineSubtitle = r.subtitles.find((s) => s.startsWith(CORONATION_NAME_LINE));
  if (expectSet === 'B') {
    check(
      `${title}: the name line's SUBTITLE shows the winner's name`,
      nameLineSubtitle === `${CORONATION_NAME_LINE} ${vocative}.`,
      `"${nameLineSubtitle ?? '(not rendered)'}" vs expected "${CORONATION_NAME_LINE} ${vocative}."`,
    );
  } else {
    check(
      `${title}: NO subtitle anywhere mentions the winner's name`,
      r.subtitles.every((s) => !s.includes(vocative) && !s.includes(r.winnerName)),
      `${r.subtitles.length} subtitles, none containing "${vocative}"/"${r.winnerName}"`,
    );
  }
  check(
    `${title}: every rendered coronation subtitle belongs to set ${expectSet}`,
    r.subtitles.filter((s) => set.some((line) => s.startsWith(line))).length === 3,
    `${r.subtitles.filter((s) => set.some((line) => s.startsWith(line))).length}/3 matched`,
  );

  // The removed fallback.
  check(
    `${title}: the WINNER_LINES pool was never consulted`,
    r.usedWinnerPoolLines.length === 0,
    r.usedWinnerPoolLines.length === 0 ? '0 WINNER_LINES entries marked used' : r.usedWinnerPoolLines.join(' | '),
  );

  // INVERSE - the gendered winner-screen title is UNTOUCHED by this task.
  const expectTitle = (NAME_GENDER as Record<string, string>)[r.winnerName] === 'f' ? 'Η ΣΟΦΙΣΤΡΙΑ' : 'Ο ΣΟΦΙΣΤΗΣ';
  say(`  ceremony winner-title  : "${r.winnerTitle}"`);
  check(
    `${title}: the gendered winner-screen title still renders (${expectTitle})`,
    r.winnerTitle.replace(/\s+/g, ' ').includes(expectTitle),
    `"${r.winnerTitle}"`,
  );
}

// --------------------------------------------------------------------------
// D - the static facts: the six texts, their hashes, what is registered, and
// how the set is chosen.
// --------------------------------------------------------------------------
async function runStatic(): Promise<void> {
  const {
    CORONATION_SET_B,
    CORONATION_SET_C,
    CORONATION_SETS,
    CORONATION_NAME_LINE,
    WINNER_LINES,
    LINE_TAGS,
    buildCoronationSequence,
    collectVoiceLineEntries,
  } = await import('../server/src/socrates.js');

  const ALL = [...CORONATION_SET_B, ...CORONATION_SET_C];
  const h = (t: string) => lineHash(t, LINE_TAGS[t] ?? null);
  const onDisk = (t: string) => existsSync(path.join(REAL_VOICE_DIR, `${h(t)}.mp3`));

  say('\n=== D: the six texts, their tags and hashes ===');
  for (const [i, t] of CORONATION_SET_B.entries()) {
    say(`  B${i + 1}  tag=${String(LINE_TAGS[t] ?? 'null').padEnd(13)} hash=${h(t)}  onDisk=${onDisk(t)}  "${t}"`);
  }
  for (const [i, t] of CORONATION_SET_C.entries()) {
    say(`  C${i + 1}  tag=${String(LINE_TAGS[t] ?? 'null').padEnd(13)} hash=${h(t)}  onDisk=${onDisk(t)}  "${t}"`);
  }

  check('D: all six lines carry a tag', ALL.every((t) => Boolean(LINE_TAGS[t])), ALL.map((t) => LINE_TAGS[t]).join(' '));
  check('D: six DISTINCT hashes', new Set(ALL.map(h)).size === 6, `${new Set(ALL.map(h)).size} distinct`);
  // The {ΚΛΗΤΙΚΗ} lesson of Task 270: what gets hashed is what gets SPOKEN,
  // so a placeholder (or the punctuation left behind when one is stripped)
  // would be recorded into the clip itself.
  check(
    'D: ZERO placeholders in any hashed text',
    ALL.every((t) => !/\{[^}]+\}/.test(t)),
    'no {...} in any of the six',
  );
  check(
    'D: stripping placeholders changes NOTHING (no stray punctuation)',
    ALL.every((t) => stripPlaceholders(t) === t),
    'stripPlaceholders(t) === t for all six',
  );
  check(
    'D: no hashed text contains any preset NAME or vocative',
    ALL.every((t) => !PRESET_NAMES.some((n) => t.includes(n) || t.includes(getVocative(n)))),
    `checked all ${PRESET_NAMES.length} preset names + vocatives against all six`,
  );
  check(
    // Task 310 - this asserted ZERO clips (true until Task 306 generated the
    // six). It now asserts the opposite premise every later scenario stands on:
    // all six are in the bank, so a coronation beat is paced by REAL audio.
    'D: all six coronation clips exist on disk (Tasks 306/307)',
    ALL.every((t) => onDisk(t)),
    `${ALL.filter(onDisk).length}/6 present in ${REAL_VOICE_DIR}`,
  );

  const cor = collectVoiceLineEntries().filter((e) => e.moment === 'CORONATION');
  say(`\n  collectVoiceLineEntries CORONATION entries: ${cor.length}`);
  check('D: exactly the six lines are registered for generation', cor.length === 6, `${cor.length}`);
  check(
    'D: every registered CORONATION hash matches the computed one',
    ALL.every((t) => cor.some((e) => e.hash === h(t))),
    cor.map((e) => e.hash).join(' '),
  );

  // --- set selection -------------------------------------------------------
  say('\n  set selection (UNFORCED), 40 ceremony builds:');
  delete process.env.FORCE_CORONATION_SET;
  const counts = { B: 0, C: 0, other: 0 };
  const namedTexts = new Set<string>();
  let winnerPoolLeak = 0;
  for (let i = 0; i < 40; i++) {
    const seq = buildCoronationSequence('Νίκος')!;
    if (seq[0].template === CORONATION_SET_B[0]) counts.B++;
    else if (seq[0].template === CORONATION_SET_C[0]) counts.C++;
    else counts.other++;
    namedTexts.add(seq[seq.length - 1].text);
    if (seq.some((l) => (WINNER_LINES as readonly string[]).includes(l.template))) winnerPoolLeak++;
  }
  say(`    set B: ${counts.B}   set C: ${counts.C}   neither: ${counts.other}`);
  check('D: both sets are reachable (each drawn at least once in 40)', counts.B > 0 && counts.C > 0, `B=${counts.B}, C=${counts.C}`);
  check('D: every build is one of the two sets', counts.other === 0, `${counts.other} builds matched neither`);
  check('D: no build ever contains a WINNER_LINES entry', winnerPoolLeak === 0, `${winnerPoolLeak}/40`);
  check('D: exactly 2 sets registered', CORONATION_SETS.length === 2, `${CORONATION_SETS.length}`);

  // --- the forcing hook, and where the name goes ---------------------------
  process.env.FORCE_CORONATION_SET = 'B';
  const b = buildCoronationSequence('Νίκος')!;
  process.env.FORCE_CORONATION_SET = 'C';
  const c = buildCoronationSequence('Νίκος')!;
  delete process.env.FORCE_CORONATION_SET;
  check('D: FORCE_CORONATION_SET=B selects set B', b[0].template === CORONATION_SET_B[0], b[0].template.slice(0, 24) + '…');
  check('D: FORCE_CORONATION_SET=C selects set C', c[0].template === CORONATION_SET_C[0], c[0].template.slice(0, 24) + '…');

  say('\n  where the winner\'s name goes (set B, winner Νίκος):');
  for (const l of b) say(`    template="${l.template.slice(0, 26)}…"  text="${l.text.slice(0, 34)}…"`);
  check(
    'D: the name is in the last line\'s TEXT but never its TEMPLATE',
    b[2].text === `${CORONATION_NAME_LINE} Νίκο.` && b[2].template === CORONATION_NAME_LINE,
    `text="${b[2].text}" template="${b[2].template}"`,
  );
  check(
    'D: set B\'s other two lines are untouched by the name',
    b[0].text === b[0].template && b[1].text === b[1].template,
    'text === template for B1 and B2',
  );
  check(
    'D: set C carries the name NOWHERE',
    c.every((l) => l.text === l.template),
    'text === template for all three C lines',
  );
  // A TIE has no single winner to name. The line must degrade to its bare
  // self - no placeholder, no dangling separator (the Task 270 lesson again).
  process.env.FORCE_CORONATION_SET = 'B';
  const tie = buildCoronationSequence(null)!;
  delete process.env.FORCE_CORONATION_SET;
  check(
    'D: a nameless winner (a tie) leaves the line bare, no stray punctuation',
    tie[2].text === CORONATION_NAME_LINE,
    `"${tie[2].text}"`,
  );
  // The hash is what names the mp3, so it must not move with the winner.
  const hashes = new Set<string>();
  for (const name of ['Νίκος', 'Μαρία', 'Άρης', 'Χαρά']) {
    process.env.FORCE_CORONATION_SET = 'B';
    const seq = buildCoronationSequence(name)!;
    delete process.env.FORCE_CORONATION_SET;
    hashes.add(seq.map((l) => lineHash(l.template, l.tag)).join(','));
  }
  check('D: set B hashes identically for every winner', hashes.size === 1, `${hashes.size} distinct hash-triples`);
}

async function main(): Promise<void> {
  say(`booting in-process server on ${SERVER_PORT}`);
  say(`dev voice search dir (throwaway): ${DEV_VOICE_DIR}`);
  await import('../server/src/index.js');
  clientProc = spawn('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], {
    cwd: CLIENT_DIR,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, VITE_SERVER_URL: ORIGIN },
  });
  await waitForClient();
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  say('client + browser ready');

  const run = (s: string) => SCENARIO === '' || SCENARIO === s;

  if (run('D')) await runStatic();

  if (run('A')) {
    // Task 310 - every preset vocative has a clip since Task 307, so the
    // without-vocative branch is reached by HIDING Νίκος's (AEGEAN_DEV_HIDE_CLIPS
    // server-side + a 404 route in the TV page). The bank is untouched.
    const { coronationVocative: vocativeOf } = await import('../server/src/socrates.js');
    const hid = vocativeOf('Νίκος')!;
    const hidHash = lineHash(hid.template, hid.tag);
    say(`\n--- A: set B, the winner's vocative clip HIDDEN ("${hid.template}" ${hidHash}) ---`);
    process.env.AEGEAN_DEV_HIDE_CLIPS = hidHash;
    hiddenHashes = [hidHash];
    await reportLive('A (Νίκος, set B, vocative hidden)', await runLive('Νίκος', ['Μαρία', 'Άρης'], 'B'), 'B', false);
    delete process.env.AEGEAN_DEV_HIDE_CLIPS;
    hiddenHashes = [];
  }

  if (run('B')) {
    // Task 310 - no dummy file any more: Task 307 recorded a real vocative for
    // every preset name (Νίκο included), so the suffix branch is proved against
    // the REAL bank clip. Nothing is written anywhere.
    const { coronationVocative } = await import('../server/src/socrates.js');
    const v = coronationVocative('Νίκος')!;
    say(`\n--- B: set B with the REAL vocative clip for Νίκος ("${v.template}", ${lineHash(v.template, v.tag)}) ---`);
    await reportLive('B (Νίκος, set B, real clip present)', await runLive('Νίκος', ['Μαρία', 'Άρης'], 'B'), 'B', true);
  }

  if (run('C')) {
    say('\n--- C: set C (no name anywhere), and a FEMALE winner for the title ---');
    await reportLive('C (Μαρία, set C)', await runLive('Μαρία', ['Νίκος', 'Άρης'], 'C'), 'C', false);
  }

  say(`\n${passed} passed, ${failed} failed`);
}

main().then(
  async () => {
    for (const s of sockets) s.disconnect();
    if (browser) await browser.close();
    killGroup(clientProc);
    rmSync(DEV_VOICE_DIR, { recursive: true, force: true });
    process.exit(failed === 0 ? 0 : 1);
  },
  async (err) => {
    realLog(err);
    for (const s of sockets) s.disconnect();
    if (browser) await browser.close();
    killGroup(clientProc);
    rmSync(DEV_VOICE_DIR, { recursive: true, force: true });
    process.exit(1);
  },
);
