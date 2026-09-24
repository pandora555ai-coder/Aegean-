// Task 308 - names in every v2 slot + tight vocative splices.
//
//   W  (wire, no browser) - every single-target v2 slot is forced in-process
//      off a hand-built stage ledger and its SOCRATES_SHOW payload quoted: the
//      subtitle must read "<vocative>. <line>" and `prefix` must name the
//      vocative clip when the bank has it, null when it does not (a ledger name
//      with no clip, Ζήνων).
//   T  (trim, real browser) - a beat with a long-tailed vocative PREFIX ahead
//      of a real bank line, for three vocatives; the gap between the prefix's
//      SPEECH end (offline, same algorithm/threshold) and the line's start is
//      read off an AudioBufferSourceNode.start probe. Run it once on a tree
//      with the client change stashed to get the BEFORE numbers.
//
//   L  LIVE: a real browser TV on ?bot=4&mode=full&policy=v2 played to
//      GAME_OVER; every beat logged with prefix="..." is matched to the probe's
//      clip pair started after it (by wall clock), gap measured, ack read.
//
//   SCENARIO=W|T|L npx tsx dev/308-vocative-slot-check.ts
process.env.PORT = process.env.SERVER_PORT ?? '3968';

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
const SERVER_PORT = Number(process.env.SERVER_PORT ?? 3968);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5969);
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
const NAMES = ['Άλκης', 'Άρης', 'Λευτέρης'];
const AVATARS = ['sphinx', 'minotaur', 'centaur'];

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
        wall: Date.now(),
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
  playForMs: number | null;
  wall: number;
  durMs: number | null;
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
  const phases = await import('../server/src/phases.js');
  const { collectVoiceLineEntries } = await import('../server/src/socrates.js');
  const { createStageLedger } = await import('../server/src/stageLedger.js');

  async function newRoom(): Promise<{ host: Socket; code: string; players: Socket[]; room: any }> {
    const host = connect();
    const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
    host.emit(ClientEvents.CREATE_ROOM, { mode: 'quiz', speechPolicy: 'v2' });
    const { code } = await created;
    const players: Socket[] = [];
    for (let i = 0; i < NAMES.length; i++) players.push(await joinPlayer(code, NAMES[i], i));
    const room = getRoom(code) as any;
    room.gameIntroPlayed = true;
    return { host, code, players, room };
  }

  function entry(playerId: string, name: string, points: number, stealTaken = 0, stealGiven = 0): any {
    return {
      playerId, name, correct: 0, wrong: 0, noAnswer: 0, points, fastestCount: 0,
      firstHalf: { correct: 0, wrong: 0 }, secondHalf: { correct: 0, wrong: 0 },
      blitzRounds: [], drawRounds: [], numericMisses: [], stealTaken, stealGiven,
    };
  }

  async function runWire(): Promise<void> {
    say('\n=== W: one SOCRATES_SHOW per single-target slot kind ===');
    const { host, room } = await newRoom();
    const shows: any[] = [];
    host.on(ServerEvents.SOCRATES_SHOW, (p: any) => shows.push(p));
    const slots = ['QUIZ_MID', 'QUIZ_CLOSE', 'BLITZ_MID', 'BLITZ_CLOSE', 'DRAW_MID', 'NUMERIC_CLOSE', 'LETHE_CLOSE', 'SYKO_FIRST_STEAL', 'SYKO_CLOSE'];
    // Three with a vocative clip, one (Ζήνων, not a preset) without.
    const cast: Array<[string, string]> = [['p1', 'Άλκης'], ['p2', 'Άρης'], ['p3', 'Λευτέρης'], ['p4', 'Ζήνων']];
    for (const [i, slot] of slots.entries()) {
      const ledger = createStageLedger();
      ledger.stage = 1;
      // Rotate who is best/worst so every slot names someone, and one of them Ζήνων.
      const pts = [30, 10, 20, 0].map((_, k) => [30, 10, 20, 0][(k + i) % 4]);
      cast.forEach(([id, name], k) => ledger.entries.set(id, entry(id, name, pts[k], k === (i % 4) ? 50 : 0, k === ((i + 1) % 4) ? 50 : 0)));
      room.socrates.ledger = ledger;
      const before = shows.length;
      const fired = phases.startSpeechSlotBeat(room, 'SOCRATES', slot as never, () => {});
      await delay(150);
      const p = shows[before];
      if (!fired || !p) { check(`W ${slot} fired`, false, 'no beat'); continue; }
      say(`  ${slot.padEnd(16)} ${JSON.stringify({ kind: p.kind, line: p.line, prefix: p.prefix })}`);
      const noClip = p.line.startsWith('Ζήνων.');
      check(`W ${slot}: subtitle names the target`, /^\S+\. /.test(p.line), p.line.split('.')[0]);
      check(`W ${slot}: prefix ${noClip ? 'null (no clip)' : 'is the vocative clip'}`,
        noClip ? p.prefix === null : p.prefix?.template === p.line.split('.')[0], JSON.stringify(p.prefix));
    }
    room.phase = 'LOBBY';
    (await import("../server/src/timers.js")).clearActiveTimer(room);
  }

  async function runTrim(): Promise<void> {
    say('\n=== T: prefix -> line gap, real browser ===');
    const LINE = collectVoiceLineEntries().find((e) => e.line.length > 30 && e.line.length < 60 && existsSync(path.join(VOICE_DIR, `${e.hash}.mp3`)))!;
    // Speech ends measured offline with the client's algorithm (10ms windows,
    // RMS >= 0.015, loudest channel), WITHOUT the 120ms tail.
    const vocs: Array<{ name: string; voc: string; speechEndMs: number }> = JSON.parse(process.env.VOCS!);
    for (const v of vocs) {
      const { host, code, players, room } = await newRoom();
      const page = await newTvPage(code);
      const t0 = Date.now();
      phases.enterSocratesBeat(room, 'SOCRATES', {
        kind: 'SPEECH_SLOT', line: `${v.voc}. ${LINE.line}`, lineTemplate: LINE.line, lineTag: LINE.tag,
        prefixTemplate: v.voc, prefixTag: null,
      } as never, () => {});
      const beatId = room.socratesBeatId;
      let ended: LogLine | null = null;
      while (!ended && Date.now() - t0 < 30000) { ended = logsSince(t0, `Socrates beat ${beatId} ended`)[0] ?? null; await delay(25); }
      room.phase = 'LOBBY';
      const clips = (((await page.evaluate('window.__aegeanClips')) ?? []) as ProbeClip[]).filter((c) => !c.loop && c.durMs !== null);
      const [pre, line] = clips;
      const startDelta = line.t - pre.t;
      say(`  ${v.voc.padEnd(9)} prefix buffer=${pre.durMs!.toFixed(0)}ms playFor=${pre.playForMs === null ? 'whole' : pre.playForMs.toFixed(0) + 'ms'} ` +
        `speechEnd=${v.speechEndMs}ms line started +${startDelta.toFixed(0)}ms -> GAP speech-end->line = ${(startDelta - v.speechEndMs).toFixed(0)}ms; ` +
        `ack ${ended ? (ended.ts - t0) + 'ms ' + (ended.text.includes('audio_ended') ? 'socrates:audio_ended' : ended.text) : 'NEVER'} (backstop ${room.socratesBackstopMs}ms)`);
      check(`T ${v.voc}: two clips, ack via audio_ended`, clips.length === 2 && !!ended?.text.includes('audio_ended'), `${clips.length} clips`);
      await page.close(); host.disconnect(); for (const p of players) p.disconnect();
    }
  }


  async function runPause(): Promise<void> {
    say('\n=== P: pause mid-prefix, real browser ===');
    const LINE = collectVoiceLineEntries().find((e) => e.line.length > 30 && e.line.length < 60 && existsSync(path.join(VOICE_DIR, `${e.hash}.mp3`)))!;
    const { host, code, players, room } = await newRoom();
    const page = await newTvPage(code);
    room.phase = 'QUESTION'; // pause is refused in LOBBY
    const t0 = Date.now();
    phases.enterSocratesBeat(room, 'SOCRATES', {
      kind: 'SPEECH_SLOT', line: `Άλκη. ${LINE.line}`, lineTemplate: LINE.line, lineTag: LINE.tag, prefixTemplate: 'Άλκη', prefixTag: null,
    } as never, () => { say('  BACKSTOP FIRED'); });
    const beatId = room.socratesBeatId;
    // Pause as soon as the prefix clip has started.
    while (Date.now() - t0 < 10000) {
      const n = ((await page.evaluate('window.__aegeanClips.length')) as number);
      if (n >= 1) break;
      await delay(10);
    }
    await delay(250);
    players[0].emit(ClientEvents.GAME_PAUSE, {});
    await delay(200);
    const remAtPause = room.activeTimer ? (await import('../server/src/timers.js')).remainingActiveTimerMs(room) : -1;
    const pausedAt = Date.now();
    await delay(4000);
    const remAfter = (await import('../server/src/timers.js')).remainingActiveTimerMs(room);
    const clipsDuringPause = ((await page.evaluate('window.__aegeanClips')) as ProbeClip[]).filter((c) => !c.loop).length;
    const endedDuringPause = logsSince(t0, `Socrates beat ${beatId} ended`).length;
    players[0].emit(ClientEvents.GAME_RESUME, {});
    const resumedAt = Date.now();
    let ended: LogLine | null = null;
    while (!ended && Date.now() - t0 < 30000) { ended = logsSince(t0, `Socrates beat ${beatId} ended`)[0] ?? null; await delay(25); }
    const clips = ((await page.evaluate('window.__aegeanClips')) as ProbeClip[]).filter((c) => !c.loop && c.durMs !== null);
    room.phase = 'LOBBY';
    say(`  paused=${room.paused} after resume; timer remaining at pause ${remAtPause}ms, after 4s paused ${remAfter}ms`);
    say(`  clips started while paused: ${clipsDuringPause} (prefix only); ended while paused: ${endedDuringPause}`);
    say(`  line started ${clips[1] ? clips[1].wall - resumedAt : '?'}ms after resume (prefix playFor=${clips[0]?.playForMs?.toFixed(0)}ms, paused ~${(resumedAt - pausedAt)}ms)`);
    say(`  ack ${ended ? ended.ts - resumedAt + 'ms after resume via ' + (ended.text.includes('audio_ended') ? 'socrates:audio_ended' : ended.text) : 'NEVER'}`);
    check('P: timer frozen while paused', Math.abs(remAtPause - remAfter) < 50, `${remAtPause} -> ${remAfter}`);
    check('P: nothing advanced while paused, line waited', clipsDuringPause === 1 && endedDuringPause === 0, `${clipsDuringPause}/${endedDuringPause}`);
    check('P: after resume, line played and beat ended on audio_ended', clips.length === 2 && !!ended?.text.includes('audio_ended'), `${clips.length} clips`);
    await page.close(); host.disconnect(); for (const p of players) p.disconnect();
  }

  async function runLive(): Promise<void> {
    say('\n=== L: live ?bot=4&mode=full&policy=v2 ===');
    const page = await browser!.newPage({ viewport: { width: 1280, height: 720 } });
    await page.addInitScript(AUDIO_PROBE);
    const t0 = Date.now();
    await page.goto(`${CLIENT_ORIGIN}/host?bot=4&mode=full&policy=v2&clock=off`);
    // ?bot=N skips the gate but nothing presses "Create Room" (303's own note).
    await page.locator('[data-testid="lobby-root"] button:not([data-testid="mute-toggle"])').first().click({ timeout: 20000 });
    await delay(5000);
    if (logsSince(t0, 'speechPolicy=v2').length === 0) throw new Error('room was not created as v2 within 5s');
    while (Date.now() - t0 < 1_500_000 && logsSince(t0, 'game over').length === 0) {
      await delay(1000);
    }
    await delay(3000);
    say(`  show ran ${((Date.now() - t0) / 1000).toFixed(0)}s; created: ${logsSince(t0, 'speechPolicy=v2').length ? 'speechPolicy=v2' : '??'}`);
    const clips = (((await page.evaluate('window.__aegeanClips')) ?? []) as ProbeClip[]).filter((c) => !c.loop && c.durMs !== null);
    const beats = serverLog.filter((l) => l.ts >= t0 && / beat \d+ backstop=/.test(l.text));
    say(`  beats: ${beats.length}, prefixed: ${beats.filter((b) => b.text.includes('prefix=')).length}, clips started: ${clips.length}`);
    for (const b of beats) {
      const m = b.text.match(/Socrates \((\w+)\) beat (\d+) backstop=(\d+)ms(?: prefix="([^"]+)")?/);
      if (!m) continue;
      const [, kind, id, backstop, prefix] = m;
      const ended = serverLog.find((l) => l.ts >= b.ts && l.text.includes(`Socrates beat ${id} ended`) || l.ts >= b.ts && l.text.includes(`Socrates beat ${id} has no clip`));
      const line = (b.text.split('— "')[1] ?? '').slice(0, 50);
      if (!prefix) {
        if (kind === 'SPEECH_SLOT' || kind === 'DRAW_WINNER') say(`  beat ${id} ${kind} NO PREFIX "${line}"`);
        continue;
      }
      const i = clips.findIndex((c) => c.wall >= b.ts - 50);
      const pre = clips[i];
      const nxt = clips[i + 1];
      const gap = pre && nxt && pre.playForMs !== null ? nxt.t - pre.t - (pre.playForMs - 120) : null;
      say(`  beat ${id} ${kind} prefix="${prefix}" buf=${pre?.durMs?.toFixed(0)} playFor=${pre?.playForMs?.toFixed(0)} ` +
        `line+${pre && nxt ? (nxt.t - pre.t).toFixed(0) : '?'}ms speech-end->line GAP=${gap === null ? '?' : gap.toFixed(0)}ms ` +
        `ack=${ended ? (ended.text.includes('audio_ended') ? 'socrates:audio_ended' : ended.text.slice(0, 60)) + ' @+' + (ended.ts - b.ts) + 'ms' : 'NONE'} backstop=${backstop} "${line}"`);
    }
    await page.close();
  }

  const run = (s: string) => SCENARIO === '' || SCENARIO === s;
  if (run('W')) await runWire();
  if (run('T') || run('L') || run('P')) {
    clientProc = spawn('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], {
      cwd: CLIENT_DIR, detached: true, stdio: 'ignore', env: { ...process.env, VITE_SERVER_URL: ORIGIN },
    });
    await waitForClient();
    browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    if (run('T')) await runTrim();
    if (run('P')) await runPause();
    if (run('L')) await runLive();
  }
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
