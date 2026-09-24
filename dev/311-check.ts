// Task 311 - v2 is the default speech policy; the skip vote counts humans only.
//
//   A  default: a plain /host?bot=4&mode=full (NO policy param) is v2 - the real
//      browser TV plays stage 1 through to the stage-2 card; [slot] lines in the
//      server log, ZERO `[socrates] fired` (the retired v1 per-reveal picker),
//      and the stage-1 question count read off the live Room.
//   B  ?policy=v1 still selects v1: `[socrates] fired moment=` per-reveal lines,
//      no [slot] lines. Run as a separate process (SCENARIO=B, its own ports) so
//      the two shows' logs never interleave.
//   C  skip vote, REAL AUDIO: bot=4 room + ONE human phone (a socket) and a real
//      browser TV. The human votes mid-GAME_INTRO -> passes 1/1, the live clip is
//      stopped (AudioBufferSourceNode.stop observed in the page), SKIP_INTERRUPTED
//      plays on real audio and ends on the TV's socrates:audio_ended (server log
//      "ended (socrates:audio_ended)", not the backstop), and the game continues.
//   D  two humans + bots: threshold is 2 (bots not counted); one vote does not
//      pass, the second does. Socket host.
//   E  all-bot room: the vote's progress is never `open` - no button on any phone.
//
//   npx tsx dev/311-check.ts                 A, C, D, E     (B separately)
//   SCENARIO=B SERVER_PORT=3931 CLIENT_PORT=5932 npx tsx dev/311-check.ts
process.env.PORT = process.env.SERVER_PORT ?? '3930';

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { io, type Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents, SOCRATES_BACKSTOP_MARGIN_MS } from '@game/shared';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_DIR = path.join(ROOT, 'client');
const SERVER_PORT = Number(process.env.SERVER_PORT ?? 3930);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5931);
const ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const CLIENT_ORIGIN = `http://127.0.0.1:${CLIENT_PORT}`;
const SCENARIO = (process.env.SCENARIO ?? '').toUpperCase();
const run = (s: string): boolean => (SCENARIO === '' ? s !== 'B' : SCENARIO.includes(s));

let clientProc: ChildProcess | null = null;
let browser: Browser | null = null;
const sockets: Socket[] = [];

// Server log tee. `onLine` lets a scenario react SYNCHRONOUSLY to a server log
// line - used to join the human the instant a room is created, before the
// room's bots (spawned after `created by`) can self-start an all-bot room.
interface LogLine {
  ts: number;
  text: string;
}
const serverLog: LogLine[] = [];
const realLog = console.log.bind(console);
let onLine: ((text: string) => void) | null = null;
console.log = (...args: unknown[]): void => {
  const text = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  serverLog.push({ ts: Date.now(), text });
  onLine?.(text);
};
const say = (text: string): void => realLog(text);
const logsMatching = (re: RegExp, since = 0): LogLine[] => serverLog.filter((l) => l.ts >= since && re.test(l.text));

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

