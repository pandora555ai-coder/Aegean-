// Task 210 - Η Μνήμη της Αγοράς: "the market frame belongs to the market."
// TV-only verification (no server/shared/phone changes this task) that the
// sophists row hides during AGORA_EXPOSE and the AGORA_REVEAL proof beat,
// stays visible (with a live lock-in ticker) during AGORA_QUESTION, and that
// the krater/timer is unaffected either way. Same spawn/cleanup shape as
// dev/agora-scene-check.ts (Task 208), its own throwaway ports.
//
//   npx tsx dev/agora-sophists-check.ts
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { io, type Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents } from '@game/shared';
import { spawn, type ChildProcess } from 'node:child_process';

const SERVER_PORT = 3903; // distinct from 207's 4001/207's own wire-check, 208's 3902
const CLIENT_PORT = 5904; // distinct from 208's 5903
const SERVER_DIR = new URL('../server', import.meta.url).pathname;
const CLIENT_DIR = new URL('../client', import.meta.url).pathname;

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

function joinPlayer(code: string, name: string, avatarId: string): Promise<Socket> {
  const playerId = randomUUID();
  return new Promise((resolve, reject) => {
    const socket: Socket = io(`http://localhost:${SERVER_PORT}`, { reconnection: false });
    socket.on('connect', () => socket.emit(ClientEvents.PLAYER_JOIN, { code, name, playerId, avatarId }));
    socket.once(ServerEvents.PLAYER_JOINED, () => resolve(socket));
    socket.once(ServerEvents.JOIN_REJECTED, (p) => reject(new Error(`join rejected: ${JSON.stringify(p)}`)));
    socket.once('connect_error', reject);
  });
}

// Deliberately staggered - p1 answers almost at once, p2 waits - so the
// lock-in ticker has a genuine BEFORE/AFTER to observe (criterion 2).
function wireStaggeredAnswers(socket: Socket, delayMs: number): void {
  socket.on(ServerEvents.AGORA_QUESTION_SHOW, (payload: { options?: string[]; answered?: boolean }) => {
    if (!payload.options || payload.answered) return;
    setTimeout(() => socket.emit(ClientEvents.AGORA_SUBMIT, { choice: 0 }), delayMs);
  });
}

async function rowState(page: Page): Promise<{ hidden: boolean; opacity: string; figureCount: number; visibleFigureCount: number }> {
  const row = page.locator('[data-testid="sophists-row"]');
  const hiddenAttr = await row.getAttribute('data-hidden');
  const opacity = await row.evaluate((el) => getComputedStyle(el).opacity);
  const figures = page.locator('[data-testid="sophist"]');
  const figureCount = await figures.count();
  // "Visible" here means genuinely showing, not just present in the DOM -
  // the existing hide treatment is opacity on the ROW (CLAUDE.md: the row is
  // ALWAYS mounted, never unmounted, so its own reorder tween survives a
  // phase change), not on each figure - `getComputedStyle` reports an
  // element's OWN opacity property, not the ancestor-multiplied rendered
  // one, so the row's own opacity gates everything below it here; each
  // figure's OWN opacity is checked too, to still catch an individually
  // eliminated (.out) figure the way a real viewer would see it.
  const rowOpaque = parseFloat(opacity) > 0;
  let visibleFigureCount = 0;
  if (rowOpaque) {
    for (let i = 0; i < figureCount; i++) {
      const op = await figures.nth(i).evaluate((el) => getComputedStyle(el).opacity);
      if (parseFloat(op) > 0) visibleFigureCount += 1;
    }
  }
  return { hidden: hiddenAttr === 'true', opacity, figureCount, visibleFigureCount };
}

