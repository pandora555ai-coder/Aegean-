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
- [x] **Task 14 — Keep the TV alive; make TV disconnection harmless** — DONE
      (8/8 acceptance criteria). Built for a Tizen smart TV where the Wake
      Lock API is silently ignored and the screen sleeps on "no remote
      input" mid-game. Part 1 (`HostScreen`): a silent Web Audio keep-alive
      generated entirely in code (`AudioContext` + `GainNode` at 0.0001
      gain, NOT exactly 0, driving an `OscillatorNode`) - started from the
      `room:created` handler (fired by the "Create Room" click, or by a
      successful rejoin), wrapped in try/catch with feature detection, and
      resumed on `visibilitychange`. Part 2: the wake-lock effect now
      tracks real acquisition failure (not just API absence) via
      `wakeLockFailed`, surfaced ONLY on the LOBBY view as "Συμβουλή:
      απενεργοποιήστε το Eco Mode / Screen Saver στις ρυθμίσεις της
      τηλεόρασης" - gated on `phase === 'LOBBY'` so it can never cover a
      live question. Part 3 (the main one): `/shared` adds `host:rejoin`
      (`{code}`); `/server` (`rooms.ts`) makes `Room.hostSocketId`
      nullable and adds `ROOM_TTL_MS = 300000`,
      `attachHostDisplay`/`detachHostDisplay`/`refreshRoomTtl` - a room is
      scheduled for deletion only once `isRoomFullyEmpty` (no host display
      AND no connected players), and reattaching either cancels it; a host
      disconnect now calls `detachHostDisplay` instead of `deleteRoom`
      (guarded so a stale old socket's disconnect can't clobber a fresher
      `host:rejoin` that already replaced it), and every
      `io.to(room.hostSocketId)` emit is now null-guarded so the game
      (timers, phase advances, answers) runs identically with no display
      attached. `/server` (`index.ts`) adds the `host:rejoin` handler
      (`attachHostDisplay` + a new `buildStateSyncForHost`, which - unlike
      the player-side version - also covers LOBBY, since a reattaching TV
      has no other way to get the current player list) and a
      `server:error` reply when the room no longer exists.
      `/client` (`HostScreen`) persists `hostRoomCode` to localStorage on
      `room:created`, attempts `host:rejoin` on EVERY `'connect'` event
      (covers first mount, a plain refresh, AND socket.io's automatic
      reconnect after the TV wakes - one code path for all three), shows a
      transitional "Επανασύνδεση..." instead of ever flashing "Create
      Room" while a stored code is pending, clears the stored code on
      `server:error` or `GAME_OVER`, and re-arms it on the LOBBY
      transition after "play again" (so a refresh mid-game-2 still
      recovers). `socket.ts` now sets explicit reconnection options
      (`reconnectionAttempts: Infinity`, capped backoff) since the TV may
      be asleep far longer than the library's defaults anticipate.
      Verified: (2) a Playwright-instrumented `AudioContext` subclass
      confirmed exactly one instance created after "Create Room", state
      `running`; (3) killed the host socket mid-QUESTION (before either
      player answered) - both players' `player:submit_answer` were still
      accepted and REVEAL still fired for both, with zero display attached
      the entire time; (4) reconnected a fresh host socket to that same
      room via `host:rejoin` - captured `state:sync` frame: `phase:
      "REVEAL"` with the full host-shaped `results`/`answerCounts`/
      `correctOption`, then the game continued advancing normally
      afterward; (5) a real page reload with a stored code went straight
      to the room-code view, `"Create Room"` never became visible; (6) a
      bogus stored code (`"0000"`) produced a `server:error`, and the page
      fell back to the `"Create Room"` button with localStorage cleared;
      (7) with `ROOM_TTL_MS` temporarily lowered to 3000ms for the test: a
      fully-empty room existed at +500ms and was gone at +3200ms (deletion
      logged with reason), while a second room that got a `host:rejoin`
      1.5s into its own 3s TTL window was confirmed to still exist *past*
      what would have been the original deadline - restored to 300000
      afterward and reconfirmed; (8) two full 10-question games back to
      back (via `vip:play_again`) completed cleanly, with a 3-second
      silent watch afterward confirming no stray `phase:changed`/
      `question:show`/`reveal:show`/`scoreboard:show` fired from a
      leftover timer. Production (`party-game.service`, port 3001) was
      never touched - all testing ran against an isolated dev instance on
      port 3099.
