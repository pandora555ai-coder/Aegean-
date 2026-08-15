import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import {
  ClientEvents,
  ServerEvents,
  type ClientToServerEvents,
  type Player,
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
    }
  });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`server listening on port ${PORT}`);
});