async function startClient(): Promise<void> {
  if (clientProc) return;
  clientProc = spawn('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], {
    cwd: CLIENT_DIR,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, VITE_SERVER_URL: ORIGIN },
  });
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${CLIENT_ORIGIN}/`)).ok) return;
    } catch {
      /* not up yet */
    }
    await delay(500);
  }
  throw new Error('client dev server did not come up in time');
}

async function until(pred: () => boolean, label: string, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (!pred()) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await delay(50);
  }
}

// ---------------------------------------------------------------------------
// Humans. A human is a socket; it is pre-connected, and joined from inside the
// log hook the instant `room XXXX created by` prints, so it is in the roster
// before the bots' own sockets have even finished connecting.
// ---------------------------------------------------------------------------
const NAMES = ['Άρης', 'Νίκη', 'Χαρά'];
// Humans take the FRONT of the available catalogue; bots claim from the END
// (bots.ts), so the two never collide (a collision silently rejects the bot).
let AVATARS: string[] = [];

interface Human {
  name: string;
  socket: Socket;
  playerId: string;
  joined: boolean;
  progress: { votes: number; needed: number; connected: number; open: boolean }[];
  beatId: number | null;
}

function makeHuman(i: number): Promise<Human> {
  const socket = io(ORIGIN, { transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  const h: Human = { name: NAMES[i], socket, playerId: randomUUID(), joined: false, progress: [], beatId: null };
  socket.on(ServerEvents.PLAYER_JOINED, () => (h.joined = true));
  socket.on(ServerEvents.SOCRATES_BEAT, (p: { beatId: number }) => (h.beatId = Number(p.beatId)));
  socket.on(ServerEvents.SKIP_VOTE_PROGRESS, (p: Record<string, unknown>) =>
    h.progress.push({
      votes: Number(p.votes),
      needed: Number(p.needed),
      connected: Number(p.connected),
      open: Boolean(p.open),
    }),
  );
  return new Promise((resolve) => socket.on('connect', () => resolve(h)));
}

function joinOnRoomCreated(humans: Human[]): void {
  onLine = (text) => {
    const m = /room (\d{4}) created by/.exec(text);
    if (!m) return;
    onLine = null;
    humans.forEach((h, i) =>
      h.socket.emit(ClientEvents.PLAYER_JOIN, { code: m[1], name: h.name, playerId: h.playerId, avatarId: AVATARS[i] }),
    );
  };
}

// A socket-level TV that acks after the clip's own estimated length (300's host).
function connectHost(create: Record<string, unknown>) {
  const feed = { beats: [] as { beatId: number; kind: string }[], progress: [] as { open: boolean; needed: number }[] };
  const suppressed = new Set<number>();
  const socket = io(ORIGIN, { transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  return new Promise<{ socket: Socket; code: string; feed: typeof feed }>((resolve) => {
    socket.on('connect', () => socket.emit(ClientEvents.CREATE_ROOM, create));
    socket.on(ServerEvents.SOCRATES_STOP, (p: { beatId: number }) => suppressed.add(p.beatId));
    socket.on(ServerEvents.SKIP_VOTE_PROGRESS, (p: { open: boolean; needed: number }) =>
      feed.progress.push({ open: Boolean(p.open), needed: Number(p.needed) }),
    );
    socket.on(ServerEvents.SOCRATES_SHOW, (p: Record<string, unknown>) => {
      const beatId = Number(p.beatId);
      feed.beats.push({ beatId, kind: String(p.kind) });
      const clipMs = Math.max(400, Number(p.totalDurationMs) - SOCRATES_BACKSTOP_MARGIN_MS);
      setTimeout(() => {
        if (!suppressed.has(beatId)) socket.emit(ClientEvents.SOCRATES_AUDIO_ENDED, { beatId });
      }, clipMs);
    });
    socket.once(ServerEvents.ROOM_CREATED, (p: { code: string }) => resolve({ socket, code: p.code, feed }));
  });
}

async function main(): Promise<void> {
  await import('../server/src/index.js'); // the REAL server, in-process
  const { getRoom } = await import('../server/src/state.js');
  const { DEFAULT_ROOM_SETTINGS, AVATAR_CATALOGUE } = await import('@game/shared');
  const { AVAILABLE_AVATAR_IDS } = await import('../server/src/avatars.js');
  AVATARS = AVATAR_CATALOGUE.filter((a) => AVAILABLE_AVATAR_IDS.has(a.id)).map((a) => a.id);
  await delay(800);

  // -------------------------------------------------------------------------
  // A / B - which policy does a plain /host?bot=4&mode=full run?
  // -------------------------------------------------------------------------
  for (const scenario of ['A', 'B']) {
    if (!run(scenario)) continue;
    const v1 = scenario === 'B';
    say(`\n=== ${scenario}. /host?bot=4&mode=full${v1 ? '&policy=v1' : ' (no policy param)'} - real browser TV ===`);
    say(`  DEFAULT_ROOM_SETTINGS.speechPolicy = ${DEFAULT_ROOM_SETTINGS.speechPolicy}`);
    await startClient();
    browser ??= await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    const page: Page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const t0 = Date.now();
    let code = '';
    onLine = (text) => {
      const m = /room (\d{4}) created by/.exec(text);
      if (m) code = m[1];
    };
    await page.goto(`${CLIENT_ORIGIN}/host?bot=4&mode=full&clock=off${v1 ? '&policy=v1' : ''}`);
    await page
      .locator('[data-testid="lobby-root"] button:not([data-testid="mute-toggle"])')
      .first()
      .click({ timeout: 20000 });
    await until(() => code !== '', 'room code', 20000);
    const room = getRoom(code)!;
    check(`${scenario}: live room's speechPolicy`, room.settings.speechPolicy === (v1 ? 'v1' : 'v2'), `room.settings.speechPolicy=${room.settings.speechPolicy}`);
    check(
      `${scenario}: create-log`,
      logsMatching(/created with speechPolicy=/, t0).length === (v1 ? 1 : 0),
      `"created with speechPolicy=" lines: ${logsMatching(/created with speechPolicy=/, t0).map((l) => l.text).join(' | ') || 'none (param absent -> server default)'}`,
    );

    // Stage-1 question count: the highest question index seen while room.stage === 1.
    let stage1Max = 0;
    let sawStage2 = false;
    const sampler = setInterval(() => {
      if (room.stage === 1) stage1Max = Math.max(stage1Max, room.currentQuestionIndex + 1);
      if (room.stage >= 2) sawStage2 = true;
    }, 100);
    // v2: play stage 1 to the stage-2 card. v1: same, or the first per-reveal beat.
    await until(() => sawStage2, 'stage 2', 600000);
    clearInterval(sampler);
    const slots = logsMatching(/\[slot\] room \d+ stage 1 \S+ FIRED/, t0);
    const slotAny = logsMatching(/\[slot\] room/, t0);
    const moments = logsMatching(/\[socrates\] fired moment=\S+ stage=1 /, t0);
    say(`  stage-1 questions played: ${stage1Max}`);
    slots.forEach((l) => say(`    ${l.text}`));
    moments.slice(0, 6).forEach((l) => say(`    ${l.text}`));
    if (v1) {
      check('B: per-reveal beats in stage 1 (v1)', moments.length > 0 && slotAny.length === 0, `${moments.length} "[socrates] fired" lines, ${slotAny.length} [slot] lines`);
    } else {
      check('A: slot beats in stage 1 (v2)', slots.length > 0, `${slots.length} "[slot] ... FIRED" lines in stage 1 (${slotAny.length} [slot] lines total)`);
      check('A: no per-reveal v1 beats in stage 1', moments.length === 0, `${moments.length} "[socrates] fired ... stage=1" lines`);
      check('A: stage 1 is the long row (10 questions)', stage1Max === 10, `${stage1Max} questions`);
    }
    await page.close();
  }

  // -------------------------------------------------------------------------
  // C - bot=4 + ONE human, real browser TV, real audio.
  // -------------------------------------------------------------------------
  if (run('C')) {
    say('\n=== C. bot=4 room + 1 human phone, real browser TV: the human alone passes the vote ===');
    await startClient();
    browser ??= await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.addInitScript(`
      window.__stops = 0; window.__starts = 0;
      const S = AudioBufferSourceNode.prototype.stop, T = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.stop = function (...a) { window.__stops++; return S.apply(this, a); };
      AudioBufferSourceNode.prototype.start = function (...a) { window.__starts++; return T.apply(this, a); };
    `);
    const human = await makeHuman(0);
    joinOnRoomCreated([human]);
    const t0 = Date.now();
    await page.goto(`${CLIENT_ORIGIN}/host?bot=4&mode=full&clock=off`);
    await page
      .locator('[data-testid="lobby-root"] button:not([data-testid="mute-toggle"])')
      .first()
      .click({ timeout: 20000 });
    await until(() => human.joined, 'human joined', 20000);
    await delay(1500);
    const autoStarted = logsMatching(/auto-starting/, t0).length > 0;
    check('C: human is in the roster, room did not self-start', !autoStarted, `auto-starting logs: ${logsMatching(/auto-starting/, t0).length}`);
    human.socket.emit(ClientEvents.VIP_START_GAME, {});
    await until(() => logsMatching(/skip vote OPEN/, t0).length > 0, 'skip vote open', 30000);
    say(`  ${logsMatching(/skip vote OPEN/, t0)[0].text}`);
    await until(() => human.beatId !== null && (human.progress.at(-1)?.open ?? false), 'open progress on the phone', 20000);
    await delay(2500); // let the first line be genuinely mid-play
    const before = await page.evaluate<{ stops: number; starts: number }>('({stops: window.__stops, starts: window.__starts})');
    const open = human.progress.at(-1)!;
    check('C: phone sees the button open at 0/1', open.open && open.votes === 0 && open.needed === 1, `${open.votes}/${open.needed} connected(humans)=${open.connected}`);
    const voteAt = Date.now();
    human.socket.emit(ClientEvents.SKIP_VOTE, { beatId: human.beatId });
    await until(() => logsMatching(/skip vote PASSED/, voteAt).length > 0, 'vote passed', 10000);
    const passedLine = logsMatching(/skip vote PASSED/, voteAt)[0].text;
    say(`  ${passedLine}`);
    check('C: passes on a single human vote', /\(1\/1\)/.test(passedLine), passedLine.split('room ')[1] ?? passedLine);
    // SKIP_INTERRUPTED beat -> ended by the TV's REAL audio ack, not the backstop.
    await until(() => logsMatching(/ended \(socrates:audio_ended\)/, voteAt).length > 0, 'audio ack of the interruption beat', 30000);
    const ack = logsMatching(/ended \(socrates:audio_ended\)/, voteAt)[0];
    const after = await page.evaluate<{ stops: number; starts: number }>('({stops: window.__stops, starts: window.__starts})');
    check('C: live clip cut', after.stops > before.stops, `AudioBufferSourceNode.stop calls ${before.stops} -> ${after.stops}`);
    check('C: SKIP_INTERRUPTED played real audio', after.starts > before.starts, `clips started ${before.starts} -> ${after.starts}`);
    check('C: interruption beat ended on the audio ack', true, `${ack.text.split(' ').slice(2).join(' ')} at +${ack.ts - voteAt}ms after the vote`);
    const backstops = logsMatching(/backstop fired|backstop expired/i, voteAt);
    check('C: no backstop fired for it', backstops.length === 0, `${backstops.length} backstop log lines`);
    const room = getRoom(logsMatching(/room (\d{4}) created by/, t0)[0].text.match(/room (\d{4})/)![1])!;
    await until(() => room.stage >= 1 && room.phase !== 'SOCRATES', 'game continues past the intro', 60000);
    check('C: game continues', true, `phase=${room.phase} stage=${room.stage} after the interruption`);
    await page.close();
  }

  // -------------------------------------------------------------------------
  // D - 2 humans + bots (socket host).
  // -------------------------------------------------------------------------
  if (run('D')) {
    say('\n=== D. bot=3 + 2 humans: threshold 2, one vote is not enough ===');
    const humans = [await makeHuman(0), await makeHuman(1)];
    joinOnRoomCreated(humans);
    const t0 = Date.now();
    const host = await connectHost({ mode: 'full', botCount: 3 });
    await until(() => humans.every((h) => h.joined), 'both humans joined', 10000);
    await delay(1000);
    check('D: no self-start', logsMatching(/auto-starting/, t0).length === 0, `${logsMatching(/auto-starting/, t0).length} auto-start logs`);
    humans[0].socket.emit(ClientEvents.VIP_START_GAME, {});
    await until(() => humans[0].progress.some((p) => p.open) && humans[0].beatId !== null, 'vote open', 30000);
    await delay(1500);
    const opened = humans[0].progress.find((p) => p.open)!;
    check('D: needs 2 with 5 players connected (2 humans + 3 bots joined)', opened.needed === 2 && opened.connected === 2, `needed=${opened.needed} humans=${opened.connected}`);
    humans[0].socket.emit(ClientEvents.SKIP_VOTE, { beatId: humans[0].beatId });
    await delay(1000);
    const one = humans[1].progress.at(-1)!;
    check('D: 1 vote does not pass', one.votes === 1 && one.open && logsMatching(/skip vote PASSED/, t0).length === 0, `${one.votes}/${one.needed}, PASSED logs ${logsMatching(/skip vote PASSED/, t0).length}`);
    humans[1].socket.emit(ClientEvents.SKIP_VOTE, { beatId: humans[1].beatId });
    await until(() => logsMatching(/skip vote PASSED/, t0).length > 0, 'vote passed at 2', 10000);
    check('D: second human vote passes it', true, logsMatching(/skip vote PASSED/, t0)[0].text.split('room ')[1]);
    host.socket.disconnect();
  }

  // -------------------------------------------------------------------------
  // E - all-bot room: no vote can be opened.
  // -------------------------------------------------------------------------
  if (run('E')) {
    say('\n=== E. all-bot room: the skip vote is never open ===');
    const t0 = Date.now();
    const host = await connectHost({ mode: 'full', botCount: 4 });
    await until(() => host.feed.beats.length >= 3, 'three GAME_INTRO beats', 60000);
    const opens = host.feed.progress.filter((p) => p.open);
    check('E: auto-started all-bot room', logsMatching(/auto-starting/, t0).length === 1, `${logsMatching(/auto-starting/, t0).length} auto-start log`);
    check('E: no progress event ever open', host.feed.progress.length > 0 && opens.length === 0, `${host.feed.progress.length} progress events, ${opens.length} open`);
    check('E: nothing to vote', host.feed.progress.every((p) => p.needed === 1), `needed values seen: ${[...new Set(host.feed.progress.map((p) => p.needed))].join(',')} (floor(0/2)+1)`);
    host.socket.disconnect();
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
