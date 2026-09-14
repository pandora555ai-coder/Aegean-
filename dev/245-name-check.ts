// Task 245 - 102 more Greek names (PRESET_NAMES 99 -> 201), vocative table
// fidelity, and the ΞΕΝΟΦΩΝ plaque clip fix. Modeled directly on
// dev/241-name-check.ts's own infra (in-process server, real Vite client,
// real Playwright TV/phone pages, raw socket.io-client "bot-like" players).
//
//   npx tsx dev/245-name-check.ts
process.env.PORT = '3945';

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { io, type Socket } from 'socket.io-client';
import { ClientEvents, DUEL_WEAPONS, ServerEvents, PRESET_NAMES, VOCATIVE_FORMS, type GameModeId } from '@game/shared';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_DIR = path.join(ROOT, 'client');
const SERVER_PORT = 3945;
const CLIENT_PORT = 5946;
const ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const CLIENT_ORIGIN = `http://127.0.0.1:${CLIENT_PORT}`;

let clientProc: ChildProcess | null = null;
let browser: Browser | null = null;
const sockets: Socket[] = [];
let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(label: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  ok   ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    failures.push(label);
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

const PLACEHOLDER_DRAWING =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
function pick(n: number): number {
  return Math.floor(Math.random() * n);
}
function wireBotLike(socket: Socket): void {
  const soon = (fn: () => void): void => {
    setTimeout(fn, 150 + Math.random() * 300);
  };
  socket.on(ServerEvents.QUESTION_SHOW, (p: { options?: string[] }) => {
    if (!p.options) return;
    soon(() => socket.emit(ClientEvents.SUBMIT_ANSWER, { choice: pick(p.options!.length) }));
  });
  socket.on(ServerEvents.TRIAL_QUESTION_SHOW, (p: { options?: string[]; onTrial?: boolean }) => {
    if (!p.options || p.onTrial === false) return;
    soon(() => socket.emit(ClientEvents.TRIAL_SUBMIT, { choice: pick(p.options!.length) }));
  });
  socket.on(ServerEvents.DRAW_SHOW, (p: { wordToDraw?: string }) => {
    if (!p.wordToDraw) return;
    soon(() => socket.emit(ClientEvents.DRAW_SUBMIT, { image: PLACEHOLDER_DRAWING }));
  });
  socket.on(ServerEvents.GUESS_SHOW, (p: { isDrawer?: boolean; options?: string[] }) => {
    if (p.isDrawer === undefined || p.isDrawer || !p.options) return;
    soon(() => socket.emit(ClientEvents.DRAW_GUESS, { choice: pick(p.options!.length) }));
  });
  socket.on(ServerEvents.DUEL_PICK_SHOW, (p: { youDuel?: boolean; picked?: boolean }) => {
    if (!p.youDuel || p.picked) return;
    soon(() => socket.emit(ClientEvents.DUEL_PICK, { weapon: DUEL_WEAPONS[pick(DUEL_WEAPONS.length)] }));
  });
  socket.on(ServerEvents.STEAL_SHOW, (p: { youAreThief?: boolean; targets?: { playerId: string }[]; yourChoice?: unknown }) => {
    if (!p.youAreThief || !p.targets || p.targets.length === 0 || p.yourChoice) return;
    soon(() => socket.emit(ClientEvents.STEAL_CHOOSE, { targetPlayerId: p.targets![pick(p.targets!.length)].playerId }));
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
const AVATAR_POOL = ['sphinx', 'minotaur', 'medusa', 'cyclops', 'pegasus', 'centaur', 'cerberus'];
function joinPlayer(code: string, name: string, avatarIndex: number, botLike = true): Promise<Socket> {
  const s = connect();
  if (botLike) wireBotLike(s);
  const result = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`join for "${name}" neither joined nor rejected within 15000ms`));
    }, 15000);
    function onJoined(): void {
      cleanup();
      resolve();
    }
    function onRejected(p: { reason: string }): void {
      cleanup();
      reject(new Error(`join rejected for "${name}": ${p.reason}`));
    }
    function cleanup(): void {
      clearTimeout(timer);
      s.off(ServerEvents.PLAYER_JOINED, onJoined);
      s.off(ServerEvents.JOIN_REJECTED, onRejected);
    }
    s.on(ServerEvents.PLAYER_JOINED, onJoined);
    s.on(ServerEvents.JOIN_REJECTED, onRejected);
  });
  s.emit(ClientEvents.PLAYER_JOIN, { code, name, playerId: randomUUID(), avatarId: AVATAR_POOL[avatarIndex % AVATAR_POOL.length] });
  return result.then(() => s);
}

