// Task 208 - Η Μνήμη της Αγοράς: TV scene verification. Same shape as
// dev/screenshot-phases.ts (spawn a throwaway server+client dev pair, drive
// real gameplay over real sockets, drive the TV with Playwright) but scoped
// to this one task's four acceptance criteria, with real DOM assertions
// rather than just a screenshot - a dedicated script rather than another
// game wedged into that file's own multi-hour orchestration (the 207
// precedent: dev/agora-wire-check.ts did the same for the server side).
//
// Screenshots land in the SAME directory and filename convention as that
// harness (client/public/dev/shots/<PHASE>.png), so they're served the same
// way, under the same protected /dev prefix - just produced by this
// standalone script instead of being wedged into ALL_PHASES_IN_ORDER.
//
//   npx tsx dev/agora-scene-check.ts
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { io, type Socket } from 'socket.io-client';
import {
  AGORA_COLOURS,
  ClientEvents,
  ServerEvents,
  type AgoraExposeShowPayload,
  type AgoraRenderSpec,
  type AgoraRevealHostPayload,
} from '@game/shared';
import { spawn, type ChildProcess } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const SERVER_DIR = path.join(ROOT, 'server');
const CLIENT_DIR = path.join(ROOT, 'client');
const OUT_DIR = path.join(ROOT, 'client', 'public', 'dev', 'shots');
const SERVER_PORT = 3902; // distinct from screenshot-phases.ts's 3901
const CLIENT_PORT = 5903; // distinct from screenshot-phases.ts's 5902

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

// Answers instantly with choice 0 whenever a question opens - a real
// choice's correctness doesn't matter to any of this script's assertions.
function wireInstantAnswers(socket: Socket): void {
  socket.on(ServerEvents.AGORA_QUESTION_SHOW, (payload: { options?: string[]; answered?: boolean }) => {
    if (!payload.options || payload.answered) return;
    setTimeout(() => socket.emit(ClientEvents.AGORA_SUBMIT, { choice: 0 }), 200);
  });
}

const SANCTIONED_HEXES = new Set(AGORA_COLOURS.map((c) => c.hex));

interface SpecCounts {
  goodsByType: Record<string, number>;
  animals: { dog: boolean; goat: boolean; cat: boolean; geeseN: number };
}

function specCounts(spec: AgoraRenderSpec): SpecCounts {
  const goodsByType: Record<string, number> = { amphorae: 0, fish: 0, cloth: 0, pottery: 0, fruit: 0 };
  for (const stall of spec.stalls) goodsByType[stall.type] = stall.count;
  return { goodsByType, animals: spec.animals };
}

async function domCounts(page: Page): Promise<SpecCounts> {
  const goodsByType: Record<string, number> = {};
  for (const type of ['amphorae', 'fish', 'cloth', 'pottery', 'fruit']) {
    goodsByType[type] = await page.locator(`[data-testid="agora-good"][data-good-type="${type}"]`).count();
  }
  const dog = (await page.locator('[data-testid="agora-animal"][data-kind="dog"]').count()) > 0;
  const goat = (await page.locator('[data-testid="agora-animal"][data-kind="goat"]').count()) > 0;
  const cat = (await page.locator('[data-testid="agora-animal"][data-kind="cat"]').count()) > 0;
  const geeseN = await page.locator('[data-testid="agora-animal"][data-kind="geese"]').count();
  return { goodsByType, animals: { dog, goat, cat, geeseN } };
}

function countsEqual(a: SpecCounts, b: SpecCounts): boolean {
  const typesEqual = ['amphorae', 'fish', 'cloth', 'pottery', 'fruit'].every((t) => a.goodsByType[t] === b.goodsByType[t]);
  return (
    typesEqual &&
    a.animals.dog === b.animals.dog &&
    a.animals.goat === b.animals.goat &&
    a.animals.cat === b.animals.cat &&
    a.animals.geeseN === b.animals.geeseN
  );
}

async function stallHexes(page: Page): Promise<string[]> {
  // The awning's own <path>, the first path child of each [data-testid="agora-stall"] group.
  const stalls = page.locator('[data-testid="agora-stall"]');
  const count = await stalls.count();
  const hexes: string[] = [];
  for (let i = 0; i < count; i++) {
    const fill = await stalls.nth(i).locator('path').first().getAttribute('fill');
    if (fill) hexes.push(fill);
  }
  return hexes;
}

