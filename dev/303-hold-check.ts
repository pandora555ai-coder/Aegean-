// Task 303 - a beat whose LINE has no mp3 holds the screen for an estimated
// speaking duration instead of vanishing.
//
// The defect was not silence, it was INVISIBILITY. Task 154 makes the client
// ack a missing clip the instant it discovers the 404, so such a beat ended in
// ~50ms: Argyrios watched QUIZ_MID and QUIZ_CLOSE fire correctly on a live v2
// TV and read nothing at all. None of the 36 v2 slot lines has an mp3 yet, so
// that is every v2 slot beat in the game today.
//
// Infra is dev/277-splice-check.ts's, which this descends from: the REAL server
// in-process on a throwaway port set BEFORE the import, a console.log tee so the
// server's own armed/absorbed/advanced lines land in this harness's stdout, real
// player sockets, and (scenario A only) a throwaway Vite plus a real browser TV.
//
//   A  LIVE: a real browser TV on ?bot=4&mode=full&policy=v2. The subtitle's
//      on-screen time is sampled from the DOM every 100ms and compared against
//      the hold computed from that subtitle's OWN text - for QUIZ_MID and
//      QUIZ_CLOSE, the two beats of the field report - while a clip-backed
//      GAME_INTRO beat in the same run is checked to be unheld.
//   B  a passed skip vote cutting a HELD line mid-hold.
//   C  a pause mid-hold: frozen, resumed, and never double-acked.
//   D  INVERSE: a clip-backed beat is untouched - no hold, ack-driven, the
//      same arithmetic as before this task.
//   E  INVERSE at show scale: a v1 bot show, every clip-backed beat ending on
//      its own audio exactly as it did before.
//
//   npx tsx dev/303-hold-check.ts               all scenarios
//   SCENARIO=B npx tsx dev/303-hold-check.ts    one (A|B|C|D|E)
process.env.PORT = process.env.SERVER_PORT ?? '3975';

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
  SOCRATES_HOLD_MAX_MS,
  lineHash,
} from '@game/shared';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_DIR = path.join(ROOT, 'client');
const VOICE_DIR = path.join(ROOT, 'client', 'public', 'voice');
const SERVER_PORT = Number(process.env.SERVER_PORT ?? 3975);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5976);
const ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const CLIENT_ORIGIN = `http://127.0.0.1:${CLIENT_PORT}`;
const SCENARIO = (process.env.SCENARIO ?? '').toUpperCase();
const run = (s: string): boolean => SCENARIO === '' || SCENARIO === s;

let clientProc: ChildProcess | null = null;
let browser: Browser | null = null;
const sockets: Socket[] = [];

// -------------------------------------------------------------------------
// Server log tee - 277's, verbatim. The armed span, the absorbed ack and the
// advance are all server-side console.logs.
// -------------------------------------------------------------------------
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

// Task 241/245 - preset membership; 277's own two.
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

type RoomLike = {
  code: string;
  phase: string;
  paused: boolean;
  gameIntroPlayed: boolean;
  socratesBeatId: number;
  socratesBackstopMs: number;
  socratesHoldMs: number | null;
  hostSocketId: string | null;
  skipVote: { voters: Set<string>; resolved: boolean } | null;
  pendingSocratesQueue: Array<Record<string, unknown>>;
  activeTimer: { kind: string; durationMs: number } | null;
};

function fileMsOf(hash: string): number | null {
  const file = path.join(VOICE_DIR, `${hash}.mp3`);
  if (!existsSync(file)) return null;
  return Math.round((statSync(file).size * 8) / AUDIO_BITRATE_KBPS);
}

// Poll a predicate, returning how long it took (or null on timeout).
async function waitUntil(pred: () => boolean, timeoutMs: number, stepMs = 50): Promise<number | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (pred()) return Date.now() - t0;
    await delay(stepMs);
  }
  return null;
}

