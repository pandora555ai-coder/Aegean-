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
server/src/phases.ts     QUIZ phase machine: startQuestion/endQuestion/advanceFrom*/startPowerUp
server/src/modes/        GameMode registry — see modes/README.md before adding a mode
server/src/payloads.ts   POWER_UP/REVEAL/SCOREBOARD/GAME_OVER payload builders
server/src/powerups.ts   POWER_UP choice validation + landing on the next question
server/src/steal.ts      STEAL thief selection + the clamped point transfer
server/src/realtime.ts   Socket.IO server instance (io, httpServer)
server/src/state.ts      Rooms Map, room/player/VIP/settings accessors
server/src/timers.ts     Shared phase-advance timer helper (arm/pause/resume)
server/src/questions.ts  Loads questions.json, difficulty filtering
server/src/socrates.ts   Moment detection + Greek commentary lines (host persona: Socrates)
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
- A resumed timer's continuation comes from the MODE's continuations table, never
  a switch — a phase that arms a timer must have an entry or pause breaks.
- Audio: host only, ONE AudioContext, reused.
- React StrictMode double-invokes effects in dev — guard anything that fires once.

## Phases
Phases belong to a MODE (room.mode, default 'quiz'), not to the room. The mode
owns its phase list, its continuations table (what each phase-advance timer
advances to) and its STAGES table. Below is the 'quiz' mode.
LOBBY -> (STAGE_ANNOUNCE) -> QUESTION -> REVEAL -> (STEAL) -> (SCOREBOARD every 3rd + final) -> GAME_OVER
Every question is entered via enterQuestionOrPowerUp() — the only gate.
STAGE_ANNOUNCE is a real held phase on the shared timer: the TV shows the
stage card ALONE and the question (and its timer) only start after it.
continueAfterReveal() is the one function deciding what follows a REVEAL/STEAL.
`paused` is a boolean flag, NOT a phase.

## Stages
QUIZ_STAGES in shared owns the game's shape: stage 1 = 3 plain questions,
stage 2 = 5 questions each preceded by POWER_UP, stage 3 = 4 questions each
FOLLOWED by a STEAL (fastest correct answerer robs one other player, 200-400
scaled by speed, clamped to the victim's score). Question count is NOT a
setting — it's the sum of the stages. room.stage is server-side; the TV
announces each stage once, on entry.
Landed effects STACK per target: ice in duration (10s cap), ink in
intensity, both via addAppliedSabotage() in sabotage.ts.

## Deploy
~/deploy.sh   (stop service, copy to /opt/party-game, build, chown, start)

## Working style
- Read only the files you need. Do not explore the whole repo.
- Keep final reports under 10 lines.
- Move code rather than rewriting it during refactors.
