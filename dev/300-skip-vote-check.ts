// Task 300 - the skip vote for Socrates' multi-line NARRATIONS.
//
//   A  the whole mechanic on a real GAME_INTRO_SEQUENCE: a below-threshold vote
//      that does nothing, a second vote that PASSES mid-line, the clip stopped
//      mid-play, its ack SUPPRESSED (never synthesised), the one interruption
//      beat, the discarded queue, and the flow resuming where the narration's
//      own end would have led. Plus two guards that only exist once a vote has
//      passed: a THIRD vote inside the same sequence (impossible - the
//      once-per-sequence latch) and the Task 238 VIP Παράλειψη refused on the
//      interruption beat.
//   B  a DISCONNECT passing the vote with nobody voting again: 2 of 4 is short
//      of 3, and becomes 2 of 3 - a majority - the instant a non-voter leaves.
//   C  the pause guard: votes cast while paused are ignored, and the same two
//      votes pass once resumed (which is what proves the pause was the reason).
//   D  reconnect mid-vote: a voter blips and comes back to the right button and
//      the right counter, because the tally is keyed by playerId.
//   F  the OTHER skippable narration: Η Ανάβασις' own three-line announcement,
//      which enters as STAGE_INTRO rather than GAME_INTRO. A vote there must
//      stop it and leave the CLIMB running - the routing that resumes is a
//      different switch arm from A's, which is exactly why it is checked.
//   E  registration, PURE: collectVoiceLineEntries, and the content file
//      counted row by row against the code.
//
//   npx tsx dev/300-skip-vote-check.ts             all five
//   SCENARIO=A npx tsx dev/300-skip-vote-check.ts  one (A|B|C|D|E, or e.g. AB)
//
// SOCKET-ONLY, no browser: every claim is about server state and server
// decisions - which beat was stopped, which ack never arrived, what the tally
// was - none of it about pixels, and a socket host sidesteps Task 259's
// tap-to-start gate entirely. The REAL server runs IN-PROCESS on a throwaway
// port set BEFORE the dynamic import (253/294/296's pattern - ESM hoists every
// STATIC import above the assignment, which is why the server is imported
// inside main), so its own listen never touches 3001 and its console.logs land
// in this harness's stdout where the tee below can read them back.
//
// NO RUNUP SHORTCUT, unlike the climb harnesses: the thing under test is the
// OPENING narration, which a `mode=full` room reaches ~1s after
// vip:start_game. Real sims rather than bots, because a bot never votes and
// the threshold is a fraction of the CONNECTED roster - a room of bots could
// never pass one.
process.env.PORT = process.env.SERVER_PORT ?? '3986';

import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { io as ioClient, type Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents, SOCRATES_BACKSTOP_MARGIN_MS } from '@game/shared';

const SERVER_PORT = Number(process.env.SERVER_PORT ?? 3986);
const SCENARIO = (process.env.SCENARIO ?? '').toUpperCase();
const runs = (scenario: string): boolean => SCENARIO === '' || SCENARIO.includes(scenario);

// Task 241/245 - PRESET_NAMES membership only, or the first join is rejected
// with INVALID_NAME and the run scores nothing.
const NAMES = ['Άρης', 'Νίκη', 'Χαρά', 'Τάκης'];
const AVATARS = ['sphinx', 'medusa', 'centaur', 'minotaur'];

let checks = 0;
let failures = 0;

function check(label: string, cond: boolean, detail = ''): void {
  checks += 1;
  if (!cond) failures += 1;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

// The server's own logs are this process's logs, so a refusal can be READ
// rather than inferred from the absence of an effect. Kept as a tee so a
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

async function until(pred: () => boolean, label: string, timeoutMs = 30000): Promise<void> {
  const started = Date.now();
  while (!pred()) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await delay(50);
  }
}

interface Beat {
  beatId: number;
  kind: string;
  line: string;
  atMs: number;
}
interface Progress {
  votes: number;
  needed: number;
  connected: number;
  open: boolean;
  youVoted?: boolean;
  atMs: number;
}

