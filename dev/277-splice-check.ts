// Task 277 - the generalised splice: a beat may sound a clip AHEAD of its
// line (the prefix, Task 263), AFTER it (the suffix, this task), both, or
// neither, and it acks exactly ONCE either way - bound to whichever clip
// genuinely ends the chain.
//
// Same infra as dev/263-coronation-check.ts, which this descends from: the
// REAL server in-process on a throwaway port set BEFORE the import, a
// throwaway Vite serving the real client, a real browser TV, real player
// sockets. Beats are driven straight through enterSocratesBeat (+
// room.pendingSocratesQueue), exactly what startSocratesSequence sets up -
// the same code path a real show takes, without waiting out a ~14-minute game
// for a beat that does not exist in the line bank yet.
//
// FOUR things drive the shape of this harness:
//
//   1. THE SPLICED CLIP MUST BE REAL. A stand-in vocative has to be fetchable
//      by the BROWSER at /voice/<hash>.mp3, and client/public/voice is a
//      symlink into /opt/party-game - so a made-up clip cannot be put there
//      without writing to production. Instead both clips are REAL BANK LINES
//      chosen at runtime (collectVoiceLineEntries + existsSync), one standing
//      in for the line and one for the vocative. Nothing is written anywhere.
//   2. TIMING IS READ FROM THE BROWSER, not inferred. A probe patched into
//      the page wraps AudioBufferSourceNode.prototype.start and records when
//      each buffer actually started and how long it decoded to, so the gap
//      between clips is measured rather than assumed. It is installed as a
//      RAW JS STRING (Task 259's trap: tsx/esbuild rewrites a named TS
//      closure into `__name(...)`, which throws in the page and kills the
//      probe silently).
//   3. The TV page IS the host display, so each beat's armed backstop is read
//      off the LIVE Room and the ack's arrival off the server's own log via a
//      console.log tee - never inferred from how long something took.
//   4. Task 259's tap-to-start gate covers /host for any room without ?bot=,
//      so it is tapped before anything else - and it is also what constructs
//      the AudioContext, without which nothing plays at all.
//
//   A  a REAL suffix: the chain, the gap line-end -> suffix-start, the total
//      against the armed backstop, and which clip the single ack waited for.
//   B  inverse: the SAME beat with the suffix file deliberately absent - one
//      clip, one ack at the line's end, never the backstop.
//   C  the wire and the arithmetic, socket-only: all four combinations'
//      payloads (a prefix-only beat must serialise byte-for-byte as before,
//      with `suffix` absent, not null), the backstop sum per combination, and
//      a suffix surviving the queue drain onto a later beat of a sequence.
//
//   npx tsx dev/277-splice-check.ts             all scenarios
//   SCENARIO=A npx tsx dev/277-splice-check.ts  one (A|B|C)
process.env.PORT = process.env.SERVER_PORT ?? '3965';

import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
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
  SOCRATES_BACKSTOP_UNKNOWN_MS,
  lineHash,
} from '@game/shared';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_DIR = path.join(ROOT, 'client');
const VOICE_DIR = path.join(ROOT, 'client', 'public', 'voice');
const SERVER_PORT = Number(process.env.SERVER_PORT ?? 3965);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5966);
const ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const CLIENT_ORIGIN = `http://127.0.0.1:${CLIENT_PORT}`;
const SCENARIO = process.env.SCENARIO ?? '';

// A template with no mp3 anywhere - the deliberately-absent suffix of B, and
// the never-acked tail of C.
const NO_FILE = 'ΑΝΥΠΑΡΚΤΟ ΕΠΙΘΕΜΑ 277';

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

// Task 241/245 - names are strict membership in PRESET_NAMES now, so a
// hardcoded Άλφα/Βήτα roster is rejected on the FIRST join and the harness
// scores nothing. These three are the ones dev/263-coronation-check.ts joins.
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

