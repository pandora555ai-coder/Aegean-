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
// Deliberately does NOT read any question's correct answer - even though
// this code runs server-side and technically could. A bot's choice is
// always a random pick among the options it was legitimately shown, same
// as sortAndRankResults sees for any player; the only lever that spreads
// scores is answer SPEED, via each bot's fixed 'fast'/'slow' profile.
import { randomUUID } from 'node:crypto';
import { io as ioClient, type Socket } from 'socket.io-client';
import {
  ClientEvents,
  MAX_BOTS,
  ServerEvents,
  type BlitzShowPayload,
  type DrawShowPayload,
  type GuessShowPayload,
  type JoinRejectedPayload,
  type NumericQuestionShowPayload,
  type PowerUpShowPlayerPayload,
  type QuestionShowPlayerPayload,
  type StealShowPlayerPayload,
  type TrialQuestionShowPayload,
} from '@game/shared';
import { AVAILABLE_AVATAR_IDS } from './avatars.js';
import { removePlayer } from './state.js';

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

function wireBotGameplay(socket: Socket, profile: BotProfile): void {
  socket.on(ServerEvents.QUESTION_SHOW, (payload: QuestionShowPlayerPayload) => {
    if (!('options' in payload)) {
      return; // host-shaped payload, not sent to this socket anyway
    }
    const choice = randomChoice(payload.options.length);
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
    const choice = randomChoice(payload.options.length);
    setTimeout(() => socket.emit(ClientEvents.DRAW_GUESS, { choice }), profileDelayMs(profile));
  });

  socket.on(ServerEvents.NUMERIC_QUESTION_SHOW, (payload: NumericQuestionShowPayload) => {
    if ('submittedCount' in payload) {
      return; // host-shaped payload, not sent to this socket anyway
    }
    const value = randomChoice(payload.max + 1);
    setTimeout(() => socket.emit(ClientEvents.NUMERIC_SUBMIT, { value }), profileDelayMs(profile));
  });

  // Η Δίκη answers over player:trial_submit, a separate event from the
  // plain QUESTION phase's player:submit_answer (see shared/src/index.ts).
  socket.on(ServerEvents.TRIAL_QUESTION_SHOW, (payload: TrialQuestionShowPayload) => {
    if (!('options' in payload) || ('onTrial' in payload && !payload.onTrial)) {
      return; // host-shaped payload, or an eliminated/spectating bot
    }
    const choice = randomChoice(payload.options.length);
    setTimeout(() => socket.emit(ClientEvents.TRIAL_SUBMIT, { choice }), profileDelayMs(profile));
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
      socket.emit(ClientEvents.BLITZ_SWIPE, { index: nextIndex, answeredTrue: Math.random() < 0.5 });
      nextIndex += 1;
      setTimeout(swipeNext, profileDelayMs(profile));
    };
    setTimeout(swipeNext, profileDelayMs(profile));
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
    const avatarId = avatarPool.length > 0 ? avatarPool[i % avatarPool.length] : 'minotaur';
    const playerId = randomUUID();
    // Alternating fast/slow - with an odd bot count the extra one is fast,
    // matching the harness's own "bot 0 is always fast" convention.
    const profile: BotProfile = i % 2 === 0 ? 'fast' : 'slow';

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
    wireBotGameplay(socket, profile);
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
