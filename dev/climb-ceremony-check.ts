// Η Ανάβασις's ENDING, checked in a real browser: the final standings and
// the winner's position (Task 225). Five scenarios, each a real climb on a
// real server, read off a real TV:
//
//   A  a duel-decided finish (two arrivals at CLIMB_TOP in one reveal)
//   B  a spear elimination landing on the SAME reveal that crowns a winner
//   C  the round cap, with several players still climbing
//   D  a plain top-arrival win at every player count from 2 to 6
//   E  ranking after two eliminations, socket-level (no browser): the
//      elimination order as the reveals announce it vs. the standings the
//      game_over event carries
//
// Run one scenario with ONLY_SCENARIO=A (or any subset, e.g. ONLY_SCENARIO=CD).
//
// Shape follows dev/agora-scene-check.ts: the REAL server (server/src/
// index.ts's own socket handlers) runs in-process on a throwaway port set
// BEFORE the import - so its own listen never touches 3001 - and a
// throwaway Vite serves the real client. The only thing shortcut is the
// RUNUP: startClimb(room) is called directly instead of playing a whole
// quiz first, and room.climb.steps is seeded so the deciding round lands
// where each scenario needs it. Every phase from there is the real phase
// machine over real sockets into a real browser.
//
//   npx tsx dev/climb-ceremony-check.ts
process.env.PORT = '3910';

import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { io as ioClient, type Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents, CLIMB_TOP, CLIMB_MAX_ROUNDS, type DuelWeapon } from '@game/shared';

const SERVER_PORT = 3910;
const CLIENT_PORT = 5912;
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

// Weapons are handed out per-sim, never uniformly: every sim picking the
// same weapon is a guaranteed tie, and a tie re-runs DUEL_PICK forever.
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
const NAMES = ['Άλφα', 'Βήτα', 'Γάμα', 'Δέλτα', 'Έψιλον', 'Ζήτα'];

interface ClimberDom {
  playerId: string;
  name: string;
  step: number;
  className: string;
  opacity: number;
  bottomPx: number; // distance from the viewport bottom to the figure's own bottom edge
  centerXPx: number;
}

async function readCeremony(page: Page): Promise<{
  climbers: ClimberDom[];
  winnerBanner: string;
  wreath: { bottomPx: number; centerXPx: number } | null;
  duelOverlayPresent: boolean;
  sceneDigits: string;
  pageDigits: string;
  cornerRoomCode: string;
}> {
  const climbers = await page.locator('[data-testid="anavasis-climber"]').evaluateAll((els) =>
    els.map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        playerId: el.getAttribute('data-player-id') ?? '',
        name: (el.querySelector('[data-testid="anavasis-climber-name"]')?.textContent ?? '').trim(),
        step: Number(el.getAttribute('data-step') ?? '-1'),
        className: el.className,
        opacity: Number(getComputedStyle(el).opacity),
        bottomPx: window.innerHeight - rect.bottom,
        centerXPx: rect.left + rect.width / 2,
      };
    }),
  );
  const winnerBanner = ((await page.getByTestId('anavasis-winner-banner').textContent()) ?? '').trim();
  const wreathCount = await page.locator('[data-testid="anavasis-wreath"]').count();
  const wreath = wreathCount
    ? await page.locator('[data-testid="anavasis-wreath"]').evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return { bottomPx: window.innerHeight - rect.bottom, centerXPx: rect.left + rect.width / 2 };
      })
    : null;
  const duelOverlayPresent = (await page.locator('[data-testid="anavasis-duel"]').count()) > 0;
  const sceneText = (await page.getByTestId('anavasis-scene-container').innerText()) ?? '';
  // Criterion 1 asks for EVERY number on the screen, so the whole page is
  // swept too - not just the scene subtree - and each source named.
  const pageText = (await page.locator('body').innerText()) ?? '';
  const cornerRoomCode = (await page.locator('[data-testid="corner-room-code"]').count())
    ? ((await page.getByTestId('corner-room-code').textContent()) ?? '').trim()
    : '';
  return {
    climbers,
    winnerBanner,
    wreath,
    duelOverlayPresent,
    sceneDigits: (sceneText.match(/\d/g) ?? []).join(''),
    pageDigits: (pageText.match(/\d/g) ?? []).join(''),
    cornerRoomCode,
  };
}

