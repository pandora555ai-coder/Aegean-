// Task 242 item B, criterion 2's third surface - PodiumView (ΤΕΛΙΚΗ
// ΚΑΤΑΤΑΞΗ), UNCHANGED, verify only. Split out of dev/242-name-clip-check.ts
// so a slow quiz+trial run doesn't share a browser session with the
// earlier (already-passing) duel/climb sections.
//
//   npx tsx dev/242-podium-name-check.ts
process.env.PORT = '3933';

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { io, type Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents, type GameModeId } from '@game/shared';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_DIR = path.join(ROOT, 'client');
const SERVER_PORT = 3933;
const CLIENT_PORT = 5934;
const ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const CLIENT_ORIGIN = `http://127.0.0.1:${CLIENT_PORT}`;

let clientProc: ChildProcess | null = null;
let browser: Browser | null = null;
const sockets: Socket[] = [];
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
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`${CLIENT_ORIGIN}/`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await delay(500);
  }
  throw new Error('client dev server did not come up in time');
}
function pick(n: number): number {
  return Math.floor(Math.random() * n);
}
function wireBotLike(socket: Socket): void {
  const soon = (fn: () => void): void => {
    setTimeout(fn, 100 + Math.random() * 200);
  };
  socket.on(ServerEvents.QUESTION_SHOW, (p: { options?: string[] }) => {
    if (!p.options) return;
    soon(() => socket.emit(ClientEvents.SUBMIT_ANSWER, { choice: pick(p.options!.length) }));
  });
  socket.on(ServerEvents.TRIAL_QUESTION_SHOW, (p: { options?: string[]; onTrial?: boolean }) => {
    if (!p.options || p.onTrial === false) return;
    soon(() => socket.emit(ClientEvents.TRIAL_SUBMIT, { choice: pick(p.options!.length) }));
  });
}
function connect(): Socket {
  const s = io(ORIGIN, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  return s;
}
function waitFor<T = Record<string, unknown>>(socket: Socket, event: string, timeoutMs: number, predicate?: (p: T) => boolean): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for ${event} after ${timeoutMs}ms`));
    }, timeoutMs);
    function handler(p: T): void {
      if (predicate && !predicate(p)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(p);
    }
    socket.on(event, handler);
  });
}
const AVATAR_POOL = ['sphinx', 'minotaur', 'medusa'];
function joinPlayer(code: string, name: string, avatarIndex: number): Promise<Socket> {
  const s = connect();
  wireBotLike(s);
  const joined = waitFor(s, ServerEvents.PLAYER_JOINED, 15000);
  s.emit(ClientEvents.PLAYER_JOIN, { code, name, playerId: randomUUID(), avatarId: AVATAR_POOL[avatarIndex % AVATAR_POOL.length] });
  return joined.then(() => s);
}
async function newTvPage(code: string): Promise<Page> {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript((c: string) => {
    window.localStorage.setItem('hostRoomCode', c);
  }, code);
  await page.goto(`${CLIENT_ORIGIN}/host`);
  await page.waitForSelector('[data-testid="room-code"], [data-testid="sophists-row"]', { timeout: 20000 }).catch(() => {});
  return page;
}

const NAME_4 = 'ΑΒΓΔ';
const NAME_8 = 'ΔΗΜΗΤΡΗΣ';
const NAME_12 = 'ΝΞΟΠΡΣΤΥΦΧΨΩ';

async function main(): Promise<void> {
  console.log('booting in-process server on', SERVER_PORT);
  await import('../server/src/index.js');
  clientProc = spawn('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], {
    cwd: CLIENT_DIR,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, VITE_SERVER_URL: ORIGIN },
  });
  await waitForClient();
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  console.log('client + browser ready\n');

  const host = connect();
  const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
  host.emit(ClientEvents.CREATE_ROOM, { mode: 'quiz' as GameModeId });
  const { code } = await created;
  console.log(`room ${code} created (mode=quiz)`);
  const p1 = await joinPlayer(code, NAME_4, 0);
  await joinPlayer(code, NAME_8, 1);
  await joinPlayer(code, NAME_12, 2);
  const vip = p1;
  const page = await newTvPage(code);
  await Promise.all([
    waitFor(vip, ServerEvents.SETTINGS_UPDATED, 8000),
    (async () => vip.emit(ClientEvents.VIP_UPDATE_SETTINGS, { gameLength: 'short', finaleMode: 'trial' }))(),
  ]);
  vip.emit(ClientEvents.VIP_START_GAME, {});
  console.log('game started (quiz, short, finale=trial)\n');

  await waitFor(host, ServerEvents.GAME_OVER, 240000);
  console.log('GAME_OVER received on host socket - waiting for podium (PODIUM_DELAY_MS + margin)');
  await delay(8000);
  await page.locator('[data-testid="podium-root"]').waitFor({ timeout: 20000 }).catch((e) => console.log('  podium-root wait failed:', e.message));

  const rows: { text: string; scrollWidth: number; clientWidth: number; fontSize: string }[] = [];
  const count = await page.locator('[data-testid="podium-name"]').count();
  console.log(`  podium-name count = ${count}`);
  for (let i = 0; i < count; i++) {
    const el = page.locator('[data-testid="podium-name"]').nth(i);
    const text = (await el.textContent()) ?? '';
    const metrics = await el.evaluate((n) => {
      const e = n as HTMLElement;
      return { scrollWidth: e.scrollWidth, clientWidth: e.clientWidth, fontSize: getComputedStyle(e).fontSize };
    });
    rows.push({ text, ...metrics });
  }
  for (const r of rows) {
    const clipped = r.scrollWidth > r.clientWidth;
    console.log(`  podium-name "${r.text}" fontSize=${r.fontSize} scrollWidth=${r.scrollWidth} clientWidth=${r.clientWidth} clipped=${clipped}`);
  }
  check('podium reached with all 3 names', rows.length === 3, JSON.stringify(rows.map((r) => r.text)));
  check('no podium name clipped at 4/8/12 chars (unchanged, verify only)', rows.length === 3 && rows.every((r) => r.scrollWidth <= r.clientWidth));

  console.log(`\n${passed} passed, ${failed} failed`);
  await page.close();
}

main().then(
  async () => {
    for (const s of sockets) s.disconnect();
    if (browser) await browser.close();
    killGroup(clientProc);
    process.exit(failed > 0 ? 1 : 0);
  },
  async (err) => {
    console.error(err);
    for (const s of sockets) s.disconnect();
    if (browser) await browser.close();
    killGroup(clientProc);
    process.exit(1);
  },
);
