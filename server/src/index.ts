import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import type { Socket } from 'socket.io';
import {
  ClientEvents,
  DRAWING_MAX_BYTES,
  MIN_PLAYERS,
  PRESET_NAMES,
  ServerEvents,
  type AnswerProgressPayload,
  type ClientToServerEvents,
  type LobbyPlayer,
  type LobbyUpdatePayload,
  type PausedPayload,
  type Player,
  type PowerUpChoiceAcceptedPayload,
  type ResumedPayload,
  type RoomCode,
  type ServerToClientEvents,
  type SettingsUpdatedPayload,
  type StateSyncPayload,
  type VipChangedPayload,
} from '@game/shared';
import {
  addPlayer,
  allAvailableAvatarsTaken,
  attachHostDisplay,
  buildRoomQuestions,
  claimVipIfVacant,
  createRoom,
  detachHostDisplay,
  getActiveRoomCount,
  getConnectedPlayers,
  haveAllConnectedPlayersAnswered,
  haveAllConnectedPlayersChosenPowerUp,
  getPlayer,
  getRoom,
  isAvatarTaken,
  isRoomFull,
  isValidPlayerName,
  isVip,
  migrateVipAwayFrom,
  normalizePlayerName,
  refreshRoomTtl,
  resetRoomForNewGame,
  updateRoomSettings,
  type Room,
} from './state.js';
import { pauseActiveTimer, remainingActiveTimerMs, resumeActiveTimer } from './timers.js';
import { pauseCrowdTensionTimer, resumeCrowdTensionTimer } from './crowd.js';
import { isValidAvatarId } from './avatars.js';
import {
  endQuestion,
  endPowerUp,
  endTrialReveal,
  advanceFromReveal,
  advanceFromSteal,
  recheckTrialPhaseOnDisconnect,
  resolveSteal,
  submitTrialAnswer,
} from './phases.js';
// Task 52 - importing the barrel is what REGISTERS every game mode, so it
// must stay even if only these two names are used.
import { continuationForActiveTimer, listGameModeOptions, modeForRoom } from './modes/index.js';
// Task 56a - the drawing mode's own socket-facing functions. Per
// modes/README, a mode's own events (like POWER_UP_CHOOSE/STEAL_CHOOSE
// above) are wired up here, not in modes/draw.ts itself.
import {
  buildDrawHostPayload,
  buildDrawPlayerPayload,
  buildGuessHostPayload,
  buildGuessPlayerPayload,
  buildGuessRevealPayload,
  recheckDrawPhaseOnDisconnect,
  recheckGuessPhaseOnDisconnect,
  submitDrawing,
  submitGuess,
} from './modes/draw.js';
// Task 65 - the numeric-estimate mode's own socket-facing function, wired up
// here for the same reason as draw's above (modes/README).
import {
  buildNumericQuestionHostShow,
  buildNumericQuestionPlayerShow,
  buildNumericRevealShow,
  recheckNumericPhaseOnDisconnect,
  submitNumericAnswer,
} from './modes/numeric.js';
// Task 156 - the blitz mode's own socket-facing functions, same shape.
import {
  buildBlitzHostShow,
  buildBlitzPlayerShow,
  buildBlitzRevealHostShow,
  buildBlitzRevealPlayerShow,
  recheckBlitzPhaseOnDisconnect,
  submitBlitzSwipe,
} from './modes/blitz.js';
import { NUMERIC_QUESTIONS } from './numeric.js';
import { collectVoiceLineEntries } from './socrates.js';
import {
  buildRevealHostPayload,
  buildRevealPlayerPayload,
  buildPowerUpHostPayload,
  buildPowerUpPlayerPayload,
  buildSocratesPayload,
  buildStageAnnounce,
  buildStealHostPayload,
  buildStealPlayerPayload,
  buildTrialQuestionHostPayload,
  buildTrialQuestionPlayerPayload,
  buildTrialRevealPayload,
  buildGameOver,
  computeStandings,
} from './payloads.js';
import { isPowerUpEffect } from './powerups.js';
import {
  activeSabotagesFor,
  isIced,
  optionsForPlayer,
  toCanonicalChoice,
  toDisplayChoice,
} from './sabotage.js';
import { initRealtime, io, httpServer } from './realtime.js';
import { registerBlitzLog } from './blitzLog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isProduction = process.env.NODE_ENV === 'production';
const PRODUCTION_ORIGIN = 'https://demboyz11.duckdns.org';
// Permissive in dev (any origin - useful for testing from a phone on the
// LAN against the Vite dev server); locked to the real domain in prod.
const corsOptions = { origin: isProduction ? PRODUCTION_ORIGIN : true };

const app = express();
app.use(cors(corsOptions));

// Task 70 - blitz round upload sink (POST-only, own JSON body parser).
// Registered before the production SPA catch-all so it is never swallowed.
registerBlitzLog(app);

