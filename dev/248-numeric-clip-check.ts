// Task 248 - the Εκτίμηση question text, measured on BOTH numeric screens.
//
// Task 242's lesson (the same string clipping differently in three separate
// components) is why this measures the SLIDER screen and the REVEAL screen
// with the identical probe rather than assuming one site is the defect.
//
// What is measured, per screen: the question text element's natural
// scrollHeight/scrollWidth against its CONTAINER's clientHeight/clientWidth -
// which is exactly the comparison useFitFontSize itself makes (see
// hooks/useFitFontSize.ts) - plus the font size actually left on the element
// after the shrink loop stopped. Overflow is reported in px; a positive
// number is text the viewer cannot see, because styles.questionBlock is
// `overflow: hidden`.
//
// The question is FORCED rather than accepted: prepareNumericGame shuffles,
// so this re-prepares until the wanted question comes up. numericStateByRoom
// is a module-private WeakMap, so this uses only the mode's exported API and
// changes no production code to be testable.
//
//   npx tsx dev/248-numeric-clip-check.ts
//   ONLY=longest npx tsx dev/248-numeric-clip-check.ts
process.env.PORT = process.env.SERVER_PORT ?? '3957';

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { io, type Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents } from '@game/shared';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_DIR = path.join(ROOT, 'client');
const SERVER_PORT = Number(process.env.SERVER_PORT ?? 3957);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5958);
const ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const CLIENT_ORIGIN = `http://127.0.0.1:${CLIENT_PORT}`;
const ONLY = process.env.ONLY ?? '';

let clientProc: ChildProcess | null = null;
let browser: Browser | null = null;
const sockets: Socket[] = [];

function killGroup(child: ChildProcess | null): void {
  if (!child || child.pid === undefined || child.killed) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
}

async function waitForClient(): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`${CLIENT_ORIGIN}/`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await delay(500);
  }
  throw new Error('client dev server did not come up in time');
}

function connect(): Socket {
  const s = io(ORIGIN, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  return s;
}

function waitFor<T = Record<string, unknown>>(socket: Socket, event: string, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    function handler(p: T): void {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(p);
    }
    socket.on(event, handler);
  });
}

const AVATARS = ['sphinx', 'minotaur', 'medusa'];

function joinPlayer(code: string, name: string, avatarIndex: number): Promise<{ socket: Socket; playerId: string }> {
  const s = connect();
  const playerId = randomUUID();
  const done = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`join for "${name}" timed out`)), 15000);
    s.once(ServerEvents.PLAYER_JOINED, () => {
      clearTimeout(timer);
      resolve();
    });
    s.once(ServerEvents.JOIN_REJECTED, (p: { reason: string }) => {
      clearTimeout(timer);
      reject(new Error(`join rejected for "${name}": ${p.reason}`));
    });
  });
  s.emit(ClientEvents.PLAYER_JOIN, { code, name, playerId, avatarId: AVATARS[avatarIndex % AVATARS.length] });
  return done.then(() => ({ socket: s, playerId }));
}

interface Measurement {
  screen: string;
  testid: string;
  text: string;
  chars: number;
  fontSizePx: number;
  scrollH: number;
  clientH: number;
  overflowH: number;
  scrollW: number;
  clientW: number;
  overflowW: number;
  atFloor: boolean;
}

