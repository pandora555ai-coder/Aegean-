// Task 219 verification harness for the duel-overlay-unmount fix and the
// socrates-intro removal. Combines full-lineup-check.ts's socket-level
// room driving (server/client throwaway spawn, wireHuman-style bot
// automation) with a real Playwright TV page so the acceptance criteria
// (DOM node counts, timing) can be OBSERVED from a running game, not
// inferred from reading code.
//
// Six scripted player sockets stand in for `?bot=6` (not server-side
// `isBot` bots): a bots-only room self-starts in the DEFAULT ('quiz')
// mode since Task 217, and only a real PLAYER connection can hold VIP and
// call vip:set_mode/vip:start_game to select 'full' - so socket #0 here
// joins first (VIP), sets mode, and starts the game itself. Functionally
// identical for this task's purpose: six players, all answering, driving
// a real 'full' mode game to the climb finale and a duel.
//
//   npx tsx dev/duel-overlay-check.ts            # main climb/duel run
//   npx tsx dev/duel-overlay-check.ts --sink      # supplementary trial-finale run (elimination sink only)
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { io, type Socket } from 'socket.io-client';
import { ClientEvents, DUEL_WEAPONS, ServerEvents, type GameModeId, type RoomSettings } from '@game/shared';

process.on('unhandledRejection', (err) => console.log('  unhandledRejection:', err));
process.on('uncaughtException', (err) => console.log('  uncaughtException:', err));

const ROOT = path.resolve(import.meta.dirname, '..');
const SERVER_DIR = path.join(ROOT, 'server');
const CLIENT_DIR = path.join(ROOT, 'client');
const SERVER_PORT = 3910; // distinct from every other harness's throwaway port
const CLIENT_PORT = 5911;
const ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const CLIENT_ORIGIN = `http://127.0.0.1:${CLIENT_PORT}`;

let serverProc: ChildProcess | null = null;
let clientProc: ChildProcess | null = null;
let browser: Browser | null = null;
const sockets: Socket[] = [];

function spawnDetached(cmd: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): ChildProcess {
  return spawn(cmd, args, { cwd, stdio: 'inherit', detached: true, env: { ...process.env, ...env } });
}
function killGroup(child: ChildProcess | null): void {
  if (!child || child.pid === undefined || child.killed) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // already gone
  }
}
async function cleanup(): Promise<void> {
  for (const s of sockets) s.disconnect();
  if (browser) await browser.close().catch(() => {});
  killGroup(clientProc);
  killGroup(serverProc);
}

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const ok = await new Promise<boolean>((resolve) => {
      const probe = io(ORIGIN, { reconnection: false, timeout: 1000 });
      probe.on('connect', () => {
        probe.disconnect();
        resolve(true);
      });
      probe.on('connect_error', () => {
        probe.disconnect();
        resolve(false);
      });
    });
    if (ok) return;
    await delay(500);
  }
  throw new Error(`server did not come up on port ${SERVER_PORT}`);
}
async function waitForClient(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const res = await fetch(`${CLIENT_ORIGIN}/`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await delay(500);
  }
  throw new Error(`client dev server did not come up on port ${CLIENT_PORT}`);
}