// The page-side probe. A RAW STRING on purpose - see note 2 at the top.
const AUDIO_PROBE = `(() => {
  window.__aegeanClips = [];
  const proto = AudioBufferSourceNode.prototype;
  const originalStart = proto.start;
  proto.start = function () {
    try {
      window.__aegeanClips.push({
        t: performance.now(),
        durMs: this.buffer ? this.buffer.duration * 1000 : null,
        playForMs: arguments.length >= 3 ? arguments[2] * 1000 : null,
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
  // Task 308 - start()'s duration argument: a clip that is not last in the
  // chain is cut at its speech end, so the next one follows THAT, not the
  // buffer's end.
  playForMs: number | null;
  loop: boolean;
}

async function newTvPage(code: string): Promise<Page> {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 720 } });
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

// A clip's real length from its file size, the same CBR arithmetic the server
// uses (Task 42b) but WITHOUT the 4000ms floor - this is the raw audio length,
// for comparison against what the browser actually decoded.
function fileMsOf(hash: string): number | null {
  const file = path.join(VOICE_DIR, `${hash}.mp3`);
  if (!existsSync(file)) return null;
  return Math.round((statSync(file).size * 8) / AUDIO_BITRATE_KBPS);
}

async function main(): Promise<void> {
  say(`booting in-process server on ${SERVER_PORT}`);
  await import('../server/src/index.js');
  const { getRoom } = await import('../server/src/state.js');
  const { enterSocratesBeat, advanceFromSocrates } = await import('../server/src/phases.js');
  const { collectVoiceLineEntries } = await import('../server/src/socrates.js');
  const { socratesBackstopMs, resolveSocratesClip } = await import('../server/src/socratesAudio.js');

  // Two REAL bank lines with real mp3s: the shortest two, so a scenario is a
  // few seconds rather than half a minute. LINE stands in for the beat's own
  // sentence, SUFFIX for the vocative that will be recorded later.
  const allOnDisk = collectVoiceLineEntries()
    .filter((e) => existsSync(path.join(VOICE_DIR, `${e.hash}.mp3`)))
    .map((e) => ({ ...e, fileMs: fileMsOf(e.hash)! }))
    .sort((a, b) => a.fileMs - b.fileMs);
  // Above SOCRATES_DURATION_MS (the 4000ms floor resolveSocratesClip applies
  // to a very short clip): otherwise every number this harness prints is the
  // floor rather than the clip, and the backstop arithmetic would be
  // demonstrated against a constant instead of against real audio.
  const onDisk = allOnDisk.filter((e) => e.fileMs > 4500);
  if (onDisk.length < 2 || allOnDisk.length < 3) {
    throw new Error(`need 2 clips over the floor and 3 overall, found ${onDisk.length}/${allOnDisk.length}`);
  }
  const LINE = onDisk[0];
  // Deliberately NOT onDisk[1]. Sorting by length puts equal-sized files next
  // to each other, and the two shortest clips over the floor turned out to be
  // byte-identical in size (4551ms each) - two clips the page probe below
  // cannot tell apart by duration, which is how this harness first reported
  // the line and the suffix as the same clip. The suffix must be audibly a
  // DIFFERENT length from the line.
  const SUFFIX = onDisk.find((e) => Math.abs(e.fileMs - LINE.fileMs) > 800);
  if (!SUFFIX) throw new Error('no second clip of a clearly different length on disk');
  // The tail beat a drained ack lands on: a LONG real clip, so it is still
  // playing while the scenario tears down instead of acking and routing into
  // a game that was never started (dev/socrates-pacing-check.ts's sentinel).
  const TAIL = onDisk[onDisk.length - 1];

  say(`  line   : ${LINE.hash}  ${LINE.fileMs}ms  "${LINE.line.slice(0, 40)}…"`);
  say(`  suffix : ${SUFFIX.hash}  ${SUFFIX.fileMs}ms  "${SUFFIX.line.slice(0, 40)}…"`);
  say(`  tail   : ${TAIL.hash}  ${TAIL.fileMs}ms (never measured, never acked in time)`);

  async function newRoom(): Promise<{ host: Socket; code: string; players: Socket[]; room: RoomLike }> {
    const host = connect();
    const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
    host.emit(ClientEvents.CREATE_ROOM, { mode: 'quiz' });
    const { code } = await created;
    const players: Socket[] = [];
    for (let i = 0; i < NAMES.length; i++) players.push(await joinPlayer(code, NAMES[i], i));
    const room = getRoom(code) as unknown as RoomLike;
    // CLAUDE.md / Task 237 - or the ten-line opening narration fires instead.
    room.gameIntroPlayed = true;
    return { host, code, players, room };
  }

  // =====================================================================
  // A / B - the real chain, measured in a real browser.
  // =====================================================================
  async function runBrowserScenario(
    title: string,
    suffix: { template: string; tag: string | null } | null,
    suffixIsReal: boolean,
  ): Promise<void> {
    say(`\n=== ${title} ===`);
    const { host, code, players, room } = await newRoom();
    const page = await newTvPage(code);
    // The page's own audio warnings are evidence, not noise: they are how a
    // clip that failed to fetch or decode announces itself (useGameAudio's
    // Task 195/277 console.warn calls).
    const pageWarnings: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('[socrates-audio]')) pageWarnings.push(msg.text().slice(0, 120));
    });
    check(`${title}: the TV page is the attached host display`, room.hostSocketId !== null, String(room.hostSocketId));

    // The ack drains onto this instead of routing into an unstarted game.
    room.pendingSocratesQueue = [{ line: TAIL.line, lineTemplate: TAIL.line, lineTag: TAIL.tag }];

    const showTs = Date.now();
    let backstopFired = false;
    enterSocratesBeat(
      room as never,
      'SOCRATES',
      {
        kind: 'STAGE_INTRO',
        line: LINE.line,
        lineTemplate: LINE.line,
        lineTag: LINE.tag,
        suffixTemplate: suffix?.template ?? null,
        suffixTag: suffix?.tag ?? null,
      } as never,
      () => {
        backstopFired = true;
        advanceFromSocrates(room.code as never);
      },
    );
    const armed = room.activeTimer?.durationMs ?? -1;
    const beatId = room.socratesBeatId;

    // Wait for THIS beat's ack in the server's own log.
    const deadline = Date.now() + Math.max(armed, 20000) + 5000;
    let ended: LogLine | null = null;
    while (ended === null && Date.now() < deadline) {
      ended = logsSince(showTs, `Socrates beat ${beatId} ended`)[0] ?? null;
      await delay(25);
    }
    // Read the probe BEFORE the tail beat's own clip can join it.
    const clips = ((await page.evaluate('window.__aegeanClips')) ?? []) as ProbeClip[];
    room.phase = 'LOBBY'; // the tail's own ack/backstop must not route anywhere

    // Matched by ORDER, not by duration: the chain is deterministic (line,
    // then suffix), and two bank clips can share a duration. Their decoded
    // lengths are then CHECKED against the files they are supposed to be,
    // which is the assertion duration-matching was standing in for.
    const oneShots = clips.filter((c) => !c.loop && c.durMs !== null);
    const lineClip = oneShots[0] ?? null;
    const sufClip = oneShots[1] ?? null;

    say(`  clips actually started in the page (non-looping): ${oneShots.length}`);
    for (const [i, c] of oneShots.entries()) {
      say(`    #${i + 1} start=${c.t.toFixed(1)}ms decoded=${(c.durMs ?? 0).toFixed(0)}ms`);
    }
    say(`  armed backstop        : ${armed}ms`);
    say(`  ack landed            : ${ended === null ? 'NEVER' : `${ended.ts - showTs}ms after the beat began`}`);
    say(`  advanced by           : ${ended === null ? '(nothing)' : ended.text.includes('audio_ended') ? 'socrates:audio_ended' : ended.text}`);
    say(`  page audio warnings   : ${pageWarnings.length === 0 ? 'none' : JSON.stringify(pageWarnings)}`);

    if (suffixIsReal) {
      const gap = lineClip && sufClip ? sufClip.t - (lineClip.t + (lineClip.playForMs ?? lineClip.durMs ?? 0)) : null;
      const total = lineClip && sufClip ? sufClip.t + (sufClip.durMs ?? 0) - lineClip.t : null;
      say(`  gap line-end -> suffix-start : ${gap === null ? 'n/a' : `${gap.toFixed(1)}ms`}`);
      say(`  measured chain total         : ${total === null ? 'n/a' : `${total.toFixed(0)}ms`} vs armed ${armed}ms`);
      check(`${title}: both clips played, line first`, lineClip !== null && sufClip !== null && sufClip.t > lineClip.t, `line@${lineClip?.t.toFixed(0)} suffix@${sufClip?.t.toFixed(0)}`);
      check(
        `${title}: the two clips decoded to the two FILES, in chain order`,
        lineClip !== null &&
          sufClip !== null &&
          Math.abs((lineClip.durMs ?? 0) - LINE.fileMs) < 300 &&
          Math.abs((sufClip.durMs ?? 0) - SUFFIX.fileMs) < 300,
        `${(lineClip?.durMs ?? 0).toFixed(0)}ms vs line ${LINE.fileMs}ms, ${(sufClip?.durMs ?? 0).toFixed(0)}ms vs suffix ${SUFFIX.fileMs}ms`,
      );
      check(`${title}: the suffix starts as the line's played span ends (gap < 250ms)`, gap !== null && gap > -60 && gap < 250, `${gap?.toFixed(1)}ms`);
      check(
        `${title}: the ack waited for the SUFFIX, not the line`,
        ended !== null && ended.ts - showTs > LINE.fileMs + 300,
        `ack at ${ended === null ? -1 : ended.ts - showTs}ms, line alone is ${LINE.fileMs}ms`,
      );
      check(
        `${title}: the whole chain fits inside the armed backstop`,
        total !== null && total < armed,
        `${total?.toFixed(0)}ms < ${armed}ms`,
      );
      check(
        `${title}: backstop = line + margin + suffix`,
        armed === socratesBackstopMs(LINE.line, LINE.tag, SUFFIX.line, SUFFIX.tag) &&
          armed === resolveSocratesClip(LINE.line, LINE.tag).durationMs + SOCRATES_BACKSTOP_MARGIN_MS + resolveSocratesClip(SUFFIX.line, SUFFIX.tag).durationMs,
        `${armed}ms`,
      );
    } else {
      check(`${title}: exactly ONE clip played (the line)`, oneShots.length === 1 && lineClip !== null, `${oneShots.length} clip(s)`);
      // TWO-SIDED on purpose. The one-sided version of this check ("under the
      // backstop") passed at 93ms, which was not the line ending early - it
      // was the line never playing at all, because the absent suffix's decode
      // failure aborted the whole beat. An ack must land AT the line's end.
      check(
        `${title}: the ack landed at the LINE's end, not early and not at the backstop`,
        ended !== null &&
          ended.text.includes('audio_ended') &&
          ended.ts - showTs > LINE.fileMs - 800 &&
          ended.ts - showTs < LINE.fileMs + 1500,
        `ack at ${ended === null ? -1 : ended.ts - showTs}ms, line ${LINE.fileMs}ms, backstop ${armed}ms away`,
      );
      check(
        `${title}: an unmeasurable suffix arms the flat unknown span on top`,
        armed === resolveSocratesClip(LINE.line, LINE.tag).durationMs + SOCRATES_BACKSTOP_MARGIN_MS + SOCRATES_BACKSTOP_UNKNOWN_MS,
        `${armed}ms`,
      );
    }
    check(`${title}: the backstop never fired`, !backstopFired, backstopFired ? 'IT FIRED' : 'never fired');

    await page.close();
    host.disconnect();
    for (const p of players) p.disconnect();
  }

  // =====================================================================
  // C - the wire and the arithmetic. No browser: nothing acks, each beat is
  //     entered, its payload captured, and the next one overwrites it.
  // =====================================================================
  async function runWire(): Promise<void> {
    say('\n=== C: the wire (all four combinations) + the queue drain ===');
    const { host, players, room } = await newRoom();
    const shows: Array<Record<string, unknown>> = [];
    host.on(ServerEvents.SOCRATES_SHOW, (p: Record<string, unknown>) => shows.push(p));
    await delay(200);

    const splice = { template: SUFFIX.line, tag: SUFFIX.tag };
    const combos: Array<{ label: string; prefix: boolean; suffix: boolean }> = [
      { label: 'none  ', prefix: false, suffix: false },
      { label: 'prefix', prefix: true, suffix: false },
      { label: 'suffix', prefix: false, suffix: true },
      { label: 'both  ', prefix: true, suffix: true },
    ];
    const armedByCombo: number[] = [];
    for (const combo of combos) {
      enterSocratesBeat(
        room as never,
        'SOCRATES',
        {
          kind: 'STAGE_INTRO',
          line: LINE.line,
          lineTemplate: LINE.line,
          lineTag: LINE.tag,
          prefixTemplate: combo.prefix ? splice.template : null,
          prefixTag: combo.prefix ? splice.tag : null,
          suffixTemplate: combo.suffix ? splice.template : null,
          suffixTag: combo.suffix ? splice.tag : null,
        } as never,
        () => {},
      );
      armedByCombo.push(room.activeTimer?.durationMs ?? -1);
      await delay(120);
    }
    const [none, prefixOnly, suffixOnly, both] = shows.slice(-4);

    const keysOf = (p: Record<string, unknown>) => Object.keys(p);
    say(`  payload keys, no splice : ${keysOf(none).join(',')}`);
    say(`  payload keys, prefix    : ${keysOf(prefixOnly).join(',')}`);
    say(`  payload keys, suffix    : ${keysOf(suffixOnly).join(',')}`);
    check(
      'C: a prefix-only beat is byte-identical in shape to a no-splice beat',
      JSON.stringify(keysOf(prefixOnly)) === JSON.stringify(keysOf(none)) && !('suffix' in prefixOnly),
      `${keysOf(prefixOnly).length} keys, "suffix" absent`,
    );
    check(
      'C: a no-splice beat carries no `suffix` key at all (absent, not null)',
      !('suffix' in none) && !JSON.stringify(none).includes('"suffix"'),
      'absent from the JSON',
    );
    const expectedWithSuffix = [...keysOf(none)];
    expectedWithSuffix.splice(keysOf(none).indexOf('prefix') + 1, 0, 'suffix');
    check(
      'C: a suffix beat adds exactly one key, right after `prefix`',
      JSON.stringify(keysOf(suffixOnly)) === JSON.stringify(expectedWithSuffix),
      keysOf(suffixOnly).join(','),
    );
    check(
      'C: the suffix on the wire is the (template, tag) pair the server spliced',
      JSON.stringify(suffixOnly.suffix) === JSON.stringify(splice) && JSON.stringify(both.suffix) === JSON.stringify(splice),
      JSON.stringify(suffixOnly.suffix),
    );
    check(
      'C: prefix and suffix are independent on the wire',
      JSON.stringify(both.prefix) === JSON.stringify(splice) && prefixOnly.suffix === undefined && suffixOnly.prefix === null,
      `both=${JSON.stringify(both.prefix)}/${JSON.stringify(both.suffix)}`,
    );

    const lineMs = resolveSocratesClip(LINE.line, LINE.tag).durationMs;
    const sufMs = resolveSocratesClip(SUFFIX.line, SUFFIX.tag).durationMs;
    say(`  armed: none=${armedByCombo[0]}ms prefix=${armedByCombo[1]}ms suffix=${armedByCombo[2]}ms both=${armedByCombo[3]}ms`);
    say(`  (line ${lineMs}ms + margin ${SOCRATES_BACKSTOP_MARGIN_MS}ms, suffix ${sufMs}ms)`);
    check(
      'C: prefix does not change the armed backstop (Task 263, unchanged)',
      armedByCombo[0] === lineMs + SOCRATES_BACKSTOP_MARGIN_MS && armedByCombo[1] === armedByCombo[0],
      `${armedByCombo[0]}ms = ${armedByCombo[1]}ms`,
    );
    check(
      'C: suffix adds its own clip to the armed backstop',
      armedByCombo[2] === lineMs + SOCRATES_BACKSTOP_MARGIN_MS + sufMs && armedByCombo[3] === armedByCombo[2],
      `${armedByCombo[2]}ms`,
    );
    check(
      'C: totalDurationMs covers both clips for a suffix beat, and only the line otherwise',
      none.totalDurationMs === lineMs && suffixOnly.totalDurationMs === lineMs + sufMs,
      `${none.totalDurationMs}ms vs ${suffixOnly.totalDurationMs}ms`,
    );
    check(
      'C: an UNMEASURABLE suffix adds the flat unknown span, not the 4000ms floor',
      socratesBackstopMs(LINE.line, LINE.tag, NO_FILE, null) === lineMs + SOCRATES_BACKSTOP_MARGIN_MS + SOCRATES_BACKSTOP_UNKNOWN_MS,
      `${socratesBackstopMs(LINE.line, LINE.tag, NO_FILE, null)}ms`,
    );

    // The queue drain: a suffix queued on a LATER line of a sequence must
    // survive onto that line's own beat (what startSocratesSequence does when
    // a sequence closes with an address).
    shows.length = 0;
    room.pendingSocratesQueue = [
      { line: LINE.line, lineTemplate: LINE.line, lineTag: LINE.tag, suffixTemplate: splice.template, suffixTag: splice.tag },
    ];
    enterSocratesBeat(
      room as never,
      'SOCRATES',
      { kind: 'STAGE_INTRO', line: LINE.line, lineTemplate: LINE.line, lineTag: LINE.tag } as never,
      () => {},
    );
    await delay(120);
    const first = shows[shows.length - 1];
    advanceFromSocrates(room.code as never);
    await delay(200);
    const second = shows[shows.length - 1];
    say(`  sequence: beat 1 suffix=${JSON.stringify(first.suffix)}, beat 2 suffix=${JSON.stringify(second.suffix)}`);
    check(
      'C: a suffix queued on line 2 rides onto line 2\'s own beat, not line 1\'s',
      first.suffix === undefined && JSON.stringify(second.suffix) === JSON.stringify(splice),
      `beat2 armed ${room.activeTimer?.durationMs}ms`,
    );
    check(
      'C: and that drained beat is armed for both clips',
      room.socratesBackstopMs === lineMs + SOCRATES_BACKSTOP_MARGIN_MS + sufMs,
      `${room.socratesBackstopMs}ms`,
    );

    room.phase = 'LOBBY';
    host.disconnect();
    for (const p of players) p.disconnect();
  }

  const run = (s: string) => SCENARIO === '' || SCENARIO === s;

  if (run('C')) await runWire();

  if (run('A') || run('B')) {
    clientProc = spawn('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], {
      cwd: CLIENT_DIR,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, VITE_SERVER_URL: ORIGIN },
    });
    await waitForClient();
    browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    say('client + browser ready');
  }

  if (run('A')) await runBrowserScenario('A (real suffix clip)', { template: SUFFIX.line, tag: SUFFIX.tag }, true);
  if (run('B')) await runBrowserScenario('B (suffix file absent)', { template: NO_FILE, tag: null }, false);

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