// The text element vs ITS OWN CONTAINER (questionBlock) - the same pair
// useFitFontSize compares. `atFloor` means the shrink loop bottomed out at
// its 2rem minimum, which is the point past which overflow can only be
// clipped rather than shrunk away.
async function measure(page: Page, screen: string, testid: string): Promise<Measurement> {
  const el = page.locator(`[data-testid="${testid}"]`);
  await el.waitFor({ timeout: 15000 });
  await delay(400); // let useFitFontSize's layout pass settle
  const m = await el.evaluate((node) => {
    const text = node as HTMLElement;
    const box = text.parentElement as HTMLElement;
    const fontSizePx = parseFloat(getComputedStyle(text).fontSize);
    return {
      text: (text.textContent ?? '').trim(),
      fontSizePx,
      scrollH: text.scrollHeight,
      clientH: box.clientHeight,
      scrollW: text.scrollWidth,
      clientW: box.clientWidth,
    };
  });
  return {
    screen,
    testid,
    text: m.text,
    chars: m.text.length,
    fontSizePx: m.fontSizePx,
    scrollH: m.scrollH,
    clientH: m.clientH,
    overflowH: m.scrollH - m.clientH,
    scrollW: m.scrollW,
    clientW: m.clientW,
    overflowW: m.scrollW - m.clientW,
    // 2rem floor; the root font-size is 16px unless something overrode it.
    atFloor: Math.abs(m.fontSizePx - 32) < 0.75,
  };
}

function report(m: Measurement): void {
  const verdict = m.overflowH > 0 || m.overflowW > 0 ? 'CLIPPED' : 'fits';
  console.log(
    `  ${m.screen.padEnd(8)} ${verdict.padEnd(8)} font=${m.fontSizePx.toFixed(1)}px${m.atFloor ? ' (AT 2rem FLOOR)' : ''} ` +
      `height ${m.scrollH}/${m.clientH} (overflow ${m.overflowH}px) ` +
      `width ${m.scrollW}/${m.clientW} (overflow ${m.overflowW}px)`,
  );
}

type Box = { x: number; y: number; w: number; h: number } | null;

function boxesOverlap(a: Box, b: Box): boolean {
  if (!a || !b) return false;
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// The card's other furniture, so criterion 3 can show it did not move, PLUS
// Task 242's own invariant re-verified: no tick label may overlap another, and
// (new here, because this task trims the numline's clearance margins) no tick
// label may overlap the question text either.
async function cardFurniture(page: Page): Promise<Record<string, unknown>> {
  const read = async (testid: string): Promise<{ text: string; font: string; box: Box } | null> => {
    const l = page.locator(`[data-testid="${testid}"]`);
    if ((await l.count()) === 0) return null;
    const raw = await l.first().boundingBox();
    const font = await l.first().evaluate((n) => getComputedStyle(n as HTMLElement).fontSize);
    const text = ((await l.first().textContent()) ?? '').trim();
    const box: Box = raw ? { x: Math.round(raw.x), y: Math.round(raw.y), w: Math.round(raw.width), h: Math.round(raw.height) } : null;
    return { text, font, box };
  };

  const labels: { text: string; box: Box }[] = [];
  for (const l of await page.locator('[data-testid="numeric-reveal-tick-label"]').all()) {
    const raw = await l.boundingBox();
    labels.push({
      text: ((await l.textContent()) ?? '').trim(),
      box: raw ? { x: Math.round(raw.x), y: Math.round(raw.y), w: Math.round(raw.width), h: Math.round(raw.height) } : null,
    });
  }
  const questionBox = (await read('numeric-reveal-text'))?.box ?? null;
  const labelVsLabel: string[] = [];
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      if (boxesOverlap(labels[i].box, labels[j].box)) labelVsLabel.push(`"${labels[i].text}" x "${labels[j].text}"`);
    }
  }
  const labelVsQuestion = labels.filter((l) => boxesOverlap(l.box, questionBox)).map((l) => `"${l.text}"`);

  // Criterion 3 wants the RANKINGS observed, not inferred. The sophists row
  // lives outside GameLayout entirely (HostScreen owns it, a fixed band at
  // the foot of the screen), so this change has no mechanism to move it - but
  // "no mechanism" is an argument, not a measurement, so it gets measured.
  const rowPlaques: { text: string; box: Box }[] = [];
  for (const l of await page.locator('[data-testid="sophist-name"]').all()) {
    const raw = await l.boundingBox();
    rowPlaques.push({
      text: ((await l.textContent()) ?? '').trim(),
      box: raw ? { x: Math.round(raw.x), y: Math.round(raw.y), w: Math.round(raw.width), h: Math.round(raw.height) } : null,
    });
  }

  return {
    answer: await read('numeric-reveal-answer'),
    numline: await read('numeric-reveal-numline'),
    sophistPlaques: rowPlaques,
    tickLabelCount: labels.length,
    labelBoxes: labels,
    OVERLAP_label_vs_label: labelVsLabel,
    OVERLAP_label_vs_questionText: labelVsQuestion,
  };
}

