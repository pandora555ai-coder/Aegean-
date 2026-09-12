// Task 234a/234b - Η Παλαίστρα's acceptance harness (KEPT). 234a's temporary
// server/client instrumentation is NOT - see the note above the usage lines.
//
// Measures Η Παλαίστρα's two reported symptoms with real sockets and a real
// browser, on its own throwaway ports (agora-scene-check.ts's spawn/cleanup
// shape). Captures TWO independent clocks on the same machine:
//   - the SERVER's authoritative remaining timer, sampled once a second,
//     plus every accepted swipe
//   - the TV's COMMITTED countdown value, logged from a useLayoutEffect in
//     HostScreen (the 233a technique - post-commit, never an arrival sample)
//
// NOTE: both of those log streams came from 234a's TEMPORARY instrumentation
// (an env-gated ticker in server/src/index.ts, log lines in modes/blitz.ts, a
// post-commit logger in HostScreen), all removed in 234b. As committed this
// harness drives the three game shapes end to end and captures whatever the
// server and page print; re-adding those log lines is what makes the
// (wall_s, server_s, TV_s) tables reproducible.
//
//   SCENARIO=A npx tsx dev/blitz-timing-check.ts   # ?bot=5&mode=full
//   SCENARIO=B npx tsx dev/blitz-timing-check.ts   # mode=blitz, 5 swipers + 1 UNFINISHED player
//   SCENARIO=C npx tsx dev/blitz-timing-check.ts   # mode=blitz, ALL 6 finish (early end must fire)
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { io, type Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents } from '@game/shared';
import { spawn, type ChildProcess } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const SERVER_DIR = path.join(ROOT, 'server');
const CLIENT_DIR = path.join(ROOT, 'client');
// Overridable so two scenarios can run concurrently on distinct ports.
const SERVER_PORT = Number(process.env.DIAG_SERVER_PORT ?? 3906);
const CLIENT_PORT = Number(process.env.DIAG_CLIENT_PORT ?? 5907);
const SCENARIO = (process.env.SCENARIO ?? 'A').toUpperCase();
const OUT_DIR = process.env.DIAG_OUT ?? '/tmp/claude-0/-root-Aegean-/c7c91142-d110-42ca-b607-bdd3e2c32f97/scratchpad';

let serverProc: ChildProcess | null = null;
let clientProc: ChildProcess | null = null;
let browser: Browser | null = null;
const sockets: Socket[] = [];

const serverLines: string[] = [];
const tvLines: string[] = [];

function spawnDetached(cmd: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): ChildProcess {
  return spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: true, env: { ...process.env, ...env } });
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
  throw new Error(`server did not come up on port ${SERVER_PORT}`);
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
  throw new Error(`client did not come up on port ${CLIENT_PORT}`);
}

function joinPlayer(code: string, name: string, avatarId: string): Promise<{ socket: Socket; playerId: string }> {
  const playerId = randomUUID();
  return new Promise((resolve, reject) => {
    const socket: Socket = io(`http://localhost:${SERVER_PORT}`, { reconnection: false });
    socket.on('connect', () => socket.emit(ClientEvents.PLAYER_JOIN, { code, name, playerId, avatarId }));
    socket.once(ServerEvents.PLAYER_JOINED, () => resolve({ socket, playerId }));
    socket.once(ServerEvents.JOIN_REJECTED, (p) => reject(new Error(`join rejected: ${JSON.stringify(p)}`)));
    socket.once('connect_error', reject);
  });
}

