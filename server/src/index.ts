import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import type { Socket } from 'socket.io';
import {
  ClientEvents,
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
  type SabotageCastAcceptedPayload,
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
import { isValidAvatarId } from './avatars.js';
import {
  endQuestion,
  endPowerUp,
  enterQuestionOrPowerUp,
  advanceFromReveal,
  advanceFromScoreboard,
  advanceFromSteal,
  resolveSteal,
  continuationForActiveTimer,
} from './phases.js';
import {
  buildRevealHostPayload,
  buildRevealPlayerPayload,
  buildPowerUpHostPayload,
  buildPowerUpPlayerPayload,
  buildPowerUpProgress,
  buildStealHostPayload,
  buildStealPlayerPayload,
  buildScoreboard,
  buildGameOver,
} from './payloads.js';
import { isPowerUpEffect } from './powerups.js';
import {
  activeSabotagesFor,
  isIced,
  optionsForPlayer,
  pickSabotageEffect,
  toCanonicalChoice,
  toDisplayChoice,
} from './sabotage.js';
import { initRealtime, io, httpServer } from './realtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isProduction = process.env.NODE_ENV === 'production';
const PRODUCTION_ORIGIN = 'https://demboyz11.duckdns.org';
// Permissive in dev (any origin - useful for testing from a phone on the
// LAN against the Vite dev server); locked to the real domain in prod.
const corsOptions = { origin: isProduction ? PRODUCTION_ORIGIN : true };

const app = express();
app.use(cors(corsOptions));

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
  const canStart = players.filter((player) => player.connected).length >= MIN_PLAYERS;

  return { code, players, canStart, settings: room.settings };
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
    // Steal (Task 32): the phase's REMAINING time (frozen if the room is
    // paused, since it comes from the shared timer helper) plus - the bit that
    // matters on a reconnect - whether THIS phone is the thief, and whether it
    // already picked. Both read live from room state, never from the client.
    case 'STEAL': {
      const payload = buildStealPlayerPayload(room, playerId);
      return payload ? { ...payload, phase: 'STEAL', remainingMs: remainingActiveTimerMs(room) } : null;
    }
    case 'SCOREBOARD':
      return { ...buildScoreboard(room), phase: 'SCOREBOARD' };
    case 'GAME_OVER':
      return { ...buildGameOver(room), phase: 'GAME_OVER' };
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
        gmIntro: null,
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
    case 'SCOREBOARD':
      return { ...buildScoreboard(room), phase: 'SCOREBOARD' };
    case 'GAME_OVER':
      return { ...buildGameOver(room), phase: 'GAME_OVER' };
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
      // A reconnect mid-POWER_UP changes the denominator the TV is showing
      // (and the one the phase is waiting on), so re-tick the host.
      if (room.phase === 'POWER_UP' && room.hostSocketId) {
        io.to(room.hostSocketId).emit(ServerEvents.POWER_UP_PROGRESS, buildPowerUpProgress(room));
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

    const connectedCount = Array.from(room.players.values()).filter((player) => player.connected).length;
    if (connectedCount < MIN_PLAYERS) {
      console.log(
        `rejected ${ClientEvents.VIP_START_GAME} for room ${room.code}: only ${connectedCount} connected players`,
      );
      return;
    }

    if (room.phase !== 'LOBBY') {
      console.log(`rejected ${ClientEvents.VIP_START_GAME} for room ${room.code}: phase is ${room.phase}, not LOBBY`);
      return;
    }

    // Structurally unreachable today (pause requires QUESTION/REVEAL/
    // SCOREBOARD, this requires LOBBY - the two can never overlap) - kept
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
    enterQuestionOrPowerUp(room);
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

  // Sabotage (Task 28a): cast is completely silent from here - no ack
  // reveals the effect, no broadcast tells anyone else a cast even
  // happened. It only surfaces later, publicly, when this question's
  // REVEAL announces it (see endQuestion in phases.ts).
  socket.on(ClientEvents.SABOTAGE_CAST, (payload) => {
    const association = socketAssociationBySocketId.get(socket.id);
    if (!association || association.role !== 'player') {
      console.log(`rejected ${ClientEvents.SABOTAGE_CAST} from ${socket.id}: not a player`);
      return;
    }

    const room = getRoom(association.code);
    if (!room) {
      console.log(`rejected ${ClientEvents.SABOTAGE_CAST} from ${socket.id}: room ${association.code} not found`);
      return;
    }

    if (room.phase !== 'QUESTION') {
      console.log(`rejected ${ClientEvents.SABOTAGE_CAST} for room ${room.code}: phase is ${room.phase}, not QUESTION`);
      return;
    }

    if (room.paused) {
      console.log(`rejected ${ClientEvents.SABOTAGE_CAST} for room ${room.code}: game is paused`);
      return;
    }

    const { playerId } = association;
    if (room.sabotageCastUsedBy.has(playerId)) {
      console.log(`rejected ${ClientEvents.SABOTAGE_CAST} from player ${playerId}: already used their one cast this game`);
      return;
    }

    const caster = room.players.get(playerId);
    if (!caster) {
      return;
    }

    const { targetPlayerId } = payload;
    if (targetPlayerId === playerId) {
      console.log(`rejected ${ClientEvents.SABOTAGE_CAST} from player ${playerId}: cannot target self`);
      return;
    }

    const target = room.players.get(targetPlayerId);
    if (!target || !target.connected) {
      console.log(`rejected ${ClientEvents.SABOTAGE_CAST} from player ${playerId}: invalid or disconnected target ${targetPlayerId}`);
      return;
    }

    const effect = pickSabotageEffect(room, playerId);
    room.sabotageCastUsedBy.add(playerId);
    room.hiddenSabotageCasts.set(playerId, {
      casterPlayerId: playerId,
      casterName: caster.name,
      targetPlayerId,
      targetName: target.name,
      effect,
    });

    const acceptedPayload: SabotageCastAcceptedPayload = {};
    socket.emit(ServerEvents.SABOTAGE_CAST_ACCEPTED, acceptedPayload);
    console.log(`player ${playerId} cast a sabotage on ${targetPlayerId} in room ${room.code} (hidden until reveal)`);
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
    if (room.hostSocketId) {
      io.to(room.hostSocketId).emit(ServerEvents.POWER_UP_PROGRESS, buildPowerUpProgress(room));
    }
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

    if (room.phase === 'SCOREBOARD') {
      console.log(`room ${room.code} skipped past scoreboard (VIP)`);
      advanceFromScoreboard(room.code);
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

    console.log(`rejected ${ClientEvents.VIP_NEXT} for room ${room.code}: phase is ${room.phase}, not REVEAL or SCOREBOARD`);
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
  // vip:play_again, this is reachable from QUESTION/REVEAL/SCOREBOARD, not
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
      if (room && room.phase === 'POWER_UP') {
        if (room.hostSocketId) {
          io.to(room.hostSocketId).emit(ServerEvents.POWER_UP_PROGRESS, buildPowerUpProgress(room));
        }
        if (haveAllConnectedPlayersChosenPowerUp(room)) {
          endPowerUp(room.code);
        }
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
