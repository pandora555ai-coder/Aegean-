// Follow-up to Task 238 - the INTRO SEAM audit. MEASUREMENT ONLY: this
// harness changes nothing and fixes nothing.
//
// The question is what happens BETWEEN consecutive lines of
// GAME_INTRO_SEQUENCE: live listening on the pre-238 build caught roughly a
// second of two clips sounding at once, and tails cut by ~0.2s.
//
// This has to be measured from REAL BROWSER AUDIO. `socrates:audio_ended` is
// emitted from Web Audio's own source.onended (useGameAudio.playSocratesLine),
// so it marks the instant a clip genuinely stopped sounding. A socket-level
// harness that acks after a computed delay would make every gap >= 0 true BY
// CONSTRUCTION and prove nothing at all - which is why this one drives a real
// /host page in a real browser and timestamps the actual WebSocket frames:
//
//   audio start  = the socrates:show frame ARRIVING at the host
//   audio end    = the socrates:audio_ended frame LEAVING the host
//   gap          = next beat's start - this beat's end
//                  (negative = two clips overlapping)
//   played       = this beat's end - this beat's start
//                  (short of the real mp3 = a clipped tail)
//
// An all-bot room (?bot=N) self-starts with no VIP (Task 217), so the opening
// narration plays on its own with nothing else to drive.
//
//   npx tsx dev/intro-seam-check.ts
process.env.PORT = '3918';

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser } from 'playwright';
import { lineHash } from '@game/shared';

const SERVER_PORT = 3918;
const CLIENT_PORT = 5919;
const ROOT = new URL('..', import.meta.url).pathname;
const CLIENT_DIR = `${ROOT}client`;
const VOICE_DIR = path.join(ROOT, 'client/public/voice');
const BOTS = Number(process.env.BOTS) || 3;
const RUN_MS = Number(process.env.RUN_MS) || 240000;

// The Task 230 opening narration, by hash, so each row can be named.
const INTRO: Record<string, string> = {
  '35e4fb8b4163c1f6': 'Εισαγωγή#1', '6dff7bac5460652f': 'Εισαγωγή#2',
  '842169f9a829faaa': 'Εισαγωγή#3', 'a88a4ce657479a66': 'Εισαγωγή#4',
  c47dc43c584f58b2: 'Εισαγωγή#5', '5ba8c95a8c49416b': 'Εισαγωγή#6',
  '931e1a38950f65cf': 'Εισαγωγή#7', '3e92ccdd463e2f28': 'Εισαγωγή#8',
  '16c6ea1676ae1cd9': 'Εισαγωγή#9', '837d1d6393c61fb2': 'Εισαγωγή#10',
};

function realDurationMs(hash: string): number | null {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(VOICE_DIR, `${hash}.mp3`)],
      { encoding: 'utf8' },
    );
    return Math.round(parseFloat(out.trim()) * 1000);
  } catch {
    return null;
  }
}

// socket.io frames look like `42["event",{...}]` (the 4 is "message", the 2
// "event"); anything else here is a ping/upgrade and not interesting.
function parseFrame(payload: string): { event: string; data: Record<string, unknown> } | null {
  const match = payload.match(/^\d+(\[[\s\S]*\])$/);
  if (!match) return null;
  try {
    const arr = JSON.parse(match[1]) as [string, Record<string, unknown>];
    return { event: arr[0], data: arr[1] ?? {} };
  } catch {
    return null;
  }
}

interface Beat {
  beatId: number;
  hash: string;
  label: string;
  startT: number;
  endT: number | null;
  totalDurationMs: number;
  realMs: number | null;
}

let clientProc: ChildProcess | null = null;
let browser: Browser | null = null;

function killGroup(child: ChildProcess | null): void {
  if (!child || child.pid === undefined || child.killed) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // already gone
  }
}