- [x] **Task 15 — Lobby/joining overhaul: landing page, QR code, always-visible
      room code** — DONE (8/8 acceptance criteria). The host view moved from
      `/` to `/host`; `/` is now `LandingScreen` with two large choices
      ("Δημιουργία δωματίου" -> `/host`, "Σύνδεση σε δωμάτιο" -> `/play`) -
      it renders a `<Navigate to="/host" replace />` instead of its own
      content whenever a Task-14 stored room code already exists, so a
      recovering TV never even paints the landing page. That check
      (`getStoredHostRoomCode`) plus `set`/`clearStoredHostRoomCode` were
      pulled out of `HostScreen` into a small shared `hostRoomCode.ts`
      module so both screens read/write the exact same localStorage key.
      QR code: added the `qrcode` package (canvas rendering, no heavy UI
      kit) + `@types/qrcode`; `HostScreen` draws a 240px code onto a
      `<canvas>` inside a forced-white `qrWrapper` (independent of any
      future theme), encoding `${window.location.origin}/play?code=<code>`
      - never a hardcoded domain - redrawn every time LOBBY is (re)entered,
      including after "play again" reuses the same code. `ControllerScreen`
      reads `?code=` via `useSearchParams` in a lazy `useState` initializer,
      accepting it only if it's exactly 4 digits (`/^\d{4}$/`) - anything
      else leaves the field empty; the name field is untouched and "Join"
      stays disabled until one is typed, so a QR scan pre-fills but never
      auto-joins. Always-visible code: `HostScreen` renders a small
      fixed-position, semi-transparent corner badge (`cornerRoomCode` style,
      top-right, `position: fixed`) during QUESTION/REVEAL/SCOREBOARD -
      LOBBY and GAME_OVER keep the existing large central code, the QR only
      renders in LOBBY. Rejoin mid-game (Part 4) needed no new code - Task
      11's `state:sync` and the existing score-preserving reconnect path in
      `player:join` already covered it; this task only had to verify it.
      Verified: (2) a real landing-page click on each button navigated to
      `/host` and `/play` respectively; (3) creating a room then navigating
      back to `/` landed straight on `/host` with the same room code, the
      landing buttons never appeared; (4) the rendered QR canvas was decoded
      programmatically with `jsQR` against its raw pixel data - decoded
      exactly `http://localhost:5199/play?code=<the real code>`; (5)
      `/play?code=1234` pre-filled the code field while the name field
      stayed empty and "Join" stayed disabled; (6) `?code=abc`, `?code=12345`,
      and `?code=12` were all ignored, field stayed empty in every case; (7)
      screenshotted QUESTION/REVEAL/SCOREBOARD - the corner code was
      correctly visible in all three and a bounding-box check confirmed zero
      overlap with the question/results/standings content; (8) a
      protocol-level test played 2 questions (Bob reached 1500 points), had
      Bob disconnect mid-question-3 and a brand-new player Charlie join via
      `?code=`, then reconnected Bob with his original playerId - both
      landed on the live question 3 via `state:sync`; after that question
      resolved, Bob's total was 2990 (his prior 1500 plus Q3's points -
      never reset) while Charlie's was 1490 (just Q3 - started at 0).
