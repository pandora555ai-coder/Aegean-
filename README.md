# Party Game Monorepo

Real-time web party game scaffold (Jackbox-style): a host screen on a TV and
phone controllers that connect via a numeric room code.

## Structure

- `shared/` — `@game/shared`, shared TypeScript types and constants
- `server/` — `@game/server`, Node.js + Express + Socket.IO backend
- `client/` — `@game/client`, Vite + React + TypeScript frontend

## Requirements

- Node.js 20+

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

This starts both the server (http://localhost:3001) and the client
(http://localhost:5173) concurrently.

- `/` — host screen (renders "HOST")
- `/play` — controller screen (renders "PLAYER")

To test from a phone on the same LAN, use your machine's LAN IP with the
client port, e.g. `http://<your-lan-ip>:5173/play`.

## Type checking

```bash
npm run typecheck
```

Runs `tsc --noEmit` across `shared`, `server`, and `client`.