function reportCeremony(label: string, sims: Sim[], dom: Awaited<ReturnType<typeof readCeremony>>, expectedWinner: Sim): void {
  const nameOf = (id: string): string => sims.find((s) => s.playerId === id)?.name ?? '??';
  console.log(`  winner banner: "${dom.winnerBanner}" (expected "${expectedWinner.name}")`);
  console.log(`  duel overlay still mounted at GAME_OVER: ${dom.duelOverlayPresent}`);
  console.log(`  digits anywhere in the scene container: "${dom.sceneDigits}" (expected "")`);
  console.log(`  digits anywhere on the WHOLE TV page: "${dom.pageDigits}" (corner room code = "${dom.cornerRoomCode}")`);
  console.log(
    `  figures: ${dom.climbers
      .map((c) => `${nameOf(c.playerId)}(step ${c.step}, bottom ${Math.round(c.bottomPx)}px, opacity ${c.opacity})`)
      .join(', ')}`,
  );
  if (dom.wreath) console.log(`  wreath: bottom ${Math.round(dom.wreath.bottomPx)}px, centre x ${Math.round(dom.wreath.centerXPx)}px`);

  const ids = dom.climbers.map((c) => c.playerId);
  check(`${label}: every player rendered exactly once`, new Set(ids).size === sims.length && ids.length === sims.length, `${ids.length} figures, ${new Set(ids).size} unique, ${sims.length} players`);
  const winner = dom.climbers.find((c) => c.playerId === expectedWinner.playerId);
  check(`${label}: the winner is on screen`, winner !== undefined);
  if (winner && dom.wreath) {
    const highest = Math.max(...dom.climbers.map((c) => c.bottomPx));
    check(`${label}: the winner stands highest of all figures`, winner.bottomPx === highest, `winner ${Math.round(winner.bottomPx)}px vs highest ${Math.round(highest)}px`);
    // The wreath hangs a fixed 9.4cqh above the temple step the winner is
    // meant to stand on; 1cqh = 7.2px at 720. Anything else means the
    // winner is NOT on the top step.
    const gap = dom.wreath.bottomPx - winner.bottomPx;
    check(`${label}: the winner stands directly under the wreath (top step)`, Math.abs(gap - 9.4 * 7.2) < 24, `gap ${Math.round(gap)}px, expected ~${Math.round(9.4 * 7.2)}px`);
    check(`${label}: the wreath is centred on the winner`, Math.abs(dom.wreath.centerXPx - winner.centerXPx) < 30, `wreath x ${Math.round(dom.wreath.centerXPx)}px vs winner x ${Math.round(winner.centerXPx)}px`);
  }
  const invisible = dom.climbers.filter((c) => c.opacity === 0);
  check(`${label}: no figure is invisible (opacity 0)`, invisible.length === 0, invisible.length ? `invisible: ${invisible.map((c) => nameOf(c.playerId)).join(', ')}` : 'all visible');
  check(`${label}: exactly one unfaded figure, and it is the winner`, dom.climbers.filter((c) => c.opacity === 1).length === 1 && dom.climbers.find((c) => c.opacity === 1)?.playerId === expectedWinner.playerId);
  check(`${label}: no digits anywhere in the ceremony`, dom.sceneDigits === '');
  check(`${label}: the only digits on the whole TV page are the room code`, dom.pageDigits === dom.cornerRoomCode.replace(/\D/g, ''), `page "${dom.pageDigits}" vs room code "${dom.cornerRoomCode}"`);
  check(`${label}: the duel overlay is gone`, !dom.duelOverlayPresent);
}

