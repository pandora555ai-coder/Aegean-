// Task 296 - the two MECHANIC beats (Η Λόγχη's strike, Η Μονομαχία's early
// lock) and the 13th line pool's registration.
//
//   A  Η Λόγχη: a real 5-player climb driven to a spear-out, the SPEAR_OUT beat
//      between that reveal and the next question, and the climb CONTINUING
//      afterwards - then a SECOND strike, which must be SILENT (the
//      once-per-game latch, ClimbState.spearBeatPlayed).
//   B  Η Μονομαχία: a forced two-arrival duel, the DUEL_LOCKED line that Task
//      188b left unwritten, DUEL_PICK's own 20s input window unchanged, and the
//      reveal released by the host's ack rather than by the 11s backstop.
//   C  registration, PURE (no server, no port): collectVoiceLineEntries, the
//      content file counted row by row against the code, and the QUIZ_BEST
//      dispatch read out of the real slot engine.
//
//   npx tsx dev/296-spear-duel-check.ts            all three
//   SCENARIO=A npx tsx dev/296-spear-duel-check.ts one (A|B|C, or e.g. AB)
//
// SOCKET-ONLY, no browser: every claim here is about server state and server
// decisions (which beat fired, about whom, what the timer was armed at), none
// of it about pixels - and a socket host sidesteps Task 259's tap-to-start gate
// entirely. The REAL server runs IN-PROCESS on a throwaway port set BEFORE the
// dynamic import (253/293/294's own pattern - ESM hoists every STATIC import
// above the assignment, which is why the server is imported inside main), so
// its own listen never touches 3001 and its `console.log`s land in this
// harness's own stdout, where the tee below can read them back.
//
// The RUNUP is the only shortcut, exactly as dev/climb-ceremony-check.ts takes
// it: startClimb(room) directly instead of playing a whole show first, with
// room.gameIntroPlayed seeded true (Task 237 - otherwise GAME_INTRO_SEQUENCE
// fires at the climb's own card and CLIMB_QUESTION never arrives), and
// room.climb.steps seeded so the deciding round lands where each scenario needs
// it. Every phase from there is the real phase machine over real sockets.
process.env.PORT = process.env.SERVER_PORT ?? '3966';

import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { io as ioClient, type Socket } from 'socket.io-client';
import { CLIMB_TOP, ClientEvents, DUEL_LOCK_FLOOR_MS, DUEL_PICK_TIME_MS, ServerEvents, type DuelWeapon } from '@game/shared';

const SERVER_PORT = Number(process.env.SERVER_PORT ?? 3966);
const SCENARIO = (process.env.SCENARIO ?? '').toUpperCase();
// POLICY=v2 plays the same scenarios under the v2 speech policy. Both beats are
// policy-INDEPENDENT by construction - neither goes through pickSpeechSlot, so
// neither reads room.settings.speechPolicy - and this is what demonstrates it
// rather than asserting it. Unset means the room's default (DEFAULT_ROOM_SETTINGS,
// i.e. v1), which is what the A/B runs above use. Rides CREATE_ROOM for Task
// 294's own reason: vip:update_settings is LOBBY-only and this room never sits
// in a lobby long enough to matter.
const POLICY = (process.env.POLICY ?? '').toLowerCase();
const runs = (scenario: string): boolean => SCENARIO === '' || SCENARIO.includes(scenario);

// Task 241/245 - PRESET_NAMES membership only, or the first join is rejected
// with INVALID_NAME and the run scores nothing.
const NAMES = ['Άρης', 'Νίκη', 'Χαρά', 'Τάκης', 'Γιώργος'];
const AVATARS = ['sphinx', 'medusa', 'centaur', 'minotaur', 'pegasus'];

let checks = 0;
let failures = 0;

