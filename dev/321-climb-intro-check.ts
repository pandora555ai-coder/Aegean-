// Task 321 - the Η Ανάβασις intro subtitles, fast. The end-state harness
// (dev/end-state-timer-subtitles-check.ts) plays two whole shows (~20 min) to
// see three narration lines; this reaches the same three lines in well under
// a minute through an EXISTING path, the one dev/climb-ceremony-check.ts and
// dev/finale-staging-check.ts already use: an in-process real server, the
// room created by a real TV page, two socket-level players, then
// `startClimb(room)` called directly with `room.gameIntroPlayed = true` seeded
// first (Task 237 - without it the ten-line GAME_INTRO plays at the climb's
// own card). No new server hook.
//
// What it proves, all read off the TV's own DOM by dev/subtitle-observer.ts's
// MutationObserver (no sampling, no skip presses - the lines play out on real
// audio and the TV's own ack):
//   - the climb announces with exactly ANAVASIS_INTRO_SEQUENCE, in order;
//   - each of the three lines is rendered as the subtitle, verbatim, while its
//     beat is current, and no subtitle text ever differs from a payload line;
//   - the world is the temple (Task 244) for every subtitle render;
//   - the stage card is within 1280x720 and does not overlap the subtitle;
//   - CLIMB_QUESTION follows, and the whole thing stays under 5 minutes.
//
//   npx tsx dev/321-climb-intro-check.ts
process.env.PORT = '3922';

import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser } from 'playwright';
import { io as ioClient, type Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents } from '@game/shared';
import {
  boxInViewport,
  boxesOverlap,
  matchRenders,
  installSubtitleObserver,
  parseFrame,
  readSubtitleLog,
} from './subtitle-observer.js';

const SERVER_PORT = 3922;
const CLIENT_PORT = 5923;
const ROOT = new URL('..', import.meta.url).pathname;
const CLIENT_DIR = `${ROOT}client`;
const NAMES = ['Άρης', 'Νίκη'];
const AVATARS = ['minotaur', 'sphinx'];
const BUDGET_MS = 5 * 60_000;

let clientProc: ChildProcess | null = null;
let browser: Browser | null = null;
const sockets: Socket[] = [];
let passed = 0;
let failed = 0;

function check(label: string, cond: boolean, detail = ''): void {
  if (cond) passed++;
  else failed++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

function killGroup(child: ChildProcess | null): void {
  if (!child || child.pid === undefined || child.killed) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // already gone
  }
}

async function waitForClient(): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`http://localhost:${CLIENT_PORT}/`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await delay(500);
  }
  throw new Error('client dev server did not come up in time');
}

function joinSim(name: string, avatarId: string, code: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket: Socket = ioClient(`http://localhost:${SERVER_PORT}`, { reconnection: false });
    sockets.push(socket);
    socket.on('connect', () => socket.emit(ClientEvents.PLAYER_JOIN, { code, name, playerId: randomUUID(), avatarId }));
    socket.once(ServerEvents.PLAYER_JOINED, () => resolve(socket));
    socket.once(ServerEvents.JOIN_REJECTED, (p: unknown) => reject(new Error(`sim join rejected: ${JSON.stringify(p)}`)));
    socket.once('connect_error', reject);
  });
}

interface Beat {
  t: number;
  beatId: number;
  kind: string;
  line: string;
  template: string;
}

