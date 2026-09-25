# Task 320 — "Νέο παιχνίδι": a new room, the old one closed; room instance ids

Server plus minimal phone logic. No styling (Task 322), no deploy.
Context: branch main, clean, HEAD == origin/main == 54f44b8 at start.

## What changed

- **Events (shared).** `vip:new_game`, `host:new_game` (client), `room:closed` (server, `{code, instanceId}`),
  JoinRejectedReason `'ROOM_CLOSED'`, `PlayerJoinPayload.instanceId?` (resume only), `PlayerJoinedPayload.instanceId`.
- **One guard.** `acceptPostGamePress` (index.ts) is the first-press-wins check for both post-game actions:
  `playAgainSamePlayers` and the new `startNewGameRoom` both go through it. The winner leaves GAME_OVER in the same
  tick, so a later press of either action is a logged no-op. A phone whose room was closed is remembered in
  `closedRoomCodeBySocketId`, so its late press logs "room N was closed for a new game (an earlier press already won)".
- **startNewGameRoom** (index.ts). Refused when no TV is attached. Steps: cancel the idle timer; `createRoom` a new
  room (created before the old one is deleted, so the code cannot repeat); carry mode, `settings.speechPolicy`,
  `requestedBotCount` and `audioVolume`; emit `room:closed` to the old Socket.IO room; drop the phones' associations
  and remove them from that room; move the TV (association, join, `ROOM_CREATED` + `PHASE_CHANGED LOBBY` +
  lobby update, so HostScreen needs no change); `deleteRoom(old)`; spawn fresh bots if the old room had them.
- **deleteRoom** (state.ts) now also clears the mode WeakMaps (`clearModeStateForRoom`) and runs `onRoomDeleted`
  hooks. bots.ts registers `cleanupRoomBots` there. The empty-room TTL gets both for free.
- **Room.instanceId** (a randomUUID, a ROOM_FIELD, so it survives "same players"). PLAYER_JOIN refuses a resume whose
  `instanceId` is not the live room's with `ROOM_CLOSED`. This check runs before both the existing-player fast path
  and the fresh-join path. A join with no instanceId (typed code, QR, or a session saved before 320) works as before.
- **Phone** (ControllerScreen.tsx). Stores `instanceId` in localStorage `lastSession` and replays it on resume.
  - On `room:closed`: `clearLastSession()` (removes localStorage key `lastSession`; `playerId` is identity and stays).
    The phone then shows the plain `data-testid="room-closed"` text: "Το παιχνίδι έκλεισε. Σκάναρε το νέο QR στην
    τηλεόραση."
  - On `ROOM_CLOSED`: clears `lastSession`, `joined` and the error, and shows the join form as a fresh visitor.
- **VIP migration** (state.ts `migrateVipAwayFrom`) now picks from `getConnectedHumans`. Before, a VIP who dropped
  mid-game with a bot earlier in join order handed VIP to that bot. finishGame then removed the bot, so at GAME_OVER
  no one could press a post-game action.

## Acceptance

Check: `npx tsx dev/320-new-game-check.ts`. It uses an in-process server on 3933 and Vite on 5934, plus a real phone
page in Chromium. Result: 22 passed, 0 failed.

1. **New game.** TV and VIP pressed "new game" in the same tick, plus a "same players" press:
   - exactly 1 room closed;
   - 4 logged no-ops (VIP new/same via the closed room, TV same/new via the new room);
   - new code and instance id; mode blitz and speechPolicy v1 carried;
   - the TV is now the new room's host display (LOBBY first, then the new lobby update);
   - idle timer cancelled ("new game (host:new_game)");
   - `getRoom(old)` undefined; blitz WeakMap entry true -> null; "cleaned up 2 bot(s)"; the new room got 2 fresh bots.
2. **Old phones.** 5 old sockets were sent `room:closed`. The real phone showed the exact text, localStorage
   `lastSession` became null (`playerId` kept), and a reload showed the join form with no resume attempt.
3. **Instance id.** Code reuse was forced (Math.random pinned while the new room was created): the new room got code
   2484 again, with a different instance id.
   - A socket resume carrying the old instance id got `ROOM_CLOSED`, and the roster stayed at 1.
   - A real phone with that stale session was refused, its session cleared, and it landed on the join form outside
     the room.
   - A resume carrying the live instance id was accepted.
4. **Inverse.** A "same players" press with the VIP's seat gone hands VIP to the remaining human:
   state.ts:1126-1131 (`rebuildRoomForNewGame` step 6). An in-game drop now migrates to a human (state.ts:1060).
   Suites: see the report line below.

Not done (out of scope): the phone's `play-again-button`, labelled "Νέο παιχνίδι" since Task 239, still sends
`vip:play_again`. The TV has no new-game button. Wiring both to the new events belongs with the UI task.
