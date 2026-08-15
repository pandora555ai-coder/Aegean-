# Tasks

Progress log for the party game build, task by task.

- [x] **Task 0 — Scaffold** — DONE (7/7 acceptance criteria)
- [x] **Task 1 — Typed socket contract** — DONE (7/7 acceptance criteria,
      round-trip time ~7ms warm)
- [x] **Task 2 — Room creation, 4-digit codes** — DONE (8/8 acceptance
      criteria, collision-safe, leading zeros preserved)
- [x] **Task 3 — Player join + `playerId` identity** — DONE (8/8 acceptance
      criteria: typecheck, join flow, wrong-code rejection, case-insensitive
      name clash, 9th-player ROOM_FULL, playerId stable across reload,
      disconnect keeps player with `connected: false`, numeric keypad
      attributes present)
- [x] **Task 4 — Lobby sync** — DONE (8/8 acceptance criteria: live 3-name
      host lobby with "3/8" counter, dimmed-on-disconnect within ~1s,
      reconnect with same name (no NAME_TAKEN, list doesn't grow),
      reconnect with different name keeps original name, a genuinely
      different player still gets NAME_TAKEN, "Περιμένουμε παίκτες..."
      below MIN_PLAYERS / "Έναρξη" at/above it, `lobby:update` payload
      verified socketId-free via captured websocket frame)
- [x] **Task 5 — Start game + first question** (asymmetric host/player
      payloads) — DONE (8/8 acceptance criteria: host+both players enter
      question 1/5 in sync, player frame has no question text/correctIndex,
      host frame has question text and no correctIndex, non-host
      `host:start_game` rejected and logged, real double-click on "Έναρξη"
      only starts once, mid-question joiner handled without a crash)
- [ ] **Task 6 — Hidden answer submission** — NEXT
- [ ] **Task 7 — Scoring + reveal**
- [ ] **Task 8 — Scoreboard + advance**
- [ ] **Task 9 — Game over + play again**

## Known open items

- [x] Verify only ONE `client connected` log fires per page load. — CONFIRMED
      (Playwright single fresh-context load, StrictMode on: 1 connect, 1
      disconnect on close)
- [x] `socketId` -> room mapping consolidated into a single
      `socketAssociationBySocketId` map in `server/src/index.ts` (tracks
      host vs. player role); `rooms.ts` no longer holds a separate mapping.
- The 4-digit room code keyspace (10,000 possible codes) saturates near
  ~9,000 concurrent rooms; if that limit is ever a real concern, widen
  codes to 5-6 digits.
- [x] Reconnect fixed: `player:join` now checks for an existing player with
      the same `playerId` before the ROOM_FULL/NAME_TAKEN checks, updates
      their `socketId` + `connected: true`, keeps their original name, and
      logs "player X reconnected to room Y" instead of creating a
      duplicate entry.
- A player who joins mid-question (phase !== 'LOBBY') successfully joins
  the room and lobby, but is left on the WAITING view ("waiting for the
  game to start") rather than the current question — they don't get a
  `question:show` because that's only emitted at `host:start_game` time.
  No crash, but they're stuck until the next question. Needs handling
  (e.g. send them the current question on join) in a later task.
