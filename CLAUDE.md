# Aegean — Greek party quiz game

Jackbox-style. TV = display only (no input). Phones = controllers.
4-digit numeric room code. Server-authoritative.

## Stack
TypeScript monorepo, npm workspaces: /shared /server /client
Server: Node + Express + Socket.IO (tsx, no build step)
Client: Vite + React, two routes: / (landing), /host (TV), /play (phone)

## Where things live
shared/src/index.ts      Event names, payload types, all constants. THE contract.
server/src/index.ts      Socket handlers (LARGE)
server/src/phases.ts     Phase machine: startQuestion/endQuestion/advanceFrom*
server/src/payloads.ts   REVEAL/SCOREBOARD/GAME_OVER payload builders
server/src/realtime.ts   Socket.IO server instance (io, httpServer)
server/src/state.ts      Rooms Map, room/player/VIP/settings accessors
server/src/timers.ts     Shared phase-advance timer helper (arm/pause/resume)
server/src/questions.ts  Loads questions.json, difficulty filtering
server/src/gamemaster.ts Moment detection + Greek commentary lines
server/src/scoring.ts    Pure scoring function
server/src/avatars.ts    Avatar catalogue
server/src/data/questions.json  899 questions, 49 categories
client/src/screens/HostScreen.tsx        TV, all phases (LARGE)
client/src/screens/ControllerScreen.tsx  Phone (LARGE)
client/src/theme.css     Gameshow theme

## Core rules — do not break these
- playerId (UUID in localStorage) is identity. NEVER socketId.
- Room codes are STRINGS always. "0042" must keep its zero.
- correctIndex NEVER leaves the server before REVEAL.
- Same event name can carry DIFFERENT payloads to host vs players.
  Players never receive another player's answer or score breakdown.
- VIP = first player to join, tracked by playerId. TV cannot control the game.
- All timers go through the shared timer helper so pause can freeze them.
- One function decides what follows REVEAL; auto-advance and vip:next both use it.
- Audio: host only, ONE AudioContext, reused.
- React StrictMode double-invokes effects in dev — guard anything that fires once.

## Phases
LOBBY -> QUESTION -> REVEAL -> (SCOREBOARD every 3rd + final) -> GAME_OVER
`paused` is a boolean flag, NOT a phase.

## Deploy
~/deploy.sh   (stop service, copy to /opt/party-game, build, chown, start)

## Working style
- Read only the files you need. Do not explore the whole repo.
- Keep final reports under 10 lines.
- Move code rather than rewriting it during refactors.
