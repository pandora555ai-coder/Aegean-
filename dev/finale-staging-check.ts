// Task 237 - Η Ανάβασις finale STAGING, observed in a real browser against a
// real server (dev/climb-ceremony-check.ts's own infra: an in-process real
// server on a throwaway port, a throwaway Vite serving the real client, real
// sockets, a real browser). Nothing here reads code and reasons about it.
//
// Three staging defects, plus the inverse sweep the duel/ceremony overlay has
// earned (three independent wrong paths historically: Task 219's duel overlay
// left mounted, Task 225's winner hidden at the ceremony, Task 227's two
// wreath leaks):
//
//   1  A: the WINNER beat. endClimb plays it as a plain SOCRATES phase
//      between the last CLIMB_REVEAL and GAME_OVER. Sampled 50ms timeline of
//      WHERE THE SCENE IS at every moment from top-out to ceremony - the
//      temple world's presence and Socrates' own `left` (57% = the temple
//      terrace, 5% = the theatre orchestra).
//   2  B: the CLIMB_QUESTION slab vs the climbers near the top of the stair.
//      Real bounding boxes at real steps 6..9, overlap area in px^2.
//   3  C: a cause:'top' duel (two arrivals in ONE reveal), timed from top-out
//      to verdict, with whatever the TV actually says about WHY it is
//      happening.
//   4  Inverse: every terminal path of the climb, each reporting (scene,
//      overlay, wreath, winner).
//
//   npx tsx dev/finale-staging-check.ts
//   ONLY_SCENARIO=1 npx tsx dev/finale-staging-check.ts
process.env.PORT = '3915';

import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { io as ioClient, type Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents, CLIMB_TOP, CLIMB_MAX_ROUNDS, type DuelWeapon } from '@game/shared';

const SERVER_PORT = 3915;
const CLIENT_PORT = 5916;
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

// Distinct weapons per sim: identical picks tie, and a tie re-opens DUEL_PICK
// forever (there is no tie cap).
function wireDuelPicks(sims: Sim[], weaponFor: Map<string, DuelWeapon>): void {
  for (const sim of sims) {
    sim.socket.on(ServerEvents.DUEL_PICK_SHOW, (payload: { youDuel?: boolean; picked?: boolean }) => {
      if (!payload.youDuel || payload.picked) return;
      const weapon = weaponFor.get(sim.playerId) ?? 'xifos';
      setTimeout(() => sim.socket.emit(ClientEvents.DUEL_PICK, { weapon }), 200);
    });
  }
}

const AVATARS = ['sphinx', 'medusa', 'centaur', 'minotaur', 'pegasus', 'cyclops'];
// Task 246 - names are PRESET-ONLY since Task 241/245 (isValidPlayerName =
// strict membership in PRESET_NAMES), so the Greek-letter names this suite
// was written with are rejected at join with INVALID_NAME and the whole run
// dies on the first sim. Lengths kept close to the originals (4/4/4/5/7/3 vs
// 4/4/4/5/7/4) so nothing geometric shifts. Name constants only - no check,
// threshold or scenario is touched.
const NAMES = ['Άρης', 'Νίκη', 'Χαρά', 'Τάκης', 'Γιώργος', 'Ζωή'];

// ---------------------------------------------------------------------------
// The world probe. TheatreScene carries no testid of its own, so "which world
// is on screen" is read from two independent signals instead: the Anavasis
// container's presence, and Socrates' own horizontal position (the temple
// terrace is left:57%, the theatre orchestra left:5%/7%) - which is the very
// thing defect A is about.
// ---------------------------------------------------------------------------
interface WorldSample {
  t: number; // Date.now(), so server timestamps and DOM samples share one clock
  world: 'temple' | 'theatre';
  socratesLeftPct: number | null;
  rowOpacity: number | null;
  slab: boolean;
  duel: boolean;
  crowning: boolean;
  climbers: number;
}

