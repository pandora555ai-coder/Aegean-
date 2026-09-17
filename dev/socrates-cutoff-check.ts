// Task 249 - diagnosing a reported audible cutoff at the END of some Socrates
// lines, against a REAL browser playing REAL audio through the REAL
// AudioContext, driven by a REAL in-process server (same infra as
// dev/socrates-pacing-check.ts's own scenario A, but with a genuine browser
// host instead of a bare socket standing in for one - the whole question here
// is what the BROWSER's own playback actually does, which a scripted ack can
// never show).
//
// For each of 16 real lines (spanning GAME_INTRO, ANAVASIS_INTRO, four
// different STAGE_INTRO stages, WINNER, and seven distinct REVEAL moments -
// well past "10 lines across different pools"), this reports THREE
// independently-measured numbers:
//   1. the file's own decoded duration - decodeAudioData's buffer.duration,
//      measured by the BROWSER itself, never the server's byte-size estimate
//   2. the time audio actually stopped - source.start() to the native
//      'ended' event, i.e. how long the browser really played the clip for
//   3. the time the beat ended - the server's own "beat N ended (...)" log
//      line minus its "beat N backstop=... " log line
// plus ffprobe's own independent duration for a fourth cross-check.
//
// If (2) matches (1) and (3) sits just past (2), the loss is baked into the
// FILE (case a - it ends exactly when the browser's own decode says it
// should, just short of where the sentence should have finished). If (2) is
// shorter than (1), playback itself was cut short (case b).
//
//   npx tsx dev/socrates-cutoff-check.ts

process.env.PORT = '3921';

// This harness forces a raw sequence of beats directly (enterSocratesBeat),
// bypassing vip:start_game entirely - there is no real quiz question queue
// behind it. Once the sentinel line's own beat ends, advanceFromSocrates
// falls through to beginStageOrRound and crashes reaching into a question
// list that was never populated. That crash happens after every number this
// harness needs has already been captured in serverLog, so it is swallowed
// here rather than avoided - the alternative (giving the room a real question
// set) would mean running actual game setup this diagnostic has no need for.
process.on('uncaughtException', (err) => {
  console.error('[swallowed - expected once the forced sequence drains past its sentinel]', err.message);
});

import { execFileSync } from 'node:child_process';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';

const SERVER_PORT = 3921;
const CLIENT_PORT = 5922;
const ROOT = new URL('..', import.meta.url).pathname;
const CLIENT_DIR = `${ROOT}client`;
const VOICE_DIR = path.join(ROOT, 'client/public/voice');

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

