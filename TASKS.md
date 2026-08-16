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
- **Task 10 — Production deploy** — DONE. Live at
  https://demboyz11.duckdns.org via Caddy (auto HTTPS) reverse-proxying to
  a `tsx`-run Node process on `127.0.0.1:3001`, managed by the
  `party-game` systemd service. See `DEPLOY.md`.
- [x] **Task 11 — Live-testing fixes: auto-advance, wake lock, state resync**
      — DONE (8/8 acceptance criteria). Fix 1: REVEAL (6s) and SCOREBOARD
      (8s) now auto-advance via server-side timers stored on the room
      (`room.phaseTimer`), with `host:next` repurposed as a manual skip
      that cancels the pending timer first; a full 5-question game now
      finishes hands-off in ~70s, and two back-to-back games (with
      `play_again` between them) produced the exact expected
      `phase:changed` sequence with zero stray/duplicate events. Fix 2:
      screen wake lock on HostScreen (request on mount, re-acquire on
      `visibilitychange`, release on unmount, feature-detected with a
      fallback hint). Fix 3: new `state:sync` event catches a
      joining/reconnecting player up to the room's current phase
      (respecting all existing asymmetry - verified via a captured
      mid-REVEAL frame containing only that player's own result); a
      reconnecting mid-QUESTION player correctly lands on the SUBMITTED
      view (if answered) or the answering view with accurate
      server-computed `remainingMs` (if not); a brand-new player joining
      mid-game gets caught up immediately instead of being stuck waiting.
      Also fixed a real bug found while testing (pre-existing since Task
      8, not introduced here): the "everyone answered" check compared
      `answers.size >= connectedPlayers.length` (a count), which could
      wrongly conclude "everyone answered" if two players disconnected
      simultaneously - one who'd answered, one who hadn't - leaving a
      remaining connected player who never got the chance. Replaced with
      an identity-based `haveAllConnectedPlayersAnswered()` check.
- [x] **Task 12 — Real question bank (299 Greek questions, JSON-backed)**
      — DONE (8/8 acceptance criteria). Replaced the 5 hardcoded questions
      with `server/src/data/questions.json` (299 entries), loaded and
      validated once at startup (`server/src/questions.ts`, rewritten):
      checks options.length===4, all 4 options distinct, correctIndex is
      an integer 0-3, difficulty is a valid literal, and id is unique
      across the file; invalid entries are excluded and logged by id +
      reason rather than crashing, unless more than 5% of the file fails,
      which throws instead. Startup log: 299 loaded, 0 excluded — by
      difficulty {easy:90, medium:119, hard:90}, by category (18
      categories, 9-30 each). Added `getQuestionSet(mix, count)`
      (proper Fisher-Yates shuffle, no `sort(random)` shortcut) and
      `getStats()`. `/shared`: added `Difficulty`, `DifficultyMix` (the
      player-facing easy/normal/hard setting, mapped to which authored
      difficulties it draws from - distinct from a question's own
      `difficulty`), `DEFAULT_DIFFICULTY_MIX = 'normal'`,
      `DEFAULT_QUESTION_COUNT = 10`, and `difficulty` added to the
      `Question` interface. `Room` gained `difficultyMix` and
      `questionCount`, consumed by `getQuestionSet` on both room creation
      and `host:play_again`; `totalQuestions` was already derived from
      `room.questions.length` everywhere, so it now reads 10 with no
      wire-format changes needed. Verified via a scripted two-game
      Socket.IO run: 10/10 unique questions within each game, 0 overlap
      between game 1 and game 2's sets;
      `getQuestionSet('easy', 10)` returned only easy/medium (sample
      breakdown 3 easy/7 medium), `getQuestionSet('hard', 10)` returned
      only medium/hard (4 hard/6 medium); temporarily corrupting
      `q0005` (duplicated an option) made the loader exclude exactly that
      id with reason "options are not all distinct" and drop the count to
      298, restoring it brought the count back to 299. The host QUESTION
      view already rendered `question.category` (Task 5/8) - no client
      change was needed. Difficulty-mix selection UI is Task 14, out of
      scope here.
- [x] **Task 13 — VIP model: control moves from the TV to the first
      player's phone** — DONE (8/8 acceptance criteria). The TV/host
      socket can no longer start, skip, or restart a game - it's now a
      pure display. `/shared`: `host:start_game`/`host:next`/
      `host:play_again` renamed to `vip:start_game`/`vip:next`/
      `vip:play_again`; added `vip:changed` (broadcast on VIP migration),
      `VipChangedPayload`, `isVip` on both `Player` and `LobbyPlayer`.
      `/server` (`rooms.ts`): `Room.vipPlayerId: string | null`;
      `claimVipIfVacant` assigns VIP to whoever joins/reconnects while it's
      vacant (first-ever joiner, or the first back after everyone left) -
      a no-op otherwise, so a former VIP reconnecting after someone else
      took over does NOT reclaim it; `migrateVipAwayFrom` hands VIP to the
      longest-connected remaining connected player, using the fact that
      `room.players` (a `Map`) preserves original join order even across
      reconnects, so "earliest joiner still connected" falls out for
      free - no extra timestamp field needed. `/server` (`index.ts`):
      every host-role check on the three control events replaced with a
      single `getVipRoomForSocket()` helper (connected player + is this
      room's `vipPlayerId`) - the TV socket is rejected automatically
      since it has no `playerId` at all; VIP migration on disconnect is
      immediate (no grace period) and happens before the `lobby:update`
      broadcast so the payload is already consistent; a mid-QUESTION VIP
      disconnect only touches `vipPlayerId`/`isVip`, never
      `questionTimer` or `answers`, so the round is undisturbed.
      `/client`: `ControllerScreen` shows a 👑 badge and, VIP-only, the
      "Έναρξη" (disabled below `MIN_PLAYERS`) / "Παράλειψη" / "Ξανά"
      controls, driven by `vip:changed` plus `isVip` on each
      `lobby:update`; non-VIP players see "Ο/Η \<name\> θα ξεκινήσει το
      παιχνίδι" instead. `HostScreen` had all three control buttons
      deleted outright and now marks the VIP with 👑 in the player list
      plus "Ο/Η \<name\> ξεκινά το παιχνίδι" while waiting. Verified via a
      7-scenario scripted Socket.IO run covering every acceptance point
      (first-joiner-is-VIP with a captured `lobby:update` payload,
      non-VIP AND the TV both rejected from `vip:start_game` while a
      subsequent legitimate VIP start proved the room had genuinely stayed
      in LOBBY until then, a full 10-question game completed with the TV
      socket emitting zero events after room creation, a solo VIP's
      refresh - new socketId, same playerId - kept VIP with no
      `vip:changed` broadcast, a 3-player room's VIP disconnect produced
      an immediate `vip:changed` to the next-longest-connected player, and
      a mid-QUESTION VIP disconnect left the round fully intact - the
      remaining player's answer was still accepted and the reveal fired
      normally); then cross-checked with a 3-tab Playwright session
      against the built UI confirming the TV renders literally zero
      buttons through LOBBY/QUESTION/REVEAL/SCOREBOARD while the VIP tab
      alone shows the crown badge and every control, and the non-VIP tab
      shows neither. One scope note: the "VIP survives a refresh" guarantee
      was verified for the case where no other connected player is present
      to hand VIP to - with other players connected, a real disconnect (a
      refresh included) migrates VIP immediately per the explicit
      no-grace-period requirement, and a former VIP reconnecting after
      someone else already holds it does not reclaim it, per the equally
      explicit non-reclaim requirement; both behaviours are correct as
      specified; they just don't compose into "always survives a refresh
      regardless of who else is connected."

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
- [x] Fixed (Task 11): a player joining or reconnecting when `phase !==
      'LOBBY'` now gets a `state:sync` catch-up emit with exactly what
      their current view needs, so they're never stuck on the waiting
      view. Verified for QUESTION (answered and not), REVEAL, and a
      brand-new mid-game joiner.
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
