// Task 236 - the intro/stage-intro wiring check. Drives a real `mode=full`
// room over the REAL socket protocol against a throwaway dev server
// (socket.io-client, the same "bot at the socket level" pattern
// dev/stage-intro-check.ts and dev/full-lineup-check.ts already use - no
// Playwright, no screenshots), and reports the four acceptance criteria this
// task is graded on:
//
//   1. STAGES      stage 1-7: was a card shown, which intro line fired, its
//                  group/tag, at what timestamp
//   2. ROUND-1     game start / GAME_INTRO start+end / stage-1 card / first
//                  question, so a cold open with no round indicator is visible
//   3. ANAVASIS    the finale's own intro line(s), their audio duration, and
//                  that CLIMB_QUESTION only starts after the audio ack
//   4. INVERSE     moment lines still firing, the Task 231 filtered lines
//                  firing zero times, and one pause/resume mid-SOCRATES
//
// Two things this harness does that dev/stage-intro-check.ts does not, both
// required by the criteria above:
//
//   * It ACKS SOCRATES AUDIO, the way bots.ts's own wireHostSocratesAck
//     describes (replicated here rather than imported - importing
//     server/src/bots.js would pull realtime.js in and stand up a SECOND
//     httpServer inside this process). The ack is PAUSE-AWARE: a pause
//     clears the pending ack and the remainder is re-armed on resume, which
//     is what a real browser does when its audio is paused. Without this
//     every beat rides the full SOCRATES_MAX_DURATION_MS backstop and every
//     timestamp in the report is wrong.
//   * Its human joins as `minotaur`, the FIRST avatar in AVATAR_CATALOGUE.
//     Bots take avatars from the END (bots.ts:466, Task 223), so the front
//     of the catalogue is collision-free. dev/stage-intro-check.ts asks for
//     `sphinx`, which is in the tail: with ?bot=3 that bot's join is
//     rejected AVATAR_TAKEN and its own `players.length >= 4` wait times out.
//
//   npx tsx dev/intro-lines-check.ts              # full game -> GAME_OVER
//   RUN_MS=240000 npx tsx dev/intro-lines-check.ts  # cap the observation
//   MODE=quiz npx tsx dev/intro-lines-check.ts      # another mode
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { io, type Socket } from 'socket.io-client';
import { ClientEvents, DUEL_WEAPONS, ServerEvents, lineHash } from '@game/shared';

const ROOT = path.resolve(import.meta.dirname, '..');
const SERVER_DIR = path.join(ROOT, 'server');
const SERVER_PORT = Number(process.env.SERVER_PORT) || 3915; // distinct from every other harness's throwaway port
const ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const MODE = process.env.MODE ?? 'full';
const BOTS = Number(process.env.BOTS) || 3;

// The Task 230 bank, by hash - so the report can name the GROUP a fired line
// belongs to instead of only its hash. Text is deliberately NOT duplicated
// here; the server's own log carries it and the hash is the identity.
const KNOWN_GROUPS: Record<string, string> = {
  '35e4fb8b4163c1f6': 'Εισαγωγή#1', '6dff7bac5460652f': 'Εισαγωγή#2',
  '842169f9a829faaa': 'Εισαγωγή#3', 'a88a4ce657479a66': 'Εισαγωγή#4',
  c47dc43c584f58b2: 'Εισαγωγή#5', '5ba8c95a8c49416b': 'Εισαγωγή#6',
  '931e1a38950f65cf': 'Εισαγωγή#7', '3e92ccdd463e2f28': 'Εισαγωγή#8',
  '16c6ea1676ae1cd9': 'Εισαγωγή#9', '837d1d6393c61fb2': 'Εισαγωγή#10',
  '4171b462473d2c7c': 'Παλαίστρα#11', b55bbb406348b3b9: 'Παλαίστρα#12',
  '15a41b1acf3b1073': 'Παλαίστρα#13', '4b9a56cfe96d3269': 'Ζωγραφική#14',
  '3dfea3c22bfefa6a': 'Ζωγραφική#15', e4529417379f1c98: 'Εκτίμηση#16',
  e827ecccaf3484e5: 'Εκτίμηση#17', '9e4102d2b03800ba': 'Λήθη#18',
  d5fa0083a1e96354: 'Λήθη#19', '36ae9a28048b61c5': 'Ανάβασις#20',
  a8ec509e4513305d: 'Ανάβασις#21', b8399492286a98e1: 'Ανάβασις#22',
};