// ---------------------------------------------------------------------------
// Server log capture, same tee pattern as dev/socrates-pacing-check.ts.
// ---------------------------------------------------------------------------
interface LogLine {
  t: number;
  text: string;
}
const serverLog: LogLine[] = [];
const realLog = console.log.bind(console);
let teeing = false;
console.log = (...args: unknown[]) => {
  const text = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  if (teeing) serverLog.push({ t: Date.now(), text });
  realLog(...args);
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

// The 16 lines under test - the four Task 238 over-cap clips, two under-cap
// for contrast, and ten more picked from the offline waveform sweep (their
// last 20ms window sits at >=60% of their own loudest point in the preceding
// 300ms - the signature of a clip ending while still mid-utterance rather
// than decaying to silence), spanning as many different pools as possible.
const PLAN: Array<{ hash: string; label: string }> = [
  { hash: '16c6ea1676ae1cd9', label: 'GAME_INTRO#9 (over-cap)' },
  { hash: '4171b462473d2c7c', label: 'STAGE_INTRO/blitz#11 (over-cap)' },
  { hash: '3dfea3c22bfefa6a', label: 'STAGE_INTRO/draw#15 (over-cap)' },
  { hash: 'b8399492286a98e1', label: 'ANAVASIS_INTRO#22 (over-cap)' },
  { hash: 'a8ec509e4513305d', label: 'ANAVASIS_INTRO#21 (under-cap)' },
  { hash: '36ae9a28048b61c5', label: 'ANAVASIS_INTRO#20 (under-cap)' },
  { hash: '040c8ef98a982d1f', label: 'STAGE_INTRO/steal' },
  { hash: 'e827ecccaf3484e5', label: 'STAGE_INTRO/numeric' },
  { hash: '44d7deab557fb288', label: 'WINNER' },
  { hash: '7127858876a53ef9', label: 'REVEAL/SPLIT_GUESS' },
  { hash: '708893b717d38c4c', label: 'REVEAL/ALL_CLUSTERED' },
  { hash: '20a639c5547c1fc2', label: 'REVEAL/NOBODY_CLOSE (a)' },
  { hash: '4ed8cea53e2397ed', label: 'REVEAL/NOBODY_CLOSE (b)' },
  { hash: '67d8f742d5ca6159', label: 'REVEAL/ONLY_ONE_CORRECT' },
  { hash: '14e053df27b48679', label: 'REVEAL/LEAD_CHANGE' },
  { hash: '92a08ad77a486cbb', label: 'REVEAL/SPEED_DEMON' },
];

interface ClientAudioEvent {
  hash: string;
  bufferDurationMs: number;
  startWall: number;
  endWall: number;
}

async function installAudioProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __voiceFetches: Array<{ hash: string; ok: boolean; t: number }>;
      __audioEvents: Array<{ hash: string | null; bufferDurationMs: number; startWall: number; endWall: number }>;
      __pendingHash: string | null;
    };
    w.__voiceFetches = [];
    w.__audioEvents = [];
    w.__pendingHash = null;

    const origFetch = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
      const res = await origFetch(...args);
      const match = /\/voice\/([0-9a-f]+)\.mp3/.exec(url);
      if (match) {
        w.__voiceFetches.push({ hash: match[1], ok: res.ok, t: Date.now() });
        // Only a successful fetch goes on to decodeAudioData + createBufferSource
        // (see useGameAudio.ts's playSocratesLine) - remember which hash the
        // NEXT bufferSource belongs to.
        if (res.ok) w.__pendingHash = match[1];
      }
      return res;
    };

    const OrigCtor = window.AudioContext;
    const patchedProto = OrigCtor.prototype;
    const origCreateBufferSource = patchedProto.createBufferSource;
    patchedProto.createBufferSource = function (this: AudioContext, ...args: []) {
      const src = origCreateBufferSource.apply(this, args);
      const hashAtCreation = w.__pendingHash;
      w.__pendingHash = null;
      const origStart = src.start.bind(src);
      src.start = ((...startArgs: Parameters<typeof src.start>) => {
        const startWall = Date.now();
        src.addEventListener('ended', () => {
          w.__audioEvents.push({
            hash: hashAtCreation,
            bufferDurationMs: src.buffer ? Math.round(src.buffer.duration * 1000) : -1,
            startWall,
            endWall: Date.now(),
          });
        });
        return origStart(...startArgs);
      }) as typeof src.start;
      return src;
    };
  });
}

