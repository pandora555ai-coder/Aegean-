// Task 227 (Fix C) - the phone's DUEL_PICK weapon-choice screen gave no
// hint what beats what. A static text+icon strip was added
// (ControllerScreen.tsx's DUEL_HINT_SEQUENCE/styles.duelHint) showing
// Ξίφος ▸ Δόρυ ▸ Ασπίδα ▸ Ξίφος - shared's own DUEL_BEATS cycle spelled out,
// no server data, no new Socrates line, no audio. Checked here on the
// STANDALONE Η Μονομαχία mode (modes/duel.ts - Task 191's dev harness,
// `?mode=duel` at room creation), the simplest way to get two REAL phones
// both landed on DUEL_PICK as duelists (both connected players are picked
// as the duelists by join order, no bots involved so a real browser can
// read the actual rendered DOM).
//
//   npx tsx dev/duel-hint-check.ts
process.env.PORT = '3913';

import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';

const SERVER_PORT = 3913;
const CLIENT_PORT = 5915;
const ROOT = new URL('..', import.meta.url).pathname;
const CLIENT_DIR = `${ROOT}client`;

let clientProc: ChildProcess | null = null;
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

async function joinPhone(browser: Browser, code: string, name: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 360, height: 640 } });
  const page = await context.newPage();
  await page.goto(`http://localhost:${CLIENT_PORT}/play`);
  await page.getByTestId('code-input').fill(code);
  await page.getByTestId('custom-name-toggle').click();
  await page.getByTestId('custom-name-input').fill(name);
  await page.getByTestId('custom-name-confirm').click();
  await page.getByTestId('avatar-grid').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('[data-testid="avatar-option"]:not([disabled])').first().click();
  await page.getByTestId('join-button').click();
  await page.getByTestId('settings-panel').waitFor({ state: 'visible', timeout: 15000 });
  return page;
}

async function main() {
  await import('../server/src/index.js');
  console.log(`in-process real server listening on ${SERVER_PORT}`);

  clientProc = spawn('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], {
    cwd: CLIENT_DIR,
    stdio: 'ignore',
    detached: true,
    env: { ...process.env, VITE_SERVER_URL: `http://localhost:${SERVER_PORT}` },
  });
  await waitForClient();
  console.log(`client dev server listening on ${CLIENT_PORT}`);

  const browser = await chromium.launch();
  try {
    const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const hostPage = await hostContext.newPage();
    await hostPage.goto(`http://localhost:${CLIENT_PORT}/host?mode=duel`);
    await hostPage.getByRole('button', { name: 'Create Room' }).click();
    const codeLocator = hostPage.getByTestId('room-code');
    await codeLocator.waitFor({ state: 'visible', timeout: 20000 });
    const code = ((await codeLocator.textContent()) ?? '').replace(/\s+/g, '');
    console.log(`room ${code} created in mode=duel`);

    const phoneA = await joinPhone(browser, code, 'Άλφα');
    const phoneB = await joinPhone(browser, code, 'Βήτα');
    await delay(500);

    // Άλφα joined first - VIP.
    await phoneA.getByTestId('start-button').click();

    for (const [label, page] of [['Άλφα', phoneA], ['Βήτα', phoneB]] as const) {
      await page.getByTestId('duel-pick-caption').waitFor({ state: 'visible', timeout: 20000 });

      const hint = page.getByTestId('duel-weapon-hint');
      await hint.waitFor({ state: 'visible', timeout: 5000 });
      const hintText = ((await hint.textContent()) ?? '').replace(/\s+/g, ' ').trim();
      check(`${label}: the weapon hint is present on the duelist's own DUEL_PICK screen`, true, `text: "${hintText}"`);
      // No literal space around ▸ in textContent - flexbox `gap` supplies the
      // visual spacing without inserting a text node.
      check(`${label}: the hint reads the full DUEL_BEATS cycle in order`, hintText === 'Ξίφος▸Δόρυ▸Ασπίδα▸Ξίφος', `got "${hintText}"`);

      const icons = page.locator('[data-testid="duel-weapon-hint"] svg');
      const iconCount = await icons.count();
      check(`${label}: the hint shows 4 weapon symbols (one per sequence entry)`, iconCount === 4, `found ${iconCount}`);

      const options = page.locator('[data-testid="duel-weapon-option"]');
      const optionCount = await options.count();
      check(`${label}: the 3 real weapon-choice slabs are still there (regression)`, optionCount === 3, `found ${optionCount}`);
    }

    await hostContext.close();
    await phoneA.context().close();
    await phoneB.context().close();
  } finally {
    await browser.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
}).finally(() => {
  killGroup(clientProc);
});
