// Task 322 - post-game buttons on the TV and the phones. In-process server
// (throwaway port), real Vite, real TV + two real phone pages. Standalone duel
// mode reaches GAME_OVER fastest. Selection by data-testid only.
//   A  TV: buttons after the podium, first autofocused, ArrowRight/Enter works
//      ("same players" -> lobby, same players), both disable after a press.
//   B  VIP phone shows two buttons, other phone shows "Αποφασίζει: <VIP>".
//   C  second game; VIP phone "Νέο παιχνίδι" -> TV new code, old phones closed
//      message styled like the landing page.
//   npx tsx dev/322-end-buttons-check.ts
process.env.PORT = process.env.SERVER_PORT ?? '3935';
process.env.POST_GAME_IDLE_MS_DEV = '900000';

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { io, type Socket } from 'socket.io-client';
import { chromium, type Browser, type Page } from 'playwright';
import { AVATAR_CATALOGUE, ClientEvents, PRESET_NAMES, ServerEvents } from '@game/shared';

const SERVER_PORT = Number(process.env.PORT);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? '5936');
const ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const CLIENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'client');
const say = (t: string): void => console.log(t);
let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail: string): void {
  if (ok) passed++;
  else failed++;
  say(`  ${ok ? 'ok  ' : 'FAIL'} ${label} — ${detail}`);
}
async function waitFor(pred: () => boolean | Promise<boolean>, timeoutMs: number, stepMs = 200): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await pred()) return true;
    await delay(stepMs);
  }
  return pred();
}

let clientProc: ChildProcess | null = null;
let browser: Browser | null = null;
const sockets: Socket[] = [];
async function cleanup(): Promise<void> {
  for (const s of sockets) s.disconnect();
  if (browser) await browser.close().catch(() => {});
  if (clientProc?.pid !== undefined) {
    try {
      process.kill(-clientProc.pid, 'SIGTERM');
    } catch {
      // gone
    }
  }
}

async function openPhone(code: string, name: string, avatarId: string, playerId: string): Promise<Page> {
  const page = await browser!.newPage({ viewport: { width: 360, height: 640 } });
  await page.goto(`http://localhost:${CLIENT_PORT}/play`);
  await page.evaluate(
    ([s, id]) => {
      localStorage.setItem('playerId', id);
      localStorage.setItem('lastSession', s);
    },
    [JSON.stringify({ code, name, avatarId }), playerId] as const,
  );
  await page.reload();
  return page;
}

