// Task 253 - Η Παλαίστρα's second round, observed from running games.
//
// The REAL server runs IN-PROCESS on a throwaway port (pause-resume-check.ts's
// own pattern: process.env.PORT is set before the server is imported, and the
// import is dynamic because ESM hoists every static one above it), so the
// harness can read the LIVE Room and report what the shared timer was actually
// holding rather than inferring it from how long something took.
//
//   SCENARIO=A  a 5-bot `mode=full` show, end to end, socket-level (no
//               browser): per-round statement counts and hashes, the repeat
//               check, every STAGE_ANNOUNCE card and STAGE_INTRO beat, and
//               GAME_OVER's own stageDurations table (Task 239).
//               Criteria 2, 3, 4.
//   SCENARIO=B  a standalone `mode=blitz` room with a real TV in a real
//               browser: pause mid-round-2 and pause in the between-rounds
//               transition, sampling the server's remaining timer AND the TV's
//               own displayed countdown either side of a 3s hold. Criterion 5.
//
// Scenario A works unchanged against pre-253 code (the round fields are simply
// absent there and default to 1/1), which is what makes the before/after
// stage-timing comparison an apples-to-apples one.
process.env.PORT = process.env.SERVER_PORT ?? '3960';

import { createHash, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { io as ioClient, type Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents } from '@game/shared';

const SERVER_PORT = Number(process.env.SERVER_PORT ?? 3960);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5961);
const SCENARIO = (process.env.SCENARIO ?? 'A').toUpperCase();
const LABEL = process.env.LABEL ?? SCENARIO;
const ROOT = new URL('..', import.meta.url).pathname;

// Task 241/245 made names PRESET-ONLY, so older harnesses' Greek-letter names
// are rejected with INVALID_NAME. Drawn from the FRONT of the catalogue; bots
// take theirs from the END.
const NAMES = ['Άρης', 'Νίκη', 'Χαρά', 'Τάκης'];
const AVATARS = ['minotaur', 'medusa', 'cyclops', 'centaur'];

let clientProc: ChildProcess | null = null;
let browser: Browser | null = null;
const sockets: Socket[] = [];

function shortHash(text: string): string {
  return createHash('sha1').update(text).digest('hex').slice(0, 8);
}

function killGroup(child: ChildProcess | null): void {
  if (!child || child.pid === undefined || child.killed) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
}

async function cleanup(): Promise<void> {
  for (const socket of sockets) socket.disconnect();
  if (browser) await browser.close().catch(() => {});
  killGroup(clientProc);
}

// --------------------------------------------------------------------------
// the host socket: creates the room and, crucially, ACKS every Socrates beat
// (without the ack every beat rides its full audio backstop and every
// timestamp the run reports is wrong - intro-lines-check.ts's own finding).
// --------------------------------------------------------------------------
interface HostHooks {
  onStageAnnounce?: (payload: any) => void;
  onSocrates?: (payload: any) => void;
  onBlitzShow?: (payload: any) => void;
  onBlitzReveal?: (payload: any) => void;
  onGameOver?: (payload: any) => void;
}

function connectHost(create: Record<string, unknown>, hooks: HostHooks): Promise<{ socket: Socket; code: string }> {
  return new Promise((resolve, reject) => {
    const socket: Socket = ioClient(`http://localhost:${SERVER_PORT}`, { reconnection: false });
    sockets.push(socket);
    socket.on('connect', () => socket.emit(ClientEvents.CREATE_ROOM, create));
    socket.on(ServerEvents.SOCRATES_SHOW, (payload: any) => {
      hooks.onSocrates?.(payload);
      // Pause-aware ack, echoing the beat id (Task 236).
      socket.emit(ClientEvents.SOCRATES_AUDIO_ENDED, { beatId: payload?.beatId });
    });
    if (hooks.onStageAnnounce) socket.on(ServerEvents.STAGE_ANNOUNCE, hooks.onStageAnnounce);
    if (hooks.onBlitzShow) socket.on(ServerEvents.BLITZ_SHOW, hooks.onBlitzShow);
    if (hooks.onBlitzReveal) socket.on(ServerEvents.BLITZ_REVEAL_SHOW, hooks.onBlitzReveal);
    if (hooks.onGameOver) socket.on(ServerEvents.GAME_OVER, hooks.onGameOver);
    socket.once(ServerEvents.ROOM_CREATED, (payload: any) => resolve({ socket, code: payload.code }));
    socket.once('connect_error', reject);
    setTimeout(() => reject(new Error('host never got room:created')), 20000);
  });
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
    sockets.push(socket);
    socket.on('connect', () => socket.emit(ClientEvents.PLAYER_JOIN, { code, name, playerId, avatarId }));
    socket.once(ServerEvents.PLAYER_JOINED, () => resolve({ name, playerId, socket }));
    socket.once(ServerEvents.JOIN_REJECTED, (p: unknown) =>
      reject(new Error(`sim join rejected: ${JSON.stringify(p)}`)),
    );
    socket.once('connect_error', reject);
  });
}