- [x] **Task 16 — VIP-configurable game settings: question count, time,
      difficulty** — DONE (9/9 acceptance criteria). `/shared` adds
      `QUESTION_COUNT_OPTIONS` (10/15/20), `QUESTION_TIME_OPTIONS_MS`
      (10s/20s/30s), `RoomSettings`, `DEFAULT_ROOM_SETTINGS`,
      `DIFFICULTY_MIX_OPTIONS`, and `vip:update_settings` /
      `settings:updated`; the old global `QUESTION_TIME_MS` and the Task 12
      `DEFAULT_DIFFICULTY_MIX`/`DEFAULT_QUESTION_COUNT` constants are gone
      outright rather than left as unused dead exports.
      `QuestionShowHostPayload`/`QuestionShowPlayerPayload` (and their
      `state:sync` variants, for free via the intersection types) each gained
      `questionTimeMs` so every question a client ever sees is
      self-describing about its own timing, instead of clients having to
      separately track "whatever the lobby settings said" across a
      reconnect. `LobbyUpdatePayload`/`StateSyncLobbyPayload` gained
      `settings`. `/server` (`rooms.ts`): `Room.settings: RoomSettings`
      replaces the old separate `difficultyMix`/`questionCount` fields;
      `room.questions` starts empty at creation (nobody reads it before the
      game is live) and is built for real by the new `buildRoomQuestions()`
      only on `vip:start_game` and inside `resetRoomForNewGame` (so
      `vip:play_again` gets a fresh shuffle against whatever settings are
      still in force - the settings object itself is never touched by
      play_again, which is the actual persistence mechanism); the new
      `updateRoomSettings()` validates every field against its allowed
      option list independently, silently ignoring anything invalid rather
      than rejecting the whole update. `/server` (`index.ts`): the new
      `vip:update_settings` handler reuses the existing `getVipRoomForSocket`
      helper (VIP-only, automatic TV rejection) plus an explicit
      `phase !== 'LOBBY'` guard, then always broadcasts the resulting
      settings (changed or not) via `settings:updated`; every remaining use
      of the old global time constant - the question timer's `setTimeout`,
      `calculatePoints`'s time budget, and both `state:sync` builders'
      `remainingMs` - now reads `room.settings.questionTimeMs`.
      `/client`: a new `SegmentedRow` generic component in
      `ControllerScreen` renders the three-row settings panel (Ερωτήσεις /
      Χρόνος / Δυσκολία) above "Έναρξη" - tappable + highlighted-active for
      the VIP, plain read-only text for everyone else - plus the estimated
      length (`questionCount * (questionTimeMs + REVEAL_DURATION_MS +
      SCOREBOARD_DURATION_MS)`, formatted "~N λεπτά"); `HostScreen` shows a
      compact "N ερωτήσεις · Ns'' · <difficulty>" summary in LOBBY, live off
      the same `lobby:update` / `settings:updated` / `state:sync` sources,
      and its per-question countdown now resets from the live
      `question.questionTimeMs` instead of a hardcoded default. A shared
      `difficultyLabels.ts` keeps the Greek difficulty labels in exactly one
      place between the two screens. Verified end-to-end over the wire: (2)
      setting count to 20 produced a `totalQuestions: 20` first-question
      payload and the game genuinely ran all 20 questions; (3) setting time
      to 10s and leaving a question unanswered ended it at 10003ms measured
      wall-clock, not the old 20s; (4) difficulty 'hard' verified via a
      direct in-process import of `buildRoomQuestions` (a question's
      `difficulty` is server-only and never sent to any client, so this is
      the only way to observe it) - the served 20-question set broke down
      as 12 medium / 8 hard, zero easy; (5) a non-VIP's
      `vip:update_settings` produced no `settings:updated` broadcast at all,
      confirmed settings still read the untouched defaults afterward; (6)
      the VIP's own attempt mid-QUESTION was equally silently rejected -
      settings are genuinely locked once a game starts, not just
      non-VIP-blocked; (7) `{questionCount: 999, questionTimeMs: 1}`
      produced a broadcast of the unchanged `{questionCount:10,
      questionTimeMs:20000, difficultyMix:"normal"}` - invalid fields never
      touch the room; (8) settings set to 20/10s/hard survived a full game
      + `vip:play_again` all the way through to game 2's own first question
      still reporting `totalQuestions: 20`; (9) covered all 4 answer options
      across 4 players (`correctIndex` is never sent to any client, so this
      is the only way to guarantee catching the correct answerer) - the
      correct answer at ~1s into a 10s question scored 1450 of a possible
      1500, confirming the speed bonus is computed against the room's 10s
      window and not a stale 20s one (which would have scored barely above
      the 1000 base). Production (`party-game.service`, port 3001) was
      never touched - all testing ran against an isolated dev instance on
      port 3099.