async function lockedInNames(page: Page): Promise<string[]> {
  const texts = await page.locator('[data-testid="sophist-name"]').allTextContents();
  return texts.filter((t) => t.startsWith('🔒'));
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
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.goto(`http://localhost:${CLIENT_PORT}/host`);
  await page.getByRole('button', { name: 'Create Room' }).click();
  const codeLocator = page.getByTestId('room-code');
  await codeLocator.waitFor({ state: 'visible', timeout: 15000 });
  const code = ((await codeLocator.textContent()) ?? '').replace(/\s+/g, '');
  console.log(`room ${code} created`);

  const p1 = await joinPlayer(code, 'Αργύρης', 'sphinx');
  const p2 = await joinPlayer(code, 'Ελένη', 'medusa');
  wireStaggeredAnswers(p1, 900);
  wireStaggeredAnswers(p2, 3200);
  sockets.push(p1, p2);

  p1.emit(ClientEvents.VIP_SET_MODE, { mode: 'agora' });
  await delay(300);
  p1.emit(ClientEvents.VIP_START_GAME, {});

  // -----------------------------------------------------------------------
  // Criterion 1 - EXPOSE
  // -----------------------------------------------------------------------
  await page.waitForSelector('[data-testid="agora-market"]', { timeout: 20000 });
  await delay(400);
  console.log('\n== 1. EXPOSE ==');
  const exposeRow = await rowState(page);
  const kraterDuringExpose = await page.locator('[data-testid="krater-corner"]').count();
  console.log(`sophists-row data-hidden=${exposeRow.hidden}, computed opacity=${exposeRow.opacity}`);
  console.log(`player-figure nodes visible (opacity > 0): ${exposeRow.visibleFigureCount} of ${exposeRow.figureCount} total`);
  console.log(`krater-corner nodes present: ${kraterDuringExpose}`);
  console.log(`criterion 1: ${exposeRow.visibleFigureCount === 0 && kraterDuringExpose === 1 ? 'PASS' : 'FAIL'}`);

  // -----------------------------------------------------------------------
  // Criterion 2 - QUESTION (figures visible, lock-in ticker moves)
  // -----------------------------------------------------------------------
  console.log('\n== 2. QUESTION ==');
  await page.waitForSelector('[data-testid="agora-question-slab"]', { timeout: 20000 });
  await delay(200); // well before p1's own 900ms answer lands
  const beforeLock = await lockedInNames(page);
  const questionRow = await rowState(page);
  console.log(`sophists-row data-hidden=${questionRow.hidden}, computed opacity=${questionRow.opacity}`);
  console.log(`player-figure nodes visible: ${questionRow.visibleFigureCount} of ${questionRow.figureCount} total`);
  console.log(`locked-in names ~200ms in (before either answers): [${beforeLock.join(', ')}]`);
  await delay(1300); // past p1's 900ms answer, well before p2's 3200ms one
  const afterP1 = await lockedInNames(page);
  console.log(`locked-in names ~1500ms in (after Αργύρης answers): [${afterP1.join(', ')}]`);
  const lockInMoved = afterP1.length > beforeLock.length;
  console.log(`observed lock-in change: ${beforeLock.length} -> ${afterP1.length} locked in - ${lockInMoved ? 'PASS' : 'FAIL'}`);
  console.log(`figures visible during QUESTION: ${questionRow.visibleFigureCount === questionRow.figureCount && !questionRow.hidden ? 'PASS' : 'FAIL'}`);
  await delay(2200); // let p2 answer so this question resolves before criterion 3

  // -----------------------------------------------------------------------
  // Criterion 3 - REVEAL proof (hidden during proof, visible again after)
  // -----------------------------------------------------------------------
  console.log('\n== 3. REVEAL ==');
  await page.waitForSelector('[data-testid="agora-reveal-slab"]', { timeout: 15000 });
  await delay(2200); // past AGORA_REVEAL_GRID_MS (1800ms) into the proof stage
  const proofRow = await rowState(page);
  console.log(`during proof: sophists-row data-hidden=${proofRow.hidden}, opacity=${proofRow.opacity}, visible figures=${proofRow.visibleFigureCount}/${proofRow.figureCount}`);
  console.log(`criterion 3a (hidden during proof): ${proofRow.visibleFigureCount === 0 ? 'PASS' : 'FAIL'}`);

  // Past the proof, the round either starts a new AGORA_QUESTION or reaches
  // GAME_OVER (this run's 2-question... no, always 3 questions - whichever
  // comes next, the row should be visible again either way).
  await page.waitForFunction(
    () => {
      const row = document.querySelector('[data-testid="sophists-row"]');
      return row && getComputedStyle(row).opacity !== '0';
    },
    { timeout: 15000 },
  );
  await delay(200);
  const afterProofRow = await rowState(page);
  console.log(`after proof ends: sophists-row data-hidden=${afterProofRow.hidden}, opacity=${afterProofRow.opacity}, visible figures=${afterProofRow.visibleFigureCount}/${afterProofRow.figureCount}`);
  console.log(`criterion 3b (visible again after proof): ${afterProofRow.visibleFigureCount > 0 && !afterProofRow.hidden ? 'PASS' : 'FAIL'}`);

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
