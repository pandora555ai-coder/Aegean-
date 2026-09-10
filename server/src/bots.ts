// Task 176 - ?bot=N: server-side bots as a room feature. A bot is a real
// Socket.IO CLIENT connection the server opens against ITSELF (loopback,
// same port it's already listening on) - the exact mechanism
// dev/screenshot-phases.ts has used for a real "player" all along, just
// spawned from inside the server process instead of a throwaway harness.
// This is what "answer at the socket level, never render a phone" buys:
// every join/answer/reconnect edge case the real protocol already handles
// (VIP, disconnects, state:sync) applies to a bot for free, with zero
// changes to index.ts's socket handlers themselves.
//
// Task 221 - a bot's choice is no longer blind. Each bot draws its OWN
// accuracy once per game (BOT_ACCURACY_LO..HI, 50-70%) and answers correctly
// with that probability, otherwise picks a random WRONG option - never a
// coin-flip-fair pick among all options, which is what a uniform-random
// choice among 4 quietly was. This still reads server state a real player's
// socket payload never carries (the correct index / true value for the
// room's CURRENT question), but that read stays entirely in-process and
// never leaves via any socket emit - the wire-level guarantee ("the correct
// answer never leaves the server before REVEAL") is unchanged. The lever
// that spreads scores is now BOTH accuracy and speed (via each bot's fixed
// 'fast'/'slow' profile), where before it was speed alone against a uniform
// 25%-on-4-options baseline.
import { randomUUID } from 'node:crypto';
import { io as ioClient, type Socket } from 'socket.io-client';
import {
  ClientEvents,
  MAX_BOTS,
  ServerEvents,
  type AgoraQuestionShowPayload,
  type BlitzShowPayload,
  type ClimbQuestionShowPayload,
  DUEL_WEAPONS,
  type DuelPickShowPayload,
  type DrawShowPayload,
  type GuessShowPayload,
  type JoinRejectedPayload,
  type NumericQuestionShowPayload,
  type PowerUpShowPlayerPayload,
  type QuestionShowPlayerPayload,
  type RoomCode,
  type SocratesShowPayload,
  type StealShowPlayerPayload,
  type TrialQuestionShowPayload,
} from '@game/shared';
import { AVAILABLE_AVATAR_IDS } from './avatars.js';
import { getRoom, removePlayer } from './state.js';
import { getAgoraCorrectIndex } from './modes/agora.js';
import { getDrawCorrectIndex } from './modes/draw.js';
import { getBlitzStatementIsTrue } from './modes/blitz.js';
import { getNumericTrueAnswer } from './modes/numeric.js';

// Drawn once per bot per game (spawnBots), never re-rolled mid-game -
// score divergence across bots needs a FIXED per-bot skill, not noise that
// averages back out over the course of one game.
const BOT_ACCURACY_LO = 0.5;
const BOT_ACCURACY_HI = 0.7;

function randomAccuracy(): number {
  return BOT_ACCURACY_LO + Math.random() * (BOT_ACCURACY_HI - BOT_ACCURACY_LO);
}

// Correct with probability `accuracy`, otherwise a uniform-random WRONG
// option (never re-picks the correct one by chance) - the "quiz / steal /
// blitz / agora / climb" family from Task 221. `correctIndex === null`
// (state not ready yet, e.g. a race on an in-flight phase transition) falls
// back to the old blind uniform pick rather than guessing.
function accurateChoice(numOptions: number, correctIndex: number | null, accuracy: number): number {
  if (correctIndex === null || correctIndex < 0 || correctIndex >= numOptions) {
    return randomChoice(numOptions);
  }
  if (numOptions <= 1 || Math.random() < accuracy) {
    return correctIndex;
  }
  const wrongPick = randomChoice(numOptions - 1);
  return wrongPick >= correctIndex ? wrongPick + 1 : wrongPick;
}

// Numeric (Εκτίμηση) has no "correct" - instead sample around the true
// value with spread INVERSELY related to accuracy:
//   value = clamp(round(trueValue + U(-1,1) * (1 - accuracy) * max), 0, max)
// A 0.7-accuracy bot's noise amplitude is at most 30% of the question's own
// range; a 0.5-accuracy bot's is at most 50%. `max` is the question's own
// derived range (maxForAnswer), so the spread scales with the question, not
// a fixed absolute number.
function sampleNumericValue(trueValue: number, max: number, accuracy: number): number {
  const noiseScale = (1 - accuracy) * max;
  const offset = (Math.random() * 2 - 1) * noiseScale;
  return Math.min(max, Math.max(0, Math.round(trueValue + offset)));
}

