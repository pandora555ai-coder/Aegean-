// Task 252 - Η Λήθη (full's stage 5, mechanically the agora scene): two
// reported defects, (a) Socrates rendering in the scene and (b) a ~1s
// background gap right after players submit their agora answers. Same
// in-process-real-server + real-Vite-client + real-browser infra as
// dev/finale-staging-check.ts, jumping directly into stage 5 the same way
// that harness jumps directly into the climb (buildRoomQuestions + the
// mode's own beginStage entry point - startAgoraSegment - rather than
// playing through stages 1-4).
//
//   npx tsx dev/lethe-scene-check.ts
process.env.PORT = '3926';

import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { io as ioClient, type Socket } from 'socket.io-client';
import { ClientEvents, FULL_AGORA_SCORE_SCALE, ServerEvents } from '@game/shared';

const SERVER_PORT = 3926;
const CLIENT_PORT = 5927;
const ROOT = new URL('..', import.meta.url).pathname;
const CLIENT_DIR = `${ROOT}client`;

let clientProc: ChildProcess | null = null;

function killGroup(child: ChildProcess | null): void {
  if (!child || child.pid === undefined || child.killed) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // already gone
  }
}

async function waitForClient(): Promise<void> {
  for (let attempt = 0; attempt < 90; attempt++) {
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

const NAMES = ['Άρης', 'Νίκη', 'Χαρά', 'Τάκης'];
const AVATARS = ['minotaur', 'medusa', 'cyclops', 'centaur'];

function joinSim(name: string, avatarId: string, code: string): Promise<Sim> {
  const playerId = randomUUID();
  return new Promise((resolve, reject) => {
    const socket: Socket = ioClient(`http://localhost:${SERVER_PORT}`, { reconnection: false });
    socket.on('connect', () => socket.emit(ClientEvents.PLAYER_JOIN, { code, name, playerId, avatarId }));
    socket.once(ServerEvents.PLAYER_JOINED, () => resolve({ name, playerId, socket }));
    socket.once(ServerEvents.JOIN_REJECTED, (p: unknown) => reject(new Error(`join rejected: ${JSON.stringify(p)}`)));
    socket.once('connect_error', reject);
  });
}

interface DomSample {
  t: number;
  market: number;
  ground: number;
  socrates: number;
}

async function installSampler(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __samples: DomSample[]; __sampler: number };
    w.__samples = [];
    w.__sampler = window.setInterval(() => {
      w.__samples.push({
        t: Date.now(),
        market: document.querySelectorAll('[data-testid="agora-market"]').length,
        ground: document.querySelectorAll('[data-testid="agora-ground"]').length,
        socrates: document.querySelectorAll('[data-testid="socrates-figure"]').length,
      });
    }, 40);
  });
}

interface DomSampleTyped {
  t: number;
  market: number;
  ground: number;
  socrates: number;
}

async function readSamples(page: Page): Promise<DomSampleTyped[]> {
  return page.evaluate(() => (window as unknown as { __samples: DomSampleTyped[] }).__samples);
}

// Longest contiguous run where BOTH market and ground are absent (0) -
// "the background disappears" as reported, not merely the fairness rule's
// own always-expected market-only gate.
function longestBackgroundGap(samples: DomSampleTyped[]): { startT: number; endT: number; ms: number } | null {
  let best: { startT: number; endT: number; ms: number } | null = null;
  let runStart: number | null = null;
  for (const s of samples) {
    const bothAbsent = s.market === 0 && s.ground === 0;
    if (bothAbsent && runStart === null) runStart = s.t;
    if (!bothAbsent && runStart !== null) {
      const ms = s.t - runStart;
      if (!best || ms > best.ms) best = { startT: runStart, endT: s.t, ms };
      runStart = null;
    }
  }
  if (runStart !== null) {
    const ms = samples[samples.length - 1].t - runStart;
    if (!best || ms > best.ms) best = { startT: runStart, endT: samples[samples.length - 1].t, ms };
  }
  return best;
}