async function newTvPage(code: string): Promise<Page> {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript((c: string) => {
    window.localStorage.setItem('hostRoomCode', c);
  }, code);
  await page.goto(`${CLIENT_ORIGIN}/host`);
  await page
    .waitForSelector('[data-testid="room-code"], [data-testid="anavasis-scene"], [data-testid="sophists-row"]', { timeout: 20000 })
    .catch(() => {});
  return page;
}
async function newPhonePage(code: string): Promise<Page> {
  const page = await browser!.newPage({ viewport: { width: 360, height: 640 } });
  await page.goto(`${CLIENT_ORIGIN}/play?room=${code}`);
  await page.waitForSelector('[data-testid="name-list"], [data-testid="join-preview"]', { timeout: 15000 }).catch(() => {});
  return page;
}

type Box = { x: number; y: number; width: number; height: number } | null;
async function measureNameBox(
  page: Page,
  selector: string,
): Promise<{ text: string; box: Box; scrollWidth: number; clientWidth: number; fontSize: string }[]> {
  const locator = page.locator(selector);
  const count = await locator.count();
  const out: { text: string; box: Box; scrollWidth: number; clientWidth: number; fontSize: string }[] = [];
  for (let i = 0; i < count; i++) {
    const el = locator.nth(i);
    const text = (await el.textContent()) ?? '';
    const box = (await el.boundingBox().catch(() => null)) as Box;
    const metrics = await el.evaluate((n) => {
      const e = n as HTMLElement;
      return { scrollWidth: e.scrollWidth, clientWidth: e.clientWidth, fontSize: getComputedStyle(e).fontSize };
    });
    out.push({ text, box, ...metrics });
  }
  return out;
}

// The stress names for criterion 3.
const NAME_XENOFON = 'Ξενοφών'; // 7 chars, 6 wide glyphs - the clip repro
const NAME_KYRIAKOS = 'Κυριάκος'; // 8 chars - the 224/235b pinned baseline (13.86px)
const NAME_PANAGIOTIS = 'Παναγιώτης'; // 10 chars - the 224/235b pinned baseline (11.088px full)
const NAME_CHARALAMPOS = 'Χαράλαμπος'; // 10 chars, new stress name
const NAME_TERPSICHORI = 'Τερψιχόρη'; // 9 chars, new stress name