// Distinct Greek names, cycled if a room somehow asks for more than this
// list has (never happens today - MAX_BOTS is well under it).
const BOT_NAMES = [
  'Γιώργος',
  'Ελένη',
  'Νίκος',
  'Μαρία',
  'Δημήτρης',
  'Σοφία',
  'Κώστας',
  'Ειρήνη',
  'Ανδρέας',
  'Κατερίνα',
];

type BotProfile = 'fast' | 'slow';

interface BotRecord {
  playerId: string;
  socket: Socket;
}

// Keyed by room code - populated by spawnBots, drained by cleanupRoomBots.
const botsByRoom = new Map<string, BotRecord[]>();

function serverOrigin(): string {
  // Same computation index.ts uses for its own httpServer.listen (PORT env,
  // default 3001) - loopback always reaches it regardless of HOST, which in
  // production binds 127.0.0.1 anyway and in dev binds 0.0.0.0.
  const port = Number(process.env.PORT) || 3001;
  return `http://127.0.0.1:${port}`;
}

function randomChoice(count: number): number {
  return Math.floor(Math.random() * count);
}

// The proven divergence pattern: a 'fast' bot answers near-instantly (close
// to the max speed bonus on anything it gets right), a 'slow' bot answers
// close to the buzzer (close to zero speed bonus). Correctness is never
// biased by this - see the file header.
function profileDelayMs(profile: BotProfile): number {
  return profile === 'fast' ? 300 + Math.random() * 500 : 3000 + Math.random() * 1500;
}

