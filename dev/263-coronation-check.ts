// Task 263 - the coronation as a SERIAL beat: three lines spoken back to
// back, with the winner's vocative optionally spliced ahead of line 1.
//
// Same infra as dev/247-winner-gender-check.ts (which this descends from):
// the REAL server in-process on a throwaway port set BEFORE the import, a
// throwaway Vite serving the real client, a real browser TV, real player
// sockets. The climb is SEEDED (startClimb, then one player forced to the
// top) rather than played out over ~14 minutes - the coronation is the last
// thing before GAME_OVER either way, and the game genuinely ends here.
//
// FOUR things drive the shape of this harness:
//
//   1. NO AUDIO EXISTS for any coronation line, by design (Task 263 generates
//      nothing). A missing clip makes the host call onEnded() at once (Task
//      154), so every beat ends on a real ack at ~0ms rather than its
//      backstop. That is what makes the SEQUENCING observable without sound,
//      and it is the whole point of building this before the recordings.
//   2. Proving the NAMED line-1 branch needs a vocative clip "on disk" - but
//      in this checkout client/public/voice is a SYMLINK into /opt/party-game.
//      So the server is booted with AEGEAN_DEV_VOICE_DIR (Task 263, dev-only,
//      searched BEFORE the real dir) pointed at a throwaway directory, and
//      scenario B writes ONE dummy file there and deletes it again. Nothing
//      is ever written under /opt/party-game.
//   3. The TV page IS the host display. A second raw socket emitting
//      HOST_REJOIN would steal it, so each beat's LINE is read from the
//      server's own log via a console.log tee, not from a socket.
//   4. Task 259's tap-to-start gate covers /host for any room without ?bot=,
//      so the gate is tapped before anything else can be clicked.
//
//   npx tsx dev/263-coronation-check.ts            all scenarios
//   SCENARIO=A npx tsx dev/263-coronation-check.ts  one (A|B|C|D)
process.env.PORT = process.env.SERVER_PORT ?? '3961';

import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { io, type Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents, CLIMB_TOP, NAME_GENDER, PRESET_NAMES, lineHash, getVocative, VOCATIVE_PLACEHOLDER } from '@game/shared';

// The dev-only voice search path MUST be set before the server (and with it
// socratesAudio.ts, which reads it once at module load) is imported below.
const DEV_VOICE_DIR = mkdtempSync(path.join(tmpdir(), 'aegean-263-voice-'));
process.env.AEGEAN_DEV_VOICE_DIR = DEV_VOICE_DIR;

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_DIR = path.join(ROOT, 'client');
const SERVER_PORT = Number(process.env.SERVER_PORT ?? 3961);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5962);
const ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const CLIENT_ORIGIN = `http://127.0.0.1:${CLIENT_PORT}`;
const SCENARIO = process.env.SCENARIO ?? '';
const REAL_VOICE_DIR = path.join(ROOT, 'client', 'public', 'voice');

let clientProc: ChildProcess | null = null;
let browser: Browser | null = null;
const sockets: Socket[] = [];

