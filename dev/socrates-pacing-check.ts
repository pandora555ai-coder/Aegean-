// Task 238 - Socrates pacing: the duration-aware backstop (A) and the VIP's
// skip (B), observed against a REAL server over REAL sockets. Same infra as
// dev/finale-staging-check.ts / dev/climb-ceremony-check.ts: an in-process
// real server on a throwaway port, so the harness can read the LIVE Room and
// report what the phase timer was ACTUALLY armed at rather than inferring it
// from how long something took.
//
// Beats are driven through the real sequence machinery (enterSocratesBeat plus
// room.pendingSocratesQueue, exactly what startSocratesSequence sets up), NOT
// by waiting for a ~14-minute full show to happen to roll the four over-cap
// lines out of their random pools: #11 is 1 of 3 and #15 is 1 of 2, so a live
// run covers all four only about one time in six. The code path under test is
// identical either way - same enterSocratesBeat, same queue drain, same
// continuations table, same ack handler.
//
//   A   the four over-cap clips plus two ordinary ones: armed backstop vs real
//       audio length vs when the natural ack landed, and what advanced it.
//   B   inverse: a HUNG clip (ack blocked) on both the known-duration and the
//       unknown-duration path, and a MISSING clip acking at ~0ms (Task 154).
//   C   the VIP skip mid-sequence: press -> synthesized ack -> next beat, that
//       it goes through the SAME validation as a natural ack, that a second
//       press inside one beat is refused as stale, and that a non-VIP is
//       refused outright.
//   D   skipping through the whole Η Ανάβασις announcement: CLIMB_QUESTION
//       must arrive only after the sequence is done, plus pause+skip and
//       skip+pause both leaving the shared timer consistent.
//   E   the DOM half of C: a non-VIP phone renders no skip control at all.
//
//   npx tsx dev/socrates-pacing-check.ts
//   SCENARIO=A npx tsx dev/socrates-pacing-check.ts
process.env.PORT = '3917';

import { execFileSync } from 'node:child_process';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser } from 'playwright';
import { io as ioClient, type Socket } from 'socket.io-client';
import {
  ClientEvents,
  ServerEvents,
  SOCRATES_BACKSTOP_MARGIN_MS,
  SOCRATES_BACKSTOP_UNKNOWN_MS,
} from '@game/shared';

const SERVER_PORT = 3917;
const CLIENT_PORT = 5918;
const ROOT = new URL('..', import.meta.url).pathname;
const CLIENT_DIR = `${ROOT}client`;
const VOICE_DIR = path.join(ROOT, 'client/public/voice');
const ONLY = process.env.SCENARIO ?? '';

let passed = 0;
let failed = 0;
const failures: string[] = [];

// NOTE: every line this harness prints itself goes through `say`, never
// console.log. console.log is teed into serverLog below to capture the
// SERVER's own lines, and a harness print that quotes a server line back
// (a "path proof", a check detail) would otherwise be recaptured and counted
// as a second occurrence of the very thing it was reporting.
function check(label: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    say(`  ok   ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    failures.push(label);
    say(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// Server log capture. The server runs IN THIS PROCESS, so its console.log is
// ours to tee. The advance path is proven from these lines: a beat that ended
// on a client signal leaves an "ended (<event>) - advancing" line naming which
// event did it, and a beat that leaves none was ended by the backstop timer.
// ---------------------------------------------------------------------------
interface LogLine {
  t: number;
  text: string;
}
const serverLog: LogLine[] = [];
const realLog = console.log.bind(console);
// The harness's own voice: prints, but is never captured as a server line.
const say = realLog;
let teeing = false;
console.log = (...args: unknown[]) => {
  const text = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  if (teeing) serverLog.push({ t: Date.now(), text });
  realLog(...args);
};

function logsSince(t: number, needle: string): LogLine[] {
  return serverLog.filter((l) => l.t >= t && l.text.includes(needle));
}

// ---------------------------------------------------------------------------
// Real audio length, straight off the mp3 - the INDEPENDENT measurement the
// server's own byte-size estimate is judged against.
// ---------------------------------------------------------------------------
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

interface Sim {
  name: string;
  playerId: string;
  socket: Socket;
}

const AVATARS = ['minotaur', 'sphinx', 'medusa', 'centaur'];
// Task 249 - names are PRESET-ONLY since Task 241 (isValidPlayerName = strict
// membership in PRESET_NAMES), so the Greek-letter names this suite was
// written with are rejected at join with INVALID_NAME. Names only - no
// scenario, threshold or check is touched.
const NAMES = ['Άρης', 'Νίκη', 'Χαρά', 'Τάκης'];

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

// A bare host socket, the role SOCRATES_SHOW is sent to (and the only role
// allowed to ack). No browser: this harness is about timing, not pixels.
function connectHost(): Promise<{ socket: Socket; code: string }> {
  return new Promise((resolve, reject) => {
    const socket: Socket = ioClient(`http://localhost:${SERVER_PORT}`, { reconnection: false });
    socket.on('connect', () => socket.emit(ClientEvents.CREATE_ROOM, { mode: 'full' }));
    socket.once(ServerEvents.ROOM_CREATED, (p: { code: string }) => resolve({ socket, code: p.code }));
    socket.once('connect_error', reject);
  });
}