async function main(): Promise<void> {
  await import('../server/src/index.js');
  console.log(`in-process real server listening on ${SERVER_PORT}`);

  clientProc = spawn('npx', ['vite', '--port', String(CLIENT_PORT), '--strictPort'], {
    cwd: CLIENT_DIR,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, VITE_SERVER_URL: `http://localhost:${SERVER_PORT}` },
  });
  for (let i = 0; i < 90; i++) {
    try {
      const res = await fetch(`http://localhost:${CLIENT_PORT}/`);
      if (res.ok) break;
    } catch {
      // not up yet
    }
    await delay(500);
  }

  // Autoplay must not be gated on a gesture, or the AudioContext stays
  // suspended, nothing ever sounds, no onended ever fires, and every beat
  // rides its backstop instead - which would look like a seam problem and be
  // nothing but a headless-browser artifact.
  browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  const beats: Beat[] = [];
  page.on('websocket', (ws) => {
    ws.on('framereceived', (frame) => {
      if (typeof frame.payload !== 'string') return;
      const parsed = parseFrame(frame.payload);
      if (parsed?.event !== 'socrates:show') return;
      const template = String(parsed.data.lineTemplate ?? '');
      const tag = (parsed.data.lineTag ?? null) as string | null;
      const hash = lineHash(template, tag);
      beats.push({
        beatId: Number(parsed.data.beatId ?? -1),
        hash,
        label: INTRO[hash] ?? 'other',
        startT: Date.now(),
        endT: null,
        totalDurationMs: Number(parsed.data.totalDurationMs ?? -1),
        realMs: realDurationMs(hash),
      });
    });
    ws.on('framesent', (frame) => {
      if (typeof frame.payload !== 'string') return;
      const parsed = parseFrame(frame.payload);
      if (parsed?.event !== 'socrates:audio_ended') return;
      const ackId = Number(parsed.data.beatId ?? -1);
      // Match the ack to its own beat by id, never "the latest one" - an
      // overlapping clip's ack arrives while a LATER beat is already on
      // screen, and that is precisely the case being measured.
      const beat = [...beats].reverse().find((b) => b.beatId === ackId && b.endT === null);
      if (beat) beat.endT = Date.now();
    });
  });

  await page.goto(`http://localhost:${CLIENT_PORT}/host?bot=${BOTS}&mode=full`);
  await page.getByRole('button', { name: 'Create Room' }).click();
  console.log(`host page open, ?bot=${BOTS}&mode=full - an all-bot room self-starts`);

  // Wait for the opening narration to finish: all ten intro lines acked, or
  // the observation window closes.
  const deadline = Date.now() + RUN_MS;
  while (Date.now() < deadline) {
    const intro = beats.filter((b) => b.label !== 'other');
    if (intro.length >= 10 && intro.every((b) => b.endT !== null)) break;
    await delay(250);
  }

  const intro = beats.filter((b) => b.label !== 'other');
  console.log('\n=== GAME_INTRO_SEQUENCE: played vs real ===');
  console.log('line            beatId  real    played   delta   est(payload)');
  for (const b of intro) {
    const played = b.endT !== null ? b.endT - b.startT : -1;
    const delta = b.realMs !== null && played >= 0 ? played - b.realMs : NaN;
    console.log(
      `${b.label.padEnd(15)} ${String(b.beatId).padStart(5)}  ${String(b.realMs).padStart(6)}  ` +
        `${String(played).padStart(6)}  ${String(Number.isNaN(delta) ? '?' : delta).padStart(6)}  ` +
        `${String(b.totalDurationMs).padStart(6)}`,
    );
  }

  console.log('\n=== consecutive seams (gap = next start - this end) ===');
  console.log('from            -> to               this end    next start   gap');
  let negative = 0;
  let shortTail = 0;
  for (let i = 0; i < intro.length - 1; i++) {
    const a = intro[i];
    const b = intro[i + 1];
    if (a.endT === null) continue;
    const gap = b.startT - a.endT;
    if (gap < 0) negative++;
    console.log(
      `${a.label.padEnd(15)} -> ${b.label.padEnd(15)} ${String(a.endT - intro[0].startT).padStart(8)}ms ` +
        `${String(b.startT - intro[0].startT).padStart(10)}ms ${String(gap).padStart(7)}ms`,
    );
  }
  for (const b of intro) {
    const played = b.endT !== null ? b.endT - b.startT : -1;
    if (b.realMs !== null && played >= 0 && played < b.realMs - 150) shortTail++;
  }

  console.log('');
  console.log(`intro beats observed: ${intro.length}/10`);
  console.log(`seams with a NEGATIVE gap (two clips sounding at once): ${negative}`);
  console.log(`clips whose played time fell >150ms short of the mp3 (clipped tail): ${shortTail}`);

  await context.close();
}

main().then(
  async () => {
    if (browser) await browser.close();
    killGroup(clientProc);
    process.exit(0);
  },
  async (err) => {
    console.error(err);
    if (browser) await browser.close();
    killGroup(clientProc);
    process.exit(1);
  },
);
