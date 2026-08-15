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
- [x] **Task 6 — Hidden answer submission** — DONE (8/8 acceptance criteria:
      counter progresses 1/3→2/3→3/3 as players answer, each phone shows
      only its own choice, `answer:progress` frame verified choice-free,
      `answer:accepted` frame verified to contain only the submitter's own
      choice, a second submission is rejected server-side and doesn't
      change the recorded answer, the 20s timer ends the question when
      players don't all answer (verified with a temporarily shortened
      timer, restored after), answering before the timer ends the question
      immediately and the timer never fires a second time, a mid-question
      disconnect doesn't block the remaining players from ending it)
- [x] **Task 7 — Scoring + reveal** — DONE (8/8 acceptance criteria: host
      reveal shows the correct option highlighted, per-player results and
      answerCounts; player `reveal:show` frame verified to contain only
      that player's own data; host `reveal:show` frame captured with the
      full results table; a faster correct answer (1487) scored more than
      a slower one (1479/1478 across runs); a non-answering player got
      `choice: null` / 0 points; `calculatePoints` unit-tested directly
      (instant ≈ 1500, at the buzzer ≈ 1000, wrong = 0) then the temp test
      file was deleted; reconnect preserves score, proven via the
      server's own disconnect log showing the same score (1495) before
      and after a disconnect/reconnect cycle)
- [x] **Task 8 — Scoreboard + advance** — DONE (8/8 acceptance criteria: full
      2-question loop QUESTION→REVEAL→SCOREBOARD→QUESTION→REVEAL→SCOREBOARD
      observed via `phase:changed` sequence; a player's score accumulated
      1500→3000 across Q1/Q2; a near-simultaneous submission produced a
      genuine tie, standings showed ranks **1,1,3**; a lone answer at the
      start of Q2 proved `answers` was cleared (progress read 1/3, question
      did not end prematurely); a fresh per-question timer confirmed by
      temporarily shortening it (Q1 ended in 5ms via full-answer completion,
      Q2's fresh timer fired at exactly 2500ms); playing all 5 questions
      through to the last scoreboard's `host:next` reached GAME_OVER; the
      disconnect fix ended a question in ~203ms instead of waiting the 20s
      timer)
- [x] **Task 9 — Game over + play again** — DONE (8/8 acceptance criteria:
      full 5-question game reached `game:over` with correct final standings
      on host and each phone; a forced tie via near-simultaneous correct
      answers produced `isTie: true` with `winnerName: "Tie1 & Tie2"`;
      "Ξανά" reset the room to LOBBY keeping all 3 players (captured
      `lobby:update` payload) and zeroed a 7500-point score down to a
      fresh-round-only total; a full Playwright session confirmed phones
      auto-return to the waiting view with no code re-entry and an
      unchanged `playerId` across the reset; a second full 5-question game
      played through to a second `game:over` with no server restart; a
      stray-timer check (game 1's last question ending via a temporarily
      shortened timer) confirmed game 2's own fresh timer fired exactly
      once at the right time, not early; full 2-game end-to-end browser
      session completed with zero issues reported)
- **v0.1 complete** — the full game loop (lobby → questions → reveal →
  scoreboard → game over → play again) works end-to-end.

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
- A player who joins after `phase !== 'LOBBY'` successfully joins the room
  and lobby, but is left on the WAITING view regardless of the actual
  phase (QUESTION/REVEAL/SCOREBOARD/GAME_OVER) — `question:show`,
  `reveal:show`, and `scoreboard:show` are all one-shot emits at their
  respective transition points, never replayed to a late joiner. No
  crash, but they're stuck until the next full phase transition. Needs a
  "catch up this player to the current phase" step in `player:join` for
  the reconnect/late-join case.
- The host's on-screen countdown is a local client-side estimate that
  starts when `question:show` arrives - it is cosmetic only. The
  authoritative timer lives on the server (`room.questionTimer`,
  `room.questionStartedAt`), which is what actually ends the question;
  the client never has to be trusted or synced precisely for this to be
  correct.
- [x] Fixed: the disconnect handler now re-runs the "everyone answered"
      check itself (not just `player:submit_answer`), so if the LAST
      unanswered connected player disconnects, the question ends
      immediately instead of waiting for the timer. Verified at ~203ms.