async function installSampler(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __samples?: unknown[]; __sampler?: number };
    w.__samples = [];
    w.__sampler = window.setInterval(() => {
      const container = document.querySelector('[data-testid="anavasis-scene-container"]');
      const fig = document.querySelector('.socrates-figure-root') as HTMLElement | null;
      const row = document.querySelector('[data-testid="sophists-row"]') as HTMLElement | null;
      const leftRaw = fig ? getComputedStyle(fig).left : null;
      const leftPct = fig && leftRaw ? Math.round((parseFloat(leftRaw) / window.innerWidth) * 1000) / 10 : null;
      (w.__samples as unknown[]).push({
        t: Date.now(),
        world: container ? 'temple' : 'theatre',
        socratesLeftPct: leftPct,
        rowOpacity: row ? Number(getComputedStyle(row).opacity) : null,
        slab: !!document.querySelector('[data-testid="climb-question-slab"]'),
        duel: !!document.querySelector('[data-testid="anavasis-duel"]'),
        crowning: !!document.querySelector('[data-testid="anavasis-crowning"]'),
        climbers: document.querySelectorAll('[data-testid="anavasis-climber"]').length,
      });
    }, 50);
  });
}

async function readSamples(page: Page): Promise<WorldSample[]> {
  return (await page.evaluate(() => (window as unknown as { __samples: WorldSample[] }).__samples)) as WorldSample[];
}

// Collapses the 50ms stream into the moments something actually changed.
function transitions(samples: WorldSample[]): WorldSample[] {
  const key = (s: WorldSample): string =>
    `${s.world}|${s.socratesLeftPct}|${s.slab}|${s.duel}|${s.crowning}|${s.climbers}|${s.rowOpacity}`;
  const out: WorldSample[] = [];
  for (const sample of samples) {
    if (out.length === 0 || key(out[out.length - 1]) !== key(sample)) out.push(sample);
  }
  return out;
}

type RoomLike = {
  phase: string;
  code: string;
  gameIntroPlayed: boolean;
  climb: {
    questions: Array<{ correctIndex: number }>;
    questionIndex: number;
    steps: Map<string, number>;
    climberIds: string[];
    roundsPlayed: number;
    spearCounters: Map<string, number>;
    eliminationOrder: string[];
    winnerPlayerId: string | null;
    duel: { cause: string } | null;
  } | null;
};

