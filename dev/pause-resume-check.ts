// Task 246 - pause/resume coverage for EVERY timed phase, observed against a
// real server, real sockets and a real TV in a real browser.
//
// Same infra as dev/climb-ceremony-check.ts / dev/socrates-pacing-check.ts: the
// REAL server (server/src/index.ts's own socket handlers) runs in-process on a
// throwaway port set BEFORE the import, so the harness can read the LIVE Room
// and report what the shared timer was ACTUALLY holding rather than inferring
// it from how long something took, and a throwaway Vite serves the real client.
//
// For each timed phase it: waits for the phase, lets it run a beat, pauses from
// a real player socket, samples the server's remaining AND the TV's own
// displayed countdown twice (>= 2s apart) to prove the freeze, resumes, and
// then watches the phase actually complete - reporting how long after the
// resume it advanced against what the server said was left.
//
//   A  quiz      STAGE_ANNOUNCE, QUESTION, REVEAL, SOCRATES, POWER_UP, STEAL
//   B  trial     TRIAL_QUESTION, TRIAL_REVEAL
//   C  climb     CLIMB_QUESTION, CLIMB_REVEAL, DUEL_PICK, DUEL_REVEAL
//   D  blitz     BLITZ, BLITZ_REVEAL
//   E  draw      DRAW, GUESS, GUESS_REVEAL
//   F  numeric   NUMERIC_QUESTION, NUMERIC_REVEAL
//   G  agora     AGORA_EXPOSE, AGORA_QUESTION, AGORA_REVEAL
//
//   npx tsx dev/pause-resume-check.ts
//   ONLY=C npx tsx dev/pause-resume-check.ts
// Ports are env-overridable (climb-entry-check.ts's own pattern) so two
// scenario groups can run at once on different port pairs rather than
// queueing behind each other - the whole suite is ~20 minutes serially.
process.env.PORT = process.env.SERVER_PORT ?? '3950';

import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { io as ioClient, type Socket } from 'socket.io-client';
import {
  ClientEvents,
  ServerEvents,
  CLIMB_TOP,
  REVEAL_DURATION_MS,
  GUESS_REVEAL_DURATION_MS,
  NUMERIC_REVEAL_DURATION_MS,
  BLITZ_REVEAL_DURATION_MS,
  type DuelWeapon,
} from '@game/shared';

const SERVER_PORT = Number(process.env.SERVER_PORT ?? 3950);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5951);
const ROOT = new URL('..', import.meta.url).pathname;
const CLIENT_DIR = `${ROOT}client`;
const ONLY = process.env.ONLY ?? '';
const runs = (id: string): boolean => ONLY === '' || ONLY.includes(id);

let clientProc: ChildProcess | null = null;
const rows: Row[] = [];

interface Row {
  phase: string;
  serverAtPause: number;
  tvAtPause: string;
  freezeA: string; // "<server>ms / <tv>"
  freezeB: string;
  phaseHeld: boolean;
  serverAtResume: number;
  tvAfterResume: string;
  advancedTo: string;
  advanceAfterMs: number;
}

// --------------------------------------------------------------------------
// The TV's own displayed countdown, per phase. Ring phases put the integer
// seconds in Krater's own node; the reveal phases carry theirs as the inline
// width of their progress bar's fill (a fraction of the phase's full
// duration), which is the only place that number reaches the DOM. The rest
// genuinely render no countdown at all - Task 192 tore CLIMB_REVEAL's out,
// and STAGE_ANNOUNCE/SOCRATES never had one.
// --------------------------------------------------------------------------
const BAR: Record<string, { testid: string; totalMs: number }> = {
  REVEAL: { testid: 'reveal-progress', totalMs: REVEAL_DURATION_MS },
  AGORA_REVEAL: { testid: 'reveal-progress', totalMs: REVEAL_DURATION_MS },
  TRIAL_REVEAL: { testid: 'trial-reveal-progress', totalMs: REVEAL_DURATION_MS },
  GUESS_REVEAL: { testid: 'guess-reveal-progress', totalMs: GUESS_REVEAL_DURATION_MS },
  NUMERIC_REVEAL: { testid: 'numeric-reveal-progress', totalMs: NUMERIC_REVEAL_DURATION_MS },
  BLITZ_REVEAL: { testid: 'blitz-reveal-progress', totalMs: BLITZ_REVEAL_DURATION_MS },
};

