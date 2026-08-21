import { createServer, type Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { Express } from 'express';
import type { ClientToServerEvents, ServerToClientEvents } from '@game/shared';

export let io: Server<ClientToServerEvents, ServerToClientEvents>;
export let httpServer: HttpServer;

// Must be called once, before `io`/`httpServer` are read anywhere else -
// lets index.ts finish building the Express `app` (static serving, etc.)
// first, so the same underlying HTTP server can serve both the API and
// Socket.IO's own routes. Exists as its own module (rather than living in
// index.ts) purely so phases.ts can import `io` without importing index.ts.
export function initRealtime(app: Express, corsOptions: { origin: string | boolean }): void {
  httpServer = createServer(app);
  io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, { cors: corsOptions });
}
