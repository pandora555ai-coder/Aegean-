# Tasks

Progress log for the party game build, task by task.

- [x] **Task 0 — Scaffold** — DONE (7/7 acceptance criteria)
- [x] **Task 1 — Typed socket contract** — DONE (7/7 acceptance criteria,
      round-trip time ~7ms warm)
- [x] **Task 2 — Room creation, 4-digit codes** — DONE (8/8 acceptance
      criteria, collision-safe, leading zeros preserved)
- [ ] **Task 3 — Player join + `playerId` identity** — NEXT
- [ ] **Task 4 — Lobby sync**
- [ ] **Task 5 — Start game + first question** (asymmetric host/player payloads)
- [ ] **Task 6 — Hidden answer submission**
- [ ] **Task 7 — Scoring + reveal**
- [ ] **Task 8 — Scoreboard + advance**
- [ ] **Task 9 — Game over + play again**

## Known open items

- Verify only ONE `client connected` log fires per page load.
- `socketId` -> room mapping is currently split between `server/src/index.ts`
  and `server/src/rooms.ts`; consolidate when players are added.
- The 4-digit room code keyspace (10,000 possible codes) saturates near
  ~9,000 concurrent rooms; if that limit is ever a real concern, widen
  codes to 5-6 digits.
