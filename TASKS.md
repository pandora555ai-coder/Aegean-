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
- [ ] **Task 4 — Lobby sync** — NEXT
- [ ] **Task 5 — Start game + first question** (asymmetric host/player payloads)
- [ ] **Task 6 — Hidden answer submission**
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
- Reconnect is not yet handled: a player rejoining with their existing
  `playerId` after a disconnect will currently hit `NAME_TAKEN` (their own
  stale entry, still `connected: false`, blocks the name). Needs a
  same-playerId short-circuit in the `player:join` handler — planned for
  the reconnect work mentioned in Task 3.
