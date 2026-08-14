import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import {
  ClientEvents,
  ServerEvents,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@game/shared';
import { createRoom, deleteRoom, getActiveRoomCount } from './rooms.js';

const app = express();
app.use(cors({ origin: true }));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: true },
});

// socket.id -> room code, for the room a socket is currently hosting
const hostedRoomBySocketId = new Map<string, string>();

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
    hostedRoomBySocketId.set(socket.id, room.code);
    socket.join(room.code);
    socket.emit(ServerEvents.ROOM_CREATED, { code: room.code });
    console.log(`room ${room.code} created by ${socket.id}`);
    console.log(`active room count: ${getActiveRoomCount()}`);
  });

  socket.on('disconnect', () => {
    console.log(`client disconnected: ${socket.id}`);

    const hostedCode = hostedRoomBySocketId.get(socket.id);
    if (hostedCode !== undefined) {
      hostedRoomBySocketId.delete(socket.id);
      deleteRoom(hostedCode);
      console.log(`room ${hostedCode} closed (host left)`);
      console.log(`active room count: ${getActiveRoomCount()}`);
    }
  });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`server listening on port ${PORT}`);
});