// --------------------------------------------------------------------------
// SCENARIO A - the whole show, socket level. Criteria 2, 3, 4.
// --------------------------------------------------------------------------
async function scenarioA(): Promise<void> {
  const stageCards: { stage: number; title: string; at: number }[] = [];
  const introBeats: { kind: string; line: string; at: number }[] = [];
  const blitzWindows: { round: number; totalRounds: number; total: number; at: number }[] = [];
  const blitzReveals: { round: number; totalRounds: number; hasNextRound: boolean; texts: string[] }[] = [];
  let gameOver: any = null;
  const t0 = Date.now();
  const rel = () => ((Date.now() - t0) / 1000).toFixed(1);

  const { code } = await connectHost(
    { botCount: 5, mode: 'full' },
    {
      onStageAnnounce: (p) => {
        stageCards.push({ stage: p.stage, title: p.title, at: Date.now() });
        console.log(`[${rel()}s] STAGE_ANNOUNCE stage=${p.stage}/${p.totalStages} "${p.title}"`);
      },
      onSocrates: (p) => {
        if (p?.kind === 'STAGE_INTRO' || p?.kind === 'GAME_INTRO') {
          introBeats.push({ kind: p.kind, line: p.line, at: Date.now() });
          console.log(`[${rel()}s] SOCRATES ${p.kind}: ${String(p.line).slice(0, 60)}`);
        }
      },
      onBlitzShow: (p) => {
        if (!('progressByPlayerId' in (p ?? {}))) return; // host payload only
        const round = p.round ?? 1;
        const totalRounds = p.totalRounds ?? 1;
        blitzWindows.push({ round, totalRounds, total: p.total, at: Date.now() });
        console.log(`[${rel()}s] BLITZ window round=${round}/${totalRounds} statements=${p.total}`);
      },
      onBlitzReveal: (p) => {
        if (!('results' in (p ?? {}))) return; // host payload only
        blitzReveals.push({
          round: p.round ?? 1,
          totalRounds: p.totalRounds ?? 1,
          hasNextRound: p.hasNextRound ?? false,
          texts: (p.statements ?? []).map((s: any) => s.text),
        });
        console.log(`[${rel()}s] BLITZ_REVEAL round=${p.round ?? 1} hasNextRound=${p.hasNextRound ?? false}`);
      },
      onGameOver: (p) => {
        gameOver = p;
        console.log(`[${rel()}s] GAME_OVER`);
      },
    },
  );
  console.log(`room ${code} created (5 bots, mode=full) - auto-start is Task 217's own path\n`);

  const deadline = Date.now() + 30 * 60 * 1000;
  while (!gameOver && Date.now() < deadline) await delay(500);
  if (!gameOver) throw new Error('game never reached GAME_OVER');

  // ---- criterion 2: rounds, counts, and the repeat check --------------------
  console.log('\n================ CRITERION 2 - two rounds, zero repeats ================');
  console.log(`swipe windows observed: ${blitzWindows.length}`);
  for (const w of blitzWindows) console.log(`  round ${w.round}/${w.totalRounds}: ${w.total} statements`);
  const perRoundHashes = blitzReveals.map((r) => r.texts.map(shortHash));
  blitzReveals.forEach((r, i) => {
    console.log(`  round ${r.round} statement hashes (${r.texts.length}): ${perRoundHashes[i].join(' ')}`);
  });
  const all = perRoundHashes.flat();
  const dupes = all.filter((h, i) => all.indexOf(h) !== i);
  console.log(`  total statements across the stage: ${all.length}`);
  console.log(`  distinct hashes: ${new Set(all).size}`);
  console.log(`  repeated hashes: ${dupes.length === 0 ? 'NONE' : dupes.join(' ')}`);

  // ---- criterion 4: the card and the intro line, exactly once ---------------
  console.log('\n================ CRITERION 4 - card + intro line play once ==============');
  const palaistraCards = stageCards.filter((c) => c.title.includes('Παλαίστρα'));
  console.log(`STAGE_ANNOUNCE renders whose title is Η Παλαίστρα: ${palaistraCards.length}`);
  for (const c of palaistraCards) console.log(`  stage=${c.stage} "${c.title}"`);
  const stage2Start = palaistraCards[0]?.at ?? 0;
  const nextCardAfter = stageCards.find((c) => c.at > stage2Start && !c.title.includes('Παλαίστρα'));
  const stage2End = nextCardAfter?.at ?? Date.now();
  const stage2Intros = introBeats.filter((b) => b.kind === 'STAGE_INTRO' && b.at >= stage2Start && b.at < stage2End);
  console.log(`SOCRATES STAGE_INTRO beats inside the Παλαίστρα stage window: ${stage2Intros.length}`);
  for (const b of stage2Intros) console.log(`  "${String(b.line).slice(0, 70)}"`);
  console.log(`(all STAGE_ANNOUNCE renders this game: ${stageCards.length})`);

  // ---- criterion 3: the stage timing table ---------------------------------
  console.log('\n================ CRITERION 3 - stage durations (server) =================');
  const durations: any[] = gameOver.stageDurations ?? [];
  let total = 0;
  for (const d of durations) {
    total += d.durationMs;
    console.log(`  stage ${d.stage}  ${String(d.title).padEnd(22)} ${(d.durationMs / 1000).toFixed(1)}s`);
  }
  const palaistra = durations.find((d) => String(d.title).includes('Παλαίστρα'));
  console.log(`  ---`);
  console.log(`  Η Παλαίστρα: ${palaistra ? (palaistra.durationMs / 1000).toFixed(1) : 'n/a'}s`);
  console.log(`  whole show:  ${(total / 1000).toFixed(1)}s (sum of stages)`);
  if (gameOver.gameStartedAt) {
    console.log(`  wall clock:  ${((gameOver.gameEndedAt - gameOver.gameStartedAt) / 1000).toFixed(1)}s`);
  }
  if (palaistra && total > 0) {
    console.log(`  Παλαίστρα share of the night: ${((palaistra.durationMs / total) * 100).toFixed(1)}%`);
  }
  console.log(`\n[${LABEL}] DONE`);
}