// Task 231's filtered lines - criterion 4 requires these to fire ZERO times
// in full mode. Kept verbatim (they are still selectable in standalone quiz).
const FILTERED_IN_FULL: readonly string[] = [
  'Τρεις γύροι σας χωρίζουν από την απάντηση που ήρθατε να ακούσετε. Ελάχιστοι φτάνουν ως εκεί όρθιοι.',
  'Οι Σοφιστές. Από εδώ και πέρα δεν αρκεί να ξέρετε.',
  'Δεύτερος γύρος. Τώρα μπορείτε να βλάψετε ο ένας τον άλλον.',
  'Οι Σοφιστές δίδασκαν πώς να κερδίζεις, όχι πώς να έχεις δίκιο. Θα σας φανεί χρήσιμο.',
];

interface BeatRecord {
  t: number;
  ackT: number | null;
  template: string;
  tag: string | null;
  hash: string;
  group: string;
  totalDurationMs: number;
  afterStage: number | null;
  pausedMs: number;
}
interface StageRecord {
  t: number;
  stage: number;
  totalStages: number;
  title: string;
}
interface PhaseRecord {
  t: number;
  phase: string;
}

const beats: BeatRecord[] = [];
const stages: StageRecord[] = [];
const phases: PhaseRecord[] = [];
let firstQuestionT: number | null = null;
let firstClimbQuestionT: number | null = null;
let gameOverT: number | null = null;
let pauseReport = 'not attempted';

let gameStart = 0;
const now = () => Date.now() - gameStart;

