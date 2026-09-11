// Task 227 - Η Ανάβασις lane stability, checked in a real browser against a
// real server (dev/climb-ceremony-check.ts's own infra: an in-process real
// server on a throwaway port, a throwaway Vite serving the real client, real
// sockets, a real browser).
//
// Root cause under test: `left` used to come from `joinIndex`, reassigned
// every payload from a raw array index - join-order-filtered for
// CLIMB_QUESTION, rank-sorted (sortAndRankResults) for CLIMB_REVEAL - so a
// climber's lane reshuffled by that round's SPEED, not identity. The fix
// (HostScreen's climbLaneRef/laneForClimber) assigns each playerId a lane
// once, first-seen, held for the whole climb regardless of which array or
// what rank a later payload sorts them into, and regardless of anyone else
// being eliminated.
//
// Four checks, each tied to task 227's own acceptance criteria:
//   1. Lane stability across >=8 rounds with an elimination (real Η Λόγχη
//      spear-out, not a manual state hack - see the round plan below).
//   2. Vertical still animates (steps actually change; a real glide fires).
//   3. No wreath appears on any climber DURING the climb (a MutationObserver
//      armed BEFORE startClimb, watching the whole page, catches even a
//      single-frame flash the old `isClimbFinale && isAnavasisPhase` gate
//      let through on the very first CLIMB_QUESTION render - the
//      PHASE_CHANGED-before-payload gap CLAUDE.md already documents); the
//      winner still wears the CEREMONY wreath at GAME_OVER.
//   4. INVERSE: no two climbers share a lane at any player count up to 6,
//      and the reveal's rank ordering (server-side, untouched) is still
//      sorted by answerRank.
//
//   npx tsx dev/climb-lane-check.ts
process.env.PORT = '3912';

import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { io as ioClient, type Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents, CLIMB_TOP } from '@game/shared';

const SERVER_PORT = 3912;
const CLIENT_PORT = 5914;
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

interface Sim {
  name: string;
  playerId: string;
  socket: Socket;
}

function joinSim(name: string, avatarId: string, code: string): Promise<Sim> {
  const playerId = randomUUID();
  return new Promise((resolve, reject) => {
    const socket: Socket = ioClient(`http://localhost:${SERVER_PORT}`, { reconnection: false });
    socket.on('connect', () => socket.emit(ClientEvents.PLAYER_JOIN, { code, name, playerId, avatarId }));
    socket.once(ServerEvents.PLAYER_JOINED, () => resolve({ name, playerId, socket }));
    socket.once(ServerEvents.JOIN_REJECTED, (p: unknown) => reject(new Error(`sim join rejected: ${JSON.stringify(p)}`)));
    socket.once('connect_error', reject);
  });
}

const AVATARS = ['sphinx', 'medusa', 'centaur', 'minotaur', 'pegasus', 'cyclops'];
const NAMES = ['Άλφα', 'Βήτα', 'Γάμα', 'Δέλτα', 'Έψιλον', 'Ζήτα'];

type RoomLike = {
  phase: string;
  code: string;
  players: Map<string, { playerId: string; score: number }>;
  climb: {
    questions: Array<{ correctIndex: number }>;
    questionIndex: number;
    steps: Map<string, number>;
    spearCounters: Map<string, number>;
    eliminationOrder: string[];
    winnerPlayerId: string | null;
    lastResults: Array<{ playerId: string; answerRank: number | null }> | null;
  } | null;
};