async function main(): Promise<void> {
  const scriptStart = Date.now();
  await import('../server/src/index.js');
  const { getRoom } = await import('../server/src/state.js');
  const { startClimb } = await import('../server/src/phases.js');
  const { ANAVASIS_INTRO_SEQUENCE } = await import('../server/src/socrates.js');

  clientProc = spawn('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], {
    cwd: CLIENT_DIR,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, VITE_SERVER_URL: `http://localhost:${SERVER_PORT}` },
  });
  await waitForClient();
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const tv = await ctx.newPage();
  await installSubtitleObserver(tv);
  const beats: Beat[] = [];
  const phases: Array<{ t: number; phase: string }> = [];
  tv.on('websocket', (ws) => {
    ws.on('framereceived', (frame) => {
      if (typeof frame.payload !== 'string') return;
      const parsed = parseFrame(frame.payload);
      if (!parsed) return;
      if (parsed.event === 'socrates:show') {
        beats.push({
          t: Date.now(),
          beatId: Number(parsed.data.beatId ?? -1),
          kind: String(parsed.data.kind ?? '?'),
          line: String(parsed.data.line ?? ''),
          template: String(parsed.data.lineTemplate ?? ''),
        });
      } else if (parsed.event === 'phase:changed') {
        phases.push({ t: Date.now(), phase: String(parsed.data.phase ?? '?') });
      }
    });
  });

  await tv.goto(`http://localhost:${CLIENT_PORT}/host?mode=full&clock=off`);
  await tv.getByTestId('audio-gate').click();
  await tv.getByTestId('create-room').click();
  const codeLocator = tv.getByTestId('room-code');
  await codeLocator.waitFor({ timeout: 15000 });
  const code = ((await codeLocator.textContent()) ?? '').replace(/\s+/g, '');
  for (let i = 0; i < NAMES.length; i++) await joinSim(NAMES[i], AVATARS[i], code);
  await delay(400);
  console.log(`room ${code}: TV + ${NAMES.length} socket players, entering the climb directly`);

  const room = getRoom(code) as unknown as { phase: string; gameIntroPlayed: boolean };
  room.gameIntroPlayed = true; // Task 237 - see the header
  const climbStart = Date.now();
  const started = startClimb(room as never);
  check('setup: startClimb accepted the room', started === true);

  while (room.phase !== 'CLIMB_QUESTION' && Date.now() - climbStart < 120_000) await delay(100);
  const reachedMs = Date.now() - climbStart;
  check('CLIMB_QUESTION follows the intro', room.phase === 'CLIMB_QUESTION', `after ${reachedMs}ms (phase ${room.phase})`);
  await delay(800); // let the last settle-measurement (600ms) land
  const log = await readSubtitleLog(tv);

  console.log('\n--- timeline (ms from startClimb) ---');
  for (const p of phases.filter((x) => x.t >= climbStart)) console.log(`  ${p.t - climbStart}\tphase ${p.phase}`);
  for (const b of beats) console.log(`  ${b.t - climbStart}\tsocrates:show beat ${b.beatId} kind=${b.kind} "${b.line.slice(0, 50)}…"`);
  for (const e of log) {
    if (e.t < climbStart) continue;
    console.log(`  ${e.t - climbStart}\tDOM subtitle=${e.text === null ? 'none' : `"${e.text.slice(0, 50)}…"`} card=${e.cardBox ? 'yes' : 'no'} temple=${e.temple}`);
  }

  console.log('\n--- checks ---');
  const introBeats = beats.filter((b) => b.kind === 'STAGE_INTRO');
  check('exactly 3 STAGE_INTRO beats, and no other beat', introBeats.length === 3 && beats.length === 3, `${introBeats.length} intro / ${beats.length} total`);
  check(
    'their templates are ANAVASIS_INTRO_SEQUENCE, in order',
    introBeats.map((b) => b.template).join('\n') === ANAVASIS_INTRO_SEQUENCE.join('\n'),
  );
  const matched = matchRenders(log, beats.map((b) => b.line));
  introBeats.forEach((b, i) => {
    const render = matched[beats.indexOf(b)];
    check(
      `Ανάβασις#${20 + i} rendered verbatim as the subtitle, in beat order`,
      render !== null,
      render ? `rendered ${render.t - b.t}ms after its frame` : 'never rendered',
    );
    if (render) {
      const sub = render.settledSubBox ?? render.subBox;
      const card = render.settledCardBox ?? render.cardBox;
      check(`Ανάβασις#${20 + i}: world is the temple`, render.temple);
      check(
        `Ανάβασις#${20 + i}: card inside 1280x720, no overlap with the subtitle`,
        card !== null && sub !== null && boxInViewport(card) && !boxesOverlap(card, sub),
        `card=${JSON.stringify(card)} sub=${JSON.stringify(sub)}`,
      );
    }
  });
  const shown = log.filter((e) => e.text !== null);
  const payloadLines = new Set(beats.map((b) => b.line));
  const strays = shown.filter((e) => !payloadLines.has(e.text!));
  check('every subtitle text the TV ever rendered is a payload line', strays.length === 0, `${strays.length} of ${shown.length} renders unmatched`);
  const total = Date.now() - scriptStart;
  check('whole check under 5 minutes', total < BUDGET_MS, `${(total / 1000).toFixed(1)}s end to end`);

  console.log(`\n${passed} passed, ${failed} failed`);
}

async function cleanup(): Promise<void> {
  for (const s of sockets) s.disconnect();
  if (browser) await browser.close().catch(() => {});
  killGroup(clientProc);
}

main().then(
  async () => {
    await cleanup();
    process.exit(failed > 0 ? 1 : 0);
  },
  async (err) => {
    console.error(err);
    await cleanup();
    process.exit(1);
  },
);