// --------------------------------------------------------------------------
// SCENARIO B - pause/resume in round 2 and in the between-rounds transition.
// Criterion 5. Needs the real TV, since Task 246's fix is a CLIENT display fix.
// --------------------------------------------------------------------------
async function waitForClient(): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const res = await fetch(`http://localhost:${CLIENT_PORT}/`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await delay(500);
  }
  throw new Error('client dev server did not come up in time');
}

// The TV's countdown reaches the DOM in two shapes: BLITZ puts integer seconds
// in Krater's node, BLITZ_REVEAL carries its own as the inline width of the
// progress-bar fill (pause-resume-check.ts's own readTv).
async function readTv(page: Page, phase: string): Promise<string> {
  if (phase === 'BLITZ_REVEAL') {
    const fill = page.locator('[data-testid="blitz-reveal-progress"] > div');
    if ((await fill.count()) === 0) return 'absent';
    const width = await fill.first().evaluate((el) => (el as HTMLElement).style.width);
    const pct = Number(String(width).replace('%', ''));
    return `bar ${width} (=${((pct / 100) * 8).toFixed(2)}s)`;
  }
  const node = page.locator('[data-testid="countdown"]');
  if ((await node.count()) === 0) return 'absent';
  return `${((await node.first().textContent()) ?? '').trim()}s`;
}