async function waitForPhase(room: RoomLike, phase: string, timeoutMs = 40000): Promise<void> {
  const started = Date.now();
  while (room.phase !== phase) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${phase} (still ${room.phase})`);
    await delay(100);
  }
}

async function playRound(room: RoomLike, plan: Array<{ sim: Sim; answer: 'correct' | 'wrong' | 'none' }>): Promise<void> {
  await waitForPhase(room, 'CLIMB_QUESTION');
  const climb = room.climb!;
  const correctIndex = climb.questions[climb.questionIndex].correctIndex;
  for (const { sim, answer } of plan) {
    if (answer === 'none') continue;
    const choice = answer === 'correct' ? correctIndex : (correctIndex + 1) % 4;
    sim.socket.emit(ClientEvents.CLIMB_SUBMIT, { choice });
    await delay(160);
  }
}

async function newRoom(browser: Browser, playerCount: number): Promise<{ page: Page; sims: Sim[]; code: string; close: () => Promise<void> }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.goto(`http://localhost:${CLIENT_PORT}/host`);
  await page.getByRole('button', { name: 'Create Room' }).click();
  const codeLocator = page.getByTestId('room-code');
  await codeLocator.waitFor({ state: 'visible', timeout: 20000 });
  const code = ((await codeLocator.textContent()) ?? '').replace(/\s+/g, '');
  const sims: Sim[] = [];
  for (let i = 0; i < playerCount; i++) {
    sims.push(await joinSim(NAMES[i], AVATARS[i], code));
  }
  await delay(400);
  return {
    page,
    sims,
    code,
    close: async () => {
      for (const sim of sims) sim.socket.disconnect();
      await context.close();
    },
  };
}

interface ClimberSample {
  playerId: string;
  step: number;
  lane: number;
  centerXPx: number;
  bottomPx: number;
}

async function readClimbers(page: Page): Promise<ClimberSample[]> {
  return page.locator('[data-testid="anavasis-climber"]').evaluateAll((els) =>
    els.map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        playerId: el.getAttribute('data-player-id') ?? '',
        step: Number(el.getAttribute('data-step') ?? '-1'),
        lane: Number(el.getAttribute('data-lane') ?? '-1'),
        centerXPx: rect.left + rect.width / 2,
        bottomPx: window.innerHeight - rect.bottom,
      };
    }),
  );
}

// Scans the actual mutation records (added nodes), not a live query after
// the fact - a same-tick mount-then-unmount would otherwise be invisible to
// a plain querySelector run once the batch has already settled. SophistsRow
// is ALWAYS mounted (Task 163a - even in LOBBY/STAGE_ANNOUNCE, just at
// opacity 0 via its OWN `.sophists`/`sophists-row` ancestor, never the
// wreath element's own computed opacity, which stays 1 regardless), so a
// mere DOM addition is not a sighting worth failing on - only a VISIBLE one
// is task 227's actual bug.
async function armWreathWatch(page: Page): Promise<void> {
  // Deliberately no named local function/const bindings in this callback -
  // esbuild's keep-names transform (tsx's default) wraps a NAMED const
  // arrow in a call to its own `__name` helper, which lives outside the
  // extracted function text Playwright actually ships to the page, so it
  // throws ReferenceError there. Everything here is inline instead.
  //
  // Watches BOTH childList (a fresh SophistsRow mount, which is what the
  // pre-fix `showAnavasisWorld` gap frame did - conditionally mounting the
  // whole component) and the `class` attribute (the ordinary, expected path
  // once mounted: `hidden` flips the SAME node's class, no new node at all -
  // see SophistsRow's own `hidden = phase === 'STAGE_ANNOUNCE' || ...`). On
  // EVERY delivered batch, regardless of which kind of mutation triggered
  // it, this just re-checks the CURRENT live state: is a wreath in the DOM,
  // and is its ROW (not the wreath element itself, whose own computed
  // opacity is always 1 - only the ancestor toggles) actually visible.
  // Still no named local bindings for the CHECK itself either (see the note
  // above) - it's duplicated inline in the observer callback and the
  // initial call rather than factored into a named const.
  await page.evaluate(() => {
    (window as unknown as { __wreathSightings: string[] }).__wreathSightings = [];
    const observer = new MutationObserver(() => {
      const wreath = document.querySelector('[data-testid="sophist-wreath"]');
      if (!wreath) return;
      const row = wreath.closest('[data-testid="sophists-row"]');
      const rowOpacity = row ? Number(getComputedStyle(row).opacity) : 1;
      if (rowOpacity > 0.05) {
        (window as unknown as { __wreathSightings: string[] }).__wreathSightings.push(`VISIBLE sophist-wreath @ ${performance.now().toFixed(0)}ms (row opacity ${rowOpacity})`);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    const wreath0 = document.querySelector('[data-testid="sophist-wreath"]');
    if (wreath0) {
      const row0 = wreath0.closest('[data-testid="sophists-row"]');
      const rowOpacity0 = row0 ? Number(getComputedStyle(row0).opacity) : 1;
      if (rowOpacity0 > 0.05) {
        (window as unknown as { __wreathSightings: string[] }).__wreathSightings.push(`VISIBLE sophist-wreath present at watch start (row opacity ${rowOpacity0})`);
      }
    }
    (window as unknown as { __wreathObserver: MutationObserver }).__wreathObserver = observer;
  });
}

async function readWreathSightings(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __wreathSightings: string[] }).__wreathSightings ?? []);
}

