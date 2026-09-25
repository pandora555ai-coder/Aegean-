// Task 242 - verification for item A (SOCRATES subtitle repositioning) and
// diagnosis-only observation for item D (the phase-transition "zoom").
// Pattern: podium-subtitle-followup-check.ts (in-process real server, real
// Vite client, real browser, TV creates its own room over the UI, two real
// phones join in SEPARATE contexts with seeded playerIds).
//
//   npx tsx dev/242-subtitle-check.ts
process.env.PORT = '3930';

import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';

const SERVER_PORT = 3930;
const CLIENT_PORT = 5931;
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

type Box = { x: number; y: number; width: number; height: number } | null;
function overlap(a: Box, b: Box): boolean {
  if (!a || !b) return false;
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function main(): Promise<void> {
  console.log('booting in-process server on', SERVER_PORT);
  await import('../server/src/index.js');

  clientProc = spawn('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], {
    cwd: CLIENT_DIR,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, VITE_SERVER_URL: `http://localhost:${SERVER_PORT}` },
  });
  await waitForClient();
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  console.log('client + browser ready\n');

  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const tvPage = await tvCtx.newPage();
  await tvPage.goto(`http://localhost:${CLIENT_PORT}/host?mode=full`);
  await tvPage.getByTestId('audio-gate').click();
  await tvPage.getByTestId('create-room').click();
  const code = ((await tvPage.getByTestId('room-code').textContent({ timeout: 15000 })) ?? '').replace(/\s+/g, '');
  console.log(`room ${code} created`);

  const playerCtxs: Awaited<ReturnType<typeof browser.newContext>>[] = [];
  const pages: Page[] = [];
  // Task 255 - the custom-name toggle/input/confirm flow was deleted in Task
  // 241; joining is now preset-name-list -> avatar-grid -> join-button (the
  // pattern dev/245-name-check.ts's newPhonePage/join steps already use). A
  // `?room=` deep link jumps straight past the code-input step to the name
  // list, same as that harness.
  for (const name of ['Άρης', 'Νίκη']) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
    playerCtxs.push(ctx);
    const p = await ctx.newPage();
    pages.push(p);
    await p.addInitScript((id: string) => localStorage.setItem('playerId', id), randomUUID());
    await p.goto(`http://localhost:${CLIENT_PORT}/play?room=${code}`);
    await p.getByTestId('name-list').waitFor({ state: 'visible', timeout: 15000 });
    await p.locator('[data-testid="preset-name-option"]', { hasText: name }).first().click();
    await p.getByTestId('avatar-grid').waitFor({ state: 'visible', timeout: 15000 });
    await p.locator('[data-testid="avatar-option"]:not([disabled])').first().click();
    await p.getByTestId('join-button').click();
    await p.getByTestId('settings-panel').waitFor({ state: 'visible', timeout: 15000 });
  }
  const [vipPage] = pages;
  console.log('two players joined\n');

  await vipPage.getByTestId('setting-length-short').click().catch(() => {});
  await delay(300);
  await vipPage.getByTestId('start-button').click();
  console.log('game started (full, short, finale=climb default)\n');

  async function sampleBeat(label: string): Promise<{ subBox: Box; sophBox: Box; cardBox: Box; domText: string | null }> {
    await tvPage.locator('[data-testid="socrates-subtitle"]').waitFor({ timeout: 25000 });
    await delay(350); // settle past enter animations
    const domText = await tvPage.locator('[data-testid="socrates-subtitle"]').textContent().catch(() => null);
    const subBox = (await tvPage.locator('[data-testid="socrates-subtitle"]').boundingBox().catch(() => null)) as Box;
    const sophBox = (await tvPage.locator('[data-testid="sophists-row"]').boundingBox().catch(() => null)) as Box;
    const cardCount = await tvPage.locator('[data-testid="stage-announce"] > div').count();
    const cardBox = cardCount > 0 ? ((await tvPage.locator('[data-testid="stage-announce"] > div').boundingBox().catch(() => null)) as Box) : null;
    console.log(`  [${label}] dom="${domText}"`);
    console.log(`    subtitle=${JSON.stringify(subBox)}`);
    console.log(`    sophistsRow=${JSON.stringify(sophBox)}`);
    console.log(`    stageCard=${JSON.stringify(cardBox)}`);
    return { subBox, sophBox, cardBox, domText };
  }

  // ---------------------------------------------------------------------
  // (i) an intro beat - GAME_INTRO plays first, no stage card yet.
  // ---------------------------------------------------------------------
  console.log('--- (i) GAME_INTRO beat ---');
  const introSample = await sampleBeat('intro');
  check('A1: intro beat produced subtitle text', !!introSample.domText && introSample.domText.length > 0, introSample.domText ?? '');
  check('A1: intro beat - subtitle vs SophistsRow zero overlap', !overlap(introSample.subBox, introSample.sophBox));
  // Task 236 wires the stage-1 card up BEFORE GAME_INTRO plays (not after,
  // as an earlier task's report described pre-236) - so a card IS already
  // present here too. Check overlap against it directly instead of
  // asserting its absence.
  check('A1: intro beat - subtitle vs stage card zero overlap', !overlap(introSample.subBox, introSample.cardBox));

  // Read the computed font-size/contrast of the bar itself, once.
  const barStyleInfo = await tvPage.locator('[data-testid="socrates-subtitle"]').evaluate((el) => {
    const cs = getComputedStyle(el as HTMLElement);
    return { fontSize: cs.fontSize, color: cs.color, background: cs.backgroundColor, border: cs.border };
  });
  console.log(`  bar computed style: ${JSON.stringify(barStyleInfo)}`);

  // ---------------------------------------------------------------------
  // (ii) a stage-announce beat - skip through the rest of GAME_INTRO to
  // reach it. VIP_SKIP_SOCRATES via the phone's socrates-skip-button.
  // ---------------------------------------------------------------------
  console.log('\n--- skipping through GAME_INTRO to reach stage 1 STAGE_INTRO ---');
  let reachedStageCard = false;
  let stageSample: Awaited<ReturnType<typeof sampleBeat>> | null = null;
  for (let i = 0; i < 12 && !reachedStageCard; i++) {
    const skipBtn = vipPage.locator('[data-testid="socrates-skip-button"]');
    if ((await skipBtn.count()) > 0) {
      await skipBtn.click({ timeout: 1500 }).catch(() => {});
    }
    await delay(500);
    const cardCount = await tvPage.locator('[data-testid="stage-announce"] > div').count();
    const subCount = await tvPage.locator('[data-testid="socrates-subtitle"]').count();
    if (cardCount > 0 && subCount > 0) {
      reachedStageCard = true;
    }
  }
  if (reachedStageCard) {
    console.log('--- (ii) STAGE_INTRO beat (card + subtitle together) ---');
    stageSample = await sampleBeat('stage-announce');
  }
  check('A2: reached a beat with both the stage card and the subtitle on screen', reachedStageCard);
  if (stageSample) {
    check('A2: stage-announce beat produced subtitle text', !!stageSample.domText && stageSample.domText.length > 0, stageSample.domText ?? '');
    check('A2: stage-announce beat - subtitle vs SophistsRow zero overlap', !overlap(stageSample.subBox, stageSample.sophBox));
    check('A2: stage-announce beat - subtitle vs stage card zero overlap', !overlap(stageSample.subBox, stageSample.cardBox));
  }

  // ---------------------------------------------------------------------
  // D - phase transition "zoom" diagnosis. A MutationObserver + rAF loop
  // installed BEFORE the transition, so sampling starts on the very frame
  // the new MarbleSlab mounts (a fixed-interval poll from outside would
  // reliably miss the 420ms window - confirmed by a first pass of this
  // script, which sampled entirely POST-animation and only ever saw
  // transform:none).
  // ---------------------------------------------------------------------
  console.log('\n--- D: phase-transition diagnosis (no fix) ---');
  for (let i = 0; i < 12; i++) {
    const skipBtn = vipPage.locator('[data-testid="socrates-skip-button"]');
    if ((await skipBtn.count()) > 0) await skipBtn.click({ timeout: 1500 }).catch(() => {});
    if ((await tvPage.locator('[data-testid="question-text"]').count()) > 0) break;
    await delay(600);
  }
  console.log('  QUESTION phase reached - installing observer, then answering to trigger QUESTION -> REVEAL');
  // Passed as a raw source STRING, not a closure: tsx/esbuild's keep-names
  // transform wraps every named const/function inside a page.evaluate()
  // closure in a `__name(...)` call that only exists in THIS Node process,
  // not the browser context Playwright re-evaluates the source in -
  // ReferenceError: __name is not defined, reproduced with even a trivial
  // `const f = () => {}` inside a closure. A plain string is eval'd
  // directly in the page with no such transform.
  await tvPage.evaluate(`(() => {
    window.__d242 = { samples: [] };
    let watching = null;
    let t0 = 0;
    let frames = 0;
    const mo = new MutationObserver(() => {
      if (watching) return;
      const nodes = Array.from(document.querySelectorAll('.enter-pop'));
      if (nodes.length === 0) return;
      let biggest = nodes[0];
      for (const n of nodes) {
        const a = n.getBoundingClientRect();
        const b = biggest.getBoundingClientRect();
        if (a.width * a.height > b.width * b.height) biggest = n;
      }
      watching = biggest;
      t0 = performance.now();
      frames = 0;
      const tick = () => {
        if (!watching) return;
        const cs = getComputedStyle(watching);
        const r = watching.getBoundingClientRect();
        window.__d242.samples.push({ t: performance.now() - t0, transform: cs.transform, rect: { x: r.x, y: r.y, width: r.width, height: r.height } });
        frames += 1;
        if (frames < 20) { requestAnimationFrame(tick); } else { watching = null; }
      };
      requestAnimationFrame(tick);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  })()`);
  // Answer on both phones to end the question and mount REVEAL's slab.
  for (const p of pages) {
    const btn = p.locator('[data-testid="answer-button"]:not([disabled])').first();
    if ((await btn.count()) > 0) await btn.click({ timeout: 2000 }).catch(() => {});
  }
  await delay(1200);
  const raw = await tvPage.evaluate(() => (window as unknown as { __d242: { samples: { t: number; transform: string; rect: DOMRect }[] } }).__d242.samples);
  console.log(`  captured ${raw.length} rAF samples across the QUESTION -> REVEAL mount:`);
  for (const s of raw.slice(0, 20)) {
    console.log(`    t=${s.t.toFixed(1)}ms transform=${s.transform} rect={x:${s.rect.x.toFixed(1)},y:${s.rect.y.toFixed(1)},w:${s.rect.width.toFixed(1)},h:${s.rect.height.toFixed(1)}}`);
  }
  const first = raw[0];
  const last = raw[raw.length - 1];
  console.log(`\n  D verdict:`);
  console.log(`    element = the largest ".enter-pop"-classed node at mount (MarbleSlab, e.g. RevealView.tsx:93 / QuestionView.tsx:61)`);
  console.log(`    property = transform (CSS scale, via the .enter-pop keyframes)`);
  console.log(`    before (first observed frame): ${first ? `t=${first.t.toFixed(1)}ms transform=${first.transform} rect=${JSON.stringify(first.rect)}` : 'n/a'}`);
  console.log(`    after (last sampled frame, ~${last ? last.t.toFixed(0) : '?'}ms later): ${last ? `transform=${last.transform} rect=${JSON.stringify(last.rect)}` : 'n/a'}`);
  console.log('    mechanism: palette-theatro.css .enter-pop keyframes (scale(0.94)->scale(1), 420ms cubic-bezier, fill-mode backwards)');
  console.log('    trigger: className="enter-pop" on MarbleSlab (and the category chip) in every phase view that mounts one fresh per phase');
  console.log('    verdict: INTENTIONAL - palette-theatro.css\'s own "entrances" section; not a layout/reflow accident. No fix applied (diagnosis only).');

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length > 0) for (const f of failures) console.log(`  failed: ${f}`);

  await tvCtx.close();
  for (const ctx of playerCtxs) await ctx.close();
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