async function readTv(page: Page, phase: string): Promise<string> {
  const bar = BAR[phase];
  if (bar) {
    const n = await page.locator(`[data-testid="${bar.testid}"] > div`).count();
    if (n === 0) return 'absent';
    const width = await page.locator(`[data-testid="${bar.testid}"] > div`).first().evaluate((el) => (el as HTMLElement).style.width);
    const pct = Number(String(width).replace('%', ''));
    const secs = Number.isFinite(pct) ? (pct / 100) * Math.ceil(bar.totalMs / 1000) : NaN;
    return `bar ${width} (=${secs.toFixed(2)}s)`;
  }
  const n = await page.locator('[data-testid="countdown"]').count();
  if (n === 0) return 'absent';
  return `${((await page.locator('[data-testid="countdown"]').first().textContent()) ?? '').trim()}s`;
}

// --------------------------------------------------------------------------
// plumbing
// --------------------------------------------------------------------------
function killGroup(child: ChildProcess | null): void {
  if (!child || child.pid === undefined || child.killed) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
}

async function waitForClient(): Promise<void> {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const res = await fetch(`http://localhost:${CLIENT_PORT}/`);
      if (res.ok) return;
    } catch {
      /* not up yet */
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

const AVATARS = ['minotaur', 'medusa', 'cyclops', 'centaur', 'sphinx', 'pegasus'];
// Task 241/245 made names PRESET-ONLY (isValidPlayerName = strict membership
// in PRESET_NAMES), so the Greek-letter names every older harness uses are
// now rejected outright with INVALID_NAME. Drawn from the FRONT of the
// catalogue: bots take theirs from the END (bots.ts:459), and names are
// unique per room.
const NAMES = ['Άρης', 'Νίκη', 'Χαρά', 'Τάκης', 'Γιώργος', 'Ζωή'];

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

type RoomLike = {
  phase: string;
  code: string;
  paused: boolean;
  gameIntroPlayed: boolean;
  settings: Record<string, unknown>;
  climb: {
    questions: Array<{ correctIndex: number }>;
    questionIndex: number;
    steps: Map<string, number>;
  } | null;
};

async function waitForPhase(room: RoomLike, phase: string, timeoutMs = 120000): Promise<void> {
  const started = Date.now();
  while (room.phase !== phase) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${phase} (still ${room.phase})`);
    await delay(50);
  }
}

async function newRoom(
  browser: Browser,
  mode: string,
  simCount: number,
): Promise<{ page: Page; sims: Sim[]; code: string; close: () => Promise<void> }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.goto(`http://localhost:${CLIENT_PORT}/host?clock=off&mode=${mode}`);
  await page.getByRole('button', { name: 'Create Room' }).click();
  const codeLocator = page.getByTestId('room-code');
  await codeLocator.waitFor({ state: 'visible', timeout: 20000 });
  const code = ((await codeLocator.textContent()) ?? '').replace(/\s+/g, '');
  const sims: Sim[] = [];
  for (let i = 0; i < simCount; i++) sims.push(await joinSim(NAMES[i], AVATARS[i], code));
  await delay(400);
  return {
    page,
    sims,
    code,
    close: async () => {
      for (const sim of sims) sim.socket.disconnect();
      await context.close();
    },
  };
}

// --------------------------------------------------------------------------
// THE PROBE. One timed phase: pause mid-flight, hold, sample twice, resume,
// then watch it actually finish.
// --------------------------------------------------------------------------
async function probe(
  room: RoomLike,
  page: Page,
  pauser: Sim,
  phase: string,
  enterDelayMs: number,
  remaining: (r: RoomLike) => number,
  waitMs = 120000,
): Promise<Row | null> {
  try {
    await waitForPhase(room, phase, waitMs);
  } catch {
    console.log(`  -- ${phase}: never reached, skipped`);
    return null;
  }
  await delay(enterDelayMs);
  if (room.phase !== phase) {
    console.log(`  -- ${phase}: passed before the probe could pause it, skipped`);
    return null;
  }

  const paused = new Promise<void>((resolve) => pauser.socket.once(ServerEvents.GAME_PAUSED, () => resolve()));
  pauser.socket.emit(ClientEvents.GAME_PAUSE, {});
  await paused;

  const serverAtPause = remaining(room);
  const tvAtPause = await readTv(page, phase);

  await delay(600);
  const fa = { s: remaining(room), tv: await readTv(page, phase), p: room.phase };
  await delay(2600); // >= 2s after the first sample; total pause >= 3s
  const fb = { s: remaining(room), tv: await readTv(page, phase), p: room.phase };

  const resumed = new Promise<number>((resolve) =>
    pauser.socket.once(ServerEvents.GAME_RESUMED, (p: { remainingMs: number }) => resolve(p.remainingMs)),
  );
  const resumeAt = Date.now();
  pauser.socket.emit(ClientEvents.GAME_RESUME, {});
  const serverAtResume = await resumed;

  await delay(300);
  const tvAfterResume = await readTv(page, phase);

  while (room.phase === phase && Date.now() - resumeAt < 120000) await delay(25);
  const advanceAfterMs = Date.now() - resumeAt;

  const row: Row = {
    phase,
    serverAtPause,
    tvAtPause,
    freezeA: `${fa.s}ms / ${fa.tv}`,
    freezeB: `${fb.s}ms / ${fb.tv}`,
    phaseHeld: fa.p === phase && fb.p === phase,
    serverAtResume,
    tvAfterResume,
    advancedTo: room.phase,
    advanceAfterMs,
  };
  rows.push(row);
  console.log(
    `  ${phase}: pause ${serverAtPause}ms/TV ${tvAtPause} | frozen ${row.freezeA} -> ${row.freezeB} (phase held ${row.phaseHeld}) | resume ${serverAtResume}ms -> TV ${tvAfterResume} | -> ${row.advancedTo} after ${advanceAfterMs}ms`,
  );
  return row;
}

async function main() {
  await import('../server/src/index.js');
  const { getRoom } = await import('../server/src/state.js');
  const { remainingActiveTimerMs } = await import('../server/src/timers.js');
  const { startClimb, startTrial } = await import('../server/src/phases.js');
  const { spawnBots } = await import('../server/src/bots.js');
  console.log(`in-process real server listening on ${SERVER_PORT}`);

  clientProc = spawn('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], {
    cwd: CLIENT_DIR,
    stdio: 'ignore',
    detached: true,
    env: { ...process.env, VITE_SERVER_URL: `http://localhost:${SERVER_PORT}` },
  });
  await waitForClient();
  console.log(`client dev server listening on ${CLIENT_PORT}`);

  const rem = (r: RoomLike) => remainingActiveTimerMs(r as never);

  // --autoplay-policy: without it every Socrates beat rides its backstop
  // instead of the real clip's own ack, which changes what SOCRATES's timer
  // is even holding.
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

  try {
    // ---------------------------------------------------------------- A quiz
    if (runs('A')) {
      console.log('\n=== A. quiz: STAGE_ANNOUNCE, QUESTION, REVEAL, SOCRATES, POWER_UP, STEAL ===');
      const { page, sims, code, close } = await newRoom(browser, 'quiz', 1);
      const room = getRoom(code) as unknown as RoomLike;
      room.settings.powerUpsEnabled = true;
      room.settings.questionTimeMs = 10000;
      room.settings.gameLength = 'long';
      spawnBots(code, 3);
      await delay(600);
      sims[0].socket.emit(ClientEvents.VIP_START_GAME, {});

      await probe(room, page, sims[0], 'STAGE_ANNOUNCE', 800, rem);
      await probe(room, page, sims[0], 'QUESTION', 3000, rem);
      await probe(room, page, sims[0], 'REVEAL', 1500, rem);
      await probe(room, page, sims[0], 'SOCRATES', 1200, rem);
      await probe(room, page, sims[0], 'POWER_UP', 2500, rem);
      await probe(room, page, sims[0], 'STEAL', 1500, rem);
      await close();
    }

    // --------------------------------------------------------------- B trial
    if (runs('B')) {
      console.log('\n=== B. trial: TRIAL_QUESTION, TRIAL_REVEAL ===');
      const { page, sims, code, close } = await newRoom(browser, 'quiz', 3);
      const room = getRoom(code) as unknown as RoomLike;
      room.gameIntroPlayed = true; // Task 237 - or GAME_INTRO_SEQUENCE fires here
      startTrial(room as never);
      await probe(room, page, sims[0], 'TRIAL_QUESTION', 3000, rem);
      await probe(room, page, sims[0], 'TRIAL_REVEAL', 1500, rem);
      await close();
    }

    // --------------------------------------------------------------- C climb
    if (runs('C')) {
      console.log('\n=== C. climb: CLIMB_QUESTION, CLIMB_REVEAL, DUEL_PICK, DUEL_REVEAL ===');
      const { page, sims, code, close } = await newRoom(browser, 'quiz', 3);
      const room = getRoom(code) as unknown as RoomLike;
      room.gameIntroPlayed = true;
      // Weapons per sim - the same weapon on both sides is a guaranteed tie,
      // and a tie re-runs DUEL_PICK forever (ceremony-check's own note).
      const weapons = new Map<string, DuelWeapon>([
        [sims[0].playerId, 'xifos'],
        [sims[1].playerId, 'aspida'],
      ]);
      for (const sim of sims) {
        sim.socket.on(ServerEvents.DUEL_PICK_SHOW, (p: { youDuel?: boolean; picked?: boolean }) => {
          if (!p.youDuel || p.picked) return;
          setTimeout(() => sim.socket.emit(ClientEvents.DUEL_PICK, { weapon: weapons.get(sim.playerId) ?? 'xifos' }), 9000);
        });
      }
      startClimb(room as never);

      await probe(room, page, sims[2], 'CLIMB_QUESTION', 4000, rem);
      await probe(room, page, sims[2], 'CLIMB_REVEAL', 1200, rem);

      // Seed a two-arrival finish so the duel actually happens.
      await waitForPhase(room, 'CLIMB_QUESTION');
      room.climb!.steps.set(sims[0].playerId, CLIMB_TOP - 2);
      room.climb!.steps.set(sims[1].playerId, CLIMB_TOP - 1);
      room.climb!.steps.set(sims[2].playerId, 2);
      const correct = room.climb!.questions[room.climb!.questionIndex].correctIndex;
      sims[0].socket.emit(ClientEvents.CLIMB_SUBMIT, { choice: correct });
      await delay(200);
      sims[1].socket.emit(ClientEvents.CLIMB_SUBMIT, { choice: correct });

      await probe(room, page, sims[2], 'DUEL_PICK', 3000, rem);
      await probe(room, page, sims[2], 'DUEL_REVEAL', 1500, rem);
      await close();
    }

    // --------------------------------------------------------------- D blitz
    if (runs('D')) {
      console.log('\n=== D. blitz: BLITZ, BLITZ_REVEAL ===');
      const { page, sims, code, close } = await newRoom(browser, 'blitz', 1);
      const room = getRoom(code) as unknown as RoomLike;
      spawnBots(code, 2);
      await delay(600);
      sims[0].socket.emit(ClientEvents.VIP_START_GAME, {});
      await probe(room, page, sims[0], 'BLITZ', 4000, rem);
      await probe(room, page, sims[0], 'BLITZ_REVEAL', 1500, rem);
      await close();
    }

    // ---------------------------------------------------------------- E draw
    if (runs('E')) {
      console.log('\n=== E. draw: DRAW, GUESS, GUESS_REVEAL ===');
      const { page, sims, code, close } = await newRoom(browser, 'draw', 1);
      const room = getRoom(code) as unknown as RoomLike;
      spawnBots(code, 2);
      await delay(600);
      sims[0].socket.emit(ClientEvents.VIP_START_GAME, {});
      await probe(room, page, sims[0], 'DRAW', 4000, rem);
      await probe(room, page, sims[0], 'GUESS', 3000, rem);
      await probe(room, page, sims[0], 'GUESS_REVEAL', 1500, rem);
      await close();
    }

    // ------------------------------------------------------------- F numeric
    if (runs('F')) {
      console.log('\n=== F. numeric: NUMERIC_QUESTION, NUMERIC_REVEAL ===');
      const { page, sims, code, close } = await newRoom(browser, 'numeric', 1);
      const room = getRoom(code) as unknown as RoomLike;
      spawnBots(code, 2);
      await delay(600);
      sims[0].socket.emit(ClientEvents.VIP_START_GAME, {});
      await probe(room, page, sims[0], 'NUMERIC_QUESTION', 4000, rem);
      await probe(room, page, sims[0], 'NUMERIC_REVEAL', 1500, rem);
      await close();
    }

    // --------------------------------------------------------------- G agora
    if (runs('G')) {
      console.log('\n=== G. agora: AGORA_EXPOSE, AGORA_QUESTION, AGORA_REVEAL ===');
      const { page, sims, code, close } = await newRoom(browser, 'agora', 1);
      const room = getRoom(code) as unknown as RoomLike;
      spawnBots(code, 2);
      await delay(600);
      sims[0].socket.emit(ClientEvents.VIP_START_GAME, {});
      await probe(room, page, sims[0], 'AGORA_EXPOSE', 3000, rem);
      await probe(room, page, sims[0], 'AGORA_QUESTION', 3000, rem);
      // The reveal's own slab is only up for AGORA_REVEAL_GRID_MS = 1800ms,
      // so the pause has to land inside that beat for the bar to be readable.
      await probe(room, page, sims[0], 'AGORA_REVEAL', 900, rem);
      await close();
    }

    // ---------------------------------------------------------------- H steal
    // STEAL belongs to quiz stage 3, i.e. from question 9 of 12 - scenario A
    // spends its whole budget probing the five phases before it and never
    // gets there. This one probes NOTHING on the way, so one run reaches the
    // stage: ~10s question + 6s reveal + a Socrates beat, eight times over.
    if (runs('H')) {
      console.log('\n=== H. quiz stage 3: STEAL ===');
      const { page, sims, code, close } = await newRoom(browser, 'quiz', 1);
      const room = getRoom(code) as unknown as RoomLike;
      room.settings.powerUpsEnabled = false; // nothing is probed before stage 3
      room.settings.questionTimeMs = 10000;
      room.settings.gameLength = 'long';
      spawnBots(code, 3);
      await delay(600);
      sims[0].socket.emit(ClientEvents.VIP_START_GAME, {});
      // 150ms, not the 1500ms every other probe uses: the thief here is a
      // bot and picks almost immediately, and the moment the steal RESOLVES
      // the krater stops rendering a ring entirely (`steal?.resolved ? null`)
      // while the timer underneath becomes the STEAL_ANNOUNCE beat. Pausing
      // late therefore probes the announcement, not the picking countdown
      // this row is meant to cover.
      await probe(room, page, sims[0], 'STEAL', 150, rem, 420000);
      await close();
    }

    // ------------------------------------------------------------ the matrix
    console.log('\n================ RESUME MATRIX ================');
    console.log('phase | server@pause | TV@pause | frozen A | frozen B | phase held | server@resume | TV after resume | advanced to | after');
    for (const r of rows) {
      console.log(
        `${r.phase} | ${r.serverAtPause}ms | ${r.tvAtPause} | ${r.freezeA} | ${r.freezeB} | ${r.phaseHeld} | ${r.serverAtResume}ms | ${r.tvAfterResume} | ${r.advancedTo} | ${r.advanceAfterMs}ms`,
      );
    }
    console.log(`\n${rows.length} timed phases probed.`);
  } catch (err) {
    // Printed HERE, not in a .catch() after the finally below: a
    // process.exit() in the finally would kill the process before the
    // rejection handler ever ran, which is exactly how the first version of
    // this harness swallowed its own TypeError whole.
    console.error('\n!!! harness error:', err);
  } finally {
    await browser.close();
    killGroup(clientProc);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  killGroup(clientProc);
  process.exit(1);
});
