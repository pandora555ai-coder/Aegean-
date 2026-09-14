// Task 247 - the winner's gender, observed from a real running game: the
// crowning screen's title (Ο ΣΟΦΙΣΤΗΣ / Η ΣΟΦΙΣΤΡΙΑ), which coronation line
// variant the WINNER beat actually selected, and the subtitle text that
// actually rendered on the TV.
//
// Same infra as dev/245-name-check.ts: the REAL server in-process on a
// throwaway port set BEFORE the import, a throwaway Vite serving the real
// client, a real browser TV, real player sockets.
//
// TWO things here are not obvious and drive the whole shape of this harness:
//
//   1. The coronation clips DO NOT EXIST yet (Task 247's own scope). A
//      missing clip makes the host call onEnded() immediately (Task 154), so
//      the WINNER beat can end within a few ms of starting. The subtitle is
//      therefore captured by a MutationObserver armed at page load, never by
//      polling - a poll loses a single-frame render.
//   2. The TV page IS the host display. A second raw socket emitting
//      HOST_REJOIN would steal it, so the beat's LINE is read from the
//      server's own log ("Socrates (WINNER) beat N ... — \"line\"") via a
//      console.log tee, not from a socket.
//
//   npx tsx dev/247-winner-gender-check.ts
//   ONLY=f npx tsx dev/247-winner-gender-check.ts
//   WINNER=Νίκος npx tsx dev/247-winner-gender-check.ts   (criterion 4: run
//       after deleting that name's NAME_GENDER entry from shared/src/index.ts)
process.env.PORT = process.env.SERVER_PORT ?? '3951';

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { io, type Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents, CLIMB_TOP, NAME_GENDER, PRESET_NAMES } from '@game/shared';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_DIR = path.join(ROOT, 'client');
const SERVER_PORT = Number(process.env.SERVER_PORT ?? 3951);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5952);
const ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const CLIENT_ORIGIN = `http://127.0.0.1:${CLIENT_PORT}`;
const ONLY = process.env.ONLY ?? '';

let clientProc: ChildProcess | null = null;
let browser: Browser | null = null;
const sockets: Socket[] = [];

// ---------------------------------------------------------------------------
// Server log tee - the WINNER beat's own line, straight from the server.
// ---------------------------------------------------------------------------
const serverLog: string[] = [];
const realLog = console.log.bind(console);
console.log = (...args: unknown[]): void => {
  const text = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  serverLog.push(text);
  realLog(...args);
};
// Everything this harness prints itself goes through `say`, so it is never
// re-captured as if it were a server line.
function say(text: string): void {
  realLog(text);
}

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

const AVATARS = ['sphinx', 'minotaur', 'medusa', 'cyclops', 'pegasus', 'centaur'];

function joinPlayer(code: string, name: string, avatarIndex: number): Promise<Socket> {
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
  return done.then(() => s);
}