interface HostFeed {
  beats: Beat[];
  acks: { beatId: number; atMs: number }[];
  stops: { beatId: number; atMs: number }[];
  phases: { phase: string; atMs: number }[];
  progress: Progress[];
}

// The host models a REAL TV, which is what makes the suppression claim
// meaningful rather than a harness convenience:
//   * it acks each beat after the line's own ESTIMATED CLIP length, not
//     instantly - totalDurationMs is the clip plus SOCRATES_BACKSTOP_MARGIN_MS
//     (enterSocratesBeat), so subtracting the margin back out is what a real
//     browser's playback would take. Instant acks would end every beat in ~1ms
//     and there would be no narration left to vote against.
//   * on socrates:stop it CANCELS that beat's pending ack instead of sending
//     one. That is exactly what useGameAudio.stopSocratesLine does by nulling
//     the source's onended before stop() - the ack is suppressed, never
//     synthesised, and nothing is emitted back.
function connectHost(create: Record<string, unknown>): Promise<{ socket: Socket; code: string; feed: HostFeed }> {
  const feed: HostFeed = { beats: [], acks: [], stops: [], phases: [], progress: [] };
  const suppressed = new Set<number>();
  return new Promise((resolve, reject) => {
    const socket: Socket = ioClient(`http://localhost:${SERVER_PORT}`, { reconnection: false });
    sockets.push(socket);
    socket.on('connect', () => socket.emit(ClientEvents.CREATE_ROOM, create));
    socket.on(ServerEvents.PHASE_CHANGED, (p: { phase: string }) => feed.phases.push({ phase: p.phase, atMs: since() }));
    socket.on(ServerEvents.SKIP_VOTE_PROGRESS, (p: Record<string, unknown>) =>
      feed.progress.push({
        votes: Number(p.votes),
        needed: Number(p.needed),
        connected: Number(p.connected),
        open: Boolean(p.open),
        atMs: since(),
      }),
    );
    socket.on(ServerEvents.SOCRATES_STOP, (p: { beatId: number }) => {
      suppressed.add(p.beatId);
      feed.stops.push({ beatId: p.beatId, atMs: since() });
    });
    socket.on(ServerEvents.SOCRATES_SHOW, (p: Record<string, unknown>) => {
      const beatId = Number(p.beatId);
      feed.beats.push({ beatId, kind: String(p.kind), line: String(p.line), atMs: since() });
      const clipMs = Math.max(400, Number(p.totalDurationMs) - SOCRATES_BACKSTOP_MARGIN_MS);
      setTimeout(() => {
        if (suppressed.has(beatId)) return; // stopped mid-play: no ack, ever
        feed.acks.push({ beatId, atMs: since() });
        socket.emit(ClientEvents.SOCRATES_AUDIO_ENDED, { beatId });
      }, clipMs);
    });
    socket.once(ServerEvents.ROOM_CREATED, (p: { code: string }) => resolve({ socket, code: p.code, feed }));
    socket.once('connect_error', reject);
    setTimeout(() => reject(new Error('host never got room:created')), 20000);
  });
}

interface Sim {
  name: string;
  playerId: string;
  socket: Socket;
  progress: Progress[];
}

function joinSim(name: string, avatarId: string, code: string, playerId = randomUUID()): Promise<Sim> {
  const progress: Progress[] = [];
  return new Promise((resolve, reject) => {
    const socket: Socket = ioClient(`http://localhost:${SERVER_PORT}`, { reconnection: false });
    sockets.push(socket);
    socket.on('connect', () => socket.emit(ClientEvents.PLAYER_JOIN, { code, name, playerId, avatarId }));
    socket.on(ServerEvents.SKIP_VOTE_PROGRESS, (p: Record<string, unknown>) =>
      progress.push({
        votes: Number(p.votes),
        needed: Number(p.needed),
        connected: Number(p.connected),
        open: Boolean(p.open),
        youVoted: p.youVoted as boolean | undefined,
        atMs: since(),
      }),
    );
    socket.once(ServerEvents.PLAYER_JOINED, () => resolve({ name, playerId, socket, progress }));
    socket.once(ServerEvents.JOIN_REJECTED, (p: unknown) => reject(new Error(`join rejected: ${JSON.stringify(p)}`)));
    socket.once('connect_error', reject);
  });
}

