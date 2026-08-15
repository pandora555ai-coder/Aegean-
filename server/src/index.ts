import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import {
  ClientEvents,
  MIN_PLAYERS,
  ServerEvents,
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
  getPlayer,
  getRoom,
  isNameTaken,
  isRoomFull,
  isValidPlayerName,
  normalizePlayerName,
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

    const question = room.questions[room.currentQuestionIndex];
    const totalQuestions = room.questions.length;

    const hostPayload: QuestionShowHostPayload = {
      questionIndex: room.currentQuestionIndex,
      totalQuestions,
      question: question.question,
      options: question.options,
      category: question.category,
    };
    socket.emit(ServerEvents.QUESTION_SHOW, hostPayload);

    const playerPayload: QuestionShowPlayerPayload = {
      questionIndex: room.currentQuestionIndex,
      totalQuestions,
      options: question.options,
      category: question.category,
    };
    for (const player of room.players.values()) {
      if (player.connected) {
        io.to(player.socketId).emit(ServerEvents.QUESTION_SHOW, playerPayload);
      }
    }

    console.log(`room ${room.code} started — question 1/${totalQuestions}`);
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