async function main(): Promise<void> {
  console.log(`booting in-process server on ${SERVER_PORT}`);
  await import('../server/src/index.js');
  const { getRoom } = await import('../server/src/state.js');
  const { prepareNumericGame, startNumericSegment, submitNumericAnswer, getNumericTrueAnswer, buildNumericQuestionHostShow } =
    await import('../server/src/modes/numeric.js');
  const { NUMERIC_QUESTIONS } = await import('../server/src/numeric.js');

  const byLen = [...NUMERIC_QUESTIONS].sort((a, b) => b.text.length - a.text.length);
  const targets: Array<{ label: string; text: string }> = [];
  if (ONLY === '' || ONLY.includes('longest')) targets.push({ label: 'LONGEST', text: byLen[0].text });
  if (ONLY === '' || ONLY.includes('median')) targets.push({ label: 'MEDIAN', text: byLen[Math.floor(byLen.length / 2)].text });
  if (ONLY === '' || ONLY.includes('shortest')) targets.push({ label: 'SHORTEST', text: byLen[byLen.length - 1].text });

  clientProc = spawn('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], {
    cwd: CLIENT_DIR,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, VITE_SERVER_URL: ORIGIN },
  });
  await waitForClient();
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  console.log('client + browser ready');

  const host = connect();
  const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
  host.emit(ClientEvents.CREATE_ROOM, { mode: 'numeric' });
  const { code } = await created;
  const players = [await joinPlayer(code, 'Μαρία', 0), await joinPlayer(code, 'Νίκος', 1)];

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript((c: string) => {
    try {
      window.localStorage.setItem('hostRoomCode', c);
    } catch {
      /* opaque origin */
    }
  }, code);
  await page.goto(`${CLIENT_ORIGIN}/host`);
  await delay(1000);

  const room = getRoom(code) as never;

  for (const target of targets) {
    console.log(`\n=== ${target.label} (${target.text.length} chars) ===`);
    console.log(`  "${target.text}"`);

    // Force this exact question: prepareNumericGame shuffles, so re-draw
    // until it comes up. 42 questions, so this lands in well under 400 tries.
    let landed = false;
    for (let attempt = 0; attempt < 400 && !landed; attempt++) {
      prepareNumericGame(room, 1);
      startNumericSegment(room);
      landed = (buildNumericQuestionHostShow(room)?.text ?? '') === target.text;
    }
    if (!landed) {
      console.log('  FAILED to draw this question - skipped');
      continue;
    }
    await delay(600);

    report(await measure(page, 'SLIDER', 'numeric-question-text'));

    const answer = getNumericTrueAnswer(room) ?? 10;
    submitNumericAnswer(room, players[0].playerId, answer);
    submitNumericAnswer(room, players[1].playerId, Math.max(1, Math.round(answer * 0.6)));
    await page.locator('[data-testid="numeric-reveal-numline"]').waitFor({ timeout: 15000 });

    report(await measure(page, 'REVEAL', 'numeric-reveal-text'));
    console.log(`  card furniture: ${JSON.stringify(await cardFurniture(page))}`);
  }

  await page.close();
  host.disconnect();
  for (const p of players) p.socket.disconnect();
}

main().then(
  async () => {
    for (const s of sockets) s.disconnect();
    if (browser) await browser.close();
    killGroup(clientProc);
    process.exit(0);
  },
  async (err) => {
    console.error(err);
    for (const s of sockets) s.disconnect();
    if (browser) await browser.close();
    killGroup(clientProc);
    process.exit(1);
  },
);