// --------------------------------------------------------------------------
// Server log tee - every beat's own line, straight from the server, stamped.
// --------------------------------------------------------------------------
interface LogLine {
  ts: number;
  text: string;
}
const serverLog: LogLine[] = [];
const realLog = console.log.bind(console);
console.log = (...args: unknown[]): void => {
  const text = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  serverLog.push({ ts: Date.now(), text });
};
function say(text: string): void {
  realLog(text);
}

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail: string): void {
  if (ok) passed++;
  else failed++;
  say(`  ${ok ? 'ok  ' : 'FAIL'} ${label} — ${detail}`);
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

async function newTvPage(code: string): Promise<Page> {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript((c: string) => {
    try {
      window.localStorage.setItem('hostRoomCode', c);
    } catch {
      /* opaque origin - the real navigation re-runs this */
    }
  }, code);
  // Task 243 - ?clock=off, exactly as dev/climb-ceremony-check.ts does it:
  // Task 239's GameClock renders an mm:ss readout, so a page-wide digit sweep
  // would otherwise pick up cosmetic chrome and read as a ceremony violation.
  await page.goto(`${CLIENT_ORIGIN}/host?clock=off`);
  // Task 259 - the tap-to-start gate covers /host for any room without ?bot=.
  // It must be cleared before the page will attach as a host display at all.
  try {
    const gate = page.getByTestId('audio-gate');
    if ((await gate.count()) > 0) await gate.click({ timeout: 5000 });
  } catch {
    /* no gate (already passed) - nothing to clear */
  }
  await delay(800);
  return page;
}

type RoomLike = {
  phase: string;
  gameIntroPlayed: boolean;
  players: Map<string, { playerId: string; name: string }>;
  pendingSocratesBeat: { line: string; lineTemplate: string; prefixTemplate?: string | null } | null;
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

interface Beat {
  id: number;
  backstopMs: number;
  line: string;
  prefix: string | null;
  startTs: number;
  endTs: number | null;
  endedBy: string | null;
}

interface LiveResult {
  winnerName: string;
  beats: Beat[];
  subtitles: string[];
  anavasisSamples: number[];
  socratesLefts: string[];
  sceneDigits: string;
  pageDigits: string;
  cornerRoomCode: string;
  winnerTitle: string;
  prefixSeen: string | null;
}

// One whole game: a seeded climb whose named player is forced to the top,
// then the coronation and GAME_OVER.
async function runLive(winnerName: string, others: string[]): Promise<LiveResult> {
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

  // Sample the TV while the coronation plays: the subtitle text (Task 247),
  // whether the Anavasis world stays committed (Task 237 - Socrates must not
  // walk back to the theatre for this beat), and Socrates' own computed left.
  const subtitles: string[] = [];
  const anavasisSamples: number[] = [];
  const socratesLefts = new Set<string>();
  let sampling = true;
  const sampler = (async () => {
    const seen = new Set<string>();
    while (sampling) {
      try {
        for (const raw of await page.locator('[data-testid="socrates-subtitle"]').allTextContents()) {
          const t = raw.trim();
          if (t && !seen.has(t)) {
            seen.add(t);
            subtitles.push(t);
          }
        }
        if (room.phase === 'SOCRATES' || room.phase === 'GAME_OVER') {
          anavasisSamples.push(await page.locator('[data-testid="anavasis-scene-container"]').count());
          const fig = page.locator('[data-testid="socrates-figure"]').first();
          if ((await fig.count()) > 0) {
            const left = await fig.evaluate((el) => getComputedStyle(el as HTMLElement).left);
            socratesLefts.add(left);
          }
        }
      } catch {
        /* page busy - keep sampling */
      }
      await delay(50);
    }
  })();

  startClimb(room as never);
  await waitForPhase(room, 'CLIMB_QUESTION');

  const winnerId = [...room.players.values()].find((p) => p.name === winnerName)!.playerId;
  for (const player of room.players.values()) {
    room.climb!.steps.set(player.playerId, player.playerId === winnerId ? CLIMB_TOP - 1 : 2);
  }
  const correct = room.climb!.questions[room.climb!.questionIndex].correctIndex;
  players[0].emit(ClientEvents.CLIMB_SUBMIT, { choice: correct });

  await waitForPhase(room, 'GAME_OVER', 120000);
  await delay(400);

  // The crowning is up; PodiumView replaces it 6s later, so read it now.
  let winnerTitle = '(never rendered)';
  for (let i = 0; i < 40; i++) {
    if ((await page.locator('[data-testid="winner-title"]').count()) > 0) {
      winnerTitle = ((await page.locator('[data-testid="winner-title"]').first().textContent()) ?? '').trim();
      break;
    }
    await delay(100);
  }
  // Task 225's own two-part definition of "the ceremony shows no digits",
  // copied from dev/climb-ceremony-check.ts rather than reinvented: the SCENE
  // container must contain no digit at all, while the whole PAGE is allowed
  // exactly the corner room code (chrome, not a result). innerText, never
  // textContent - the latter sweeps up the <style> tags' own CSS numbers, the
  // trap Task 239's follow-up documented.
  const sceneText = (await page.getByTestId('anavasis-scene-container').innerText()) ?? '';
  const pageText = (await page.locator('body').innerText()) ?? '';
  const cornerRoomCode =
    (await page.getByTestId('corner-room-code').count()) > 0
      ? ((await page.getByTestId('corner-room-code').textContent()) ?? '').trim()
      : '';
  const sceneDigits = (sceneText.match(/\d/g) ?? []).join('');
  const pageDigits = (pageText.match(/\d/g) ?? []).join('');

  sampling = false;
  await sampler;

  // Rebuild the beat timeline from the server's own log.
  const beats: Beat[] = [];
  for (const { ts, text } of serverLog.slice(logMark)) {
    const start = text.match(/Socrates \(WINNER\) beat (\d+) backstop=(\d+)ms(?: prefix="([^"]*)")? — "(.*)"$/);
    if (start) {
      beats.push({
        id: Number(start[1]),
        backstopMs: Number(start[2]),
        prefix: start[3] ?? null,
        line: start[4],
        startTs: ts,
        endTs: null,
        endedBy: null,
      });
      continue;
    }
    const end = text.match(/Socrates beat (\d+) ended \((.*)\) - advancing/);
    if (end) {
      const beat = beats.find((b) => b.id === Number(end[1]) && b.endTs === null);
      if (beat) {
        beat.endTs = ts;
        beat.endedBy = end[2];
      }
    }
  }

  // Read off the server's own log, NOT by sampling room.pendingSocratesBeat:
  // with no clip recorded these beats end in ~20ms, so a 50ms poll misses the
  // splice entirely (it did, in this harness's first run).
  const prefixSeen = beats[0]?.prefix ?? null;

  await page.close();
  host.disconnect();
  for (const p of players) p.disconnect();

  return {
    winnerName,
    beats,
    subtitles,
    anavasisSamples,
    socratesLefts: [...socratesLefts],
    sceneDigits,
    pageDigits,
    cornerRoomCode,
    winnerTitle,
    prefixSeen,
  };
}

async function reportLive(title: string, r: LiveResult, expectNamed: boolean): Promise<void> {
  const { CORONATION_OPENER_NAMED, CORONATION_OPENER_PLAIN, CORONATION_LINE_TWO, CORONATION_LINES } = await import(
    '../server/src/socrates.js'
  );
  say(`\n=== ${title} ===`);
  say(`  winner: ${r.winnerName}  (NAME_GENDER=${(NAME_GENDER as Record<string, string>)[r.winnerName] ?? 'ABSENT'})`);
  say(`  beats emitted: ${r.beats.length}`);
  for (const [i, b] of r.beats.entries()) {
    const held = b.endTs === null ? '(never ended)' : `${b.endTs - b.startTs}ms`;
    say(`    #${i + 1} id=${b.id} backstop=${b.backstopMs}ms held=${held} endedBy=${b.endedBy ?? 'BACKSTOP'}`);
    say(`        "${b.line}"`);
  }
  check(`${title}: exactly 3 beats`, r.beats.length === 3, `${r.beats.length}`);
  const helds = r.beats.filter((b) => b.endTs !== null).map((b) => b.endTs! - b.startTs);
  check(
    `${title}: every beat ended on a real audio ack`,
    r.beats.length > 0 && r.beats.every((b) => b.endedBy === ClientEvents.SOCRATES_AUDIO_ENDED),
    r.beats.map((b) => b.endedBy ?? 'BACKSTOP').join(', '),
  );
  check(`${title}: each beat held < 1000ms (missing clips ack at ~0ms)`, helds.every((h) => h < 1000), `held = ${helds.join(', ')}ms`);

  const line1 = r.beats[0]?.line ?? '';
  const isNamed = line1.endsWith(CORONATION_OPENER_PLAIN) && line1 !== CORONATION_OPENER_PLAIN;
  const isPlain = line1 === CORONATION_OPENER_PLAIN;
  say(`  line-1 variant selected: ${isNamed ? 'NAMED (vocative substituted)' : isPlain ? 'NAMELESS fallback' : '(neither!)'}`);
  say(`  beat-1 spliced prefix  : ${r.prefixSeen === null ? 'null (no splice)' : `"${r.prefixSeen}"`}`);
  check(`${title}: line-1 variant is ${expectNamed ? 'NAMED' : 'NAMELESS'}`, expectNamed ? isNamed : isPlain, line1.slice(0, 40) + '…');
  check(
    `${title}: prefix ${expectNamed ? 'present' : 'absent'}`,
    expectNamed ? r.prefixSeen !== null : r.prefixSeen === null,
    String(r.prefixSeen),
  );
  check(`${title}: beat 2 is coronation line 2`, r.beats[1]?.line === CORONATION_LINE_TWO, (r.beats[1]?.line ?? '').slice(0, 40) + '…');
  const gender = (NAME_GENDER as Record<string, 'm' | 'f'>)[r.winnerName];
  say(`  line-3 variant: ${r.beats[2]?.line === CORONATION_LINES.m ? '3α (m)' : r.beats[2]?.line === CORONATION_LINES.f ? '3β (f)' : '(neither!)'}`);
  check(`${title}: beat 3 is the ${gender} variant`, r.beats[2]?.line === CORONATION_LINES[gender], (r.beats[2]?.line ?? '').slice(0, 40) + '…');

  // INVERSE (criterion 4)
  say(`  ceremony winner-title  : "${r.winnerTitle}"`);
  say(`  digits IN THE SCENE    : ${r.sceneDigits === '' ? 'NONE' : `"${r.sceneDigits}"`}`);
  say(`  digits on the WHOLE page: ${r.pageDigits === '' ? 'NONE' : `"${r.pageDigits}"`} (corner room code = "${r.cornerRoomCode}")`);
  say(`  subtitles rendered     : ${r.subtitles.length} ${JSON.stringify(r.subtitles.map((s) => s.slice(0, 28) + '…'))}`);
  say(`  anavasis container     : ${r.anavasisSamples.length} samples, min=${Math.min(...r.anavasisSamples)}, max=${Math.max(...r.anavasisSamples)}`);
  say(`  socrates computed left : ${JSON.stringify(r.socratesLefts)}`);
  check(`${title}: ceremony scene shows ZERO digits`, r.sceneDigits === '', r.sceneDigits === '' ? '0 digits' : `found "${r.sceneDigits}"`);
  check(
    `${title}: the only digits on the whole page are the room code`,
    r.pageDigits === r.cornerRoomCode.replace(/\D/g, ''),
    `page "${r.pageDigits}" vs room code "${r.cornerRoomCode}"`,
  );
  check(
    `${title}: Anavasis world never dropped during the beats`,
    r.anavasisSamples.length > 0 && r.anavasisSamples.every((n) => n === 1),
    `min=${Math.min(...r.anavasisSamples)}`,
  );
  check(`${title}: at least one coronation subtitle rendered`, r.subtitles.length > 0, `${r.subtitles.length}`);
}

// --------------------------------------------------------------------------
// D - the static facts: hashes, name-independence, what is registered.
// --------------------------------------------------------------------------
async function runStatic(): Promise<void> {
  const {
    CORONATION_OPENER_NAMED,
    CORONATION_OPENER_PLAIN,
    CORONATION_LINE_TWO,
    CORONATION_LINES,
    LINE_TAGS,
    buildCoronationSequence,
    coronationVocative,
    collectVoiceLineEntries,
  } = await import('../server/src/socrates.js');

  say('\n=== D: the four texts, their hashes, and what is on disk ===');
  const h = (t: string) => lineHash(t, LINE_TAGS[t] ?? null);
  const onDisk = (t: string) => existsSync(path.join(REAL_VOICE_DIR, `${h(t)}.mp3`));
  for (const [label, t] of [
    ['line1 named', CORONATION_OPENER_NAMED],
    ['line1 plain', CORONATION_OPENER_PLAIN],
    ['line2      ', CORONATION_LINE_TWO],
    ['line3 α (m)', CORONATION_LINES.m],
    ['line3 β (f)', CORONATION_LINES.f],
  ] as const) {
    say(`  ${label}  tag=${String(LINE_TAGS[t] ?? 'null').padEnd(10)} hash=${h(t)}  onDisk=${onDisk(t)}`);
  }

  say('\n  line-1 hash is NAME-INDEPENDENT:');
  const hashes = new Set<string>();
  for (const name of ['Νίκος', 'Μαρία', 'Φίλιππος', 'Ξενοφών']) {
    const seq = buildCoronationSequence((NAME_GENDER as Record<string, 'm' | 'f'>)[name], name, true)!;
    hashes.add(lineHash(seq[0].template, seq[0].tag));
    say(`    winner=${name.padEnd(9)} hash=${lineHash(seq[0].template, seq[0].tag)}  text="${seq[0].text.slice(0, 26)}…"`);
  }
  check('D: one hash for line 1 across all winners', hashes.size === 1, `${hashes.size} distinct`);
  check(
    'D: placeholder stays literal in the hashed template',
    CORONATION_OPENER_NAMED.includes(VOCATIVE_PLACEHOLDER),
    VOCATIVE_PLACEHOLDER,
  );

  const entries = collectVoiceLineEntries();
  const voc = entries.filter((e) => e.moment === 'VOCATIVE');
  const cor = entries.filter((e) => e.moment === 'CORONATION');
  say('\n  collectVoiceLineEntries:');
  say(`    total entries      : ${entries.length}`);
  say(`    CORONATION entries : ${cor.length}`);
  say(`    VOCATIVE entries   : ${voc.length}  (PRESET_NAMES=${PRESET_NAMES.length}, distinct vocatives=${new Set(PRESET_NAMES.map(getVocative)).size})`);
  say(`    on disk (real dir) : coronation ${cor.filter((e) => existsSync(path.join(REAL_VOICE_DIR, `${e.hash}.mp3`))).length}/${cor.length}, vocative ${voc.filter((e) => existsSync(path.join(REAL_VOICE_DIR, `${e.hash}.mp3`))).length}/${voc.length}`);
  check('D: vocatives are registered for generation', voc.length > 0, `${voc.length}`);
  check('D: all 5 coronation texts registered', cor.length === 5, `${cor.length}`);
  check(
    'D: ZERO coronation/vocative clips exist on disk',
    [...cor, ...voc].every((e) => !existsSync(path.join(REAL_VOICE_DIR, `${e.hash}.mp3`))),
    'none present',
  );
  const v = coronationVocative('Νίκος')!;
  say(`    vocative for Νίκος : "${v.template}" tag=${v.tag} hash=${lineHash(v.template, v.tag)}`);
}

async function main(): Promise<void> {
  say(`booting in-process server on ${SERVER_PORT}`);
  say(`dev voice search dir (throwaway): ${DEV_VOICE_DIR}`);
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

  const run = (s: string) => SCENARIO === '' || SCENARIO === s;

  if (run('D')) await runStatic();

  if (run('A')) {
    say('\n--- A: no vocative clip anywhere (the real, shipping case) ---');
    await reportLive('A (Νίκος, no clip)', await runLive('Νίκος', ['Μαρία', 'Άρης']), false);
  }

  if (run('B')) {
    // The ONLY file this harness ever writes, in a throwaway dir outside the
    // repo. Never /opt/party-game, never client/public/voice.
    const { coronationVocative } = await import('../server/src/socrates.js');
    const v = coronationVocative('Νίκος')!;
    const dummy = path.join(DEV_VOICE_DIR, `${lineHash(v.template, v.tag)}.mp3`);
    writeFileSync(dummy, Buffer.alloc(8000));
    say(`\n--- B: a dummy vocative clip for Νίκος ("${v.template}") at ${dummy} ---`);
    await reportLive('B (Νίκος, clip present)', await runLive('Νίκος', ['Μαρία', 'Άρης']), true);
    rmSync(dummy);
    say(`  dummy deleted; dev voice dir now holds: ${JSON.stringify(readdirSync(DEV_VOICE_DIR))}`);
  }

  if (run('C')) {
    say('\n--- C: a FEMALE winner (line 3β) ---');
    await reportLive('C (Μαρία, no clip)', await runLive('Μαρία', ['Νίκος', 'Άρης']), false);
  }

  say(`\n${passed} passed, ${failed} failed`);
}

main().then(
  async () => {
    for (const s of sockets) s.disconnect();
    if (browser) await browser.close();
    killGroup(clientProc);
    rmSync(DEV_VOICE_DIR, { recursive: true, force: true });
    process.exit(failed === 0 ? 0 : 1);
  },
  async (err) => {
    realLog(err);
    for (const s of sockets) s.disconnect();
    if (browser) await browser.close();
    killGroup(clientProc);
    rmSync(DEV_VOICE_DIR, { recursive: true, force: true });
    process.exit(1);
  },
);