// Scenario B's swipers: `limit` swipes at a human-ish cadence, then silence.
// A swiper with limit < total is exactly the playtest's own case - a phone in
// the room that never reached 12/12.
function wireSwiper(socket: Socket, name: string, limit: number): void {
  socket.on(ServerEvents.BLITZ_SHOW, (payload: { statements?: string[]; total?: number; answeredCount?: number }) => {
    if (!payload.statements) return; // host-shaped, not for this socket
    let nextIndex = payload.answeredCount ?? 0;
    const total = payload.total ?? 0;
    const swipeNext = () => {
      if (nextIndex >= total || nextIndex >= limit) {
        console.log(`[HARNESS] ${name} stopped at ${nextIndex}/${total}`);
        return;
      }
      socket.emit(ClientEvents.BLITZ_SWIPE, { index: nextIndex, answeredTrue: Math.random() < 0.5 });
      nextIndex += 1;
      setTimeout(swipeNext, 400 + Math.random() * 400);
    };
    setTimeout(swipeNext, 400 + Math.random() * 400);
  });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`scenario ${SCENARIO}`);

  console.log(`starting server on ${SERVER_PORT}...`);
  serverProc = spawnDetached('npx', ['tsx', 'src/index.ts'], SERVER_DIR, {
    PORT: String(SERVER_PORT),
  });
  const capture = (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      if (!line.trim()) continue;
      serverLines.push(line);
      if (line.includes('[DIAG]') && !line.includes('server-timer')) console.log(line);
    }
  };
  serverProc.stdout?.on('data', capture);
  serverProc.stderr?.on('data', capture);
  await waitForServer();

  console.log(`starting client on ${CLIENT_PORT}...`);
  clientProc = spawnDetached('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], CLIENT_DIR, {
    VITE_SERVER_URL: `http://localhost:${SERVER_PORT}`,
  });
  clientProc.stdout?.on('data', () => {});
  clientProc.stderr?.on('data', () => {});
  await waitForClient();

  browser = await chromium.launch();
  const page: Page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.startsWith('[TV]')) tvLines.push(text);
  });

  const query = SCENARIO === 'A' ? '?bot=5&mode=full' : '?mode=blitz';
  await page.goto(`http://localhost:${CLIENT_PORT}/host${query}`);
  await page.getByRole('button', { name: 'Create Room' }).click();
  const codeLocator = page.getByTestId('room-code');
  await codeLocator.waitFor({ state: 'visible', timeout: 15000 });
  const code = ((await codeLocator.textContent()) ?? '').replace(/\s+/g, '');
  console.log(`room ${code} created (${query})`);

  if (SCENARIO === 'B' || SCENARIO === 'C') {
    // The VIP joins FIRST (VIP = first player to join). In B it is the one
    // who never finishes - the playtest's own shape; in C everyone finishes,
    // so the completion-based early end must fire.
    const vipLimit = SCENARIO === 'C' ? 12 : 3;
    const vip = await joinPlayer(code, 'Αργύρης', 'sphinx');
    sockets.push(vip.socket);
    wireSwiper(vip.socket, `Αργύρης(VIP,limit=${vipLimit})`, vipLimit);
    const names = ['Ελένη', 'Νίκος', 'Σοφία', 'Δημήτρης', 'Μαρία'];
    const avatars = ['medusa', 'minotaur', 'pegasus', 'cyclops', 'centaur'];
    for (let i = 0; i < names.length; i++) {
      const p = await joinPlayer(code, names[i], avatars[i]);
      sockets.push(p.socket);
      wireSwiper(p.socket, names[i], 12);
    }
    await delay(500);
    vip.socket.emit(ClientEvents.VIP_START_GAME, {});
    console.log('VIP started the game');
  }

  // Wait for the blitz reveal to be broadcast (scenario A must first play
  // through Η Αγορά, ~120s).
  const deadline = Date.now() + (SCENARIO === 'A' ? 420_000 : 90_000);
  while (Date.now() < deadline && !serverLines.some((l) => l.includes('reveal-broadcast'))) {
    await delay(500);
  }
  await delay(3000); // let the reveal's own commits land

  const serverPath = path.join(OUT_DIR, `server-${SCENARIO}.log`);
  const tvPath = path.join(OUT_DIR, `tv-${SCENARIO}.log`);
  writeFileSync(serverPath, serverLines.join('\n'));
  writeFileSync(tvPath, tvLines.join('\n'));
  console.log(`\nwrote ${serverLines.length} server lines -> ${serverPath}`);
  console.log(`wrote ${tvLines.length} TV commit lines -> ${tvPath}`);
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
