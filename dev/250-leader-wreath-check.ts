// Task 250 - the in-play leader wreath (SophistsRow's olive wreath/stem
// above whoever sits at rank 1) is removed. It added no information once
// the row was already sorted by rank (the leader is always leftmost), and
// it misfired at 0-0: computeCompetitionRanks gives everyone rank 1 in
// round 1, so every sophist wore it, and the first-joined player kept it
// from then on (ties keep join order). The winner's own wreath stays -
// it now lives ONLY on the climb's coronation (AnavasisCrowning's
// `.anavasis-wreath`) and the podium that follows (PodiumView's
// `.podium-wreath`), both untouched by this task (verified by an empty
// `git diff` on both files).
//
// Against the already-running dev server (4001) / client (5173) - see
// CLAUDE.md's "WHERE YOU WORK". A real `?bot=5&mode=full` game, played to
// completion (no shortcut - the claim is about what's on screen through a
// real show). No page.screenshot calls - DOM/testid queries only.
//
// With an all-bot room, Task 217 self-starts the game the instant
// canStartRoom passes, so LOBBY's own `room-code` testid can render for
// under one Playwright poll tick - `corner-room-code` (shown once the game
// is running) is accepted as a fallback.
//
//   npx tsx dev/250-leader-wreath-check.ts
import { chromium } from 'playwright';

const CLIENT = 'http://localhost:5173';
let passed = 0;
let failed = 0;

function log(...a: unknown[]) {
  console.log(new Date().toISOString().slice(11, 19), ...a);
}

function check(label: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  ok   ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (msg) => {
    if (msg.type() === 'warning' || msg.type() === 'error') log('CONSOLE', msg.type(), msg.text());
  });
  page.on('pageerror', (e) => log('PAGEERROR', e.message));

  await page.goto(`${CLIENT}/host?bot=5&mode=full`);
  await page.getByRole('button', { name: 'Create Room' }).click();
  const roomCode = await page.evaluate(async () => {
    for (let i = 0; i < 60; i++) {
      const el = document.querySelector('[data-testid="room-code"]') || document.querySelector('[data-testid="corner-room-code"]');
      const text = el?.textContent?.trim() ?? '';
      if (/^\d{4}$/.test(text)) return text;
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  });
  log('room code:', roomCode);
  check('room created', roomCode !== null, String(roomCode));

  async function snap(label: string) {
    const data = await page.evaluate(() => {
      const wreaths = document.querySelectorAll('[data-testid="sophist-wreath"]').length;
      const sophs = Array.from(document.querySelectorAll('[data-testid="sophist"]'));
      const rowsLeftToRight = sophs
        .map((s) => ({
          score: Number(s.getAttribute('data-score') || '0'),
          rank: Number(s.getAttribute('data-rank') || '0'),
          lead: s.getAttribute('data-lead'),
          x: Math.round(s.getBoundingClientRect().x),
        }))
        .sort((a, b) => a.x - b.x);
      return { wreaths, count: sophs.length, rowsLeftToRight };
    });
    const rec = { label, ...data };
    log('SNAP', JSON.stringify(rec));
    return rec;
  }

  let round1: Awaited<ReturnType<typeof snap>> | null = null;
  let midGame: Awaited<ReturnType<typeof snap>> | null = null;
  let finale: Awaited<ReturnType<typeof snap>> | null = null;
  let podiumWreathCount = -1;
  let podiumStandingCount = -1;
  let podiumBodyText = '';

  const start = Date.now();
  const MAX_MS = 25 * 60 * 1000;

  while (Date.now() - start < MAX_MS) {
    const state = await page.evaluate(() => ({
      scores: Array.from(document.querySelectorAll('[data-testid="sophist"]')).map((s) => Number(s.getAttribute('data-score') || '0')),
      sophCount: document.querySelectorAll('[data-testid="sophist"]').length,
      hasQuestion: !!document.querySelector('[data-testid="question-text"]'),
      hasAnavasisScene: !!document.querySelector('[data-testid="anavasis-scene"]'),
      podiumWreath: document.querySelectorAll('[data-testid="podium-wreath"]').length,
      podiumStandings: document.querySelectorAll('[data-testid="podium-standing"]').length,
    }));

    if (state.hasQuestion && state.sophCount > 0) {
      const allZero = state.scores.every((s) => s === 0);
      if (allZero && !round1) round1 = await snap('round1-all-zero');
      const max = Math.max(...state.scores);
      const min = Math.min(...state.scores);
      if (!allZero && max > min && !midGame) midGame = await snap('mid-game-clear-leader');
    }
    if (state.hasAnavasisScene && !finale) finale = await snap('finale-anavasis-scene');

    if (state.podiumWreath > 0) {
      podiumWreathCount = state.podiumWreath;
      podiumStandingCount = state.podiumStandings;
      podiumBodyText = (await page.evaluate(() => document.body.innerText)).slice(0, 300);
      log('PODIUM', JSON.stringify({ podiumWreathCount, podiumStandingCount, podiumBodyText }));
      break;
    }
    await page.waitForTimeout(2000);
  }

  await browser.close();

  log('=== CRITERION 2 - wreath count at three checkpoints (expect 0 each) ===');
  check('round 1, all scores 0', round1 !== null && round1.wreaths === 0, `wreaths=${round1?.wreaths}`);
  check('mid-game, clear leader', midGame !== null && midGame.wreaths === 0, `wreaths=${midGame?.wreaths}`);
  check('finale (climb)', finale !== null && finale.wreaths === 0, `wreaths=${finale?.wreaths}`);
  if (midGame) {
    const sorted = [...midGame.rowsLeftToRight].every((r, i, arr) => i === 0 || arr[i - 1].score >= r.score);
    check('row still sorted by score, leader leftmost', sorted, JSON.stringify(midGame.rowsLeftToRight.map((r) => r.score)));
  }

  log('=== CRITERION 3 - winner screen/podium ===');
  check('podium shows a winner wreath', podiumWreathCount > 0, `podium-wreath count=${podiumWreathCount}`);
  check('podium shows all standings rows', podiumStandingCount === 5, `podium-standing count=${podiumStandingCount}`);
  check('no digits in podium body text', !/\d/.test(podiumBodyText.replace(/\d{2}:\d{2}/, '')), podiumBodyText.replace(/\n/g, ' | '));

  log(`=== ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
