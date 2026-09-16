// Task 239 follow-up - targeted re-checks for the three findings from
// dev/end-state-timer-subtitles-check.ts's first full run:
//
//   A. "zero digits in the podium" FAILED with 31 digit matches. Hypothesis:
//      PodiumView's own <style>{STYLE_TAG}</style> is a CHILD of podium-root,
//      and .textContent() on an element includes a descendant <style> tag's
//      raw CSS text (all those cqh/rem numbers) - unlike .innerText(), which
//      reflects only what's actually rendered. Verified here with a FAST
//      standalone quiz+trial game (not full+climb) so the fix can be
//      confirmed in ~1-2 minutes instead of re-running the full ~23 minute
//      two-game harness.
//   B. "stage card and subtitle overlap" FAILED, box {x:0,y:36,w:1280,h:648}
//      for EVERY sample - that's `.stage-announce-root`'s own full-viewport
//      POSITIONING WRAPPER (pointer-events:none, transparent outside its
//      centred children), not the visible title/tagline block. Verified here
//      against `[data-testid="stage-announce"] > div` (the actual content
//      wrapper) instead.
//   C. "one Ανάβασις rule line" not found among 19 captured beats (of 34
//      total) - a capture-race in the full-game harness (its polling loop
//      only samples a beat's subtitle text right as it's ABOUT to skip it).
//      Verified here by invoking startClimb directly (Task 238's own
//      dev/socrates-pacing-check.ts pattern) and sampling each of the three
//      announce beats with a proper settle delay before skipping.
//
//   npx tsx dev/podium-subtitle-followup-check.ts
process.env.PORT = '3922';

import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';

const SERVER_PORT = 3922;
const CLIENT_PORT = 5923;
const ROOT = new URL('..', import.meta.url).pathname;
const CLIENT_DIR = `${ROOT}client`;

let clientProc: ChildProcess | null = null;
let browser: Browser | null = null;
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
      const res = await fetch(`http://localhost:${CLIENT_PORT}/`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await delay(500);
  }
  throw new Error('client dev server did not come up in time');
}

