// Task 259 - the TV tap-to-start gate: an audio-unlock/dead-zone gate on
// /host that must be tapped before "Create Room" is even reachable.
//
// Root cause under test: getAudioCtx() (client/src/hooks/useGameAudio.ts) was
// only ever first called from ROOM_CREATED's startKeepAliveAudio - a SOCKET
// ACK, a round trip after whatever click triggered CREATE_ROOM, well outside
// that click's own user-activation window. A freshly constructed context
// therefore stays 'suspended' with nothing to ever resume it, so the whole
// ~80s cold open (GAME_INTRO_SEQUENCE) plays out SILENTLY and the backstop
// (not real audio) advances every beat - it looks designed, not broken.
// unlockAudioGate() now runs synchronously inside the gate's own onClick, so
// construction AND resume happen inside one trusted gesture.
//
// Criteria, each reported with its own numbers:
//   1 (SCENARIO=A, default): before tap - gate node count, Create Room
//     reachability; after tap - gate node count, AudioContext.state, and the
//     first GAME_INTRO clip's played duration vs its own decoded file
//     duration (a Web Audio probe patched into the page BEFORE navigation -
//     see installAudioProbe below).
//   2 (SCENARIO=B): `?bot=5&mode=full` bypass to GAME_OVER with no human
//     tap - stage count, total duration, gate node count sampled throughout.
//
// Criterion 3 (climb-entry-check.ts / podium-subtitle-followup-check.ts) and
// criterion 4 (dev/intro-lines-check.ts, untouched by this task - it never
// loads /host at all) are run separately; see tasks/259-tap-to-start.md.
//
//   npx tsx dev/259-tap-to-start-check.ts             # criterion 1
//   SCENARIO=B npx tsx dev/259-tap-to-start-check.ts  # criterion 2
process.env.PORT = process.env.SERVER_PORT ?? '3924';

import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { io as ioClient, type Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents } from '@game/shared';

const SERVER_PORT = Number(process.env.SERVER_PORT) || 3924;
const CLIENT_PORT = Number(process.env.CLIENT_PORT) || 5925;
const ROOT = new URL('..', import.meta.url).pathname;
const CLIENT_DIR = `${ROOT}client`;
const SCENARIO = (process.env.SCENARIO ?? 'A').toUpperCase();

let clientProc: ChildProcess | null = null;
let passed = 0;
let failed = 0;