// --------------------------------------------------------------------------
// bot-like player automation (full-lineup-check.ts's wireHuman, generalized)
// --------------------------------------------------------------------------
const PLACEHOLDER_DRAWING =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
function pick(n: number): number {
  return Math.floor(Math.random() * n);
}
function wireBotLike(socket: Socket): void {
  const soon = (fn: () => void) => setTimeout(fn, 150 + Math.random() * 300);
  socket.on(ServerEvents.QUESTION_SHOW, (p: { options?: string[] }) => {
    if (!p.options) return;
    soon(() => socket.emit(ClientEvents.SUBMIT_ANSWER, { choice: pick(p.options!.length) }));
  });
  socket.on(ServerEvents.POWER_UP_SHOW, (p: { targets?: { playerId: string }[] }) => {
    if (!p.targets?.length) return;
    soon(() => socket.emit(ClientEvents.POWER_UP_CHOOSE, { effect: 'ink', targetPlayerId: p.targets![pick(p.targets!.length)].playerId }));
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
  socket.on(ServerEvents.TRIAL_QUESTION_SHOW, (p: { options?: string[]; onTrial?: boolean }) => {
    if (!p.options || p.onTrial === false) return;
    soon(() => socket.emit(ClientEvents.TRIAL_SUBMIT, { choice: pick(p.options!.length) }));
  });
  socket.on(ServerEvents.CLIMB_QUESTION_SHOW, (p: { options?: string[]; climbing?: boolean; eliminated?: boolean }) => {
    if (!p.options || p.climbing === false || p.eliminated) return;
    soon(() => socket.emit(ClientEvents.CLIMB_SUBMIT, { choice: pick(p.options!.length) }));
  });
  socket.on(ServerEvents.AGORA_QUESTION_SHOW, (p: { options?: string[]; answered?: boolean }) => {
    if (!p.options || p.answered) return;
    soon(() => socket.emit(ClientEvents.AGORA_SUBMIT, { choice: pick(p.options!.length) }));
  });
  socket.on(ServerEvents.DUEL_PICK_SHOW, (p: { youDuel?: boolean; picked?: boolean }) => {
    if (!p.youDuel || p.picked) return;
    soon(() => socket.emit(ClientEvents.DUEL_PICK, { weapon: DUEL_WEAPONS[pick(DUEL_WEAPONS.length)] }));
  });
  socket.on(ServerEvents.BLITZ_SHOW, (p: { total?: number; answeredCount?: number; progressByPlayerId?: unknown }) => {
    if (p.progressByPlayerId !== undefined || p.total === undefined) return;
    let next = p.answeredCount ?? 0;
    const swipe = () => {
      if (next >= p.total!) return;
      socket.emit(ClientEvents.BLITZ_SWIPE, { index: next, answeredTrue: Math.random() < 0.5 });
      next += 1;
      setTimeout(swipe, 150 + Math.random() * 300);
    };
    setTimeout(swipe, 150);
  });
}

function connect(): Socket {
  const s = io(ORIGIN, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  return s;
}
function waitFor<T = Record<string, unknown>>(socket: Socket, event: string, timeoutMs: number, predicate?: (p: T) => boolean): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for ${event} after ${timeoutMs}ms`));
    }, timeoutMs);
    function handler(p: T) {
      if (predicate && !predicate(p)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(p);
    }
    socket.on(event, handler);
  });
}
// Distinct avatars, not just distinct names - PLAYER_JOIN rejects a
// duplicate avatarId (AVATAR_TAKEN) unless the whole pool is already
// claimed, and joinPlayer here never listened for JOIN_REJECTED, so a
// repeated avatarId silently hung every join after the first for the full
// 15s timeout (found running this harness for the first time).
const AVATAR_POOL = ['sphinx', 'minotaur', 'medusa', 'cyclops', 'pegasus', 'centaur', 'cerberus'];
function joinPlayer(code: string, name: string, avatarIndex: number): Promise<Socket> {
  const s = connect();
  wireBotLike(s);
  const joined = waitFor(s, ServerEvents.PLAYER_JOINED, 15000);
  s.emit(ClientEvents.PLAYER_JOIN, { code, name, playerId: randomUUID(), avatarId: AVATAR_POOL[avatarIndex % AVATAR_POOL.length] });
  return joined.then(() => s);
}

interface DomCounts {
  duel: number;
  socratesIntro: number;
  stealToken: number;
  revealRing: number;
  sinkOut: number;
  crowning: number;
}
async function readDom(page: Page): Promise<DomCounts> {
  return page.evaluate(() => ({
    duel: document.querySelectorAll('[data-testid="anavasis-duel"]').length,
    socratesIntro: document.querySelectorAll('[data-testid="socrates-intro"]').length,
    stealToken: document.querySelectorAll('[data-testid="steal-token"]').length,
    revealRing: document.querySelectorAll('[data-testid="reveal-option"].correct-pop').length,
    sinkOut: document.querySelectorAll('[data-testid="sophist"].out').length,
    crowning: document.querySelectorAll('[data-testid="anavasis-crowning"]').length,
  }));
}

interface RunResult {
  samples: { label: string; t: number; counts: DomCounts; immediate?: DomCounts }[];
  maxSocratesIntroEver: number;
  maxStealToken: number;
  maxRevealRing: number;
  maxSinkOut: number;
  stealTokenSeenThenZero: boolean;
  revealRingSeenThenZero: boolean;
  sinkOutSeenThenZero: boolean;
  socratesBeatMs: number[];
  climbRoundMs: number[];
  gameOverReached: boolean;
  totalMs: number;
}

async function runMainClimbDuel(): Promise<RunResult> {
  const t0 = Date.now();
  const host = connect();
  const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
  host.emit(ClientEvents.CREATE_ROOM, {});
  const { code } = await created;
  console.log(`  room ${code} created (host socket only, no server bots)`);

  const players: Socket[] = [];
  for (let i = 0; i < 6; i++) {
    players.push(await joinPlayer(code, `Παίκτης${i}`, i));
  }
  const vip = players[0];

  await Promise.all([
    waitFor(vip, ServerEvents.SETTINGS_UPDATED, 8000),
    (async () => vip.emit(ClientEvents.VIP_UPDATE_SETTINGS, { gameLength: 'short' } as Partial<RoomSettings>))(),
  ]);
  await Promise.all([
    waitFor<{ mode: string }>(vip, ServerEvents.LOBBY_UPDATE, 8000, (p) => p.mode === 'full'),
    (async () => vip.emit(ClientEvents.VIP_SET_MODE, { mode: 'full' as GameModeId }))(),
  ]);

  // The TV: a real Playwright page, HOST_REJOIN'd into this exact room via
  // localStorage seeding, so it's a genuine render of what a TV shows -
  // not a second CREATE_ROOM'd room.
  const page = await browser!.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript((c: string) => {
    window.localStorage.setItem('hostRoomCode', c);
  }, code);
  await page.goto(`${CLIENT_ORIGIN}/host`);
  await page.waitForSelector('[data-testid="room-code"], [data-testid="anavasis-scene"], [data-testid="sophists-row"]', { timeout: 20000 }).catch(() => {});

  const samples: RunResult['samples'] = [];
  const socratesBeatMs: number[] = [];
  const climbRoundMs: number[] = [];
  let maxSocratesIntroEver = 0;
  let maxStealToken = 0;
  let maxRevealRing = 0;
  let maxSinkOut = 0;
  let stealTokenSeen = false;
  let stealTokenSeenThenZero = false;
  let revealRingSeen = false;
  let revealRingSeenThenZero = false;
  let sinkOutSeen = false;
  let sinkOutSeenThenZero = false;

  const poll = setInterval(async () => {
    try {
      const counts = await readDom(page);
      maxSocratesIntroEver = Math.max(maxSocratesIntroEver, counts.socratesIntro);
      maxStealToken = Math.max(maxStealToken, counts.stealToken);
      maxRevealRing = Math.max(maxRevealRing, counts.revealRing);
      maxSinkOut = Math.max(maxSinkOut, counts.sinkOut);
      if (counts.stealToken > 0) stealTokenSeen = true;
      else if (stealTokenSeen) stealTokenSeenThenZero = true;
      if (counts.revealRing > 0) revealRingSeen = true;
      else if (revealRingSeen) revealRingSeenThenZero = true;
      if (counts.sinkOut > 0) sinkOutSeen = true;
      else if (sinkOutSeen) sinkOutSeenThenZero = true;
    } catch {
      // page mid-navigation; skip this tick
    }
  }, 250);

  let lastSocratesStart = 0;
  let lastClimbQuestionStart = 0;
  let duelRevealCaptured = false;
  let climbQuestionsAfterDuel = 0;
  const gameOver = new Promise<void>((resolve) => {
    vip.on(ServerEvents.PHASE_CHANGED, (p: { phase: string }) => {
      const t = Date.now() - t0;
      if (p.phase === 'SOCRATES') lastSocratesStart = t;
      if (p.phase !== 'SOCRATES' && lastSocratesStart > 0) {
        socratesBeatMs.push(t - lastSocratesStart);
        lastSocratesStart = 0;
      }
      if (p.phase === 'CLIMB_QUESTION') {
        if (lastClimbQuestionStart > 0) climbRoundMs.push(t - lastClimbQuestionStart);
        lastClimbQuestionStart = t;
        if (duelRevealCaptured && climbQuestionsAfterDuel < 2) {
          climbQuestionsAfterDuel += 1;
          const label = climbQuestionsAfterDuel === 1 ? 'next climb_question:show' : 'one round later';
          (async () => {
            // The TV page has its OWN socket, separate from this vip
            // socket - both receive the same broadcast, but the TV's
            // React re-render lags this handler by some ms. Read twice:
            // immediately (as a diagnostic) and again after a settle
            // delay (the actual criterion-2 measurement), so a stale
            // pre-render read is visible rather than mistaken for the
            // overlay surviving.
            const immediate = await readDom(page);
            await delay(250);
            const counts = await readDom(page);
            samples.push({ label, t, counts, immediate });
          })();
        }
      }
      if (p.phase === 'GAME_OVER') resolve();
    });
    vip.on(ServerEvents.DUEL_REVEAL_SHOW, () => {
      const t = Date.now() - t0;
      duelRevealCaptured = true;
      (async () => {
        await delay(150);
        const counts = await readDom(page);
        samples.push({ label: 'duel_reveal:show', t, counts });
      })();
    });
  });

  vip.emit(ClientEvents.VIP_START_GAME, {});
  await Promise.race([gameOver, delay(600_000).then(() => { throw new Error('timed out waiting for GAME_OVER'); })]);
  await delay(1500); // let AnavasisCrowning settle in
  const counts = await readDom(page);
  samples.push({ label: 'winner ceremony (GAME_OVER)', t: Date.now() - t0, counts });
  clearInterval(poll);
  await delay(200);

  const totalMs = Date.now() - t0;
  await page.close().catch(() => {});
  for (const s of sockets.splice(0)) s.disconnect();

  return {
    samples,
    maxSocratesIntroEver,
    maxStealToken,
    maxRevealRing,
    maxSinkOut,
    stealTokenSeenThenZero,
    revealRingSeenThenZero,
    sinkOutSeenThenZero,
    socratesBeatMs,
    climbRoundMs,
    gameOverReached: true,
    totalMs,
  };
}

// Supplementary: finaleMode 'trial' so TRIAL_REVEAL's own elimination sink
// (.out on a sophist figure) actually fires - the climb finale never
// exercises this element (its own elimination visual lives on
// AnavasisClimbers, not SophistsRow). Small room, quiz mode alone would
// never reach the trial; use 'full' with finaleMode overridden.
async function runTrialSinkSupplement(): Promise<{ sinkSeenThenZero: boolean; maxSinkOut: number }> {
  const host = connect();
  const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
  host.emit(ClientEvents.CREATE_ROOM, {});
  const { code } = await created;

  const players: Socket[] = [];
  for (let i = 0; i < 4; i++) players.push(await joinPlayer(code, `Δικαστ${i}`, i));
  const vip = players[0];
  await Promise.all([
    waitFor(vip, ServerEvents.SETTINGS_UPDATED, 8000),
    (async () => vip.emit(ClientEvents.VIP_UPDATE_SETTINGS, { gameLength: 'short', finaleMode: 'trial' } as Partial<RoomSettings>))(),
  ]);
  await Promise.all([
    waitFor<{ mode: string }>(vip, ServerEvents.LOBBY_UPDATE, 8000, (p) => p.mode === 'full'),
    (async () => vip.emit(ClientEvents.VIP_SET_MODE, { mode: 'full' as GameModeId }))(),
  ]);

  const page = await browser!.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript((c: string) => {
    window.localStorage.setItem('hostRoomCode', c);
  }, code);
  await page.goto(`${CLIENT_ORIGIN}/host`);
  await page.waitForSelector('[data-testid="room-code"], [data-testid="sophists-row"]', { timeout: 20000 }).catch(() => {});

  let maxSinkOut = 0;
  let seen = false;
  let seenThenZero = false;
  const poll = setInterval(async () => {
    try {
      const counts = await readDom(page);
      maxSinkOut = Math.max(maxSinkOut, counts.sinkOut);
      if (counts.sinkOut > 0) seen = true;
      else if (seen) seenThenZero = true;
    } catch {
      // ignore mid-nav
    }
  }, 250);

  const over = waitFor(vip, ServerEvents.GAME_OVER, 600_000);
  vip.emit(ClientEvents.VIP_START_GAME, {});
  await over;
  await delay(2000);
  clearInterval(poll);
  await page.close().catch(() => {});
  for (const s of sockets.splice(0)) s.disconnect();
  return { sinkSeenThenZero: seenThenZero, maxSinkOut };
}

function fmt(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

async function main(): Promise<void> {
  const wantSink = process.argv.includes('--sink');
  await startServer();
  await startClient();
  browser = await chromium.launch();
  try {
    if (wantSink) {
      console.log('\n===== SUPPLEMENT: trial-finale elimination sink =====');
      const r = await runTrialSinkSupplement();
      console.log(`  max .out (sink) nodes observed: ${r.maxSinkOut}`);
      console.log(`  sink appeared then returned to 0 before GAME_OVER: ${r.sinkSeenThenZero}`);
      return;
    }
    console.log('\n===== MAIN: full mode, 6 players, climb finale =====');
    const r = await runMainClimbDuel();
    console.log(`  total run: ${fmt(r.totalMs)}, GAME_OVER reached: ${r.gameOverReached}`);
    console.log('\n  --- criterion 2: overlay lifecycle (anavasis-duel node count) ---');
    for (const s of r.samples) {
      const imm = s.immediate ? ` (immediate read: duel=${s.immediate.duel})` : '';
      console.log(`  [t=${fmt(s.t)}] ${s.label}: duel=${s.counts.duel} crowning=${s.counts.crowning} socratesIntro=${s.counts.socratesIntro}${imm}`);
    }
    console.log('\n  --- criterion 1: socrates-intro (should be 0 everywhere, always) ---');
    console.log(`  max socrates-intro nodes observed at ANY point in the run: ${r.maxSocratesIntroEver}`);
    console.log('\n  --- criterion 3: timing (this run only - compare against the pre-fix run\'s own numbers) ---');
    console.log(`  SOCRATES beat durations (ms): [${r.socratesBeatMs.join(', ')}]`);
    console.log(`  CLIMB round durations (ms, CLIMB_QUESTION -> next CLIMB_QUESTION): [${r.climbRoundMs.join(', ')}]`);
    console.log('\n  --- criterion 4: other overlays (regression) ---');
    console.log(`  steal-token: max=${r.maxStealToken}, appeared-then-returned-to-0=${r.stealTokenSeenThenZero}`);
    console.log(`  reveal-ring (correct-pop): max=${r.maxRevealRing}, appeared-then-returned-to-0=${r.revealRingSeenThenZero}`);
    console.log(`  elimination sink (.out): max=${r.maxSinkOut}, appeared-then-returned-to-0=${r.sinkOutSeenThenZero} (0 expected here - climb finale doesn't use SophistsRow's sink; see --sink run)`);
  } finally {
    await cleanup();
  }
}

async function startServer(): Promise<void> {
  serverProc = spawnDetached('npx', ['tsx', 'src/index.ts'], SERVER_DIR, { PORT: String(SERVER_PORT) });
  await waitForServer();
}
async function startClient(): Promise<void> {
  clientProc = spawnDetached('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], CLIENT_DIR, {
    VITE_SERVER_URL: ORIGIN,
  });
  await waitForClient();
}

main().then(
  () => process.exit(0),
  async (err) => {
    console.error(err);
    await cleanup();
    process.exit(1);
  },
);
