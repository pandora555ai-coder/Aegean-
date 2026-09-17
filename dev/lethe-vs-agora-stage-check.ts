// Follow-up to Task 252 (no fix here - observation only): does
// !isAgoraScenePhase also remove Socrates from Στάδιο 1 (Η Αγορά)? Η Αγορά
// is stage 1's TITLE (segment: 'quiz', plain QUESTION/REVEAL phases) - a
// different thing from the 'agora' MECHANIC (AGORA_EXPOSE/AGORA_QUESTION/
// AGORA_REVEAL phases) that stage 5 (titled Η Λήθη since Task 231) actually
// runs. isAgoraScenePhase checks the literal phase name, not the stage
// title, so the two should behave differently - confirmed here by real
// observation of a real `full` game rather than by reading the code.
//
//   npx tsx dev/lethe-vs-agora-stage-check.ts
process.env.PORT = '3927';

import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser } from 'playwright';
import { io as ioClient, type Socket } from 'socket.io-client';
import { ClientEvents, FULL_AGORA_SCORE_SCALE, ServerEvents } from '@game/shared';

const SERVER_PORT = 3927;
const CLIENT_PORT = 5928;
const ROOT = new URL('..', import.meta.url).pathname;
const CLIENT_DIR = `${ROOT}client`;

let clientProc: ChildProcess | null = null;

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

const NAMES = ['Άρης', 'Νίκη'];
const AVATARS = ['minotaur', 'medusa'];

function joinSim(name: string, avatarId: string, code: string): Promise<Sim> {
  const playerId = randomUUID();
  return new Promise((resolve, reject) => {
    const socket: Socket = ioClient(`http://localhost:${SERVER_PORT}`, { reconnection: false });
    socket.on('connect', () => socket.emit(ClientEvents.PLAYER_JOIN, { code, name, playerId, avatarId }));
    socket.once(ServerEvents.PLAYER_JOINED, () => resolve({ name, playerId, socket }));
    socket.once(ServerEvents.JOIN_REJECTED, (p: unknown) => reject(new Error(`join rejected: ${JSON.stringify(p)}`)));
    socket.once('connect_error', reject);
  });
}

type RoomLike = {
  code: string;
  phase: string;
  stage: number;
  gameIntroPlayed: boolean;
  currentQuestionIndex: number;
  gameStartedAt: number | null;
  settings: { gameLength: string };
};

async function waitForPhase(room: RoomLike, phase: string, timeoutMs = 150000): Promise<void> {
  const started = Date.now();
  while (room.phase !== phase) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${phase} (still ${room.phase}, stage ${room.stage})`);
    await delay(30);
  }
}

async function main(): Promise<void> {
  console.log(`booting in-process server on ${SERVER_PORT}`);
  await import('../server/src/index.js');
  const { getRoom, buildRoomQuestions } = await import('../server/src/state.js');
  const { modeForRoom } = await import('../server/src/modes/index.js');
  const { startAgoraSegment } = await import('../server/src/modes/agora.js');

  clientProc = spawn('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], {
    cwd: CLIENT_DIR,
    stdio: 'ignore',
    detached: true,
    env: { ...process.env, VITE_SERVER_URL: `http://localhost:${SERVER_PORT}` },
  });
  await waitForClient();
  console.log(`client dev server listening on ${CLIENT_PORT}`);

  const browser: Browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    page.on('console', (msg) => console.log(`[page console] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', (err) => console.log(`[page error] ${err.message}`));
    page.on('close', () => console.log('[page closed]'));
    await page.goto(`http://localhost:${CLIENT_PORT}/host?mode=full`);
    await page.getByTestId('audio-gate').click();
    await page.getByRole('button', { name: 'Create Room' }).click();
    const codeLocator = page.getByTestId('room-code');
    await codeLocator.waitFor({ state: 'visible', timeout: 20000 });
    const code = ((await codeLocator.textContent()) ?? '').replace(/\s+/g, '');
    console.log(`room ${code} created (mode=full), host browser attached`);

    const sims: Sim[] = [];
    for (let i = 0; i < 2; i++) sims.push(await joinSim(NAMES[i], AVATARS[i], code));
    await delay(400);

    const room = getRoom(code) as unknown as RoomLike;
    // short gameLength - 2 stage-1 questions instead of the long default's
    // 5, purely to reach QUESTION faster. Does not touch which phases fire.
    room.settings.gameLength = 'short';

    // The REAL start path (index.ts's own startGame, replicated here since
    // it isn't exported): stage 1 is entered for real, GAME_INTRO and all,
    // through the mode's own start() - nothing shortcut about this part.
    buildRoomQuestions(room as never);
    room.currentQuestionIndex = 0;
    room.gameStartedAt = Date.now();
    modeForRoom(room as never).start(room as never);

    await waitForPhase(room, 'QUESTION');
    await delay(400);
    const agoraStageSocratesCount = await page.locator('[data-testid="socrates-figure"]').count();
    console.log(`\nΣτάδιο ${room.stage} (Η Αγορά, plain quiz QUESTION phase): socrates-figure count = ${agoraStageSocratesCount}`);

    // Jump straight to stage 5 (Η Λήθη / the agora MECHANIC) - the same
    // shortcut dev/lethe-scene-check.ts and the climb checks already use,
    // skipping stages 2-4 (blitz/draw/numeric) since this question is only
    // about stage 1 vs stage 5.
    room.stage = 5;
    startAgoraSegment(room as never, FULL_AGORA_SCORE_SCALE);
    await waitForPhase(room, 'AGORA_QUESTION');
    await delay(400);
    const letheStageSocratesCount = await page.locator('[data-testid="socrates-figure"]').count();
    console.log(`Στάδιο ${room.stage} (Η Λήθη, AGORA_QUESTION phase): socrates-figure count = ${letheStageSocratesCount}`);

    await context.close();
  } finally {
    await browser.close();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    killGroup(clientProc);
    setTimeout(() => process.exit(), 200);
  });