type RoomLike = {
  code: string;
  phase: string;
  stage: number;
  gameIntroPlayed: boolean;
  currentQuestionIndex: number;
  gameStartedAt: number | null;
};

async function waitForPhase(room: RoomLike, phase: string, timeoutMs = 30000): Promise<void> {
  const started = Date.now();
  while (room.phase !== phase) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${phase} (still ${room.phase})`);
    await delay(30);
  }
}

async function main(): Promise<void> {
  console.log(`booting in-process server on ${SERVER_PORT}`);
  await import('../server/src/index.js');
  const { getRoom, buildRoomQuestions } = await import('../server/src/state.js');
  const { startAgoraSegment, getAgoraCorrectIndex } = await import('../server/src/modes/agora.js');

  clientProc = spawn('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], {
    cwd: CLIENT_DIR,
    stdio: 'ignore',
    detached: true,
    env: { ...process.env, VITE_SERVER_URL: `http://localhost:${SERVER_PORT}` },
  });
  await waitForClient();
  console.log(`client dev server listening on ${CLIENT_PORT}`);

  const browser: Browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    await page.goto(`http://localhost:${CLIENT_PORT}/host?mode=full`);
    await page.getByRole('button', { name: 'Create Room' }).click();
    const codeLocator = page.getByTestId('room-code');
    await codeLocator.waitFor({ state: 'visible', timeout: 20000 });
    const code = ((await codeLocator.textContent()) ?? '').replace(/\s+/g, '');
    console.log(`room ${code} created (mode=full), host browser attached`);

    // ---- Socrates-still-renders-in-LOBBY sample, BEFORE anything starts ----
    await delay(300);
    const lobbySocratesCount = await page.locator('[data-testid="socrates-figure"]').count();
    console.log(`LOBBY: socrates-figure count = ${lobbySocratesCount}`);

    const sims: Sim[] = [];
    for (let i = 0; i < 4; i++) sims.push(await joinSim(NAMES[i], AVATARS[i], code));
    await delay(400);

    const room = getRoom(code) as unknown as RoomLike;
    room.gameIntroPlayed = true;
    // Same shape startGame() itself uses (index.ts) - populates room.questions
    // AND every sub-mode's own state (full.ts's prepareGame), agora included -
    // then jump straight to stage 5 the way full.ts's beginStage does for it,
    // skipping stages 1-4 entirely (dev/finale-staging-check.ts's own
    // "seed gameIntroPlayed, call the mode's mechanic entry directly" shape).
    buildRoomQuestions(room as never);
    room.currentQuestionIndex = 0;
    room.gameStartedAt = Date.now();
    room.stage = 5;
    startAgoraSegment(room as never, FULL_AGORA_SCORE_SCALE);

    await waitForPhase(room, 'AGORA_QUESTION');
    console.log('room reached AGORA_QUESTION (stage 5, Η Λήθη)');

    await installSampler(page);
    await delay(500); // a few samples of the pre-submit steady state

    // Criterion 4 geometry snapshot - taken HERE, while AGORA_QUESTION's own
    // question-text/options are genuinely on screen (not after the reveal,
    // by which point the round may already have moved to question 2/3 or a
    // Socrates beat and the slab would be a different one entirely).
    const geometry = await page.evaluate(() => {
      const sophists = [...document.querySelectorAll('[data-testid="sophist"]')].map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      });
      const plaques = [...document.querySelectorAll('[data-testid="sophist-name"]')].map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      });
      const qEl = document.querySelector('[data-testid="question-text"]');
      const questionText = qEl
        ? (() => {
            const r = qEl.getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height };
          })()
        : null;
      return { sophists, plaques, questionText };
    });

    const correctIndex = getAgoraCorrectIndex(room as never) ?? 0;
    // Task-note accuracy band (50-70%): each sim answers correctly with
    // probability 0.6, independently, at a small staggered delay.
    const submitPromises = sims.map(
      (sim, i) =>
        new Promise<void>((resolve) => {
          setTimeout(
            () => {
              const choice = Math.random() < 0.6 ? correctIndex : (correctIndex + 1) % 4;
              sim.socket.emit(ClientEvents.AGORA_SUBMIT, { choice });
              resolve();
            },
            300 + i * 150,
          );
        }),
    );
    await Promise.all(submitPromises);
    const lastSubmitT = Date.now();
    console.log(`all 4 players submitted by t=${lastSubmitT}`);

    // Sample through the reveal's grid+proof stages and a little past.
    await waitForPhase(room, 'AGORA_REVEAL');
    const revealT = Date.now();
    console.log(`AGORA_REVEAL reached at +${revealT - lastSubmitT}ms after last submit`);
    await delay(4000); // grid (1800ms) + proof + margin

    const samples = await readSamples(page);
    const gap = longestBackgroundGap(samples);
    const socratesDuringAgora = samples.filter((s) => s.socrates > 0).length;
    const totalDuringAgora = samples.length;

    // Criterion 2's own window: the answer->reveal transition specifically,
    // -1000ms to +3000ms around the LAST submit (covers the reveal's own
    // grid+proof stages either side) - not the whole question, whose market
    // absence during answering is the deliberate, unrelated fairness rule.
    const windowSamples = samples.filter((s) => s.t >= lastSubmitT - 1000 && s.t <= lastSubmitT + 3000);
    const windowAbsent = windowSamples.filter((s) => s.market === 0 && s.ground === 0).length;

    console.log(`\n=== Λήθη (agora) scene samples: ${samples.length} total ===`);
    console.log(
      `longest background-absent gap overall: ${gap ? `${gap.ms}ms (from +${gap.startT - lastSubmitT}ms to +${gap.endT - lastSubmitT}ms relative to last submit)` : 'none'}`,
    );
    console.log(
      `answer->reveal transition window [-1000ms,+3000ms around last submit]: ${windowAbsent}/${windowSamples.length} samples with background absent`,
    );
    console.log(`socrates-figure present in ${socratesDuringAgora}/${totalDuringAgora} samples during this window`);
    console.log(`\ngeometry (Λήθη AGORA_QUESTION-ish):`);
    console.log(JSON.stringify(geometry, null, 2));

    // ---- second-stage Socrates-still-renders-elsewhere check: a plain
    // standalone quiz room, reached in a couple of seconds (no full-show
    // playthrough needed for THIS proof - the render logic is the same
    // component regardless of which mode's QUESTION phase it is). Real
    // player sockets, not ?bot=N - two bots auto-start the instant they
    // both join (Task 217), which raced past the room-code element before
    // Playwright could read it.
    const context2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page2 = await context2.newPage();
    await page2.goto(`http://localhost:${CLIENT_PORT}/host?mode=quiz`);
    await page2.getByRole('button', { name: 'Create Room' }).click();
    const code2Locator = page2.getByTestId('room-code');
    await code2Locator.waitFor({ state: 'visible', timeout: 20000 });
    const code2 = ((await code2Locator.textContent()) ?? '').replace(/\s+/g, '');
    const quizSims: Sim[] = [];
    quizSims.push(await joinSim('Γιώργος', 'sphinx', code2));
    quizSims.push(await joinSim('Ζωή', 'pegasus', code2));
    await delay(300);
    quizSims[0].socket.emit(ClientEvents.VIP_START_GAME, {});
    const room2 = getRoom(code2) as unknown as RoomLike;
    await waitForPhase(room2, 'QUESTION', 30000);
    await delay(300);
    const quizSocratesCount = await page2.locator('[data-testid="socrates-figure"]').count();
    console.log(`\nstandalone quiz QUESTION (a plain other stage): socrates-figure count = ${quizSocratesCount}`);
    for (const sim of quizSims) sim.socket.disconnect();
    await context2.close();

    await context.close();
  } finally {
    await browser.close();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    killGroup(clientProc);
    setTimeout(() => process.exit(), 200);
  });