type RoomLike = {
  code: string;
  phase: string;
  paused: boolean;
  gameIntroPlayed: boolean;
  socratesBeatId: number;
  socratesBackstopMs: number;
  pendingSocratesQueue: Array<{ line: string; lineTemplate: string; lineTag: string | null }>;
  activeTimer: { kind: string; durationMs: number; remainingAtPause: number | null } | null;
  climb: unknown;
};

interface BeatObservation {
  beatId: number;
  hash: string;
  label: string;
  realMs: number | null;
  totalDurationMs: number; // what the payload says the clip runs for
  armedMs: number; // what the phase timer was ACTUALLY armed at
  showT: number;
  ackT: number | null;
  endT: number | null;
  cause: string;
}

async function main(): Promise<void> {
  say('booting in-process server on', SERVER_PORT);
  await import('../server/src/index.js');
  const { getRoom } = await import('../server/src/state.js');
  const { enterSocratesBeat, advanceFromSocrates, startClimb } = await import('../server/src/phases.js');
  const { collectVoiceLineEntries } = await import('../server/src/socrates.js');
  const { socratesBackstopMs, resolveSocratesClip } = await import('../server/src/socratesAudio.js');
  const { remainingActiveTimerMs } = await import('../server/src/timers.js');
  teeing = true;

  const entries = collectVoiceLineEntries();
  const byHash = new Map(entries.map((e) => [e.hash, e]));

  // The four ACTIVE clips that run past the old 11000ms cap (Εισαγωγή#9,
  // Παλαίστρα#11, Ζωγραφική#15, Ανάβασις#22), plus two comfortably under it,
  // so the table shows the cap is gone without claiming every clip moved.
  const OVER_CAP = [
    { hash: '16c6ea1676ae1cd9', label: 'Εισαγωγή#9' },
    { hash: '4171b462473d2c7c', label: 'Παλαίστρα#11' },
    { hash: '3dfea3c22bfefa6a', label: 'Ζωγραφική#15' },
    { hash: 'b8399492286a98e1', label: 'Ανάβασις#22' },
  ];
  const UNDER_CAP = [
    { hash: 'a8ec509e4513305d', label: 'Ανάβασις#21' },
    { hash: '36ae9a28048b61c5', label: 'Ανάβασις#20' },
  ];

  // Boots a fresh room with `n` players; sims[0] is the VIP (first to join).
  async function newRoom(n: number): Promise<{ host: Socket; code: string; sims: Sim[]; room: RoomLike }> {
    const { socket: host, code } = await connectHost();
    const sims: Sim[] = [];
    for (let i = 0; i < n; i++) sims.push(await joinSim(NAMES[i], AVATARS[i], code));
    await delay(300);
    const room = getRoom(code) as unknown as RoomLike;
    // CLAUDE.md / Task 237 - anything that jumps straight into a beat or the
    // climb must seed this, or the ten-line opening narration fires first.
    room.gameIntroPlayed = true;
    return { host, code, sims, room };
  }

  function closeRoom(host: Socket, sims: Sim[]): void {
    for (const s of sims) s.socket.disconnect();
    host.disconnect();
  }

  // Queues `lines` as one narration and enters its first beat, which is what
  // startSocratesSequence does. A trailing sentinel is appended so the LAST
  // real line's ack drains to something inert instead of routing into a game
  // that was never started.
  function startSequence(room: RoomLike, lines: Array<{ line: string; tag: string | null }>): void {
    const [first, ...rest] = lines;
    room.pendingSocratesQueue = rest.map((l) => ({ line: l.line, lineTemplate: l.line, lineTag: l.tag }));
    enterSocratesBeat(
      room as never,
      'SOCRATES',
      { kind: 'STAGE_INTRO', line: first.line, lineTemplate: first.line, lineTag: first.tag },
      () => advanceFromSocrates(room.code as never),
    );
  }

  // =========================================================================
  // A - every beat is held for its OWN clip, and healthy audio never meets
  //     the backstop.
  // =========================================================================
  if (!ONLY || ONLY === 'A') {
    say('\n--- A: duration-aware backstop over 6 real beats ---');
    const { host, code, sims, room } = await newRoom(2);
    const plan = [...OVER_CAP, ...UNDER_CAP];
    const seen: BeatObservation[] = [];

    host.on(ServerEvents.SOCRATES_SHOW, (p: { beatId: number; lineTemplate: string; lineTag: string | null; totalDurationMs: number }) => {
      const { lineHashOf, label } = (() => {
        const match = plan.find((x) => byHash.get(x.hash)?.line === p.lineTemplate);
        return { lineHashOf: match?.hash ?? 'sentinel', label: match?.label ?? 'sentinel' };
      })();
      if (label === 'sentinel') return; // never acked; ends the run
      const obs: BeatObservation = {
        beatId: p.beatId,
        hash: lineHashOf,
        label,
        realMs: realDurationMs(lineHashOf),
        totalDurationMs: p.totalDurationMs,
        // The LIVE timer, not a guess: this is the whole point of running the
        // server in-process.
        armedMs: room.activeTimer?.durationMs ?? -1,
        showT: Date.now(),
        ackT: null,
        endT: null,
        cause: 'pending',
      };
      seen.push(obs);
      // Ack when the clip GENUINELY would have finished - the real mp3 length,
      // which is exactly what a browser playing it end to end would do.
      const wait = obs.realMs ?? p.totalDurationMs;
      setTimeout(() => {
        obs.ackT = Date.now();
        host.emit(ClientEvents.SOCRATES_AUDIO_ENDED, { beatId: p.beatId });
      }, wait);
    });

    startSequence(room, [
      ...plan.map((x) => ({ line: byHash.get(x.hash)!.line, tag: byHash.get(x.hash)!.tag })),
      { line: 'ΤΕΛΟΣ ΔΟΚΙΜΗΣ', tag: null },
    ]);

    // Wait for every beat to have been ACKED, not merely to have appeared: the
    // last beat's ack is due a full clip-length after it shows, and stopping at
    // "all six seen" reported that beat as a backstop firing when nothing had
    // fired at all - the harness had just looked away.
    const deadline = Date.now() + 180000;
    while ((seen.length < plan.length || seen.some((o) => o.ackT === null)) && Date.now() < deadline) await delay(100);
    await delay(800);

    for (const obs of seen) {
      const ended = logsSince(obs.showT, `Socrates beat ${obs.beatId} ended`);
      obs.cause = ended.length > 0 ? (ended[0].text.includes('audio_ended') ? 'natural ack' : 'other') : 'BACKSTOP';
      obs.endT = ended.length > 0 ? ended[0].t : null;
    }

    say('\n  line            real audio   backstop armed   ack @    advance cause');
    for (const o of seen) {
      say(
        `  ${o.label.padEnd(14)} ${String(o.realMs).padStart(7)}ms   ${String(o.armedMs).padStart(8)}ms   ` +
          `${String(o.ackT !== null ? o.ackT - o.showT : -1).padStart(6)}ms   ${o.cause}`,
      );
    }

    for (const o of seen) {
      const expected = (o.realMs ?? 0) + SOCRATES_BACKSTOP_MARGIN_MS;
      check(
        `A: ${o.label} armed at its own clip + ${SOCRATES_BACKSTOP_MARGIN_MS}ms`,
        Math.abs(o.armedMs - expected) <= 60,
        `armed ${o.armedMs}ms, clip ${o.realMs}ms, expected ~${expected}ms`,
      );
      check(`A: ${o.label} advanced on its natural ack`, o.cause === 'natural ack', o.cause);
    }
    // "Over-cap" by the SERVER'S OWN byte-size estimate, which is the number
    // the old ceiling actually clamped - not by ffprobe. Ζωγραφική#15 runs
    // 10998ms by ffprobe but estimates at 11029ms, so it WAS truncated (by
    // ~29ms) even though its true length sits just under the cap.
    const overCapSeen = seen.filter((o) => o.totalDurationMs > 11000);
    check('A: all four over-cap clips observed', overCapSeen.length === 4, `${overCapSeen.length} seen`);
    for (const o of overCapSeen) {
      const held = (o.ackT ?? 0) - o.showT;
      check(
        `A: ${o.label} is no longer cut off at the old 11000ms cap`,
        o.armedMs > 11000 && held >= (o.realMs ?? 0) - 150,
        `armed ${o.armedMs}ms, held ${held}ms to its natural end (clip ${o.realMs}ms, est ${o.totalDurationMs}ms)`,
      );
      check(
        `A: ${o.label} reports its TRUE length to the TV`,
        Math.abs(o.totalDurationMs - (o.realMs ?? 0)) <= 60,
        `payload ${o.totalDurationMs}ms vs real ${o.realMs}ms`,
      );
    }
    check('A: backstop fired 0 times on healthy audio', seen.every((o) => o.cause === 'natural ack'), `${seen.filter((o) => o.cause === 'BACKSTOP').length} backstop firings`);
    closeRoom(host, sims);
    void code;
  }

  // =========================================================================
  // B - the inverse: audio that never reports back, and audio that isn't there.
  // =========================================================================
  if (!ONLY || ONLY === 'B') {
    say('\n--- B: hung clip (both paths) and missing clip ---');
    const NO_FILE = 'ΑΥΤΗ Η ΓΡΑΜΜΗ ΔΕΝ ΕΧΕΙ ΑΡΧΕΙΟ ΗΧΟΥ';
    const knownLine = byHash.get('b8399492286a98e1')!; // Ανάβασις#22, 13.9s

    // B1 - a KNOWN clip whose ack never arrives.
    {
      const { host, sims, room } = await newRoom(2);
      let firedAt: number | null = null;
      const t0 = Date.now();
      enterSocratesBeat(
        room as never,
        'SOCRATES',
        { kind: 'STAGE_INTRO', line: knownLine.line, lineTemplate: knownLine.line, lineTag: knownLine.tag },
        () => {
          firedAt = Date.now();
        },
      );
      const armed = room.activeTimer?.durationMs ?? -1;
      const expected = (realDurationMs('b8399492286a98e1') ?? 0) + SOCRATES_BACKSTOP_MARGIN_MS;
      while (firedAt === null && Date.now() - t0 < expected + 4000) await delay(50);
      const elapsed = firedAt !== null ? (firedAt as number) - t0 : -1;
      say(`  hung KNOWN clip: armed ${armed}ms, backstop fired at ${elapsed}ms (clip 13949ms + ${SOCRATES_BACKSTOP_MARGIN_MS}ms)`);
      check('B: hung known clip - backstop armed at clip+margin', Math.abs(armed - expected) <= 60, `${armed}ms vs ~${expected}ms`);
      check('B: hung known clip - backstop actually fired', firedAt !== null && Math.abs(elapsed - expected) <= 400, `fired at ${elapsed}ms`);
      closeRoom(host, sims);
    }

    // B2 - an UNKNOWN-duration clip whose ack never arrives.
    {
      const { host, sims, room } = await newRoom(2);
      let firedAt: number | null = null;
      const t0 = Date.now();
      enterSocratesBeat(
        room as never,
        'SOCRATES',
        { kind: 'STAGE_INTRO', line: NO_FILE, lineTemplate: NO_FILE, lineTag: null },
        () => {
          firedAt = Date.now();
        },
      );
      const armed = room.activeTimer?.durationMs ?? -1;
      check(
        'B: unknown-duration clip takes the flat fallback, not floor+margin',
        armed === SOCRATES_BACKSTOP_UNKNOWN_MS,
        `armed ${armed}ms, expected ${SOCRATES_BACKSTOP_UNKNOWN_MS}ms`,
      );
      check('B: resolveSocratesClip reports it as unmeasurable', resolveSocratesClip(NO_FILE, null).known === false);
      while (firedAt === null && Date.now() - t0 < SOCRATES_BACKSTOP_UNKNOWN_MS + 4000) await delay(50);
      const elapsed = firedAt !== null ? (firedAt as number) - t0 : -1;
      say(`  hung UNKNOWN clip: armed ${armed}ms, backstop fired at ${elapsed}ms`);
      check(
        'B: hung unknown clip - backstop fired at the 15000ms fallback',
        firedAt !== null && Math.abs(elapsed - SOCRATES_BACKSTOP_UNKNOWN_MS) <= 400,
        `fired at ${elapsed}ms`,
      );
      closeRoom(host, sims);
    }

    // B3 - Task 154: a MISSING clip makes the client ack at once, and that
    // ~0ms ack must still end the beat immediately.
    // Driven as a two-line sequence so the ack takes the REAL path end to end
    // (endSocratesBeat -> the mode's continuation -> advanceFromSocrates) and
    // drains to a sentinel, instead of routing into a game that was never
    // started - which is a harness problem, not a product one: startQuestion
    // has no questions to read in a room nobody dealt.
    {
      const { host, sims, room } = await newRoom(2);
      let showT: number | null = null;
      const armed: number[] = [];
      host.on(ServerEvents.SOCRATES_SHOW, (p: { beatId: number; lineTemplate: string }) => {
        if (p.lineTemplate !== NO_FILE) return; // the sentinel is never acked
        showT = Date.now();
        armed.push(room.socratesBackstopMs);
        // Exactly what useGameAudio.playSocratesLine does on a 404 (Task 154):
        // onEnded() at once, carrying the CURRENT beat id.
        host.emit(ClientEvents.SOCRATES_AUDIO_ENDED, { beatId: p.beatId });
      });
      startSequence(room, [
        { line: NO_FILE, tag: null },
        { line: 'ΤΕΛΟΣ ΔΟΚΙΜΗΣ', tag: null },
      ]);
      await delay(900);
      const advanced = logsSince(showT ?? 0, 'ended (socrates:audio_ended)');
      const ms = advanced.length > 0 && showT !== null ? advanced[0].t - showT : -1;
      say(`  missing clip: armed ${armed[0]}ms, ack accepted and beat ended at ${ms}ms`);
      check(
        'B: missing clip - ~0ms ack still ends the beat (Task 154 intact)',
        advanced.length === 1 && ms >= 0 && ms < 200,
        `${ms}ms, backstop was ${armed[0]}ms away`,
      );
      room.phase = 'LOBBY'; // the sentinel's own backstop must not route later
      closeRoom(host, sims);
    }
  }

  // =========================================================================
  // C - the VIP skip: same path as a natural ack, idempotent, VIP-only.
  // =========================================================================
  if (!ONLY || ONLY === 'C') {
    say('\n--- C: VIP skip mid-sequence ---');
    const { host, sims, room } = await newRoom(2);
    const vip = sims[0];
    const other = sims[1];
    const shows: Array<{ beatId: number; t: number; template: string }> = [];
    host.on(ServerEvents.SOCRATES_SHOW, (p: { beatId: number; lineTemplate: string }) => {
      shows.push({ beatId: p.beatId, t: Date.now(), template: p.lineTemplate });
    });

    const seq = [UNDER_CAP[0], UNDER_CAP[1], OVER_CAP[3]].map((x) => ({
      line: byHash.get(x.hash)!.line,
      tag: byHash.get(x.hash)!.tag,
    }));
    startSequence(room, [...seq, { line: 'ΤΕΛΟΣ ΔΟΚΙΜΗΣ', tag: null }]);
    await delay(400);

    // Beat 1 ends naturally, so the run contains BOTH kinds of ending.
    const beat1 = shows[0];
    host.emit(ClientEvents.SOCRATES_AUDIO_ENDED, { beatId: beat1.beatId });
    await delay(500);

    // Beat 2: skipped by the VIP, mid-narration.
    const beat2 = shows[1];
    const pressT = Date.now();
    vip.socket.emit(ClientEvents.VIP_SKIP_SOCRATES, { beatId: beat2.beatId });
    await delay(600);
    const beat3 = shows[2];

    say(`  beat ${beat1.beatId}: ended by natural ack`);
    say(`  beat ${beat2.beatId}: VIP pressed at t=${pressT - beat2.t}ms into the beat`);
    say(`  beat ${beat3 ? beat3.beatId : '—'}: started ${beat3 ? beat3.t - pressT : -1}ms after the press`);

    const skipLog = logsSince(pressT, `Socrates beat ${beat2.beatId} ended`);
    const ackLog = logsSince(beat1.t, `Socrates beat ${beat1.beatId} ended`);
    say(`  path proof (skip):    ${skipLog[0]?.text ?? 'NONE'}`);
    say(`  path proof (natural): ${ackLog[0]?.text ?? 'NONE'}`);
    check('C: the skip ends the beat through the shared beat-ending path', skipLog.length === 1 && skipLog[0].text.includes('vip:skip_socrates'), skipLog[0]?.text ?? 'no log');
    check(
      'C: that path is the SAME one a natural ack takes',
      ackLog.length === 1 && ackLog[0].text.replace('socrates:audio_ended', 'X').replace(/beat \d+/, 'beat N') ===
        skipLog[0]?.text.replace('vip:skip_socrates', 'X').replace(/beat \d+/, 'beat N'),
      'identical but for the source name',
    );
    check('C: a skip mid-sequence advances to the NEXT line, not past the narration', beat3 !== undefined && beat3.beatId === beat2.beatId + 1, `next beat ${beat3?.beatId}`);

    // Double press: the same id is now stale.
    const secondT = Date.now();
    vip.socket.emit(ClientEvents.VIP_SKIP_SOCRATES, { beatId: beat2.beatId });
    await delay(400);
    const stale = logsSince(secondT, 'stale beat');
    const advancedAgain = logsSince(secondT, 'ended (vip:skip_socrates)');
    say(`  double press: ${stale[0]?.text ?? 'NO REJECTION LOGGED'}`);
    check('C: second press inside one beat is refused as a stale beat id', stale.length === 1, stale[0]?.text ?? 'none');
    check('C: and it advanced nothing', advancedAgain.length === 0, `${advancedAgain.length} extra advances`);

    // A non-VIP may not skip at all.
    const nonVipT = Date.now();
    other.socket.emit(ClientEvents.VIP_SKIP_SOCRATES, { beatId: shows[shows.length - 1].beatId });
    await delay(400);
    const refused = logsSince(nonVipT, 'is not VIP');
    check('C: a non-VIP press is refused server-side', refused.length === 1, refused[0]?.text ?? 'none');
    closeRoom(host, sims);
  }

  // =========================================================================
  // D - the finale's own announcement, and the pause interaction.
  // =========================================================================
  if (!ONLY || ONLY === 'D') {
    say('\n--- D: skipping through the Η Ανάβασις announcement ---');
    const { host, sims, room } = await newRoom(3);
    const vip = sims[0];
    const shows: Array<{ beatId: number; t: number }> = [];
    let firstClimbQuestionT: number | null = null;
    host.on(ServerEvents.SOCRATES_SHOW, (p: { beatId: number }) => shows.push({ beatId: p.beatId, t: Date.now() }));
    host.on(ServerEvents.CLIMB_QUESTION_SHOW, () => {
      if (firstClimbQuestionT === null) firstClimbQuestionT = Date.now();
    });

    const t0 = Date.now();
    startClimb(room as never);
    // startClimb shows the finale's STAGE_ANNOUNCE CARD first; the three-line
    // announcement only begins when that card's own timer elapses
    // (resumeAfterStageAnnounce). Waiting a flat 500ms here found the room
    // still on the card and reported "0 beats skipped" for a sequence that
    // had not started yet.
    for (let i = 0; i < 200 && room.phase !== 'SOCRATES'; i++) await delay(100);
    check('D: the announcement begins once the finale card has had its moment', room.phase === 'SOCRATES', `phase ${room.phase}`);

    // Skip every line of the three-line announcement, one press per line.
    const skipped: number[] = [];
    for (let i = 0; i < 3; i++) {
      const current = shows[shows.length - 1];
      if (!current || room.phase !== 'SOCRATES') break;
      check(`D: CLIMB_QUESTION has NOT started during announce line ${i + 1}`, firstClimbQuestionT === null, `phase ${room.phase}`);
      const before = shows.length;
      vip.socket.emit(ClientEvents.VIP_SKIP_SOCRATES, { beatId: current.beatId });
      skipped.push(current.beatId);
      // Wait for the NEXT line to appear, or for the climb to start once the
      // last one is done - never a flat sleep that could outrun either.
      for (let w = 0; w < 100 && shows.length === before && firstClimbQuestionT === null; w++) await delay(50);
    }
    for (let w = 0; w < 100 && firstClimbQuestionT === null; w++) await delay(50);
    say(`  announce beats skipped: ${skipped.join(', ')}`);
    say(`  first CLIMB_QUESTION at ${firstClimbQuestionT !== null ? (firstClimbQuestionT as number) - t0 : -1}ms; phase now ${room.phase}`);
    check('D: all three announcement beats were skipped one at a time', skipped.length === 3, `${skipped.length} skipped`);
    check('D: CLIMB_QUESTION arrived only after the sequence finished', firstClimbQuestionT !== null, `phase ${room.phase}`);
    check('D: the climb is running normally afterwards', room.phase === 'CLIMB_QUESTION', room.phase);

    closeRoom(host, sims);

    // pause -> skip, ON A REAL BEAT (the criterion is about pausing DURING a
    // beat, so this gets its own room rather than reusing the climb, which by
    // now is on a CLIMB_QUESTION and would test the wrong timer entirely).
    {
      const r1 = await newRoom(2);
      startSequence(r1.room, [
        { line: byHash.get(OVER_CAP[3].hash)!.line, tag: byHash.get(OVER_CAP[3].hash)!.tag },
        { line: 'ΤΕΛΟΣ ΔΟΚΙΜΗΣ', tag: null },
      ]);
      await delay(400);
      const beforePause = remainingActiveTimerMs(r1.room as never);
      r1.sims[0].socket.emit(ClientEvents.GAME_PAUSE);
      await delay(300);
      const atPause = remainingActiveTimerMs(r1.room as never);
      const pauseSkipT = Date.now();
      r1.sims[0].socket.emit(ClientEvents.VIP_SKIP_SOCRATES, {});
      await delay(400);
      const refusedPaused = logsSince(pauseSkipT, 'game is paused');
      const advancedWhilePaused = logsSince(pauseSkipT, 'ended (vip:skip_socrates)');
      const afterFrozen = remainingActiveTimerMs(r1.room as never);
      r1.sims[0].socket.emit(ClientEvents.GAME_RESUME);
      await delay(300);
      const afterResume = remainingActiveTimerMs(r1.room as never);
      say(`  pause+skip: remaining ${beforePause} -> paused ${atPause} -> still ${afterFrozen} -> resumed ${afterResume}`);
      check('D: pause then skip - the skip is refused while paused', refusedPaused.length >= 1, refusedPaused[0]?.text ?? 'none');
      check('D: pause then skip - and nothing advanced', advancedWhilePaused.length === 0, `${advancedWhilePaused.length} advances`);
      check('D: pause then skip - the timer stayed frozen across the attempt', atPause === afterFrozen, `${atPause} vs ${afterFrozen}`);
      check('D: pause then skip - resume continues from the frozen remainder', afterResume <= atPause && afterResume > atPause - 1500, `${afterResume} of ${atPause}`);
      r1.room.phase = 'LOBBY';
      closeRoom(r1.host, r1.sims);
    }

    // skip -> pause, on a real beat: the skip lands, then the NEXT phase's
    // timer pauses and resumes consistently.
    {
      const r2 = await newRoom(2);
      const shows2: Array<{ beatId: number }> = [];
      r2.host.on(ServerEvents.SOCRATES_SHOW, (p: { beatId: number }) => shows2.push({ beatId: p.beatId }));
      startSequence(r2.room, [
        { line: byHash.get(UNDER_CAP[0].hash)!.line, tag: byHash.get(UNDER_CAP[0].hash)!.tag },
        { line: byHash.get(UNDER_CAP[1].hash)!.line, tag: byHash.get(UNDER_CAP[1].hash)!.tag },
        { line: 'ΤΕΛΟΣ ΔΟΚΙΜΗΣ', tag: null },
      ]);
      await delay(400);
      const skipT = Date.now();
      r2.sims[0].socket.emit(ClientEvents.VIP_SKIP_SOCRATES, { beatId: shows2[0].beatId });
      await delay(500);
      const advanced = logsSince(skipT, 'ended (vip:skip_socrates)');
      const beforeP = remainingActiveTimerMs(r2.room as never);
      r2.sims[0].socket.emit(ClientEvents.GAME_PAUSE);
      await delay(300);
      const paused1 = remainingActiveTimerMs(r2.room as never);
      await delay(500);
      const paused2 = remainingActiveTimerMs(r2.room as never);
      r2.sims[0].socket.emit(ClientEvents.GAME_RESUME);
      await delay(250);
      const resumed = remainingActiveTimerMs(r2.room as never);
      say(`  skip+pause: advanced=${advanced.length}, remaining ${beforeP} -> ${paused1} -> ${paused2} (frozen) -> ${resumed}`);
      check('D: skip then pause - the skip landed first', advanced.length === 1);
      check('D: skip then pause - the new beat freezes, not drifts', paused1 === paused2, `${paused1} vs ${paused2}`);
      check('D: skip then pause - resume continues from the remainder', resumed <= paused2 && resumed > paused2 - 1500, `${resumed} of ${paused2}`);
      closeRoom(r2.host, r2.sims);
    }
  }

  // =========================================================================
  // E - the DOM half of C: the control must not exist on a non-VIP phone.
  // =========================================================================
  let browser: Browser | null = null;
  let clientProc: ChildProcess | null = null;
  if (!ONLY || ONLY === 'E') {
    say('\n--- E: the skip control on a real phone ---');
    // VITE_SERVER_URL is NOT optional here: client/src/config.ts falls back to
    // http://localhost:4001, so without it both phones connect to whatever dev
    // server happens to be running on 4001 instead of this harness's own
    // server - which looks exactly like a broken join, because the room being
    // joined lives in a different process entirely and logs nothing at all.
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
    browser = await chromium.launch();
    // ONE PHONE PER ROOM, with VIP-ness decided by JOIN ORDER. Two phones in
    // one browser does not work here and it is worth saying why, because both
    // failures look like product bugs and are not: separate CONTEXTS are
    // needed for separate playerIds (two pages in one context share
    // localStorage, so the second phone RECONNECTS as the first and never sees
    // a join screen at all), and even with separate contexts the second one's
    // socket never came up - which disables the whole avatar grid
    // (`avatarDisabled = taken || !connected` in ControllerScreen), so
    // ':not([disabled])' happily matched a button React had already disabled.
    // One phone per room sidesteps all of it: a socket sim takes VIP first
    // whenever the phone needs to be a non-VIP.
    async function phoneSkipNodeCount(phoneIsVip: boolean): Promise<number> {
      const { socket: host, code } = await connectHost();
      const room = getRoom(code) as unknown as RoomLike;
      room.gameIntroPlayed = true;
      const sims: Sim[] = [];
      if (!phoneIsVip) sims.push(await joinSim(NAMES[1], AVATARS[1], code));

      const phoneCtx = await browser!.newContext({ viewport: { width: 360, height: 640 } });
      const page = await phoneCtx.newPage();
      await page.addInitScript((id: string) => localStorage.setItem('playerId', id), randomUUID());
      await page.goto(`http://localhost:${CLIENT_PORT}/play`);
      await page.getByTestId('code-input').fill(code);
      await page.getByTestId('custom-name-toggle').click();
      await page.getByTestId('custom-name-input').fill(NAMES[0]);
      await page.getByTestId('custom-name-confirm').click();
      await page.getByTestId('avatar-grid').waitFor({ state: 'visible', timeout: 15000 });
      await page.locator('[data-testid="avatar-option"]:not([disabled])').first().click();
      await page.getByTestId('join-button').click();
      await page.getByTestId('settings-panel').waitFor({ state: 'visible', timeout: 15000 });
      if (phoneIsVip) sims.push(await joinSim(NAMES[1], AVATARS[1], code));
      await delay(500);

      const line = byHash.get(UNDER_CAP[0].hash)!;
      enterSocratesBeat(
        room as never,
        'SOCRATES',
        { kind: 'STAGE_INTRO', line: line.line, lineTemplate: line.line, lineTag: line.tag },
        () => {},
      );
      await delay(1000);
      const count = await page.locator('[data-testid="socrates-skip-button"]').count();
      // Independent confirmation that join order produced the role intended -
      // otherwise a phone that silently failed to become VIP would "prove"
      // the non-VIP case twice.
      const vipBadges = await page.locator('[data-testid="vip-badge"]').count();
      check(
        `E: the phone that joined ${phoneIsVip ? 'FIRST is the VIP' : 'SECOND is not the VIP'}`,
        vipBadges === (phoneIsVip ? 1 : 0),
        `vip-badge count=${vipBadges}`,
      );
      room.phase = 'LOBBY'; // nothing may route once this room is abandoned
      await phoneCtx.close();
      for (const s of sims) s.socket.disconnect();
      host.disconnect();
      return count;
    }

    const vipCount = await phoneSkipNodeCount(true);
    const otherCount = await phoneSkipNodeCount(false);
    say(`  skip control nodes: VIP phone ${vipCount}, non-VIP phone ${otherCount}`);
    check('E: the VIP phone renders the skip control during a beat', vipCount === 1, `count=${vipCount}`);
    check('E: a non-VIP phone renders NO skip control at all', otherCount === 0, `count=${otherCount}`);
  }

  say(`\n${passed} passed, ${failed} failed`);
  if (failures.length > 0) for (const f of failures) say(`  failed: ${f}`);
  if (browser) await browser.close();
  if (clientProc?.pid) {
    try {
      process.kill(-clientProc.pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
}

main().then(
  () => process.exit(failed > 0 ? 1 : 0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