async function drivePhoneQuick(page: Page, stop: { stopped: boolean }): Promise<void> {
  const answeredKeys = new Set<string>();
  while (!stop.stopped) {
    try {
      const answerBtn = page.locator('[data-testid="answer-button"]:not([disabled])').first();
      if ((await answerBtn.count()) > 0) {
        const key = (await page.locator('[data-testid="answer-button"]').allTextContents()).join('|');
        if (!answeredKeys.has(key)) {
          answeredKeys.add(key);
          await answerBtn.click({ timeout: 1500 }).catch(() => {});
        }
      }
      const skipBtn = page.locator('[data-testid="continue-button"], [data-testid="socrates-skip-button"]').first();
      if ((await skipBtn.count()) > 0 && !(await skipBtn.isDisabled().catch(() => true))) {
        await skipBtn.click({ timeout: 1200 }).catch(() => {});
      }
    } catch {
      // retry
    }
    await delay(150);
  }
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
    env: { ...process.env, VITE_SERVER_URL: `http://localhost:${SERVER_PORT}` },
  });
  await waitForClient();
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  console.log('client + browser ready\n');

  // =========================================================================
  // C - the Ανάβασις announce, direct invocation (fast, no full game needed).
  // =========================================================================
  console.log('--- C: Ανάβασις announce subtitle + corrected overlap check ---');
  {
    const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const tvPage = await tvCtx.newPage();
    await tvPage.goto(`http://localhost:${CLIENT_PORT}/host?mode=full`);
    await tvPage.getByRole('button', { name: 'Create Room' }).click();
    const code = ((await tvPage.getByTestId('room-code').textContent({ timeout: 15000 })) ?? '').replace(/\s+/g, '');
    console.log(`room ${code} created`);

    // Two CONNECTED players so startClimb has a real roster to seed entry
    // steps/climberIds from - closing these pages would disconnect them,
    // and an empty/disconnected-only roster risks breaking climb math this
    // check doesn't care about testing. SEPARATE contexts, one per phone
    // (Task 238's own lesson, re-learned the hard way in this file's first
    // draft): two pages sharing ONE context's localStorage collide on
    // identity - the second "reconnects" as the first and the join screen
    // (custom-name-toggle) never appears, hanging for its full 30s timeout.
    const playerCtxs: Awaited<ReturnType<typeof browser.newContext>>[] = [];
    // Task 255 - the custom-name toggle/input/confirm flow was deleted in
    // Task 241; joining is now preset-name-list -> avatar-grid -> join-button.
    for (const name of ['Άρης', 'Νίκη']) {
      const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
      playerCtxs.push(ctx);
      const p = await ctx.newPage();
      await p.addInitScript((id: string) => localStorage.setItem('playerId', id), randomUUID());
      await p.goto(`http://localhost:${CLIENT_PORT}/play`);
      await p.getByTestId('code-input').fill(code);
      await p.getByTestId('name-list').waitFor({ state: 'visible', timeout: 15000 });
      await p.locator('[data-testid="preset-name-option"]', { hasText: name }).first().click();
      await p.getByTestId('avatar-grid').waitFor({ state: 'visible', timeout: 15000 });
      await p.locator('[data-testid="avatar-option"]:not([disabled])').first().click();
      await p.getByTestId('join-button').click();
      await p.getByTestId('settings-panel').waitFor({ state: 'visible', timeout: 15000 });
    }
    console.log('two players joined (kept connected)');

    const room = getRoom(code) as unknown as { gameIntroPlayed: boolean; code: string; phase: string };
    room.gameIntroPlayed = true; // Task 237's own requirement for a direct startClimb call
    startClimb(room as never);
    console.log('startClimb invoked directly\n');

    const results: Array<{ label: string; domText: string | null; cardBox: unknown; subBox: unknown; overlap: boolean }> = [];
    for (let i = 0; i < 3; i++) {
      // Let the beat's socrates:show land and React commit, THEN sample -
      // no skip race this time.
      await tvPage.locator('[data-testid="socrates-subtitle"]').waitFor({ timeout: 20000 }).catch(() => {});
      await delay(400);
      const domText = await tvPage.locator('[data-testid="socrates-subtitle"]').textContent().catch(() => null);
      // The FIX: the actual content wrapper, not stage-announce's own
      // full-viewport positioning root.
      const cardBox = await tvPage.locator('[data-testid="stage-announce"] > div').boundingBox().catch(() => null);
      const subBox = await tvPage.locator('[data-testid="socrates-subtitle"]').boundingBox().catch(() => null);
      const overlap =
        !!cardBox && !!subBox &&
        (cardBox as { x: number; y: number; width: number; height: number }).x < (subBox as { x: number }).x + (subBox as { width: number }).width &&
        (cardBox as { x: number; width: number }).x + (cardBox as { width: number }).width > (subBox as { x: number }).x &&
        (cardBox as { y: number; height: number }).y < (subBox as { y: number }).y + (subBox as { height: number }).height &&
        (cardBox as { y: number; height: number }).y + (cardBox as { height: number }).height > (subBox as { y: number }).y;
      results.push({ label: `beat ${i + 1}`, domText, cardBox, subBox, overlap });
      console.log(`  beat ${i + 1}: dom="${domText}"`);
      console.log(`    card(content)=${JSON.stringify(cardBox)}`);
      console.log(`    subtitle=${JSON.stringify(subBox)}`);
      console.log(`    overlap=${overlap}`);
      // No VIP phone here (none needed for this direct-invocation check) -
      // just wait out the beat's own natural ack/backstop before sampling
      // the next one.
      await delay(300);
    }

    check('C: all 3 Ανάβασις announce beats produced subtitle text', results.every((r) => r.domText !== null && r.domText.length > 0), JSON.stringify(results.map((r) => r.domText)));
    check('C: none of the 3 beats show card/subtitle overlap (corrected content box)', results.every((r) => !r.overlap), JSON.stringify(results.map((r) => r.overlap)));
    check('C: the corrected card box is far smaller than the full viewport (proof of the fix)', results.every((r) => r.cardBox !== null && (r.cardBox as { height: number }).height < 400), JSON.stringify(results.map((r) => (r.cardBox as { height: number } | null)?.height)));

    await tvCtx.close();
    for (const ctx of playerCtxs) await ctx.close();
  }

  // =========================================================================
  // A - the podium digit-check fix: .innerText() instead of .textContent(),
  //     verified on a FAST standalone quiz+trial game (not full+climb).
  // =========================================================================
  console.log('\n--- A: podium zero-digit check, corrected (.innerText, quiz+trial) ---');
  {
    const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const tvPage = await tvCtx.newPage();
    await tvPage.goto(`http://localhost:${CLIENT_PORT}/host?mode=quiz`);
    await tvPage.getByRole('button', { name: 'Create Room' }).click();
    const code = ((await tvPage.getByTestId('room-code').textContent({ timeout: 15000 })) ?? '').replace(/\s+/g, '');
    console.log(`room ${code} created (standalone quiz)`);

    const vipCtx = await browser.newContext({ viewport: { width: 360, height: 640 } });
    const otherCtx = await browser.newContext({ viewport: { width: 360, height: 640 } });
    const vipPage = await vipCtx.newPage();
    const otherPage = await otherCtx.newPage();
    for (const [page, name] of [
      [vipPage, 'Άρης'],
      [otherPage, 'Νίκη'],
    ] as const) {
      await page.addInitScript((id: string) => localStorage.setItem('playerId', id), randomUUID());
      await page.goto(`http://localhost:${CLIENT_PORT}/play`);
      await page.getByTestId('code-input').fill(code);
      await page.getByTestId('name-list').waitFor({ state: 'visible', timeout: 15000 });
      await page.locator('[data-testid="preset-name-option"]', { hasText: name }).first().click();
      await page.getByTestId('avatar-grid').waitFor({ state: 'visible', timeout: 15000 });
      await page.locator('[data-testid="avatar-option"]:not([disabled])').first().click();
      await page.getByTestId('join-button').click();
      await page.getByTestId('settings-panel').waitFor({ state: 'visible', timeout: 15000 });
    }
    console.log('both phones joined');

    await vipPage.getByTestId('setting-time-10000').click().catch(() => {});
    await vipPage.getByTestId('setting-length-short').click().catch(() => {});
    await vipPage.getByTestId('setting-finale-trial').click().catch(() => {});
    await delay(300);
    await vipPage.getByTestId('start-button').click();
    console.log('game started (quiz, short, finale=trial)\n');

    const stop = { stopped: false };
    const drivers = [drivePhoneQuick(vipPage, stop), drivePhoneQuick(otherPage, stop)];
    const t0 = Date.now();
    const deadline = t0 + 300000;
    let overNow = false;
    while (!overNow && Date.now() < deadline) {
      await delay(1000);
      overNow = (await tvPage.locator('[data-testid="gameover-root"], [data-testid="podium-root"]').count()) > 0;
    }
    stop.stopped = true;
    await Promise.allSettled(drivers);
    console.log(`reached GAME_OVER at t=${Math.round((Date.now() - t0) / 1000)}s: ${overNow ? 'yes' : 'TIMED OUT'}\n`);
    check('A-setup: the quiz+trial game reached GAME_OVER', overNow);

    await delay(7000); // PODIUM_DELAY_MS + margin
    const podiumRoot = tvPage.locator('[data-testid="podium-root"]');
    await podiumRoot.waitFor({ timeout: 15000 }).catch(() => {});
    const textContentVersion = (await podiumRoot.textContent().catch(() => null)) ?? '';
    const innerTextVersion = (await podiumRoot.innerText().catch(() => null)) ?? '';
    console.log(`podium .textContent() digit count: ${(textContentVersion.match(/[0-9]/g) ?? []).length}`);
    console.log(`podium .innerText()   : "${innerTextVersion}"`);
    console.log(`podium .innerText() digit matches: ${JSON.stringify(innerTextVersion.match(/[0-9]/g) ?? [])}`);
    check('A: .textContent() DOES pick up style-tag digits (confirms the false-failure mechanism)', (textContentVersion.match(/[0-9]/g) ?? []).length > 0);
    check('A: .innerText() (what a viewer actually sees) has ZERO digits', (innerTextVersion.match(/[0-9]/g) ?? []).length === 0, `digits: ${JSON.stringify(innerTextVersion.match(/[0-9]/g) ?? [])}`);

    await tvCtx.close();
    await vipCtx.close();
    await otherCtx.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length > 0) for (const f of failures) console.log(`  failed: ${f}`);
}

main().then(
  async () => {
    if (browser) await browser.close();
    killGroup(clientProc);
    process.exit(failed > 0 ? 1 : 0);
  },
  async (err) => {
    console.error(err);
    if (browser) await browser.close();
    killGroup(clientProc);
    process.exit(1);
  },
);
