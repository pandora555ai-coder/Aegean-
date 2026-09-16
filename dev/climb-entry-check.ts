// Task 244 - the climb's ENTRY window, checked in a real browser against a
// real server, driven by a REAL `?bot=N&mode=full` game played end to end
// (no startClimb shortcut - the defect is about which stage the TV thinks a
// card belongs to, so the card has to arrive the way it does in a real show).
//
// Root cause under test: `isClimbFinale` (HostScreen) only flipped true when
// a CLIMB/DUEL payload arrived. The climb's own STAGE_ANNOUNCE card and the
// three ANAVASIS_INTRO_SEQUENCE rule-line beats (Task 236) all land BEFORE
// the first CLIMB_QUESTION, so for that whole window the TV rendered the
// quiz's TheatreScene and the wreathed SophistsRow - the fourth member of the
// wreath/overlay family Tasks 227 and 237 documented. The fix carries an
// additive `finale` field on StageAnnouncePayload AND SocratesShowPayload, so
// the server states which finale is in flight from the card onwards.
//
// Criteria, each reported with its own numbers:
//   1. The climb entry TIMELINE (card ts, each rule-line beat ts, first
//      CLIMB_QUESTION ts) with the committed scene across the whole window
//      and every wreath sighting in it.
//   3. Refresh resilience: reload the TV mid-announce (on the card, and again
//      during a rule line) - state:sync must restore the Anavasis world.
//   4. INVERSE: (i) every OTHER stage's announce still renders TheatreScene
//      with a normal row; (ii) play-again - game 2's stage-1 card is back on
//      TheatreScene, proving the signal is scoped to one game's climb.
//
// `?bot=1` deliberately: full's minPlayers is 2, and Task 217 auto-starts a
// room the instant it holds ONLY bots and canStartRoom passes, which would
// leave no VIP to press play-again (criterion 4ii). One bot never satisfies
// that floor, so the two scripted humans below join, the first becomes VIP,
// and the room starts the ordinary way with a bot in the roster.
//
//   npx tsx dev/climb-entry-check.ts            # criteria 1, 4i, 4ii
//   RELOAD=on npx tsx dev/climb-entry-check.ts  # criterion 3
// Throwaway ports, overridable so the default run and the RELOAD run can play
// their two full shows CONCURRENTLY (each takes ~10 minutes to reach the
// climb). Set before the server module is imported, which reads PORT at load.
process.env.PORT = process.env.SERVER_PORT ?? '3920';

import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { io as ioClient, type Socket } from 'socket.io-client';
import { CLIMB_TOP, ClientEvents, ServerEvents } from '@game/shared';