async function main(): Promise<void> {
  console.log(`booting in-process server on ${SERVER_PORT}`);
  await import('../server/src/index.js');
  const { getRoom } = await import('../server/src/state.js');
  const { enterSocratesBeat, advanceFromSocrates } = await import('../server/src/phases.js');
  const { collectVoiceLineEntries } = await import('../server/src/socrates.js');
  teeing = true;

  const entries = collectVoiceLineEntries();
  const byHash = new Map(entries.map((e) => [e.hash, e]));
  for (const p of PLAN) {
    if (!byHash.has(p.hash)) throw new Error(`hash ${p.hash} (${p.label}) not found in collectVoiceLineEntries()`);
  }

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
    await installAudioProbe(page);
    await page.goto(`http://localhost:${CLIENT_PORT}/host`);
    await page.getByRole('button', { name: 'Create Room' }).click();
    const codeLocator = page.getByTestId('room-code');
    await codeLocator.waitFor({ state: 'visible', timeout: 20000 });
    const code = ((await codeLocator.textContent()) ?? '').replace(/\s+/g, '');
    console.log(`room ${code} created, host browser attached`);

    type RoomLike = {
      code: string;
      phase: string;
      gameIntroPlayed: boolean;
      socratesBeatId: number;
      pendingSocratesQueue: Array<{ line: string; lineTemplate: string; lineTag: string | null }>;
    };
    const room = getRoom(code) as unknown as RoomLike;
    room.gameIntroPlayed = true;

    // One long sequence, exactly startSocratesSequence's own shape - a
    // trailing sentinel with no real mp3 so its 404 ends the run instead of
    // cascading into real game logic (beginStageOrRound/startClimbQuestion/
    // finishGame) once the queue drains.
    const lines = PLAN.map((p) => byHash.get(p.hash)!);
    const [first, ...rest] = lines;
    room.pendingSocratesQueue = [
      ...rest.map((l) => ({ line: l.line, lineTemplate: l.line, lineTag: l.tag })),
      { line: 'ΤΕΛΟΣ ΔΟΚΙΜΗΣ ΤΟΥ ΔΙΑΓΝΩΣΤΙΚΟΥ', lineTemplate: 'ΤΕΛΟΣ ΔΟΚΙΜΗΣ ΤΟΥ ΔΙΑΓΝΩΣΤΙΚΟΥ', lineTag: null },
    ];
    const t0 = Date.now();
    enterSocratesBeat(
      room as never,
      'SOCRATES',
      { kind: 'STAGE_INTRO', line: first.line, lineTemplate: first.line, lineTag: first.tag },
      () => advanceFromSocrates(room.code as never),
    );

    // Wait for the sentinel's own beat to appear (queue drained past every
    // real line) or a generous timeout - sum of every clip's own ffprobe
    // duration plus margin, never a flat guess.
    const totalMs = PLAN.reduce((sum, p) => sum + (realDurationMs(p.hash) ?? 4000), 0);
    const deadline = Date.now() + totalMs + 30000;
    while (
      !serverLog.some((l) => l.t >= t0 && l.text.includes('ΤΕΛΟΣ ΔΟΚΙΜΗΣ')) &&
      Date.now() < deadline
    ) {
      await delay(200);
    }
    await delay(1000);

    const audioEvents = (await page.evaluate(
      () => (window as unknown as { __audioEvents: ClientAudioEvent[] }).__audioEvents,
    )) as ClientAudioEvent[];
    const voiceFetches = (await page.evaluate(
      () => (window as unknown as { __voiceFetches: Array<{ hash: string; ok: boolean; t: number }> }).__voiceFetches,
    )) as Array<{ hash: string; ok: boolean; t: number }>;

    console.log(`\ncaptured ${voiceFetches.length} voice fetches, ${audioEvents.length} completed playbacks\n`);

    console.log(
      'label                                 ffprobe    decoded    played     beat-held  cause',
    );
    for (const p of PLAN) {
      const entry = byHash.get(p.hash)!;
      const ffprobeMs = realDurationMs(p.hash);
      const audioEv = audioEvents.find((e) => e.hash === p.hash);
      const playedMs = audioEv ? audioEv.endWall - audioEv.startWall : null;
      const decodedMs = audioEv ? audioEv.bufferDurationMs : null;

      // Server-side: find the beat whose backstop line quotes this exact
      // line text, then the "ended" line for that same beat id.
      const armed = serverLog.find((l) => l.t >= t0 && l.text.includes(`— "${entry.line}"`));
      const beatIdMatch = armed ? /beat (\d+)/.exec(armed.text) : null;
      const beatId = beatIdMatch ? beatIdMatch[1] : null;
      const ended = beatId
        ? serverLog.find((l) => l.t >= (armed?.t ?? 0) && l.text.includes(`Socrates beat ${beatId} ended`))
        : undefined;
      const heldMs = armed && ended ? ended.t - armed.t : null;
      const cause = ended ? (ended.text.includes('audio_ended') ? 'natural ack' : ended.text) : 'NO ENDED LINE';

      console.log(
        `${p.label.padEnd(38)} ${String(ffprobeMs).padStart(7)}ms  ${String(decodedMs ?? 'n/a').padStart(7)}ms  ` +
          `${String(playedMs ?? 'n/a').padStart(7)}ms  ${String(heldMs ?? 'n/a').padStart(7)}ms  ${cause}`,
      );
    }

    console.log('\n(ffprobe = independent file duration; decoded = browser decodeAudioData buffer.duration;');
    console.log(' played = browser start()-to-ended() wall time; beat-held = server backstop-armed-to-ended wall time)');
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
