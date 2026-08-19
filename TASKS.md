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

- [x] **Task 18 — Fix reveal ordering, add countdown sounds, VIP reset to
      lobby, and a TV power-saving hint** — DONE (10/10 acceptance
      criteria). Four independent fixes found during a real 7-player
      session. **FIX 1 (real bug):** `RevealHostPayload.results` was built
      straight from `connectedPlayers.map(...)`, i.e. room-join order -
      with 7 players that read as random. Added a `sortAndRankResults()`
      helper in `server/src/index.ts` that sorts IN PLACE: answered before
      non-answered, correct before incorrect, then ascending `timeMs`
      (fastest first) - and in the same pass fills in each correct
      result's `answerRank` (1-based among correct answers only, by
      speed). Called once in `endQuestion()` right after `results` is
      built, before `answerCounts` is computed. `results[i].timeMs` is now
      populated (previously absent). `/shared`'s `RevealPlayerResult`
      gained `timeMs`/`answerRank`, and `RevealPlayerPayload` gained
      `yourTimeMs`/`yourAnswerRank`, both filled from the same sorted
      array in `buildRevealPlayerPayload()`. `HostScreen`'s REVEAL view no
      longer re-sorts (`sortedResults` computed via
      `[...reveal.results].sort(...)` is gone) - it renders
      `reveal.results` exactly as received, formats correct rows as
      `"1. Νίκος — 2.1΄΄ — +1450 (total)"`, wrong/no-answer rows as
      `"✗ name"`/`"– name"`, gives `answerRank === 1` a gold highlight
      style, and inserts a thin divider `<div>` the instant the mapped
      array crosses from a correct row into the first wrong/no-answer row.
      `ControllerScreen`'s REVEAL view shows the player their own
      `"Ταχύτητα: #N — X.X΄΄"` line whenever `yourCorrect &&
      yourAnswerRank !== null`. **FIX 2:** countdown tones via the Web
      Audio API, HostScreen only, REUSING the existing Task 14 keep-alive
      `AudioContext` (`audioCtxRef`) - never a second context. A tick
      (880Hz, 80ms) at each of the last 5 seconds, a distinct lower expire
      tone (220Hz, 160ms) when time runs out; both wrapped in try/catch,
      silently skipped if `audioCtxRef.current` is null. Hit and fixed a
      real bug along the way: the first version put the tone calls inside
      `setSecondsLeft((current) => {...})`'s functional-updater body -
      React 18 StrictMode deliberately double-invokes that function in dev
      to catch impure updaters, so every tick played twice. Fixed by
      adding a `secondsLeftRef` mirror of `secondsLeft` (a plain ref
      mutation, not subject to the double-invoke) that the ticking
      interval now reads/writes directly, calling `setSecondsLeft(next)`
      with a plain value and firing the tone calls from the interval's own
      body, outside any updater - all 3 other `setSecondsLeft` call sites
      (`handleQuestionShow`, `handleGameResumed`,
      `handleStateSync`'s QUESTION case) route through a new
      `applySecondsLeft()` helper so the ref never drifts from the
      displayed value. Second issue found via the same browser test: the
      expire tone almost never fired, because the server ends the round on
      its OWN clock, and that authoritative `reveal:show` routinely beat
      the client's local "seconds -> 0" tick across the network - the
      interval's final tick (and its would-be expire tone) got cancelled
      by the effect's cleanup (phase leaving QUESTION) before it ran.
      Fixed by moving the expire-tone decision into `handleRevealShow`
      itself: if `secondsLeftRef.current <= 1` when reveal arrives, time
      genuinely ran out and the tone plays there instead; a still-high
      leftover count means everyone answered early, and per spec no tone
      plays for that case. **FIX 3:** new `/shared` event
      `vip:reset_to_lobby` (empty payload). Server handler (right after
      `vip:play_again`) is VIP-gated via `getVipRoomForSocket`, rejects if
      `room.phase === 'LOBBY'` already, and otherwise just calls the
      SAME `resetRoomForNewGame()` used by play_again (phase -> LOBBY,
      `currentQuestionIndex = -1`, answers cleared, `clearActiveTimer` +
      pause state cleared, every score zeroed, players and settings kept)
      before broadcasting `phase:changed` and `lobby:update` - deliberately
      NOT blocked by `room.paused`, since resetting must work mid-pause and
      `resetRoomForNewGame` clears that state itself. `ControllerScreen`
      gained a VIP-only `ResetToLobbyControl` component rendered right
      after every `PauseControl` (question-answered, question-unanswered,
      reveal, scoreboard views) - a first tap shows a confirm box
      ("Σίγουρα; Θα μηδενιστούν όλοι οι βαθμοί.") with Ναι/Άκυρο buttons,
      only the confirm button actually emits `vip:reset_to_lobby`; the
      confirm state is local to the component instance so it resets for
      free on any real phase change. **FIX 4:** a small dismissible
      LOBBY-only hint on `HostScreen` - "Αν σβήνει η οθόνη: Ρυθμίσεις TV →
      Eco / Εξοικονόμηση ενέργειας → Απενεργοποίηση" - gated by a
      `powerHintDismissed` state flag, rendered after the existing waiting
      message so it never competes with the room code or QR for
      attention. Verified: (2/3) 5 staggered players (fastest-correct,
      2nd, 3rd, wrong, never-answered) produced `results` in exactly
      correct-by-speed → wrong → non-answered order with `answerRank`
      1/2/3/null/null; (4) the player-facing payload carried
      `yourAnswerRank`/`yourTimeMs` and no other player's data; (5) a
      Playwright test instrumenting `window.AudioContext` (recording every
      oscillator's frequency + start time) over a full 10s question
      captured exactly 5 ticks at ~5.0/6.0/7.0/8.0/9.0s in and 1 expire
      tone at ~10.0s, all after the StrictMode + race fixes above, plus
      confirmed only 1 `AudioContext` instance ever gets created (the
      reused keep-alive one); (6) zero tones recorded across an 8s pause
      window, ticks resumed correctly after resume, and zero tones for a
      question both players answered within under a second; (7) VIP
      `vip:reset_to_lobby` mid-QUESTION returned both players to LOBBY
      with scores back at 0 (confirmed via each player's next-round
      `totalScore` equalling just that round's own points), both players
      still present, settings preserved; (8) a non-VIP's
      `vip:reset_to_lobby` was rejected (room state unchanged); (9) a
      reset issued while `paused` produced a LOBBY that started and played
      a normal, unfrozen new question immediately; (10) a full 10-question
      game after a reset completed with zero stray events from the
      abandoned game's old timers. A companion Playwright pass confirmed
      the UI directly: the LOBBY power hint renders and dismisses on tap,
      the reset control is VIP-only in every phase it should appear in and
      invisible to non-VIP players throughout, a single tap opens the
      confirm box without resetting anything, and confirming actually
      returns the host screen to LOBBY. Production (`party-game.service`,
      port 3001) was never touched - all testing ran against an isolated
      dev instance on port 3099.

- [x] **Task 19 — Visual redesign: dark gameshow aesthetic, colour/shape-coded
      answers, consistent TV↔phone layout** — DONE (8/8 acceptance
      criteria). Found during a real 7-player session: the TV showed answers
      as a 2×2 grid (Α Β / Γ Δ) while phones showed a vertical list (Α Β Γ
      Δ), so players had to mentally re-map position under time pressure,
      causing mistaps. `/shared` gained ONE new exported constant,
      `ANSWER_IDENTITIES: readonly AnswerIdentity[]` (`{letter, shape,
      color}`), fixed forever at Α=red▲, Β=blue◆, Γ=yellow●, Δ=green■ - both
      `HostScreen` and `ControllerScreen` import it directly (no local
      `OPTION_LABELS` arrays left in either file), so the two views cannot
      drift apart. Colour is never the sole signal anywhere: every answer
      slot always renders its shape glyph AND its Greek letter alongside
      colour, verified by literally rendering a full REVEAL screen (TV and
      phone) through a `filter: grayscale(1)` and confirming the shape +
      bold/dim weighting + numbered-rank text still communicate
      correct/wrong with zero colour information. A tiny shared
      `client/src/components/AnswerShape.tsx` renders just the coloured
      glyph so the TV and every phone use the literal same element, not two
      hand-copied lookalikes. `ControllerScreen`'s answer view was
      restructured from a vertical `flex-column` list into a `display:grid;
      grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr` matching
      the TV's own grid exactly, inside a new `height: 100dvh` flex
      container (`questionContainer`) so the 4 buttons fill all available
      vertical space with zero scrolling on a real phone - measured at
      390×844 (iPhone 12/13 size), each button rendered at 173×312px, far
      past the 44px touch-height floor. The old two-screen flow (a live
      tappable grid, then a totally different "submitted choice" text
      screen once accepted) was collapsed into ONE view: tapping a button
      sets local `pendingChoice` immediately (no waiting on the server ack)
      and that same button gets a coloured background + a static
      `.glow` ring in its own identity colour, while the other three drop
      to `opacity: 0.35` + `grayscale(0.7)` - exactly the "stays highlighted
      while the others dim" behaviour the task asked for, confirmed via
      Playwright reading each button's `data-selected` attribute and
      computed opacity after a tap. The REVEAL verdict on the phone
      ("Σωστά!"/"Λάθος") now always renders the correct answer's shape next
      to the text, and - only when wrong - a second muted line showing the
      shape+letter of what they actually picked, so the verdict is legible
      from shape+text alone, not just red/green. A new `client/src/theme.css`
      (plain CSS, no framework - imported once from `main.tsx`) defines the
      dark palette as CSS custom properties (`--bg: #0b0d14`, `--surface:
      #171b26`, `--text: #f5f6f8`, etc.) plus three small, deliberately
      restrained effects: `.text-glow`/`.text-glow-gold` (static text-shadow,
      no animation - the room code and the final winner banner),
      `.glow`/`.glow-pulse` (a box-shadow ring driven by a per-element
      `--glow-color` CSS variable, since each answer's glow needs a
      different colour - `CSSVars = CSSProperties &
      Record<`--${string}`, string>` is the small local type that lets that
      variable be set from an inline `style` object in TypeScript), and
      `.timer-critical` (the QUESTION countdown scales up + turns red +
      gets a text-shadow glow for `secondsLeft <= 5 && !paused`, pairing
      visually with the Task 18 countdown ticks - deliberately reuses
      `--danger`, the SAME hex as answer A's red, rather than inventing a
      5th accent). On HostScreen's REVEAL grid, the correct card gets a
      colour-tinted background + border + `.glow-pulse` in its own identity
      colour; the three wrong cards drop to `opacity: 0.45` +
      `grayscale(0.6)`. On the SCOREBOARD (both the live per-round view and
      the final GAME_OVER standings), whichever row is rank 1 gets a static
      gold border+tint (live view) or the full animated gold `.glow-pulse`
      (GAME_OVER only - reserved for the one truly final moment, so the
      glow doesn't fire every single round). The QR code's wrapper keeps an
      explicit hardcoded `#ffffff` background regardless of theme (unchanged
      from Task 15) - confirmed still actually scannable, not just visually
      light, by extracting the live canvas's raw pixel data via Playwright
      and decoding it with `jsQR` in Node, which read back the exact
      `http://localhost:5199/play?code=XXXX` URL. Contrast was verified
      numerically (WCAG relative-luminance formula, not eyeballed) for every
      text/background pairing actually used: main body text `#f5f6f8` on
      `#0b0d14` is 17.95:1, on card surface `#171b26` is 15.90:1; the
      faintest tier, `--text-faint` (`#8890a1`) on the page background, is
      6.05:1; the coloured answer letters against the answer card surface
      ranged from 4.57:1 (red, the tightest) to 8.97:1 (yellow) - every
      single pairing clears the 4.5:1 AA-normal-text floor, none flagged.
      Verified: (1) `npm run typecheck` clean across all 3 workspaces; (2)
      grepped both `HostScreen.tsx` and `ControllerScreen.tsx` to confirm
      neither defines its own answer-colour table anymore, both import
      `ANSWER_IDENTITIES` from `@game/shared`; (3) TV and phone screenshotted
      side-by-side mid-question - `getBoundingClientRect()` on all 8 cards
      confirmed both grids read top-left/top-right/bottom-left/bottom-right
      in the identical Α-Β-Γ-Δ DOM order; (4) phone screenshots at 390×844
      showed all 4 buttons with zero scrolling (`document.scrollHeight ===
      844 === window.innerHeight`), each button 173×312px; (5) contrast
      ratios above, computed programmatically, not estimated; (6) QR
      decoded programmatically via jsQR as above; (7) TV screenshots
      captured for LOBBY, QUESTION, REVEAL, SCOREBOARD and GAME_OVER, all in
      the new dark theme; (8) a full REVEAL screen (TV and phone) rendered
      through CSS `grayscale(1)` and screenshotted - correct/wrong stayed
      fully legible from shape + weight/border + text alone. Production
      (`party-game.service`, port 3001) was never touched - all testing ran
      against an isolated dev instance on port 3099.

- [x] **Task 21 — Gameshow stage theme: deep blue-purple + gold, theatrical
      lighting** — DONE (9/9 acceptance criteria). Task 19's dark theme read
      as "tech dark mode" - near-black, quiet, flat. This replaces the
      palette and adds the theatrical effects explicitly asked for, while
      re-measuring every contrast ratio Task 19 established, since a
      lighter background changes all of them. `client/src/theme.css`:
      `--bg` is no longer a flat colour - it's now a `radial-gradient`
      value baked directly into the custom property (`radial-gradient(
      ellipse 120% 90% at 50% 28%, var(--bg-center) 0%, var(--bg-mid) 55%,
      var(--bg-edge) 100%)`), so every existing `background: var(--bg)` in
      both screens picked up the gradient with zero changes to those call
      sites. `--gold: #d4af37` is the new primary "this matters" accent
      (room code, timer ring, winner, leader) - the four ANSWER_IDENTITIES
      hex values in `shared/src/index.ts` are completely untouched, exactly
      per spec. Found a real contrast regression along the way: on the
      lighter stage background, red (answer A) and blue (answer B) BOTH
      drop under 4.5:1 as small text (4.22/4.32 on the old dark-mode
      surface tone, worse - 3.83/3.92 - directly on the new lighter centre)
      - Task 19 had rendered the option letter and reveal-verdict text
      directly in the identity colour, which no longer holds up. Fixed by
      never filling actual text with an identity/danger colour again: the
      answer letter is always `var(--text)` now (colour still pops via the
      shape glyph + full-strength border), and three new tokens -
      `--danger-text: #f87171` (5.2-5.7:1, for readable red body text),
      `--danger-strong: #b91c1c` (6.5:1 for white-on-red button fills,
      catching a LATENT pre-existing gap - white on raw `--danger` was only
      3.76:1 even back in Task 19, just never measured) - cover every
      remaining red UI text (error messages, wrong-answer names, the
      "Λάθος" verdict, the reset-to-lobby button). Also found and fixed a
      SECOND-order issue while verifying: an identity-coloured background
      TINT behind a full-strength shape glyph of the same hue crushes the
      shape's own contrast against its own card (same hue family, just
      different alpha) - dropped the live QUESTION cards' tint entirely
      (plain `var(--surface)`, full-colour border still pops clearly) and
      cut the REVEAL correct-card's and phone's selected-button tint alpha
      down, measurably raising the shape glyphs from 3.49-3.67:1 to
      3.96-4.20:1 (red/blue) and 6.78-7.99:1 (yellow/green) against their
      own card. Theatrical effects (`theme.css`, all GPU-cheap by design -
      see the property audit below): `.stage-sweep` - a fixed, full-
      viewport low-opacity gold radial gradient, slowly drifting via
      `transform: translate3d/scale` + `opacity`, 18s loop, rendered ONLY
      on `HostScreen` (one `<div className="stage-sweep">` per phase
      branch - never on `ControllerScreen`, which stays "calmer" per spec);
      `.timer-ring` - a static gold box-shadow ring around the QUESTION
      countdown digit with a gentle `transform: scale` breathing pulse,
      swapping to `.timer-ring-critical` (red, faster pulse) in the last 5
      seconds, paired with the existing Task 18 countdown ticks;
      `.enter-pop`/`.enter-rise` - scale/fade and rise/fade entrances
      (`transform` + `opacity` only), the question block using the former,
      the 4 answer cards and every scoreboard/standings row staggering in
      via the latter's `--i`-indexed `animation-delay: calc(var(--i) *
      60ms)`; `.correct-pop` + `.glow-pulse` - the REVEAL's correct card
      does a one-shot scale-pop burst then settles into a continuous GOLD
      glow-pulse (deliberately gold now, not the identity colour, per
      spec's "bursts with a gold glow"), while the 3 wrong cards dim
      (opacity 0.45) and desaturate (`filter: grayscale(0.6)`);
      `.leader-shimmer` - a `::after` pseudo-element sized to the leader's
      row, translated across it on a loop (`transform` only, the gradient
      itself is static) for a light-sweep shimmer; `.light-rays` +
      `.confetti-piece` (GAME_OVER only) - a slowly-rotating (`transform:
      rotate`) gold conic-gradient behind the winner banner, plus 24
      module-level (not per-render-random) confetti pieces cycling through
      gold + the 4 answer colours, falling via `transform: translate3d` +
      `opacity`. Every one of these was DESIGNED to avoid animating
      box-shadow/text-shadow values directly (glows are STATIC box-shadow/
      text-shadow, set once; only `transform`/`opacity` animate on top of
      them) - confirmed, not assumed: `document.getAnimations()` was
      queried live at 5 different moments (LOBBY, QUESTION-just-shown,
      REVEAL-just-shown, SCOREBOARD-just-shown, GAME_OVER-just-shown) and
      the UNION of every CSS property touched by every keyframe across all
      of them was exactly `["transform", "opacity"]` - nothing else.
      `prefers-reduced-motion: reduce` sets `animation: none` on every one
      of the above (the entrance classes' own BASE, non-keyframe styles are
      already the fully-visible end state, so disabling the animation
      never leaves anything stuck invisible) and hides confetti entirely
      via `display: none`; the stagger's `animation-delay` uses fill-mode
      `backwards` (deliberately not `forwards`/`both`) specifically so a
      disconnected standing row's own inline `opacity: 0.5` isn't
      permanently clobbered by the animation holding its final `opacity: 1`
      keyframe forever after completing. Verified: (1) `npm run typecheck`
      clean across all 3 workspaces; (2) screenshotted LOBBY, QUESTION,
      REVEAL, SCOREBOARD and GAME_OVER on the TV, all in the new theme; (3)
      re-measured every ratio via REAL rendered pixels (Playwright
      screenshot -> `pngjs` decode -> WCAG relative-luminance formula, not
      hand-picked hex math) - room code (gold) 8.06:1, body/counter text
      17.07:1, question text 15.92:1, the neutral answer-letter text
      13.88-14.40:1 across all 4 slots - all comfortably clear of 4.5:1;
      the identity-coloured SHAPE GLYPHS (decorative iconography, not body
      text - the actual textual identification is the neutral letter,
      already 13.88+) land at 3.96/4.20:1 for red/blue and 6.78/7.99:1 for
      yellow/green against their own card, clearing the WCAG large-text/
      graphical-object 3:1 floor; (4) the blue card's full-strength border
      measured 4.79:1 against the page background, plus the border itself
      is a completely distinct, saturated hue against the desaturated
      purple backdrop - clearly separable on sight, not just by the
      numbers; (5) the REVEAL screen rendered through CSS `grayscale(1)` -
      the correct card still reads instantly via its bright border/glow +
      bold white text + distinct shape, wrong answers via dimming +
      distinct shapes + "✗"/"–" markers, nothing lost; (6) the QR canvas's
      raw pixels were extracted and decoded with `jsQR` in Node, reading
      back the exact join URL with the live room code, background sampled
      at literal `rgb(255, 255, 255)`; (7) clicked an answer button 56-64ms
      after the question appeared (the ~540ms stagger sequence was still
      actively running) and it was accepted immediately - the entrance
      animation never touches `pointer-events`; (8) `page.emulateMedia({
      reducedMotion: 'reduce' })` on GAME_OVER - confetti count stayed 24
      in the DOM but every piece computed `display: none`, the stage-sweep
      and light-rays both computed `animationName: 'none'`, and
      `document.getAnimations().length` was 0 - screenshotted, layout
      fully intact, nothing stuck invisible or broken; (9) covered above -
      the live `document.getAnimations()` audit's property union was
      exactly `transform`/`opacity`, confirmed at 5 separate live moments
      instead of asserted from reading the CSS alone. A companion phone
      pass confirmed `ControllerScreen` never renders `.stage-sweep` or any
      `.confetti-piece` and that the 4 answer buttons - full-colour borders
      and shapes against the same muted gradient - are visibly the
      brightest thing on the screen. Production (`party-game.service`,
      port 3001) was never touched - all testing ran against an isolated
      dev instance on port 3099.

- [x] **Task 20 — Full host-screen audio cue set** — DONE (10/10 acceptance
      criteria). Found in a real 7-player session: the countdown ticks work,
      but by the time they fire the moment is nearly over - in a talkative
      room people miss the start of a question entirely. Sound needed to
      drive attention at every transition, not just the last 5 seconds. All
      7 cues are HOST-ONLY (`HostScreen.tsx` - `ControllerScreen.tsx` has
      zero audio code, confirmed by grep) and REUSE the exact same
      keep-alive `AudioContext` from Task 14 - no second context, no audio
      asset files, every tone generated with the Web Audio API. One
      consistent key across the whole set: A major pentatonic (A-B-C#-E-F#)
      - the Task 18 tick (880Hz) and expiry tone (220Hz), both left
      byte-for-byte UNCHANGED, are already "A" two octaves apart, and every
      new cue was picked from the same five-note family so the set reads as
      one game, not seven unrelated beeps. `playTone` (the tick/expiry
      function) gained exactly one line - a `mutedRef.current` check - and
      is otherwise untouched; a new `playToneAt(frequency, delaySec,
      durationMs, peakGain)` primitive schedules everything else using
      `ctx.currentTime + delaySec`, so a whole motif built from several
      calls in a row stays in time with itself on the AudioContext's own
      clock regardless of JS execution time. The 7 cues: (1) QUESTION START
      - a rising A4→C#5→F#5 motif (0/130/260ms), ~450ms total, fired from
      `handleQuestionShow` on every LIVE `question:show` (first question and
      every question after a scoreboard alike) - never on a `state:sync`
      reconnect, which is a separate handler; (2) ANSWER RECEIVED - a very
      quiet (peakGain 0.08, well under every other cue's 0.14-0.24), ~55ms
      blip that climbs an 8-note scale with the running `answer:progress`
      count, fired from `handleAnswerProgress`; (3)/(4) LAST 5 SECONDS /
      TIME EXPIRED - unchanged; (5) REVEAL - an A4+C#5+E5 chord (all three
      notes simultaneous, `delaySec=0`) struck together, unmistakably
      distinct in TEXTURE from the single-tone expiry cue it often follows,
      fired from `handleRevealShow` unconditionally (unlike the expiry
      tone's `secondsLeftRef <= 1` gate, so it still plays when a question
      ends early because everyone answered, per spec); (6) SCOREBOARD - a
      brief C#5→E5 two-note transition (90ms apart), fired from
      `handleScoreboardShow`; (7) GAME OVER - a ~1s ascending 4-note
      flourish (A4→C#5→E5→F#5) resolving into a held A5+C#6+E6 chord, fired
      from `handleGameOver`, timed to land with the Task 21 confetti/
      light-rays entrance. `/client` gained a small `hostAudioPreference.ts`
      (mirroring the existing `hostRoomCode.ts` pattern) for a `localStorage`-
      backed mute flag, plus a `muted` state + `mutedRef` mirror (every cue
      call site lives inside a handler registered once via an empty-
      dependency `useEffect`, so a plain `useState` read would see a stale
      value) and a `pausedRef` mirror for the same reason, gating the
      answer-blip handler specifically. A new 🔊/🔇 `mute-toggle` chip sits
      fixed top-left in LOBBY only, opposite the centred room code/QR
      column. `handleToggleMuted` deliberately reads `!muted` as a plain
      value and writes both `localStorage` and `setMuted` directly - NOT a
      `setState` functional updater - the exact pattern whose side effects
      React 18 StrictMode double-invokes in dev, which is what doubled the
      Task 18 ticks in the first place; every new cue function was written
      the same defensively-plain way from the start. Verified: (1) `npm run
      typecheck` clean across all 3 workspaces; (2) a Task-18-style
      instrumented `window.AudioContext` (extended to reconstruct each
      note's TRUE scheduled wall-clock play time from `ctx.currentTime`,
      not just when `.start()` was CALLED - multi-note cues call `.start()`
      for every note back-to-back in the same JS tick, so the naive
      Task-18-style capture would have shown a whole chord/motif at one
      identical millisecond) recorded 117 oscillators across a full
      3-player, 10-question game and every single one was accounted for by
      an automated classifier matching each note-cluster's exact frequency+
      timing shape to its designed cue, with zero leftover/unclassified
      tones; (3) exactly 10 QUESTION START clusters across the 10-question
      game (all 3 notes, correct 130/260ms stagger each time); (4) exactly
      30 answer blips for 30 submitted answers (3 players × 10 questions),
      landing 5-15ms after each real click and cycling E5→F#5→A5 in order
      every single round, confirming the count-based pitch mapping resets
      correctly each question; (5) 0 tones recorded across an 8s pause
      window (snapshotting the tone count before/after, not clearing it, so
      the check didn't also erase the tones needed for tests 2-4); (6) the
      total oscillator count (117) exactly matched the mathematically
      expected count - 10×(3+3+3+2) core notes + 7 fanfare notes = 117,
      with 0 extras and 0 missing - definitively ruling out any StrictMode
      double-fire anywhere in the set; (7) muting persisted the `🔇` icon
      state and `localStorage`'s `hostMuted` key across an actual
      `page.reload()`, and a full unanswered 10-second question + reveal
      while muted (which would normally produce 5 ticks + 1 expiry + 1
      reveal chord = 7 tones) produced exactly 0; (8) grepped
      `ControllerScreen.tsx` for `AudioContext` - no matches - and
      confirmed live via 3 separate instrumented phone contexts across the
      full game: 0 tones, 0 AudioContext instances, all three; (9) exactly
      1 `AudioContext` instance created across the entire game; (10) built
      an in-page `MutationObserver` recording `Date.now()` from the SAME
      process/clock as the audio timestamps (Playwright's own
      `waitForSelector` was tried first and showed a misleading ~240ms gap
      for one transition - purely CDP round-trip latency between the test
      process and the browser, nothing to do with the app) - every one of
      the 10 checkpoints measured landed within 3-18ms of its cue, far
      inside the ~100ms budget. Production (`party-game.service`, port
      3001) was never touched - all testing ran against an isolated dev
      instance on port 3099.

- [x] **Task 22 — Fix pacing between questions; remove the light sweep** —
      DONE (9/9 acceptance criteria). Found in a real 7-player session: two
      separate complaints. **Problem 1 (dead time):** REVEAL (6s) + SCOREBOARD
      (8s) ran after EVERY question - 14s of which the SCOREBOARD phase just
      repeated what REVEAL (with per-player results, speed, and points) had
      already shown, costing 2+ minutes of dead time over a 10-question game.
      `shared/src/index.ts`: `SCOREBOARD_DURATION_MS` 8000 -> 4000, new
      `SCOREBOARD_EVERY_N_QUESTIONS = 3` (REVEAL_DURATION_MS unchanged).
      `server/src/index.ts`: new `shouldShowScoreboard(room)` - true when
      `(questionNumber % 3 === 0) || isLastQuestion` - decides the branch
      inside `advanceFromReveal`, which either arms the SCOREBOARD phase as
      before, or (skip case) calls a new shared tail,
      `advanceToNextQuestionOrGameOver(room)`, extracted verbatim from the
      old `advanceFromScoreboard` body so BOTH the skip path and the normal
      post-SCOREBOARD path funnel through the exact same
      next-question-or-GAME_OVER logic - one code path, not two to keep in
      sync. `shouldShowScoreboard` OR-ing `isLastQuestion` first guarantees
      the final question always gets a SCOREBOARD (there's a stop right
      before GAME_OVER, per spec) regardless of the modulus. Every existing
      guard kept working unchanged BY CONSTRUCTION, not by re-auditing each
      one by hand: `state:sync`'s phase builders just read `room.phase`
      directly and were never aware SCOREBOARD was ever guaranteed to
      follow REVEAL, so a client reconnecting into a post-skip QUESTION (or
      mid-REVEAL about to skip) gets exactly the same correct catch-up it
      always did; `continuationForActiveTimer` (pause/resume) maps
      `activeTimer.kind: 'REVEAL'` to `advanceFromReveal` exactly as before,
      which now makes the skip-or-show decision itself on resume too; and
      `vip:next` still just calls `advanceFromReveal`/`advanceFromScoreboard`
      directly (unchanged), so a manual skip from REVEAL now correctly
      either jumps straight to the next question (skip case) or reveals
      the SCOREBOARD it would have shown anyway (show case) - never
      double-skips. `client/src/screens/HostScreen.tsx`: since REVEAL
      already carries every connected player's current `totalScore`, a new
      compact, sorted, single-line "standings strip" renders during REVEAL
      itself (`reveal.results` sorted client-side by score, no new server
      payload needed) so skipping SCOREBOARD never loses the "where do I
      stand" information. Every one of the 5 phase containers
      (LOBBY/QUESTION/REVEAL/SCOREBOARD/GAME_OVER) gained a `.screen-fade-in`
      class (new, `theme.css`, 280ms opacity-only fade, `backwards` fill
      mode) so the REVEAL -> QUESTION cut - abrupt on a skip round, since
      there's no SCOREBOARD screen to visually "arrive" through anymore -
      reads as a deliberate beat instead of a jump-cut, without adding any
      real dead time. **Problem 2 (the light sweep):** disliked, removed
      entirely - every `<div className="stage-sweep">` (5 render branches)
      and its `@keyframes stage-sweep-move` + `.stage-sweep` rule deleted
      outright. The deep blue-purple radial gradient background stays;
      `--bg` gained a SECOND, purely static radial-gradient LAYER on top (CSS
      background layers paint first-listed-closest-to-viewer) - a soft
      vignette (transparent centre fading to `rgba(0,0,0,0.32)` at the
      edges) for the "still deep, no motion" depth the task asked for.
      GAME_OVER's confetti and light rays, every entrance/stagger animation,
      the gold timer pulse, and the reveal burst are all completely
      untouched. Verified: (1) `npm run typecheck` clean across all 3
      workspaces; (2) a real 10-question game, ground-truthed via the actual
      `question:show`/`phase:changed` payloads (not DOM text, which turned
      out to have its own unrelated MutationObserver timing quirk under
      fast back-to-back remounts) - SCOREBOARD showed after questions 3, 6,
      9 and 10 (the final one), and questions 1, 2, 4, 5, 7, 8 went straight
      from REVEAL to the next QUESTION; (3) REVEAL-start to next-QUESTION-
      start measured 6000-6006ms for every skip case (exactly
      REVEAL_DURATION_MS, scoreboard genuinely gone) and 10004-10008ms for
      every scoreboard case (REVEAL_DURATION_MS + SCOREBOARD_DURATION_MS,
      back to back with no extra gap); (4) question 10 (the final one) was
      followed by a SCOREBOARD before GAME_OVER in that same run, confirming
      `shouldShowScoreboard`'s `isLastQuestion` OR; (5) an instrumented
      `window.AudioContext` across that same full game found the QUESTION
      START cue fired exactly 10 times (once per question, including all 6
      skip rounds) and the SCOREBOARD cue fired exactly 4 times (only
      questions 3/6/9/10) - both exact, zero extra, zero missing (the raw
      tone count came out to 96, not the 95 "designed" cue notes - the 96th
      was identified as the pre-existing, silent Task 14 keep-alive
      oscillator, which never sets an explicit frequency and so defaults to
      the Web Audio spec's 440Hz, coincidentally landing in the same pitch
      class as several real cues - not a duplicate or a bug, and a good
      reminder to always positively identify a stray tone rather than
      assume); (6) closed a connected player's page mid-REVEAL on a skip
      question, let the skip transition happen while they were disconnected,
      then reopened a page in the SAME browser context (so their playerId
      survived) - their `state:sync` reconnect landed cleanly on the new,
      post-skip QUESTION with working answer buttons, never stuck; (7)
      `vip:next` from REVEAL on a skip question jumped straight to the next
      QUESTION (not through a phantom SCOREBOARD) in 37-58ms, `vip:next`
      from REVEAL on a scoreboard question correctly showed SCOREBOARD (not
      a double-skip past it), and `vip:next` from SCOREBOARD advanced
      normally to the next question in ~40ms; (8) screenshotted the
      QUESTION background (no `.stage-sweep` anywhere in the DOM) and ran
      `document.getAnimations()` during QUESTION - only `pulse-scale`
      (scoped to the timer ring element) and a one-shot `enter-rise`
      (`iterations: 1`, not infinite) were running, no continuously-looping
      full-background animation; (9) confirmed 24 `.confetti-piece`
      elements and `.light-rays` still present and animating
      (`confetti-fall`/`rotate-rays` both in the live animation list) at
      GAME_OVER. Production (`party-game.service`, port 3001) was never
      touched - all testing ran against an isolated dev instance on port
      3099.

- [x] **Task 23 — Fix the skip button's destination; bigger GAME_OVER
      celebration** — DONE (10/10 acceptance criteria). **FIX 1:** described
      as a bug ("Παράλειψη" from REVEAL always landing on SCOREBOARD, even
      on questions the automatic pacing would have skipped it for) - live
      re-verification found this ALREADY correct as of Task 22:
      `server/src/index.ts`'s `advanceFromReveal` already makes the
      skip-or-show decision via the single `shouldShowScoreboard(room)`
      function, and `vip:next`'s REVEAL branch already calls
      `advanceFromReveal(room.code)` directly - the exact same entry point
      the REVEAL auto-advance timer uses
      (`armActiveTimer(room, 'REVEAL', REVEAL_DURATION_MS, () =>
      advanceFromReveal(room.code))`) - so the two literally cannot
      disagree; there is only one code path. No server changes were made
      for FIX 1 since none were needed; the acceptance criteria below were
      still verified fresh rather than assumed. **FIX 2:** the GAME_OVER
      light rays (Task 21) - not liked - removed outright, along with a
      SECOND light-sweep effect the task's broader "remove any remaining
      light-beam/sweep effects anywhere in the app" wording also caught:
      `.leader-shimmer` (Task 21's scoreboard/game-over leader-row light
      sweep), which its own code comment already described as "a soft
      light sweep" - both `@keyframes rotate-rays`/`.light-rays` and
      `@keyframes shimmer-sweep`/`.leader-shimmer` deleted from
      `theme.css`, and every JSX usage (GAME_OVER's winner row, SCOREBOARD's
      live leader row) dropped the class - the leader still reads clearly
      via its EXISTING static gold border/background tint (and, for the
      final winner only, the non-sweep `glow-pulse` breathing ring), so
      nothing about "the leader stands out" was lost, only the moving beam.
      Confetti (`client/src/screens/HostScreen.tsx`): count roughly tripled
      (24 -> 72, `CONFETTI_COUNT`), and every piece now varies independently
      in size (`--w`/`--h`, 0.45-1.05rem), rotation SPEED (`--spin`,
      320-1080deg - previously every piece spun the same fixed 540deg),
      and fall duration (3.6-6.4s) via inline CSS custom properties read by
      ONE shared `@keyframes confetti-fall`. The old "negative animation-
      delay so it's already mid-fall on first paint" trick (built for an
      AMBIENT drizzle) was replaced with a short POSITIVE stagger (0-1.09s)
      so pieces genuinely burst in together rather than looking like they'd
      already been falling before the screen even appeared. Each piece now
      has a FINITE `animation-iteration-count` (2-4, varied per piece so
      they don't all stop in lockstep) with `animation-fill-mode: both` -
      settles into its own already-`opacity:0` end state cleanly instead of
      looping forever or freezing visible. New: `FIREWORK_PARTICLES` - 4
      radial bursts (`FIREWORK_ORIGINS`, 10 particles each = 40 total),
      positioned in the screen's left/right MARGINS at two heights, never
      the centred title/name/standings column, so they frame the winner
      without any chance of overlapping it. Each particle's outward
      offset (`--fx`/`--fy`) is plain trigonometry computed once per
      particle (angle = its position around the burst circle, radius
      85-135px) - a `@keyframes firework-particle` animates from the
      shared origin out to that offset while shrinking/fading, `1 forwards`
      (one-shot, holds invisible after) - genuinely finite, never loops.
      Bursts stagger 400ms apart so all 4 finish within ~2.1s of GAME_OVER,
      "the first few seconds" per spec. Total simultaneous elements: 72
      confetti + 40 firework = 112, under the ~120 cap the task set.
      Verified: (1) `npm run typecheck` clean across all 3 workspaces; (2)
      cited above - `shouldShowScoreboard` is the one function, called from
      both `armActiveTimer(..., () => advanceFromReveal(...))` and
      `vip:next`'s REVEAL branch; (3) skipped from REVEAL on questions 1,
      2, 4, 5, 7, 8 (every non-scoreboard question in a 10-question game) -
      every one landed directly on the next QUESTION, no scoreboard; (4)
      skipped from REVEAL on questions 3, 6, 9, and the final question 10 -
      every one landed on SCOREBOARD (10 additionally required a second
      skip, from SCOREBOARD, to confirm it still reaches GAME_OVER
      correctly afterward); (5) an instrumented `window.AudioContext`
      confirmed the QUESTION START cue fired EXACTLY once on the
      skipped-into question for all 9 skip transitions checked; (6)
      grepped the whole client source for `light-rays`/`leader-shimmer`/
      `shimmer-sweep`/`rotate-rays`/"light beam" - zero matches anywhere -
      and confirmed `document.querySelectorAll('.light-rays' /
      '.leader-shimmer').length === 0` live at GAME_OVER; (7) screenshotted
      GAME_OVER - enlarged, varied confetti mid-burst, a firework's fading
      tail visible, winner name and both final-standings rows fully legible
      throughout; (8) peak simultaneous animating elements: 112 (72
      confetti + 40 firework), and the union of every CSS property touched
      by every currently-running animation was exactly `["transform",
      "opacity"]`; (9) all 40 firework-particle animations reported
      `iterations: 1` (Web Animations API `effect.getTiming()`), and all 72
      confetti-fall animations reported finite iteration counts (2-4, never
      `Infinity`); (10) `page.emulateMedia({reducedMotion: 'reduce'})` -
      confetti and firework elements both computed `display: none`,
      `document.getAnimations().length` was 0, and the winner banner +
      standings stayed fully present and readable, screenshotted.
      Production (`party-game.service`, port 3001) was never touched - all
      testing ran against an isolated dev instance on port 3099.

- [x] **Task 24 — Game Master: a teasing commentator that reacts to what
      actually happens in the game** — DONE (10/10 acceptance criteria).
      New module `server/src/gamemaster.ts`, fully synchronous and
      side-effect-free, tracks per-player/per-room state (correctStreak,
      wrongStreak, fastestAnswerCount, previousRank, timesInLast,
      noAnswerCount, totalCorrect, totalRounds) and detects 23 total
      "moments" - 19 fired after scoring each question (7 HIGH:
      EVERYONE_WRONG, ONLY_ONE_CORRECT, EVERYONE_CORRECT, BIG_COMEBACK,
      LEAD_CHANGE, HOT_STREAK_5, PERFECT_GAME_PACE; 9 MEDIUM:
      HOT_STREAK_3, STREAK_BROKEN, SPEED_DEMON, EASY_MISS, HARD_HIT,
      COLD_STREAK_3, NO_ANSWER, STUCK_IN_LAST, plus the floor
      GENERIC_TRANSITION at LOW alongside FASTEST_THIS_ROUND,
      CLOSE_SCORES, RUNAWAY_LEAD) and 4 fired right as a question appears
      (FINAL_QUESTION, HALFWAY_POINT, CATEGORY_CALLOUT, GENERIC_INTRO).
      146 Greek lines total (≥6 per moment), selected via a priority-sorted
      candidate list with a 3-question-per-player targeting cooldown (HIGH
      priority bypasses it) and a whole-game never-repeat `Set`.
      Player names are sanitized (`<>&` stripped) and truncated to 12 chars
      before substitution - defense-in-depth, since the join layer already
      enforces `MAX_NAME_LENGTH=12`. `gmIntro`/`gmLine` were added to
      `QuestionShowHostPayload`/`RevealHostPayload` only (shared/src/index.ts)
      - the pre-existing host/player asymmetry pattern (Task 11) extends
      unchanged, so phones never receive these fields at all, not just
      `null`. **Bug found and fixed during testing:** a fresh player's
      `lastTargetedAtQuestionIndex` initialized to `-1`, so at
      `questionIndex` 0 or 1, `questionIndex - (-1) < 3` was always true -
      every never-yet-targeted player looked like they were already on
      cooldown, silently suppressing every MEDIUM/LOW moment for the first
      two questions of every game. Fixed by initializing to `-Infinity`.
      Verified: (1) `npm run typecheck` clean across all 3 workspaces; (2)
      23 moments implemented, 146 lines written, every moment confirmed
      with ≥6 lines via a script iterating the exported `LINES`/
      `INTRO_LINES` pools; (3) a simulated 10-question/4-player game
      produced 10 varied, correctly-toned `gmLine`/`gmIntro` values -
      pasted in full during review; (4) each of the 7 HIGH moments forced
      individually via hand-built scenarios careful to avoid accidentally
      also satisfying a DIFFERENT same-priority HIGH moment (e.g. a
      BIG_COMEBACK scenario with only 1 correct answer that round would
      also trigger ONLY_ONE_CORRECT, which wins the same-priority tie by
      insertion order) - all 7 produced their own distinct, correct line;
      (5) a 20-question/4-player run produced zero duplicate lines; (6) a
      player stuck in last place every single round was targeted by name
      in only 2 of 12 rounds (cooldown working; ≤4 possible with a
      3-question gate); (7) live Socket.IO test against an isolated dev
      instance (port 3099/5199) - a player's captured `question:show`/
      `reveal:show` payloads were pasted showing `gmIntro`/`gmLine` are
      structurally ABSENT keys (`'gmIntro' in payload` / `'gmLine' in
      payload` both `false`), not merely `null`; (8) longest rendered line
      across every moment with worst-case 12-char names: 73 characters,
      under the 90 limit; (9) live-measured phase durations: QUESTION
      phase (`question:show` -> `reveal:show`) matched the configured
      `questionTimeMs` (10000ms) to within ~10ms jitter across 6 questions;
      REVEAL phase (`reveal:show` -> next `question:show`) matched
      `REVEAL_DURATION_MS` (6000ms) to within ~10ms on every question
      except the one where Task 22's pre-existing periodic SCOREBOARD
      (`SCOREBOARD_EVERY_N_QUESTIONS`) interposed, adding its own
      pre-existing `SCOREBOARD_DURATION_MS` (4000ms) - accounted for, not
      a new Game-Master-induced delay; (10) a player joined live with the
      name `<script>xx` and deliberately never answered (triggering
      NO_ANSWER); the resulting host-only `gmLine` read
      `"scriptxx αποφάσισε να μην παίξει καθόλου. Θάρρος."` - `<`/`>`
      stripped, no raw tag anywhere in the line, name well under the
      12-char cap so truncation itself was separately confirmed via a
      pure-logic unit run with a 27-char name (rendered output did not
      contain the untruncated name). Production (`party-game.service`,
      port 3001) was never touched - all live testing ran against an
      isolated dev instance on port 3099/5199.

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