function check(label: string, cond: boolean, detail = ''): void {
  checks += 1;
  if (!cond) failures += 1;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

// The server's own logs are this process's logs, so they can be read back
// rather than inferred. Kept as a tee (the real console.log still runs) so a
// failing run is still readable top to bottom.
const logLines: string[] = [];
const realLog = console.log.bind(console);
console.log = (...args: unknown[]): void => {
  logLines.push(args.map((arg) => String(arg)).join(' '));
  realLog(...args);
};
const logsMatching = (pattern: RegExp): string[] => logLines.filter((line) => pattern.test(line));

const sockets: Socket[] = [];
let t0 = Date.now();
const since = (): number => Date.now() - t0;

interface Beat {
  kind: string;
  line: string;
  lineTemplate: string;
  lineTag: string | null;
  beatId: number;
  finale: string | null;
  prefix: { template: string } | null;
  atMs: number;
}

interface Feed {
  phases: { phase: string; atMs: number }[];
  beats: Beat[];
  duelLocked: { socratesLine: string | null; socratesLineTemplate: string | null; socratesLineTag: string | null; atMs: number }[];
  duelRevealAtMs: number | null;
  // The server's OWN statement of the pick window, off duel_pick:show's
  // `durationMs` (buildDuelPickHostPayload: remainingActiveTimerMs at build
  // time, so a hair under the full span, never over it). The race-free way to
  // read it: a live timer read can only catch whichever kind is armed at that
  // instant, and the second pick re-arms it as 'DUEL_LOCKED'.
  duelPickDurationMs: number | null;
}

// The host MUST ack, or every beat rides its own backstop: the two new lines
// have no mp3 yet (October generation pass), so theirs is the flat
// SOCRATES_BACKSTOP_UNKNOWN_MS. A real TV acks these at once too - Task 154
// calls onEnded() the instant the fetch 404s - so an immediate ack here is the
// real client's own behaviour for a clip-less line, not a harness liberty.
// The DUEL_LOCKED beat needs its OWN ack: it plays INSIDE DUEL_PICK, so it
// never emits socrates:show at all (index.ts routes that phase's ack to
// onDuelAudioEnded).
function connectHost(): Promise<{ socket: Socket; code: string; feed: Feed }> {
  const feed: Feed = { phases: [], beats: [], duelLocked: [], duelRevealAtMs: null, duelPickDurationMs: null };
  return new Promise((resolve, reject) => {
    const socket: Socket = ioClient(`http://localhost:${SERVER_PORT}`, { reconnection: false });
    sockets.push(socket);
    socket.on('connect', () => socket.emit(ClientEvents.CREATE_ROOM, POLICY ? { speechPolicy: POLICY } : {}));
    socket.on(ServerEvents.PHASE_CHANGED, (payload: { phase: string }) => {
      feed.phases.push({ phase: payload.phase, atMs: since() });
    });
    socket.on(ServerEvents.SOCRATES_SHOW, (payload: Record<string, unknown>) => {
      feed.beats.push({
        kind: String(payload.kind),
        line: String(payload.line),
        lineTemplate: String(payload.lineTemplate),
        lineTag: (payload.lineTag as string | null) ?? null,
        beatId: Number(payload.beatId),
        finale: (payload.finale as string | null) ?? null,
        prefix: (payload.prefix as { template: string } | null) ?? null,
        atMs: since(),
      });
      socket.emit(ClientEvents.SOCRATES_AUDIO_ENDED, { beatId: payload.beatId });
    });
    socket.on(ServerEvents.DUEL_LOCKED, (payload: Record<string, unknown>) => {
      feed.duelLocked.push({
        socratesLine: (payload.socratesLine as string | null) ?? null,
        socratesLineTemplate: (payload.socratesLineTemplate as string | null) ?? null,
        socratesLineTag: (payload.socratesLineTag as string | null) ?? null,
        atMs: since(),
      });
      socket.emit(ClientEvents.SOCRATES_AUDIO_ENDED, {});
    });
    socket.on(ServerEvents.DUEL_PICK_SHOW, (payload: Record<string, unknown>) => {
      if (feed.duelPickDurationMs === null) feed.duelPickDurationMs = Number(payload.durationMs);
    });
    socket.on(ServerEvents.DUEL_REVEAL_SHOW, () => {
      if (feed.duelRevealAtMs === null) feed.duelRevealAtMs = since();
    });
    socket.once(ServerEvents.ROOM_CREATED, (payload: { code: string }) => resolve({ socket, code: payload.code, feed }));
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
    socket.once(ServerEvents.JOIN_REJECTED, (p: unknown) => reject(new Error(`join rejected: ${JSON.stringify(p)}`)));
    socket.once('connect_error', reject);
  });
}

// Each duelist gets a DIFFERENT weapon: the same one on both sides is a tie,
// and a tie re-opens DUEL_PICK forever (ceremony-check's own note).
function wireDuelPicks(sims: Sim[], weaponFor: Map<string, DuelWeapon>): void {
  for (const sim of sims) {
    sim.socket.on(ServerEvents.DUEL_PICK_SHOW, (payload: { youDuel?: boolean; picked?: boolean }) => {
      if (!payload.youDuel || payload.picked) return;
      // 600ms, not a token delay: the pick is what re-arms the active timer as
      // 'DUEL_LOCKED' (DUEL_LOCK_FLOOR_MS), so picking too eagerly would race
      // the harness's own read of the 20s pick window below.
      setTimeout(() => sim.socket.emit(ClientEvents.DUEL_PICK, { weapon: weaponFor.get(sim.playerId) ?? 'xifos' }), 600);
    });
  }
}

type RoomLike = {
  phase: string;
  code: string;
  gameIntroPlayed: boolean;
  socratesBackstopMs: number;
  climb: {
    questions: Array<{ correctIndex: number }>;
    questionIndex: number;
    steps: Map<string, number>;
    roundsPlayed: number;
    spearCounters: Map<string, number>;
    spearBeatPlayed: boolean;
    eliminationOrder: string[];
    winnerPlayerId: string | null;
    duel: { cause: string } | null;
  } | null;
};

async function waitForPhase(room: RoomLike, phase: string, timeoutMs = 60000): Promise<void> {
  const started = Date.now();
  while (room.phase !== phase) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${phase} (still ${room.phase})`);
    await delay(50);
  }
}

// One climb round in a controlled answer ORDER, so answerRank - and with it the
// +2 fastest bonus - is deterministic.
async function playRound(room: RoomLike, plan: Array<{ sim: Sim; answer: 'correct' | 'wrong' | 'none' }>): Promise<void> {
  await waitForPhase(room, 'CLIMB_QUESTION');
  const climb = room.climb!;
  const correctIndex = climb.questions[climb.questionIndex].correctIndex;
  for (const { sim, answer } of plan) {
    if (answer === 'none') continue;
    sim.socket.emit(ClientEvents.CLIMB_SUBMIT, { choice: answer === 'correct' ? correctIndex : (correctIndex + 1) % 4 });
    await delay(150);
  }
}

// The phases between two moments, as a plain arrow list - the whole point of
// scenario A being that CLIMB_REVEAL -> SOCRATES -> CLIMB_QUESTION is what a
// strike inserts, and that the climb comes out the other side.
const phaseTrail = (feed: Feed, fromMs: number, toMs: number): string =>
  feed.phases
    .filter((p) => p.atMs >= fromMs && p.atMs <= toMs)
    .map((p) => `${p.phase}@${p.atMs}ms`)
    .join(' -> ');

async function main(): Promise<void> {
  console.log(`speech policy for this run: ${POLICY || 'room default (v1)'}`);
  await import('../server/src/index.js');
  const { getRoom } = await import('../server/src/state.js');
  const { startClimb } = await import('../server/src/phases.js');
  const { remainingActiveTimerMs } = await import('../server/src/timers.js');
  const { CLIMB_SPEAR_LIMIT, CLIMB_SPEAR_MIN_PLAYERS } = await import('../server/src/climb.js');
  const { DUEL_LINES, SPEECH_V2_LINES, collectVoiceLineEntries, LINE_TAGS, createSocratesState } = await import(
    '../server/src/socrates.js'
  );
  const { pickSpeechSlot } = await import('../server/src/speechSlots.js');
  const { recordLedgerQuizRound, resetStageLedger } = await import('../server/src/stageLedger.js');
  const { getVocative } = await import('@game/shared');

  // -------------------------------------------------------------------------
  // A. Η Λόγχη strikes, Socrates speaks, the climb carries on - then a second
  //    strike says nothing.
  // -------------------------------------------------------------------------
  if (runs('A')) {
    console.log(`\n=== A. spear-out beat, 5 players (spear active from ${CLIMB_SPEAR_MIN_PLAYERS}) ===`);
    t0 = Date.now();
    const { code, feed } = await connectHost();
    const sims: Sim[] = [];
    for (let i = 0; i < 5; i++) sims.push(await joinSim(NAMES[i], AVATARS[i], code));
    await delay(300);
    const room = getRoom(code) as unknown as RoomLike;
    room.gameIntroPlayed = true; // Task 237
    startClimb(room as never);
    await waitForPhase(room, 'CLIMB_QUESTION');
    const climb = room.climb!;
    const victim = sims[4];
    // Everyone but the victim parked well clear of step 0 (so they never
    // accumulate a spear counter) and well clear of CLIMB_TOP (so nobody wins
    // out from under the scenario). Re-seeded every round for the same reason.
    const park = (except: Sim): void => {
      for (const sim of sims) climb.steps.set(sim.playerId, sim === except ? 0 : 2);
    };

    park(victim);
    await playRound(room, [
      { sim: sims[0], answer: 'correct' },
      { sim: sims[1], answer: 'correct' },
      { sim: sims[2], answer: 'correct' },
      { sim: sims[3], answer: 'correct' },
      { sim: victim, answer: 'wrong' },
    ]);
    await waitForPhase(room, 'CLIMB_QUESTION');
    const counterAfterFirst = climb.spearCounters.get(victim.playerId) ?? 0;
    console.log(`  after round 1: ${victim.name}'s spear counter ${counterAfterFirst}/${CLIMB_SPEAR_LIMIT}`);
    check(`A1: one bad round at step 0 counts once, not out`, counterAfterFirst === 1 && climb.eliminationOrder.length === 0, `counter=${counterAfterFirst}, eliminated=${climb.eliminationOrder.length}`);

    // Round 2: the counter hits the limit, so this reveal spears the victim out.
    park(victim);
    const revealBeforeMs = since();
    await playRound(room, [
      { sim: sims[0], answer: 'correct' },
      { sim: sims[1], answer: 'correct' },
      { sim: sims[2], answer: 'correct' },
      { sim: sims[3], answer: 'correct' },
      { sim: victim, answer: 'wrong' },
    ]);
    await waitForPhase(room, 'CLIMB_QUESTION'); // round 3 - i.e. the climb CONTINUED
    const afterStrikeMs = since();
    const roundsAfter = climb.roundsPlayed;
    const spearBeats = feed.beats.filter((beat) => beat.kind === 'SPEAR_OUT');
    const beat = spearBeats[0];
    const struckName = sims.find((sim) => sim.playerId === climb.eliminationOrder[0])?.name ?? '??';
    const trail = phaseTrail(feed, revealBeforeMs, afterStrikeMs);
    console.log(`  eliminationOrder: [${struckName}], rounds played now ${roundsAfter}`);
    console.log(`  phase trail across the strike: ${trail}`);
    if (beat) {
      console.log(`  beat: kind=${beat.kind} beatId=${beat.beatId} finale=${beat.finale} tag=${beat.lineTag} at ${beat.atMs}ms`);
      console.log(`  line: "${beat.line}"`);
    }
    check('A2: the victim is speared out', climb.eliminationOrder.length === 1 && struckName === victim.name, `out=[${struckName}] counter=${climb.spearCounters.get(victim.playerId)}`);
    check('A3: exactly ONE SPEAR_OUT beat fired', spearBeats.length === 1, `${spearBeats.length} beat(s)`);
    check('A4: its template is one of the three SPEAR_OUT lines', !!beat && SPEECH_V2_LINES.SPEAR_OUT.includes(beat.lineTemplate), beat ? `tag=${beat.lineTag}` : 'no beat');
    check('A5: the subtitle addresses the speared player by name', !!beat && beat.line.startsWith(`${getVocative(victim.name)}.`), beat ? beat.line.slice(0, 24) : 'no beat');
    check('A6: the hashed template is NOT the name-substituted text', !!beat && beat.lineTemplate !== beat.line && !beat.lineTemplate.includes(getVocative(victim.name)));
    check('A7: no vocative clip on disk, so nothing is spliced', !!beat && beat.prefix === null, beat ? `prefix=${JSON.stringify(beat.prefix)}` : 'no beat');
    check("A8: the beat knows it is inside the finale (TV keeps the Anavasis world)", beat?.finale === 'climb', `finale=${beat?.finale}`);
    check('A9: the beat sits BETWEEN the reveal and the next question', /CLIMB_REVEAL@\d+ms -> SOCRATES@\d+ms -> CLIMB_QUESTION@\d+ms/.test(trail), trail);
    check('A10: the climb continued after the beat', roundsAfter === 2 && room.phase === 'CLIMB_QUESTION', `roundsPlayed=${roundsAfter}, phase=${room.phase}`);
    check('A11: the strike is stated in the server log', logsMatching(new RegExp(`Η Λόγχη struck ${victim.name} out`)).length === 1, logsMatching(/Η Λόγχη struck/)[0] ?? 'absent');
    check('A12: the beat was armed and ended on the ack, not the backstop', logsMatching(/Socrates \(SPEAR_OUT\) beat \d+ backstop=/).length === 1 && logsMatching(/Socrates beat \d+ ended \(socrates:audio_ended\) - advancing/).length >= 1, logsMatching(/Socrates \(SPEAR_OUT\)/)[0]?.replace(/^.*backstop=/, 'backstop=').slice(0, 40) ?? 'absent');

    // The LATCH: a second player struck out later in the SAME game must not
    // produce a second beat.
    const second = sims[3];
    for (const roundIndex of [0, 1]) {
      park(second);
      climb.steps.set(victim.playerId, 0); // eliminated; ignored either way
      await playRound(room, [
        { sim: sims[0], answer: 'correct' },
        { sim: sims[1], answer: 'correct' },
        { sim: sims[2], answer: 'correct' },
        { sim: second, answer: 'wrong' },
      ]);
      await waitForPhase(room, roundIndex === 0 ? 'CLIMB_QUESTION' : 'CLIMB_QUESTION');
    }
    const spearBeatsAfter = feed.beats.filter((b) => b.kind === 'SPEAR_OUT');
    const elimNames = climb.eliminationOrder.map((id) => sims.find((s) => s.playerId === id)?.name ?? '??');
    console.log(`  after the second strike: eliminationOrder [${elimNames.join(', ')}], rounds ${climb.roundsPlayed}`);
    check('A13: a SECOND spear-out is silent (once-per-game latch)', climb.eliminationOrder.length === 2 && spearBeatsAfter.length === 1, `eliminated=${elimNames.join(',')} beats=${spearBeatsAfter.length}`);
    check('A14: the latch is set on the climb state', climb.spearBeatPlayed === true);
    check('A15: the climb still continued after the silent strike', room.phase === 'CLIMB_QUESTION' && climb.roundsPlayed === 4, `phase=${room.phase} rounds=${climb.roundsPlayed}`);
    for (const sim of sims) sim.socket.disconnect();
    await delay(300);
  }

  // -------------------------------------------------------------------------
  // B. Η Μονομαχία's early-lock line, and the pick window it must not touch.
  // -------------------------------------------------------------------------
  if (runs('B')) {
    console.log('\n=== B. DUEL_LOCKED line, 4 players, two arrivals in one reveal ===');
    t0 = Date.now();
    const { code, feed } = await connectHost();
    const sims: Sim[] = [];
    for (let i = 0; i < 4; i++) sims.push(await joinSim(NAMES[i], AVATARS[i], code));
    await delay(300);
    const room = getRoom(code) as unknown as RoomLike;
    room.gameIntroPlayed = true;
    startClimb(room as never);
    await waitForPhase(room, 'CLIMB_QUESTION');
    const climb = room.climb!;
    wireDuelPicks(sims, new Map([
      [sims[0].playerId, 'xifos' as DuelWeapon],
      [sims[1].playerId, 'aspida' as DuelWeapon],
    ]));
    // Both one step from the top: the fastest gets +2, the other +1, so both
    // cross CLIMB_TOP in the same reveal - the duel's own trigger.
    climb.steps.set(sims[0].playerId, CLIMB_TOP - 1);
    climb.steps.set(sims[1].playerId, CLIMB_TOP - 1);
    climb.steps.set(sims[2].playerId, 2);
    climb.steps.set(sims[3].playerId, 2);
    await playRound(room, [
      { sim: sims[0], answer: 'correct' },
      { sim: sims[1], answer: 'correct' },
      { sim: sims[2], answer: 'wrong' },
      { sim: sims[3], answer: 'wrong' },
    ]);
    await waitForPhase(room, 'DUEL_PICK');
    const pickWindowMs = remainingActiveTimerMs(room as never);
    const pickStartMs = since();
    console.log(`  DUEL_PICK opened (cause=${climb.duel?.cause}); timer says ${pickWindowMs}ms left of DUEL_PICK_TIME_MS=${DUEL_PICK_TIME_MS}`);
    await waitForPhase(room, 'DUEL_REVEAL');
    const lock = feed.duelLocked[0];
    const lockToReveal = feed.duelRevealAtMs !== null && lock ? feed.duelRevealAtMs - lock.atMs : -1;
    const socratesPhasesInDuel = feed.phases.filter((p) => p.atMs >= pickStartMs && p.phase === 'SOCRATES').length;
    if (lock) {
      console.log(`  duel:locked at ${lock.atMs}ms tag=${lock.socratesLineTag} — "${lock.socratesLine}"`);
      console.log(`  lock -> DUEL_REVEAL: ${lockToReveal}ms (floor ${DUEL_LOCK_FLOOR_MS}ms, old silent-pool behaviour was the floor alone)`);
    }
    check('B1: a DUEL_LOCKED line fired (pool was empty before this task)', !!lock?.socratesLine, lock ? `template ok=${DUEL_LINES.DUEL_LOCKED.includes(lock.socratesLineTemplate ?? '')}` : 'no duel:locked');
    check('B2: it comes from DUEL_LINES.DUEL_LOCKED, with its tag', !!lock && DUEL_LINES.DUEL_LOCKED.includes(lock.socratesLineTemplate ?? '') && !!lock.socratesLineTag, `tag=${lock?.socratesLineTag}`);
    check("B3: the server says it is waiting on Socrates too", logsMatching(/duel locked — reveal in >= \d+ms \(waiting on Socrates too\)/).length === 1, logsMatching(/duel locked/)[0] ?? 'absent');
    check(
      `B4: DUEL_PICK's input window is still ${DUEL_PICK_TIME_MS}ms`,
      DUEL_PICK_TIME_MS === 20000 &&
        (feed.duelPickDurationMs ?? 0) > 19000 &&
        (feed.duelPickDurationMs ?? 0) <= DUEL_PICK_TIME_MS &&
        pickWindowMs > 19000 &&
        pickWindowMs <= DUEL_PICK_TIME_MS,
      `duel_pick:show said durationMs=${feed.duelPickDurationMs}, live timer had ${pickWindowMs}ms left, constant=${DUEL_PICK_TIME_MS}`,
    );
    check('B5: the beat plays INSIDE DUEL_PICK - no SOCRATES phase at all', socratesPhasesInDuel === 0, `${socratesPhasesInDuel} SOCRATES phase(s)`);
    check('B6: the reveal waited for the floor but not for a backstop', lockToReveal >= DUEL_LOCK_FLOOR_MS - 50 && lockToReveal < 6000, `${lockToReveal}ms`);
    check('B7: no spear beat fired in a round that struck nobody', feed.beats.filter((b) => b.kind === 'SPEAR_OUT').length === 0);
    for (const sim of sims) sim.socket.disconnect();
    await delay(300);
  }

  // -------------------------------------------------------------------------
  // C. Registration: the numbers, the content file row by row, the dispatch.
  // -------------------------------------------------------------------------
  if (runs('C')) {
    console.log('\n=== C. registration (pure) ===');
    const entries = collectVoiceLineEntries();
    const pools = Object.keys(SPEECH_V2_LINES);
    const v2Lines = Object.values(SPEECH_V2_LINES).flat();
    console.log(`  collectVoiceLineEntries: ${entries.length} entries, ${new Set(entries.map((e) => e.hash)).size} unique hashes`);
    check('C1: every registered line has its own hash', new Set(entries.map((e) => e.hash)).size === entries.length, `${entries.length} entries`);
    check('C2: 13 v2 pools, 39 lines', pools.length === 13 && v2Lines.length === 39, `${pools.length} pools / ${v2Lines.length} lines`);
    check('C3: every v2 line carries a LINE_TAGS entry (the clip is lineHash(template, tag))', v2Lines.every((line) => !!LINE_TAGS[line]), `${v2Lines.filter((l) => !!LINE_TAGS[l]).length}/${v2Lines.length} tagged`);
    check('C4: QUIZ_BEST is registered as a slot pool', SPEECH_V2_LINES.QUIZ_BEST.length === 3 && entries.filter((e) => e.moment === 'SLOT (QUIZ_BEST)').length === 3);
    check('C5: v1 and v2 share ONE DUEL_LOCKED array (so no line can repeat across policies)', DUEL_LINES.DUEL_LOCKED === SPEECH_V2_LINES.DUEL_LOCKED && DUEL_LINES.DUEL_LOCKED.length === 3);
    check('C6: DUEL_LOCKED is listed once, under v1s own moment', entries.filter((e) => e.moment === 'DUEL_LOCKED').length === 3 && entries.filter((e) => e.moment === 'SLOT (DUEL_LOCKED)').length === 0);

    // The content file, counted row by row against the code (the "when a task
    // copies content into code, count the rows" rule).
    const path = new URL('../content/speech-policy-lines.md', import.meta.url).pathname;
    const raw = readFileSync(path);
    const text = raw.toString('utf8');
    const headers = text.split('\n').filter((line) => /^[A-Z_]+:$/.test(line)).map((line) => line.slice(0, -1));
    const spoken = text.split('\n').filter((line) => /^\[[a-z]+\] /.test(line));
    const filePairs = spoken.map((line) => {
      const close = line.indexOf(']');
      return { tag: line.slice(0, close + 1), body: line.slice(close + 2).trim() };
    });
    const sha = createHash('sha256').update(raw).digest('hex');
    console.log(`  content/speech-policy-lines.md: ${headers.length} pool headers, ${spoken.length} spoken lines`);
    console.log(`  sha256 ${sha}`);
    check('C7: the file has 13 pool headers and 39 spoken lines', headers.length === 13 && spoken.length === 39, `${headers.length}/${spoken.length}`);
    check('C8: the file names the same 13 pools as the code, in the same order', headers.join(',') === pools.join(','), headers.join(','));
    const mismatched = v2Lines.filter((line) => {
      const row = filePairs.find((pair) => pair.body === line);
      return !row || row.tag !== LINE_TAGS[line];
    });
    check('C9: every code line is verbatim in the file with the same tag', mismatched.length === 0, mismatched.length ? mismatched[0].slice(0, 40) : 'all 39 match');

    // The dispatch, read out of the REAL engine rather than out of the source:
    // dev/294-slot-probe.ts's own fake Room (the engine reads only room.code
    // and room.socrates.ledger).
    const makeRoom = () => ({ code: '0001', socrates: createSocratesState(), settings: { speechPolicy: 'v2' } }) as never;
    const stageRound = (room: never, outcomes: { id: string; name: string; points: number }[]): void => {
      recordLedgerQuizRound(
        (room as unknown as { socrates: { ledger: never } }).socrates.ledger,
        outcomes.map((o) => ({ playerId: o.id, name: o.name, answered: true, correct: o.points > 0, answerRank: o.points > 0 ? 1 : null, scoreBefore: 0, scoreAfter: o.points })),
        4,
      );
    };
    {
      const room = makeRoom();
      resetStageLedger((room as unknown as { socrates: { ledger: never } }).socrates.ledger, 1, 'Γύρος 1 — Η Αγορά', 'quiz');
      stageRound(room, [
        { id: 'a', name: 'ΑΛΦΑ', points: 1000 },
        { id: 'b', name: 'ΒΗΤΑ', points: 400 },
        { id: 'c', name: 'ΓΑΜΑ', points: 0 },
      ]);
      const mid = pickSpeechSlot(room, 'QUIZ_MID');
      const close = pickSpeechSlot(room, 'QUIZ_CLOSE');
      console.log(`  QUIZ_MID -> ${mid?.targetName}/${mid?.pool}; QUIZ_CLOSE -> ${close?.targetName}/${close?.pool}`);
      check('C10: QUIZ_MID still speaks to the worst out of AGORA_WORST', mid?.pool === 'AGORA_WORST' && mid?.targetName === 'ΓΑΜΑ', `${mid?.targetName}/${mid?.pool}`);
      check('C11: QUIZ_CLOSE now speaks to the best out of QUIZ_BEST (was RUNAWAY_LEAD (reservoir))', close?.pool === 'QUIZ_BEST' && close?.targetName === 'ΑΛΦΑ', `${close?.targetName}/${close?.pool}`);
    }
    {
      // The gap QUIZ_BEST closes: with the WORST end tied, Task 294's
      // `best: null` left the mid slot with nothing to say at all.
      const room = makeRoom();
      resetStageLedger((room as unknown as { socrates: { ledger: never } }).socrates.ledger, 1, 'Γύρος 1 — Η Αγορά', 'quiz');
      stageRound(room, [
        { id: 'a', name: 'ΑΛΦΑ', points: 1000 },
        { id: 'b', name: 'ΒΗΤΑ', points: 0 },
        { id: 'c', name: 'ΓΑΜΑ', points: 0 },
      ]);
      const mid = pickSpeechSlot(room, 'QUIZ_MID');
      console.log(`  worst-end TIE: QUIZ_MID -> ${mid?.targetName}/${mid?.pool}`);
      check('C12: a tied worst end now falls through to QUIZ_BEST instead of silence', mid?.pool === 'QUIZ_BEST' && mid?.targetName === 'ΑΛΦΑ', `${mid?.targetName}/${mid?.pool}`);
    }
  }

  for (const socket of sockets) socket.disconnect();
  console.log(`\n${checks - failures}/${checks} checks passed`);
  await delay(200);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  for (const socket of sockets) socket.disconnect();
  process.exit(1);
});
