// Task 209 - Η Μνήμη της Αγοράς: PHONE verification. Same shape as
// dev/agora-scene-check.ts (Task 208's TV counterpart) - a throwaway
// server+client dev pair, real gameplay over real sockets, a genuine
// Playwright /play page as the ONE real phone client (bots stay at the
// socket level, screenshot-phases.ts's own convention: bots never render a
// phone). Scoped to this task's four acceptance criteria, with real DOM /
// computed-style assertions rather than screenshots.
//
//   npx tsx dev/agora-phone-check.ts
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { io, type Socket } from 'socket.io-client';
import { AGORA_COLOURS, ClientEvents, ServerEvents } from '@game/shared';

const ROOT = new URL('..', import.meta.url).pathname;
const SERVER_DIR = `${ROOT}server`;
const CLIENT_DIR = `${ROOT}client`;
// Distinct from screenshot-phases.ts's 3901/5902 and agora-scene-check.ts's
// 3902/5903.
const SERVER_PORT = 3904;
const CLIENT_PORT = 5905;

let serverProc: ChildProcess | null = null;
let clientProc: ChildProcess | null = null;
let browser: Browser | null = null;
const sockets: Socket[] = [];

function spawnDetached(cmd: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): ChildProcess {
  return spawn(cmd, args, { cwd, stdio: 'inherit', detached: true, env: { ...process.env, ...env } });
}

function killGroup(child: ChildProcess | null) {
  if (!child || child.pid === undefined || child.killed) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // already gone
  }
}

async function cleanup() {
  for (const s of sockets) s.disconnect();
  if (browser) await browser.close().catch(() => {});
  killGroup(clientProc);
  killGroup(serverProc);
}

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const ok = await new Promise<boolean>((resolve) => {
      const probe = io(`http://localhost:${SERVER_PORT}`, { reconnection: false, timeout: 1000 });
      probe.on('connect', () => {
        probe.disconnect();
        resolve(true);
      });
      probe.on('connect_error', () => {
        probe.disconnect();
        resolve(false);
      });
    });
    if (ok) return;
    await delay(500);
  }
  throw new Error(`server did not come up on port ${SERVER_PORT} in time`);
}

async function waitForClient(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const res = await fetch(`http://localhost:${CLIENT_PORT}/`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await delay(500);
  }
  throw new Error(`client dev server did not come up on port ${CLIENT_PORT} in time`);
}

function joinBot(name: string, avatarId: string, code: string): Promise<Socket> {
  const playerId = randomUUID();
  return new Promise((resolve, reject) => {
    const socket: Socket = io(`http://localhost:${SERVER_PORT}`, { reconnection: false });
    socket.on('connect', () => socket.emit(ClientEvents.PLAYER_JOIN, { code, name, playerId, avatarId }));
    socket.once(ServerEvents.PLAYER_JOINED, () => resolve(socket));
    socket.once(ServerEvents.JOIN_REJECTED, (p) => reject(new Error(`bot join rejected: ${JSON.stringify(p)}`)));
    socket.once('connect_error', reject);
  });
}

// Answers instantly whenever a question opens - correctness doesn't matter
// to any assertion here, only that the round advances.
function wireAgoraBot(socket: Socket): void {
  socket.on(ServerEvents.AGORA_QUESTION_SHOW, (payload: { options?: string[]; answered?: boolean }) => {
    if (!payload.options || payload.answered) return;
    setTimeout(() => socket.emit(ClientEvents.AGORA_SUBMIT, { choice: 0 }), 400);
  });
}

function wireQuizBot(socket: Socket): void {
  socket.on(ServerEvents.QUESTION_SHOW, (payload: { options?: string[] }) => {
    if (!payload.options) return;
    setTimeout(() => socket.emit(ClientEvents.SUBMIT_ANSWER, { choice: 0 }), 400);
  });
}

async function phoneJoin(page: Page, code: string, name: string, playerId: string): Promise<void> {
  await page.addInitScript((id: string) => localStorage.setItem('playerId', id), playerId);
  await page.goto(`http://localhost:${CLIENT_PORT}/play`);
  await page.getByTestId('code-input').fill(code);
  await page.getByTestId('custom-name-toggle').click();
  await page.getByTestId('custom-name-input').fill(name);
  await page.getByTestId('custom-name-confirm').click();
  await page.getByTestId('avatar-grid').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('[data-testid="avatar-option"]:not([disabled])').first().click();
  await page.getByTestId('join-button').click();
  await page.getByTestId('settings-panel').waitFor({ state: 'visible', timeout: 15000 });
}