// The subtitle can render for a single frame (see header), so it is recorded
// by an observer armed BEFORE any of the page's own scripts run.
async function newTvPage(code: string): Promise<Page> {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript((c: string) => {
    // Two details here were MEASURED, not assumed, and both matter:
    //
    // 1. The storage write goes FIRST. Moving it below the observer setup
    //    broke the TV's host attachment outright - the label came back
    //    "(never rendered)" and no host display existed at all. That is
    //    positive proof that something below it throws at init-script time.
    // 2. That something is `document`. addInitScript runs BEFORE the document
    //    exists, so touching document.documentElement here throws and aborts
    //    the whole remainder of the script - which is exactly why the first
    //    version of this harness recorded zero subtitles while a plain 100ms
    //    DOM poll was seeing three of them. The observer install is therefore
    //    both deferred and wrapped, and retried from several entry points.
    try {
      window.localStorage.setItem('hostRoomCode', c);
    } catch {
      /* opaque origin (about:blank) - the real navigation re-runs this */
    }
    const w = window as unknown as { __subs: { text: string; at: number }[] };
    w.__subs = [];
    const seen = new Set<string>();
    const scan = (): void => {
      try {
        document.querySelectorAll('[data-testid="socrates-subtitle"]').forEach((el) => {
          const text = (el.textContent ?? '').trim();
          if (text && !seen.has(text)) {
            seen.add(text);
            w.__subs.push({ text, at: Date.now() });
          }
        });
      } catch {
        /* document not ready yet - a later entry point retries */
      }
    };
    let installed = false;
    const install = (): void => {
      if (installed) return;
      try {
        if (typeof document === 'undefined' || !document.documentElement) return;
        scan();
        new MutationObserver(scan).observe(document.documentElement, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        installed = true;
      } catch {
        /* retried from the entry points below */
      }
    };
    install();
    setTimeout(install, 0);
    try {
      window.addEventListener('DOMContentLoaded', install);
      window.addEventListener('load', install);
    } catch {
      /* no window events here - the setTimeout above still fires */
    }
  }, code);
  // VOICE_DELAY_MS - the coronation clips do not exist, so the host's fetch
  // 404s instantly, it calls onEnded() at once (Task 154), and the WINNER
  // beat is over in a few ms: far too short for the 100ms poll below, and
  // arguably too short to paint at all. Holding the 404 back for a moment
  // stretches the beat exactly the way a real clip would, WITHOUT touching a
  // line of product code - it is the same missing-clip path either way, just
  // not resolved instantly. 0 (the default) leaves the real timing alone.
  const voiceDelayMs = Number(process.env.VOICE_DELAY_MS ?? 0);
  if (voiceDelayMs > 0) {
    await page.route('**/voice/**', async (route) => {
      await delay(voiceDelayMs);
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
    });
  }
  await page.goto(`${CLIENT_ORIGIN}/host`);
  await delay(800);
  return page;
}

type RoomLike = {
  phase: string;
  gameIntroPlayed: boolean;
  players: Map<string, { playerId: string; name: string }>;
  climb: {
    questions: Array<{ correctIndex: number }>;
    questionIndex: number;
    steps: Map<string, number>;
    winnerPlayerId: string | null;
  } | null;
};

async function waitForPhase(room: RoomLike, phase: string, timeoutMs = 60000): Promise<void> {
  const started = Date.now();
  while (room.phase !== phase) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${phase} (still ${room.phase})`);
    await delay(40);
  }
}

interface Observed {
  winnerName: string;
  tableGender: string;
  label: string;
  beatLine: string;
  subtitles: string[];
}

// One whole scenario: a climb whose named player is forced to the top.
async function runScenario(winnerName: string, others: string[]): Promise<Observed> {
  const logMark = serverLog.length;
  const host = connect();
  const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
  host.emit(ClientEvents.CREATE_ROOM, { mode: 'quiz' });
  const { code } = await created;

  const roster = [winnerName, ...others];
  const players: Socket[] = [];
  for (let i = 0; i < roster.length; i++) players.push(await joinPlayer(code, roster[i], i));

  const page = await newTvPage(code);

  const { getRoom } = await import('../server/src/state.js');
  const { startClimb } = await import('../server/src/phases.js');
  const room = getRoom(code) as unknown as RoomLike;
  room.gameIntroPlayed = true; // Task 237 - or GAME_INTRO_SEQUENCE plays here instead

  // A plain DOM poll running alongside the MutationObserver, purely to tell
  // "the observer missed it" apart from "it never rendered". The three
  // STAGE_INTRO beats before the climb last SECONDS (real clips), so a 100ms
  // poll cannot miss those - if the poll sees a subtitle and __subs does not,
  // the observer is at fault rather than the wiring.
  const polled: string[] = [];
  let polling = true;
  const poller = (async () => {
    const seen = new Set<string>();
    while (polling) {
      try {
        const texts = await page.locator('[data-testid="socrates-subtitle"]').allTextContents();
        for (const raw of texts) {
          const text = raw.trim();
          if (text && !seen.has(text)) {
            seen.add(text);
            polled.push(text);
          }
        }
      } catch {
        /* page busy/closed - keep polling */
      }
      await delay(100);
    }
  })();

  startClimb(room as never);
  await waitForPhase(room, 'CLIMB_QUESTION');

  // Put the named player one step from the top and everyone else far below,
  // so the very next correct answer crowns exactly them.
  const winnerId = [...room.players.values()].find((p) => p.name === winnerName)!.playerId;
  for (const player of room.players.values()) {
    room.climb!.steps.set(player.playerId, player.playerId === winnerId ? CLIMB_TOP - 1 : 2);
  }
  const correct = room.climb!.questions[room.climb!.questionIndex].correctIndex;
  const winnerSocket = players[0];
  winnerSocket.emit(ClientEvents.CLIMB_SUBMIT, { choice: correct });

  await waitForPhase(room, 'GAME_OVER');
  await delay(300); // let the last beat's frame land before the poll stops
  polling = false;
  await poller;

  // The crowning is up now; PodiumView replaces it PODIUM_DELAY_MS (6s)
  // later, so the title is read straight away.
  let label = '(never rendered)';
  for (let i = 0; i < 50; i++) {
    if ((await page.locator('[data-testid="winner-title"]').count()) > 0) {
      label = ((await page.locator('[data-testid="winner-title"]').first().textContent()) ?? '').trim();
      break;
    }
    await delay(100);
  }

  const subs = await page.evaluate(() => (window as unknown as { __subs: { text: string }[] }).__subs.map((s) => s.text));
  // Diagnostic, not a criterion: which of the two independent capture paths
  // saw a subtitle. The STAGE_INTRO beats run for SECONDS, so a 100ms poll
  // seeing nothing means nothing rendered - it does not mean the observer
  // missed a single frame.
  say(`  [diag] MutationObserver saw ${subs.length} ${JSON.stringify(subs)}; 100ms DOM poll saw ${polled.length} ${JSON.stringify(polled)}`);
  const beatLog = serverLog.slice(logMark).filter((l) => l.includes('Socrates (WINNER)'));
  const beatLine = beatLog.length > 0 ? (beatLog[0].match(/— "(.*)"$/)?.[1] ?? beatLog[0]) : '(no WINNER beat logged)';

  await page.close();
  host.disconnect();
  for (const p of players) p.disconnect();

  return {
    winnerName,
    tableGender: (NAME_GENDER as Record<string, string>)[winnerName] ?? '(ABSENT from NAME_GENDER)',
    label,
    beatLine,
    // The POLL, not the MutationObserver. The observer recorded nothing in
    // any run of this harness - not even the seconds-long STAGE_INTRO
    // subtitles the poll caught every single time - so it is not a
    // trustworthy instrument here. Its count is kept in the [diag] line above
    // purely so the disagreement stays visible rather than being quietly
    // dropped.
    subtitles: polled,
  };
}

function report(title: string, o: Observed): void {
  say(`\n=== ${title} ===`);
  say(`  winner name            : ${o.winnerName}`);
  say(`  NAME_GENDER entry      : ${o.tableGender}`);
  say(`  on-screen label        : "${o.label}"`);
  say(`  WINNER beat line       : "${o.beatLine}"`);
  say(`  subtitle(s) rendered   : ${o.subtitles.length === 0 ? '(none)' : JSON.stringify(o.subtitles)}`);
}

async function main(): Promise<void> {
  say(`booting in-process server on ${SERVER_PORT}`);
  await import('../server/src/index.js');
  clientProc = spawn('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], {
    cwd: CLIENT_DIR,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, VITE_SERVER_URL: ORIGIN },
  });
  await waitForClient();
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  say('client + browser ready');

  const override = process.env.WINNER;
  if (override) {
    if (!PRESET_NAMES.includes(override)) throw new Error(`WINNER="${override}" is not a PRESET_NAMES entry`);
    const others = PRESET_NAMES.filter((n) => n !== override).slice(0, 2);
    report(`WINNER override: ${override}`, await runScenario(override, [...others]));
  } else {
    if (ONLY === '' || ONLY.includes('m')) {
      report('male winner (Νίκος)', await runScenario('Νίκος', ['Μαρία', 'Άρης']));
    }
    if (ONLY === '' || ONLY.includes('f')) {
      report('female winner (Μαρία)', await runScenario('Μαρία', ['Νίκος', 'Άρης']));
    }
  }
}

main().then(
  async () => {
    for (const s of sockets) s.disconnect();
    if (browser) await browser.close();
    killGroup(clientProc);
    process.exit(0);
  },
  async (err) => {
    realLog(err);
    for (const s of sockets) s.disconnect();
    if (browser) await browser.close();
    killGroup(clientProc);
    process.exit(1);
  },
);