async function scenarioB(): Promise<void> {
  const { getRoom } = await import('../server/src/state.js');
  const { remainingActiveTimerMs } = await import('../server/src/timers.js');

  clientProc = spawn('npm', ['run', 'dev', '--', '--port', String(CLIENT_PORT), '--strictPort'], {
    cwd: `${ROOT}client`,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: { ...process.env, VITE_SERVER_URL: `http://localhost:${SERVER_PORT}` },
  });
  await waitForClient();

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.goto(`http://localhost:${CLIENT_PORT}/host?clock=off&mode=blitz`);
  await page.getByTestId('audio-gate').click();
  await page.getByTestId('create-room').click();
  const codeLocator = page.getByTestId('room-code');
  await codeLocator.waitFor({ state: 'visible', timeout: 30000 });
  const code = ((await codeLocator.textContent()) ?? '').replace(/\s+/g, '');

  // Two sims who never swipe, so each window runs its full BLITZ_DURATION_MS.
  const sims: Sim[] = [];
  for (let i = 0; i < 2; i++) sims.push(await joinSim(NAMES[i], AVATARS[i], code));
  await delay(500);
  sims[0].socket.emit(ClientEvents.VIP_START_GAME, {});

  const room: any = getRoom(code);
  if (!room) throw new Error(`no live Room for ${code}`);

  async function waitFor(pred: () => boolean, what: string, timeoutMs = 120000): Promise<void> {
    const started = Date.now();
    while (!pred()) {
      if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${what} (phase=${room.phase})`);
      await delay(50);
    }
  }

  // The pause is emitted BEFORE the baseline sample is taken, and the sample
  // waits for it to actually land. Reading `remaining` first and pausing
  // after makes the socket round trip (~20-45ms of still-running timer) look
  // like timer drift, and a strict-equality verdict on that reads as a false
  // failure - CLAUDE.md's own warning about real-clock pause checks. What
  // matters is that ~0ms, not ~3000ms, elapses across the hold.
  const SETTLE_MS = 300;
  async function probe(what: string, phase: string, enterDelayMs: number): Promise<void> {
    await delay(enterDelayMs);
    sims[0].socket.emit(ClientEvents.GAME_PAUSE, {});
    await delay(SETTLE_MS);
    const serverAtPause = remainingActiveTimerMs(room);
    const tvAtPause = await readTv(page, phase);
    await delay(3000);
    const serverDuringHold = remainingActiveTimerMs(room);
    const tvDuringHold = await readTv(page, phase);
    const phaseHeld = room.phase === phase;
    sims[0].socket.emit(ClientEvents.GAME_RESUME, {});
    await delay(SETTLE_MS);
    const serverAtResume = remainingActiveTimerMs(room);
    const tvAtResume = await readTv(page, phase);
    const driftMs = serverAtPause - serverDuringHold;
    console.log(`\n--- ${what} (phase ${phase}) ---`);
    console.log(`  at pause (frozen)   server ${serverAtPause}ms   TV ${tvAtPause}`);
    console.log(`  after 3000ms hold   server ${serverDuringHold}ms   TV ${tvDuringHold}   phase held: ${phaseHeld}`);
    console.log(`  at resume           server ${serverAtResume}ms   TV ${tvAtResume}`);
    console.log(`  elapsed across a 3000ms hold: ${driftMs}ms  -> frozen: ${Math.abs(driftMs) <= 5 ? 'YES' : 'NO'}`);
    console.log(`  ran on after resume: ${serverAtResume < serverDuringHold ? 'YES' : 'NO'} (${serverDuringHold - serverAtResume}ms in ~${SETTLE_MS}ms)`);
  }

  console.log('\n================ CRITERION 5 - pause/resume, round 2 + transition =======');
  await waitFor(() => room.phase === 'BLITZ', 'round 1 BLITZ');
  console.log('round 1 swipe window reached');
  await waitFor(() => room.phase === 'BLITZ_REVEAL', 'round 1 BLITZ_REVEAL');
  await probe('the BETWEEN-ROUNDS transition', 'BLITZ_REVEAL', 1500);

  await waitFor(() => room.phase === 'BLITZ', 'round 2 BLITZ');
  console.log('\nround 2 swipe window reached');
  await probe('ROUND 2, mid-window', 'BLITZ', 8000);

  await waitFor(() => room.phase === 'GAME_OVER', 'GAME_OVER', 180000);
  console.log('\nreached GAME_OVER after both rounds');
  console.log(`\n[${LABEL}] DONE`);
}

async function main(): Promise<void> {
  await import('../server/src/index.js'); // the REAL server, in-process
  await delay(1200);
  if (SCENARIO === 'A') await scenarioA();
  else await scenarioB();
}

main()
  .catch((error) => {
    console.error(`[${LABEL}] FAILED:`, error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    process.exit(process.exitCode ?? 0);
  });