const SERVER_PORT = Number(process.env.SERVER_PORT) || 3920;
const CLIENT_PORT = Number(process.env.CLIENT_PORT) || 5921;
const ROOT = new URL('..', import.meta.url).pathname;
const CLIENT_DIR = `${ROOT}client`;
const RELOAD = process.env.RELOAD === 'on';

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
  for (let attempt = 0; attempt < 120; attempt++) {
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

// ---------------------------------------------------------------------------
// Timeline records
// ---------------------------------------------------------------------------
interface StageRecord {
  t: number;
  stage: number;
  totalStages: number;
  title: string;
  finale: string | null;
}
interface BeatRecord {
  t: number;
  beatId: number;
  kind: string;
  line: string;
}
interface Sample {
  t: number;
  world: 'temple' | 'theatre' | 'none';
  wreathVisible: boolean;
  rowOpacity: number | null;
  card: boolean;
  subtitle: boolean;
  climbers: number;
  socratesLeftPct: number | null;
}

const stages: StageRecord[] = [];
const beats: BeatRecord[] = [];
let firstClimbQuestionT: number | null = null;
let gameOverT: number | null = null;
let t0 = 0;
const now = (): number => Date.now() - t0;
const fmt = (ms: number | null): string => (ms === null ? '—' : `${(ms / 1000).toFixed(2)}s`);

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

const PLACEHOLDER_DRAWING =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const pick = (n: number): number => Math.floor(Math.random() * n);

// Same discipline as dev/intro-lines-check.ts: the scripted humans answer fast
// so every "all connected have answered" early-advance fires and the show runs
// near its floor instead of sitting out every timer.
function wireFastAnswers(socket: Socket): void {
  const soon = (fn: () => void) => setTimeout(fn, 250 + Math.random() * 350);
  socket.on(ServerEvents.QUESTION_SHOW, (p: { options?: string[] }) => {
    if (!p.options) return;
    soon(() => socket.emit(ClientEvents.SUBMIT_ANSWER, { choice: pick(p.options!.length) }));
  });
  socket.on(ServerEvents.POWER_UP_SHOW, (p: { targets?: { playerId: string }[] }) => {
    if (!p.targets?.length) return;
    soon(() =>
      socket.emit(ClientEvents.POWER_UP_CHOOSE, { effect: 'ink', targetPlayerId: p.targets![pick(p.targets!.length)].playerId }),
    );
  });
  socket.on(ServerEvents.STEAL_SHOW, (p: { youAreThief?: boolean; targets?: { playerId: string }[] }) => {
    if (!p.youAreThief || !p.targets?.length) return;
    soon(() => socket.emit(ClientEvents.STEAL_CHOOSE, { targetPlayerId: p.targets![pick(p.targets!.length)].playerId }));
  });
  socket.on(ServerEvents.DRAW_SHOW, (p: { wordToDraw?: string }) => {
    if (!p.wordToDraw) return;
    soon(() => socket.emit(ClientEvents.DRAW_SUBMIT, { image: PLACEHOLDER_DRAWING }));
  });
  socket.on(ServerEvents.GUESS_SHOW, (p: { isDrawer?: boolean; options?: string[] }) => {
    if (p.isDrawer === undefined || p.isDrawer || !p.options) return;
    soon(() => socket.emit(ClientEvents.DRAW_GUESS, { choice: pick(p.options!.length) }));
  });
  socket.on(ServerEvents.NUMERIC_QUESTION_SHOW, (p: { max?: number; submittedCount?: number }) => {
    if (p.submittedCount !== undefined || p.max === undefined) return;
    soon(() => socket.emit(ClientEvents.NUMERIC_SUBMIT, { value: pick(p.max! + 1) }));
  });
  socket.on(ServerEvents.AGORA_QUESTION_SHOW, (p: { options?: string[]; answered?: boolean }) => {
    if (!p.options || p.answered) return;
    soon(() => socket.emit(ClientEvents.AGORA_SUBMIT, { choice: pick(p.options!.length) }));
  });
  socket.on(ServerEvents.CLIMB_QUESTION_SHOW, (p: { options?: string[]; climbing?: boolean; lockedIn?: boolean }) => {
    if (!p.options || p.climbing !== true || p.lockedIn) return;
    soon(() => socket.emit(ClientEvents.CLIMB_SUBMIT, { choice: pick(p.options!.length) }));
  });
  socket.on(ServerEvents.DUEL_PICK_SHOW, () => {
    soon(() => socket.emit(ClientEvents.DUEL_PICK, { weapon: 'xifos' }));
  });
  let blitzGeneration = 0;
  socket.on(ServerEvents.BLITZ_SHOW, (p: { total?: number; answeredCount?: number; progressByPlayerId?: unknown }) => {
    if (p.progressByPlayerId !== undefined || p.total === undefined) return;
    blitzGeneration += 1;
    const mine = blitzGeneration;
    let next = p.answeredCount ?? 0;
    const swipe = () => {
      if (mine !== blitzGeneration || next >= p.total!) return;
      socket.emit(ClientEvents.BLITZ_SWIPE, { index: next, answeredTrue: Math.random() < 0.5 });
      next += 1;
      setTimeout(swipe, 140 + Math.random() * 140);
    };
    setTimeout(swipe, 140);
  });
}

// ---------------------------------------------------------------------------
// Browser instrumentation. No named local bindings inside any evaluate
// callback - esbuild's keep-names transform wraps a NAMED const arrow in a
// `__name` helper that does not travel with the function text Playwright
// ships to the page (the trap dev/climb-lane-check.ts documents).
// ---------------------------------------------------------------------------
async function installSampler(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __samples?: unknown[]; __sampler?: number; __wreathLast?: boolean; __wreathEvents?: string[] };
    w.__samples = [];
    w.__wreathEvents = [];
    w.__wreathLast = false;
    w.__sampler = window.setInterval(() => {
      const fig = document.querySelector('.socrates-figure-root') as HTMLElement | null;
      const row = document.querySelector('[data-testid="sophists-row"]') as HTMLElement | null;
      const wreath = document.querySelector('[data-testid="sophist-wreath"]');
      (w.__samples as unknown[]).push({
        t: Date.now(),
        world: document.querySelector('[data-testid="anavasis-scene-container"]')
          ? 'temple'
          : document.querySelector('[data-theatre-scene]')
            ? 'theatre'
            : 'none',
        wreathVisible: !!wreath && !!row && Number(getComputedStyle(row).opacity) > 0.05,
        rowOpacity: row ? Number(getComputedStyle(row).opacity) : null,
        card: !!document.querySelector('[data-testid="stage-announce"]'),
        subtitle: !!document.querySelector('[data-testid="socrates-subtitle"]'),
        climbers: document.querySelectorAll('[data-testid="anavasis-climber"]').length,
        socratesLeftPct:
          fig && getComputedStyle(fig).left
            ? Math.round((parseFloat(getComputedStyle(fig).left) / window.innerWidth) * 1000) / 10
            : null,
      });
    }, 50);
  });
}