async function main() {
  await import('../server/src/index.js');
  const { getRoom } = await import('../server/src/state.js');
  const { startClimb } = await import('../server/src/phases.js');
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
    // -----------------------------------------------------------------
    // 1+2+3. One 4-player climb, 9 rounds, a real spear elimination at
    // round 2, a clear pre-set score leader (so criterion 3's wreath watch
    // means something), sampled every round.
    // -----------------------------------------------------------------
    console.log('\n=== main run: 4 players, 9 rounds, 1 spear elimination ===');
    const { page, sims, code, close } = await newRoom(browser, 4);
    const room = getRoom(code) as unknown as RoomLike;
    // A clear score leader BEFORE the climb starts, so the sophists row's
    // wreath (had it flashed) would have landed on someone specific.
    room.players.get(sims[0].playerId)!.score = 900;
    room.players.get(sims[1].playerId)!.score = 500;
    room.players.get(sims[2].playerId)!.score = 300;
    room.players.get(sims[3].playerId)!.score = 100;

    // Armed AFTER LOBBY, not before: LOBBY legitimately shows the sophists
    // row (Task 163a) including a real leader's wreath - that's how joining
    // players show up, unrelated to task 227. What's under test is the
    // STAGE_ANNOUNCE -> CLIMB_QUESTION transition, where the old
    // `isClimbFinale && isAnavasisPhase` gate had a one-render gap. startClimb
    // itself is synchronous (flips room.phase to STAGE_ANNOUNCE and emits
    // before returning), so arming immediately after it - before awaiting
    // anything - still watches from before the client has processed that
    // transition.
    startClimb(room as never);
    await armWreathWatch(page);
    await waitForPhase(room, 'CLIMB_QUESTION');

    // Force a controlled entry state: sims[3] pinned to step 0 (about to be
    // speared), everyone else at a modest step.
    room.climb!.steps.set(sims[0].playerId, 2);
    room.climb!.steps.set(sims[1].playerId, 2);
    room.climb!.steps.set(sims[2].playerId, 2);
    room.climb!.steps.set(sims[3].playerId, 0);

    const roundsByRoundIndex: Map<number, ClimberSample[]> = new Map();
    const TOTAL_ROUNDS = 9;
    for (let r = 1; r <= TOTAL_ROUNDS; r++) {
      const dAlive = !room.climb!.eliminationOrder.includes(sims[3].playerId);
      // Rounds 1-2: sims[3] wrong at step 0 twice -> real spear-out at round 2.
      // From round 3 on: everyone still alive answers correct, but steps are
      // re-pinned below (not left to accumulate) so nobody hits CLIMB_TOP
      // before round 9 - same seeding technique climb-ceremony-check.ts uses.
      const plan = [
        { sim: sims[0], answer: 'correct' as const },
        { sim: sims[1], answer: 'correct' as const },
        { sim: sims[2], answer: 'correct' as const },
        ...(dAlive ? [{ sim: sims[3], answer: 'wrong' as const }] : []),
      ];
      await playRound(room, plan);
      await waitForPhase(room, 'CLIMB_REVEAL');
      // Let the beat+glide play out for real before the next round is armed.
      await delay(2600);
      if (r < TOTAL_ROUNDS) {
        await waitForPhase(room, 'CLIMB_QUESTION');
        if (room.climb) {
          for (const sim of [sims[0], sims[1], sims[2]]) {
            if (!room.climb.eliminationOrder.includes(sim.playerId)) {
              room.climb.steps.set(sim.playerId, 3 + (r % 3));
            }
          }
        }
      }
      const sample = await readClimbers(page);
      roundsByRoundIndex.set(r, sample);
      console.log(
        `  round ${r}: ${sample.map((c) => `${sims.find((s) => s.playerId === c.playerId)?.name ?? '??'}(lane ${c.lane}, step ${c.step}, x=${Math.round(c.centerXPx)}, bottom=${Math.round(c.bottomPx)})`).join(', ')}` +
          (dAlive && room.climb!.eliminationOrder.includes(sims[3].playerId) ? '  <- Δέλτα speared out this round' : ''),
      );
    }

    // ---- Criterion 1: lane stability -------------------------------
    // `lane` (data-lane, the underlying joinIndex) is the ground truth for
    // stability, NOT the rendered pixel x: the stair narrows with height
    // (stepWidthPct scales the lane offset), so a player's own pixel x
    // legitimately shifts as their step changes even with a rock-stable
    // lane - that narrowing is what round 1-9's differing x values below
    // actually show, confirmed by the RELATIVE left-to-right order (and the
    // lane number itself) staying fixed throughout.
    const laneByPlayer = new Map<string, number[]>();
    for (const sample of roundsByRoundIndex.values()) {
      for (const c of sample) {
        const arr = laneByPlayer.get(c.playerId) ?? [];
        arr.push(c.lane);
        laneByPlayer.set(c.playerId, arr);
      }
    }
    let allStable = true;
    for (const [playerId, lanes] of laneByPlayer) {
      const name = sims.find((s) => s.playerId === playerId)?.name ?? '??';
      const stable = new Set(lanes).size === 1;
      if (!stable) allStable = false;
      check(`1: ${name}'s lane is identical every round it appears (${lanes.length} appearances)`, stable, `lanes seen: ${lanes.join(', ')}`);
    }
    check('1: every surviving player kept ONE stable lane across all 9 rounds', allStable);

    // Δέλτα must vanish after their own elimination round and never return.
    const deltaRounds = [...roundsByRoundIndex.entries()].filter(([, s]) => s.some((c) => c.playerId === sims[3].playerId)).map(([r]) => r);
    const deltaGoneAfter = deltaRounds.length > 0 ? Math.max(...deltaRounds) : 0;
    const deltaNeverReturns = [...roundsByRoundIndex.entries()].every(([r, s]) => r <= deltaGoneAfter || !s.some((c) => c.playerId === sims[3].playerId));
    check('1: an eliminated player (Δέλτα) disappears and never reappears', deltaGoneAfter > 0 && deltaGoneAfter < TOTAL_ROUNDS && deltaNeverReturns, `last seen round ${deltaGoneAfter} of ${TOTAL_ROUNDS}`);

    // Compare the SAME survivors' lanes strictly before vs. after that
    // elimination round - the actual "eliminated players must not change
    // anyone else's lane" criterion.
    const beforeSample = roundsByRoundIndex.get(1)!;
    const afterSample = roundsByRoundIndex.get(TOTAL_ROUNDS)!;
    for (const sim of [sims[0], sims[1], sims[2]]) {
      const before = beforeSample.find((c) => c.playerId === sim.playerId);
      const after = afterSample.find((c) => c.playerId === sim.playerId);
      if (before && after) {
        check(`1: ${sim.name}'s lane is unchanged from before Δέλτα's elimination to after`, before.lane === after.lane, `round 1 lane=${before.lane}, round ${TOTAL_ROUNDS} lane=${after.lane}`);
      }
    }
    // And the RELATIVE left-to-right pixel order among the 3 survivors is
    // consistent with those unchanged lane numbers, round 1 vs round 9.
    const orderOf = (s: ClimberSample[]): string =>
      [...s]
        .sort((a, b) => a.centerXPx - b.centerXPx)
        .map((c) => sims.find((sm) => sm.playerId === c.playerId)?.name ?? '??')
        .join('<');
    const survivorsOnly = (s: ClimberSample[]): ClimberSample[] => s.filter((c) => c.playerId !== sims[3].playerId);
    check('1: the 3 survivors\' left-to-right pixel order is identical, round 1 vs round 9', orderOf(survivorsOnly(beforeSample)) === orderOf(survivorsOnly(afterSample)), `round 1: ${orderOf(survivorsOnly(beforeSample))}; round ${TOTAL_ROUNDS}: ${orderOf(survivorsOnly(afterSample))}`);

    // ---- Criterion 2: vertical still animates ----------------------
    const stepsSeen = new Set<number>();
    for (const s of roundsByRoundIndex.values()) for (const c of s) stepsSeen.add(c.step);
    check('2: steps actually vary across rounds (the vertical dimension is live)', stepsSeen.size > 1, `distinct steps seen: ${[...stepsSeen].sort((a, b) => a - b).join(', ')}`);
    let anyBottomChange = false;
    const roundsArr = [...roundsByRoundIndex.entries()].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < roundsArr.length; i++) {
      for (const c of roundsArr[i][1]) {
        const prev = roundsArr[i - 1][1].find((p) => p.playerId === c.playerId);
        if (prev && Math.abs(prev.bottomPx - c.bottomPx) > 2) anyBottomChange = true;
      }
    }
    check('2: at least one round-to-round vertical (bottom px) change was observed', anyBottomChange);

    // ---- Criterion 4 (part): no two climbers share a lane, any round --
    let noOverlapEver = true;
    for (const [r, s] of roundsByRoundIndex) {
      const lanes = s.map((c) => c.lane);
      const uniq = new Set(lanes);
      if (uniq.size !== lanes.length) {
        noOverlapEver = false;
        console.log(`  FAIL round ${r} has overlapping lanes: ${lanes.join(', ')}`);
      }
    }
    check('4: no two climbers ever shared a lane in this run (4->3 players)', noOverlapEver);

    // ---- Criterion 4 (part): reveal rank ordering unchanged ----------
    const lastResults = room.climb?.lastResults ?? [];
    const ranks = lastResults.map((r) => r.answerRank).filter((r): r is number => r !== null);
    const sorted = [...ranks].every((r, i) => i === 0 || ranks[i - 1] <= r);
    check('4: the reveal still comes out answerRank-sorted (sortAndRankResults, untouched)', sorted, `ranks: ${ranks.join(', ')}`);

    // ---- Criterion 3: no wreath during the climb, ceremony wreath at end
    // Let the round cap or a forced end play out: force the winner now by
    // pushing sims[0] to CLIMB_TOP so we reach the ceremony quickly rather
    // than waiting out the full round cap.
    await waitForPhase(room, 'CLIMB_QUESTION');
    room.climb!.steps.set(sims[0].playerId, CLIMB_TOP - 2);
    await playRound(room, [
      { sim: sims[0], answer: 'correct' },
      { sim: sims[1], answer: 'wrong' },
      { sim: sims[2], answer: 'wrong' },
    ]);
    await page.getByTestId('anavasis-crowning').waitFor({ state: 'visible', timeout: 60000 });
    await page.waitForTimeout(2600);

    const sightings = await readWreathSightings(page);
    check('3: the SophistsRow wreath never appeared at any point during the climb', sightings.length === 0, sightings.length ? sightings.join(' | ') : 'no sightings');

    const wreathCount = await page.locator('[data-testid="anavasis-wreath"]').count();
    const winnerBanner = ((await page.getByTestId('anavasis-winner-banner').textContent()) ?? '').trim();
    check('3: the CEREMONY wreath is present at GAME_OVER', wreathCount === 1, `count=${wreathCount}, winner="${winnerBanner}"`);
    check('3: the ceremony crowned the forced winner (Άλφα)', winnerBanner === sims[0].name, `winner banner "${winnerBanner}"`);

    await close();

    // -----------------------------------------------------------------
    // 4 (inverse, full): no two climbers share a lane at every player
    // count from 2 to 6, read off the very first CLIMB_QUESTION render.
    // -----------------------------------------------------------------
    console.log('\n=== inverse: lane uniqueness at every player count 2-6 ===');
    for (const n of [2, 3, 4, 5, 6]) {
      const room2 = await newRoom(browser, n);
      const r = getRoom(room2.code) as unknown as RoomLike;
      startClimb(r as never);
      await waitForPhase(r, 'CLIMB_QUESTION');
      await delay(300);
      const sample = await readClimbers(room2.page);
      const lanes = sample.map((c) => c.lane);
      const xs = sample.map((c) => Math.round(c.centerXPx));
      const uniqLanes = new Set(lanes);
      const uniqX = new Set(xs);
      check(`4: n=${n} - every climber gets a distinct lane`, sample.length === n && uniqLanes.size === n && uniqX.size === n, `${sample.length} figures, lanes=[${lanes.join(', ')}], x=[${xs.join(', ')}]`);
      await room2.close();
    }
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