function check(label: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  ok   ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
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
  for (let attempt = 0; attempt < 120; attempt++) {
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

interface Sim {
  name: string;
  playerId: string;
  socket: Socket;
}

function joinSim(name: string, avatarId: string, code: string): Promise<Sim> {
  const playerId = randomUUID();
  return new Promise((resolve, reject) => {
    const socket: Socket = ioClient(`http://localhost:${SERVER_PORT}`, { reconnection: false });
    socket.on('connect', () => socket.emit(ClientEvents.PLAYER_JOIN, { code, name, playerId, avatarId }));
    socket.once(ServerEvents.PLAYER_JOINED, () => resolve({ name, playerId, socket }));
    socket.once(ServerEvents.JOIN_REJECTED, (p: unknown) => reject(new Error(`sim join rejected: ${JSON.stringify(p)}`)));
    socket.once('connect_error', reject);
  });
}

// Patches AudioContext BEFORE any app script runs, so every BufferSource the
// app schedules (crowd loops AND Socrates lines) is recorded: when it was
// started, its decoded buffer's real duration, whether it loops (crowd beds
// loop forever and never fire 'ended' - excluded from the "first line" pick
// below), and when it actually ended. This is an OUTSIDE-THE-APP probe (a
// test harness concern only) - nothing in client/src changes for it.
//
// Passed as a raw string, not a TS closure: tsx/esbuild rewrites a named
// `function Patched(...)` declaration into `function Patched(...){}
// __name(Patched, "Patched")` (its keep-names support), and addInitScript
// ships the closure to the browser via Function.prototype.toString() -
// which carries that bare `__name(...)` call across with no helper defined
// on the page, throwing "__name is not defined" the instant the script
// runs and silently killing the whole probe before it patches anything.
const AUDIO_PROBE_SCRIPT = `
(function() {
  window.__audioProbe = { sources: [] };
  var OrigCtx = window.AudioContext || window.webkitAudioContext;
  function Patched() {
    var ctx = new (Function.prototype.bind.apply(OrigCtx, [null].concat(Array.prototype.slice.call(arguments))))();
    window.__audioProbe.ctx = ctx;
    return ctx;
  }
  Patched.prototype = OrigCtx.prototype;
  window.AudioContext = Patched;
  var origCreateBufferSource = OrigCtx.prototype.createBufferSource;
  OrigCtx.prototype.createBufferSource = function () {
    var src = origCreateBufferSource.apply(this, arguments);
    var origStart = src.start.bind(src);
    src.start = function () {
      var rec = {
        startedAtMs: performance.now(),
        fileDurationMs: src.buffer ? src.buffer.duration * 1000 : null,
        loop: src.loop,
        endedAtMs: null,
      };
      src.addEventListener('ended', function () {
        rec.endedAtMs = performance.now();
      });
      window.__audioProbe.sources.push(rec);
      return origStart.apply(src, arguments);
    };
    return src;
  };
})();
`;

async function installAudioProbe(page: Page): Promise<void> {
  await page.addInitScript({ content: AUDIO_PROBE_SCRIPT });
}

async function runScenarioA(page: Page): Promise<void> {
  console.log('=== SCENARIO A - manual tap flow, no ?bot ===');
  await installAudioProbe(page);
  await page.goto(`http://localhost:${CLIENT_PORT}/host`);
  await page.waitForTimeout(600);

  const gateBefore = await page.locator('[data-testid="audio-gate"]').count();
  // The "Create Room" button is still present in the DOM underneath (the
  // gate is a z-index overlay, not a replacement) - the real proof it
  // "cannot start" is that a click on it is intercepted, exactly as a
  // real tap landing on the gate instead would be. Playwright's own
  // actionability check throws when another element covers the target.
  let createRoomClickThrows = false;
  try {
    await page.getByRole('button', { name: 'Create Room' }).click({ timeout: 2000 });
  } catch {
    createRoomClickThrows = true;
  }
  const ctxBefore = await page.evaluate(() => !!(window as any).__audioProbe.ctx);
  console.log(`before tap: gate nodes=${gateBefore}, Create Room click intercepted by gate=${createRoomClickThrows}, AudioContext constructed=${ctxBefore}`);
  check('1: gate present before any tap', gateBefore === 1);
  check('1: Create Room unreachable before tap (game cannot start)', createRoomClickThrows);
  check('1: no AudioContext constructed yet (nothing to resume)', ctxBefore === false);

  await page.locator('[data-testid="audio-gate"]').click();
  await page.waitForTimeout(500);

  const gateAfter = await page.locator('[data-testid="audio-gate"]').count();
  const ctxStateAfter = await page.evaluate(() => (window as any).__audioProbe.ctx?.state ?? 'no-context');
  const createRoomAfter = await page.getByRole('button', { name: 'Create Room' }).count();
  console.log(`after 1 tap: gate nodes=${gateAfter}, AudioContext.state=${ctxStateAfter}, Create Room button nodes=${createRoomAfter}`);
  check('1: gate gone after one tap (0 nodes)', gateAfter === 0);
  check('1: AudioContext running after the tap', ctxStateAfter === 'running');
  check('1: Create Room now reachable', createRoomAfter === 1);

  await page.getByRole('button', { name: 'Create Room' }).click();
  const codeLocator = page.getByTestId('room-code');
  await codeLocator.waitFor({ state: 'visible', timeout: 15000 });
  const code = ((await codeLocator.textContent()) ?? '').replace(/\s+/g, '');
  console.log(`room ${code} created`);

  const p1 = await joinSim('Άρης', 'minotaur', code);
  const p2 = await joinSim('Νίκη', 'sphinx', code);
  console.log('2 players joined (VIP = Άρης) - starting the game to reach GAME_INTRO_SEQUENCE');
  p1.socket.emit(ClientEvents.VIP_START_GAME, {});

  let firstLine: any = null;
  const findDeadline = Date.now() + 20000;
  while (Date.now() < findDeadline && !firstLine) {
    await delay(300);
    const sources: any[] = await page.evaluate(() => (window as any).__audioProbe.sources);
    firstLine = sources.find((s) => s.loop === false && s.fileDurationMs && s.fileDurationMs > 500);
  }
  check('1: the intro\'s first clip actually started (non-loop BufferSource observed)', firstLine !== null);
  if (firstLine) {
    console.log(`  first GAME_INTRO clip file duration = ${Math.round(firstLine.fileDurationMs)}ms`);
    const endDeadline = Date.now() + firstLine.fileDurationMs + 5000;
    let played = firstLine;
    while (Date.now() < endDeadline && played.endedAtMs === null) {
      await delay(300);
      const sources: any[] = await page.evaluate(() => (window as any).__audioProbe.sources);
      played = sources.find((s: any) => s.startedAtMs === firstLine.startedAtMs) ?? played;
    }
    const playedMs = played.endedAtMs !== null ? played.endedAtMs - played.startedAtMs : null;
    console.log(`  played duration (start->ended) = ${playedMs !== null ? Math.round(playedMs) + 'ms' : 'never ended (timed out)'}`);
    check('1: played duration is close to file duration (real playback, not a silent backstop)', playedMs !== null && Math.abs(playedMs - firstLine.fileDurationMs) < 1500, `played=${playedMs} file=${firstLine.fileDurationMs}`);
  }

  p1.socket.disconnect();
  p2.socket.disconnect();
}

async function runScenarioB(page: Page): Promise<void> {
  console.log('=== SCENARIO B - ?bot=5&mode=full bypass, no human tap ===');
  await page.goto(`http://localhost:${CLIENT_PORT}/host?bot=5&mode=full`);
  await page.waitForTimeout(500);
  const gateAtLoad = await page.locator('[data-testid="audio-gate"]').count();
  check('2: gate never renders for a bot-driven room (bypassed at mount)', gateAtLoad === 0, `nodes=${gateAtLoad}`);

  const t0 = Date.now();
  await page.getByRole('button', { name: 'Create Room' }).click();
  const codeLocator = page.getByTestId('room-code');
  await codeLocator.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {
    // An all-bot room can self-start (Task 217) fast enough that LOBBY's
    // room-code slab never gets a settled render before the first
    // phase:changed lands - not a failure, just means we missed the window.
  });
  console.log('room created with ?bot=5&mode=full - watching for self-start and sampling gate node count');

  const gateSamples: number[] = [];
  const stagesSeen = new Set<string>();
  let sawGameOver = false;
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline && !sawGameOver) {
    await delay(2000);
    gateSamples.push(await page.locator('[data-testid="audio-gate"]').count());
    const stageAttr = await page.locator('[data-testid="stage-announce"]').getAttribute('data-stage').catch(() => null);
    if (stageAttr) stagesSeen.add(stageAttr);
    const gameOverVisible = await page.getByTestId('gameover-root').count().catch(() => 0);
    const podiumVisible = await page.getByTestId('podium-root').count().catch(() => 0);
    if (gameOverVisible > 0 || podiumVisible > 0) {
      sawGameOver = true;
    }
  }
  const totalMs = Date.now() - t0;
  console.log(`reached GAME_OVER: ${sawGameOver} | total duration = ${(totalMs / 1000).toFixed(1)}s | stages announced: ${[...stagesSeen].sort().join(',')} | gate samples (${gateSamples.length}): max=${Math.max(0, ...gateSamples)}`);
  check('2: room reaches GAME_OVER unattended', sawGameOver, `after ${(totalMs / 1000).toFixed(1)}s`);
  check('2: gate node count stayed 0 throughout (bypass holds for the whole run)', gateSamples.every((n) => n === 0), `samples=${JSON.stringify(gateSamples)}`);
}

async function main(): Promise<void> {
  await import('../server/src/index.js');
  console.log(`in-process real server listening on ${SERVER_PORT}`);

  clientProc = spawn('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], {
    cwd: CLIENT_DIR,
    stdio: 'ignore',
    detached: true,
    env: { ...process.env, VITE_SERVER_URL: `http://localhost:${SERVER_PORT}` },
  });
  await waitForClient();
  console.log(`client dev server listening on ${CLIENT_PORT}`);

  const browser: Browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  try {
    if (SCENARIO === 'B') {
      await runScenarioB(page);
    } else {
      await runScenarioA(page);
    }
    console.log(`\n${passed} passed, ${failed} failed`);
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    killGroup(clientProc);
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  killGroup(clientProc);
  process.exit(1);
});