async function screenshotPhase(page: Page, phase: string) {
  const file = path.join(OUT_DIR, `${phase}.png`);
  await page.screenshot({ path: file });
  console.log(`captured ${phase}.png`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

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

  // AGORA_REVEAL_SHOW is asymmetric (Task 207): a PLAYER socket never gets
  // `proof`/`results`, only its own row - so the genuine ground truth for
  // the reveal's proof has to come off the HOST's OWN connection, which is
  // the Playwright page itself, not a raw socket.io-client this script
  // controls directly. Sniffing the page's raw WebSocket frames (Playwright's
  // own `websocket` event, attached before navigation) reads exactly what
  // the TV received, independent of anything AgoraScene does with it -
  // genuinely independent verification, not just "the DOM agrees with
  // itself". Engine.IO/Socket.IO text frames look like `42["event",payload]`
  // (packet type 4 = message, 2 = event), optionally with a namespace prefix
  // before the JSON array.
  const liveReveals: AgoraRevealHostPayload[] = [];
  page.on('websocket', (ws) => {
    ws.on('framereceived', (frame) => {
      if (typeof frame.payload !== 'string') return;
      const match = frame.payload.match(/^\d+(?:\/[^,]*,)?(\[.*\])$/s);
      if (!match) return;
      try {
        const [event, payload] = JSON.parse(match[1]) as [string, unknown];
        if (event === ServerEvents.AGORA_REVEAL_SHOW && payload && typeof payload === 'object' && 'results' in payload) {
          liveReveals.push(payload as AgoraRevealHostPayload);
        }
      } catch {
        // not a JSON socket.io event frame (a ping/pong or similar) - ignore
      }
    });
  });

  await page.goto(`http://localhost:${CLIENT_PORT}/host`);
  await page.getByRole('button', { name: 'Create Room' }).click();
  const codeLocator = page.getByTestId('room-code');
  await codeLocator.waitFor({ state: 'visible', timeout: 15000 });
  const code = ((await codeLocator.textContent()) ?? '').replace(/\s+/g, '');
  console.log(`room ${code} created`);

  const p1 = await joinPlayer(code, 'Αργύρης', 'sphinx');
  const p2 = await joinPlayer(code, 'Ελένη', 'medusa');
  wireInstantAnswers(p1);
  wireInstantAnswers(p2);
  sockets.push(p1, p2);

  // The expose IS symmetric (one shared payload shape, Task 207) - a player
  // socket genuinely sees the same `spec` the TV does, so this one stays a
  // plain socket.io listener.
  let liveSpec: AgoraRenderSpec | null = null;
  p1.on(ServerEvents.AGORA_EXPOSE_SHOW, (payload: AgoraExposeShowPayload) => {
    liveSpec = payload.spec;
  });

  p1.emit(ClientEvents.VIP_SET_MODE, { mode: 'agora' });
  await delay(300);
  p1.emit(ClientEvents.VIP_START_GAME, {});

  // ---------------------------------------------------------------------
  // Criterion 1 - SPEC FIDELITY (the expose shot)
  // ---------------------------------------------------------------------
  await page.waitForSelector('[data-testid="agora-market"]', { timeout: 20000 });
  await delay(400);
  await screenshotPhase(page, 'AGORA_EXPOSE');
  await delay(200); // let liveSpec's own event land
  if (!liveSpec) throw new Error('never observed agora_expose:show on the socket');
  const spec1: AgoraRenderSpec = liveSpec;
  const wireSpec = specCounts(spec1);
  const domSpec = await domCounts(page);
  console.log('\n== 1. SPEC FIDELITY ==');
  for (const type of ['amphorae', 'fish', 'cloth', 'pottery', 'fruit']) {
    console.log(`${type}: spec=${wireSpec.goodsByType[type] ?? 0} dom=${domSpec.goodsByType[type] ?? 0}`);
  }
  console.log(`dog: spec=${wireSpec.animals.dog} dom=${domSpec.animals.dog}`);
  console.log(`goat: spec=${wireSpec.animals.goat} dom=${domSpec.animals.goat}`);
  console.log(`cat: spec=${wireSpec.animals.cat} dom=${domSpec.animals.cat}`);
  console.log(`geese: spec=${wireSpec.animals.geeseN} dom=${domSpec.animals.geeseN}`);
  const countsMatch = countsEqual(wireSpec, domSpec);
  console.log(`counts match 1:1: ${countsMatch ? 'PASS' : 'FAIL'}`);
  const hexes = await stallHexes(page);
  const allSanctioned = hexes.length === 3 && hexes.every((h) => SANCTIONED_HEXES.has(h));
  console.log(`awning fills: [${hexes.join(', ')}] - all in the 5 sanctioned hexes: ${allSanctioned ? 'PASS' : 'FAIL'}`);

  // ---------------------------------------------------------------------
  // Criterion 4 - RECONNECT REDRAW (reload mid-expose, before it ends)
  // ---------------------------------------------------------------------
  const preReloadHexes = hexes;
  const preReloadCounts = domSpec;
  await page.reload();
  await page.waitForSelector('[data-testid="agora-market"]', { timeout: 20000 });
  await delay(300);
  const postReloadCounts = await domCounts(page);
  const postReloadHexes = await stallHexes(page);
  console.log('\n== 4. RECONNECT REDRAW ==');
  console.log(`pre-reload counts: ${JSON.stringify(preReloadCounts)}`);
  console.log(`post-reload counts: ${JSON.stringify(postReloadCounts)}`);
  console.log(`counts identical: ${countsEqual(preReloadCounts, postReloadCounts) ? 'PASS' : 'FAIL'}`);
  console.log(`pre-reload awning hexes: [${preReloadHexes.join(', ')}]`);
  console.log(`post-reload awning hexes: [${postReloadHexes.join(', ')}]`);
  console.log(
    `hexes identical: ${JSON.stringify(preReloadHexes) === JSON.stringify(postReloadHexes) ? 'PASS' : 'FAIL'}`,
  );

  // ---------------------------------------------------------------------
  // Criterion 2 - FAIRNESS (0 market nodes during all 3 AGORA_QUESTIONs)
  //
  // Driven by the server's OWN event stream (already listened to on p1),
  // not by DOM-visibility polling: both bots answer within ~200ms and the
  // reveal's own grid beat is only 1800ms, so a whole round can complete in
  // a couple of seconds - a `page.waitForSelector` re-armed AFTER the fact
  // can miss a question's own brief window entirely if it starts polling
  // even slightly late (observed directly: the very bug this rewrite
  // replaces). Reading the count the instant AGORA_QUESTION_SHOW itself
  // arrives (plus a short settle for the TV to render it) ties the
  // assertion to the actual event, not to guessed timing.
  // ---------------------------------------------------------------------
  console.log('\n== 2. FAIRNESS ==');
  const marketNodeCounts: number[] = [];
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('did not see 3 AGORA_QUESTION_SHOW events in time')), 90000);
    p1.on(ServerEvents.AGORA_QUESTION_SHOW, async (payload: { options?: string[] }) => {
      if (!('options' in payload)) return; // host-shaped payload on a player socket - never sent anyway
      const index = marketNodeCounts.length; // 0-based, before this question's own count is pushed
      await delay(300);
      const n = await page.locator('[data-testid="agora-market"]').count();
      marketNodeCounts.push(n);
      console.log(`question ${index + 1}/3: market-layer nodes visible = ${n}`);
      if (index === 0) await screenshotPhase(page, 'AGORA_QUESTION');
      if (marketNodeCounts.length === 3) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  console.log(`all 3 zero: ${marketNodeCounts.every((n) => n === 0) ? 'PASS' : 'FAIL'}`);

  // ---------------------------------------------------------------------
  // Criterion 3 - PROOF BEAT (this round's 3rd reveal - count/colour kinds
  // always reference something PRESENT, unlike existence's own Q1, which
  // can legitimately ask about something absent and highlight nothing).
  // Same event-driven fix as criterion 2: wait for the 3rd AGORA_REVEAL_SHOW
  // itself (already tracked in `liveReveals`), then a fixed settle PAST
  // AGORA_REVEAL_GRID_MS (HostScreen's own 1800ms grid-beat duration) for
  // the proof stage to be showing, rather than polling for a DOM transition
  // that a fast round can blow straight through.
  // ---------------------------------------------------------------------
  console.log('\n== 3. PROOF BEAT ==');
  // Polled, not event-driven - liveReveals is filled by the websocket frame
  // sniffer above, not a socket.io event listener this script can re-arm.
  for (let waited = 0; liveReveals.length < 3 && waited < 30000; waited += 200) {
    await delay(200);
  }
  if (liveReveals.length < 3) {
    throw new Error(`only observed ${liveReveals.length}/3 host-shaped AGORA_REVEAL_SHOW frames`);
  }
  await delay(300); // let the TV mount AgoraRevealView's own 'grid' stage
  await screenshotPhase(page, 'AGORA_REVEAL');
  await delay(2200); // past AGORA_REVEAL_GRID_MS (1800ms) into the 'proof' stage
  const highlightCount = await page.locator('[data-testid="agora-highlight"]').count();
  const slabDuringProof = await page.locator('[data-testid="agora-reveal-slab"]').count();
  const reveal3 = liveReveals[2];
  console.log(`this round's 3rd reveal subject: ${JSON.stringify(reveal3?.proof.subject)}`);
  console.log(`highlight elements: ${highlightCount} (expect 1 - the subject is always present for kind='${reveal3?.kind}')`);
  console.log(`agora-reveal-slab nodes during proof: ${slabDuringProof} (expect 0)`);
  let highlightOnRightSubject = false;
  if (reveal3 && reveal3.proof.subject.kind === 'stall') {
    const group = page.locator(`[data-testid="agora-stall"][data-type="${reveal3.proof.subject.type}"]`);
    highlightOnRightSubject = (await group.locator('[data-testid="agora-highlight"]').count()) === 1;
  } else if (reveal3 && reveal3.proof.subject.kind === 'animal') {
    const group = page.locator(`[data-testid="agora-animal"][data-kind="${reveal3.proof.subject.animal}"]`);
    highlightOnRightSubject = (await group.locator('[data-testid="agora-highlight"]').count()) >= 1;
  }
  console.log(`highlight positioned on the correct subject: ${highlightOnRightSubject ? 'PASS' : 'FAIL'}`);
  await screenshotPhase(page, 'AGORA_REVEAL_PROOF');
  console.log(
    `criterion 3 overall: ${highlightCount === 1 && slabDuringProof === 0 && highlightOnRightSubject ? 'PASS' : 'FAIL'}`,
  );

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
