// Task 242 item B - "the arena" name clipping. Real in-process server, one
// real Vite client, real TV Playwright pages (HOST_REJOIN'd into a room a
// raw socket created - duel-overlay-check.ts's own pattern, since only a
// human-held socket can be VIP and a bots-only room self-starts, Task 217).
// Player roster is raw socket.io-client connections with CONTROLLED names
// (4/8/11 chars) - no server bots, so nothing else picks names for us.
//
//   npx tsx dev/242-name-clip-check.ts
process.env.PORT = '3932';

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { io, type Socket } from 'socket.io-client';
import { ClientEvents, DUEL_WEAPONS, ServerEvents, type GameModeId } from '@game/shared';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_DIR = path.join(ROOT, 'client');
const SERVER_PORT = 3932;
const CLIENT_PORT = 5933;
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
  // Task 258 - Η Δίκη is gone; answering the climb's questions is what keeps
  // a game short now (all climbers locked in ends the round at once).
  socket.on(ServerEvents.CLIMB_QUESTION_SHOW, (p: { options?: string[]; climbing?: boolean; eliminated?: boolean }) => {
    if (!p.options || p.climbing === false || p.eliminated) return;
    soon(() => socket.emit(ClientEvents.CLIMB_SUBMIT, { choice: pick(p.options!.length) }));
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
  await page
    .waitForSelector('[data-testid="room-code"], [data-testid="anavasis-scene"], [data-testid="sophists-row"]', { timeout: 20000 })
    .catch(() => {});
  return page;
}

// Short / medium / long names for the clip checks - the plaque and the podium
// render them through greekUpper, so what is measured is the uppercased form.
// Task 258: these were synthetic width-test strings (ΑΒΓΔ / ΔΗΜΗΤΡΗΣ /
// ΝΞΟΠΡΣΤΥΦΧΨΩ), rejected by isValidPlayerName since Tasks 241/245 made names
// PRESET-ONLY - every join here failed with INVALID_NAME. Real presets now,
// same short/medium/long spread. No preset is 12 characters (Κωνσταντίνα, at
// 11, is the longest), so the long case is 11, not 12.
const NAME_4 = 'Άρης';
const NAME_8 = 'Δημήτρης';
const NAME_12 = 'Κωνσταντίνα';

// Every on-screen plaque/podium row renders its name through greekUpper,
// which uppercases AND drops the tonos ('Δημήτρης' -> 'ΔΗΜΗΤΡΗΣ'). The name
// constants above are preset names in their natural case, so comparing DOM
// text to them directly never matches - and plain toUpperCase() keeps the
// tonos ('ΔΗΜΉΤΡΗΣ'), so it doesn't match either. Fold both away before
// comparing. (Before Task 258 these constants were already-uppercase
// synthetic strings, which is why a bare === used to work.)
function foldName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

type Box = { x: number; y: number; width: number; height: number } | null;

async function measureNameBox(
  page: Page,
  selector: string,
  filterText?: string,
): Promise<{ text: string; box: Box; scrollWidth: number; clientWidth: number; fontSize: string }[]> {
  const locator = filterText ? page.locator(selector).filter({ hasText: filterText }) : page.locator(selector);
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
  // 0 - baseline: plaques (SophistsRow), quick re-confirm at 4/8/11 chars.
  // =========================================================================
  console.log('--- 0: plaques (SophistsRow) baseline, quiz mode ---');
  {
    const host = connect();
    const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
    host.emit(ClientEvents.CREATE_ROOM, { mode: 'quiz' as GameModeId });
    const { code } = await created;
    const p1 = await joinPlayer(code, NAME_4, 0);
    const p2 = await joinPlayer(code, NAME_8, 1);
    const p3 = await joinPlayer(code, NAME_12, 2);
    void p2;
    void p3;
    const page = await newTvPage(code);
    await page.locator('[data-testid="sophist-name"]').first().waitFor({ timeout: 15000 });
    await delay(300);
    const rows = await measureNameBox(page, '[data-testid="sophist-name"]');
    for (const r of rows) {
      const clipped = r.scrollWidth > r.clientWidth;
      console.log(`  plaque "${r.text}" fontSize=${r.fontSize} scrollWidth=${r.scrollWidth} clientWidth=${r.clientWidth} clipped=${clipped}`);
    }
    check('0: plaques - no name clipped at 4/8/11 chars', rows.every((r) => r.scrollWidth <= r.clientWidth));
    await page.close();
    host.disconnect();
    p1.disconnect();
    p2.disconnect();
    p3.disconnect();
  }

  // =========================================================================
  // 1 - the standalone DUEL mode ("Η Μονομαχία") - a real candidate for
  // "the arena": two combatants, face to face, at the temple.
  // =========================================================================
  console.log('\n--- 1: standalone duel mode - anavasis-duelist name plaques ---');
  {
    const host = connect();
    const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
    host.emit(ClientEvents.CREATE_ROOM, { mode: 'duel' as GameModeId });
    const { code } = await created;
    console.log(`  room ${code} created (mode=duel)`);
    const a = await joinPlayer(code, NAME_8, 0);
    const b = await joinPlayer(code, NAME_12, 1);
    const vip = a;
    const page = await newTvPage(code);
    await Promise.all([waitFor(vip, ServerEvents.PHASE_CHANGED, 8000, (p: { phase?: string }) => p.phase === 'DUEL_PICK'), (async () => vip.emit(ClientEvents.VIP_START_GAME, {}))()]);
    await page.locator('[data-testid="anavasis-duel"]').waitFor({ timeout: 15000 });
    await delay(400);
    const rows = await measureNameBox(page, '[data-testid^="anavasis-duelist-"] .nm');
    // Lane check: `.anavasis-duelist` is a FIXED 17cqh column; `.nm` has NO
    // overflow-hidden anywhere in its CSS (unlike SophistsRow's `.plaque
    // .n`), so scrollWidth===clientWidth always here by construction - the
    // real question is whether the rendered plaque OUTGROWS its own lane.
    const laneWidthPx = await page.evaluate(() => {
      const probe = document.querySelector('.anavasis-duelist') as HTMLElement | null;
      return probe ? probe.getBoundingClientRect().width : null;
    });
    console.log(`  lane (.anavasis-duelist) rendered width = ${laneWidthPx}px`);
    for (const r of rows) {
      const spillsLane = laneWidthPx !== null && (r.box?.width ?? 0) > laneWidthPx + 0.5;
      const ellipsisClipped = r.scrollWidth > r.clientWidth;
      console.log(
        `  duelist plaque "${r.text}" fontSize=${r.fontSize} plaqueWidth=${r.box?.width?.toFixed(1)}px vs lane=${laneWidthPx}px -> spillsLane=${spillsLane} ellipsisClipped=${ellipsisClipped}`,
      );
    }
    check('1: duel plaques rendered for both duelists (8 and 12 char names)', rows.length === 2, JSON.stringify(rows.map((r) => r.text)));
    check(
      '1: no duel plaque spills past its 17cqh lane after the shrink fix (8 and 12 char names)',
      rows.every((r) => laneWidthPx === null || (r.box?.width ?? 0) <= laneWidthPx + 0.5),
      JSON.stringify(rows.map((r) => r.box?.width)),
    );
    check(
      '1: the 8-char name (ΔΗΜΗΤΡΗΣ) fits WITHOUT needing the ellipsis backstop',
      rows[0] ? rows[0].scrollWidth <= rows[0].clientWidth : false,
      `scrollWidth=${rows[0]?.scrollWidth} clientWidth=${rows[0]?.clientWidth}`,
    );

    await waitFor(vip, ServerEvents.SOCRATES_BEAT, 20000).catch(() => {});
    await page.close();
    host.disconnect();
    a.disconnect();
    b.disconnect();
  }

  // =========================================================================
  // 2 - the LIVE climb ("Η Ανάβασις") - direct startClimb invocation
  // (podium-subtitle-followup-check.ts's own pattern) with a controlled
  // 4-player roster at 4/8/8/12 chars, sampled at CLIMB_QUESTION entry.
  // =========================================================================
  console.log('\n--- 2: live climb - anavasis-climber-name plaques at entry ---');
  {
    const host = connect();
    const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
    host.emit(ClientEvents.CREATE_ROOM, { mode: 'quiz' as GameModeId });
    const { code } = await created;
    const players = [
      await joinPlayer(code, NAME_4, 0),
      await joinPlayer(code, NAME_8, 1),
      // Task 258 - was 'ΝΙΚΟΛΑΟΣ', not a preset, so this join was rejected and
      // the harness died here on a player:joined timeout. Κυριάκος is a real
      // preset and still a SECOND 8-char name distinct from Δημήτρης, which
      // is all this slot needs.
      await joinPlayer(code, 'Κυριάκος', 2),
      await joinPlayer(code, NAME_12, 3),
    ];
    const page = await newTvPage(code);
    const room = getRoom(code) as unknown as { gameIntroPlayed: boolean };
    room.gameIntroPlayed = true;
    startClimb(room as never);
    console.log('  startClimb invoked directly');
    // startClimb enters its own STAGE_ANNOUNCE + STAGE_INTRO Socrates beat
    // first (CLAUDE.md's own documented behaviour) - AnavasisScene doesn't
    // mount until a real climb payload lands, so skip through via the VIP's
    // own socket (players[0]) until CLIMB_QUESTION actually shows.
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
    // Lane width: `.anavasis-soph` is a fixed 8cqh column - measure the
    // plaque's rendered width against it directly (px, off the SAME box).
    const laneWidthPx = await page.locator('[data-testid="anavasis-climbers"]').evaluate(() => {
      const probe = document.querySelector('.anavasis-soph') as HTMLElement | null;
      return probe ? probe.getBoundingClientRect().width : null;
    });
    console.log(`  lane (.anavasis-soph) rendered width = ${laneWidthPx}px`);
    for (const r of rows) {
      const spillsLane = laneWidthPx !== null && (r.box?.width ?? 0) > laneWidthPx + 0.5;
      const ellipsisClipped = r.scrollWidth > r.clientWidth;
      console.log(`  climber "${r.text}": plaque width=${r.box?.width?.toFixed(1)}px vs lane=${laneWidthPx}px -> spillsLane=${spillsLane} ellipsisClipped=${ellipsisClipped}`);
    }
    check('2: all 4 climber plaques rendered', rows.length === 4, JSON.stringify(rows.map((r) => r.text)));
    check(
      '2: no climber plaque spills past its 8cqh lane after the shrink fix (4/8/8/12 char names)',
      rows.every((r) => laneWidthPx === null || (r.box?.width ?? 0) <= laneWidthPx + 0.5),
      JSON.stringify(rows.map((r) => r.box?.width)),
    );
    const dimitris = rows.find((r) => foldName(r.text) === foldName(NAME_8));
    check(
      '2: the 8-char name (ΔΗΜΗΤΡΗΣ) fits WITHOUT needing the ellipsis backstop',
      dimitris ? dimitris.scrollWidth <= dimitris.clientWidth : false,
      `scrollWidth=${dimitris?.scrollWidth} clientWidth=${dimitris?.clientWidth}`,
    );

    await page.close();
    host.disconnect();
    for (const p of players) p.disconnect();
  }

  // =========================================================================
  // 3 - finale/ΤΕΛΙΚΗ ΚΑΤΑΤΑΞΗ (PodiumView) - UNCHANGED, verify only. Fast
  // quiz game (gameLength=short; Task 258 - the finale is Η Ανάβασις, kept
  // short by the sims answering its questions), bot-like automation,
  // controlled 4/8/11-char names.
  // =========================================================================
  console.log('\n--- 3: PodiumView (ΤΕΛΙΚΗ ΚΑΤΑΤΑΞΗ) - verify only, unchanged ---');
  {
    const host = connect();
    const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
    host.emit(ClientEvents.CREATE_ROOM, { mode: 'quiz' as GameModeId });
    const { code } = await created;
    const p1 = await joinPlayer(code, NAME_4, 0);
    const p2 = await joinPlayer(code, NAME_8, 1);
    const p3 = await joinPlayer(code, NAME_12, 2);
    const vip = p1;
    const page = await newTvPage(code);
    await Promise.all([
      waitFor(vip, ServerEvents.SETTINGS_UPDATED, 8000),
      (async () => vip.emit(ClientEvents.VIP_UPDATE_SETTINGS, { gameLength: 'short' }))(),
    ]);
    vip.emit(ClientEvents.VIP_START_GAME, {});
    console.log('  game started (quiz, short, finale=Η Ανάβασις)');
    let overNow = false;
    // Task 258 - was 180000. Η Ανάβασις is the finale now, and with THREE
    // players the spear rule is inert (CLIMB_SPEAR_MIN_PLAYERS = 4), so the
    // race usually runs to its 24-round cap instead of an early arrival.
    const deadline = Date.now() + 600000;
    while (!overNow && Date.now() < deadline) {
      await delay(1000);
      overNow = (await page.locator('[data-testid="podium-root"]').count()) > 0;
      if (!overNow) overNow = (await page.locator('[data-testid="gameover-root"]').count()) > 0;
    }
    if (!(await page.locator('[data-testid="podium-root"]').count())) {
      await delay(7000); // PODIUM_DELAY_MS + margin
    }
    await page.locator('[data-testid="podium-root"]').waitFor({ timeout: 15000 }).catch(() => {});
    const rows = await measureNameBox(page, '[data-testid="podium-name"]');
    for (const r of rows) {
      const clipped = r.scrollWidth > r.clientWidth;
      console.log(`  podium-name "${r.text}" fontSize=${r.fontSize} scrollWidth=${r.scrollWidth} clientWidth=${r.clientWidth} clipped=${clipped}`);
    }
    check('3: podium reached', rows.length > 0);
    check('3: no podium name clipped at 4/8/11 chars (unchanged, verify only)', rows.length > 0 && rows.every((r) => r.scrollWidth <= r.clientWidth));

    await page.close();
    host.disconnect();
    p1.disconnect();
    p2.disconnect();
    p3.disconnect();
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