if (isProduction) {
  // In production, Caddy proxies both the built client and the API through
  // this same process, so Express also serves the static build - with an
  // SPA fallback so a direct load or refresh of e.g. /play doesn't 404.
  const clientDistPath = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    // Never let the fallback intercept Socket.IO's own HTTP endpoints.
    if (req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

initRealtime(app, corsOptions);

// socket.id -> the single room/role a socket is currently associated with
// (either hosting a room, or joined as a player in one).
type SocketAssociation =
  | { role: 'host'; code: RoomCode }
  | { role: 'player'; code: RoomCode; playerId: string };

const socketAssociationBySocketId = new Map<string, SocketAssociation>();

function buildLobbyUpdate(code: RoomCode): LobbyUpdatePayload | null {
  const room = getRoom(code);
  if (!room) {
    return null;
  }

  const players: LobbyPlayer[] = Array.from(room.players.values()).map((player) => ({
    playerId: player.playerId,
    name: player.name,
    connected: player.connected,
    isVip: player.playerId === room.vipPlayerId,
    avatarId: player.avatarId,
  }));
  // Task 57 - mode-aware: the room's CURRENTLY selected mode's own minimum
  // (draw's is 3, quiz's is MIN_PLAYERS), not a flat floor - so a lobby that
  // has picked 'draw' with only 2 connected players correctly reports
  // canStart: false instead of the quiz-only threshold letting it through.
  const canStart = players.filter((player) => player.connected).length >= modeForRoom(room).minPlayers;

  return { code, players, canStart, settings: room.settings, mode: room.mode, availableModes: listGameModeOptions() };
}

function broadcastLobbyUpdate(code: RoomCode): void {
  const payload = buildLobbyUpdate(code);
  if (payload) {
    io.to(code).emit(ServerEvents.LOBBY_UPDATE, payload);
  }
}

// Catches a single player up to whatever's currently happening in the room -
// used right after a join/reconnect when phase !== 'LOBBY', so nobody is
// ever stuck looking at a stale waiting view.
function buildStateSyncForPlayer(room: Room, playerId: string): StateSyncPayload | null {
  switch (room.phase) {
    // Power-up (Task 30a): the phase's REMAINING time (frozen if the room is
    // paused, since it comes from the shared timer helper) plus whether this
    // phone has already chosen - `yourChoice` is read live from room state,
    // so a reconnecting player can never be tricked into a second choice and
    // never loses the one they made.
    case 'POWER_UP':
      return {
        ...buildPowerUpPlayerPayload(room, playerId),
        phase: 'POWER_UP',
        remainingMs: remainingActiveTimerMs(room),
      };
    case 'QUESTION': {
      const question = room.questions[room.currentQuestionIndex];
      const recorded = room.answers.get(playerId);
      return {
        phase: 'QUESTION',
        questionIndex: room.currentQuestionIndex,
        totalQuestions: room.questions.length,
        // Sabotage (Task 28c): a shuffled victim gets THEIR stored order
        // back - the same one, never a fresh draw - and `yourChoice` is
        // re-mapped into it, so the button their phone re-marks as answered
        // is the one they actually pressed.
        options: optionsForPlayer(room, playerId, question.options),
        category: question.category,
        questionTimeMs: room.settings.questionTimeMs,
        remainingMs: remainingActiveTimerMs(room),
        yourChoice: recorded ? toDisplayChoice(room, playerId, recorded.choice) : null,
        paused: room.paused,
        pausedByName: room.pausedByName,
        // Sabotage (Task 28b): the time still LEFT on everything running
        // against them, so a mid-question reconnect resumes the freeze/fade
        // rather than restarting it - a STACKED effect included, since the
        // stack lives in room state and the remaining time is derived from
        // the shared (pause-aware) timer. Read live, never cached.
        yourSabotages: activeSabotagesFor(room, playerId),
      };
    }
    case 'REVEAL': {
      const payload = buildRevealPlayerPayload(room, playerId);
      return payload ? { ...payload, phase: 'REVEAL' } : null;
    }
    // Socrates (Task 39) is the TV's beat, but a phone reconnecting into it
    // still needs SOMETHING - the same reveal view it was already showing,
    // truthfully labelled with the phase the room is actually in.
    case 'SOCRATES': {
      const payload = buildRevealPlayerPayload(room, playerId);
      return payload ? { ...payload, phase: 'SOCRATES' } : null;
    }
    // Steal (Task 32): the phase's REMAINING time (frozen if the room is
    // paused, since it comes from the shared timer helper) plus - the bit that
    // matters on a reconnect - whether THIS phone is the thief, and whether it
    // already picked. Both read live from room state, never from the client.
    case 'STEAL': {
      const payload = buildStealPlayerPayload(room, playerId);
      return payload ? { ...payload, phase: 'STEAL', remainingMs: remainingActiveTimerMs(room) } : null;
    }
    case 'GAME_OVER':
      return { ...buildGameOver(room), phase: 'GAME_OVER' };
    // Task 56b - same reasoning as the host branches below: reuse draw.ts's
    // own builders so a reconnecting phone can never see a stale or
    // recomputed-differently view of the round it left.
    case 'DRAW': {
      const payload = buildDrawPlayerPayload(room, playerId);
      return payload ? { ...payload, phase: 'DRAW', remainingMs: remainingActiveTimerMs(room) } : null;
    }
    case 'GUESS': {
      const payload = buildGuessPlayerPayload(room, playerId);
      return payload ? { ...payload, phase: 'GUESS', remainingMs: remainingActiveTimerMs(room) } : null;
    }
    case 'GUESS_REVEAL': {
      const payload = buildGuessRevealPayload(room);
      return payload ? { ...payload, phase: 'GUESS_REVEAL' } : null;
    }
    // Task 65 - same reasoning as DRAW/GUESS/GUESS_REVEAL above.
    case 'NUMERIC_QUESTION': {
      const payload = buildNumericQuestionPlayerShow(room, playerId);
      return payload ? { ...payload, phase: 'NUMERIC_QUESTION', remainingMs: remainingActiveTimerMs(room) } : null;
    }
    case 'NUMERIC_REVEAL': {
      const payload = buildNumericRevealShow(room);
      return payload ? { ...payload, phase: 'NUMERIC_REVEAL' } : null;
    }
    // Task 127 - Η Δίκη. Same reasoning as every phase above: the phone gets
    // back exactly what a fresh trial_question:show would have sent it - its
    // OWN life, whether it is on trial and whether it already locked in, all
    // read live from room state so a reconnect can neither lose a lock-in nor
    // be tricked into a second one.
    case 'TRIAL_QUESTION': {
      const payload = buildTrialQuestionPlayerPayload(room, playerId);
      return payload ? { ...payload, phase: 'TRIAL_QUESTION', remainingMs: remainingActiveTimerMs(room) } : null;
    }
    case 'TRIAL_REVEAL': {
      const payload = buildTrialRevealPayload(room);
      return payload ? { ...payload, phase: 'TRIAL_REVEAL' } : null;
    }
    // Task 156 - the blitz mode, same reasoning as every phase above: the
    // phone gets its texts back plus how far IT already got, read live.
    case 'BLITZ': {
      const payload = buildBlitzPlayerShow(room, playerId);
      return payload ? { ...payload, phase: 'BLITZ', remainingMs: remainingActiveTimerMs(room) } : null;
    }
    case 'BLITZ_REVEAL': {
      const payload = buildBlitzRevealPlayerShow(room, playerId);
      return payload ? { ...payload, phase: 'BLITZ_REVEAL' } : null;
    }
    default:
      return null; // LOBBY - callers never ask for this
  }
}

// Catches the TV/host display up to whatever's currently happening in the
// room - used on host:rejoin, for EVERY phase including LOBBY (unlike the
// player-side version above, a host reattaching mid-LOBBY still needs the
// current player list, since it has no other way to get one).
function buildStateSyncForHost(room: Room): StateSyncPayload | null {
  switch (room.phase) {
    case 'LOBBY': {
      const lobbyPayload = buildLobbyUpdate(room.code);
      return lobbyPayload ? { ...lobbyPayload, phase: 'LOBBY' } : null;
    }
    // The announcement is a held phase now, so a TV reattaching mid-beat
    // gets the card back plus what's actually left of the hold (frozen if
    // the room is paused) - never a fresh full duration.
    case 'STAGE_ANNOUNCE':
      return { ...buildStageAnnounce(room), phase: 'STAGE_ANNOUNCE', remainingMs: remainingActiveTimerMs(room) };
    case 'POWER_UP':
      return { ...buildPowerUpHostPayload(room), phase: 'POWER_UP', remainingMs: remainingActiveTimerMs(room) };
    case 'QUESTION': {
      const question = room.questions[room.currentQuestionIndex];
      return {
        phase: 'QUESTION',
        questionIndex: room.currentQuestionIndex,
        totalQuestions: room.questions.length,
        question: question.question,
        options: question.options,
        category: question.category,
        questionTimeMs: room.settings.questionTimeMs,
        remainingMs: remainingActiveTimerMs(room),
        paused: room.paused,
        pausedByName: room.pausedByName,
        // Never re-picked here - the intro's whole reason to exist is the
        // ENTRANCE as the question first appears, which a reconnecting
        // host already missed. The REVEAL commentary below, by contrast,
        // DOES persist and catch a reconnect up (it reuses
        // buildRevealHostPayload, same as the live broadcast).
        socratesIntro: null,
        standings: computeStandings(room),
      };
    }
    case 'REVEAL': {
      const payload = buildRevealHostPayload(room);
      return payload ? { ...payload, phase: 'REVEAL' } : null;
    }
    case 'STEAL': {
      const payload = buildStealHostPayload(room);
      return payload ? { ...payload, phase: 'STEAL', remainingMs: remainingActiveTimerMs(room) } : null;
    }
    // Unlike Socrates' question INTRO (which is an entrance and is never
    // re-picked), this beat is a real hold: a TV reattaching mid-line gets the
    // same line back plus what's actually left of the hold, frozen if paused.
    case 'SOCRATES': {
      const payload = buildSocratesPayload(room);
      return payload ? { ...payload, phase: 'SOCRATES', remainingMs: remainingActiveTimerMs(room) } : null;
    }
    case 'GAME_OVER':
      return { ...buildGameOver(room), phase: 'GAME_OVER' };
    // Task 56b - the drawing mode's own phases, same builder-plus-remainingMs
    // shape as every phase above. Host reconnect mid-DRAW/GUESS/GUESS_REVEAL
    // must restore the exact current screen, which is exactly what reusing
    // draw.ts's own live-broadcast builders here guarantees: a fresh phase
    // entry and a reconnect can never disagree.
    case 'DRAW': {
      const payload = buildDrawHostPayload(room);
      return payload ? { ...payload, phase: 'DRAW', remainingMs: remainingActiveTimerMs(room) } : null;
    }
    case 'GUESS': {
      const payload = buildGuessHostPayload(room);
      return payload ? { ...payload, phase: 'GUESS', remainingMs: remainingActiveTimerMs(room) } : null;
    }
    case 'GUESS_REVEAL': {
      const payload = buildGuessRevealPayload(room);
      return payload ? { ...payload, phase: 'GUESS_REVEAL' } : null;
    }
    // Task 65 - same reasoning as DRAW/GUESS/GUESS_REVEAL above.
    case 'NUMERIC_QUESTION': {
      const payload = buildNumericQuestionHostShow(room);
      return payload ? { ...payload, phase: 'NUMERIC_QUESTION', remainingMs: remainingActiveTimerMs(room) } : null;
    }
    case 'NUMERIC_REVEAL': {
      const payload = buildNumericRevealShow(room);
      return payload ? { ...payload, phase: 'NUMERIC_REVEAL' } : null;
    }
    // Task 127 - Η Δίκη, same builder-plus-remainingMs shape as every phase
    // above, so a TV reattaching mid-trial restores the exact current screen
    // (lives, who has locked in, what is left of the drain).
    case 'TRIAL_QUESTION': {
      const payload = buildTrialQuestionHostPayload(room);
      return payload ? { ...payload, phase: 'TRIAL_QUESTION', remainingMs: remainingActiveTimerMs(room) } : null;
    }
    case 'TRIAL_REVEAL': {
      const payload = buildTrialRevealPayload(room);
      return payload ? { ...payload, phase: 'TRIAL_REVEAL' } : null;
    }
    // Task 156 - the blitz mode, same builder-plus-remainingMs shape.
    case 'BLITZ': {
      const payload = buildBlitzHostShow(room);
      return payload ? { ...payload, phase: 'BLITZ', remainingMs: remainingActiveTimerMs(room) } : null;
    }
    case 'BLITZ_REVEAL': {
      const payload = buildBlitzRevealHostShow(room);
      return payload ? { ...payload, phase: 'BLITZ_REVEAL' } : null;
    }
  }
}

// Authorises a vip:* event: the emitting socket must be a connected PLAYER
// (never the TV/host socket, which has no playerId at all) whose playerId
// is the room's current vipPlayerId. Logs and returns null on any failure
// so every vip:* handler gets identical, one-line rejection behaviour.
function getVipRoomForSocket(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  eventName: string,
): Room | null {
  const association = socketAssociationBySocketId.get(socket.id);
  if (!association || association.role !== 'player') {
    console.log(`rejected ${eventName} from ${socket.id}: not a player`);
    return null;
  }

  const room = getRoom(association.code);
  if (!room) {
    console.log(`rejected ${eventName} from ${socket.id}: room ${association.code} not found`);
    return null;
  }

  if (!isVip(room, association.playerId)) {
    console.log(`rejected ${eventName} from ${socket.id}: player ${association.playerId} is not VIP in room ${room.code}`);
    return null;
  }

  return room;
}

// Authorises a player:* event that ANY connected player may send (not just
// the VIP) - pause/resume is deliberately open to everyone, since anyone
// might need a break. Still requires a genuine connected player, never the
// TV/host socket.
function getPlayerRoomForSocket(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  eventName: string,
): { room: Room; playerId: string } | null {
  const association = socketAssociationBySocketId.get(socket.id);
  if (!association || association.role !== 'player') {
    console.log(`rejected ${eventName} from ${socket.id}: not a player`);
    return null;
  }

  const room = getRoom(association.code);
  if (!room) {
    console.log(`rejected ${eventName} from ${socket.id}: room ${association.code} not found`);
    return null;
  }

  return { room, playerId: association.playerId };
}

// Authorises a host:* event - the emitting socket must be the room's
// CURRENTLY attached TV/display (never a player), matching the same
// `hostSocketId === socket.id` check the disconnect handler uses to decide
// whether a display is still the live one.
function getHostRoomForSocket(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  eventName: string,
): Room | null {
  const association = socketAssociationBySocketId.get(socket.id);
  if (!association || association.role !== 'host') {
    console.log(`rejected ${eventName} from ${socket.id}: not a host`);
    return null;
  }

  const room = getRoom(association.code);
  if (!room || room.hostSocketId !== socket.id) {
    console.log(`rejected ${eventName} from ${socket.id}: not the room's current host display`);
    return null;
  }

  return room;
}

io.on('connection', (socket) => {
  console.log(`client connected: ${socket.id}`);

  socket.on(ClientEvents.PING, (payload) => {
    console.log(`received ${ClientEvents.PING} from ${socket.id}: sentAt=${payload.sentAt}`);
    socket.emit(ServerEvents.PONG, {
      sentAt: payload.sentAt,
      serverTime: Date.now(),
    });
  });

  socket.on(ClientEvents.CREATE_ROOM, () => {
    const room = createRoom(socket.id);
    socketAssociationBySocketId.set(socket.id, { role: 'host', code: room.code });
    socket.join(room.code);
    socket.emit(ServerEvents.ROOM_CREATED, { code: room.code });
    console.log(`room ${room.code} created by ${socket.id}`);
    console.log(`active room count: ${getActiveRoomCount()}`);
  });

  socket.on(ClientEvents.HOST_REJOIN, (payload) => {
    const { code } = payload;
    const room = getRoom(code);
    if (!room) {
      socket.emit(ServerEvents.ERROR, { message: `room ${code} not found` });
      console.log(`rejected ${ClientEvents.HOST_REJOIN} from ${socket.id}: room ${code} not found`);
      return;
    }

    attachHostDisplay(room, socket.id);
    socketAssociationBySocketId.set(socket.id, { role: 'host', code: room.code });
    socket.join(room.code);
    socket.emit(ServerEvents.ROOM_CREATED, { code: room.code });

    const syncPayload = buildStateSyncForHost(room);
    if (syncPayload) {
      socket.emit(ServerEvents.STATE_SYNC, syncPayload);
    }
    // Crowd mood (Task 35) - sent right alongside state:sync so a reattaching
    // TV lands on the right mood instead of defaulting to 'calm' until the
    // next transition.
    socket.emit(ServerEvents.CROWD_MOOD, { mood: room.crowdMood });

    console.log(`room ${room.code} host display reattached by ${socket.id} (phase=${room.phase})`);
  });

  // A read-only lookup for the join flow's avatar step - lets it grey out
  // already-taken creatures BEFORE the player actually attempts to join.
  // Doesn't join the socket to the room or touch any state; player:join
  // remains the sole authority (this is a best-effort UI hint only, since
  // another player could still claim the same avatar in between).
  socket.on(ClientEvents.ROOM_PEEK, (payload) => {
    const { code } = payload;
    const room = getRoom(code);
    if (!room) {
      socket.emit(ServerEvents.ROOM_PEEK_RESULT, { code, found: false, takenAvatarIds: [] });
      return;
    }
    const takenAvatarIds = Array.from(new Set(Array.from(room.players.values()).map((player) => player.avatarId)));
    socket.emit(ServerEvents.ROOM_PEEK_RESULT, { code, found: true, takenAvatarIds });
  });

  socket.on(ClientEvents.PLAYER_JOIN, (payload) => {
    const { code, name, playerId, avatarId } = payload;

    const room = getRoom(code);
    if (!room) {
      socket.emit(ServerEvents.JOIN_REJECTED, { reason: 'ROOM_NOT_FOUND' });
      return;
    }

    if (!isValidPlayerName(name)) {
      socket.emit(ServerEvents.JOIN_REJECTED, { reason: 'INVALID_NAME' });
      return;
    }

    // Same playerId already in this room -> reconnect, not a new join. The
    // original name AND avatar are both kept - whatever the client resubmits
    // for either (its picker always re-runs on a fresh page load) is
    // discarded in favour of what's already on record, and this bypasses
    // ROOM_FULL / AVATAR_TAKEN entirely: the player already occupies a seat
    // and can't clash with themselves.
    const existingPlayer = getPlayer(code, playerId);
    if (existingPlayer) {
      existingPlayer.socketId = socket.id;
      existingPlayer.connected = true;
      // Only matters if VIP had gone vacant (everyone left, then this
      // player was first back) - a no-op if VIP is already held, so a
      // former VIP reconnecting after someone else took over does NOT
      // reclaim it here.
      claimVipIfVacant(room, existingPlayer);
      refreshRoomTtl(room); // cancels a pending empty-room deletion, if any
      socketAssociationBySocketId.set(socket.id, { role: 'player', code, playerId });
      socket.join(code);
      socket.emit(ServerEvents.PLAYER_JOINED, {
        playerId,
        name: existingPlayer.name,
        code,
        avatarId: existingPlayer.avatarId,
        isPresetName: existingPlayer.isPresetName,
      });
      console.log(`player ${existingPlayer.name} reconnected to room ${code}`);
      broadcastLobbyUpdate(code);
      if (room.phase !== 'LOBBY') {
        const syncPayload = buildStateSyncForPlayer(room, playerId);
        if (syncPayload) {
          socket.emit(ServerEvents.STATE_SYNC, syncPayload);
        }
      }
      // A reconnect mid-STEAL adds a name back to the thief's target list -
      // re-send it, so they can rob someone who just walked back in.
      if (room.phase === 'STEAL' && room.steal && !room.steal.resolved) {
        const thief = room.players.get(room.steal.thiefPlayerId);
        const thiefPayload = thief?.connected ? buildStealPlayerPayload(room, thief.playerId) : null;
        if (thief && thiefPayload) {
          io.to(thief.socketId).emit(ServerEvents.STEAL_SHOW, thiefPayload);
        }
      }
      return;
    }

    if (isRoomFull(room)) {
      socket.emit(ServerEvents.JOIN_REJECTED, { reason: 'ROOM_FULL' });
      return;
    }

    if (!isValidAvatarId(avatarId)) {
      socket.emit(ServerEvents.JOIN_REJECTED, { reason: 'INVALID_AVATAR' });
      return;
    }

    // Strict uniqueness UNLESS the whole available pool is already claimed
    // (e.g. an 8th player joining while only 7 avatar images exist yet) -
    // then a duplicate is allowed rather than blocking the join. See
    // allAvailableAvatarsTaken's doc comment in rooms.ts.
    if (isAvatarTaken(room, avatarId) && !allAvailableAvatarsTaken(room)) {
      socket.emit(ServerEvents.JOIN_REJECTED, { reason: 'AVATAR_TAKEN' });
      return;
    }

    const trimmedName = normalizePlayerName(name);
    const isPresetName = (PRESET_NAMES as readonly string[]).includes(trimmedName);
    const player: Player = {
      playerId,
      name: trimmedName,
      socketId: socket.id,
      connected: true,
      score: 0,
      isVip: false,
      avatarId,
      isPresetName,
    };
    addPlayer(code, player);
    // The first player to ever join a room becomes VIP; a no-op otherwise.
    claimVipIfVacant(room, player);
    refreshRoomTtl(room); // cancels a pending empty-room deletion, if any
    socketAssociationBySocketId.set(socket.id, { role: 'player', code, playerId });
    socket.join(code);
    socket.emit(ServerEvents.PLAYER_JOINED, { playerId, name: trimmedName, code, avatarId, isPresetName });
    console.log(`player ${trimmedName} (${playerId}) joined room ${code} as ${avatarId}`);
    broadcastLobbyUpdate(code);
    if (room.phase !== 'LOBBY') {
      const syncPayload = buildStateSyncForPlayer(room, playerId);
      if (syncPayload) {
        socket.emit(ServerEvents.STATE_SYNC, syncPayload);
      }
    }
  });

  socket.on(ClientEvents.VIP_START_GAME, () => {
    const room = getVipRoomForSocket(socket, ClientEvents.VIP_START_GAME);
    if (!room) {
      return;
    }

    // Task 57 - the room's CURRENTLY selected mode's own minimum (mirrors
    // buildLobbyUpdate's canStart, which is what the lobby's start button
    // is actually disabled on) - never the flat MIN_PLAYERS floor, so a
    // client bug that somehow got past the disabled button still can't
    // start 'draw' with 2 players.
    const requiredPlayers = modeForRoom(room).minPlayers;
    const connectedCount = Array.from(room.players.values()).filter((player) => player.connected).length;
    if (connectedCount < requiredPlayers) {
      console.log(
        `rejected ${ClientEvents.VIP_START_GAME} for room ${room.code}: only ${connectedCount} connected players, mode '${room.mode}' needs ${requiredPlayers}`,
      );
      return;
    }

    if (room.phase !== 'LOBBY') {
      console.log(`rejected ${ClientEvents.VIP_START_GAME} for room ${room.code}: phase is ${room.phase}, not LOBBY`);
      return;
    }

    // Structurally unreachable today (pause requires QUESTION/REVEAL/
    // STEAL, this requires LOBBY - the two can never overlap) - kept
    // explicit anyway so the intent doesn't silently depend on that.
    if (room.paused) {
      console.log(`rejected ${ClientEvents.VIP_START_GAME} for room ${room.code}: game is paused`);
      return;
    }

    buildRoomQuestions(room);
    room.currentQuestionIndex = 0;
    // Sets the stage, the phase and emits phase:changed itself - stage 1
    // happens not to use power-ups today, but routing even the first question
    // through the one gate keeps that a property of the stage table rather
    // than an assumption spread across callers.
    // Task 52 - through the MODE, so this handler never has to know which
    // phase a game opens on. For 'quiz' this is still enterQuestionOrPowerUp.
    modeForRoom(room).start(room);
  });

  socket.on(ClientEvents.VIP_UPDATE_SETTINGS, (payload) => {
    const room = getVipRoomForSocket(socket, ClientEvents.VIP_UPDATE_SETTINGS);
    if (!room) {
      return;
    }

    if (room.phase !== 'LOBBY') {
      console.log(
        `rejected ${ClientEvents.VIP_UPDATE_SETTINGS} for room ${room.code}: phase is ${room.phase}, not LOBBY - settings are locked once a game starts`,
      );
      return;
    }

    // Structurally unreachable today (same reasoning as vip:start_game
    // above) - kept explicit for the same reason.
    if (room.paused) {
      console.log(`rejected ${ClientEvents.VIP_UPDATE_SETTINGS} for room ${room.code}: game is paused`);
      return;
    }

    // updateRoomSettings validates every field against its allowed option
    // list itself, silently ignoring anything invalid - never trust the
    // client. Always broadcast the resulting settings, even if nothing in
    // this particular payload was valid, so the room stays in sync.
    const updated = updateRoomSettings(room, payload);
    const settingsPayload: SettingsUpdatedPayload = updated;
    io.to(room.code).emit(ServerEvents.SETTINGS_UPDATED, settingsPayload);
    console.log(`room ${room.code} settings updated: ${JSON.stringify(updated)}`);
  });

  // Task 57 - picks WHICH game the room runs, LOBBY-only (same guard as
  // vip:update_settings) so room.mode is set before a game starts and never
  // touched again once it's running - modeForRoom(room) is read constantly
  // from the moment start() is called on, and letting it change under a
  // live game would be actively dangerous, not just confusing.
  socket.on(ClientEvents.VIP_SET_MODE, (payload) => {
    const room = getVipRoomForSocket(socket, ClientEvents.VIP_SET_MODE);
    if (!room) {
      return;
    }

    if (room.phase !== 'LOBBY') {
      console.log(
        `rejected ${ClientEvents.VIP_SET_MODE} for room ${room.code}: phase is ${room.phase}, not LOBBY - mode is locked once a game starts`,
      );
      return;
    }

    // Never trust the client - only an id the registry actually knows.
    const known = listGameModeOptions().some((option) => option.id === payload.mode);
    if (!known) {
      console.log(`rejected ${ClientEvents.VIP_SET_MODE} for room ${room.code}: unknown mode '${payload.mode}'`);
      return;
    }

    room.mode = payload.mode;
    console.log(`room ${room.code} mode set to '${room.mode}'`);
    broadcastLobbyUpdate(room.code);
  });

  socket.on(ClientEvents.SUBMIT_ANSWER, (payload) => {
    const association = socketAssociationBySocketId.get(socket.id);
    if (!association || association.role !== 'player') {
      console.log(`rejected ${ClientEvents.SUBMIT_ANSWER} from ${socket.id}: not a player`);
      return;
    }

    const room = getRoom(association.code);
    if (!room) {
      console.log(`rejected ${ClientEvents.SUBMIT_ANSWER} from ${socket.id}: room ${association.code} not found`);
      return;
    }

    if (room.phase !== 'QUESTION') {
      console.log(`rejected ${ClientEvents.SUBMIT_ANSWER} for room ${room.code}: phase is ${room.phase}, not QUESTION`);
      return;
    }

    if (room.paused) {
      console.log(`rejected ${ClientEvents.SUBMIT_ANSWER} for room ${room.code}: game is paused`);
      return;
    }

    const { choice } = payload;
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) {
      console.log(`rejected ${ClientEvents.SUBMIT_ANSWER} from ${socket.id}: invalid choice ${choice}`);
      return;
    }

    const { playerId } = association;
    if (room.answers.has(playerId)) {
      console.log(`rejected ${ClientEvents.SUBMIT_ANSWER} from player ${playerId}: already answered this question`);
      return;
    }

    // Sabotage (Task 28b): ice is enforced HERE, not just by greying the
    // phone's buttons - a client that ignores the freeze still gets nothing
    // recorded. No ack is sent back: the phone knows how long it has left.
    if (isIced(room, playerId)) {
      console.log(`rejected ${ClientEvents.SUBMIT_ANSWER} from player ${playerId}: iced by sabotage`);
      return;
    }

    // Server clock only - a client-supplied timestamp can never be trusted.
    const timeMs = Date.now() - room.questionStartedAt;
    // Sabotage (Task 28c): `choice` is a SLOT number on the phone that sent
    // it, which for a shuffled victim is not the option number it names. It's
    // de-permuted here, once, at the edge - scoring, the reveal and the answer
    // counts all speak canonical indices and never learn a shuffle happened.
    // The ack echoes the slot they pressed, since that's what their UI marks.
    const canonicalChoice = toCanonicalChoice(room, playerId, choice);
    room.answers.set(playerId, { choice: canonicalChoice, timeMs });
    socket.emit(ServerEvents.ANSWER_ACCEPTED, { choice });

    const connectedPlayers = getConnectedPlayers(room);
    const progressPayload: AnswerProgressPayload = {
      answered: room.answers.size,
      total: connectedPlayers.length,
      answeredPlayerIds: Array.from(room.answers.keys()),
    };
    if (room.hostSocketId) {
      io.to(room.hostSocketId).emit(ServerEvents.ANSWER_PROGRESS, progressPayload);
    }

    console.log(`player ${playerId} answered question ${room.currentQuestionIndex + 1} in room ${room.code}`);

    if (haveAllConnectedPlayersAnswered(room)) {
      endQuestion(room.code);
    }
  });

  // Power-up (Task 30a): the PLAYER picks the effect here - the server never
  // does, and rank-based comeback weighting is not involved. Silent from here
  // on: the ack goes back to the caster alone, the host learns only that one
  // more phone has committed, and nobody learns what or at whom until it
  // lands on the next question.
  socket.on(ClientEvents.POWER_UP_CHOOSE, (payload) => {
    const result = getPlayerRoomForSocket(socket, ClientEvents.POWER_UP_CHOOSE);
    if (!result) {
      return;
    }
    const { room, playerId } = result;

    if (room.phase !== 'POWER_UP') {
      console.log(`rejected ${ClientEvents.POWER_UP_CHOOSE} for room ${room.code}: phase is ${room.phase}, not POWER_UP`);
      return;
    }

    if (room.paused) {
      console.log(`rejected ${ClientEvents.POWER_UP_CHOOSE} for room ${room.code}: game is paused`);
      return;
    }

    // One power-up per player for this phase - and a locked-in choice, since
    // "all connected players have chosen" is what ends the phase early.
    if (room.powerUpChoices.has(playerId)) {
      console.log(`rejected ${ClientEvents.POWER_UP_CHOOSE} from player ${playerId}: already chose this phase`);
      return;
    }

    const { effect, targetPlayerId } = payload;
    if (!isPowerUpEffect(effect)) {
      console.log(`rejected ${ClientEvents.POWER_UP_CHOOSE} from player ${playerId}: invalid effect ${String(effect)}`);
      return;
    }

    if (targetPlayerId === playerId) {
      console.log(`rejected ${ClientEvents.POWER_UP_CHOOSE} from player ${playerId}: cannot target self`);
      return;
    }

    const chooser = room.players.get(playerId);
    const target = room.players.get(targetPlayerId);
    if (!chooser) {
      return;
    }
    if (!target || !target.connected) {
      console.log(
        `rejected ${ClientEvents.POWER_UP_CHOOSE} from player ${playerId}: invalid or disconnected target ${targetPlayerId}`,
      );
      return;
    }

    room.powerUpChoices.set(playerId, {
      casterPlayerId: playerId,
      casterName: chooser.name,
      targetPlayerId,
      targetName: target.name,
      effect,
    });

    const acceptedPayload: PowerUpChoiceAcceptedPayload = { effect, targetPlayerId };
    socket.emit(ServerEvents.POWER_UP_CHOICE_ACCEPTED, acceptedPayload);
    console.log(`player ${playerId} chose power-up in room ${room.code} (hidden until it lands)`);

    if (haveAllConnectedPlayersChosenPowerUp(room)) {
      endPowerUp(room.code);
    }
  });

  // Steal (Task 32): only ONE socket in the room may send this - the thief's,
  // which the server decided at REVEAL from the fastest correct answer. Every
  // other phone is a spectator and is rejected here even if it forges the
  // event, since `room.steal.thiefPlayerId` is the only thing consulted.
  socket.on(ClientEvents.STEAL_CHOOSE, (payload) => {
    const result = getPlayerRoomForSocket(socket, ClientEvents.STEAL_CHOOSE);
    if (!result) {
      return;
    }
    const { room, playerId } = result;

    if (room.phase !== 'STEAL' || !room.steal) {
      console.log(`rejected ${ClientEvents.STEAL_CHOOSE} for room ${room.code}: phase is ${room.phase}, not STEAL`);
      return;
    }

    if (room.paused) {
      console.log(`rejected ${ClientEvents.STEAL_CHOOSE} for room ${room.code}: game is paused`);
      return;
    }

    if (room.steal.thiefPlayerId !== playerId) {
      console.log(`rejected ${ClientEvents.STEAL_CHOOSE} from player ${playerId}: not the thief`);
      return;
    }

    // resolveSteal is itself one-shot (it checks `resolved`), but rejecting
    // here too keeps a duplicate tap out of the logs entirely.
    if (room.steal.resolved) {
      console.log(`rejected ${ClientEvents.STEAL_CHOOSE} from player ${playerId}: already resolved`);
      return;
    }

    const { targetPlayerId } = payload;
    if (targetPlayerId === playerId) {
      console.log(`rejected ${ClientEvents.STEAL_CHOOSE} from player ${playerId}: cannot steal from self`);
      return;
    }

    const target = room.players.get(targetPlayerId);
    if (!target || !target.connected) {
      console.log(
        `rejected ${ClientEvents.STEAL_CHOOSE} from player ${playerId}: invalid or disconnected target ${targetPlayerId}`,
      );
      return;
    }

    // Resolves immediately - the points move now, and the phase switches to
    // its announcement beat rather than sitting on the rest of the 8s.
    resolveSteal(room.code, targetPlayerId);
  });

  socket.on(ClientEvents.VIP_NEXT, () => {
    const room = getVipRoomForSocket(socket, ClientEvents.VIP_NEXT);
    if (!room) {
      return;
    }

    if (room.paused) {
      console.log(`rejected ${ClientEvents.VIP_NEXT} for room ${room.code}: game is paused - no skipping past a pause`);
      return;
    }

    // "vip:next" is a manual SKIP of whichever auto-advance is pending -
    // both advanceFrom* functions already clear the pending timer before
    // doing anything else, so calling them directly here is exactly "cancel
    // the timer and advance immediately".
    if (room.phase === 'REVEAL') {
      console.log(`room ${room.code} skipped past reveal (VIP)`);
      advanceFromReveal(room.code);
      return;
    }

    // A STEAL may only be skipped once it has RESOLVED - i.e. the VIP is
    // cutting the announcement short, never the thief's own thinking time
    // (which would silently rob them of the pick they're entitled to).
    if (room.phase === 'STEAL') {
      if (room.steal?.resolved) {
        console.log(`room ${room.code} skipped past steal announcement (VIP)`);
        advanceFromSteal(room.code);
      } else {
        console.log(`rejected ${ClientEvents.VIP_NEXT} for room ${room.code}: the thief is still choosing`);
      }
      return;
    }

    // Socrates (Task 39) - the phones stay on their reveal view (and so on
    // their "next" button) while he speaks, so this must skip the beat rather
    // than be a dead press. Same one-shot advanceFrom*, same discipline.
    // Task 138 - dispatched through the room's own MODE (continuationForActiveTimer),
    // not a hardcoded call to the quiz's advanceFromSocrates: draw and numeric
    // now enter this same wire-level phase under their own timer kinds
    // ('DRAW_SOCRATES'/'NUMERIC_SOCRATES'), each with its own advance-from-here.
    if (room.phase === 'SOCRATES') {
      console.log(`room ${room.code} skipped past Socrates (VIP)`);
      continuationForActiveTimer(room)?.();
      return;
    }

    // Task 127 - the trial's own reveal, same manual skip as REVEAL's above.
    // TRIAL_QUESTION is deliberately NOT skippable: the drain is measured
    // against that timer, so cutting it short would charge everyone who
    // hadn't answered yet for time they were never given.
    if (room.phase === 'TRIAL_REVEAL') {
      console.log(`room ${room.code} skipped past trial reveal (VIP)`);
      endTrialReveal(room.code);
      return;
    }

    console.log(
      `rejected ${ClientEvents.VIP_NEXT} for room ${room.code}: phase is ${room.phase}, not REVEAL, STEAL, SOCRATES or TRIAL_REVEAL`,
    );
  });

  // Task 42c - the host reports that a Socrates line's audio has genuinely
  // finished (or never played at all - see useGameAudio.playSocratesLine),
  // so the phase can end EXACTLY then instead of only on the fallback
  // ceiling timer (armed in startSocratesIfLineFired). Same one-shot
  // advanceFrom* as the VIP skip above - a late/duplicate ack after the
  // phase has already moved on is a harmless no-op via the phase check.
  socket.on(ClientEvents.SOCRATES_AUDIO_ENDED, () => {
    const room = getHostRoomForSocket(socket, ClientEvents.SOCRATES_AUDIO_ENDED);
    if (!room) {
      return;
    }
    if (room.phase !== 'SOCRATES') {
      console.log(`rejected ${ClientEvents.SOCRATES_AUDIO_ENDED} for room ${room.code}: phase is ${room.phase}, not SOCRATES`);
      return;
    }
    // A suspended AudioContext can't fire this - genuinely can't happen -
    // but reject it anyway, the same defensive stance as VIP_NEXT's own
    // pause check, rather than trust a client that shouldn't be able to.
    if (room.paused) {
      console.log(`rejected ${ClientEvents.SOCRATES_AUDIO_ENDED} for room ${room.code}: game is paused`);
      return;
    }
    console.log(`room ${room.code} Socrates audio ended - advancing`);
    // Task 138 - same mode-generic dispatch as the VIP skip above.
    continuationForActiveTimer(room)?.();
  });

  // Task 53 - dev-only sink for the /dev/draw harness. No room and no
  // player: it just checks the drawing is a plausible size and echoes back
  // what arrived, so the phone can show the real wire size. The eventual
  // drawing phase gets its own player:* event with the usual room/phase
  // authorisation - this one is NOT that, and touches no room state.
  socket.on(ClientEvents.DEV_SUBMIT_DRAWING, (payload) => {
    const imageDataUrl = payload?.imageDataUrl;
    if (typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) {
      console.log(`rejected ${ClientEvents.DEV_SUBMIT_DRAWING} from ${socket.id}: not an image data URL`);
      return;
    }
    if (imageDataUrl.length > DRAWING_MAX_BYTES) {
      console.log(`rejected ${ClientEvents.DEV_SUBMIT_DRAWING} from ${socket.id}: ${imageDataUrl.length} bytes exceeds ${DRAWING_MAX_BYTES}`);
      return;
    }

    const format = imageDataUrl.slice('data:'.length, imageDataUrl.indexOf(';'));
    console.log(`drawing from ${socket.id}: ${imageDataUrl.length} bytes (${format})`);
    socket.emit(ServerEvents.DEV_DRAWING_RECEIVED, { bytes: imageDataUrl.length, format });
  });

  // Task 67 - dev-only sink for the /dev/numeric review tool. No room and no
  // player, same as DEV_SUBMIT_DRAWING above: it just hands back the raw
  // question pool (text/category/answer only - max/sliderStep/validity are
  // for the tool itself to derive, see DevNumericQuestionsPayload's comment).
  socket.on(ClientEvents.DEV_GET_NUMERIC_QUESTIONS, () => {
    socket.emit(ServerEvents.DEV_NUMERIC_QUESTIONS, {
      questions: NUMERIC_QUESTIONS.map((question) => ({
        text: question.text,
        category: question.category,
        answer: question.answer,
      })),
    });
  });

  // Task 142 - dev-only sink for the /dev/voice review tool. No room and no
  // player, same as DEV_GET_NUMERIC_QUESTIONS above: it hands back every
  // Socrates line so it can be rated before an ElevenLabs batch.
  socket.on(ClientEvents.DEV_GET_VOICE_LINES, () => {
    socket.emit(ServerEvents.DEV_VOICE_LINES, { lines: collectVoiceLineEntries() });
  });

  // Task 56a - the real DRAW phase. All validation (phase, pause, size cap,
  // dealt-in, one-per-game) lives in submitDrawing itself, which also ends
  // the phase early once every connected player has submitted.
  socket.on(ClientEvents.DRAW_SUBMIT, (payload) => {
    const result = getPlayerRoomForSocket(socket, ClientEvents.DRAW_SUBMIT);
    if (!result) {
      return;
    }
    const { room, playerId } = result;
    if (!submitDrawing(room, playerId, payload?.image)) {
      console.log(`rejected ${ClientEvents.DRAW_SUBMIT} from player ${playerId} in room ${room.code}`);
    }
  });

  // The GUESS phase. submitGuess rejects the drawer's own guess server-side
  // (spec) along with every other validation, and ends the round early once
  // every connected non-drawer has guessed.
  socket.on(ClientEvents.DRAW_GUESS, (payload) => {
    const result = getPlayerRoomForSocket(socket, ClientEvents.DRAW_GUESS);
    if (!result) {
      return;
    }
    const { room, playerId } = result;
    if (!submitGuess(room, playerId, payload?.choice)) {
      console.log(`rejected ${ClientEvents.DRAW_GUESS} from player ${playerId} in room ${room.code}`);
    }
  });

  // Task 65 - the numeric-estimate mode. All validation (phase, pause,
  // clamping) lives in submitNumericAnswer itself, which also ends the
  // question early once every connected player has submitted.
  socket.on(ClientEvents.NUMERIC_SUBMIT, (payload) => {
    const result = getPlayerRoomForSocket(socket, ClientEvents.NUMERIC_SUBMIT);
    if (!result) {
      return;
    }
    const { room, playerId } = result;
    if (!submitNumericAnswer(room, playerId, payload?.value)) {
      console.log(`rejected ${ClientEvents.NUMERIC_SUBMIT} from player ${playerId} in room ${room.code}`);
    }
  });

  // Task 156 - the blitz mode. All validation (phase, pause, next-index
  // only, one swipe per statement) lives in submitBlitzSwipe itself, which
  // also ends the phase early once every connected player has swiped all K.
  socket.on(ClientEvents.BLITZ_SWIPE, (payload) => {
    const result = getPlayerRoomForSocket(socket, ClientEvents.BLITZ_SWIPE);
    if (!result) {
      return;
    }
    const { room, playerId } = result;
    if (!submitBlitzSwipe(room, playerId, payload?.index, payload?.answeredTrue)) {
      console.log(`rejected ${ClientEvents.BLITZ_SWIPE} from player ${playerId} in room ${room.code}`);
      // The phone advances optimistically (there is no per-swipe ack), so a
      // rejected swipe - typically one that raced a pause - would leave it
      // one statement ahead of what the server will accept for the rest of
      // the round. Re-send it its own blitz:show, whose answeredCount is the
      // same catch-up a state:sync uses, so it snaps back to the statement
      // the server is actually on. Null outside BLITZ, in which case there
      // is nothing to snap back to.
      const resync = buildBlitzPlayerShow(room, playerId);
      if (resync) {
        socket.emit(ServerEvents.BLITZ_SHOW, resync);
      }
    }
  });

  // Task 127 - Η Δίκη. Its own event rather than a second meaning for
  // SUBMIT_ANSWER (no sabotage, no shuffled order, and what is recorded is a
  // pause-aware elapsed figure). Every rule - phase, pause, valid choice,
  // being ON trial, one lock-in per question - lives in submitTrialAnswer,
  // which also ends the question early once everyone has locked in.
  socket.on(ClientEvents.TRIAL_SUBMIT, (payload) => {
    const result = getPlayerRoomForSocket(socket, ClientEvents.TRIAL_SUBMIT);
    if (!result) {
      return;
    }
    const { room, playerId } = result;
    if (!submitTrialAnswer(room, playerId, payload?.choice)) {
      console.log(`rejected ${ClientEvents.TRIAL_SUBMIT} from player ${playerId} in room ${room.code}`);
      return;
    }
    // Same ack the quiz question sends - the phone marks the button it
    // pressed, and learns nothing else until TRIAL_REVEAL.
    socket.emit(ServerEvents.ANSWER_ACCEPTED, { choice: payload.choice });
  });

  socket.on(ClientEvents.VIP_PLAY_AGAIN, () => {
    const room = getVipRoomForSocket(socket, ClientEvents.VIP_PLAY_AGAIN);
    if (!room) {
      return;
    }

    if (room.phase !== 'GAME_OVER') {
      console.log(`rejected ${ClientEvents.VIP_PLAY_AGAIN} for room ${room.code}: phase is ${room.phase}, not GAME_OVER`);
      return;
    }

    // Structurally unreachable today (same reasoning as vip:start_game) -
    // kept explicit for the same reason.
    if (room.paused) {
      console.log(`rejected ${ClientEvents.VIP_PLAY_AGAIN} for room ${room.code}: game is paused`);
      return;
    }

    resetRoomForNewGame(room);
    io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
    broadcastLobbyUpdate(room.code);
    console.log(`room ${room.code} reset for a new game`);
  });

  // Lets the VIP abandon an in-progress game (e.g. it was started before
  // everyone had joined) and go straight back to LOBBY - unlike
  // vip:play_again, this is reachable from QUESTION/REVEAL/STEAL, not
  // just GAME_OVER. Deliberately NOT blocked by `room.paused`: resetting
  // must work even mid-pause, and resetRoomForNewGame clears the pause
  // state itself so the fresh LOBBY is never left frozen.
  socket.on(ClientEvents.VIP_RESET_TO_LOBBY, () => {
    const room = getVipRoomForSocket(socket, ClientEvents.VIP_RESET_TO_LOBBY);
    if (!room) {
      return;
    }

    if (room.phase === 'LOBBY') {
      console.log(`rejected ${ClientEvents.VIP_RESET_TO_LOBBY} for room ${room.code}: already in LOBBY`);
      return;
    }

    resetRoomForNewGame(room);
    io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
    broadcastLobbyUpdate(room.code);
    console.log(`room ${room.code} reset to lobby by VIP`);
  });

  // Deliberately open to ANY connected player, not just the VIP - anyone
  // might need a break.
  socket.on(ClientEvents.GAME_PAUSE, () => {
    const result = getPlayerRoomForSocket(socket, ClientEvents.GAME_PAUSE);
    if (!result) {
      return;
    }
    const { room, playerId } = result;

    if (room.phase === 'LOBBY' || room.phase === 'GAME_OVER') {
      console.log(`rejected ${ClientEvents.GAME_PAUSE} for room ${room.code}: phase is ${room.phase}, nothing to pause`);
      return;
    }

    if (room.paused) {
      console.log(`rejected ${ClientEvents.GAME_PAUSE} for room ${room.code}: already paused`);
      return;
    }

    const player = room.players.get(playerId);
    if (!player) {
      return;
    }

    room.paused = true;
    room.pausedByName = player.name;
    room.pausedAt = Date.now();
    pauseActiveTimer(room);
    // Crowd mood (Task 35) - `paused` doesn't itself change the mood, but the
    // mid-QUESTION tension switch is a separate timer and must freeze too.
    pauseCrowdTensionTimer(room);

    const payload: PausedPayload = { byName: player.name };
    io.to(room.code).emit(ServerEvents.GAME_PAUSED, payload);
    console.log(`room ${room.code} paused by ${player.name}`);
  });

  socket.on(ClientEvents.GAME_RESUME, () => {
    const result = getPlayerRoomForSocket(socket, ClientEvents.GAME_RESUME);
    if (!result) {
      return;
    }
    const { room } = result;

    if (!room.paused) {
      console.log(`rejected ${ClientEvents.GAME_RESUME} for room ${room.code}: not paused`);
      return;
    }

    // Preserve real thinking time for the speed bonus - a pause must never
    // count toward how fast someone answered. Only meaningful mid-QUESTION,
    // but harmless to compute regardless (questionStartedAt goes unread
    // outside that phase anyway).
    const pausedDurationMs = room.pausedAt !== null ? Date.now() - room.pausedAt : 0;
    if (room.phase === 'QUESTION') {
      room.questionStartedAt += pausedDurationMs;
    }

    room.paused = false;
    room.pausedByName = null;
    room.pausedAt = null;

    const onFire = continuationForActiveTimer(room);
    if (onFire) {
      resumeActiveTimer(room, onFire);
    }
    resumeCrowdTensionTimer(room); // no-op if nothing armed it (outside a timed round)

    const remainingMs = remainingActiveTimerMs(room);
    const payload: ResumedPayload = { remainingMs };
    io.to(room.code).emit(ServerEvents.GAME_RESUMED, payload);
    console.log(`room ${room.code} resumed, remainingMs=${remainingMs}`);
  });

  socket.on('disconnect', () => {
    console.log(`client disconnected: ${socket.id}`);

    const association = socketAssociationBySocketId.get(socket.id);
    if (!association) {
      return;
    }
    socketAssociationBySocketId.delete(socket.id);

    if (association.role === 'host') {
      // The TV/display disconnecting must NEVER end the game - it might
      // just be asleep. Only detach if THIS socket is still the currently
      // attached display: a race where a newer host:rejoin already replaced
      // it (e.g. a fast refresh) must not clobber that fresher attachment.
      const room = getRoom(association.code);
      if (room && room.hostSocketId === socket.id) {
        detachHostDisplay(room);
        console.log(`room ${association.code} lost its host display (TV asleep/closed) - game continues running`);
      } else {
        console.log(
          `host socket ${socket.id} disconnected from room ${association.code} but had already been replaced - no-op`,
        );
      }
      return;
    }

    const player = getPlayer(association.code, association.playerId);
    if (player && player.socketId !== socket.id) {
      console.log(
        `player socket ${socket.id} disconnected from room ${association.code} but had already been replaced - no-op`,
      );
      return;
    }
    if (player) {
      player.connected = false;
      console.log(`player ${player.name} disconnected from room ${association.code}`);
      const room = getRoom(association.code);
      console.log(
        `room ${association.code} players: ${JSON.stringify(Array.from(room?.players.values() ?? []))}`,
      );

      // VIP migrates IMMEDIATELY on disconnect - no grace period, this is a
      // couch game and control moving to whoever's sitting next to them is
      // fine. Must happen before broadcastLobbyUpdate so the lobby payload
      // already reflects the new VIP.
      if (room && isVip(room, association.playerId)) {
        const newVip = migrateVipAwayFrom(room, association.playerId);
        if (newVip) {
          const vipChangedPayload: VipChangedPayload = { playerId: newVip.playerId, name: newVip.name };
          io.to(room.code).emit(ServerEvents.VIP_CHANGED, vipChangedPayload);
          console.log(`room ${room.code} VIP transferred to ${newVip.name} (${newVip.playerId})`);
        } else {
          console.log(`room ${room.code} has no connected players left - VIP vacant`);
        }
      }

      if (room) {
        refreshRoomTtl(room); // may arm the empty-room TTL if nobody's left at all
      }

      broadcastLobbyUpdate(association.code);

      // The player who just left might have been the only one still
      // unanswered - re-run the "everyone answered" check so the question
      // doesn't sit waiting on the timer for someone who's no longer here.
      if (room && room.phase === 'QUESTION' && haveAllConnectedPlayersAnswered(room)) {
        endQuestion(room.code);
      }

      // Same reasoning for the power-up phase: the player who just left might
      // have been the only one still deciding.
      if (room && room.phase === 'POWER_UP' && haveAllConnectedPlayersChosenPowerUp(room)) {
        endPowerUp(room.code);
      }

      // Steal (Task 32): once there is nobody left to rob, the picker has
      // nothing to offer - resolve to "nothing stolen" now rather than making
      // everyone sit out the rest of the 8s. The THIEF dropping is
      // deliberately NOT resolved early: a phone that blips is expected to
      // reconnect straight back into its own picker (state:sync re-derives
      // `youAreThief` from room state), and if it doesn't, the timer already
      // ends the phase with nothing stolen.
      if (room && room.phase === 'STEAL' && room.steal && !room.steal.resolved) {
        const thiefPlayerId = room.steal.thiefPlayerId;
        const victimsLeft = getConnectedPlayers(room).some((player) => player.playerId !== thiefPlayerId);
        if (!victimsLeft) {
          resolveSteal(room.code, null);
        }
      }

      // Task 56a - same reasoning as QUESTION/POWER_UP above: the player who
      // just left might have been the only one still drawing/guessing. Both
      // are no-ops when the room isn't in that phase (e.g. a quiz-mode room).
      if (room) {
        recheckDrawPhaseOnDisconnect(room);
        recheckGuessPhaseOnDisconnect(room);
      }

      // Task 65 - same reasoning: the player who just left might have been
      // the only one still deciding. A no-op outside NUMERIC_QUESTION.
      if (room) {
        recheckNumericPhaseOnDisconnect(room);
      }

      // Task 156 - same reasoning, for the blitz. A no-op outside BLITZ.
      if (room) {
        recheckBlitzPhaseOnDisconnect(room);
      }

      // Task 127 - same reasoning again, for the trial. A no-op outside
      // TRIAL_QUESTION. The player stays ON trial while disconnected (they
      // simply never lock in, and pay the full timer's drain at the reveal
      // like anyone who didn't answer) - dropping them from the trial would
      // hand a win to whoever had the better connection.
      if (room) {
        recheckTrialPhaseOnDisconnect(room);
      }
    }
  });
});

const PORT = Number(process.env.PORT) || 3001;
// In production, only Caddy (on the same machine) should ever reach this
// port directly - bind to loopback only. In dev, stay on all interfaces so
// a phone on the LAN can hit the dev server directly if needed.
const HOST = isProduction ? '127.0.0.1' : '0.0.0.0';

httpServer.listen(PORT, HOST, () => {
  console.log(`server listening on ${HOST}:${PORT} (${isProduction ? 'production' : 'development'})`);
});
