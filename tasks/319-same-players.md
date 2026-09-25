# Task 319 — "Ξανά, ίδια παρέα" (same players), server only

Implements tasks/318's diagnosis for the same-room path. "Νέο παιχνίδι" is Task 320. No UI, no deploy.
Context: eea2c09 + 856c4bf were unpushed at start; pushed first, so HEAD == origin/main == 856c4bf.

1. **Reset = whitelist rebuild.** `resetRoomForNewGame` is gone. `rebuildRoomForNewGame` (state.ts) clears every timer,
   calls `clearModeStateForRoom` (new modeStateRegistry.ts, which draw/blitz/numeric/agora register their WeakMap
   delete with), then `Object.assign(room, freshGameState())`. `createRoom` uses the same builder.
   `GameFields = Omit<Room, ROOM_FIELDS>`, so a new Room field that is not classified does not compile.
   - Survivors: code, host, players, mode, settings, bot count, VIP, audio, TTL/grace timers, `socratesBeatId`
     (never reset) and `seenQuestionKeys`. `socrates.earlierGamesLines` is copied on purpose.
   - Roster: connected humans carry over at score 0; disconnected seats are dropped; bots are re-spawned fresh.
   - Game 2 prefers unseen quiz, climb, numeric and blitz content (seenContent.ts `unseenFirst`; seen items go last,
     so a pool that runs out recycles rather than dealing short).
   - Lines recycle in pickLine (socrates.ts):
     ```
     let candidates = unused.filter((template) => !state.earlierGamesLines.has(template));
     if (candidates.length === 0) {
       for (const template of pool) state.earlierGamesLines.delete(template);
       candidates = unused;
     }
     ```
     This recycles ACROSS games. Within one game an exhausted pool still returns null: v1 moments and v2
     reservoir slots rely on going silent, and "never repeat a line this game" stands.
2. **Permissions.** `playAgainSamePlayers` (index.ts) is the one path for `vip:play_again`, the new `host:play_again`
   (current host display only, via `getHostRoomForSocket`) and the idle timer. It accepts only GAME_OVER, and first
   press wins through that same-tick check. Measured: host and VIP pressed in one tick, then the VIP again: 1 reset,
   2 logged `ignored ... an earlier press already won`. CLAUDE.md now reads: TV cannot control gameplay; exceptions
   are room creation and post-game actions.
3. **Idle timer.**
   - `Room.postGameIdleTimer`: `POST_GAME_IDLE_MS` = 300000. It is armed at all 5 GAME_OVER sites when a human is
     connected, and re-armed when a human returns to a GAME_OVER room.
   - Cancelled on either press, on rebuild, in `deleteRoom`, and when the last human disconnects (all four logged).
   - Dev override `POST_GAME_IDLE_MS_DEV` is ignored under NODE_ENV=production (the prod unit sets that) and when it
     is not a positive integer. Measured: prod 300000, junk 300000, dev 5000.
4. **Inverse.** `dev/319-same-players-check.ts`: 35 passed, 0 failed (370s).
   - Game 1 → press → game 2 to GAME_OVER: scores, ledger, climb, spear latch fresh (game 1 latch was true, game 2 false).
   - 0 of 32 questions repeated.
   - 6 of 16 lines repeated, all from recycled pools (3 recycles); the three sequences are exempt.
   - A late game-1 ack was rejected as `stale beat 14, current is 15`.
   - Idle timer: fires; cancelled when no humans are left; re-armed on return; cancelled by deleteRoom.
   - Required suites, one at a time: 263 52/52, 277 24/24, 300 55/55, 303 23/23, 308 W 18/18 · P 3/3 · T 5/5,
     310 20/20. Typecheck exit 0 in shared, server and client.

Also changed:
- dev/end-state-timer-subtitles-check.ts: its "beat id resets to 1" assertion now asserts the ids continue. Not run
  (a ~20 min harness).
- `vip:reset_to_lobby` shares the rebuild, so a mid-game reset also drops disconnected seats.