let serverProc: ChildProcess | null = null;
const sockets: Socket[] = [];

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
  killGroup(serverProc);
}

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const ok = await new Promise<boolean>((resolve) => {
      const probe = io(ORIGIN, { reconnection: false, timeout: 1000, transports: ['websocket'] });
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

function connect(): Socket {
  const s = io(ORIGIN, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  return s;
}

function waitFor<T = Record<string, unknown>>(
  socket: Socket,
  event: string,
  timeoutMs: number,
  predicate?: (p: T) => boolean,
): Promise<T> {
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

const PLACEHOLDER_DRAWING =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function pick(n: number): number {
  return Math.floor(Math.random() * n);
}

// Same discipline as dev/stage-intro-check.ts: the scripted human answers
// fast (never reading a correct answer) so every "all connected have
// answered" early-advance still fires and the run stays near the ~850s
// baseline instead of sitting out every timer.
function wireFastAnswers(socket: Socket): void {
  const soon = (fn: () => void) => setTimeout(fn, 300 + Math.random() * 400);
  socket.on(ServerEvents.QUESTION_SHOW, (p: { options?: string[] }) => {
    if (!p.options) return;
    soon(() => socket.emit(ClientEvents.SUBMIT_ANSWER, { choice: pick(p.options!.length) }));
  });
  socket.on(ServerEvents.POWER_UP_SHOW, (p: { targets?: { playerId: string }[] }) => {
    if (!p.targets?.length) return;
    soon(() =>
      socket.emit(ClientEvents.POWER_UP_CHOOSE, {
        effect: 'ink',
        targetPlayerId: p.targets![pick(p.targets!.length)].playerId,
      }),
    );
  });
  socket.on(ServerEvents.STEAL_SHOW, (p: { youAreThief?: boolean; targets?: { playerId: string }[] }) => {
    if (!p.youAreThief || !p.targets?.length) return;
    soon(() =>
      socket.emit(ClientEvents.STEAL_CHOOSE, { targetPlayerId: p.targets![pick(p.targets!.length)].playerId }),
    );
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
  // Task 188a - the climb has its OWN lock-in event (player:climb_submit).
  // SUBMIT_ANSWER is hard-gated to phase QUESTION (index.ts:1026) and would
  // be rejected every single round, leaving the finale to sit out its full
  // CLIMB_QUESTION_TIME_MS timer each time.
  socket.on(ServerEvents.CLIMB_QUESTION_SHOW, (p: { options?: string[]; climbing?: boolean; lockedIn?: boolean }) => {
    if (!p.options || p.climbing !== true || p.lockedIn) return;
    soon(() => socket.emit(ClientEvents.CLIMB_SUBMIT, { choice: pick(p.options!.length) }));
  });
  // A non-duelist's pick is rejected server-side (submitDuelPick checks
  // duelistIds), so this needs nothing out of the payload itself.
  socket.on(ServerEvents.DUEL_PICK_SHOW, () => {
    soon(() => socket.emit(ClientEvents.DUEL_PICK, { weapon: DUEL_WEAPONS[pick(DUEL_WEAPONS.length)] }));
  });
  let blitzGeneration = 0;
  socket.on(ServerEvents.BLITZ_SHOW, (p: { total?: number; answeredCount?: number; progressByPlayerId?: unknown }) => {
    if (p.progressByPlayerId !== undefined || p.total === undefined) return;
    blitzGeneration += 1;
    const myGeneration = blitzGeneration;
    let next = p.answeredCount ?? 0;
    const swipe = () => {
      if (myGeneration !== blitzGeneration || next >= p.total!) return;
      socket.emit(ClientEvents.BLITZ_SWIPE, { index: next, answeredTrue: Math.random() < 0.5 });
      next += 1;
      setTimeout(swipe, 150 + Math.random() * 150);
    };
    setTimeout(swipe, 150);
  });
}

const t0 = Date.now();
function timestampedWrite(chunk: Buffer): void {
  const text = chunk.toString();
  const elapsed = Date.now() - t0;
  for (const line of text.split('\n')) {
    if (line.length === 0) continue;
    process.stdout.write(`[${elapsed}ms] ${line}\n`);
  }
}

function fmt(ms: number | null): string {
  return ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`;
}

function report(): void {
  const line = (s: string) => process.stdout.write(`${s}\n`);
  line('');
  line('================ TASK 236 REPORT ================');

  line('');
  line('--- CRITERION 1: every stage announced AND voiced ---');
  line('stage | card | t(card) | intro line (hash) | group | tag | t(line)');
  for (const st of stages) {
    const beat = beats.find((b) => b.afterStage === st.stage);
    line(
      `${st.stage}/${st.totalStages} | yes | ${fmt(st.t)} | ${beat ? beat.hash : 'NONE — SILENT'} | ` +
        `${beat ? beat.group : '—'} | ${beat?.tag ?? '—'} | ${beat ? fmt(beat.t) : '—'} | ${st.title}`,
    );
  }

  line('');
  line('--- CRITERION 2: round-1 open ---');
  line(`game start (vip:start_game)      ${fmt(0)}`);
  // The GAME_INTRO beat(s): the named Εισαγωγή group once Task 236 wires it,
  // OR - what makes this work on a PRE-change baseline too, where the intro
  // is an old pool entry with no group name of its own - anything that fired
  // before the first stage card was ever shown.
  const stage1 = stages.find((s) => s.stage === 1);
  const intro = beats.filter((b) => b.group.startsWith('Εισαγωγή') || (stage1 !== undefined && b.t < stage1.t));
  if (intro.length > 0) {
    line(`GAME_INTRO first line start      ${fmt(intro[0].t)}  (${intro[0].hash})`);
    line(`GAME_INTRO last line ack (end)   ${fmt(intro[intro.length - 1].ackT)}  (${intro.length} line(s))`);
    line(`GAME_INTRO line count            ${intro.length}`);
  } else {
    line('GAME_INTRO                       none fired');
  }
  line(`stage-1 card shown               ${fmt(stage1?.t ?? null)}`);
  line(`first question shown             ${fmt(firstQuestionT)}`);

  line('');
  line('--- CRITERION 3: Η Ανάβασις states the rule ---');
  const finale = stages[stages.length - 1];
  const finaleBeats = beats.filter((b) => b.afterStage === finale?.stage);
  if (finaleBeats.length === 0) {
    line('NO finale intro line fired — SILENT');
  }
  for (const b of finaleBeats) {
    line(`${b.hash} | ${b.group} | ${b.tag} | audio ${b.totalDurationMs}ms | start ${fmt(b.t)} | ack ${fmt(b.ackT)}`);
  }
  line(`first CLIMB_QUESTION shown       ${fmt(firstClimbQuestionT)}`);
  const lastAck = finaleBeats.length > 0 ? finaleBeats[finaleBeats.length - 1].ackT : null;
  line(
    `climb starts after audio ack?    ${
      lastAck !== null && firstClimbQuestionT !== null ? (firstClimbQuestionT >= lastAck ? 'YES' : 'NO') : 'n/a'
    }`,
  );

  line('');
  line('--- CRITERION 4: inverse ---');
  const moments = beats.filter((b) => b.group === 'moment/other');
  line(`moment + other (non Task-230) lines fired: ${moments.length}`);
  for (const m of moments.slice(0, 12)) {
    line(`  ${m.hash} | ${fmt(m.t)} | "${m.template.slice(0, 64)}"`);
  }
  const filteredHits = beats.filter((b) => FILTERED_IN_FULL.includes(b.template));
  line(`Task 231 filtered lines fired: ${filteredHits.length} (must be 0 in full)`);
  for (const f of filteredHits) line(`  LEAK ${f.hash} "${f.template}"`);
  line(`pause/resume mid-SOCRATES: ${pauseReport}`);

  line('');
  line(`total beats: ${beats.length} | stages announced: ${stages.length} | game over at ${fmt(gameOverT)}`);
  line('================================================');
}

async function main(): Promise<void> {
  serverProc = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: SERVER_DIR,
    detached: true,
    env: { ...process.env, PORT: String(SERVER_PORT), NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.stdout?.on('data', timestampedWrite);
  serverProc.stderr?.on('data', timestampedWrite);
  try {
    await waitForServer();

    const host = connect();
    const created = waitFor<{ code: string }>(host, ServerEvents.ROOM_CREATED, 15000);
    // Task 222 - the mode is set AT CREATION, so no VIP round-trip is needed.
    host.emit(ClientEvents.CREATE_ROOM, { botCount: BOTS, mode: MODE });
    const { code } = await created;
    console.log(`>>> room ${code} created with ?bot=${BOTS}&mode=${MODE}`);

    // --- the host's pause-aware Socrates audio ack (see header) ---
    let ackTimer: NodeJS.Timeout | null = null;
    let ackRemainingMs = 0;
    let ackArmedAt = 0;
    let currentBeat: BeatRecord | null = null;
    let currentBeatId = 0;
    const armAck = (ms: number) => {
      ackRemainingMs = ms;
      ackArmedAt = Date.now();
      const beatId = currentBeatId;
      ackTimer = setTimeout(() => {
        ackTimer = null;
        if (currentBeat) currentBeat.ackT = now();
        // Task 236 - echo the beat id, exactly as the real TV does.
        host.emit(ClientEvents.SOCRATES_AUDIO_ENDED, { beatId });
      }, ms);
    };
    host.on(ServerEvents.SOCRATES_SHOW, (p: {
      lineTemplate: string;
      lineTag: string | null;
      totalDurationMs: number;
      beatId: number;
    }) => {
      currentBeatId = p.beatId;
      const hash = lineHash(p.lineTemplate, p.lineTag);
      const afterStage = stages.length > 0 ? stages[stages.length - 1].stage : null;
      // A beat is attributed to a stage only if nothing else has already
      // claimed that stage - a stage's INTRO is its first beat, later beats
      // in the same stage are round moments.
      const claimed = beats.some((b) => b.afterStage === afterStage);
      const rec: BeatRecord = {
        t: now(),
        ackT: null,
        template: p.lineTemplate,
        tag: p.lineTag,
        hash,
        group: KNOWN_GROUPS[hash] ?? 'moment/other',
        totalDurationMs: p.totalDurationMs,
        afterStage: claimed ? null : afterStage,
        pausedMs: 0,
      };
      beats.push(rec);
      currentBeat = rec;
      if (ackTimer) clearTimeout(ackTimer);
      armAck(p.totalDurationMs);
    });
    // A pause freezes the clip exactly as a real browser would, so the ack
    // lands the same distance into the audio it would have.
    host.on(ServerEvents.GAME_PAUSED, () => {
      if (ackTimer) {
        clearTimeout(ackTimer);
        ackTimer = null;
        ackRemainingMs = Math.max(0, ackRemainingMs - (Date.now() - ackArmedAt));
      }
    });
    host.on(ServerEvents.GAME_RESUMED, () => {
      if (ackRemainingMs > 0 && ackTimer === null && currentBeat && currentBeat.ackT === null) {
        armAck(ackRemainingMs);
      }
    });

    host.on(ServerEvents.STAGE_ANNOUNCE, (p: { stage: number; totalStages: number; title: string }) => {
      stages.push({ t: now(), stage: p.stage, totalStages: p.totalStages, title: p.title });
    });
    host.on(ServerEvents.PHASE_CHANGED, (p: { phase: string }) => {
      phases.push({ t: now(), phase: p.phase });
    });
    host.on(ServerEvents.QUESTION_SHOW, () => {
      if (firstQuestionT === null) firstQuestionT = now();
    });
    host.on(ServerEvents.CLIMB_QUESTION_SHOW, () => {
      if (firstClimbQuestionT === null) firstClimbQuestionT = now();
    });

    const human = connect();
    wireFastAnswers(human);
    const playerId = randomUUID();
    const joined = waitFor(human, ServerEvents.PLAYER_JOINED, 15000);
    // `minotaur` is AVATAR_CATALOGUE[0]; bots take from the END (see header).
    human.emit(ClientEvents.PLAYER_JOIN, { code, name: 'Δοκιμαστής', playerId, avatarId: 'minotaur' });
    await joined;

    await waitFor<{ players: unknown[] }>(human, ServerEvents.LOBBY_UPDATE, 20000, (p) => p.players.length >= BOTS + 1);
    console.log(`>>> ${BOTS + 1} players in lobby, mode ${MODE} - starting`);

    // Criterion 4's pause probe: the first beat long enough to pause inside
    // and still resume before its own ack would have landed.
    let pauseDone = false;
    host.on(ServerEvents.SOCRATES_SHOW, (p: { totalDurationMs: number }) => {
      if (pauseDone || p.totalDurationMs < 4000 || stages.length < 1) return;
      pauseDone = true;
      const beatStart = now();
      setTimeout(() => {
        human.emit(ClientEvents.GAME_PAUSE);
        setTimeout(() => {
          human.emit(ClientEvents.GAME_RESUME);
          pauseReport =
            `paused ${fmt(beatStart)} into a ${p.totalDurationMs}ms beat for ~1500ms, resumed; ` +
            'see server log for "paused by"/"resumed"';
        }, 1500);
      }, 400);
    });

    gameStart = Date.now();
    const over = waitFor(host, ServerEvents.GAME_OVER, 1_500_000);
    human.emit(ClientEvents.VIP_START_GAME, {});
    const runMsEnv = Number(process.env.RUN_MS);
    if (runMsEnv > 0) {
      await Promise.race([over, delay(runMsEnv)]);
      console.log(`>>> RUN_MS (${runMsEnv}ms) elapsed - stopping observation`);
    } else {
      await over;
      gameOverT = now();
      console.log('>>> GAME_OVER reached');
    }
    report();
  } finally {
    await cleanup();
  }
}

main().then(
  () => process.exit(0),
  async (err) => {
    console.error(err);
    report();
    await cleanup();
    process.exit(1);
  },
);