// 1x1 transparent PNG - draw:submit only requires a 'data:image/' prefix and
// a size under DRAWING_MAX_BYTES, no real decode (proven by
// dev/screenshot-phases.ts). A bot drawer submits this trivial scribble
// rather than skipping its turn, so GUESS/GUESS_REVEAL always have a real
// (blank) image to show.
const PLACEHOLDER_DRAWING =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function wireBotGameplay(socket: Socket, profile: BotProfile, code: RoomCode, accuracy: number): void {
  socket.on(ServerEvents.QUESTION_SHOW, (payload: QuestionShowPlayerPayload) => {
    if (!('options' in payload)) {
      return; // host-shaped payload, not sent to this socket anyway
    }
    const room = getRoom(code);
    const correctIndex = room ? (room.questions[room.currentQuestionIndex]?.correctIndex ?? null) : null;
    const choice = accurateChoice(payload.options.length, correctIndex, accuracy);
    setTimeout(() => socket.emit(ClientEvents.SUBMIT_ANSWER, { choice }), profileDelayMs(profile));
  });

  socket.on(ServerEvents.POWER_UP_SHOW, (payload: PowerUpShowPlayerPayload) => {
    if (!('targets' in payload) || payload.targets.length === 0) {
      return;
    }
    const target = payload.targets[randomChoice(payload.targets.length)];
    // Always 'ink' - matches the proven harness pattern; 'ice' can block a
    // bot's own next submit for no benefit to the game.
    setTimeout(() => {
      socket.emit(ClientEvents.POWER_UP_CHOOSE, { effect: 'ink', targetPlayerId: target.playerId });
    }, 800 + Math.random() * 700);
  });

  socket.on(ServerEvents.STEAL_SHOW, (payload: StealShowPlayerPayload) => {
    if (!payload.youAreThief || payload.targets.length === 0) {
      return;
    }
    const target = payload.targets[randomChoice(payload.targets.length)];
    setTimeout(() => {
      socket.emit(ClientEvents.STEAL_CHOOSE, { targetPlayerId: target.playerId });
    }, 300);
  });

  socket.on(ServerEvents.DRAW_SHOW, (payload: DrawShowPayload) => {
    if (!('wordToDraw' in payload)) {
      return; // host-shaped payload, or this bot isn't the round's drawer
    }
    setTimeout(() => {
      socket.emit(ClientEvents.DRAW_SUBMIT, { image: PLACEHOLDER_DRAWING });
    }, 500 + Math.random() * 500);
  });

  socket.on(ServerEvents.GUESS_SHOW, (payload: GuessShowPayload) => {
    if (!('isDrawer' in payload) || payload.isDrawer) {
      return; // host payload, or this bot is the round's drawer
    }
    const room = getRoom(code);
    const correctIndex = room ? getDrawCorrectIndex(room) : null;
    const choice = accurateChoice(payload.options.length, correctIndex, accuracy);
    setTimeout(() => socket.emit(ClientEvents.DRAW_GUESS, { choice }), profileDelayMs(profile));
  });

  socket.on(ServerEvents.NUMERIC_QUESTION_SHOW, (payload: NumericQuestionShowPayload) => {
    if ('submittedCount' in payload) {
      return; // host-shaped payload, not sent to this socket anyway
    }
    const room = getRoom(code);
    const trueValue = room ? getNumericTrueAnswer(room) : null;
    const value = trueValue === null ? randomChoice(payload.max + 1) : sampleNumericValue(trueValue, payload.max, accuracy);
    setTimeout(() => socket.emit(ClientEvents.NUMERIC_SUBMIT, { value }), profileDelayMs(profile));
  });

  // Η Δίκη answers over player:trial_submit, a separate event from the
  // plain QUESTION phase's player:submit_answer (see shared/src/index.ts).
  socket.on(ServerEvents.TRIAL_QUESTION_SHOW, (payload: TrialQuestionShowPayload) => {
    if (!('options' in payload) || ('onTrial' in payload && !payload.onTrial)) {
      return; // host-shaped payload, or an eliminated/spectating bot
    }
    const room = getRoom(code);
    const correctIndex = room?.trial ? (room.trial.questions[room.trial.questionIndex]?.correctIndex ?? null) : null;
    const choice = accurateChoice(payload.options.length, correctIndex, accuracy);
    setTimeout(() => socket.emit(ClientEvents.TRIAL_SUBMIT, { choice }), profileDelayMs(profile));
  });

  // Task 188a - the climb finale, answered exactly as a trial question:
  // accuracy-weighted over player:climb_submit after the profile's delay.
  socket.on(ServerEvents.CLIMB_QUESTION_SHOW, (payload: ClimbQuestionShowPayload) => {
    if (!('options' in payload) || ('climbing' in payload && !payload.climbing) || ('eliminated' in payload && payload.eliminated)) {
      return; // host-shaped payload, a spectating bot, or one the spear speared out (Task 205)
    }
    const room = getRoom(code);
    const correctIndex = room?.climb ? (room.climb.questions[room.climb.questionIndex]?.correctIndex ?? null) : null;
    const choice = accurateChoice(payload.options.length, correctIndex, accuracy);
    setTimeout(() => socket.emit(ClientEvents.CLIMB_SUBMIT, { choice }), profileDelayMs(profile));
  });

  // Task 207 - the agora's question, answered exactly as a trial question:
  // accuracy-weighted over player:agora_submit after the profile's delay.
  // The exposure needs nothing from a bot (it "looks at the TV").
  socket.on(ServerEvents.AGORA_QUESTION_SHOW, (payload: AgoraQuestionShowPayload) => {
    if (!('options' in payload) || ('answered' in payload && payload.answered)) {
      return; // host-shaped payload, or a catch-up that says it already answered
    }
    const room = getRoom(code);
    const correctIndex = room ? getAgoraCorrectIndex(room) : null;
    const choice = accurateChoice(payload.options.length, correctIndex, accuracy);
    setTimeout(() => socket.emit(ClientEvents.AGORA_SUBMIT, { choice }), profileDelayMs(profile));
  });

  // Task 188b - the climb's duel: a duelist bot picks uniformly at random
  // after 400-1500ms (its own window, not the profile's - a duel is a snap
  // decision for either profile). A spectator, or a catch-up that says it
  // already picked, does nothing.
  socket.on(ServerEvents.DUEL_PICK_SHOW, (payload: DuelPickShowPayload) => {
    if (!('youDuel' in payload) || !payload.youDuel || payload.picked) {
      return;
    }
    const weapon = DUEL_WEAPONS[randomChoice(DUEL_WEAPONS.length)];
    setTimeout(() => socket.emit(ClientEvents.DUEL_PICK, { weapon }), 400 + Math.random() * 1100);
  });

  // blitz:show broadcasts once per game (never re-sent per-swipe), so this
  // schedules the bot's own remaining swipes locally.
  socket.on(ServerEvents.BLITZ_SHOW, (payload: BlitzShowPayload) => {
    if ('progressByPlayerId' in payload) {
      return; // host-shaped payload, not sent to this socket anyway
    }
    let nextIndex = payload.answeredCount;
    const swipeNext = () => {
      if (nextIndex >= payload.total) {
        return;
      }
      const room = getRoom(code);
      const isTrue = room ? getBlitzStatementIsTrue(room, nextIndex) : null;
      const answeredTrue = isTrue === null ? Math.random() < 0.5 : Math.random() < accuracy ? isTrue : !isTrue;
      socket.emit(ClientEvents.BLITZ_SWIPE, { index: nextIndex, answeredTrue });
      nextIndex += 1;
      setTimeout(swipeNext, profileDelayMs(profile));
    };
    setTimeout(swipeNext, profileDelayMs(profile));
  });
}