// A MutationObserver catches a SINGLE-FRAME wreath flash the 50ms sampler
// could step over (the exact shape of the pre-fix gap). Records TRANSITIONS
// only - a wreath legitimately visible for whole stages would otherwise push
// thousands of entries across a full show.
async function armWreathWatch(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __wreathEvents?: string[]; __wreathLast?: boolean; __wreathObserver?: MutationObserver };
    w.__wreathEvents = w.__wreathEvents ?? [];
    w.__wreathLast = false;
    w.__wreathObserver = new MutationObserver(() => {
      const el = document.querySelector('[data-testid="sophist-wreath"]');
      const r = el ? el.closest('[data-testid="sophists-row"]') : null;
      const vis = !!el && !!r && Number(getComputedStyle(r as Element).opacity) > 0.05;
      if (vis !== w.__wreathLast) {
        w.__wreathLast = vis;
        (w.__wreathEvents as string[]).push(`${vis ? 'VISIBLE' : 'hidden'} @ ${Date.now()}`);
      }
    });
    w.__wreathObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  });
}

async function readSamples(page: Page): Promise<Sample[]> {
  return page.evaluate(() => ((window as unknown as { __samples?: Sample[] }).__samples ?? []) as Sample[]);
}
async function readWreathEvents(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __wreathEvents?: string[] }).__wreathEvents ?? []);
}
// The CURRENT committed scene, read directly rather than off the sampler.
async function readScene(page: Page): Promise<{ world: string; wreathVisible: boolean; card: boolean; subtitle: boolean; climbers: number }> {
  return page.evaluate(() => {
    const row = document.querySelector('[data-testid="sophists-row"]') as HTMLElement | null;
    const wreath = document.querySelector('[data-testid="sophist-wreath"]');
    return {
      world: document.querySelector('[data-testid="anavasis-scene-container"]')
        ? 'temple'
        : document.querySelector('[data-theatre-scene]')
          ? 'theatre'
          : 'none',
      wreathVisible: !!wreath && !!row && Number(getComputedStyle(row).opacity) > 0.05,
      card: !!document.querySelector('[data-testid="stage-announce"]'),
      subtitle: !!document.querySelector('[data-testid="socrates-subtitle"]'),
      climbers: document.querySelectorAll('[data-testid="anavasis-climber"]').length,
    };
  });
}

type RoomLike = { phase: string; stage: number; climb: unknown; socratesBeatId: number; pendingSocratesBeat: { kind: string; line: string } | null };

