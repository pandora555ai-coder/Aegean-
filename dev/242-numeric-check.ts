// Task 242 item C - the Εκτίμηση (numeric) reveal: an exact guesser's label
// colliding with the answer marker/label. Real in-process server + real
// Vite client + real TV Playwright page (podium-subtitle-followup-check.ts's
// pattern), with the round driven by DIRECT module calls
// (prepareNumericGame/startNumericSegment/submitNumericAnswer,
// modes/numeric.ts) rather than played out over real phone taps - the
// question and both players' values are otherwise uncontrollable (server
// picks a random question every game), and this task needs an EXACT hit on
// demand.
//
//   npx tsx dev/242-numeric-check.ts
process.env.PORT = '3931';

import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser } from 'playwright';

const SERVER_PORT = 3931;
const CLIENT_PORT = 5932;
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
  const { getRoom } = await import('../server/src/state.js');
  const { prepareNumericGame, startNumericSegment, submitNumericAnswer, getNumericTrueAnswer } = await import(
    '../server/src/modes/numeric.js'
  );

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
  await tvPage.goto(`http://localhost:${CLIENT_PORT}/host?mode=numeric`);
  await tvPage.getByTestId('audio-gate').click();
  await tvPage.getByRole('button', { name: 'Create Room' }).click();
  const code = ((await tvPage.getByTestId('room-code').textContent({ timeout: 15000 })) ?? '').replace(/\s+/g, '');
  console.log(`room ${code} created (standalone numeric)`);

  const playerCtxs: Awaited<ReturnType<typeof browser.newContext>>[] = [];
  const playerIds: Record<string, string> = {};
  for (const name of ['Μαρία', 'Νίκος']) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
    playerCtxs.push(ctx);
    const p = await ctx.newPage();
    const seededId = randomUUID();
    playerIds[name] = seededId;
    await p.addInitScript((id: string) => localStorage.setItem('playerId', id), seededId);
    await p.goto(`http://localhost:${CLIENT_PORT}/play`);
    await p.getByTestId('code-input').fill(code);
    await p.getByTestId('custom-name-toggle').click();
    await p.getByTestId('custom-name-input').fill(name);
    await p.getByTestId('custom-name-confirm').click();
    await p.getByTestId('avatar-grid').waitFor({ state: 'visible', timeout: 15000 });
    await p.locator('[data-testid="avatar-option"]:not([disabled])').first().click();
    await p.getByTestId('join-button').click();
    await p.getByTestId('settings-panel').waitFor({ state: 'visible', timeout: 15000 });
  }
  console.log('two players joined:', playerIds, '\n');

  const room = getRoom(code) as never;

  async function runRound(label: string, buildSubmissions: (answer: number) => Record<string, number>): Promise<void> {
    console.log(`--- ${label} ---`);
    prepareNumericGame(room, 1);
    startNumericSegment(room);
    const answer = getNumericTrueAnswer(room) ?? 10;
    console.log(`  true answer = ${answer}`);
    const submissions = buildSubmissions(answer);
    for (const [name, value] of Object.entries(submissions)) {
      const ok = submitNumericAnswer(room, playerIds[name], value);
      console.log(`  submit ${name}=${value} accepted=${ok}`);
    }
    await tvPage.locator('[data-testid="numeric-reveal-numline"]').waitFor({ timeout: 10000 });
    await delay(300);

    const labels = await tvPage.locator('[data-testid="numeric-reveal-tick-label"]').all();
    const rows: { text: string; isTruth: string | null; side: string | null; box: Box }[] = [];
    for (const l of labels) {
      const text = (await l.textContent()) ?? '';
      const isTruth = await l.getAttribute('data-truth');
      const side = await l.getAttribute('data-side');
      const box = (await l.boundingBox().catch(() => null)) as Box;
      rows.push({ text, isTruth, side, box });
    }
    for (const r of rows) {
      console.log(`    label text="${r.text}" isTruth=${r.isTruth} side=${r.side} box=${JSON.stringify(r.box)}`);
    }
    const truthRow = rows.find((r) => r.isTruth === 'true');
    const playerRows = rows.filter((r) => r.isTruth !== 'true');
    let anyOverlap = false;
    let minGapPx = Infinity;
    for (const p of playerRows) {
      if (truthRow && p.box && truthRow.box) {
        if (overlap(p.box, truthRow.box)) {
          anyOverlap = true;
          console.log(`    OVERLAP: "${p.text}" vs truth "${truthRow.text}"`);
        }
        // Vertical clearance only matters when the two boxes' X ranges
        // actually intersect (i.e. they're genuinely stacked, same lane) -
        // otherwise they're side-by-side on the same "above"/"below" row
        // and a small Y difference from the two different font-sizes is
        // not a collision at all.
        const xOverlaps = p.box.x < truthRow.box.x + truthRow.box.width && p.box.x + p.box.width > truthRow.box.x;
        if (xOverlaps) {
          const gap = p.box.y < truthRow.box.y ? truthRow.box.y - (p.box.y + p.box.height) : p.box.y - (truthRow.box.y + truthRow.box.height);
          minGapPx = Math.min(minGapPx, gap);
          console.log(`    gap "${p.text}" <-> truth "${truthRow.text}" = ${gap.toFixed(2)}px (x-ranges overlap - stacked)`);
        } else {
          console.log(`    "${p.text}" <-> truth "${truthRow.text}": x-ranges don't overlap - side by side, no stacking to measure`);
        }
      }
      for (const q of playerRows) {
        if (p !== q && overlap(p.box, q.box)) {
          anyOverlap = true;
          console.log(`    OVERLAP: "${p.text}" vs "${q.text}"`);
        }
      }
    }
    check(`${label}: no label overlaps another (guesser vs truth, guesser vs guesser)`, !anyOverlap);
    check(`${label}: guesser-vs-truth vertical clearance > 0px (real breathing room, not just touching)`, minGapPx === Infinity || minGapPx > 0, `minGapPx=${minGapPx}`);
  }

  // ------------------------------------------------------------------
  // Exact hit: Μαρία guesses exactly right, Νίκος guesses something else
  // close by (so the numline has more than a single pair of markers to
  // rule out a degenerate 2-marker case).
  // ------------------------------------------------------------------
  await runRound('EXACT HIT (Μαρία exact, Νίκος off)', (answer) => ({
    Μαρία: answer,
    Νίκος: Math.max(0, answer - Math.max(1, Math.round(answer * 0.3))),
  }));

  // ------------------------------------------------------------------
  // Inverse: nobody exact.
  // ------------------------------------------------------------------
  await runRound('INVERSE (nobody exact)', (answer) => ({
    Μαρία: Math.max(0, answer - Math.max(2, Math.round(answer * 0.4))),
    Νίκος: answer + Math.max(2, Math.round(answer * 0.4)),
  }));

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