// hex '#RRGGBB' -> 'rgb(r, g, b)', matching getComputedStyle's own format.
function hexToRgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

interface WireCapture {
  submits: number;
  acks: number;
}

function wirePhoneSocketCapture(page: Page): WireCapture {
  const capture: WireCapture = { submits: 0, acks: 0 };
  page.on('websocket', (ws) => {
    ws.on('framesent', (frame) => {
      if (typeof frame.payload === 'string' && frame.payload.includes(ClientEvents.AGORA_SUBMIT)) {
        capture.submits += 1;
      }
    });
    ws.on('framereceived', (frame) => {
      if (typeof frame.payload === 'string' && frame.payload.includes(ServerEvents.ANSWER_ACCEPTED)) {
        capture.acks += 1;
      }
    });
  });
  return capture;
}

async function runAgoraFlow(): Promise<void> {
  console.log('\n== 1. FLOW + 2. SWATCHES + 3. NO SCENE (runtime) ==');
  if (!browser) throw new Error('browser not started');
  const hostPage = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await hostPage.goto(`http://localhost:${CLIENT_PORT}/host`);
  await hostPage.getByRole('button', { name: 'Create Room' }).click();
  const codeLocator = hostPage.getByTestId('room-code');
  await codeLocator.waitFor({ state: 'visible', timeout: 15000 });
  const code = ((await codeLocator.textContent()) ?? '').replace(/\s+/g, '');
  console.log(`room ${code} created`);

  const phoneContext = await browser.newContext({ viewport: { width: 360, height: 640 } });
  const phonePage = await phoneContext.newPage();
  const capture = wirePhoneSocketCapture(phonePage);
  const phonePlayerId = randomUUID();
  await phoneJoin(phonePage, code, 'Δοκιμή', phonePlayerId); // joins FIRST -> VIP (bots are never VIP)
  console.log('sequence: [join] -> [lobby/settings]');

  const bot1 = await joinBot('Αργύρης', 'sphinx', code);
  const bot2 = await joinBot('Ελένη', 'medusa', code);
  wireAgoraBot(bot1);
  wireAgoraBot(bot2);
  sockets.push(bot1, bot2);

  await phonePage.getByTestId('setting-mode-agora').click();
  await delay(300);
  await phonePage.getByTestId('start-button').click();
  console.log('sequence: -> [vip selected agora, pressed start]');

  await phonePage.getByTestId('agora-expose-hold').waitFor({ state: 'visible', timeout: 15000 });
  console.log('sequence: -> [AGORA_EXPOSE hold screen shown]');
  const holdText = (await phonePage.getByTestId('agora-expose-hold').textContent())?.trim();
  console.log(`hold screen text: "${holdText}"`);

  const sceneTestIds = ['agora-market', 'agora-stall', 'agora-good', 'agora-animal', 'agora-highlight'];

  for (let round = 0; round < 3; round++) {
    await phonePage.locator('[data-testid="answer-button"]').first().waitFor({ state: 'visible', timeout: 20000 });
    const progress = (await phonePage.getByTestId('agora-question-progress').textContent())?.trim();
    const buttons = phonePage.locator('[data-testid="answer-button"]');
    const buttonCount = await buttons.count();
    const swatchCount = await phonePage.locator('[data-testid="agora-swatch"]').count();
    console.log(`\nround ${round + 1}/3: progress="${progress}" answer-buttons=${buttonCount} swatches=${swatchCount}`);

    // Runtime NO-SCENE check, mid-question, on the phone page.
    let sceneHits = 0;
    for (const testId of sceneTestIds) {
      sceneHits += await phonePage.locator(`[data-testid="${testId}"]`).count();
    }
    console.log(`runtime scene-node check on phone during this question: ${sceneHits} hits (expect 0)`);

    if (swatchCount > 0) {
      console.log('== 2. SWATCHES (colour question) ==');
      for (let i = 0; i < buttonCount; i++) {
        const button = buttons.nth(i);
        const optionText = (await button.textContent())?.trim() ?? '';
        const swatch = button.locator('[data-testid="agora-swatch"]');
        const expectedHex = AGORA_COLOURS.find((c) => optionText.includes(c.nameGr))?.hex ?? null;
        const computedBg = (await swatch.evaluate((el) => getComputedStyle(el).backgroundColor)) as string;
        const expectedRgb = expectedHex ? hexToRgb(expectedHex) : null;
        console.log(
          `  option "${optionText}": expected hex=${expectedHex} (${expectedRgb}) computed background=${computedBg} -> ${
            expectedRgb === computedBg ? 'PASS' : 'FAIL'
          }`,
        );
      }
    }

    await buttons.first().click();
    await phonePage.getByTestId('agora-reveal-verdict').waitFor({ state: 'visible', timeout: 20000 });
    console.log(`round ${round + 1}/3: lock-in confirmed (submits=${capture.submits}, ANSWER_ACCEPTED acks=${capture.acks}) -> personal result shown`);
  }

  await phonePage.getByTestId('gameover-verdict').waitFor({ state: 'visible', timeout: 20000 });
  console.log('\nsequence: -> [GAME_OVER shown on phone]');
  console.log(`total lock-in confirmations this round: submits=${capture.submits}, ANSWER_ACCEPTED acks=${capture.acks} (expect 3 / 3)`);

  await hostPage.close();
  await phonePage.close();
}