async function main(): Promise<void> {
  console.log('booting in-process server on', SERVER_PORT);
  await import('../server/src/index.js');
  const { getRoom } = await import('../server/src/state.js');
  const { startClimb } = await import('../server/src/phases.js');

  clientProc = spawn('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], {
    cwd: CLIENT_DIR,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, VITE_SERVER_URL: ORIGIN },
  });
  await waitForClient();
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  console.log('client + browser ready\n');

  // =========================================================================
  // 1 - PRESET_NAMES / VOCATIVE_FORMS shape (also verified by script earlier,
  //     re-confirmed here against the live shared module the server/client
  //     actually import).
  // =========================================================================
  console.log('--- 1: PRESET_NAMES / VOCATIVE_FORMS shape ---');
  check('1: PRESET_NAMES length is 201', PRESET_NAMES.length === 201, `${PRESET_NAMES.length}`);
  const dupSet = new Set<string>();
  const dups: string[] = [];
  for (const n of PRESET_NAMES) {
    if (dupSet.has(n)) dups.push(n);
    dupSet.add(n);
  }
  check('1: zero duplicates in PRESET_NAMES', dups.length === 0, JSON.stringify(dups));
  check('1: VOCATIVE_FORMS has 201 entries', Object.keys(VOCATIVE_FORMS).length === 201, `${Object.keys(VOCATIVE_FORMS).length}`);
  const missingVocative = PRESET_NAMES.filter((n) => !(n in VOCATIVE_FORMS));
  check('1: every PRESET_NAMES entry has a VOCATIVE_FORMS entry', missingVocative.length === 0, JSON.stringify(missingVocative));

  // =========================================================================
  // 3 - ΞΕΝΟΦΩΝ plaque fix + pinned baselines + new stress names, across
  //     four surfaces: plaques, duel, climb lane, podium.
  // =========================================================================
  console.log('\n--- 3a: plaques (SophistsRow) - ΞΕΝΟΦΩΝ fix + baselines + stress names ---');
  {
    const host = connect();
    const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
    host.emit(ClientEvents.CREATE_ROOM, { mode: 'quiz' as GameModeId });
    const { code } = await created;
    const roster = [NAME_XENOFON, NAME_KYRIAKOS, NAME_PANAGIOTIS, NAME_CHARALAMPOS, NAME_TERPSICHORI];
    const players: Socket[] = [];
    for (let i = 0; i < roster.length; i++) players.push(await joinPlayer(code, roster[i], i));
    const page = await newTvPage(code);
    await page.locator('[data-testid="sophist-name"]').first().waitFor({ timeout: 15000 });
    await delay(400);
    const rows = await measureNameBox(page, '[data-testid="sophist-name"]');
    for (const r of rows) {
      const clipped = r.scrollWidth > r.clientWidth;
      console.log(`  plaque "${r.text}" fontSize=${r.fontSize} scrollWidth=${r.scrollWidth} clientWidth=${r.clientWidth} clipped=${clipped}`);
    }
    check('3a: all 5 plaques rendered', rows.length === 5, JSON.stringify(rows.map((r) => r.text)));
    check('3a: no plaque clipped (scrollWidth <= clientWidth) at any of the 5 names', rows.every((r) => r.scrollWidth <= r.clientWidth));
    const xenofon = rows.find((r) => r.text === 'ΞΕΝΟΦΩΝ');
    check(
      '3a: ΞΕΝΟΦΩΝ renders full text, no ellipsis',
      xenofon ? xenofon.scrollWidth <= xenofon.clientWidth : false,
      xenofon ? `scrollWidth=${xenofon.scrollWidth} clientWidth=${xenofon.clientWidth} fontSize=${xenofon.fontSize}` : 'not found',
    );
    const kyriakos = rows.find((r) => r.text === 'ΚΥΡΙΑΚΟΣ');
    if (kyriakos) {
      const px = parseFloat(kyriakos.fontSize);
      check('3a: ΚΥΡΙΑΚΟΣ (8 chars) baseline unchanged at 13.86px', Math.abs(px - 13.86) < 0.5, `${px.toFixed(3)}px`);
    } else {
      check('3a: ΚΥΡΙΑΚΟΣ (8 chars) baseline unchanged at 13.86px', false, 'plaque not found');
    }
    const panagiotis = rows.find((r) => r.text === 'ΠΑΝΑΓΙΩΤΗΣ');
    if (panagiotis) {
      const px = parseFloat(panagiotis.fontSize);
      check(
        '3a: ΠΑΝΑΓΙΩΤΗΣ (10 chars) baseline unchanged at 11.088px, full text',
        Math.abs(px - 11.088) < 0.5 && panagiotis.scrollWidth <= panagiotis.clientWidth,
        `${px.toFixed(3)}px scrollWidth=${panagiotis.scrollWidth} clientWidth=${panagiotis.clientWidth}`,
      );
    } else {
      check('3a: ΠΑΝΑΓΙΩΤΗΣ (10 chars) baseline unchanged at 11.088px, full text', false, 'plaque not found');
    }
    const charalampos = rows.find((r) => r.text === 'ΧΑΡΑΛΑΜΠΟΣ');
    check(
      '3a: ΧΑΡΑΛΑΜΠΟΣ full text, no ellipsis',
      charalampos ? charalampos.scrollWidth <= charalampos.clientWidth : false,
      charalampos ? `len=${charalampos.text.length} scrollWidth=${charalampos.scrollWidth} clientWidth=${charalampos.clientWidth}` : 'not found',
    );
    const terpsichori = rows.find((r) => r.text === 'ΤΕΡΨΙΧΟΡΗ');
    check(
      '3a: ΤΕΡΨΙΧΟΡΗ full text, no ellipsis',
      terpsichori ? terpsichori.scrollWidth <= terpsichori.clientWidth : false,
      terpsichori ? `len=${terpsichori.text.length} scrollWidth=${terpsichori.scrollWidth} clientWidth=${terpsichori.clientWidth}` : 'not found',
    );

    await page.close();
    host.disconnect();
    for (const p of players) p.disconnect();
  }

  console.log('\n--- 3b: standalone duel - anavasis-duelist plaques ---');
  {
    const host = connect();
    const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
    host.emit(ClientEvents.CREATE_ROOM, { mode: 'duel' as GameModeId });
    const { code } = await created;
    const a = await joinPlayer(code, NAME_XENOFON, 0);
    const b = await joinPlayer(code, NAME_CHARALAMPOS, 1);
    const vip = a;
    const page = await newTvPage(code);
    await Promise.all([waitFor(vip, ServerEvents.PHASE_CHANGED, 8000, (p: { phase?: string }) => p.phase === 'DUEL_PICK'), (async () => vip.emit(ClientEvents.VIP_START_GAME, {}))()]);
    await page.locator('[data-testid="anavasis-duel"]').waitFor({ timeout: 15000 });
    await delay(400);
    const rows = await measureNameBox(page, '[data-testid^="anavasis-duelist-"] .nm');
    for (const r of rows) {
      console.log(`  duelist plaque "${r.text}" fontSize=${r.fontSize} scrollWidth=${r.scrollWidth} clientWidth=${r.clientWidth}`);
    }
    check('3b: duel plaques rendered for both duelists (ΞΕΝΟΦΩΝ, ΧΑΡΑΛΑΜΠΟΣ)', rows.length === 2, JSON.stringify(rows.map((r) => r.text)));
    check('3b: no duel plaque clipped', rows.every((r) => r.scrollWidth <= r.clientWidth));
    await page.close();
    host.disconnect();
    a.disconnect();
    b.disconnect();
  }

  console.log('\n--- 3c: live climb lane - anavasis-climber-name plaques ---');
  {
    const host = connect();
    const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
    host.emit(ClientEvents.CREATE_ROOM, { mode: 'quiz' as GameModeId });
    const { code } = await created;
    const players = [
      await joinPlayer(code, NAME_XENOFON, 0),
      await joinPlayer(code, NAME_KYRIAKOS, 1),
      await joinPlayer(code, NAME_CHARALAMPOS, 2),
      await joinPlayer(code, NAME_TERPSICHORI, 3),
    ];
    const page = await newTvPage(code);
    const room = getRoom(code) as unknown as { gameIntroPlayed: boolean };
    room.gameIntroPlayed = true;
    startClimb(room as never);
    const vip = players[0];
    for (let i = 0; i < 20; i++) {
      vip.emit(ClientEvents.VIP_SKIP_SOCRATES, {});
      if ((await page.locator('[data-testid="anavasis-climber-name"]').count()) > 0) break;
      await delay(700);
    }
    await page.locator('[data-testid="anavasis-climber-name"]').first().waitFor({ timeout: 15000 });
    await delay(500);
    const rows = await measureNameBox(page, '[data-testid="anavasis-climber-name"]');
    for (const r of rows) {
      console.log(`  climber plaque "${r.text}" fontSize=${r.fontSize} scrollWidth=${r.scrollWidth} clientWidth=${r.clientWidth}`);
    }
    check('3c: all 4 climber plaques rendered', rows.length === 4, JSON.stringify(rows.map((r) => r.text)));
    check('3c: no climber plaque clipped', rows.every((r) => r.scrollWidth <= r.clientWidth));
    await page.close();
    host.disconnect();
    for (const p of players) p.disconnect();
  }

  console.log('\n--- 3d: podium - ΤΕΛΙΚΗ ΚΑΤΑΤΑΞΗ names ---');
  {
    const host = connect();
    const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
    host.emit(ClientEvents.CREATE_ROOM, { mode: 'quiz' as GameModeId });
    const { code } = await created;
    const roster = [NAME_XENOFON, NAME_KYRIAKOS, NAME_CHARALAMPOS, NAME_TERPSICHORI];
    const players: Socket[] = [];
    for (let i = 0; i < roster.length; i++) players.push(await joinPlayer(code, roster[i], i));
    const vip = players[0];
    await Promise.all([
      waitFor(vip, ServerEvents.SETTINGS_UPDATED, 8000),
      (async () => vip.emit(ClientEvents.VIP_UPDATE_SETTINGS, { gameLength: 'short', finaleMode: 'trial' }))(),
    ]);
    vip.emit(ClientEvents.VIP_START_GAME, {});
    console.log(`  game started, roster = ${JSON.stringify(roster)}`);
    const page = await newTvPage(code);
    let overNow = false;
    const deadline = Date.now() + 240000;
    while (!overNow && Date.now() < deadline) {
      await delay(1000);
      overNow = (await page.locator('[data-testid="podium-root"]').count()) > 0;
      if (!overNow) overNow = (await page.locator('[data-testid="gameover-root"]').count()) > 0;
    }
    if (!(await page.locator('[data-testid="podium-root"]').count())) {
      await delay(7000);
    }
    await page.locator('[data-testid="podium-root"]').waitFor({ timeout: 15000 }).catch(() => {});
    const rows = await measureNameBox(page, '[data-testid="podium-name"]');
    for (const r of rows) {
      console.log(`  podium-name "${r.text}" fontSize=${r.fontSize} scrollWidth=${r.scrollWidth} clientWidth=${r.clientWidth}`);
    }
    check('3d: podium reached', rows.length > 0);
    check('3d: no podium name clipped', rows.length > 0 && rows.every((r) => r.scrollWidth <= r.clientWidth));
    await page.close();
    host.disconnect();
    for (const p of players) p.disconnect();
  }

  // =========================================================================
  // 4 - inverse: two phones join from the NEW name block, grey-out sync,
  //     bot claim from the end (now ΧΡΥΣΑΝΘΗ backwards), zero collisions,
  //     lobby greeting vocative for a new -Ε name.
  // =========================================================================
  console.log('\n--- 4: inverse - new-block names, grey-out sync, bots from end, vocative greeting ---');
  {
    const host = connect();
    const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
    host.emit(ClientEvents.CREATE_ROOM, { mode: 'quiz' as GameModeId });
    const { code } = await created;
    console.log(`  room ${code} created`);

    const targetName = 'Χριστίνα'; // new-block name
    const page1 = await newPhonePage(code);
    await page1.locator('[data-testid="name-list"]').waitFor({ timeout: 10000 });
    const presetOptionCount = await page1.locator('[data-testid="preset-name-option"]').count();
    check('4: name-list renders all 201 PRESET_NAMES entries', presetOptionCount === PRESET_NAMES.length, `count=${presetOptionCount}`);
    await page1.locator('[data-testid="preset-name-option"]', { hasText: targetName }).first().click();
    await page1.locator('[data-testid="avatar-grid"]').waitFor({ timeout: 10000 });
    await page1.locator('[data-testid="avatar-option"]').first().click();
    const joinedAt = Date.now();
    await page1.locator('[data-testid="join-button"]').click();
    await page1.locator('[data-testid="lobby-greeting"]').waitFor({ timeout: 10000 });
    console.log(`  page1 joined as "${targetName}"`);

    const page2 = await newPhonePage(code);
    await page2.locator('[data-testid="name-list"]').waitFor({ timeout: 10000 });
    let greyedAt: number | null = null;
    for (let i = 0; i < 20; i++) {
      const takenAttr = await page2
        .locator('[data-testid="preset-name-option"]', { hasText: targetName })
        .first()
        .getAttribute('data-taken');
      if (takenAttr === 'true') {
        greyedAt = Date.now();
        break;
      }
      await delay(150);
    }
    check('4: a new-block name taken by phone 1 greys out on phone 2', greyedAt !== null, greyedAt !== null ? `synced ${greyedAt - joinedAt}ms after join` : 'never greyed');

    // page2 picks the vocative-tricky Αλέξανδρος (-> Αλέξανδρε, proparoxytone -Ε).
    const targetName2 = 'Αλέξανδρος';
    await page2.locator('[data-testid="preset-name-option"]', { hasText: targetName2 }).first().click();
    await page2.locator('[data-testid="avatar-grid"]').waitFor({ timeout: 10000 });
    await page2.locator('[data-testid="avatar-option"]:not([disabled])').first().click();
    await page2.locator('[data-testid="join-button"]').click();
    await page2.locator('[data-testid="lobby-greeting"]').waitFor({ timeout: 10000 });
    const greeting = (await page2.locator('[data-testid="lobby-greeting"]').textContent()) ?? '';
    console.log(`  page2 joined as "${targetName2}" -> greeting = "${greeting}"`);
    check('4: lobby greeting for Αλέξανδρος uses the vocative "Αλέξανδρε"', greeting.includes('Αλέξανδρε') && !greeting.includes('Αλέξανδρος'), greeting);

    const tvPage = await newTvPage(code);
    await tvPage.locator('[data-testid="sophist-name"]').first().waitFor({ timeout: 15000 });
    await delay(300);
    const plaqueTexts = (await tvPage.locator('[data-testid="sophist-name"]').allTextContents()).map((t) => t.trim());
    console.log(`  plaques show: ${JSON.stringify(plaqueTexts)}`);
    check('4: plaque shows the NOMINATIVE (ΑΛΕΞΑΝΔΡΟΣ), never the vocative', plaqueTexts.some((t) => t === 'ΑΛΕΞΑΝΔΡΟΣ') && !plaqueTexts.some((t) => t.includes('ΑΛΕΞΑΝΔΡΕ')), JSON.stringify(plaqueTexts));

    await page1.close();
    await page2.close();
    await tvPage.close();
    host.disconnect();

    // Bot room: bot names should be the LAST N of the new, 201-long PRESET_NAMES.
    const host2 = connect();
    const created2 = waitFor<{ code: string }>(host2, ServerEvents.ROOM_CREATED, 15000);
    host2.emit(ClientEvents.CREATE_ROOM, { mode: 'quiz' as GameModeId, botCount: 4 });
    const { code: code2 } = await created2;
    await delay(1500);
    const room2 = getRoom(code2) as unknown as { players: Map<string, { name: string; isBot: boolean }> } | undefined;
    const botNames = room2 ? Array.from(room2.players.values()).filter((p) => p.isBot).map((p) => p.name) : [];
    const expectedBotNames = [0, 1, 2, 3].map((i) => PRESET_NAMES[PRESET_NAMES.length - 1 - i]);
    console.log(`  bot room ${code2}: bot names = ${JSON.stringify(botNames)}`);
    console.log(`  expected (end of the new 201-long PRESET_NAMES, i.e. ΧΡΥΣΑΝΘΗ backwards) = ${JSON.stringify(expectedBotNames)}`);
    check('4: bot names are drawn from the END of the new 201-long PRESET_NAMES (ΧΡΥΣΑΝΘΗ backwards)', [...botNames].sort().join(',') === [...expectedBotNames].sort().join(','));
    check('4: last PRESET_NAMES entry is Χρυσάνθη', PRESET_NAMES[PRESET_NAMES.length - 1] === 'Χρυσάνθη', PRESET_NAMES[PRESET_NAMES.length - 1]);

    const human = await joinPlayer(code2, 'Νίκος', 1, false);
    check('4: zero collisions - a human front-of-list name never collides with a bot room', botNames.includes('Νίκος') === false, JSON.stringify(botNames));
    human.disconnect();
    host2.disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length > 0) for (const f of failures) console.log(`  failed: ${f}`);
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