// Every scenario opens the same way: a full-mode room, N sims, the VIP starts
// it, and the opening narration begins. `waitBeats` is how far INTO the
// narration to get before the scenario does its own thing.
async function openNarration(simCount: number, waitBeats: number) {
  t0 = Date.now();
  const { code, feed } = await connectHost({ mode: 'full' });
  const sims: Sim[] = [];
  for (let i = 0; i < simCount; i++) sims.push(await joinSim(NAMES[i], AVATARS[i], code));
  sims[0].socket.emit(ClientEvents.VIP_START_GAME, {});
  await until(() => feed.beats.length >= waitBeats, `GAME_INTRO beat ${waitBeats}`);
  return { code, feed, sims };
}

async function main(): Promise<void> {
  await import('../server/src/index.js'); // the REAL server, in-process
  const { GAME_INTRO_SEQUENCE, ANAVASIS_INTRO_SEQUENCE, SKIP_INTERRUPTED_LINES, SPEECH_V2_LINES, LINE_TAGS, collectVoiceLineEntries } =
    await import('../server/src/socrates.js');
  const { getRoom } = await import('../server/src/state.js');
  const { startClimb } = await import('../server/src/phases.js');
  await delay(800);

  // -------------------------------------------------------------------------
  // A. A vote passes mid-narration.
  // -------------------------------------------------------------------------
  if (runs('A')) {
    console.log('\n=== A. skip vote passes mid-GAME_INTRO (3 players, threshold 2) ===');
    const { feed, sims } = await openNarration(3, 3);
    const beatsBefore = feed.beats.length;
    const openProgress = feed.progress[0];
    check('vote opened with the narration', openProgress?.open === true, `needed=${openProgress?.needed} connected=${openProgress?.connected}`);
    check('threshold is more than half of 3', openProgress?.needed === 2);

    // --- one vote: below threshold, nothing happens -------------------------
    sims[0].socket.emit(ClientEvents.SKIP_VOTE, { beatId: feed.beats[feed.beats.length - 1].beatId });
    await delay(400);
    const afterOne = feed.progress[feed.progress.length - 1];
    check('one vote counted', afterOne.votes === 1 && afterOne.open, `${afterOne.votes}/${afterOne.needed}`);
    check('below threshold: no clip stopped', feed.stops.length === 0);
    check('below threshold: narration still playing', feed.beats.length >= beatsBefore);

    // --- the second vote passes ---------------------------------------------
    const beatAtVote = feed.beats[feed.beats.length - 1];
    const voteAtMs = since();
    sims[1].socket.emit(ClientEvents.SKIP_VOTE, { beatId: beatAtVote.beatId });
    await until(() => feed.stops.length > 0, 'socrates:stop');
    const stop = feed.stops[0];
    check('socrates:stop names the beat that was on screen', stop.beatId === beatAtVote.beatId, `stop=${stop.beatId} onScreen=${beatAtVote.beatId}`);
    check('stop arrived promptly after the vote', stop.atMs - voteAtMs < 500, `${stop.atMs - voteAtMs}ms`);

    // --- the interruption beat ----------------------------------------------
    await until(() => feed.beats.length > beatsBefore && feed.beats[feed.beats.length - 1].beatId !== beatAtVote.beatId, 'interruption beat');
    const interruption = feed.beats[feed.beats.length - 1];
    check('ONE interruption beat, from SKIP_INTERRUPTED', SKIP_INTERRUPTED_LINES.includes(interruption.line), `"${interruption.line.slice(0, 48)}"`);
    check('it carries the ORIGINAL kind (no new routing)', interruption.kind === 'GAME_INTRO', `kind=${interruption.kind}`);
    check('the stopped beat was never acked', !feed.acks.some((a) => a.beatId === stop.beatId), `acked ids: ${feed.acks.map((a) => a.beatId).join(',')}`);
    const passedProgress = feed.progress[feed.progress.length - 1];
    check('vote closed to further votes on pass', passedProgress.open === false, `votes=${passedProgress.votes} open=${passedProgress.open}`);

    // --- a THIRD vote inside the same sequence is impossible ----------------
    sims[2].socket.emit(ClientEvents.SKIP_VOTE, { beatId: interruption.beatId });
    await delay(300);
    check('second vote ROUND refused (once-per-sequence latch)', logsMatching(/rejected player:skip_vote.*no open skip vote/).length >= 1);
    check('no second stop', feed.stops.length === 1);

    // --- the VIP's own Παράλειψη is refused on this beat --------------------
    sims[0].socket.emit(ClientEvents.VIP_SKIP_SOCRATES, { beatId: interruption.beatId });
    await delay(300);
    check('238 VIP skip refused on the interruption beat', logsMatching(/rejected vip:skip_socrates.*unskippable/).length >= 1);
    check('interruption beat still on screen after the refused skip', feed.beats[feed.beats.length - 1].beatId === interruption.beatId);

    // --- it ends on its OWN ack, and the flow resumes -----------------------
    await until(() => feed.acks.some((a) => a.beatId === interruption.beatId), 'interruption beat ack');
    const interruptionAck = feed.acks.find((a) => a.beatId === interruption.beatId)!;
    await until(() => feed.phases.some((p) => p.atMs > interruptionAck.atMs && p.phase !== 'SOCRATES'), 'flow resuming past SOCRATES');
    const resumed = feed.phases.find((p) => p.atMs > interruptionAck.atMs && p.phase !== 'SOCRATES')!;
    check('flow resumes where the narration would have led', resumed.phase !== 'SOCRATES', `next phase ${resumed.phase}@${resumed.atMs}ms`);

    // --- the queue really was discarded -------------------------------------
    const introLinesPlayed = feed.beats.filter((b) => GAME_INTRO_SEQUENCE.includes(b.line)).length;
    check('remaining narration never played', introLinesPlayed === beatsBefore, `${introLinesPlayed} of ${GAME_INTRO_SEQUENCE.length} lines played`);
    check('lines discarded', GAME_INTRO_SEQUENCE.length - introLinesPlayed > 0, `${GAME_INTRO_SEQUENCE.length - introLinesPlayed} discarded`);

    console.log(`  TIMELINE: vote@${voteAtMs}ms -> stop(beat ${stop.beatId})@${stop.atMs}ms -> ` +
      `interruption(beat ${interruption.beatId})@${interruption.atMs}ms -> ack@${interruptionAck.atMs}ms -> ${resumed.phase}@${resumed.atMs}ms`);
    console.log(`  beats: ${feed.beats.map((b) => `${b.beatId}:${b.kind}`).join(' ')}`);
    for (const socket of sockets.splice(0)) socket.disconnect();
    await delay(300);
  }

  // -------------------------------------------------------------------------
  // B. A disconnect passes the vote, with nobody voting again.
  // -------------------------------------------------------------------------
  if (runs('B')) {
    console.log('\n=== B. a disconnect lowers the bar under two standing votes (4 players) ===');
    const { feed, sims } = await openNarration(4, 2);
    check('threshold is 3 of 4', feed.progress[0]?.needed === 3, `needed=${feed.progress[0]?.needed}`);
    sims[0].socket.emit(ClientEvents.SKIP_VOTE, {});
    sims[1].socket.emit(ClientEvents.SKIP_VOTE, {});
    await delay(400);
    const twoVotes = feed.progress[feed.progress.length - 1];
    check('2 of 4 does not pass', twoVotes.votes === 2 && twoVotes.open && feed.stops.length === 0, `${twoVotes.votes}/${twoVotes.needed}`);
    const votesCastBefore = logsMatching(/voted to skip/).length;

    sims[3].socket.disconnect(); // a NON-voter leaves
    await until(() => feed.stops.length > 0, 'stop after the disconnect');
    const afterDisconnect = feed.progress[feed.progress.length - 1];
    check('bar fell to 2 of 3 and the vote passed', afterDisconnect.connected === 3 && afterDisconnect.needed === 2, `${afterDisconnect.votes}/${afterDisconnect.needed} of ${afterDisconnect.connected}`);
    check('no new vote was cast', logsMatching(/voted to skip/).length === votesCastBefore, `${votesCastBefore} votes total`);
    await until(() => feed.beats.some((b) => SKIP_INTERRUPTED_LINES.includes(b.line)), 'interruption beat');
    check('interruption beat played', feed.beats.some((b) => SKIP_INTERRUPTED_LINES.includes(b.line)));
    for (const socket of sockets.splice(0)) socket.disconnect();
    await delay(300);
  }

  // -------------------------------------------------------------------------
  // C. Paused: votes ignored. Resumed: the same two votes pass.
  // -------------------------------------------------------------------------
  if (runs('C')) {
    console.log('\n=== C. votes are ignored while the game is paused (3 players) ===');
    const { feed, sims } = await openNarration(3, 2);
    sims[0].socket.emit(ClientEvents.GAME_PAUSE, {});
    await delay(300);
    sims[0].socket.emit(ClientEvents.SKIP_VOTE, {});
    sims[1].socket.emit(ClientEvents.SKIP_VOTE, {});
    await delay(500);
    check('both votes refused while paused', logsMatching(/rejected player:skip_vote.*game is paused/).length >= 2, `${logsMatching(/rejected player:skip_vote.*game is paused/).length} refusals`);
    const pausedTally = feed.progress[feed.progress.length - 1];
    check('tally unmoved while paused', pausedTally.votes === 0, `${pausedTally.votes}/${pausedTally.needed}`);
    check('no clip stopped while paused', feed.stops.length === 0);

    sims[0].socket.emit(ClientEvents.GAME_RESUME, {});
    await delay(300);
    sims[0].socket.emit(ClientEvents.SKIP_VOTE, {});
    sims[1].socket.emit(ClientEvents.SKIP_VOTE, {});
    await until(() => feed.stops.length > 0, 'stop after resume');
    check('the same two votes pass once resumed', feed.stops.length === 1, `stop at ${feed.stops[0].atMs}ms`);
    for (const socket of sockets.splice(0)) socket.disconnect();
    await delay(300);
  }

  // -------------------------------------------------------------------------
  // D. Reconnect mid-vote.
  // -------------------------------------------------------------------------
  if (runs('D')) {
    console.log('\n=== D. a voter blips and comes back to the right state (3 players) ===');
    const { code, feed, sims } = await openNarration(3, 2);
    sims[0].socket.emit(ClientEvents.SKIP_VOTE, {});
    await delay(400);
    check('vote registered before the blip', feed.progress[feed.progress.length - 1].votes === 1);

    const voterId = sims[0].playerId;
    sims[0].socket.disconnect();
    await delay(400);
    const whileAway = feed.progress[feed.progress.length - 1];
    check('a disconnected voter stops counting', whileAway.votes === 0 && whileAway.connected === 2, `${whileAway.votes}/${whileAway.needed} of ${whileAway.connected}`);
    check('their absence alone did not pass it', feed.stops.length === 0);

    const back = await joinSim(NAMES[0], AVATARS[0], code, voterId);
    await until(() => back.progress.length > 0, 'the rejoining phone getting skip:progress');
    const resend = back.progress[0];
    check('rejoining phone is told the vote is open', resend.open === true, `open=${resend.open}`);
    check('rejoining phone is told it ALREADY voted', resend.youVoted === true, `youVoted=${resend.youVoted}`);
    check('its vote counts again', resend.votes === 1 && resend.needed === 2, `${resend.votes}/${resend.needed} of ${resend.connected}`);
    console.log(`  RESEND: ${JSON.stringify({ votes: resend.votes, needed: resend.needed, connected: resend.connected, open: resend.open, youVoted: resend.youVoted })}`);
    for (const socket of sockets.splice(0)) socket.disconnect();
    await delay(300);
  }

  // -------------------------------------------------------------------------
  // F. The second skippable narration - Η Ανάβασις', which routes through a
  //    DIFFERENT arm of advanceFromSocrates' switch than A's does.
  // -------------------------------------------------------------------------
  if (runs('F')) {
    console.log('\n=== F. the climb\'s own narration is skippable too (3 players) ===');
    t0 = Date.now();
    const { code, feed } = await connectHost({ mode: 'full' });
    const sims: Sim[] = [];
    for (let i = 0; i < 3; i++) sims.push(await joinSim(NAMES[i], AVATARS[i], code));
    const room = getRoom(code)!;
    // Task 237 - a harness calling startClimb directly MUST seed this, or the
    // opening GAME_INTRO_SEQUENCE fires at the climb's own card and
    // CLIMB_QUESTION never arrives. Here it doubles as scenario hygiene: the
    // narration under test is the ANAVASIS one, not the intro.
    room.gameIntroPlayed = true;
    startClimb(room);
    await until(() => feed.beats.length >= 1, "Η Ανάβασις' narration", 40000);
    const first = feed.beats[0];
    check('the climb announces itself as a SEQUENCE', first.kind === 'STAGE_INTRO', `kind=${first.kind}`);
    check('it is an ANAVASIS line', ANAVASIS_INTRO_SEQUENCE.includes(first.line), `"${first.line.slice(0, 40)}"`);
    const opened = feed.progress.find((p) => p.open);
    check('a vote opened for it', opened !== undefined, `needed=${opened?.needed} of ${opened?.connected}`);

    sims[0].socket.emit(ClientEvents.SKIP_VOTE, {});
    sims[1].socket.emit(ClientEvents.SKIP_VOTE, {});
    await until(() => feed.stops.length > 0, 'socrates:stop');
    await until(() => feed.beats.some((b) => SKIP_INTERRUPTED_LINES.includes(b.line)), 'interruption beat');
    const interruption = feed.beats.find((b) => SKIP_INTERRUPTED_LINES.includes(b.line))!;
    check('interruption carries STAGE_INTRO, the climb\'s own kind', interruption.kind === 'STAGE_INTRO', `kind=${interruption.kind}`);
    check('the stopped beat was never acked', !feed.acks.some((a) => a.beatId === feed.stops[0].beatId));
    const anavasisPlayed = feed.beats.filter((b) => ANAVASIS_INTRO_SEQUENCE.includes(b.line)).length;
    check('the rest of the announcement was discarded', anavasisPlayed < ANAVASIS_INTRO_SEQUENCE.length, `${anavasisPlayed} of ${ANAVASIS_INTRO_SEQUENCE.length} played`);

    // The point of the whole scenario: the OTHER switch arm still runs.
    await until(() => feed.phases.some((p) => p.phase === 'CLIMB_QUESTION'), 'CLIMB_QUESTION', 40000);
    const climbQuestion = feed.phases.find((p) => p.phase === 'CLIMB_QUESTION')!;
    check('the climb begins anyway (STAGE_INTRO -> startClimbQuestion)', true, `CLIMB_QUESTION@${climbQuestion.atMs}ms`);
    console.log(`  TIMELINE: stop@${feed.stops[0].atMs}ms -> interruption@${interruption.atMs}ms -> CLIMB_QUESTION@${climbQuestion.atMs}ms`);
    for (const socket of sockets.splice(0)) socket.disconnect();
    await delay(300);
  }

  // -------------------------------------------------------------------------
  // E. Registration, pure.
  // -------------------------------------------------------------------------
  if (runs('E')) {
    console.log('\n=== E. registration (pure) ===');
    const entries = collectVoiceLineEntries();
    const mine = entries.filter((entry) => entry.moment === 'SKIP_INTERRUPTED');
    // Task 313 - every expectation below is derived from the tables/file, not
    // hard-coded, so adding a pool or a line can no longer stale this scenario.
    // The v2 pools + the skip pool, as distinct line texts (DUEL_LOCKED aliases
    // DUEL_LINES.DUEL_LOCKED, so texts, not array lengths, are what dedup).
    const v2Tables = Object.entries(SPEECH_V2_LINES);
    const v2Texts = new Set<string>([...v2Tables.flatMap(([, lines]) => lines), ...SKIP_INTERRUPTED_LINES]);
    const registered = entries.filter((entry) => v2Texts.has(entry.line));
    check(`every v2/skip line is registered exactly once (${v2Texts.size} distinct texts)`, registered.length === v2Texts.size && new Set(registered.map((e) => e.line)).size === v2Texts.size, `${registered.length} entries, total ${entries.length}`);
    check('4 of them are SKIP_INTERRUPTED', mine.length === 4, `${mine.length}`);
    check('every one has a tag (the clip is lineHash(template, tag))', mine.every((entry) => entry.tag !== null), mine.map((e) => e.tag).join(' '));

    const raw = readFileSync('content/speech-policy-lines.md', 'utf8');
    const sha = createHash('sha256').update(raw).digest('hex');
    const poolHeaders = raw.split('\n').filter((line) => /^[A-Z_]+:$/.test(line));
    const lineRows = raw.split('\n').filter((line) => /^\[/.test(line));
    const expectedPools = v2Tables.length + 1; // the v2 slot pools + SKIP_INTERRUPTED
    const expectedLines = v2Tables.reduce((sum, [, lines]) => sum + lines.length, 0) + SKIP_INTERRUPTED_LINES.length;
    check(`content file has ${expectedPools} pools (SPEECH_V2_LINES keys + SKIP_INTERRUPTED)`, poolHeaders.length === expectedPools, `${poolHeaders.length}`);
    check(`content file has ${expectedLines} lines (sum of the tables)`, lineRows.length === expectedLines, `${lineRows.length}`);
    check('every pool header in the file is a table key', poolHeaders.every((h) => h === 'SKIP_INTERRUPTED:' || h.slice(0, -1) in SPEECH_V2_LINES), poolHeaders.join(' '));
    // Counted row by row against the code, not assumed: the file is the source
    // and the table is the copy, so a drift in either direction has to fail.
    const fileBlock = raw.split('SKIP_INTERRUPTED:\n')[1]?.split('\n\n')[0] ?? '';
    const fileLines = fileBlock.split('\n').filter((line) => line.startsWith('['));
    check('4 rows under SKIP_INTERRUPTED: in the file', fileLines.length === 4, `${fileLines.length}`);
    for (let i = 0; i < fileLines.length; i++) {
      const tag = fileLines[i].slice(0, fileLines[i].indexOf(']') + 1);
      const text = fileLines[i].slice(fileLines[i].indexOf(']') + 2);
      check(`line ${i + 1} matches the code verbatim`, SKIP_INTERRUPTED_LINES[i] === text, `"${text.slice(0, 40)}"`);
      check(`line ${i + 1} tag matches LINE_TAGS`, LINE_TAGS[text] === tag, `${LINE_TAGS[text]} vs ${tag}`);
    }
    console.log(`  content/speech-policy-lines.md sha256=${sha}`);
  }

  console.log(`\n${failures === 0 ? 'ALL OK' : 'FAILURES'}: ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('FAILED:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const socket of sockets) socket.disconnect();
    await delay(200);
    process.exit(process.exitCode ?? 0);
  });
