import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@game/shared';
import { SERVER_URL } from './config';

// socket.io-client treats an empty string as a literal (broken) URL, not
// "same origin" - passing undefined is what makes it connect to wherever
// the page itself was served from.
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SERVER_URL || undefined, {
  autoConnect: false,
  // Explicit, not just relying on the (already-true) defaults: the TV can
  // be asleep for a long time, so it must keep retrying indefinitely with a
  // backing-off delay rather than giving up after a fixed attempt count.
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
  randomizationFactor: 0.5,
});