async function waitForPhase(room: RoomLike, phase: string, timeoutMs = 60000): Promise<void> {
  const started = Date.now();
  while (room.phase !== phase) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${phase} (still ${room.phase})`);
    await delay(50);
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
    await delay(180);
  }
}

async function newRoom(browser: Browser, playerCount: number): Promise<{ page: Page; sims: Sim[]; code: string; close: () => Promise<void> }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.goto(`http://localhost:${CLIENT_PORT}/host`);
  await page.getByTestId('audio-gate').click();
  await page.getByTestId('create-room').click();
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

// A raw observer socket joined to the room as the HOST would be, purely to
// timestamp server events on the same clock as the DOM sampler.
interface Marks {
  topOut: number | null;
  duelPick: number | null;
  duelVerdict: number | null;
  winnerLine: number | null;
  gameOver: number | null;
  phases: Array<{ t: number; phase: string }>;
}

function watchRoom(page: Page): Marks {
  const marks: Marks = { topOut: null, duelPick: null, duelVerdict: null, winnerLine: null, gameOver: null, phases: [] };
  page.on('console', () => undefined); // keep the console quiet but attached
  return marks;
}

// The server side of the same clock: a second socket in the room, listening to
// the PUBLIC events (phase changes are broadcast to everyone).
function markRoomEvents(socket: Socket, marks: Marks): void {
  socket.on(ServerEvents.PHASE_CHANGED, (p: { phase: string }) => {
    marks.phases.push({ t: Date.now(), phase: p.phase });
    if (p.phase === 'DUEL_PICK' && marks.duelPick === null) marks.duelPick = Date.now();
    // Only a SOCRATES beat AFTER a reveal can be endClimb's WINNER line: since
    // Task 236 the climb's own stage card plays ANAVASIS_INTRO_SEQUENCE as
    // three SOCRATES beats BEFORE the first question, and latching on those
    // would timestamp the wrong beat entirely.
    if (p.phase === 'SOCRATES' && marks.winnerLine === null && marks.topOut !== null) marks.winnerLine = Date.now();
  });
  socket.on(ServerEvents.CLIMB_REVEAL_SHOW, (p: { yourStep?: number; top?: number }) => {
    if (marks.topOut === null) marks.topOut = Date.now();
    void p;
  });
  socket.on(ServerEvents.DUEL_REVEAL_SHOW, () => {
    if (marks.duelVerdict === null) marks.duelVerdict = Date.now();
  });
  socket.on(ServerEvents.GAME_OVER, () => {
    if (marks.gameOver === null) marks.gameOver = Date.now();
  });
}

async function waitForCeremony(page: Page): Promise<void> {
  await page.getByTestId('anavasis-crowning').waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForTimeout(2600);
}

// ---------------------------------------------------------------------------
// The terminal-path reporter (criterion 4): after the ceremony has settled,
// what is on screen - scene, overlay, wreath, winner.
// ---------------------------------------------------------------------------
async function readTerminal(page: Page): Promise<{
  world: 'temple' | 'theatre';
  duelOverlay: boolean;
  ceremonyWreath: number;
  rowWreath: number;
  banner: string;
  climbers: number;
}> {
  return await page.evaluate(() => ({
    world: document.querySelector('[data-testid="anavasis-scene-container"]') ? ('temple' as const) : ('theatre' as const),
    duelOverlay: !!document.querySelector('[data-testid="anavasis-duel"]'),
    ceremonyWreath: document.querySelectorAll('[data-testid="anavasis-wreath"]').length,
    rowWreath: document.querySelectorAll('[data-testid="sophist-wreath"]').length,
    banner: (document.querySelector('[data-testid="anavasis-winner-banner"]')?.textContent ?? '').trim(),
    climbers: document.querySelectorAll('[data-testid="anavasis-climber"]').length,
  }));
}

function reportTerminal(
  label: string,
  dom: Awaited<ReturnType<typeof readTerminal>>,
  samples: WorldSample[],
  expectedWinnerName: string,
): void {
  // The WINNER beat is the stretch between the last reveal and the ceremony.
  // Any 'theatre' sample anywhere after the climb's first sample is defect A.
  const theatre = samples.filter((s) => s.world === 'theatre');
  const socratesPositions = [...new Set(samples.map((s) => s.socratesLeftPct).filter((v) => v !== null))];
  console.log(
    `  ${label}: scene=${dom.world}, duel overlay=${dom.duelOverlay}, ceremony wreath=${dom.ceremonyWreath}, ` +
      `row wreath=${dom.rowWreath}, winner="${dom.banner}", figures=${dom.climbers}`,
  );
  console.log(`  ${label}: Socrates left% seen across the whole finale: [${socratesPositions.join(', ')}]`);
  check(`${label}: the scene never left the temple`, theatre.length === 0, `${theatre.length} theatre sample(s) of ${samples.length}`);
  check(`${label}: exactly one wreath, the ceremony's`, dom.ceremonyWreath === 1 && dom.rowWreath === 0, `ceremony ${dom.ceremonyWreath}, row ${dom.rowWreath}`);
  check(`${label}: the duel overlay is gone at the ceremony`, !dom.duelOverlay);
  check(`${label}: the right winner is crowned`, dom.banner === expectedWinnerName, `"${dom.banner}" vs "${expectedWinnerName}"`);
}

async function main() {
  await import('../server/src/index.js');
  const { getRoom } = await import('../server/src/state.js');
  const { startClimb } = await import('../server/src/phases.js');
  // A real game plays GAME_INTRO_SEQUENCE (Task 236, ten lines) at stage 1,
  // long before the finale's own card, so room.gameIntroPlayed is true by the
  // time the climb is announced. This harness jumps straight to the climb, and
  // without seeding that flag the whole opening narration fires at the climb's
  // own STAGE_ANNOUNCE instead - CLIMB_QUESTION then never arrives in time.
  // dev/climb-ceremony-check.ts trips over exactly this today (see the Task
  // 237 report): it is the reason that suite currently times out.
  const beginClimb = (room: RoomLike): void => {
    room.gameIntroPlayed = true;
    startClimb(room as unknown as Parameters<typeof startClimb>[0]);
  };
  console.log(`in-process real server listening on ${SERVER_PORT}`);

  clientProc = spawn('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], {
    cwd: CLIENT_DIR,
    stdio: 'ignore',
    detached: true,
    env: { ...process.env, VITE_SERVER_URL: `http://localhost:${SERVER_PORT}` },
  });
  await waitForClient();
  console.log(`client dev server listening on ${CLIENT_PORT}`);

  const ONLY = process.env.ONLY_SCENARIO ?? '';
  const runs = (id: string): boolean => ONLY === '' || ONLY.includes(id);

  const browser = await chromium.launch();
  try {
    // -------------------------------------------------------------------
    // 1. Defect A - the winner sequence, sampled every 50ms.
    // -------------------------------------------------------------------
    if (runs('1')) {
      console.log('\n=== 1. A: the WINNER beat, top-arrival win (4 players) ===');
      const { page, sims, code, close } = await newRoom(browser, 4);
      const room = getRoom(code) as unknown as RoomLike;
      const marks = watchRoom(page);
      markRoomEvents(sims[0].socket, marks);
      await installSampler(page);
      beginClimb(room);
      await waitForPhase(room, 'CLIMB_QUESTION');
      const t0 = Date.now();
      room.climb!.steps.set(sims[0].playerId, CLIMB_TOP - 2);
      room.climb!.steps.set(sims[1].playerId, 4);
      room.climb!.steps.set(sims[2].playerId, 3);
      room.climb!.steps.set(sims[3].playerId, 2);
      await playRound(room, [
        { sim: sims[0], answer: 'correct' },
        { sim: sims[1], answer: 'wrong' },
        { sim: sims[2], answer: 'wrong' },
        { sim: sims[3], answer: 'wrong' },
      ]);
      await waitForCeremony(page);
      const samples = await readSamples(page);
      const climbSamples = samples.filter((s) => s.t >= t0);
      const rel = (t: number | null): string => (t === null ? 'n/a' : `+${((t - t0) / 1000).toFixed(2)}s`);
      console.log(`  top-out (CLIMB_REVEAL): ${rel(marks.topOut)}`);
      console.log(`  WINNER line (SOCRATES): ${rel(marks.winnerLine)}`);
      console.log(`  ceremony (GAME_OVER):   ${rel(marks.gameOver)}`);
      console.log('  scene at each transition (t, world, Socrates left%, slab, crowning):');
      for (const s of transitions(climbSamples)) {
        console.log(`    ${rel(s.t)}  ${s.world}  left=${s.socratesLeftPct ?? '-'}%  slab=${s.slab}  crowning=${s.crowning}`);
      }
      const between = climbSamples.filter(
        (s) => marks.winnerLine !== null && marks.gameOver !== null && s.t >= marks.winnerLine && s.t <= marks.gameOver,
      );
      const theatreDuring = between.filter((s) => s.world === 'theatre');
      console.log(`  samples during the WINNER beat: ${between.length}, of which theatre: ${theatreDuring.length}`);
      check(
        '1: the scene never leaves the temple between top-out and ceremony',
        climbSamples.filter((s) => s.world === 'theatre').length === 0,
        `${climbSamples.filter((s) => s.world === 'theatre').length} theatre sample(s)`,
      );
      check(
        '1: Socrates never leaves the temple terrace during the WINNER beat',
        between.every((s) => s.socratesLeftPct !== null && s.socratesLeftPct > 40),
        `left% during the beat: [${[...new Set(between.map((s) => s.socratesLeftPct))].join(', ')}]`,
      );
      const dom = await readTerminal(page);
      reportTerminal('1', dom, climbSamples, sims[0].name);
      await close();
    }

    // -------------------------------------------------------------------
    // 2. Defect B - the question slab vs the climbers near the top.
    // -------------------------------------------------------------------
    if (runs('2')) {
      console.log('\n=== 2. B: the question card vs the leader near the top (4 players) ===');
      const { page, sims, code, close } = await newRoom(browser, 4);
      const room = getRoom(code) as unknown as RoomLike;
      beginClimb(room);
      await waitForPhase(room, 'CLIMB_QUESTION');
      // Walk the leader up to real steps 6,7,8,9 in turn. Seeding S-2 and
      // answering fastest-correct (+2) puts them at exactly S on the NEXT
      // question, which is the frame that carries the slab.
      for (const target of [6, 7, 8, 9]) {
        room.climb!.steps.set(sims[0].playerId, target - 2);
        room.climb!.steps.set(sims[1].playerId, 3);
        room.climb!.steps.set(sims[2].playerId, 2);
        room.climb!.steps.set(sims[3].playerId, 1);
        await playRound(room, [
          { sim: sims[0], answer: 'correct' },
          { sim: sims[1], answer: 'wrong' },
          { sim: sims[2], answer: 'wrong' },
          { sim: sims[3], answer: 'wrong' },
        ]);
        await waitForPhase(room, 'CLIMB_QUESTION');
        await page.getByTestId('climb-question-slab').waitFor({ state: 'visible', timeout: 15000 });
        await page.waitForTimeout(400);
        const geom = await page.evaluate(() => {
          const slabEl = document.querySelector('[data-testid="climb-question-slab"]');
          const slab = slabEl ? slabEl.getBoundingClientRect() : null;
          const climbers = [...document.querySelectorAll('[data-testid="anavasis-climber"]')].map((el) => {
            const r = el.getBoundingClientRect();
            const nameEl = el.querySelector('[data-testid="anavasis-climber-name"]');
            const nr = nameEl ? nameEl.getBoundingClientRect() : null;
            return {
              name: (nameEl?.textContent ?? '').trim(),
              step: Number(el.getAttribute('data-step') ?? '-1'),
              left: Math.round(r.left),
              right: Math.round(r.right),
              top: Math.round(r.top),
              bottom: Math.round(r.bottom),
              nameTop: nr ? Math.round(nr.top) : null,
              nameBottom: nr ? Math.round(nr.bottom) : null,
            };
          });
          return {
            slab: slab
              ? { left: Math.round(slab.left), right: Math.round(slab.right), top: Math.round(slab.top), bottom: Math.round(slab.bottom) }
              : null,
            climbers,
          };
        });
        const slab = geom.slab!;
        console.log(`  leader at real step ${target}:`);
        console.log(`    slab box: x ${slab.left}..${slab.right}, y ${slab.top}..${slab.bottom}`);
        let worst = 0;
        let worstName = '';
        for (const c of geom.climbers) {
          const ox = Math.max(0, Math.min(slab.right, c.right) - Math.max(slab.left, c.left));
          const oy = Math.max(0, Math.min(slab.bottom, c.bottom) - Math.max(slab.top, c.top));
          const area = ox * oy;
          console.log(
            `    ${c.name || '(blank)'} step ${c.step}: x ${c.left}..${c.right}, y ${c.top}..${c.bottom}` +
              ` → overlap ${area}px² (${ox}x${oy})`,
          );
          if (area > worst) {
            worst = area;
            worstName = c.name || `step ${c.step}`;
          }
        }
        check(`2: no climber overlaps the question card at leader step ${target}`, worst === 0, worst ? `worst: ${worstName}, ${worst}px²` : 'all clear');
      }
      await close();
    }

    // -------------------------------------------------------------------
    // 3. Defect C - a cause:'top' duel: two arrivals in ONE reveal.
    // -------------------------------------------------------------------
    if (runs('3')) {
      console.log('\n=== 3. C: the top-arrival duel, from top-out to verdict (4 players) ===');
      const { page, sims, code, close } = await newRoom(browser, 4);
      const room = getRoom(code) as unknown as RoomLike;
      const marks = watchRoom(page);
      markRoomEvents(sims[0].socket, marks);
      wireDuelPicks(sims, new Map([[sims[0].playerId, 'xifos'], [sims[1].playerId, 'aspida']]));
      await installSampler(page);
      beginClimb(room);
      await waitForPhase(room, 'CLIMB_QUESTION');
      const t0 = Date.now();
      room.climb!.steps.set(sims[0].playerId, CLIMB_TOP - 2); // fastest correct: +2 -> TOP
      room.climb!.steps.set(sims[1].playerId, CLIMB_TOP - 1); // correct: +1 -> TOP
      room.climb!.steps.set(sims[2].playerId, 3);
      room.climb!.steps.set(sims[3].playerId, 3);
      await playRound(room, [
        { sim: sims[0], answer: 'correct' },
        { sim: sims[1], answer: 'correct' },
        { sim: sims[2], answer: 'wrong' },
        { sim: sims[3], answer: 'wrong' },
      ]);
      // Catch the pick window while it is open and read what the TV says.
      await page.getByTestId('anavasis-duel').waitFor({ state: 'visible', timeout: 20000 });
      await page.waitForTimeout(500);
      const duelText = await page.evaluate(() => {
        const root = document.querySelector('[data-testid="anavasis-duel"]');
        const reason = document.querySelector('[data-testid="anavasis-duel-reason"]');
        return {
          reason: (reason?.textContent ?? '').trim(),
          allText: (root ? (root as HTMLElement).innerText : '').replace(/\n+/g, ' | ').trim(),
        };
      });
      console.log(`  duel cause (server): ${room.climb!.duel?.cause ?? 'n/a'}`);
      console.log(`  TV reason line: "${duelText.reason}"`);
      console.log(`  all text in the duel overlay: "${duelText.allText}"`);
      await waitForCeremony(page);
      const samples = await readSamples(page);
      const climbSamples = samples.filter((s) => s.t >= t0);
      const rel = (t: number | null): string => (t === null ? 'n/a' : `+${((t - t0) / 1000).toFixed(2)}s`);
      console.log(`  top-out (both arrive):  ${rel(marks.topOut)}`);
      console.log(`  DUEL_PICK opens:        ${rel(marks.duelPick)}`);
      console.log(`  DUEL_REVEAL (verdict):  ${rel(marks.duelVerdict)}`);
      console.log(`  WINNER line:            ${rel(marks.winnerLine)}`);
      console.log(`  ceremony:               ${rel(marks.gameOver)}`);
      check('3: the duel is explained on screen', duelText.reason.length > 0, `reason: "${duelText.reason}"`);
      const winner = sims.find((s) => s.playerId === room.climb!.winnerPlayerId)!;
      const dom = await readTerminal(page);
      reportTerminal('3', dom, climbSamples, winner.name);
      await close();
    }

    // -------------------------------------------------------------------
    // 4. Inverse: every terminal path, each reporting scene/overlay/wreath/
    //    winner. The duel+ceremony overlay has three historical wrong paths,
    //    so a change to any of it re-verifies ALL of them, not just the one
    //    that was touched.
    // -------------------------------------------------------------------
    if (runs('4')) {
      // P3: the round cap with a UNIQUE highest step -> WINNER, no duel.
      {
        console.log('\n=== 4-P3. round cap, unique highest step (3 players) ===');
        const { page, sims, code, close } = await newRoom(browser, 3);
        const room = getRoom(code) as unknown as RoomLike;
        await installSampler(page);
        beginClimb(room);
        await waitForPhase(room, 'CLIMB_QUESTION');
        const t0 = Date.now();
        room.climb!.steps.set(sims[0].playerId, 6);
        room.climb!.steps.set(sims[1].playerId, 3);
        room.climb!.steps.set(sims[2].playerId, 1);
        room.climb!.roundsPlayed = CLIMB_MAX_ROUNDS - 1;
        await playRound(room, [
          { sim: sims[0], answer: 'correct' },
          { sim: sims[1], answer: 'correct' },
          { sim: sims[2], answer: 'wrong' },
        ]);
        await waitForCeremony(page);
        const winner = sims.find((s) => s.playerId === room.climb!.winnerPlayerId)!;
        console.log(`  nobody at CLIMB_TOP (${CLIMB_TOP}); winner by highest step: ${winner.name}`);
        const dom = await readTerminal(page);
        reportTerminal('4-P3', dom, (await readSamples(page)).filter((s) => s.t >= t0), winner.name);
        await close();
      }

      // P4: the round cap with a SHARED highest step -> duel -> winner.
      {
        console.log('\n=== 4-P4. round cap, shared highest step -> duel (3 players) ===');
        const { page, sims, code, close } = await newRoom(browser, 3);
        const room = getRoom(code) as unknown as RoomLike;
        wireDuelPicks(sims, new Map([[sims[0].playerId, 'xifos'], [sims[1].playerId, 'aspida']]));
        await installSampler(page);
        beginClimb(room);
        await waitForPhase(room, 'CLIMB_QUESTION');
        const t0 = Date.now();
        // Both answer correctly from the same step; the fastest gets +2 and
        // the other +1, so seed them one apart to land on the SAME step.
        room.climb!.steps.set(sims[0].playerId, 4);
        room.climb!.steps.set(sims[1].playerId, 5);
        room.climb!.steps.set(sims[2].playerId, 1);
        room.climb!.roundsPlayed = CLIMB_MAX_ROUNDS - 1;
        await playRound(room, [
          { sim: sims[0], answer: 'correct' },
          { sim: sims[1], answer: 'correct' },
          { sim: sims[2], answer: 'wrong' },
        ]);
        await waitForCeremony(page);
        const winner = sims.find((s) => s.playerId === room.climb!.winnerPlayerId)!;
        console.log(`  cap duel cause: ${room.climb!.duel?.cause ?? 'n/a'}; winner: ${winner.name}`);
        const dom = await readTerminal(page);
        reportTerminal('4-P4', dom, (await readSamples(page)).filter((s) => s.t >= t0), winner.name);
        await close();
      }

      // P5: Η Λόγχη - three sequential single strikes leave one survivor.
      {
        console.log('\n=== 4-P5. spear: last survivor wins (4 players) ===');
        const { page, sims, code, close } = await newRoom(browser, 4);
        const room = getRoom(code) as unknown as RoomLike;
        await installSampler(page);
        beginClimb(room);
        await waitForPhase(room, 'CLIMB_QUESTION');
        const t0 = Date.now();
        // One victim at a time: each needs two consecutive negative rounds at
        // step 0 (CLIMB_SPEAR_LIMIT = 2), and the others must stay off 0.
        for (const victim of [sims[3], sims[2], sims[1]]) {
          for (let strike = 0; strike < 2; strike++) {
            await waitForPhase(room, 'CLIMB_QUESTION');
            room.climb!.steps.set(sims[0].playerId, 3);
            for (const other of sims.slice(1)) {
              if (other !== victim && !room.climb!.eliminationOrder.includes(other.playerId)) {
                room.climb!.steps.set(other.playerId, 3);
              }
            }
            room.climb!.steps.set(victim.playerId, 0);
            const plan: Array<{ sim: Sim; answer: 'correct' | 'wrong' }> = [{ sim: sims[0], answer: 'correct' }];
            for (const other of sims.slice(1)) {
              if (room.climb!.eliminationOrder.includes(other.playerId)) continue;
              plan.push({ sim: other, answer: other === victim ? 'wrong' : 'correct' });
            }
            await playRound(room, plan);
          }
        }
        await waitForCeremony(page);
        const winner = sims.find((s) => s.playerId === room.climb!.winnerPlayerId)!;
        const elim = room.climb!.eliminationOrder.map((id) => sims.find((s) => s.playerId === id)?.name ?? '??');
        console.log(`  speared out, in order: [${elim.join(', ')}]; last survivor: ${winner.name}`);
        const dom = await readTerminal(page);
        reportTerminal('4-P5', dom, (await readSamples(page)).filter((s) => s.t >= t0), winner.name);
        await close();
      }

      // P6: a spear DUEL (two struck in one round) whose result leaves one.
      {
        console.log('\n=== 4-P6. spear duel -> last survivor (4 players) ===');
        const { page, sims, code, close } = await newRoom(browser, 4);
        const room = getRoom(code) as unknown as RoomLike;
        wireDuelPicks(sims, new Map([[sims[0].playerId, 'xifos'], [sims[3].playerId, 'aspida']]));
        await installSampler(page);
        beginClimb(room);
        await waitForPhase(room, 'CLIMB_QUESTION');
        const t0 = Date.now();
        // A spear duel only ENDS the climb when its loser leaves exactly ONE
        // player standing (nextAfterSpearEliminations, climb.ts), so the field
        // has to be down to two BEFORE the pair is struck together: strike
        // Βήτα out, then Γάμα out, and only then put Άλφα and Δέλτα on step 0
        // in the same round -> spear duel -> its loser out leaves the winner
        // alone on the stair. (Striking the pair with three still alive leaves
        // two, and the climb rightly carries on to the round cap instead.)
        for (const victim of [sims[1], sims[2]]) {
          for (let strike = 0; strike < 2; strike++) {
            await waitForPhase(room, 'CLIMB_QUESTION');
            for (const sim of sims) {
              if (room.climb!.eliminationOrder.includes(sim.playerId)) continue;
              room.climb!.steps.set(sim.playerId, sim === victim ? 0 : 3);
            }
            await playRound(
              room,
              sims
                .filter((sim) => !room.climb!.eliminationOrder.includes(sim.playerId))
                .map((sim) => ({ sim, answer: sim === victim ? ('wrong' as const) : ('correct' as const) })),
            );
          }
        }
        for (let strike = 0; strike < 2; strike++) {
          await waitForPhase(room, 'CLIMB_QUESTION');
          room.climb!.steps.set(sims[0].playerId, 0);
          room.climb!.steps.set(sims[3].playerId, 0);
          await playRound(room, [
            { sim: sims[0], answer: 'wrong' },
            { sim: sims[3], answer: 'wrong' },
          ]);
        }
        await waitForCeremony(page);
        const winner = sims.find((s) => s.playerId === room.climb!.winnerPlayerId)!;
        const elim = room.climb!.eliminationOrder.map((id) => sims.find((s) => s.playerId === id)?.name ?? '??');
        console.log(`  eliminations: [${elim.join(', ')}]; winner: ${winner.name}`);
        const dom = await readTerminal(page);
        reportTerminal('4-P6', dom, (await readSamples(page)).filter((s) => s.t >= t0), winner.name);
        await close();
      }

      // P7: the question pool running out - the second guard, same resolver.
      {
        console.log('\n=== 4-P7. question pool exhausted (3 players) ===');
        const { page, sims, code, close } = await newRoom(browser, 3);
        const room = getRoom(code) as unknown as RoomLike;
        await installSampler(page);
        beginClimb(room);
        await waitForPhase(room, 'CLIMB_QUESTION');
        const t0 = Date.now();
        room.climb!.steps.set(sims[0].playerId, 6);
        room.climb!.steps.set(sims[1].playerId, 3);
        room.climb!.steps.set(sims[2].playerId, 1);
        // Leave exactly this one question in the drawn pool: the next
        // startClimbQuestion then exhausts it and resolves at the cap.
        room.climb!.questions.length = room.climb!.questionIndex + 1;
        await playRound(room, [
          { sim: sims[0], answer: 'correct' },
          { sim: sims[1], answer: 'correct' },
          { sim: sims[2], answer: 'wrong' },
        ]);
        await waitForCeremony(page);
        const winner = sims.find((s) => s.playerId === room.climb!.winnerPlayerId)!;
        console.log(`  pool exhausted after ${room.climb!.roundsPlayed} round(s); winner: ${winner.name}`);
        const dom = await readTerminal(page);
        reportTerminal('4-P7', dom, (await readSamples(page)).filter((s) => s.t >= t0), winner.name);
        await close();
      }
    }
  } finally {
    await browser.close();
    killGroup(clientProc);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  killGroup(clientProc);
  process.exit(1);
});