type RoomLike = {
  phase: string;
  code: string;
  climb: {
    questions: Array<{ correctIndex: number }>;
    questionIndex: number;
    steps: Map<string, number>;
    roundsPlayed: number;
    spearCounters: Map<string, number>;
    eliminationOrder: string[];
    winnerPlayerId: string | null;
  } | null;
};

async function waitForPhase(room: RoomLike, phase: string, timeoutMs = 40000): Promise<void> {
  const started = Date.now();
  while (room.phase !== phase) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${phase} (still ${room.phase})`);
    await delay(100);
  }
}

// One climb round, driven in a controlled answer ORDER so answerRank (and
// therefore the +2 fastest bonus) is deterministic.
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

async function waitForCeremony(page: Page): Promise<void> {
  await page.getByTestId('anavasis-crowning').waitFor({ state: 'visible', timeout: 60000 });
  // Let the last glide (CLIMB_GLIDE_MS = 1500) and the fade settle before
  // measuring anything - a mid-transition bounding box is not the ceremony.
  await page.waitForTimeout(2600);
}

// Scenario E's own plumbing: a raw HOST socket (no browser - this scenario
// is about the ORDER the server ranks people in, which no pixel carries)
// plus a player socket that is not tied to an avatar-grid click.
function connectRaw(): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://localhost:${SERVER_PORT}`, { reconnection: false });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
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

  const ONLY = process.env.ONLY_SCENARIO ?? '';
  const runs = (id: string): boolean => ONLY === '' || ONLY.includes(id);

  const browser = await chromium.launch();
  try {
    // -------------------------------------------------------------------
    // A. A duel-decided finish (Η Μονομαχία): two climbers reach CLIMB_TOP
    //    in the SAME reveal, the duel settles it, then the ceremony.
    // -------------------------------------------------------------------
    if (runs('A')) {
      console.log('\n=== A. duel-decided finish, 4 players ===');
      const { page, sims, code, close } = await newRoom(browser, 4);
      const room = getRoom(code) as unknown as RoomLike;
      wireDuelPicks(sims, new Map([[sims[0].playerId, 'xifos'], [sims[1].playerId, 'aspida']]));
      startClimb(room as never);
      await waitForPhase(room, 'CLIMB_QUESTION');
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
      await waitForCeremony(page);
      const winner = sims.find((s) => s.playerId === room.climb!.winnerPlayerId)!;
      console.log(`  duel winner (server): ${winner.name} (weapons: ξίφος vs ασπίδα - duelOutcome decides)`);
      const dom = await readCeremony(page);
      reportCeremony('A', sims, dom, winner);
      await close();
    }

    // -------------------------------------------------------------------
    // B. A spear elimination (Η Λόγχη) landing on the SAME reveal that
    //    crowns the winner - the one case where the last live payload is
    //    missing a player the standings still carry.
    // -------------------------------------------------------------------
    if (runs('B')) {
      console.log('\n=== B. spear elimination on the winning reveal, 4 players ===');
      const { page, sims, code, close } = await newRoom(browser, 4);
      const room = getRoom(code) as unknown as RoomLike;
      startClimb(room as never);
      await waitForPhase(room, 'CLIMB_QUESTION');
      room.climb!.steps.set(sims[0].playerId, 4);
      room.climb!.steps.set(sims[1].playerId, 4);
      room.climb!.steps.set(sims[2].playerId, 4);
      room.climb!.steps.set(sims[3].playerId, 0);
      // Round 1: Δέλτα is wrong at step 0 -> spear counter 1 of 2.
      await playRound(room, [
        { sim: sims[0], answer: 'correct' },
        { sim: sims[1], answer: 'correct' },
        { sim: sims[2], answer: 'correct' },
        { sim: sims[3], answer: 'wrong' },
      ]);
      await waitForPhase(room, 'CLIMB_QUESTION');
      console.log(`  after round 1: spear counters ${JSON.stringify([...room.climb!.spearCounters.values()])}`);
      // Round 2: Άλφα tops out (+2 from TOP-2) in the very same reveal that
      // takes Δέλτα's second strike.
      room.climb!.steps.set(sims[0].playerId, CLIMB_TOP - 2);
      room.climb!.steps.set(sims[3].playerId, 0);
      await playRound(room, [
        { sim: sims[0], answer: 'correct' },
        { sim: sims[1], answer: 'wrong' },
        { sim: sims[2], answer: 'wrong' },
        { sim: sims[3], answer: 'wrong' },
      ]);
      await waitForCeremony(page);
      const winner = sims.find((s) => s.playerId === room.climb!.winnerPlayerId)!;
      const elimNames = room.climb!.eliminationOrder.map((id) => sims.find((s) => s.playerId === id)?.name ?? '??');
      console.log(`  server winner: ${winner.name}; eliminationOrder: [${elimNames.join(', ')}]`);
      const dom = await readCeremony(page);
      reportCeremony('B', sims, dom, winner);
      await close();
    }

    // -------------------------------------------------------------------
    // C. The round cap with THREE players still climbing (criterion 3),
    //    read off the TV: the figures' own heights are the standings.
    // -------------------------------------------------------------------
    if (runs('C')) {
      console.log('\n=== C. round-cap finish, 3 still climbing ===');
      const { page, sims, code, close } = await newRoom(browser, 3);
      const room = getRoom(code) as unknown as RoomLike;
      startClimb(room as never);
      await waitForPhase(room, 'CLIMB_QUESTION');
      room.climb!.steps.set(sims[0].playerId, 6);
      room.climb!.steps.set(sims[1].playerId, 3);
      room.climb!.steps.set(sims[2].playerId, 1);
      room.climb!.roundsPlayed = CLIMB_MAX_ROUNDS - 1;
      await playRound(room, [
        { sim: sims[0], answer: 'correct' }, // fastest: 6 -> 8
        { sim: sims[1], answer: 'correct' }, // 3 -> 4
        { sim: sims[2], answer: 'wrong' }, // 1 -> 0
      ]);
      await waitForCeremony(page);
      const steps = sims.map((s) => `${s.name}=${room.climb!.steps.get(s.playerId)}`);
      const winner = sims.find((s) => s.playerId === room.climb!.winnerPlayerId)!;
      console.log(`  final steps: ${steps.join(', ')}; nobody at CLIMB_TOP (${CLIMB_TOP}); eliminations: ${room.climb!.eliminationOrder.length}`);
      const dom = await readCeremony(page);
      reportCeremony('C', sims, dom, winner);
      const nameOf = (id: string): string => sims.find((s) => s.playerId === id)?.name ?? '??';
      const byHeight = [...dom.climbers].sort((a, b) => b.bottomPx - a.bottomPx).map((c) => nameOf(c.playerId));
      console.log(`  figures top-to-bottom on the stair: ${byHeight.join(' > ')}`);
      check('C: still-climbing players stand in step order (highest step highest)', byHeight.join(',') === `${sims[0].name},${sims[1].name},${sims[2].name}`, byHeight.join(' > '));
      await close();
    }
    // -------------------------------------------------------------------
    // D. Criterion 4's sweep: a plain top-arrival win at EVERY player count
    //    from 2 to 6, checking the roster of figures against the roster of
    //    players each time (nobody twice, nobody missing, nobody invisible).
    // -------------------------------------------------------------------
    for (const playerCount of runs('D') ? [2, 3, 4, 5, 6] : []) {
      console.log(`\n=== D. top-arrival win, ${playerCount} players ===`);
      const { page, sims, code, close } = await newRoom(browser, playerCount);
      const room = getRoom(code) as unknown as RoomLike;
      startClimb(room as never);
      await waitForPhase(room, 'CLIMB_QUESTION');
      // The winner two steps from the top; everyone else spread down the
      // stair on distinct steps so no two figures overlap.
      room.climb!.steps.set(sims[0].playerId, CLIMB_TOP - 2);
      for (let i = 1; i < sims.length; i++) room.climb!.steps.set(sims[i].playerId, Math.max(1, CLIMB_TOP - 3 - i));
      await playRound(
        room,
        sims.map((sim, index) => ({ sim, answer: index === 0 ? ('correct' as const) : ('wrong' as const) })),
      );
      await waitForCeremony(page);
      const winner = sims.find((s) => s.playerId === room.climb!.winnerPlayerId)!;
      const dom = await readCeremony(page);
      const renderedNames = dom.climbers.map((c) => sims.find((s) => s.playerId === c.playerId)?.name ?? '??').sort();
      console.log(`  roster: [${sims.map((s) => s.name).sort().join(', ')}]`);
      console.log(`  figures on screen: [${renderedNames.join(', ')}]`);
      reportCeremony(`D${playerCount}`, sims, dom, winner);
      check(`D${playerCount}: the figures ARE the roster, exactly`, renderedNames.join(',') === sims.map((s) => s.name).sort().join(','));
      await close();
    }

    // -------------------------------------------------------------------
    // E. Criterion 2, over the WIRE: two sequential spear eliminations then
    //    a top arrival, with the elimination order recorded as the reveals
    //    actually announce it and the standings read off the game_over
    //    event - never off room.climb, never off a payload builder called
    //    by hand.
    // -------------------------------------------------------------------
    if (runs('E')) {
      console.log('\n=== E. ranking after two eliminations, 5 players (socket-level) ===');
      const { AVAILABLE_AVATAR_IDS } = await import('../server/src/avatars.js');
      const host = await connectRaw();
      const code = await new Promise<string>((resolve) => {
        host.once(ServerEvents.ROOM_CREATED, (payload: { code: string }) => resolve(payload.code));
        host.emit(ClientEvents.CREATE_ROOM, {});
      });
      const avatars = [...AVAILABLE_AVATAR_IDS];
      const sims: Sim[] = [];
      for (let i = 0; i < 5; i++) {
        const socket = await connectRaw();
        const playerId = randomUUID();
        await new Promise<void>((resolve, reject) => {
          socket.once(ServerEvents.PLAYER_JOINED, () => resolve());
          socket.once(ServerEvents.JOIN_REJECTED, (p: unknown) => reject(new Error(JSON.stringify(p))));
          socket.emit(ClientEvents.PLAYER_JOIN, { code, name: NAMES[i], playerId, avatarId: avatars[i] });
        });
        sims.push({ name: NAMES[i], playerId, socket });
      }
      const nameOf = (id: string): string => sims.find((s) => s.playerId === id)?.name ?? '??';
      const observed: string[] = [];
      host.on(ServerEvents.CLIMB_REVEAL_SHOW, (payload: { results?: Array<{ playerId: string; eliminated?: boolean }> }) => {
        for (const result of payload.results ?? []) {
          if (result.eliminated && !observed.includes(result.playerId)) {
            observed.push(result.playerId);
            console.log(`  reveal struck out: ${nameOf(result.playerId)}`);
          }
        }
      });
      const gameOverPromise = new Promise<{ standings: Array<{ playerId: string; name: string; rank: number; score: number }>; isTrialResult: boolean }>(
        (resolve) => host.once(ServerEvents.GAME_OVER, resolve as never),
      );
      const room = getRoom(code) as unknown as RoomLike;
      startClimb(room as never);
      const [a, b, c, d, e] = sims;
      const seed = (pairs: Array<[Sim, number]>): void => {
        for (const [sim, step] of pairs) room.climb!.steps.set(sim.playerId, step);
      };
      // Round 1: Δέλτα and Έψιλον idle at step 0 and both answer wrong - one
      // strike each, nobody out yet. Άλφα is re-seeded low every round, or
      // +2 a round tops them out before the second spearing lands.
      await waitForPhase(room, 'CLIMB_QUESTION');
      seed([[a, 3], [b, 3], [c, 3], [d, 0], [e, 0]]);
      await playRound(room, [
        { sim: a, answer: 'correct' }, { sim: b, answer: 'correct' }, { sim: c, answer: 'correct' },
        { sim: d, answer: 'wrong' }, { sim: e, answer: 'wrong' },
      ]);
      // Round 2: Δέλτα's second strike - out FIRST. Έψιλον answers correctly,
      // which moves them off step 0 and resets their own counter.
      await waitForPhase(room, 'CLIMB_QUESTION');
      seed([[d, 0], [a, 3], [b, 3], [c, 3]]);
      await playRound(room, [
        { sim: a, answer: 'correct' }, { sim: b, answer: 'correct' }, { sim: c, answer: 'correct' },
        { sim: e, answer: 'correct' }, { sim: d, answer: 'wrong' },
      ]);
      // Rounds 3-4: Έψιλον back at 0 and wrong twice - out SECOND.
      for (let round = 0; round < 2; round++) {
        await waitForPhase(room, 'CLIMB_QUESTION');
        seed([[e, 0], [a, 3], [b, 3], [c, 3]]);
        await playRound(room, [
          { sim: a, answer: 'correct' }, { sim: b, answer: 'correct' }, { sim: c, answer: 'correct' },
          { sim: e, answer: 'wrong' },
        ]);
      }
      // Άλφα tops out, Βήτα a clear step above Γάμα so the survivors are
      // ordered by a real step difference rather than a tie-break.
      await waitForPhase(room, 'CLIMB_QUESTION');
      seed([[a, CLIMB_TOP - 2], [b, 5], [c, 2]]);
      await playRound(room, [{ sim: a, answer: 'correct' }, { sim: b, answer: 'correct' }, { sim: c, answer: 'correct' }]);

      const gameOver = await gameOverPromise;
      const standingNames = gameOver.standings.map((s) => s.name);
      const eliminatedNames = observed.map(nameOf);
      const tail = standingNames.slice(standingNames.length - eliminatedNames.length);
      console.log(`  elimination order OBSERVED live: [${eliminatedNames.join(', ')}]`);
      console.log(`  final standings from the game_over event: ${gameOver.standings.map((s) => `#${s.rank} ${s.name}`).join(', ')}`);
      console.log(`  score field in that payload: [${gameOver.standings.map((s) => s.score).join(', ')}] - carried, never rendered (isTrialResult=${gameOver.isTrialResult})`);
      check('E: exactly 2 players were eliminated', eliminatedNames.length === 2, `[${eliminatedNames.join(', ')}]`);
      check('E: the winner ranks #1', standingNames[0] === a.name, `#1 is ${standingNames[0]}`);
      check('E: eliminated players fill the bottom of the standings', tail.every((n) => eliminatedNames.includes(n)), `bottom: [${tail.join(', ')}]`);
      check('E: the eliminated tail is the exact REVERSE of the elimination order', tail.join(',') === [...eliminatedNames].reverse().join(','), `[${tail.join(', ')}] vs [${[...eliminatedNames].reverse().join(', ')}]`);
      check('E: survivors rank above every eliminated player, by steps', standingNames[1] === b.name && standingNames[2] === c.name, `#2 ${standingNames[1]} (step ${room.climb!.steps.get(b.playerId)}), #3 ${standingNames[2]} (step ${room.climb!.steps.get(c.playerId)})`);
      check('E: ranks are a clean 1..5 with no duplicates', gameOver.standings.map((s) => s.rank).join(',') === '1,2,3,4,5');
      check('E: every player appears exactly once', new Set(gameOver.standings.map((s) => s.playerId)).size === 5);
      check('E: flagged as a position-only result (isTrialResult)', gameOver.isTrialResult === true);
      host.disconnect();
      for (const sim of sims) sim.socket.disconnect();
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
