import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import {
  ClientEvents,
  MIN_PLAYERS,
  QUESTION_TIME_MS,
  ServerEvents,
  type AnswerProgressPayload,
  type ClientToServerEvents,
  type LobbyPlayer,
  type LobbyUpdatePayload,
  type Player,
  type QuestionShowHostPayload,
  type QuestionShowPlayerPayload,
  type RoomCode,
  type ServerToClientEvents,
} from '@game/shared';
import {
  addPlayer,
  createRoom,
  deleteRoom,
  getActiveRoomCount,
  getConnectedPlayers,
  getPlayer,
  getRoom,
  isNameTaken,
  isRoomFull,
  isValidPlayerName,
  normalizePlayerName,
  type Room,
} from './rooms.js';

const app = express();
app.use(cors({ origin: true }));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: true },
});

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
  }));
  const canStart = players.filter((player) => player.connected).length >= MIN_PLAYERS;

  return { code, players, canStart };
}

function broadcastLobbyUpdate(code: RoomCode): void {
  const payload = buildLobbyUpdate(code);
  if (payload) {
    io.to(code).emit(ServerEvents.LOBBY_UPDATE, payload);
  }
}

function startQuestion(room: Room): void {
  room.answers.clear();
  room.questionStartedAt = Date.now();
  if (room.questionTimer) {
    clearTimeout(room.questionTimer);
  }
  room.questionTimer = setTimeout(() => endQuestion(room.code), QUESTION_TIME_MS);

  const question = room.questions[room.currentQuestionIndex];
  const totalQuestions = room.questions.length;

  const hostPayload: QuestionShowHostPayload = {
    questionIndex: room.currentQuestionIndex,
    totalQuestions,
    question: question.question,
    options: question.options,
    category: question.category,
  };
  io.to(room.hostSocketId).emit(ServerEvents.QUESTION_SHOW, hostPayload);

  const playerPayload: QuestionShowPlayerPayload = {
    questionIndex: room.currentQuestionIndex,
    totalQuestions,
    options: question.options,
    category: question.category,
  };
  for (const player of getConnectedPlayers(room)) {
    io.to(player.socketId).emit(ServerEvents.QUESTION_SHOW, playerPayload);
  }

  console.log(`room ${room.code} started — question ${room.currentQuestionIndex + 1}/${totalQuestions}`);
}

// Ends the current question exactly once - guarded by the phase check, so
// whichever of (all connected players answered) / (timer fired) happens
// first wins, and the timer is always cleared so it can never fire twice.
function endQuestion(code: RoomCode): void {
  const room = getRoom(code);
  if (!room || room.phase !== 'QUESTION') {
    return;
  }

  if (room.questionTimer) {
    clearTimeout(room.questionTimer);
    room.questionTimer = null;
  }

  room.phase = 'REVEAL';
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });

  const collectedAnswers = Array.from(room.answers.entries()).map(([playerId, answer]) => ({
    playerId,
    choice: answer.choice,
    timeMs: answer.timeMs,
  }));
  console.log(
    `room ${room.code} question ${room.currentQuestionIndex + 1} ended — answers: ${JSON.stringify(collectedAnswers)}`,
  );
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

  socket.on(ClientEvents.PLAYER_JOIN, (payload) => {
    const { code, name, playerId } = payload;

    const room = getRoom(code);
    if (!room) {
      socket.emit(ServerEvents.JOIN_REJECTED, { reason: 'ROOM_NOT_FOUND' });
      return;
    }

    if (!isValidPlayerName(name)) {
      socket.emit(ServerEvents.JOIN_REJECTED, { reason: 'INVALID_NAME' });
      return;
    }

    // Same playerId already in this room -> reconnect, not a new join.
    // The original name is kept, and this bypasses ROOM_FULL / NAME_TAKEN:
    // the player already occupies a seat and can't clash with their own name.
    const existingPlayer = getPlayer(code, playerId);
    if (existingPlayer) {
      existingPlayer.socketId = socket.id;
      existingPlayer.connected = true;
      socketAssociationBySocketId.set(socket.id, { role: 'player', code, playerId });
      socket.join(code);
      socket.emit(ServerEvents.PLAYER_JOINED, { playerId, name: existingPlayer.name, code });
      console.log(`player ${existingPlayer.name} reconnected to room ${code}`);
      broadcastLobbyUpdate(code);
      return;
    }

    if (isRoomFull(room)) {
      socket.emit(ServerEvents.JOIN_REJECTED, { reason: 'ROOM_FULL' });
      return;
    }

    if (isNameTaken(room, name)) {
      socket.emit(ServerEvents.JOIN_REJECTED, { reason: 'NAME_TAKEN' });
      return;
    }

    const trimmedName = normalizePlayerName(name);
    const player: Player = { playerId, name: trimmedName, socketId: socket.id, connected: true };
    addPlayer(code, player);
    socketAssociationBySocketId.set(socket.id, { role: 'player', code, playerId });
    socket.join(code);
    socket.emit(ServerEvents.PLAYER_JOINED, { playerId, name: trimmedName, code });
    console.log(`player ${trimmedName} (${playerId}) joined room ${code}`);
    broadcastLobbyUpdate(code);
  });

  socket.on(ClientEvents.START_GAME, () => {
    const association = socketAssociationBySocketId.get(socket.id);
    if (!association || association.role !== 'host') {
      console.log(`rejected ${ClientEvents.START_GAME} from ${socket.id}: not a host`);
      return;
    }

    const room = getRoom(association.code);
    if (!room) {
      console.log(`rejected ${ClientEvents.START_GAME} from ${socket.id}: room ${association.code} not found`);
      return;
    }

    const connectedCount = Array.from(room.players.values()).filter((player) => player.connected).length;
    if (connectedCount < MIN_PLAYERS) {
      console.log(
        `rejected ${ClientEvents.START_GAME} for room ${room.code}: only ${connectedCount} connected players`,
      );
      return;
    }

    if (room.phase !== 'LOBBY') {
      console.log(`rejected ${ClientEvents.START_GAME} for room ${room.code}: phase is ${room.phase}, not LOBBY`);
      return;
    }

    room.phase = 'QUESTION';
    room.currentQuestionIndex = 0;
    io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
    startQuestion(room);
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

    // Server clock only - a client-supplied timestamp can never be trusted.
    const timeMs = Date.now() - room.questionStartedAt;
    room.answers.set(playerId, { choice, timeMs });
    socket.emit(ServerEvents.ANSWER_ACCEPTED, { choice });

    const connectedPlayers = getConnectedPlayers(room);
    const progressPayload: AnswerProgressPayload = {
      answered: room.answers.size,
      total: connectedPlayers.length,
      answeredPlayerIds: Array.from(room.answers.keys()),
    };
    io.to(room.hostSocketId).emit(ServerEvents.ANSWER_PROGRESS, progressPayload);

    console.log(`player ${playerId} answered question ${room.currentQuestionIndex + 1} in room ${room.code}`);

    if (room.answers.size >= connectedPlayers.length) {
      endQuestion(room.code);
    }
  });

  socket.on('disconnect', () => {
    console.log(`client disconnected: ${socket.id}`);

    const association = socketAssociationBySocketId.get(socket.id);
    if (!association) {
      return;
    }
    socketAssociationBySocketId.delete(socket.id);

    if (association.role === 'host') {
      deleteRoom(association.code);
      console.log(`room ${association.code} closed (host left)`);
      console.log(`active room count: ${getActiveRoomCount()}`);
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
      broadcastLobbyUpdate(association.code);
    }
  });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`server listening on port ${PORT}`);
});
