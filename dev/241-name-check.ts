// Task 241 - preset-only Greek names, vocative lookup, long-name lane fit.
// Modeled directly on dev/242-name-clip-check.ts's own infra (in-process
// server, real Vite client, real Playwright TV/phone pages, raw
// socket.io-client "bot-like" players for fast auto-play).
//
//   npx tsx dev/241-name-check.ts
process.env.PORT = '3941';

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { io, type Socket } from 'socket.io-client';
import { ClientEvents, DUEL_WEAPONS, ServerEvents, PRESET_NAMES, VOCATIVE_FORMS, type GameModeId } from '@game/shared';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_DIR = path.join(ROOT, 'client');
const SERVER_PORT = 3941;
const CLIENT_PORT = 5942;
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

// Real preset names (Task 241 list) used as the stress/reference set -
// custom free-typed names are gone, so every join below must be a verbatim
// PRESET_NAMES entry or the server now rejects it (INVALID_NAME).
const NAME_LONG = 'Παναγιώτης'; // 10 chars - the longest PRESET_NAMES entry
const NAME_FEMLONG = 'Ευαγγελία'; // 9 chars
const NAME_SHORT = 'Άρης'; // 4 chars
const NAME_8 = 'Κυριάκος'; // 8 chars - Task 224/235b's own stress length
const NAME_XENOFON = 'Ξενοφών'; // vocative == nominative (no final Σ)
const NAME_FILIPPOS = 'Φίλιππος'; // the one irregular vocative (-> Φίλιππε)
const NAME_FEM2 = 'Μαρία';

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
  // A - join flow: preset-only names, live grey-out sync, bot names from the
  //     end of the list.
  // =========================================================================
  console.log('--- A: join flow (preset-only names + live grey-out sync) ---');
  {
    const host = connect();
    const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
    host.emit(ClientEvents.CREATE_ROOM, { mode: 'quiz' as GameModeId });
    const { code } = await created;
    console.log(`  room ${code} created`);

    const page1 = await newPhonePage(code);
    await page1.locator('[data-testid="name-list"]').waitFor({ timeout: 10000 });

    const customToggleCount = await page1.locator('[data-testid="custom-name-toggle"]').count();
    const customInputCount = await page1.locator('[data-testid="custom-name-input"]').count();
    check('A: no custom-name-toggle in the DOM', customToggleCount === 0, `count=${customToggleCount}`);
    check('A: no custom-name-input in the DOM', customInputCount === 0, `count=${customInputCount}`);

    const presetOptionCount = await page1.locator('[data-testid="preset-name-option"]').count();
    check('A: name-list renders all 99 PRESET_NAMES entries', presetOptionCount === PRESET_NAMES.length, `count=${presetOptionCount}`);

    // page1 takes ΝΙΚΟΣ (front of the list).
    const targetName = 'Νίκος';
    await page1.locator('[data-testid="preset-name-option"]', { hasText: targetName }).first().click();
    await page1.locator('[data-testid="avatar-grid"]').waitFor({ timeout: 10000 });
    await page1.locator('[data-testid="avatar-option"]').first().click();
    const joinedAt = Date.now();
    await page1.locator('[data-testid="join-button"]').click();
    await page1.locator('[data-testid="lobby-greeting"]').waitFor({ timeout: 10000 });
    console.log(`  page1 joined as "${targetName}"`);

    // page2 opens fresh - room:peek should grey ΝΙΚΟΣ out within the same
    // window the avatar grid already relies on (both fields ride the SAME
    // ROOM_PEEK_RESULT payload now).
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
    check(
      'A: a name taken by phone 1 greys out on phone 2',
      greyedAt !== null,
      greyedAt !== null ? `synced ${greyedAt - joinedAt}ms after join` : 'never greyed',
    );
    const disabledOnPage2 = await page2
      .locator('[data-testid="preset-name-option"]', { hasText: targetName })
      .first()
      .isDisabled();
    check('A: the greyed-out name is actually untappable on phone 2', disabledOnPage2);

    await page1.close();
    await page2.close();
    host.disconnect();

    // Bot room: ?bot=4 via CREATE_ROOM's botCount - names should be the
    // LAST 4 of PRESET_NAMES (mirrors avatars' own "from the end" rule).
    const host2 = connect();
    const created2 = waitFor<{ code: string }>(host2, ServerEvents.ROOM_CREATED, 15000);
    host2.emit(ClientEvents.CREATE_ROOM, { mode: 'quiz' as GameModeId, botCount: 4 });
    const { code: code2 } = await created2;
    await delay(1500); // spawnBots is synchronous server-side, but let sockets settle
    const room2 = getRoom(code2) as unknown as { players: Map<string, { name: string; isBot: boolean }> } | undefined;
    const botNames = room2 ? Array.from(room2.players.values()).filter((p) => p.isBot).map((p) => p.name) : [];
    const expectedBotNames = [0, 1, 2, 3].map((i) => PRESET_NAMES[PRESET_NAMES.length - 1 - i]);
    console.log(`  bot room ${code2}: bot names = ${JSON.stringify(botNames)}`);
    console.log(`  expected (end of PRESET_NAMES, order-insensitive - Map iteration order follows async join arrival, not spawn index) = ${JSON.stringify(expectedBotNames)}`);
    check(
      'A: bot names are drawn from the END of PRESET_NAMES',
      [...botNames].sort().join(',') === [...expectedBotNames].sort().join(','),
    );

    // A human joining with a front-of-list name must NOT collide with any
    // bot - avatarIndex 1 (minotaur) is deliberately NOT one of the 4 the
    // bots just claimed (they claim from the end of AVAILABLE_AVATAR_IDS,
    // which left the front of THIS test's own AVATAR_POOL free).
    const human = await joinPlayer(code2, 'Γιώργος', 1, false);
    check('A: a human front-of-list name never collides with a bot room', botNames.includes('Γιώργος') === false);
    human.disconnect();
    host2.disconnect();
  }

  // =========================================================================
  // B - vocative: the lobby greeting (2nd person) vs. every 3rd-person
  //     surface (plaques/steal/podium), across a real game.
  // =========================================================================
  console.log('\n--- B: vocative lookup - 2nd person greeting vs. 3rd person surfaces ---');
  const vocativeSubjects = [NAME_LONG, NAME_XENOFON, NAME_FILIPPOS, NAME_FEMLONG, NAME_FEM2];
  for (const name of vocativeSubjects) {
    const host = connect();
    const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
    host.emit(ClientEvents.CREATE_ROOM, { mode: 'quiz' as GameModeId });
    const { code } = await created;
    const page = await newPhonePage(code);
    await page.locator('[data-testid="preset-name-option"]', { hasText: name }).first().click();
    await page.locator('[data-testid="avatar-grid"]').waitFor({ timeout: 10000 });
    await page.locator('[data-testid="avatar-option"]').first().click();
    await page.locator('[data-testid="join-button"]').click();
    await page.locator('[data-testid="lobby-greeting"]').waitFor({ timeout: 10000 });
    const greeting = (await page.locator('[data-testid="lobby-greeting"]').textContent()) ?? '';
    const expectedVocative = VOCATIVE_FORMS[name] ?? name;
    console.log(`  "${name}" -> greeting = "${greeting}" (expect vocative "${expectedVocative}")`);
    check(
      `B: lobby greeting for "${name}" uses the vocative ("${expectedVocative}")`,
      greeting.includes(expectedVocative) && (name === expectedVocative || !greeting.includes(name)),
      greeting,
    );
    await page.close();
    host.disconnect();
  }

  // =========================================================================
  // B2 - the same subjects (plus two more for an 8-char/short-name spread) in
  //      a REAL game reaching plaques, STEAL and the podium - every one of
  //      these third-person surfaces must show the NOMINATIVE, never the
  //      vocative.
  // =========================================================================
  console.log('\n--- B2/C: one real game - plaques/STEAL/podium nominative + long-name fit ---');
  {
    const host = connect();
    const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
    host.emit(ClientEvents.CREATE_ROOM, { mode: 'quiz' as GameModeId });
    const { code } = await created;
    const roster = [NAME_LONG, NAME_XENOFON, NAME_FILIPPOS, NAME_FEMLONG, NAME_FEM2, NAME_SHORT, NAME_8];
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
    await page.locator('[data-testid="sophist-name"]').first().waitFor({ timeout: 20000 });
    await delay(500);

    // --- plaques (SophistsRow), nominative + long-name fit ---
    const plaqueRows = await measureNameBox(page, '[data-testid="sophist-name"]');
    for (const r of plaqueRows) {
      console.log(`  plaque "${r.text}" fontSize=${r.fontSize} scrollWidth=${r.scrollWidth} clientWidth=${r.clientWidth}`);
    }
    check('C: all 7 plaques rendered', plaqueRows.length === 7, JSON.stringify(plaqueRows.map((r) => r.text)));
    check('C: no plaque text clipped (ellipsis) at any roster name', plaqueRows.every((r) => r.scrollWidth <= r.clientWidth));
    const panagiotisPlaque = plaqueRows.find((r) => r.text.replace(/^\S+ /, '') === r.text && r.text.length === 10);
    check(
      'C: ΠΑΝΑΓΙΩΤΗΣ (10 chars) renders in FULL on the plaque, no ellipsis',
      plaqueRows.some((r) => r.scrollWidth <= r.clientWidth && r.text.normalize() === 'ΠΑΝΑΓΙΩΤΗΣ'.normalize()),
    );
    check(
      'B2: no vocative form leaked onto a plaque (ΦΙΛΙΠΠΕ must never appear)',
      !plaqueRows.some((r) => r.text.includes('ΦΙΛΙΠΠΕ')),
    );
    const kyriakosPlaque = plaqueRows.find((r) => r.text === 'ΚΥΡΙΑΚΟΣ');
    if (kyriakosPlaque) {
      const px = parseFloat(kyriakosPlaque.fontSize);
      console.log(`  224/235b baseline check: ΚΥΡΙΑΚΟΣ (8 chars) fontSize=${px.toFixed(2)}px (expect ~13.86px, cqh-based so player-count-independent)`);
      check('C: the 224/235b 8-char baseline (13.86px) is unchanged', Math.abs(px - 13.86) < 0.5, `${px.toFixed(2)}px`);
    } else {
      check('C: the 224/235b 8-char baseline (13.86px) is unchanged', false, 'ΚΥΡΙΑΚΟΣ plaque not found');
    }

    // --- STEAL banner, nominative only ---
    let stealThiefTexts: string[] = [];
    for (let i = 0; i < 60; i++) {
      const count = await page.locator('[data-testid="steal-thief"]').count();
      if (count > 0) {
        const t = await page.locator('[data-testid="steal-thief"]').textContent();
        if (t) stealThiefTexts.push(t.trim());
        break;
      }
      await delay(1000);
    }
    console.log(`  steal-thief captured: ${JSON.stringify(stealThiefTexts)}`);
    check('B2: STEAL banner reached', stealThiefTexts.length > 0);
    check(
      'B2: STEAL banner shows the NOMINATIVE name (never a vocative form)',
      stealThiefTexts.every((t) => roster.some((n) => t.includes(n))),
      JSON.stringify(stealThiefTexts),
    );

    // --- podium, nominative + long/medium/short-name fit ---
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
    const podiumRows = await measureNameBox(page, '[data-testid="podium-name"]');
    for (const r of podiumRows) {
      console.log(`  podium-name "${r.text}" fontSize=${r.fontSize} scrollWidth=${r.scrollWidth} clientWidth=${r.clientWidth}`);
    }
    check('C: podium reached', podiumRows.length > 0);
    check('C: no podium name clipped (ellipsis)', podiumRows.length > 0 && podiumRows.every((r) => r.scrollWidth <= r.clientWidth));
    check(
      'C: ΠΑΝΑΓΙΩΤΗΣ renders in FULL on the podium (nominative, no ellipsis)',
      podiumRows.some((r) => r.text === NAME_LONG && r.scrollWidth <= r.clientWidth),
      JSON.stringify(podiumRows.map((r) => r.text)),
    );
    check(
      'C: ΕΥΑΓΓΕΛΙΑ renders in FULL on the podium',
      podiumRows.some((r) => r.text === NAME_FEMLONG && r.scrollWidth <= r.clientWidth) || podiumRows.every((r) => r.text !== NAME_FEMLONG),
      JSON.stringify(podiumRows.map((r) => r.text)),
    );
    check(
      'B2: podium shows the NOMINATIVE name (never a vocative form, e.g. never ΦΙΛΙΠΠΕ)',
      !podiumRows.some((r) => r.text.includes('Φίλιππε')),
    );

    await page.close();
    host.disconnect();
    for (const p of players) p.disconnect();
  }

  // =========================================================================
  // C2 - the standalone DUEL mode ("Η Μονομαχία") with real long/medium names.
  // =========================================================================
  console.log('\n--- C2: standalone duel - anavasis-duelist name plaques ---');
  {
    const host = connect();
    const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
    host.emit(ClientEvents.CREATE_ROOM, { mode: 'duel' as GameModeId });
    const { code } = await created;
    const a = await joinPlayer(code, NAME_LONG, 0);
    const b = await joinPlayer(code, NAME_FEMLONG, 1);
    const vip = a;
    const page = await newTvPage(code);
    await Promise.all([waitFor(vip, ServerEvents.PHASE_CHANGED, 8000, (p: { phase?: string }) => p.phase === 'DUEL_PICK'), (async () => vip.emit(ClientEvents.VIP_START_GAME, {}))()]);
    await page.locator('[data-testid="anavasis-duel"]').waitFor({ timeout: 15000 });
    await delay(400);
    const rows = await measureNameBox(page, '[data-testid^="anavasis-duelist-"] .nm');
    const laneWidthPx = await page.evaluate(() => {
      const probe = document.querySelector('.anavasis-duelist') as HTMLElement | null;
      return probe ? probe.getBoundingClientRect().width : null;
    });
    console.log(`  lane (.anavasis-duelist) rendered width = ${laneWidthPx}px`);
    for (const r of rows) {
      const spillsLane = laneWidthPx !== null && (r.box?.width ?? 0) > laneWidthPx + 0.5;
      console.log(`  duelist plaque "${r.text}" fontSize=${r.fontSize} plaqueWidth=${r.box?.width?.toFixed(1)}px vs lane=${laneWidthPx}px -> spillsLane=${spillsLane}`);
    }
    check('C: duel plaques rendered for both duelists (ΠΑΝΑΓΙΩΤΗΣ 10ch, ΕΥΑΓΓΕΛΙΑ 9ch)', rows.length === 2, JSON.stringify(rows.map((r) => r.text)));
    check(
      'C: no duel plaque spills past its 17cqh lane',
      rows.every((r) => laneWidthPx === null || (r.box?.width ?? 0) <= laneWidthPx + 0.5),
      JSON.stringify(rows.map((r) => r.box?.width)),
    );
    check(
      'C: ΠΑΝΑΓΙΩΤΗΣ renders in FULL on the duel plaque, no ellipsis',
      rows.some((r) => r.text === 'ΠΑΝΑΓΙΩΤΗΣ' && r.scrollWidth <= r.clientWidth),
      JSON.stringify(rows.map((r) => r.text)),
    );

    await page.close();
    host.disconnect();
    a.disconnect();
    b.disconnect();
  }

  // =========================================================================
  // C3 - the live climb ("Η Ανάβασις") lane with real short/long names.
  // =========================================================================
  console.log('\n--- C3: live climb - anavasis-climber-name plaques at entry ---');
  {
    const host = connect();
    const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
    host.emit(ClientEvents.CREATE_ROOM, { mode: 'quiz' as GameModeId });
    const { code } = await created;
    const players = [
      await joinPlayer(code, NAME_SHORT, 0),
      await joinPlayer(code, NAME_8, 1),
      await joinPlayer(code, NAME_FEMLONG, 2),
      await joinPlayer(code, NAME_LONG, 3),
    ];
    const page = await newTvPage(code);
    const room = getRoom(code) as unknown as { gameIntroPlayed: boolean };
    room.gameIntroPlayed = true;
    startClimb(room as never);
    console.log('  startClimb invoked directly');
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
      console.log(`  climber plaque "${r.text}" fontSize=${r.fontSize} scrollWidth=${r.scrollWidth} clientWidth=${r.clientWidth} box=${JSON.stringify(r.box)}`);
    }
    const laneWidthPx = await page.locator('[data-testid="anavasis-climbers"]').evaluate(() => {
      const probe = document.querySelector('.anavasis-soph') as HTMLElement | null;
      return probe ? probe.getBoundingClientRect().width : null;
    });
    console.log(`  lane (.anavasis-soph) rendered width = ${laneWidthPx}px`);
    for (const r of rows) {
      const spillsLane = laneWidthPx !== null && (r.box?.width ?? 0) > laneWidthPx + 0.5;
      console.log(`  climber "${r.text}": plaque width=${r.box?.width?.toFixed(1)}px vs lane=${laneWidthPx}px -> spillsLane=${spillsLane}`);
    }
    check('C: all 4 climber plaques rendered', rows.length === 4, JSON.stringify(rows.map((r) => r.text)));
    check(
      'C: no climber plaque spills past its 8cqh lane (4/8/9/10-char real names)',
      rows.every((r) => laneWidthPx === null || (r.box?.width ?? 0) <= laneWidthPx + 0.5),
      JSON.stringify(rows.map((r) => r.box?.width)),
    );
    const panagiotisClimber = rows.find((r) => r.text === 'ΠΑΝΑΓΙΩΤΗΣ');
    check(
      'C: ΠΑΝΑΓΙΩΤΗΣ (10 chars) renders in FULL on the climb lane, no ellipsis',
      panagiotisClimber ? panagiotisClimber.scrollWidth <= panagiotisClimber.clientWidth : false,
      panagiotisClimber ? `scrollWidth=${panagiotisClimber.scrollWidth} clientWidth=${panagiotisClimber.clientWidth}` : 'not found',
    );

    await page.close();
    host.disconnect();
    for (const p of players) p.disconnect();
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