async function main(): Promise<void> {
  await import('../server/src/index.js');
  const { getRoom } = await import('../server/src/state.js');
  const { AVAILABLE_AVATAR_IDS } = await import('../server/src/avatars.js');
  // The ids that actually have art (7 of AVATAR_CATALOGUE's 24), in catalogue
  // order - the same list spawnBots walks. Bots take from the END of it
  // (bots.ts:466, Task 223), so the FRONT is collision-free for the scripted
  // humans; dev/stage-intro-check.ts is broken for exactly this reason.
  const humanAvatars = Array.from(AVAILABLE_AVATAR_IDS).slice(0, 2);
  console.log(`in-process real server listening on ${SERVER_PORT}; human avatars ${humanAvatars.join(', ')}`);

  clientProc = spawn('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], {
    cwd: CLIENT_DIR,
    stdio: 'ignore',
    detached: true,
    env: { ...process.env, VITE_SERVER_URL: `http://localhost:${SERVER_PORT}` },
  });
  await waitForClient();
  console.log(`client dev server listening on ${CLIENT_PORT}`);

  const browser: Browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const sims: Sim[] = [];
  try {
    await page.goto(`http://localhost:${CLIENT_PORT}/host?bot=1&mode=full`);
    await page.getByRole('button', { name: 'Create Room' }).click();
    const codeLocator = page.getByTestId('room-code');
    await codeLocator.waitFor({ state: 'visible', timeout: 20000 });
    const code = ((await codeLocator.textContent()) ?? '').replace(/\s+/g, '');
    console.log(`room ${code} created (?bot=1&mode=full)`);

    // Task 255 - names are PRESET-ONLY since Task 241/245 (isValidPlayerName
    // = strict membership in PRESET_NAMES), so the Greek-letter names this
    // suite was written with are rejected at join with INVALID_NAME. Same
    // replacements Tasks 246/249 already used for their own Greek-letter
    // names.
    sims.push(await joinSim('Άρης', humanAvatars[0], code));
    sims.push(await joinSim('Νίκη', humanAvatars[1], code));
    for (const sim of sims) wireFastAnswers(sim.socket);
    await delay(1200);

    // Timeline off a PLAYER socket: stage:announce and phase:changed are both
    // room-wide, so the card (and its new `finale` field) is observable
    // without the host's own privileged feed.
    const observer = sims[0].socket;
    observer.on(ServerEvents.STAGE_ANNOUNCE, (p: { stage: number; totalStages: number; title: string; finale: string | null }) => {
      stages.push({ t: now(), stage: p.stage, totalStages: p.totalStages, title: p.title, finale: p.finale ?? null });
      console.log(`  [${fmt(now())}] STAGE_ANNOUNCE ${p.stage}/${p.totalStages} "${p.title}" finale=${JSON.stringify(p.finale ?? null)}`);
    });
    observer.on(ServerEvents.CLIMB_QUESTION_SHOW, () => {
      if (firstClimbQuestionT === null) {
        firstClimbQuestionT = now();
        console.log(`  [${fmt(firstClimbQuestionT)}] first CLIMB_QUESTION`);
      }
    });
    observer.on(ServerEvents.GAME_OVER, () => {
      if (gameOverT === null) gameOverT = now();
    });

    await installSampler(page);
    await armWreathWatch(page);

    // SOCRATES beats are HOST-ONLY on the wire, so the rule lines are read off
    // the live Room instead (this harness runs the server in-process).
    const room = getRoom(code) as unknown as RoomLike;
    let lastBeatId = -1;
    const beatPoll = setInterval(() => {
      if (room.phase === 'SOCRATES' && room.socratesBeatId !== lastBeatId) {
        lastBeatId = room.socratesBeatId;
        const pending = room.pendingSocratesBeat;
        beats.push({ t: now(), beatId: room.socratesBeatId, kind: pending?.kind ?? 'REVEAL', line: (pending?.line ?? '').slice(0, 58) });
      }
    }, 25);

    t0 = Date.now();
    sims[0].socket.emit(ClientEvents.VIP_UPDATE_SETTINGS, { gameLength: 'short', finaleMode: 'climb' });
    await delay(300);
    sims[0].socket.emit(ClientEvents.VIP_START_GAME, {});
    console.log('game started (gameLength=short, finaleMode=climb)');

    // ---- criterion 3: reload ON the climb card, then again mid-narration ---
    const reloadReports: string[] = [];
    if (RELOAD) {
      // Poll for the climb's own card rather than a timer: it lands ~10
      // minutes in and only the room knows when.
      for (;;) {
        if (stages.some((s) => s.finale === 'climb')) break;
        if (firstClimbQuestionT !== null) break;
        await delay(50);
      }
      await delay(700);
      const before = await readScene(page);
      await page.reload();
      await page.waitForTimeout(2500);
      const afterCard = await readScene(page);
      reloadReports.push(`reload ON THE CARD: before=${JSON.stringify(before)} after=${JSON.stringify(afterCard)}`);
      check('3: reloading on the climb card restores the Anavasis world', afterCard.world === 'temple', `world=${afterCard.world}, wreath=${afterCard.wreathVisible}`);
      check('3: no wreathed sophists row after that reload', !afterCard.wreathVisible);
      await installSampler(page);
      await armWreathWatch(page);
      // A second reload during a RULE LINE (a plain SOCRATES beat, the case
      // the card alone cannot cover - its sync carries no card at all).
      if (firstClimbQuestionT === null) {
        await delay(1500);
        const midLine = await readScene(page);
        await page.reload();
        await page.waitForTimeout(2500);
        const afterLine = await readScene(page);
        reloadReports.push(`reload DURING A RULE LINE: before=${JSON.stringify(midLine)} after=${JSON.stringify(afterLine)}`);
        check('3: reloading during a rule-line beat restores the Anavasis world', afterLine.world === 'temple', `world=${afterLine.world}, wreath=${afterLine.wreathVisible}`);
        check('3: no wreathed sophists row after the rule-line reload', !afterLine.wreathVisible);
        await installSampler(page);
        await armWreathWatch(page);
      }
    }

    // ---- the entry window closes at the first CLIMB_QUESTION --------------
    // Deliberately NOT waiting for GAME_OVER first: criteria 1 and 4i are
    // fully determined the moment that question lands (~9 minutes in), while
    // the climb itself can then run for many more minutes. Reporting here
    // means a run cut short later still leaves these numbers in the log.
    if (RELOAD) {
      console.log('\n--- CRITERION 3 detail ---');
      for (const r of reloadReports) console.log(`  ${r}`);
      console.log(`\n${passed} passed, ${failed} failed`);
      return;
    }
    for (let waited = 0; firstClimbQuestionT === null && waited < 1_500_000; waited += 250) {
      await delay(250);
    }
    await delay(2500);
    clearInterval(beatPoll);

    const samples = await readSamples(page);
    const wreathEvents = await readWreathEvents(page);

    // ---- criterion 1: the entry timeline ---------------------------------
    console.log('\n--- CRITERION 1: climb entry timeline ---');
    const climbCard = stages.find((s) => s.finale === 'climb') ?? null;
    const cardT = climbCard?.t ?? null;
    const ruleLines = cardT === null ? [] : beats.filter((b) => b.t >= cardT && (firstClimbQuestionT === null || b.t <= firstClimbQuestionT));
    console.log(`  card "${climbCard?.title ?? '—'}" (stage ${climbCard?.stage}/${climbCard?.totalStages}, finale=${JSON.stringify(climbCard?.finale)}) @ ${fmt(cardT)}`);
    for (const b of ruleLines) console.log(`  rule-line beat #${b.beatId} (${b.kind}) @ ${fmt(b.t)} — "${b.line}"`);
    console.log(`  first CLIMB_QUESTION @ ${fmt(firstClimbQuestionT)}`);
    check('1: the climb card carries finale="climb" on the wire', climbCard?.finale === 'climb', `finale=${JSON.stringify(climbCard?.finale ?? null)}`);
    if (cardT !== null && firstClimbQuestionT !== null) {
      const winStart = t0 + cardT;
      const winEnd = t0 + firstClimbQuestionT;
      const win = samples.filter((s) => s.t >= winStart && s.t <= winEnd);
      const theatre = win.filter((s) => s.world === 'theatre');
      const wreathed = win.filter((s) => s.wreathVisible);
      const worlds = [...new Set(win.map((s) => s.world))];
      console.log(`  window ${fmt(cardT)}..${fmt(firstClimbQuestionT)} = ${win.length} samples; worlds seen: [${worlds.join(', ')}]`);
      console.log(`  card visible in ${win.filter((s) => s.card).length} samples, subtitle in ${win.filter((s) => s.subtitle).length}`);
      console.log(`  Socrates left%: [${[...new Set(win.map((s) => s.socratesLeftPct).filter((v) => v !== null))].join(', ')}]`);
      check('1: the committed scene is the Anavasis world for the WHOLE entry window', theatre.length === 0 && win.length > 0, `${theatre.length} theatre sample(s) of ${win.length}`);
      check('1: zero sophist-wreath sightings across the entry window', wreathed.length === 0, `${wreathed.length} wreathed sample(s)`);
      const flashes = wreathEvents.filter((e) => {
        const at = Number(e.split('@ ')[1]);
        return e.startsWith('VISIBLE') && at >= winStart && at <= winEnd;
      });
      check('1: the MutationObserver saw no wreath flash in the entry window', flashes.length === 0, flashes.length ? flashes.join(' | ') : 'no transitions to VISIBLE');
    } else {
      check('1: the climb entry window was observed', false, `cardT=${fmt(cardT)}, firstClimbQuestionT=${fmt(firstClimbQuestionT)}`);
    }

    // ---- criterion 4i: every other stage's announce -----------------------
    console.log('\n--- CRITERION 4i: every OTHER stage announce ---');
    let allTheatre = true;
    for (const st of stages.filter((s) => s.finale === null)) {
      const from = t0 + st.t + 200;
      const to = t0 + st.t + 1800;
      const win = samples.filter((s) => s.t >= from && s.t <= to);
      const worlds = [...new Set(win.map((s) => s.world))];
      const rowPresent = win.filter((s) => s.rowOpacity !== null).length;
      const ok = win.length > 0 && worlds.every((wld) => wld === 'theatre');
      if (!ok) allTheatre = false;
      console.log(`  stage ${st.stage}/${st.totalStages} "${st.title}" @ ${fmt(st.t)} — scene ${worlds.join('/') || 'no samples'} (${win.length} samples, row mounted in ${rowPresent})`);
    }
    check('4i: every non-finale stage card still commits TheatreScene', allTheatre, `${stages.filter((s) => s.finale === null).length} stage card(s) checked`);
    check('4i: exactly one card announced a finale', stages.filter((s) => s.finale !== null).length === 1, `${stages.filter((s) => s.finale !== null).length} finale card(s)`);

    // ---- criterion 4ii: play again ---------------------------------------
    {
      console.log('\n--- CRITERION 4ii: play again (game 2) ---');
      // Force the climb to a verdict rather than sitting through up to
      // CLIMB_MAX_ROUNDS (24 rounds x ~24s): criterion 4ii only needs A
      // GAME_OVER to play again from, and HOW the climb ended is irrelevant
      // to it. Same "seed the live Room" technique dev/finale-staging-check.ts
      // uses; it runs only AFTER criteria 1 and 4i are already reported.
      const pin = setInterval(() => {
        const climb = room.climb as { steps: Map<string, number>; climberIds: string[]; eliminationOrder: string[] } | null;
        if (room.phase === 'CLIMB_QUESTION' && climb) {
          for (const id of climb.climberIds) {
            if (!climb.eliminationOrder.includes(id)) climb.steps.set(id, CLIMB_TOP - 1);
          }
        }
      }, 120);
      for (let waited = 0; gameOverT === null && waited < 240000; waited += 250) await delay(250);
      clearInterval(pin);
      console.log(`  GAME_OVER at ${fmt(gameOverT)}`);
      const stagesBefore = stages.length;
      sims[0].socket.emit(ClientEvents.VIP_PLAY_AGAIN, {});
      await delay(2500);
      await installSampler(page);
      await armWreathWatch(page);
      sims[0].socket.emit(ClientEvents.VIP_START_GAME, {});
      for (let waited = 0; stages.length === stagesBefore && waited < 30000; waited += 100) await delay(100);
      await delay(900);
      const game2 = await readScene(page);
      const card2 = stages[stages.length - 1];
      console.log(`  game 2 stage ${card2?.stage}/${card2?.totalStages} "${card2?.title}" finale=${JSON.stringify(card2?.finale ?? null)}`);
      console.log(`  committed scene: ${JSON.stringify(game2)}`);
      check('4ii: game 2 opens on stage 1', card2?.stage === 1, `stage=${card2?.stage}`);
      check('4ii: game 2 stage-1 card announces NO finale (signal reset)', (card2?.finale ?? null) === null, `finale=${JSON.stringify(card2?.finale ?? null)}`);
      check('4ii: game 2 stage-1 card renders TheatreScene, not the temple', game2.world === 'theatre', `world=${game2.world}`);
    }

    console.log(`\n${passed} passed, ${failed} failed`);
  } finally {
    for (const sim of sims) sim.socket.disconnect();
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    killGroup(clientProc);
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  killGroup(clientProc);
  process.exit(1);
});