async function main(): Promise<void> {
  await import('../server/src/index.js');
  const { getRoom } = await import('../server/src/state.js');
  clientProc = spawn('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], {
    cwd: CLIENT_DIR,
    stdio: 'ignore',
    detached: true,
    env: { ...process.env, VITE_SERVER_URL: `http://localhost:${SERVER_PORT}` },
  });
  if (!(await waitFor(async () => { try { return (await fetch(`http://localhost:${CLIENT_PORT}/`)).ok; } catch { return false; } }, 30000, 500))) throw new Error('vite down');
  browser = await chromium.launch();
  const avatars = AVATAR_CATALOGUE.map((a) => a.id);

  const tv = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await tv.goto(`http://localhost:${CLIENT_PORT}/host?mode=duel`);
  await tv.getByTestId('audio-gate').click();
  await tv.getByTestId('create-room').click();
  await tv.getByTestId('room-code').waitFor({ timeout: 15000 });
  const code1 = (await tv.getByTestId('room-code').innerText()).replace(/\D/g, '');
  const room1 = getRoom(code1)!;
  const vipId = randomUUID();
  const otherId = randomUUID();
  const vipName = PRESET_NAMES[0];
  const vipPhone = await openPhone(code1, vipName, avatars[0], vipId);
  await waitFor(() => room1.players.has(vipId), 15000);
  const otherPhone = await openPhone(code1, PRESET_NAMES[1], avatars[1], otherId);
  await waitFor(() => room1.players.has(otherId), 15000);
  say(`room ${code1}: mode ${room1.mode}, vip ${room1.vipPlayerId === vipId}`);

  async function playToPodium(): Promise<boolean> {
    await vipPhone.getByTestId('start-button').click({ timeout: 15000 });
    return tv.getByTestId('podium-root').waitFor({ timeout: 180000 }).then(() => true, () => false);
  }

  say('--- A/B: TV + phones at the end ---');
  const gotPodium = await playToPodium();
  check('A: podium reached', gotPodium, `phase ${room1.phase}`);
  const actionsAppearedAfterPodium = await tv.getByTestId('tv-play-again').isVisible();
  check('A: both TV buttons present with testids', actionsAppearedAfterPodium && (await tv.getByTestId('tv-new-game').isVisible()), 'tv-play-again, tv-new-game');
  const labels = [await tv.getByTestId('tv-play-again').innerText(), await tv.getByTestId('tv-new-game').innerText()];
  check('A: labels', labels[0] === 'Ξανά, ίδια παρέα' && labels[1] === 'Νέο παιχνίδι', labels.join(' | '));
  check('A: decider line', (await tv.getByTestId('tv-decider').innerText()) === `Αποφασίζει: ${vipName}`, await tv.getByTestId('tv-decider').innerText());
  const focusId = () => tv.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);
  check('A: first button autofocused', (await focusId()) === 'tv-play-again', String(await focusId()));
  await tv.keyboard.press('ArrowRight');
  check('A: ArrowRight moves focus', (await focusId()) === 'tv-new-game', String(await focusId()));
  await tv.keyboard.press('ArrowLeft');
  check('A: ArrowLeft moves back', (await focusId()) === 'tv-play-again', String(await focusId()));
  await tv.keyboard.press('Tab');
  check('A: Tab moves focus', (await focusId()) === 'tv-new-game', String(await focusId()));
  await tv.keyboard.press('Shift+Tab');

  // B: phones
  const vipBtns = [await vipPhone.getByTestId('play-again-button').innerText(), await vipPhone.getByTestId('new-game-button').innerText()];
  check('B: VIP phone two buttons', vipBtns[0] === 'Ξανά, ίδια παρέα' && vipBtns[1] === 'Νέο παιχνίδι', vipBtns.join(' | '));
  const otherText = await otherPhone.getByTestId('waiting-for-play-again').innerText();
  check('B: other phone decider', otherText === `Αποφασίζει: ${vipName}`, otherText);
  check('B: other phone has no buttons', (await otherPhone.getByTestId('play-again-button').count()) + (await otherPhone.getByTestId('new-game-button').count()) === 0, '0 nodes');

  // A: Enter on the focused TV button = same players
  await tv.keyboard.press('Enter');
  const lobbyBack = await waitFor(() => room1.phase === 'LOBBY', 10000);
  check('A: Enter -> same room back in LOBBY', lobbyBack && getRoom(code1) === room1, `phase ${room1.phase}`);
  check('A: same players kept', room1.players.has(vipId) && room1.players.has(otherId) && room1.players.size === 2, `players ${room1.players.size}`);
  check('A: TV shows lobby again', await tv.getByTestId('room-code').waitFor({ timeout: 10000 }).then(() => true, () => false), 'room-code visible');
  check('A: same code', (await tv.getByTestId('room-code').innerText()).replace(/\D/g, '') === code1, code1);

  // second game, test disabling + new game from the VIP phone
  say('--- C: game 2, VIP phone new game ---');
  const got2 = await playToPodium();
  check('C: game 2 podium', got2, `phase ${room1.phase}`);
  await vipPhone.getByTestId('new-game-button').click();
  const dis = await waitFor(async () => (await tv.getByTestId('podium-root').count()) === 0 || (await tv.getByTestId('tv-new-game').isDisabled().catch(() => true)), 5000);
  check('C: TV buttons gone/disabled after a press', dis, 'ok');
  const codeChanged = await waitFor(async () => {
    const t = await tv.getByTestId('room-code').innerText().catch(() => '');
    const c = t.replace(/\D/g, '');
    return c.length === 4 && c !== code1;
  }, 15000);
  const code2 = (await tv.getByTestId('room-code').innerText().catch(() => '')).replace(/\D/g, '');
  check('C: TV shows a new room code', codeChanged || code2 !== code1, `${code1} -> ${code2}`);
  const closed = otherPhone.getByTestId('room-closed');
  check('C: other phone closed message', await closed.waitFor({ timeout: 10000 }).then(() => true, () => false), await closed.innerText().catch(() => 'absent'));
  check('C: VIP phone closed message', await vipPhone.getByTestId('room-closed').waitFor({ timeout: 10000 }).then(() => true, () => false), 'visible');
  const style = await closed.evaluate((el) => {
    const cs = getComputedStyle(el);
    const root = el.parentElement!; const titleEl = [...root.querySelectorAll('div')].filter((d) => d.textContent === 'Αιγαίον').at(-1)!;
    return { color: cs.color, bg: getComputedStyle(root).backgroundColor, title: root.querySelector('div')?.textContent ?? '', titleFont: getComputedStyle(titleEl).fontFamily };
  });
  const land = await browser.newPage({ viewport: { width: 360, height: 640 } });
  await land.goto(`http://localhost:${CLIENT_PORT}/`);
  const landStyle = await land.evaluate(() => {
    const t = [...document.querySelectorAll('div')].find((d) => d.textContent === 'Αιγαίον' && d.children.length === 0)!;
    return { color: getComputedStyle(t).color, bg: getComputedStyle(t.parentElement!.parentElement!).backgroundColor, font: getComputedStyle(t).fontFamily };
  });
  check('C: closed screen title "Αιγαίον"', style.title.includes('Αιγαίον'), style.title);
  check('C: text colour = landing marble', style.color === landStyle.color, `${style.color} vs ${landStyle.color}`);
  check('C: background = landing night', style.bg === landStyle.bg, `${style.bg} vs ${landStyle.bg}`);
  check('C: title font = landing', style.titleFont === landStyle.font, `closed=${style.titleFont} landing=${landStyle.font}`);

  say(`\n${passed} passed, ${failed} failed`);
  await cleanup();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await cleanup();
  process.exit(1);
});
