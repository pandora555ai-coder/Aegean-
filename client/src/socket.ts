import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@game/shared';
import { SERVER_URL } from './config';

// socket.io-client treats an empty string as a literal (broken) URL, not
// "same origin" - passing undefined is what makes it connect to wherever
// the page itself was served from.
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SERVER_URL || undefined, {
  autoConnect: false,
});