- [x] **Task 17 — Pause and resume** — DONE (10/10 acceptance criteria).
      Pause is a `paused: boolean` flag on the room, deliberately NOT a new
      `GamePhase` - phase stays QUESTION/REVEAL/SCOREBOARD throughout, so
      every existing phase guard keeps working unchanged. The three
      previously-separate ad-hoc timers (`questionTimer`, and `phaseTimer`
      reused for both REVEAL and SCOREBOARD) are gone, replaced by a single
      `Room.activeTimer: { kind, handle, startedAt, durationMs,
      remainingAtPause } | null` plus five small `rooms.ts` primitives -
      `armActiveTimer` (the ONE place any phase timer gets created),
      `pauseActiveTimer` (clears the handle, records
      `remainingAtPause = durationMs - elapsed`, clamped >= 0),
      `resumeActiveTimer` (schedules a fresh timer for EXACTLY
      `remainingAtPause`, never the original duration),
      `remainingActiveTimerMs` (the one source of truth for every
      `remainingMs`/`autoAdvanceMs` a client ever sees - the frozen value
      while paused, a live countdown otherwise), and `clearActiveTimer`.
      `questionStartedAt` (the speed-bonus reference point) is
      deliberately a SEPARATE field from `activeTimer`, because pause
      adjusts them differently: the timer restarts its clock fresh from
      the remaining duration, but `questionStartedAt` shifts FORWARD by
      the pause's own wall-clock duration (tracked via a new
      `Room.pausedAt`) on resume, so elapsed "thinking time" for scoring
      never includes the break. `/shared` adds `game:pause`/`game:resume`
      (client) and `game:paused`/`game:resumed` (server,
      `{byName}`/`{remainingMs}`), plus `paused`/`pausedByName` on every
      QUESTION/REVEAL/SCOREBOARD-shaped payload (live emits always read
      the room's actual current value, which is trivially always
      false/null the instant a phase begins - state:sync catch-up gets
      the real value for free from the exact same builder functions, no
      parallel code path). `/server` (`index.ts`): a new
      `getPlayerRoomForSocket` helper (deliberately NOT the existing
      VIP-gated one) authorises pause/resume for any connected player;
      pause is rejected in LOBBY/GAME_OVER or if already paused, resume is
      rejected if not currently paused; `player:submit_answer` and
      `vip:next` gained explicit `room.paused` rejections (both apply
      during genuinely pausable phases); `vip:start_game`/
      `vip:update_settings`/`vip:play_again` gained the same check too,
      even though it's structurally unreachable today (their required
      phases and "paused" can never overlap) - kept explicit so the
      guarantee doesn't silently depend on that. `/client`: `HostScreen`
      shows a full-screen "ΠΑΥΣΗ" / "Ο/Η \<name\> έκανε παύση" overlay
      (the corner room code sits at a higher z-index so it's never
      hidden) and its three local countdown-tick effects each gained a
      `paused` guard so the displayed number freezes exactly where it was
      (a companion fix: the QUESTION countdown's reset-to-full-duration
      logic was moved out of a `useEffect` and into the actual
      `question:show`/`state:sync`/`game:resumed` handlers directly, since
      the old effect would otherwise re-fire and clobber a reconnect's
      correctly-computed frozen value back to the full duration).
      `ControllerScreen` gained a `PauseControl` component (mirroring the
      existing `SegmentedRow` pattern) rendering "Παύση"/"Συνέχεια" for
      EVERY player - not VIP-gated - across the question (both answered
      and unanswered sub-views), reveal, and scoreboard views, plus
      disabling the answer buttons and showing who paused. Verified over
      the wire: (2) paused 5s into a 20s question, waited 10 real
      seconds, resumed - `game:resumed` reported `remainingMs: 14994`,
      and `reveal:show` arrived exactly 14995ms after resume, not
      instantly; (3) watched `reveal:show`/`phase:changed`/
      `scoreboard:show`/`game:over` for a full 10s pause - zero fired;
      (4) paused mid-REVEAL for 7s (longer than `REVEAL_DURATION_MS` =
      6000ms) - no `scoreboard:show`, then it arrived exactly 6002ms after
      resume; (5) same for SCOREBOARD - paused 9s (longer than
      `SCOREBOARD_DURATION_MS` = 8000ms), no advance, then the next
      question arrived exactly 8000ms after resume with the correct
      incremented index; (6) a submission while paused produced no
      `answer:accepted`, then the SAME player's next submission after
      resume succeeded normally, proving the paused one was never
      recorded, not just acked late; (7) covered all 4 answer choices
      across 4 players in two separate rooms (`correctIndex` is
      server-only) - a correct answer at ~1s in an unpaused control room
      scored 1475, a correct answer at ~2s real thinking time around a
      30-second pause scored 1450 - a 25-point difference, nowhere near
      the "took 30+ seconds" territory that would result from the pause
      counting against the speed bonus; (8) a player reconnecting mid-
      pause received a `state:sync` frame with `phase: "QUESTION"`,
      `paused: true`, `pausedByName: "VIP"`, and `remainingMs: 16996` (the
      genuinely frozen value, not the full 20000ms duration); (9) a
      NON-VIP player's `game:pause`/`game:resume` worked identically to a
      VIP's, confirmed via `byName: "Bob"` in the broadcast; (10) three
      consecutive pause/resume cycles within the same question reported
      `remainingMs` of 17997 → 14993 → 12990 - correctly and monotonically
      shrinking by roughly the live gap between each pair, with no drift
      accumulating from the freeze/thaw cycle itself. A companion 3-tab
      Playwright session confirmed the actual UI: the host's full-screen
      overlay with the room code still visible on top, the non-VIP
      player's own pause propagating to a VIP's "Συνέχεια" button +
      disabled/greyed-out answer choices, and both clearing immediately on
      resume. Production (`party-game.service`, port 3001) was never
      touched - all testing ran against an isolated dev instance on port
      3099.

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