async function runQuizRegression(): Promise<void> {
  console.log('\n== 4. REGRESSION (plain quiz round, same build) ==');
  if (!browser) throw new Error('browser not started');
  const hostPage = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await hostPage.goto(`http://localhost:${CLIENT_PORT}/host`);
  await hostPage.getByRole('button', { name: 'Create Room' }).click();
  const codeLocator = hostPage.getByTestId('room-code');
  await codeLocator.waitFor({ state: 'visible', timeout: 15000 });
  const code = ((await codeLocator.textContent()) ?? '').replace(/\s+/g, '');
  console.log(`room ${code} created (quiz is the default mode - no mode change needed)`);

  const phoneContext = await browser.newContext({ viewport: { width: 360, height: 640 } });
  const phonePage = await phoneContext.newPage();
  const phonePlayerId = randomUUID();
  await phoneJoin(phonePage, code, 'Δοκιμή2', phonePlayerId);

  const bot1 = await joinBot('Αργύρης', 'sphinx', code);
  const bot2 = await joinBot('Ελένη', 'medusa', code);
  wireQuizBot(bot1);
  wireQuizBot(bot2);
  sockets.push(bot1, bot2);

  await phonePage.getByTestId('start-button').click();
  // Plain quiz plays STAGE_ANNOUNCE plus up to two Socrates intro lines
  // (GAME_INTRO then STAGE_INTRO) before the first QUESTION, each bounded
  // only by SOCRATES_MAX_DURATION_MS's ~11s backstop - a longer wait than
  // agora's own expose, which has no such intro beat.
  await phonePage.locator('[data-testid="answer-button"]').first().waitFor({ state: 'visible', timeout: 40000 });
  const buttonCount = await phonePage.locator('[data-testid="answer-button"]').count();
  const swatchCount = await phonePage.locator('[data-testid="agora-swatch"]').count();
  console.log(`plain QUESTION: answer-buttons=${buttonCount} (expect 4), agora-swatch nodes=${swatchCount} (expect 0)`);
  await phonePage.locator('[data-testid="answer-button"]').first().click();
  await phonePage.getByTestId('reveal-verdict').waitFor({ state: 'visible', timeout: 20000 });
  console.log('plain REVEAL: reveal-verdict shown - same component/testid as before this task\'s changes');

  await hostPage.close();
  await phonePage.close();
}

async function main() {
  console.log(`starting server dev process on port ${SERVER_PORT}...`);
  serverProc = spawnDetached('npx', ['tsx', 'src/index.ts'], SERVER_DIR, { PORT: String(SERVER_PORT) });
  await waitForServer();

  console.log('starting client dev process...');
  clientProc = spawnDetached('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], CLIENT_DIR, {
    VITE_SERVER_URL: `http://localhost:${SERVER_PORT}`,
  });
  await waitForClient();

  browser = await chromium.launch();

  await runAgoraFlow();
  await runQuizRegression();

  console.log('\ndone');
}

process.on('SIGINT', () => {
  cleanup().finally(() => process.exit(1));
});

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    process.exit(process.exitCode ?? 0);
  });