// Task 221 - the harness-side half of the Socrates audio fix. Only the
// socket registered as room.hostSocketId may emit SOCRATES_AUDIO_ENDED (see
// index.ts's getHostRoomForSocket) - a bot is always a PLAYER socket, so it
// structurally cannot ack this itself. Production is unaffected: a real
// ?bot=N room is always fronted by a real browser at /host, which already
// acks the instant its own audio finishes playing. The gap is a socket-only
// harness that opens a bare socket.io-client as the host role (no browser,
// no audio) and never acks anything - every Socrates beat there rode the
// full SOCRATES_MAX_DURATION_MS backstop. A harness's host socket should
// call this once, right after it connects, to behave like that real
// browser: `totalDurationMs` is the SAME estimate resolveSocratesDurationMs
// computes for the real mp3 (byte-size based) when the line's pre-generated
// file exists on disk, falling back to the flat SOCRATES_DURATION_MS
// otherwise - exactly what HostScreen's real playback would take, without
// this harness needing to decode any audio itself.
export function wireHostSocratesAck(hostSocket: Socket): void {
  hostSocket.on(ServerEvents.SOCRATES_SHOW, (payload: SocratesShowPayload) => {
    setTimeout(() => hostSocket.emit(ClientEvents.SOCRATES_AUDIO_ENDED, {}), payload.totalDurationMs);
  });
}

// Called once, right after a room is created, if the client asked for bots
// (host:create_room's botCount). `count` is clamped to MAX_BOTS regardless
// of what was requested - never trust a client-supplied number.
export function spawnBots(code: string, count: number): void {
  const n = Math.max(0, Math.min(MAX_BOTS, Math.floor(count) || 0));
  if (n === 0) {
    return;
  }

  const avatarPool = Array.from(AVAILABLE_AVATAR_IDS);
  const records: BotRecord[] = [];
  botsByRoom.set(code, records);

  for (let i = 0; i < n; i++) {
    const name = BOT_NAMES[i % BOT_NAMES.length];
    // Task 223 - from the END of the catalogue, not the start: a human
    // joining a bot room picks from the front of the same list, so this
    // keeps a bot and a human from colliding on the same avatar in the
    // common case (still possible once the pool is exhausted both ends).
    const avatarId =
      avatarPool.length > 0 ? avatarPool[avatarPool.length - 1 - (i % avatarPool.length)] : 'minotaur';
    const playerId = randomUUID();
    // Alternating fast/slow - with an odd bot count the extra one is fast,
    // matching the harness's own "bot 0 is always fast" convention.
    const profile: BotProfile = i % 2 === 0 ? 'fast' : 'slow';
    // Task 221 - this bot's own accuracy, drawn once for the whole game.
    const accuracy = randomAccuracy();

    const socket: Socket = ioClient(serverOrigin(), { reconnection: false });
    records.push({ playerId, socket });

    socket.on('connect', () => {
      socket.emit(ClientEvents.PLAYER_JOIN, { code, name, playerId, avatarId, isBot: true });
    });
    socket.on(ServerEvents.JOIN_REJECTED, (payload: JoinRejectedPayload) => {
      console.warn(`bot ${name} (${playerId}) join rejected for room ${code}: ${payload.reason}`);
    });
    socket.on('connect_error', (err) => {
      console.warn(`bot ${name} (${playerId}) failed to connect for room ${code}: ${String(err)}`);
    });
    wireBotGameplay(socket, profile, code, accuracy);
    // Logged (not just held in closure) so a harness driving this room over
    // stdout can read back what each bot was actually assigned, per playerId.
    console.log(`room ${code}: bot ${name} (${playerId}) accuracy=${accuracy.toFixed(3)} profile=${profile}`);
  }

  console.log(`room ${code}: spawned ${n} bot(s) (${records.map((r) => r.playerId).join(', ')})`);
}

// Disconnects every bot socket for `code` and removes its Player entry from
// the room outright (not just marking it disconnected - resetRoomForNewGame
// would otherwise carry a "connected: false" bot ghost into the next lobby).
// Called once the room's game is actually over (each mode's own finishGame)
// and from vip:reset_to_lobby, so an abandoned bot game cleans up too. A
// no-op if this room never had bots, or already had them cleaned up.
export function cleanupRoomBots(code: string): void {
  const bots = botsByRoom.get(code);
  if (!bots || bots.length === 0) {
    return;
  }
  botsByRoom.delete(code);
  for (const { playerId, socket } of bots) {
    removePlayer(code, playerId);
    socket.disconnect();
  }
  console.log(`room ${code}: cleaned up ${bots.length} bot(s)`);
}