async function main(): Promise<void> {
  say(`booting in-process server on ${SERVER_PORT}`);
  await import('../server/src/index.js');
  const { getRoom } = await import('../server/src/state.js');
  const { enterSocratesBeat, advanceFromSocrates } = await import('../server/src/phases.js');
  const { collectVoiceLineEntries } = await import('../server/src/socrates.js');
  const { socratesHoldMs } = await import('../server/src/socratesAudio.js');
  const { remainingActiveTimerMs, clearActiveTimer } = await import('../server/src/timers.js');
  // Task 310 - a scenario's LAST armed beat timer used to outlive it and fire
  // into scenario E's process: advanceFromSocrates -> startQuestion on a room
  // that never started a game -> TypeError, killing the whole run. (Unreachable
  // until 310, because the harness threw before B on "found 166/0".) Retire the
  // room's timer and queue before its sockets go.
  const retire = (room: RoomLike): void => {
    clearActiveTimer(room as never);
    room.pendingSocratesQueue = [];
    (room as unknown as { phase: string }).phase = 'LOBBY';
  };

  const entries = collectVoiceLineEntries() as Array<{ moment: string; line: string; tag: string | null; hash: string }>;
  const withClip = entries
    .map((e) => ({ ...e, fileMs: fileMsOf(e.hash) }))
    .filter((e): e is typeof e & { fileMs: number } => e.fileMs !== null && e.fileMs > 4500)
    .sort((a, b) => a.fileMs - b.fileMs);
  // Task 310 - this used to pick REAL v2 slot lines that had no mp3 (the lines
  // the field report was about). Tasks 306/307 recorded every one of them, so
  // there are none left and it threw "found 166/0". The clip-less lines are now
  // TEST-ONLY lines: text no pool contains, so no file for their hash exists
  // or ever will, and nothing in the bank is touched. Two lengths, so the hold
  // arithmetic (chars / 11 per sec, clamped 3000..9000ms) is exercised for
  // real rather than sitting on the clamp.
  const synth = (line: string): { moment: string; line: string; tag: string | null; hash: string } => ({
    moment: 'TEST (303)',
    line,
    tag: null,
    hash: lineHash(line, null),
  });
  const noClip = [
    synth('Δοκιμαστική γραμμή τριακοσίων: ο Σωκράτης μιλά χωρίς ήχο, και η οθόνη οφείλει να τον κρατήσει ορατό.'),
    synth('Δεύτερη δοκιμαστική γραμμή, λίγο πιο σύντομη, για να μην περάσει ποτέ από φωνή.'),
  ];
  if (withClip.length < 2 || noClip.some((e) => existsSync(path.join(VOICE_DIR, `${e.hash}.mp3`)))) {
    throw new Error(`need 2 clipped lines and 2 clip-less TEST lines, found ${withClip.length} clipped / ${noClip.filter((e) => !existsSync(path.join(VOICE_DIR, `${e.hash}.mp3`))).length} clip-less`);
  }
  const CLIP = withClip[0];
  const TAIL = withClip[withClip.length - 1];
  const NO_CLIP = noClip[0];
  const NO_CLIP_2 = noClip[1];
  say(`  clip line   : ${CLIP.fileMs}ms  "${CLIP.line.slice(0, 44)}…"`);
  say(`  no-clip line: ${NO_CLIP.line.length} chars -> hold ${socratesHoldMs(NO_CLIP.line)}ms  "${NO_CLIP.line.slice(0, 44)}…"`);

  async function newRoom(): Promise<{ host: Socket; code: string; players: Socket[]; room: RoomLike }> {
    const host = connect();
    const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
    host.emit(ClientEvents.CREATE_ROOM, { mode: 'quiz' });
    const { code } = await created;
    const players: Socket[] = [];
    for (let i = 0; i < NAMES.length; i++) players.push(await joinPlayer(code, NAMES[i], i));
    const room = getRoom(code) as unknown as RoomLike;
    room.gameIntroPlayed = true; // Task 237 - or the ten-line narration fires instead
    return { host, code, players, room };
  }

  function beginBeat(
    room: RoomLike,
    code: string,
    entry: { line: string; tag: string | null },
    kind: string,
  ): void {
    enterSocratesBeat(
      room as never,
      'SOCRATES',
      { kind: kind as never, line: entry.line, lineTemplate: entry.line, lineTag: entry.tag },
      () => advanceFromSocrates(code),
    );
  }

  // =====================================================================
  // B - a passed skip vote cutting a HELD line, mid-hold.
  // =====================================================================
  if (run('B')) {
    say('\n=== B (skip vote cuts a held GAME_INTRO line) ===');
    // Task 310 - SKIP_INTERRUPTED's four lines were recorded by Task 306, so the
    // interruption beat now has audio and would (correctly) not be held. This
    // scenario is about the HELD interruption, so those four are hidden from the
    // SERVER via AEGEAN_DEV_HIDE_CLIPS (dev-only, socratesAudio.ts) - the host
    // here is a socket, so there is no browser half. The bank is untouched.
    process.env.AEGEAN_DEV_HIDE_CLIPS = entries.filter((e) => e.moment === 'SKIP_INTERRUPTED').map((e) => e.hash).join(',');
    const { host, code, players, room } = await newRoom();
    // A narration: a second line queued behind the first, and the vote the
    // real startSocratesSequence opens - seeded exactly as openSkipVote does.
    room.pendingSocratesQueue = [{ line: NO_CLIP_2.line, lineTemplate: NO_CLIP_2.line, lineTag: NO_CLIP_2.tag }];
    room.skipVote = { voters: new Set(), resolved: false };
    let stopped: { beatId?: number } | null = null;
    host.on(ServerEvents.SOCRATES_STOP, (p: { beatId?: number }) => {
      stopped = p;
    });

    const t0 = Date.now();
    beginBeat(room, code, NO_CLIP, 'GAME_INTRO');
    const beat1 = room.socratesBeatId;
    const plannedHold = room.socratesHoldMs;
    const armedBackstop = room.socratesBackstopMs;
    say(`  beat ${beat1}: ${NO_CLIP.line.length} chars, hold ${plannedHold}ms, backstop ${armedBackstop}ms`);

    // The Task 154 path: a real browser acks a missing clip at once.
    host.emit(ClientEvents.SOCRATES_AUDIO_ENDED, { beatId: beat1 });
    await delay(300);
    const ackMs = Date.now() - t0;
    const absorbed = logsSince(t0, 'has no clip - holding');
    check(
      'B: the instant ack is ABSORBED, not advanced',
      room.socratesBeatId === beat1 && room.phase === 'SOCRATES' && absorbed.length === 1,
      `ack at ${ackMs}ms, beat still ${room.socratesBeatId}, log "${absorbed[0]?.text.split(' - ').slice(1).join(' - ') ?? 'MISSING'}"`,
    );
    check(
      'B: the hold is armed on the ordinary timer, well under the backstop',
      room.activeTimer !== null && room.activeTimer.durationMs < armedBackstop && room.socratesHoldMs === null,
      `timer ${room.activeTimer?.kind} ${room.activeTimer?.durationMs}ms vs backstop ${armedBackstop}ms; holdMs consumed=${room.socratesHoldMs === null}`,
    );

    await delay(1000); // sit inside the hold
    const leftAtVote = remainingActiveTimerMs(room as never);
    for (const p of players) p.emit(ClientEvents.SKIP_VOTE, { beatId: beat1 });
    // Exactly when the interruption beat replaced the held one. A hold is
    // anchored to BEAT START, not to the ack that it absorbs - so this, not the
    // ack, is what the interruption's own screen time must be measured from.
    await waitUntil(() => room.socratesBeatId === beat1 + 1, 4000);
    const tInterrupt = Date.now();
    await delay(300);
    check(
      'B: the vote passed MID-HOLD and cut the held line',
      room.socratesBeatId === beat1 + 1,
      `${leftAtVote}ms of the hold still to run when the vote landed; beat ${beat1} -> ${room.socratesBeatId}`,
    );
    check('B: the queued line was discarded', room.pendingSocratesQueue.length === 0, `${room.pendingSocratesQueue.length} queued`);
    check(
      'B: socrates:stop named the stopped beat (the ack is suppressed, never synthesised)',
      (stopped as { beatId?: number } | null)?.beatId === beat1,
      `stop beatId=${(stopped as { beatId?: number } | null)?.beatId}`,
    );
    check(
      'B: the interruption beat is itself HELD (SKIP_INTERRUPTED has no mp3)',
      room.socratesHoldMs !== null,
      `hold ${room.socratesHoldMs}ms, backstop ${room.socratesBackstopMs}ms`,
    );

    // A late ack for the beat that was stopped must change nothing.
    const tStale = Date.now();
    host.emit(ClientEvents.SOCRATES_AUDIO_ENDED, { beatId: beat1 });
    await delay(300);
    check(
      'B: a late ack for the stopped beat is refused - no double advance',
      room.socratesBeatId === beat1 + 1 && room.phase === 'SOCRATES' && logsSince(tStale, 'stale beat').length === 1,
      `beat still ${room.socratesBeatId}, "${logsSince(tStale, 'stale beat')[0]?.text.split(': ').pop() ?? 'no stale log'}"`,
    );

    // Give the interruption somewhere to land, then let its own hold run out.
    room.pendingSocratesQueue = [{ line: TAIL.line, lineTemplate: TAIL.line, lineTag: TAIL.tag }];
    const beat2 = room.socratesBeatId;
    const interruptionHold = room.socratesHoldMs ?? 0;
    const ackedAt = Date.now() - tInterrupt;
    host.emit(ClientEvents.SOCRATES_AUDIO_ENDED, { beatId: beat2 });
    const advanced = await waitUntil(() => room.socratesBeatId === beat2 + 1, interruptionHold + 4000);
    const onScreenMs = advanced === null ? null : Date.now() - tInterrupt;
    check(
      'B: the interruption played for its own full hold, then advanced exactly once',
      onScreenMs !== null && Math.abs(onScreenMs - interruptionHold) < 500 && room.socratesBeatId === beat2 + 1,
      `on screen ${onScreenMs}ms vs hold ${interruptionHold}ms — its ack landed at ${ackedAt}ms and did NOT extend it; beat ${room.socratesBeatId}`,
    );
    retire(room);
    for (const s of [host, ...players]) s.disconnect();
  }

  // =====================================================================
  // C - a pause mid-hold.
  // =====================================================================
  delete process.env.AEGEAN_DEV_HIDE_CLIPS;

  if (run('C')) {
    say('\n=== C (pause mid-hold) ===');
    const { host, code, players, room } = await newRoom();
    room.pendingSocratesQueue = [{ line: TAIL.line, lineTemplate: TAIL.line, lineTag: TAIL.tag }];
    const t0 = Date.now();
    beginBeat(room, code, NO_CLIP, 'GAME_INTRO');
    const beat1 = room.socratesBeatId;
    const plannedHold = room.socratesHoldMs ?? 0;
    host.emit(ClientEvents.SOCRATES_AUDIO_ENDED, { beatId: beat1 });
    await delay(300);
    check('C: hold armed after the instant ack', room.socratesHoldMs === null && room.activeTimer !== null, `hold ${plannedHold}ms`);

    await delay(1000);
    players[0].emit(ClientEvents.GAME_PAUSE);
    await delay(250);
    const r1 = remainingActiveTimerMs(room as never);
    await delay(900);
    const r2 = remainingActiveTimerMs(room as never);
    check('C: the hold FREEZES while paused', room.paused && r1 === r2, `${r1}ms then ${r2}ms, 900ms apart`);

    // A duplicate ack arriving while paused must not advance anything.
    const tDup = Date.now();
    host.emit(ClientEvents.SOCRATES_AUDIO_ENDED, { beatId: beat1 });
    await delay(250);
    check(
      'C: a duplicate ack during the paused hold is refused',
      room.socratesBeatId === beat1 && logsSince(tDup, 'game is paused').length === 1,
      `beat still ${beat1}; "${logsSince(tDup, 'game is paused')[0]?.text.split(': ').pop() ?? 'no pause log'}"`,
    );

    players[0].emit(ClientEvents.GAME_RESUME);
    const resumedIn = await waitUntil(() => room.socratesBeatId === beat1 + 1, r1 + 4000);
    check(
      'C: resumed with its remainder intact and advanced exactly once',
      resumedIn !== null && Math.abs(resumedIn - r1) < 500 && room.socratesBeatId === beat1 + 1,
      `advanced ${resumedIn}ms after resume vs ${r1}ms frozen remainder; beat ${room.socratesBeatId}`,
    );
    retire(room);
    for (const s of [host, ...players]) s.disconnect();
  }

  // =====================================================================
  // D - INVERSE: a clip-backed beat is untouched.
  // =====================================================================
  if (run('D')) {
    say('\n=== D (inverse: a clip-backed beat is not held) ===');
    const { host, code, players, room } = await newRoom();
    room.pendingSocratesQueue = [{ line: TAIL.line, lineTemplate: TAIL.line, lineTag: TAIL.tag }];
    const t0 = Date.now();
    beginBeat(room, code, CLIP, 'GAME_INTRO');
    const beat1 = room.socratesBeatId;
    check(
      'D: a line WITH a clip sets no hold at all',
      room.socratesHoldMs === null,
      `holdMs=${room.socratesHoldMs}, backstop ${room.socratesBackstopMs}ms`,
    );
    check(
      'D: the backstop is the pre-change arithmetic, clip + margin',
      room.socratesBackstopMs === CLIP.fileMs + SOCRATES_BACKSTOP_MARGIN_MS,
      `${room.socratesBackstopMs}ms = ${CLIP.fileMs} + ${SOCRATES_BACKSTOP_MARGIN_MS}`,
    );
    // Ack when the real audio would have ended.
    await delay(CLIP.fileMs);
    const tAck = Date.now();
    host.emit(ClientEvents.SOCRATES_AUDIO_ENDED, { beatId: beat1 });
    const advancedIn = await waitUntil(() => room.socratesBeatId === beat1 + 1, 4000);
    check(
      'D: it advances ON the ack, with nothing added',
      advancedIn !== null && advancedIn < 250 && logsSince(t0, 'has no clip - holding').length === 0,
      `advanced ${advancedIn}ms after the ack (beat ran ${tAck - t0}ms ≈ clip ${CLIP.fileMs}ms), 0 hold logs`,
    );
    retire(room);
    for (const s of [host, ...players]) s.disconnect();
  }

  // =====================================================================
  // E - INVERSE at show scale: a v1 bot show's clip-backed beats.
  // =====================================================================
  if (run('E')) {
    say('\n=== E (inverse: v1 show, clip-backed beats end on their own audio) ===');
    const host = connect();
    const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
    interface Seen {
      line: string;
      total: number;
      hasClip: boolean;
      start: number;
      end: number | null;
    }
    const seen: Seen[] = [];
    host.on(ServerEvents.SOCRATES_SHOW, (p: { line: string; lineTemplate: string; lineTag: string | null; totalDurationMs: number; beatId: number }) => {
      const prev = seen[seen.length - 1];
      if (prev && prev.end === null) prev.end = Date.now();
      const hash = (p.lineTemplate ?? p.line) as string;
      seen.push({
        line: p.line,
        total: p.totalDurationMs,
        hasClip: fileMsOf(lineHash(hash, p.lineTag)) !== null,
        start: Date.now(),
        end: null,
      });
      // Behave like a real browser: ack when the audio would have finished.
      setTimeout(() => host.emit(ClientEvents.SOCRATES_AUDIO_ENDED, { beatId: p.beatId }), p.totalDurationMs);
    });
    host.emit(ClientEvents.CREATE_ROOM, { botCount: 3, mode: 'full', speechPolicy: 'v1' });
    await created;
    const t0 = Date.now();
    await waitUntil(() => seen.length >= 8, 150000);
    const done = seen.filter((s) => s.end !== null);
    const clipped = done.filter((s) => s.hasClip);
    const unclipped = done.filter((s) => !s.hasClip);
    const drift = clipped.map((s) => (s.end as number) - s.start - s.total);
    const worst = drift.length ? Math.max(...drift.map(Math.abs)) : 0;
    say(`  ${done.length} completed beats in ${Math.round((Date.now() - t0) / 1000)}s: ${clipped.length} clip-backed, ${unclipped.length} unclipped`);
    check(
      'E: every clip-backed v1 beat ended on its own audio, nothing added',
      clipped.length > 0 && worst < 400,
      `${clipped.length} beats, worst |measured − clip| = ${worst}ms`,
    );
    check(
      'E: no clip-backed beat was ever held',
      logsSince(t0, 'has no clip - holding').length === unclipped.filter((s) => (s.end as number) - s.start > 100).length ||
        clipped.every((s) => (s.end as number) - s.start - s.total < 400),
      `${logsSince(t0, 'has no clip - holding').length} hold log(s) for ${unclipped.length} unclipped beat(s)`,
    );
    host.disconnect();
  }

  // =====================================================================
  // A - LIVE: a real browser TV, v2, bots.
  // =====================================================================
  if (run('A')) {
    say('\n=== A (live v2 bot show, real browser TV) ===');
    clientProc = spawn('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], {
      cwd: CLIENT_DIR,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, VITE_SERVER_URL: ORIGIN },
    });
    await waitForClient();
    browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    const page: Page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    // Task 310 - every v2 slot line has a clip since Task 306, so the field
    // report's premise (a slot beat with no mp3) is recreated by HIDING them:
    // server-side via AEGEAN_DEV_HIDE_CLIPS (the hold is armed off the server's
    // own clip lookup) and browser-side by 404ing the same hashes, so the TV
    // takes Task 154's instant-ack path exactly as it did then. The v1
    // reservoirs a slot can also draw from (STUCK_IN_LAST, RUNAWAY_LEAD) are
    // hidden too. Nothing in the bank is touched; GAME_INTRO clips stay real,
    // which is what the scenario's clip-backed comparison beat needs.
    const hideHashes = new Set(
      entries
        .filter((e) => e.moment.startsWith('SLOT (') || e.moment === 'STUCK_IN_LAST' || e.moment === 'RUNAWAY_LEAD')
        .map((e) => e.hash),
    );
    process.env.AEGEAN_DEV_HIDE_CLIPS = [...hideHashes].join(',');
    await page.route('**/voice/*.mp3', (route) => {
      const hash = /\/voice\/([0-9a-f]+)\.mp3/.exec(route.request().url())?.[1] ?? '';
      return hideHashes.has(hash) ? route.fulfill({ status: 404, body: 'hidden by 303 harness' }) : route.continue();
    });
    say(`  hiding ${hideHashes.size} slot/reservoir clips from server + browser for this show`);
    // ?bot=4 bypasses Task 259's gate; ?policy=v2 is Task 302's param.
    await page.goto(`${CLIENT_ORIGIN}/host?bot=4&mode=full&policy=v2&clock=off`);
    // ?bot=N bypasses Task 259's GATE, but nothing presses the create-room button for
    // us - the room is created by that click and by nothing else, which is why
    // the first attempt at this scenario sat for 430s with "client connected"
    // as its last server log and zero beats. The mute toggle is the lobby's
    // only other button, so it is excluded by name rather than by position.
    await page
      .locator('[data-testid="lobby-root"] button:not([data-testid="mute-toggle"])')
      .first()
      .click({ timeout: 20000 });
    const t0 = Date.now();

    // Sample the subtitle every 100ms and group contiguous runs of one text.
    interface Run {
      text: string;
      first: number;
      last: number;
    }
    const runs: Run[] = [];
    const sampler = setInterval(() => {
      void page
        .$eval('[data-testid="socrates-subtitle"]', (el) => (el as HTMLElement).innerText.trim())
        .then((text) => {
          const now = Date.now();
          const prev = runs[runs.length - 1];
          if (prev && prev.text === text && now - prev.last < 900) prev.last = now;
          else runs.push({ text, first: now, last: now });
        })
        .catch(() => {
          /* no subtitle on screen right now */
        });
    }, 100);

    // The show is ~4 minutes of real time before the second slot beat, so it
    // says where it has got to - a run that ends up killed still leaves a
    // diagnosis behind, which the first attempt at this scenario did not.
    const progress = setInterval(() => {
      const last = serverLog[serverLog.length - 1]?.text.slice(0, 100) ?? '(nothing logged)';
      realLog(
        `  …${Math.round((Date.now() - t0) / 1000)}s  beats=${logsSince(t0, 'Socrates (').length} ` +
          `slot=${logsSince(t0, 'Socrates (SPEECH_SLOT)').length} held=${logsSince(t0, 'has no clip - holding').length} ` +
          `runs=${runs.length} | ${last}`,
      );
    }, 15000);

    const isSlot = (): number => logsSince(t0, 'Socrates (SPEECH_SLOT)').length;
    const waited = await waitUntil(() => isSlot() >= 2, 430000, 1000);
    clearInterval(progress);
    // Keep SAMPLING well past the moment the second slot beat is detected. The
    // detector polls once a second, so it fires within ~1s of that beat
    // STARTING, and stopping the sampler there measured 393ms of a 6909ms hold
    // - reporting the product broken while the server's own log said it had
    // held correctly. Sample out the longest hold any beat can have, plus a
    // margin, so the last run on screen is a COMPLETE one.
    await delay(SOCRATES_HOLD_MAX_MS + 1500);
    clearInterval(sampler);
    await delay(200);

    const slotLogs = logsSince(t0, 'Socrates (SPEECH_SLOT)');
    const holdLogs = logsSince(t0, 'has no clip - holding');
    say(`  ${Math.round((Date.now() - t0) / 1000)}s in: ${slotLogs.length} slot beat(s), ${holdLogs.length} held beat(s), ${runs.length} subtitle run(s)`);
    check('A: v2 slot beats fired in a live show', waited !== null && slotLogs.length >= 2, `${slotLogs.length} SPEECH_SLOT beats`);

    // Each slot beat's line, taken from the server's own log, matched to the
    // subtitle run that carried it.
    for (const [i, log] of slotLogs.slice(0, 2).entries()) {
      const line = log.text.split('— "').pop()?.replace(/"$/, '') ?? '';
      const label = i === 0 ? 'QUIZ_MID' : 'QUIZ_CLOSE';
      const expected = socratesHoldMs(line);
      const runFor = runs.find((r) => r.text && line.startsWith(r.text.slice(0, 20)));
      const shownMs = runFor ? runFor.last - runFor.first + 100 : 0;
      const held = holdLogs.find((h) => h.ts >= log.ts && h.ts < log.ts + 3000);
      say(`  ${label}: ${line.length} chars -> hold ${expected}ms; subtitle on screen ~${shownMs}ms`);
      check(
        `A: ${label} held for its computed duration, not ~50ms`,
        held !== undefined && runFor !== undefined && shownMs >= expected - 700,
        `"${line.slice(0, 40)}…" ${line.length} chars, hold ${expected}ms, subtitle ${shownMs}ms, server "${held?.text.split(' - ').pop() ?? 'NO HOLD LOG'}"`,
      );
      check(
        `A: ${label}'s hold stayed under the backstop`,
        expected <= SOCRATES_HOLD_MAX_MS && expected < SOCRATES_BACKSTOP_UNKNOWN_MS,
        `${expected}ms hold vs ${SOCRATES_BACKSTOP_UNKNOWN_MS}ms backstop (margin ${SOCRATES_BACKSTOP_UNKNOWN_MS - expected}ms)`,
      );
    }

    // A clip-backed beat in the SAME run must be untouched.
    const introLogs = logsSince(t0, 'Socrates (GAME_INTRO)');
    const introHeld = introLogs.filter((l) => holdLogs.some((h) => h.ts >= l.ts && h.ts < l.ts + 3000));
    check(
      'A: clip-backed GAME_INTRO beats in the same run were never held',
      introLogs.length > 0 && introHeld.length === 0,
      `${introLogs.length} GAME_INTRO beat(s), ${introHeld.length} held`,
    );
    await page.close();
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
