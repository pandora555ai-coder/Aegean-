# Aegean — Greek party quiz game

Jackbox-style. TV = display only (no input). Phones = controllers.
4-digit numeric room code. Server-authoritative. Host persona: Socrates,
in Ancient Athens. All player-facing text is Greek.

## Stack
TypeScript monorepo, npm workspaces: /shared /server /client
Server: Node + Express + Socket.IO (tsx, no build step, systemd)
Client: Vite + React. Routes: / (landing), /host (TV), /play (phone),
plus dev-only /dev/draw /dev/numeric /dev/scene /dev/blitz /dev/voice
/dev/voice-ab /dev/voice-matrix /dev/voice-eq /dev/crowd (devRoutes.tsx)

## WHERE YOU WORK — read this before running anything

- **/root/Aegean- is the ONLY place code is edited, run and committed.**
- **/opt/party-game is production.** It is written ONLY by deploy.sh.
  Never edit it, never run a dev server in it, never git in it.
- Ports: production 3001 (127.0.0.1, Caddy-proxied), dev server 4001,
  Vite 5173. Never start anything on 3001.
- **Never touch a process under /opt/party-game.** A `pkill -f tsx` kills
  production along with your own shells. Kill any dev server you start
  before reporting.
- **Never use pkill or killall.** Find the PID (lsof -i :4001) and kill
  that exact PID. A pattern match protecting production by coincidence of
  path is not protection.
- Deploy is `deploy/deploy.sh`, inside the repo (the only path DEPLOY.md
  gives). Aborts loudly on a dirty tree. **Run it only when Argyrios says to
  in that turn** — "deploy", "run deploy.sh". Never on your own initiative,
  never rolled into another task because the work looks finished, and never
  carried over from an earlier turn's permission. Anything else about
  /opt/party-game stays off limits, deploy.sh included as a thing to edit.

## Visual verification

- **Use Playwright** — already a devDependency, zero setup.
- Browse **localhost:5173 and localhost:4001 ONLY.** Never
  demboyz11.duckdns.org: that is a live room real people play in.
- **chrome-devtools-mcp does not work here** (every call fails with
  `Target closed`). Do not re-add it.
- **Report NUMBERS in words** — bounding boxes, heights, counts.
  Never screenshots: they are the most expensive thing entering context.
- `npm run screenshot:phases` reads bot count from the `BOT_COUNT` env var
  (default 4) and captures the TV context at a hardcoded 1280x720 (the
  separate phone context is 360x640 — see below); no throwaway script is
  needed for either resolution.
- The harness writes its PNGs to client/public/dev/shots (21 TV + 12 phone,
  360x640 — dev/screenshot-phases.ts:1116-1117 computes both counts from
  ALL_PHASES_IN_ORDER/PHONE_CAPTURE_ORDER; grew from 17/9 as CLIMB_QUESTION/
  CLIMB_REVEAL/DUEL_PICK/DUEL_REVEAL and their phone captures were added) —
  served under the protected /dev basic-auth prefix and linked
  from ΔΟΚΙΜΕΣ (Task 180). Anything new for testing/review goes UNDER
  /dev, never a public sibling path. These are the LIVE shots on the
  running site; they only refresh when a harness run is followed by a
  deploy.

## Where things live

shared/src/index.ts      Event names, payload types, all constants. THE contract.
                         Also WORD_SETS and lineHash.
shared/src/agora.ts      Η Μνήμη της Αγοράς generator (Task 206) — pure, no server/
                         runtime imports. generateAgora(seed)/buildAgoraQuestions(scene,
                         seed), both their own mulberry32 stream off the same seed.
                         AGORA_STALL_SLOTS = 3 present stalls per scene out of 5
                         AGORA_STALL_TYPES (amphorae/fish/cloth/pottery/fruit — the other
                         2 are `absentStalls`, an existence question's answer pool);
                         AGORA_GOODS_MIN..MAX = 2..5 per stall; AGORA_EXPOSURE_MS = 12000.
                         AGORA_COLOURS is the 5-token awning palette (id/nameGr/hex):
                         krasati/κρασάτη/#8E2440, ladi/λαδί/#9AA860, ochra/ώχρα/#E8A14A,
                         porfyri/πορφυρή/#5A3350, lefki/λευκή/#EDE6D6 — the phone's
                         colour-question swatch (Task 209) matches an option's own Greek
                         text back against this table's `nameGr`, since no hex travels on
                         the wire; renaming a colour's `nameGr` here silently breaks that
                         swatch lookup (a known brittleness, not a bug). Re-exported
                         wholesale from shared/src/index.ts (`export * from './agora.js'`).
                         Check: `npm run agora:validate` (server/scripts/agora-validate.ts,
                         a fixed batch of seeds through both functions, in-process, no
                         Room/io — option-set validity, twin-guard/absent-subject
                         invariants, count bounds, distribution/uniqueness stats).
server/src/index.ts      Socket handlers (LARGE)
server/src/phases.ts     QUIZ phase machine: startQuestion/endQuestion/advanceFrom*
server/src/modes/        GameMode registry — READ modes/README.md before adding a mode
server/src/modes/quiz.ts   The quiz mode
server/src/modes/draw.ts   The drawing mode (state in a WeakMap<Room, DrawState>)
server/src/modes/numeric.ts  The numeric mode shell
server/src/modes/full.ts   Full mode (Task 134, relined by Task 214): COMPOSES
                         quiz/blitz/draw/numeric/agora/trial(climb) as one show's
                         seven LOCKED stages. Holds no mechanic of its own.
server/src/payloads.ts   REVEAL / GAME_OVER payload builders
server/src/powerups.ts   POWER_UP choice validation + landing on the next question
server/src/steal.ts      STEAL thief selection + the clamped point transfer
server/src/trial.ts      Η Δίκη (the quiz FINALE) — pure mechanic only: drain, elimination,
                         what the next round must be. No Room, no io, no timers; the phase
                         shell around it is in phases.ts.
server/src/climb.ts      Η Ανάβαση (the trial's ALTERNATIVE finale, Task 187/188a) — pure
                         mechanic only, same no-Room/io/timers discipline as trial.ts: round
                         scoring, the top-of-ladder WINNER/DUEL decision, and (Task 203) the
                         spear elimination overlay. The spear half is NOT wired into the live
                         game yet — see Phases below.
server/src/agora.ts      Η Μνήμη της Αγοράς server-side PURE helpers (Task 207): seed
                         draw, render spec (scene minus absentStalls), the reveal's
                         subject resolver. No Room/io/timers. shared/src/agora.ts (Task
                         206) is the generator itself and stays untouched.
server/src/modes/agora.ts  The agora mode SHELL (Task 207) — standalone AND, since
                         Task 214, full's stage 5; see Phases.
server/src/crowd.ts      Crowd mood decision layer (calm/tension/cheer/boo) — HOST ONLY.
                         Playback IS built (Task 36a-d — see Crowd mood below). Wired into
                         every mode: quiz via phases.ts since Task 35, draw/numeric got
                         their own wiring in Task 151, blitz had its own from Task 156a.
server/src/realtime.ts   Socket.IO server instance (io, httpServer)
server/src/state.ts      Rooms Map, room/player/VIP/settings accessors
server/src/timers.ts     Shared phase-advance timer helper (arm/pause/resume)
server/src/questions.ts  Loads questions.json, difficulty filtering. Also holds
                         FORCE_QUESTION_ID — dev hook pinning the served question, NODE_ENV-guarded. Keep it.
server/src/socrates.ts   Moment detection, Greek lines, LINE_TAGS, LINE_RATINGS
server/src/scoring.ts    Pure scoring function + sortAndRankResults (the reveal's
                         correct-by-speed order and answerRank; quiz AND trial)
server/src/numeric.ts    maxForAnswer, clamping, scoring, pure payload builders. MODE-AGNOSTIC — keep it that way.
server/src/data/questions.json  899 questions, 49 categories
client/src/screens/HostScreen.tsx        TV shell + phase switch; owns the sophists row + krater
client/src/components/SophistsRow.tsx    The players (Task 161): figure + plaque per player on the
                         orchestra at the foot of the TV. Replaced the score column.
client/src/screens/host/                 One file per TV phase, plus GameLayout.tsx
client/src/components/AnavasisScene.tsx  Η Ανάβασις (Task 189): TheatreScene's sibling for the
                         climb finale — background art, AnavasisClimbers (the stair
                         figures), AnavasisDuel, AnavasisCrowning, AnavasisChrome, all
                         off one shared geometry (visualStepFor/laneLeftPct). Built from
                         design/anavasis-reference.html, the TV visual reference for this
                         scene (same role theatre-reference.html plays for TheatreScene).
client/src/components/AgoraScene.tsx     Η Μνήμη της Αγοράς (Task 208): TheatreScene's
                         sibling for the three agora phases — a static sky layer (fixed
                         seeded LCG at module load, like TheatreScene's own crowd) plus a
                         market group drawn fresh from each payload's `spec` (absent
                         entirely, not hidden, during AGORA_QUESTION — the fairness rule)
                         and the reveal's proof highlight. Built from
                         design/agora-reference.html's own 1600x900 coordinate space,
                         the TV visual reference for this scene (same role
                         anavasis-reference.html/theatre-reference.html play for theirs).
client/src/components/MarbleSlab.tsx     The read column's slab — renamed off PapyrusPanel
                         when Task 159 swapped the palette Ελαιογραφία → Θέατρο
client/src/screens/ControllerScreen.tsx  Phone (LARGE)
client/src/components/DrawingCanvas.tsx  Canvas, tools, colour wheel
client/src/palette-theatro.css           THE colour source: tokens, base reset, AND all
                         keyframes (moved in 123) — not tokens-only, don't
                         "clean" the keyframes out. Renamed off
                         palette-elaiografia.css in Task 159.

## Colour

- **palette-theatro.css is the single source** (renamed off
  palette-elaiografia.css in Task 159's Ελαιογραφία → Θέατρο swap) —
  twelve :root tokens: --night-0 --night-1 --marble --marble-2 --marble-3
  --carve --wine --wine-2 --ember --olive --tv-safe-top --tv-safe-bottom.
- On any screen you touch: zero raw hex, and **no `var(--x)` naming a token
  the palette does not define.** Check by inversion, not by a blocklist —
  a blocklist of five names passed clean while `--surface-strong`,
  `--text-faint` and `--text-dim` were live on the TV:
  `comm -23 <(grep -aroE "var\(--[a-z0-9-]+" <files> | sed 's/.*var(//' | sort -u) \`
  `  <(grep -aoE "^ +--[a-z0-9-]+" client/src/palette-theatro.css | tr -d ' ' | sort -u)`
  The inversion currently turns up three LOCAL inline vars a component sets
  on itself — `--dx --glow-color --i`. Those are not palette tokens and are
  not violations; exclude them. Now that theme.css is gone, these resolve
  via their own `var(--x, default)` fallback rather than a theme.css
  definition.
- **Colour NEVER encodes correctness.** Correct = opacity 1 + heavier
  weight, wrong = opacity 0.42. Same rule on TV and phone.
- **Two sanctioned raw hex literals**, each self-documented in its own file
  as "the palette has no token for this by design": `#ef4444` (Krater.tsx's
  `KRATER_CRITICAL`, the wine-krater timer's urgency pulse — moved here
  when Task 162 replaced TimerRing with Krater) and `#BFE6FF`
  (SophistsRow.tsx's `ICE_GLOW`, the ice-sabotage crystal, Task 163c).
  Urgency/status is not correctness, so both stay literals on purpose
  rather than inventing tokens nothing else would use.
  `grep -aroE "#[0-9a-fA-F]{3,8}" client/src --include=*.tsx --include=*.ts --include=*.css`
  turns up 93 hits: palette-theatro.css's own ten (its other two tokens are
  vh values, not colours), the two above, and the rest OUTSIDE this rule's
  scope — self-documented SVG art (TheatreScene.tsx's backdrop, "same
  exception as drawing ink"; SocratesFigure.tsx's gradients), the drawing/
  canvas literals (DrawingCanvas ink/paper, hostStyles.ts's drawing-phase
  panel reusing the PAPER value verbatim, HostScreen's QR code), and
  /dev/* debug routes (DevBlitzScreen.tsx).

## Core rules — do not break these

- playerId (UUID in localStorage) is identity. NEVER socketId.
- Room codes are STRINGS always. "0042" must keep its zero.
- The correct answer NEVER leaves the server before REVEAL / GUESS_REVEAL.
- Same event name can carry DIFFERENT payloads to host vs players.
  Players never receive another player's answer or score breakdown.
- VIP = first player to join, tracked by playerId. TV cannot control the game.
- **canStartRoom(room) (state.ts) is the ONLY source of truth for roster
  count / start eligibility.** Never add a second count elsewhere.
  LOBBY_DISCONNECT_GRACE_MS = 20000 governs lobby-roster expiry; VIP
  migration for a LOBBY disconnect defers to grace expiry, while in-game
  migration stays immediate.
- `?bot=N` (clamped server-side to MAX_BOTS = 7) spawns server-side bots
  (server/src/bots.ts) into a room; a bot is never VIP. cleanupRoomBots
  runs in every mode's finishGame. **`?mode=X` (Task 222) sets the room's
  mode AT CREATION** — `host:create_room`'s own `mode` field, validated
  against the mode registry exactly as `vip:set_mode` is, then passed to
  `createRoom`. It exists because an all-bot room self-starts (Task 217)
  with NO VIP, so `vip:set_mode` is unreachable there and every bot room
  was stuck on DEFAULT_GAME_MODE; nothing about it grants a bot VIP. An
  unknown id is logged and ignored. Check: `dev/bot-mode-param-check.ts`
  (in-process server on a throwaway port, so VIP ownership can be read off
  the live Room mid-game — no payload carries `isVip` outside LOBBY).
  Only SEVEN avatars have art (server/src/avatars.ts vs
  client/public/avatars), and bots claim the first N by catalogue order —
  a human taking one of those gets that bot's join REJECTED, silently, no
  retry (pre-existing, Task 176; documented at 222, not fixed).
- Uppercased Greek text — titles AND player names — ALWAYS renders through
  greekUpper (client/src/greekUpper.ts). Never a raw text-transform:
  uppercase or .toUpperCase() on a Greek string; Greek uppercasing drops
  the tonos and greekUpper is the only place that's handled correctly.
- All timers go through the shared timer helper so pause can freeze them.
- One function decides what follows REVEAL; auto-advance and vip:next both use it.
- A resumed timer's continuation comes from the MODE's continuations table,
  never a switch — a phase that arms a timer must have an entry or pause breaks.
- Audio: host only, ONE AudioContext, reused. **There is no CUES_ENABLED
  flag** — client/src/hooks/useGameAudio.ts is LIVE, gated only by the host
  mute toggle (outputGain, every play* function routes through it via
  mutedRef). The crowd subsystem (Task 36) has fully retired the earlier
  synthesized cue set (Task 20, `answer:progress`/playAnswerBlip included)
  — do not describe that old cue set as still live or as pending crowd
  playback; playCrowdOneShot and playSocratesLine are what remain.
- React StrictMode double-invokes effects in dev — guard anything that fires once.
- Relative imports need explicit .js extensions. tsx runs ESM; typecheck
  passes without them but the server will not boot.
- payloads.ts and realtime.ts import nothing local back. The dependency
  graph is acyclic. Keep it that way.

## Phases

Phases belong to a MODE (room.mode), not to the room. The mode owns its
phase list, its continuations table and its STAGES table.
GamePhase has 24 values (shared/src/index.ts, `export type GamePhase`);
GameModeId has 7 — 'quiz' | 'draw' | 'numeric' | 'full' | 'blitz' | 'duel' |
'agora' (`export type GameModeId`).

Quiz: LOBBY -> STAGE_ANNOUNCE -> [POWER_UP] -> QUESTION -> REVEAL
      -> [STEAL] -> [SOCRATES] -> (after the LAST question: STAGE_ANNOUNCE
      'Η Δίκη' -> (TRIAL_QUESTION -> TRIAL_REVEAL) x N, sudden death if
      everyone left falls in the same reveal) -> [SOCRATES] -> GAME_OVER
Draw: LOBBY -> DRAW -> (GUESS -> GUESS_REVEAL) x N -> GAME_OVER
Numeric: LOBBY -> NUMERIC_QUESTION -> NUMERIC_REVEAL -> GAME_OVER
Agora (207): LOBBY -> AGORA_EXPOSE (AGORA_EXPOSURE_MS = 12000, the scene on
      the TV) -> 3 x (AGORA_QUESTION -> AGORA_REVEAL [-> SOCRATES]) -> GAME_OVER.
      VIP-selectable standalone (`agora` in GameModeId) AND, since Task 214,
      full's stage 5 — startAgoraSegment/prepareAgoraRound are the
      composition entry points, numeric's pattern. Seed + AgoraScene +
      correctIndex are SERVER-ONLY (modes/agora.ts's AgoraState); the render
      spec leaves the server ONLY in agora_expose:show and inside each
      agora_reveal:show's HOST-ONLY `proof` (spec + subject) — an
      AGORA_QUESTION payload, fresh OR a reconnect's state:sync, never carries
      it (the market is closed). Question timer = room.settings.questionTimeMs,
      reveal = REVEAL_DURATION_MS, scoring = calculatePoints +
      sortAndRankResults (the quiz's path verbatim) at `scale` — 1 standalone,
      `FULL_AGORA_SCORE_SCALE` in full (its own AgoraState.scoreScale field,
      set once by startAgoraSegment's own `scale` parameter, draw's
      guessScale pattern — Task 215, see Full below), answers over
      player:agora_submit (elapsed = questionTimeMs − remainingActiveTimerMs,
      pause-aware like the trial). Socrates: NO lines of its own (D1) — the
      quiz's generic recordRoundAndPickLine runs with difficulty 'medium' and
      whatever fires plays via enterSocratesBeat as 'AGORA_MOMENT' on timer
      kind AGORA_SOCRATES. The seed is logged at expose start
      (`agora expose started - seed=N`); generateAgora(N) +
      buildAgoraQuestions(scene, N) rebuilds the round. Check:
      `npm run agora:wire-check` (dev/agora-wire-check.ts, socket-level
      against a dev server on 4001: flow, leaks, reconnect, pause, plus a pure
      `--subjects` sweep of the subject resolver against the truth).
      **The TV view is built (Task 208)** —
      `client/src/components/AgoraScene.tsx`, TheatreScene's sibling for
      exactly the three agora phases (`HostScreen`'s `isAgoraScenePhase`),
      built from `design/agora-reference.html`'s OWN 1600x900 coordinate
      space (copied verbatim — a viewBox is resolution-independent, so
      there's no reason to rework every literal offset onto TheatreScene's
      1280x720). TWO LAYERS: the sky (stars/moon/distant Acropolis) is
      STATIC geometry (a fixed seeded LCG at module load, like TheatreScene's
      own crowd — never touched by a round, never dimmed); the market group
      (`data-testid="agora-market"`, stalls/torches/ground/animals) is drawn
      fresh from the payload's `spec` every render and is the ONLY thing the
      fairness rule hides — during AGORA_QUESTION `spec` is null and the
      whole `<g>` simply isn't rendered (absence, not opacity/display:none).
      No Math.random and no per-round seed anywhere in this component: goods/
      animal placement comes straight from `spec` at fixed slot fractions, so
      a reconnect's redraw is byte-for-byte identical by construction.
      AGORA_REVEAL gets its own frame alternation (the Anavasis 192 pattern,
      applied inside GameLayout rather than by bypassing it, since agora
      stays in the ordinary two-column shell): AgoraRevealView's 'grid' stage
      shows the options slab (market still closed, colour-kind options get
      an inline swatch chip via AGORA_COLOURS) for `AGORA_REVEAL_GRID_MS` =
      1800ms (HostScreen.tsx, client-only cosmetic timing, never sent by the
      server), then 'proof': the slab unmounts to a 1x1 hidden marker
      (`agora-reveal-marker`, the ClimbRevealView pattern) and the market
      returns with a gold highlight (`data-testid="agora-highlight"`) on the
      reveal's `proof.subject` — a stall gets an outline rect, an animal a
      ring, and an ABSENT subject (existence's own "ΔΕΝ υπήρχε" phrasing) gets
      NO highlight at all, since there's nothing present to point at. `stage`
      ('grid'|'proof') lives in HostScreen, not inside either view, because
      the scene and the reveal slab are SIBLINGS in the render tree, both
      driven off that one value. Socrates gets no special pose for any agora
      phase (CLAUDE.md's own instruction: reuse the standard placement) —
      SocratesFigure's default bucket (`left:7%`) applies exactly as it does
      for a plain quiz QUESTION. Verified with a dedicated Playwright
      harness, `npx tsx dev/agora-scene-check.ts` (screenshot-phases.ts's own
      spawn/cleanup shape, on its own throwaway ports 3902/5903, since
      standalone `agora` isn't in ALL_PHASES_IN_ORDER's one `full`-mode run) —
      spec-vs-DOM good/animal counts, the 5 sanctioned awning hexes, 0
      market nodes across all 3 questions (event-driven off
      AGORA_QUESTION_SHOW itself, not DOM-visibility polling — a whole round
      can finish in a couple of seconds, fast enough that a re-armed
      `waitForSelector` missed it outright before this fix), the proof
      beat's exactly-1 highlight on the right subject with 0 slab nodes, and
      a mid-expose reload redrawing identical counts/hexes.
      **The phone view is built too (Task 209)** — ControllerScreen.tsx:
      AGORA_EXPOSE is a plain "Κοίτα την τηλεόραση" hold screen — the
      payload's `spec` IS symmetric to TV/phone alike, but the phone never
      reads any of it, and renders no countdown either (nothing in this
      file does; only the TV owns a clock). AGORA_QUESTION reuses the
      plain QUESTION answer grid/testid/tap-lock verbatim (no `category`/
      `question` text travels to a player at all — `AgoraQuestionShowPlayerPayload`
      — so only a question-progress readout fills that header slot), plus,
      for `kind: 'colour'`, a swatch chip per option
      (`data-testid="agora-swatch"`) whose hex is looked up from
      AGORA_COLOURS by matching the option's own Greek text (see
      shared/src/agora.ts above) rather than travelling on the wire.
      AGORA_REVEAL is the standard personal result card, asymmetric by
      design like the reveal's own `proof` — no scene, no proof, on the
      phone. Verified with `npx tsx dev/agora-phone-check.ts`
      (agora-scene-check.ts's own spawn/cleanup shape, its own throwaway
      ports 3904/5905): one real phone + 2 bots through a full standalone
      round, 3/3 lock-ins confirmed over the phone's own socket (not DOM
      inference — `player:agora_submit` sent / `answer:accepted` received),
      all 4 swatch hexes matching their computed `background-color`, 0
      scene-derived DOM nodes on the phone at runtime during any
      AGORA_QUESTION, and an unchanged plain-quiz answer grid as regression.
      **Player figures leave the market frame during AGORA_EXPOSE and the
      AGORA_REVEAL proof beat (Task 210)** — visible again during
      AGORA_QUESTION with a genuinely LIVE lock-in ticker
      (`agoraQuestionAnsweredIds`, off `answer:progress`'s own
      `answeredPlayerIds` — the trial's own `lockedInPlayerIds` is frozen at
      question-start and wouldn't show real movement here). Krater and
      Socrates are untouched either way. See TV layout's own "the market
      frame belongs to the market" rule below for the mechanism and file:line.
      Verified with `npx tsx dev/agora-sophists-check.ts`
      (agora-scene-check.ts's own spawn/cleanup shape, its own throwaway
      ports 3903/5904).
Full (134, relined by Task 214): THE game — the LOCKED lineup, seven stages,
      each announced, then the ONE GAME_OVER:
      1 Η Αγορά (quiz + POWER_UP) -> 2 Η Παλαίστρα (one blitz window,
      BLITZ_STATEMENT_COUNT = 12 statements) -> 3 Ζωγραφική (draw)
      -> 4 Εκτίμηση (3 numeric) -> 5 Η Μνήμη της Αγοράς (one agora round)
      -> 6 Η Συκοφαντία (quiz + STEAL) -> 7 Η Ανάβασις (the climb, entered
      with accumulated scores as the ladder's entry order) — or Η Δίκη in
      that same row when the VIP sets finaleMode back to 'trial'.
      **Reference timing, socket-level bots, NOT a human estimate**: a
      seeded `?bot=3` full run (default settings, `gameLength: 'long'`)
      takes ~845-870s end to end across all seven stages — 844.2s in Task
      214's own run (its per-stage table: Η Αγορά 119.1s, Η Παλαίστρα 41.5s,
      Ζωγραφική 225.6s, Εκτίμηση 61.6s, Η Μνήμη της Αγοράς 77.7s,
      Η Συκοφαντία 124.6s, Η Ανάβαση 183.1s — tasks/214-report.md), 870.3s in
      Task 215's own run (tasks/215-report.md). This is a FLOOR: bots answer
      in ~0.3-1.5s and there is no real human deciding, reading a card, or
      asking "wait, what does this button do".
      It COMPOSES the five standalone mechanic modes (which stay
      VIP-selectable as the dev harness) through three optional GameMode
      hooks — stagesFor, beginStage, advanceAfterSegment. See
      modes/README.md. StageSegment (shared) is
      'quiz'|'draw'|'numeric'|'blitz'|'agora'|'trial'; the finale is the
      'trial' ROW in every table regardless of which finale actually runs
      (buildStageAnnounce swaps the card's words off room.climb/room.trial).
      Task 214 added no mechanic and retuned nothing: blitz uses its own
      BLITZ_* constants and scoring verbatim (still true after 215 — blitz
      was untouched). Task 214 left the agora segment scoring at scale 1 and
      the draw stage at 1/1/3 rounds as KNOWN, deliberately-untouched gaps;
      **Task 215 closed both** (see FULL_AGORA_SCORE_SCALE and
      FULL_DRAW_ROUNDS_BY_LENGTH below) — tasks/215-report.md has the
      before/after numbers.
      FULL_QUIZ_QUESTION_COUNTS (shared) gives EACH quiz stage's count by
      gameLength: short 2, medium 3, long 5 (so stages 1+6 total 2+2/3+3/5+5).
      Draw round count is gameLength-dependent since Task 150
      (FULL_DRAW_ROUNDS_BY_LENGTH: short 2, medium 2, long 3 — Task 215
      retuned short/medium up from 1 to match the locked lineup's own
      "Ζωγραφική x2 rounds"; standalone draw's own room.settings.drawRounds
      setting is untouched). **DEFAULT_ROOM_SETTINGS.gameLength is 'long'**
      (shared/src/index.ts) — a fresh room nobody has touched the length
      setting on therefore plays the `long` row, i.e. 3 draw rounds by
      default, not 2; the 215 retune is visible only once the VIP picks
      short/medium. Numeric count (3) stays fixed regardless of
      length. Every segment count is a CALL-SITE parameter
      (startDrawSegment(room, totalCycles, guessScale),
      prepareNumericGame(room, questionCount)) — standalone modes pass their
      own constants (standalone numeric still asks NUMERIC_QUESTION_COUNT =
      5), full.ts passes its own (FULL_NUMERIC_QUESTION_COUNT = 3); neither
      mode's shell branches on who's calling it.
      FULL_QUIZ_SCORE_SCALE / FULL_GUESS_SCORE_SCALE / FULL_AGORA_SCORE_SCALE
      (all three 400/(BASE_POINTS+SPEED_BONUS_MAX) = 400/(1000+500) ≈ 0.267,
      kept as three separate constants since each scales a different call
      site) put a max-speed quiz answer, guess and agora answer at ~400 in
      FULL ONLY, matching
      DRAWER_MAX_POINTS — passed as calculatePoints' existing `scale` arg
      (default 1, standalone quiz/draw/agora unaffected), never a mode check
      inside the scoring function. Agora's own scale (Task 215) is NOT a
      stage-table field like quiz's `scoreScale` — it's a call-site parameter
      on startAgoraSegment(room, scale), stored once per round on
      AgoraState.scoreScale (modes/agora.ts), the same "call-site parameter,
      not a mode check" shape startDrawSegment's guessScale already used.
      STEAL's transfer and the drawer's round(400*correct/eligible)
      proportion stay INTENTIONALLY unscaled. Blitz's flat
      BLITZ_CORRECT_POINTS/BLITZ_WRONG_POINTS are ALSO still unscaled in full
      — Task 215 only closed the two gaps its own task named (agora scale,
      draw rounds), not blitz's.

`paused` is a boolean flag, NOT a phase.
**There is no mid-game SCOREBOARD** — scores live in the TV's right-hand
column at all times. Do not reintroduce one.
Every quiz question is entered via enterQuestionOrPowerUp() — the only gate.
STAGE_ANNOUNCE is a real held phase: the stage card shows alone and the
question timer starts only after it.
continueAfterReveal() is the one function deciding what follows a REVEAL.
SOCRATES is skipped entirely when no moment fires.
Draw and numeric got their own SOCRATES moments in Task 138/139
(recordDrawGuessRoundAndPickLine / recordNumericRoundAndPickLine, socrates.ts)
— detection logs unconditionally, but the phase only fires if the moment's
line pool (DRAW_LINES / NUMERIC_LINES) has an unused entry; empty/exhausted
detects and stays silent (Task 138 shipped with zero lines; 139 wrote them).
Η Συκοφαντία plays SYKOPHANTIA_INTRO_LINES via `STAGE_INTRO_LINES['steal']`
(socrates.ts) — **keyed by StageIntroIdentity since Task 218, not by table
position.** Found during Task 216's doc-accuracy pass (the pre-218 numeric
keying broke the instant Task 214 moved Η Συκοφαντία from stage 4 to stage
6 in full's table — full's own Η Συκοφαντία played NO stage-intro line for
one task's worth of commits); Task 218 fixed it by re-keying the whole
table off `stageIntroIdentity(definition)` (socrates.ts) — `'quiz'` for any
plain quiz-segment stage (standalone quiz's Η Αγορά AND Οι Σοφιστές are
MERGED into this one pool now, since neither StageSegment nor this scheme
distinguishes them — full's own Η Αγορά shares it too), `'steal'` for any
`stealAfterEveryQuestion` stage, `'blitz'/'draw'/'numeric'/'agora'/'finale'`
reserved but never populated (full.ts's `beginStage` hook already
intercepts those segments before `pickStageIntroLine` is ever called for
them, and the finale row is announced through its own
room.trial/room.climb branches instead — see tasks/218-report.md). The
trial's own announcement plays TRIAL_INTRO_LINES — the five "Η Δίκη" lines
moved verbatim off quiz stage 3 in Task 139 to keep their lineHash-keyed
mp3s valid — via pickTrialIntroLine (phases.ts:171).
**Η Δίκη is the quiz's FINALE, not a mode** (Task 127): startTrial() is
entered from advanceToNextQuestionOrGameOver, reuses the STAGE_ANNOUNCE
phase for its card, draws from the UNUSED question pool, and is the only
thing between the last quiz question and GAME_OVER. Score IS life there;
elimination is checked at TRIAL_REVEAL and nowhere else, and elapsed comes
from remainingActiveTimerMs() so a pause freezes the drain. Drain itself is
computed ONCE, server-side, at lock-in (trialElapsedMs + trialDrain in
phases.ts/trial.ts) — there is no per-second server tick. Both the hit and
the drain rate are PROPORTIONAL, not fixed: trialWrongHit/trialDrainPerSec
(shared/src/index.ts) scale off `referenceLife`, the highest entry score
among the trial's contestants, fixed once at trial start (Task 185). The TV's
per-second countdown-driven drain (HostScreen.trialDisplayStandings) is a
COSMETIC re-derivation of that same formula for display only; TRIAL_REVEAL
always shows the server's real standings, no local math. buildStageAnnounce
(payloads.ts) always counts the trial in totalStages (quizStages + 1), so
its card reads e.g. "4/4", never "3/4".
**The climb (Task 188a) is the DEFAULT finale since Task 214**, with Η Δίκη
as the alternative — both gated by `room.settings.finaleMode`
('trial' | 'climb', **default 'climb'** since 214 flipped it; type + default
in shared/src/index.ts, search `FinaleMode`/`DEFAULT_ROOM_SETTINGS`). It is a VIP
lobby setting (ControllerScreen.tsx:3216-3218's finale-mode selector,
same `vip:update_settings` path as every other room setting), so — like
every other room.settings field — it lives on the Room object and survives
a host reload via HOST_REJOIN with no setting-specific code of its own.
advanceToNextQuestionOrGameOver is the ONE site that branches on
it (startClimb vs startTrial); quiz and full both honour it since they share
that site. CLIMB_* constants (all shared/src/index.ts): `CLIMB_TOP` = 10
(the top step, a win); `CLIMB_ENTRY_GAP` = 3 / `CLIMB_ENTRY_BASE` = 1 (entry
step spread by competition rank, climbEntryStep); `CLIMB_QUESTION_TIME_MS`
= 22000 (fixed, not questionTimeMs); `CLIMB_MAX_QUESTIONS` = 24 (question
pool drawn at climb start); `CLIMB_MAX_ROUNDS` = 24 (the round cap that
actually ends it — MAX_QUESTIONS must stay >= this so pool exhaustion is
only ever a second guard); `CLIMB_STAGE_TITLE`/`CLIMB_STAGE_TAGLINE` = the
"Η Ανάβαση" stage-announce card text. startClimb takes the same finale row
(card title CLIMB_STAGE_TITLE), draws from the unused pool, runs
CLIMB_QUESTION -> CLIMB_REVEAL on the quiz's continuations
table, and ends at GAME_OVER with `isTrialResult: true` (steps are not
scores; no digits). Steps live in room.climb.steps, NEVER player.score; the
mechanic is climb.ts (Task 187). CLIMB_REVEAL is ASYMMETRIC (host gets every
row, a phone only its own `your*` fields) — unlike TRIAL_REVEAL. Two
arrivals in one reveal go to the duel below. **The TV view is built
(Task 189)** — AnavasisScene (client/src/components/AnavasisScene.tsx),
a sibling to TheatreScene, swaps in for TheatreScene+SophistsRow for all
four climb/duel phases plus the climb's own GAME_OVER (HostScreen's
`isClimbFinale`, set by any climb/duel payload, cleared only at LOBBY —
`phase` alone can't tell a climb GAME_OVER from a trial one). Climbers
render on lane fractions of the narrowing stair (AnavasisClimbers, no
SophistsRow reuse, no digits, ↑/↑↑/↓/↓↓ deltas); the duel gets its own
scrim+tablets+verdict (AnavasisDuel); the winner is crowned at the temple
(AnavasisCrowning). **The phone view is also built (Task 190)** —
ControllerScreen.tsx: CLIMB_QUESTION reuses the plain QUESTION answer grid
verbatim plus a compact step strip (ClimbStrip); a non-climbing spectator
gets a spectator notice instead. DUEL_PICK gives a duelist three weapon
slabs, a spectator only a "look at the TV" caption with NO weapon UI in
its DOM at all (a render branch, not a hidden/disabled one).
**Η Μονομαχία (Task 188b) is the climb's duel**, two more quiz phases
DUEL_PICK -> DUEL_REVEAL. Trigger: two arrivals at CLIMB_TOP in one reveal
(3+: the two fastest duel, the rest are held at TOP−1), OR a shared highest
step at the round cap — CLIMB_MAX_ROUNDS = 24 (shared, 188c) ends the climb even
with questions left; pool exhaustion is a second guard the same resolver
(resolveClimbAtCap) serves. ONE tie-break everywhere: climb.ts's
pickDuelists, by the final round's answerRank. Weapons xifos > dory >
aspida > xifos (duelOutcome, shared). Picks live in room.climb.duel.picks
and are SERVER-SIDE ONLY until DUEL_REVEAL — no builder reads `picks`; the
reveal payload comes from the frozen duel.lastReveal. DUEL_PICK is 20s
(DUEL_PICK_TIME_MS) on the quiz continuations table; the second pick fires
the host-only `duel:locked` beat and re-arms the timer as 'DUEL_LOCKED'
(DUEL_LOCK_FLOOR_MS = 2000, then the audio backstop only if a line fired —
DUEL_LINES.DUEL_LOCKED is EMPTY by design, the 138 pattern, so the floor
alone carries it; `socrates:audio_ended` during DUEL_PICK routes to
onDuelAudioEnded). Timeout assigns a uniform-random weapon flagged
`assigned: true`. Same weapon = tie: DUEL_PICK again, no cap, tieCount in
the host payload. Bots pick at random after 400–1500ms. The Monte Carlo
harness (seed 187, 0.7/0.5 skill) puts rounds-to-verdict at median 8, p99
21, so the cap at 24 fires in 2 of 400 runs; at 16 it fired in ~5% (188b's
finding, which is why 188c raised it). `--cap N` shows the uncapped tail.
The TV view is built (Task 189, see above); the phone view is built too
(Task 190, see above) — DUEL_REVEAL is public/symmetric on the phone like
TRIAL_REVEAL, both duelists and spectators see the same reveal.
The reveal's spoken VERDICT line is built client-side, not server-sent:
`buildDuelVerdictLine` (client/src/components/duelVerdict.ts, Task 197) —
a pure function taking the DUEL_REVEAL payload's actual `weaponA`/
`weaponB`/`winnerPlayerId` and narrating whichever weapon actually WON
beating whichever actually lost, never assuming a fixed side. Fixes a bug
where the old inline version always narrated from `weaponA` regardless of
the real winner, and had `WEAPON_BEATEN` keyed backwards from
`DUEL_BEATS`'s real cycle — wrong pair on nearly every reveal. `DUEL_LINES.
DUEL_LOCKED` (socrates.ts:543) is still an empty array by design (the 138
pattern) — silent until content is written for it, not a bug.
**Η Μονομαχία is ALSO its own standalone GameModeId** since Task 191
(server/src/modes/duel.ts) — the same dev-harness pattern draw/numeric
follow: zero mechanic of its own, `phases` = LOBBY -> DUEL_PICK ->
DUEL_REVEAL -> GAME_OVER, `minPlayers: 2`. `start()` picks the duelists as
the first two CONNECTED players by join order and hands off to the exact
same `startDuel`/`submitDuelPick`/`endDuelPick`/`endDuelReveal` code the
climb finale runs — no second implementation. Since a bot is never VIP
(Core rules above) and only the VIP can call `vip:start_game`, a
bots-only standalone-duel room can never start itself: a real human has
to be present and press Έναρξη.
**Η Λόγχη, the spear elimination rule (Task 203), IS LIVE** — the mechanic
lives in server/src/climb.ts (`applyClimbSpearRound`/`nextAfterSpearRound`/
`nextAfterSpearEliminations`), with its own Monte Carlo extension
(`server/scripts/trial-montecarlo.ts --spear on|off|auto`) and unit check
(`npm run climb:spear-check`, 17/17 checks), and Task 205/205b wired it into
the real phase machine: `endClimbQuestion` (phases.ts:1487) calls
`applyClimbSpearRound` every reveal. (This paragraph said "a PURE MECHANIC
ONLY — NOT wired into the live climb" until Task 225, which watched real
reveals strike real players out over real sockets — it had been stale since
205.) The rule: auto-gated to
`CLIMB_SPEAR_MIN_PLAYERS` = 4 (inert below that); sitting at step 0
through a negative round (wrong OR no lock-in) increments a per-player
counter, a correct lock-in (always a move OFF step 0) resets it to zero;
at `CLIMB_SPEAR_LIMIT` = 2 the player is speared out. Two or more struck
in the SAME round: the two fastest-REACTING (lock-in time, not
answerRank) duel it out with the top's own weapon mechanic, anyone else
struck that round is out outright; eliminations leaving exactly one
player standing win immediately — a second victory path beside CLIMB_TOP.
A trial GAME_OVER shows NO digits — no rank, no score — gated on
`gameOver.isTrialResult` (SophistsRow's hideScores; GameOverView has no
list at all since 161); standings are SURVIVAL order (winner, then reverse
elimination order), built from room.trial.eliminationOrder
(payloads.ts:391), never score (life can end negative). On the sophists
row, an eliminated figure sinks+fades (.out) and is removed outright
REORDER_DELAY_MS + GLIDE_MS (2200ms, see TV layout) after its reveal — the
same tween the reorder plays, so removal lands as the sink+fade finishes
(SophistsRow.tsx's useRemovedIds); the survivors re-space via `left`.

**The Η Ανάβασις CEREMONY (the climb's GAME_OVER) shows POSITION, never
points (Task 225).** There is exactly one winner; the quiz score's only job
is seeding entry steps (climbEntryStep), so it still travels in the payload
and is simply never rendered as a result. The whole TV page renders ZERO
digits there. Three rules the ceremony frame follows, all in HostScreen:
(1) it renders from `gameOver.standings` — the server's complete,
de-duplicated roster — not from the last live climb payload, which a spear
elimination has already shrunk by then (`climbClimberHistoryRef` keeps every
climber ever seen so their real step survives); (2) it HIDES NOBODY —
`climbHiddenPlayerIds` is empty at a climb GAME_OVER, since both mid-climb
reasons to hide a figure (a duelist drawn in the foreground, a player the
spear just struck) outlive their own round and had been hiding the WINNER
after a duel-decided climb; (3) the winner is forced onto the top visual step
(`visualStepFor(top, top)`, directly under the wreath) even when the
round-cap verdict crowns someone who never reached CLIMB_TOP. `handleGameOver`
also clears duelPick/duelReveal, or a duel-decided climb ends with
AnavasisDuel still mounted over the crowning (the other exit from
DUEL_REVEAL was already cleared by handleClimbQuestionShow, Task 219).
AnavasisScene's `useClimbMovement` returns the CURRENT climbers whenever
`revealKey === null`: its effect only re-runs on a new revealKey, and
PHASE_CHANGED lands one render BEFORE the game_over payload, so the ceremony
otherwise paints the previous round's positions. Check:
`npm run climb:ceremony-check` (dev/climb-ceremony-check.ts — real server
in-process on a throwaway port, real client, real browser; five scenarios:
a duel-decided finish, a spear elimination on the winning reveal, the round
cap with several still climbing, a top-arrival win at every player count 2-6,
and a socket-level ranking check reading the elimination order off the
reveals and the standings off game_over; 94 checks. `ONLY_SCENARIO=A` runs
one).

**Anavasis TV invariant (Task 192): no on-screen text while any body is
moving**, enforced as a strict per-round FRAME alternation — Frame A
(CLIMB_QUESTION, a motionless read) then Frame B (CLIMB_REVEAL, movement).
CLIMB_REVEAL renders no slab at all (ClimbRevealView.tsx is a 1x1px hidden
marker only — the read content is UNMOUNTED, not merely hidden); it opens
with a still `CLIMB_BEAT_MS` = 800ms beat showing each climber's up/down
arrow, then glides everyone to their new step over `CLIMB_GLIDE_MS` =
1500ms (both AnavasisScene.tsx, exported). TheatreScene's `LIT_PHASES`
includes CLIMB_REVEAL for the same alternation (dimmed read / lit
movement), though TheatreScene itself never actually renders during the
climb (AnavasisScene swaps in). Task 198: Socrates must never occlude the
CLIMB_QUESTION slab — `ClimbQuestionView`'s `SLAB_WRAP_STYLE` sits at
`zIndex: 3`, above SocratesFigure (1) and AnavasisClimbers (2), so the
slab paints on top of every scene actor regardless of DOM order. Task 199:
that same wrapper has a determinate `height: '42vh'` (was auto-height, so
`useFitFontSize`'s shrink never triggered and the bank's longest question
pushed the slab to 1148px, past the 720px canvas) with `MarbleSlab` at
`flex: '1 1 0'` inside it — the same "give the slab real height so its
flex children have something to shrink against" shape `TrialQuestionView`
already used via GameLayout.

The VIP's crowd/voice sliders (Task 178) are collapsed behind one toggle
button by default (`VipAudioControls`, ControllerScreen.tsx:361, ten call
sites, `expanded` is the component's own mount state — Task 192). Task 195
traced every `voiceGain`/`bedGain` write and confirmed empirically
(`voiceGain.gain.value` = 1 at construction and at the first live SOCRATES
beat with the panel never opened) that this collapse does NOT affect
playback — it is pure UI, not a "must expand the slider to unmute" trap.
An unrelated real bug existed alongside it (playSocratesLine's fetch/
decode/start failures failed completely silently, Task 154's design) —
195's actual fix was adding the two `console.warn` calls the Core rules'
audio bullet already covers, not anything about the collapse.

"Phase" = the state machine. The progression of the show is a STAGE.
Never write "phase 1" when you mean a stage.

## Stages (quiz)

QUIZ_STAGES in shared owns the shape: stage 1 = 3 plain questions,
stage 2 = 5 questions each preceded by POWER_UP, stage 3 = 4 questions
each FOLLOWED by a STEAL. Stage 3's title is "Η Συκοφαντία" (Η Δίκη is the
trial finale, not this stage — see Phases for its STAGE_INTRO lines).
Question count is NOT a setting — it is the sum of the stages. room.stage is server-side; the TV
announces each stage once.
`room.settings.powerUpsEnabled` defaults to **false** (Task 177) — with it
off, stage 2's POWER_UP phase is skipped entirely even though the stage
still calls for one; the POWER_UP machinery itself must never be deleted.
The screenshot harness opts in (`powerUpsEnabled: true`) specifically to
keep its 21/21 TV-phase coverage.
Landed effects STACK per target: ice in duration (10s cap), ink in
intensity (cap 3), both via addAppliedSabotage().

## TV layout

- **Fit within 690px, not 720px** — real TVs crop 2-3% of the panel.
  `--tv-safe-top` and `--tv-safe-bottom`, both in the palette, are the two
  knobs; never tighten screens one by one.
- **Centered flex overflow is INVISIBLE to scrollHeight.** The host
  container is overflow:hidden, so content is clipped silently. Only
  per-element bounding-box checks against the viewport catch it.
- **MarbleSlab (renamed off PapyrusPanel in Task 159) must stay
  `flex: 0 0 auto`.** Its content is text and cannot compress; let it
  shrink and the text bleeds off the slab.
- **TOP is read, BOTTOM is players (Task 161).** The read column
  (hostStyles.gameLayout: left 7%, width 72%, top --tv-safe-top, height
  READ_AREA_HEIGHT = 100vh − safe-top − 38vh, i.e. 5vh..62vh) holds the
  marble slab; the sophists row stands below it (bottom 6.5cqh, 30cqh tall,
  figures 14cqh wide at `left` = (rank+.5)/n); the krater is at right 6%,
  top 13%. Nothing on the slab names or counts players — standing
  exceptions: "X ζωγράφισε αυτό" in GUESS/GUESS_REVEAL, the steal
  announcement, the trial's winner line and the GAME_OVER winner banner.
  There is NO standings list on GAME_OVER; the row is the standings.
- **The sophists row lives in HostScreen, NOT inside a phase view.** Put
  it back inside one and it unmounts on every phase change, silently
  killing the 1800ms-settle-then-700ms-`left`-glide reorder
  (REORDER_DELAY_MS = useAnimatedNumber's DEFAULT_DURATION_MS = 1800,
  LEFT_TRANSITION_MS = 700; GLIDE_MS = 400 still times the trial removal).
  It is ALWAYS mounted (opacity 0 in LOBBY/STAGE_ANNOUNCE, 0.6 in
  SOCRATES/STEAL), so its removedIds reset on LOBBY, not on unmount.
  Figures sort by the server's `rank` (score order, ties in join order;
  survival order after a trial), never by raw score, so the cosmetic trial
  drain never shuffles the row mid-question. Colour never encodes: the
  leader gets the wreath + wine score, deltas are ember with the sign.
- **densityScale steps at player-count thresholds (<=3 → 1, <=5 → 0.82,
  <=6 → 0.68, 7-8 → 0.56), so the worst case is the count just BELOW a
  threshold, not MAX_PLAYERS.** GAME_OVER overflowed 720p at 5, not at 8.
  Height checks must sample 3, 5, 6 and 8.
- **"The market frame belongs to the market" (Task 210, its own dev/
  agora-sophists-check.ts:1 phrase).** The sophists row gets one prop,
  `forceHidden` (SophistsRow.tsx:110/465), OR'd into the SAME
  `.sophists--hidden` opacity-0 treatment STAGE_ANNOUNCE already uses
  (SophistsRow.tsx:502) — no new animation vocabulary for agora. HostScreen
  sets it to `phase === 'AGORA_EXPOSE' || agoraProofShowing`
  (HostScreen.tsx:2364; `agoraProofShowing` was already computed for the
  scene swap, HostScreen.tsx:2280) so player figures are out of frame
  exactly when the market itself owns the screen, and back — with a live
  lock-in ticker — once it's the players' turn during AGORA_QUESTION.
  Krater and Socrates are untouched either way.

## Phone layout

- The 690px rule is TV-ONLY. The phone criteria are 44px minimum tap
  targets and zero horizontal overflow at 360px wide.
- Answer options render as a plain 2x2 text-only grid — no shapes, colours,
  or numbers (AnswerShape deleted in 120).
- DrawingCanvas's toolbar is TWO rows — colour (swatches + wheel), then
  action (tools + sizes) — each control wrapped in a 44px hit-area box
  around its unchanged visual (122).

## Drawing mode

Guess-from-options, not free text. Everyone draws at once, then each drawing
goes up in turn and everyone else picks from four words.
WORD_SETS rows are { words: [4], rotatable }; the target is chosen at deal
time, and two players must never get the same target word — but only
WITHIN one cycle's deal — and, since Task 153, across cycles too:
DrawState.usedWords (modes/draw.ts:112) carries every dealt target for the
whole game and dealAssignment(room, usedWords) drops any WORD_SETS row
holding one before it shuffles. Pool-short fallback (draw.ts:221): if the
filtered pool has fewer rows than connected players it warns and deals
from the FULL pool, allowing repeats for that cycle only. Verified 12/12
distinct words in a long full bot game.
The drawer scores round(400 * correct / eligible) — a proportion, so it
measures clarity, not player count. Export bakes the canvas background
(flattenToPaper) so an erased area and a paper-colour stroke render
identically — PAPER = #F6EEDC (landed in a75b2e6; the white swatch reuses
this same value, it is not literal white).

## Numeric mode

Standalone AND, since Task 134, composed as a stage of `full` (stage 4 of
the locked lineup since Task 214, was stage 3 before) — both true at
once (modes/full.ts calls startNumericSegment, same entry point the
standalone mode uses). server/src/numeric.ts imports nothing from modes/ —
MODE-AGNOSTIC, still true — so it needed no change for that composition.
`max` is derived from the answer, never authored. NUMERIC_QUESTION_COUNT
(shared, = 5) is a fresh random draw every standalone game (shuffle().slice
(0, count) in modes/numeric.ts); full uses its own fixed count
(FULL_NUMERIC_QUESTION_COUNT = 3) instead.
scoreNumericSubmissions (server-only; the /dev/numeric client tool doesn't
import it) scores only SUBMITTERS — N is the submitted count, not the room's
player count. A non-submitter is flat 0, ranked past every real rank.

## Blitz — a real mode now (Task 156), plus its own dev prototype

GameModeId (shared/src/index.ts) is `'quiz' | 'draw' | 'numeric' | 'full' |
'blitz' | 'duel' | 'agora'` (GAME_MODE_IDS, 7 values — 'duel' is Task 191's
standalone dev-harness mode for Η Μονομαχία, 'agora' Task 207's standalone
Η Μνήμη της Αγοράς, see Phases above), and
server/src/modes/blitz.ts calls
registerGameMode — it IS in the registry, with its own phases (LOBBY,
BLITZ, BLITZ_REVEAL, GAME_OVER). A room can play blitz as a real
multiplayer game: the TV has host/BlitzView.tsx and
host/BlitzRevealView.tsx, and the phone has its own branch in
ControllerScreen.tsx (BlitzSwipeCard, Task 181's "card follows the finger"
rebuild, titled "Η Παλαίστρα" through greekUpper same as every other
title). Crowd mood is wired in from the mode's own Task 156a build (see
Crowd mood below). **COMPLETE, TV and phone both** — not a prototype; the
dev-only swipe screen two paragraphs down is a SEPARATE thing. Since Task
214, blitz is also composable: `full`'s stage 2 (Η Παλαίστρα) calls this
exact mode's `prepareBlitzGame`/`startBlitzSegment` (modes/blitz.ts,
see Full above) — it was standalone-only before that.
Separately, /dev/blitz (DevBlitzScreen.tsx, Task 69) is STILL a standalone
solo phone-swipe prototype — one true/false statement at a time, swipe
right for ΣΩΣΤΟ, left for ΛΑΘΟΣ, time-bound round (BLITZ_DURATIONS_SEC
30/45/60/90) — with ALL state local (React + localStorage), no socket, no
room, and its own swipe-card implementation (not BlitzSwipeCard). The only
server piece specific to IT is blitzLog.ts (Task 70): one POST route at
BLITZ_LOG_PATH appending finished rounds to
/var/lib/aegean-blitz/rounds.jsonl, read over ssh, never served.
Both share the same statement pool: 218 authored statements (109 Σ / 109
Λ) live in blitz-statements.md at the repo root and are GENERATED into
shared's BLITZ_STATEMENTS block by `npm run blitz:generate` — edit the
.md, never the block.

## Voice

254 pre-generated ElevenLabs mp3s (LINE_TAGS' count) in client/public/voice,
named by lineHash(text, tag). Seven more orphaned mp3s (from replaced line
text; the seventh is Task 149's shortened SPLIT_GUESS) also sit in that
dir — nothing prunes them.
**lineHash does NOT include the voice ID** — switching voices overwrites
the SAME filenames rather than producing new ones. This is the central
trap of the whole voice system: a filename alone never tells you which
voice actually generated it. Current default NOpBlnGInO9m6vDvFkFC
(ELEVENLABS_VOICE_ID env var), switched in Task 147/148 from the original
gFpOFEriJA3T1VbGi2Be — restore the original by setting ELEVENLABS_VOICE_ID
back to it, or override for one run only with ALT_VOICE_ID.
dev/generate-voice-lines.ts's other overrides: ALT_OUTPUT_DIR (write
elsewhere instead of client/public/voice) and ONLY_HASHES (comma-separated
lineHash values, restrict generation to those). None change default
behavior when unset. **They are gitignored and cost credits to rebuild.**
In the dev copy that path is a SYMLINK straight into /opt/party-game's own
voice dir — the rsync target — so a normal incremental `npm run
voice:generate` writes directly into PRODUCTION. The .gitignore entry is
`voice` with NO trailing slash, because a trailing slash does not match a
symlink. A FULL regeneration (all 254 lines) instead writes to a staging
dir via ALT_OUTPUT_DIR and is swapped in only by running
`dev/voice/swap-staging.sh`, which refuses to swap unless the staged file
count matches what's expected.
SOCRATES ends on socrates:audio_ended from the host; SOCRATES_MAX_DURATION_MS
(11000ms) is a BACKSTOP, never a limit — source.onended actually drives
phase length, so an over-long clip really does hold the phase that long.
Measured ~100ms of audio per character: keep a line under ~95 characters to
land under the cap. Never raise the cap to make a clip fit — shorten the
line instead (Task 149).
Since Task 154 the host PREFETCHES every active clip on LOBBY entry: it
emits dev:get_voice_lines, the server answers with collectVoiceLineEntries'
hash list, and prefetchSocratesLines (useGameAudio.ts:290) fetches each
mp3 at low priority, four in flight, and DROPS the bytes — HTTP cache only,
never decoded (254 decoded buffers is too much for a TV browser), once per
hook instance. Failure path, same task: a 404, a decodeAudioData throw or a
source.start throw inside playSocratesLine now calls onEnded() at once
(useGameAudio.ts:273), so a dead clip emits socrates:audio_ended
immediately instead of holding the phase for the 11000ms backstop
(measured 11010ms before).
`npm run voice:generate` regenerates only changed lines and reports the
longest clip — that scan reads the mp3 DIRECTORY, not the active LINE_TAGS
hashes, so an orphaned line's mp3 keeps getting reported as "longest"
forever; that warning alone is not evidence of a real problem. `npm run
voice:index` builds the rating page.
Pitch shift (Task 144) and EQ-only processing (Task 145) were both tried on
this voice and REJECTED. Do not propose either again.

## Crowd mood

Server-derived mood (calm/tension/cheer/boo) via server/src/crowd.ts,
HOST ONLY (`crowd:mood` event) — the decision layer. Crowd playback
(Task 36a-d) IS built: client/src/hooks/useGameAudio.ts crossfades three
loops (murmur/unrest/roar) by `crowd:intensity` plus four cheer/boo
one-shots by `crowd:mood`, and this fully retired the earlier synthesized
cue set (Task 20) — do not describe playback as unbuilt or the old cue set
as still live.
Since Task 151 it's wired into every mode (quiz already had it via
phases.ts; draw.ts and numeric.ts had ZERO wiring before, so a `full`
game's draw/numeric stages were silent; blitz had its own wiring from its
Task 156a build). A short full game emitted 48 crowd:mood events as measured
pre-Task-214 (the 5-stage lineup) — STALE now that `full` runs seven stages
(214) including two more crowd-wired segments (blitz, agora); not
re-measured since. LOBBY and TRIAL_QUESTION never get one attributed to
them — LOBBY because nothing ever calls setCrowdMood there, TRIAL_QUESTION
because its own setCrowdMood fires BEFORE that phase's `phase:changed`,
the same signal-ordering trap already documented below for PHASE_CHANGED
vs. a phase's own payload. Known, not fixed.

**VIP audio controls (Task 178):** `vip:set_audio_volume` is relayed
server→host, giving the VIP two independent sliders — crowd bed and
Socrates voice. The new crowd-master gain (bedGain) and voice gain
(voiceGain) sit ABOVE/BELOW the existing mute-gated outputGain and BELOW
the three-loop equal-power crossfade — never adjust the murmur/unrest/roar
gains individually to implement volume, always go through bedGain/
voiceGain. Defaults are 100/100, meaning CROWD_BED_GAIN (.6) and voice at
1.0 — unscaled, i.e. today's levels. Values persist across a host reload
via HOST_REJOIN.

## Traps that have bitten before

- **`grep` here is ugrep, and it reports NO MATCH — silently, exit 1, no
  stderr — on any file holding a NUL byte.** Not a Greek or locale problem.
  Two source files carry NUL deliberately (shared/src/index.ts,
  dev/screenshot-phases.ts, which use `\0` as a key separator). Grep those
  with `grep -a`, or a "not found" there is worthless.
- A commit deleting a file does NOT remove an untracked copy of it.
  After a rename or deletion, check `git status` for the ghost.
- destination-out over an anti-aliased edge only attenuates alpha to
  a*(1-a), never 0. More passes will not clear it.
- Suspect the screenshot harness first — it has twice accused the game wrongly.
- computeCompetitionRanks does standard 1,2,2,4 ranking. Duplicate rank
  numbers are genuine ties. Reported as a bug twice; it is not one.
- **PHASE_CHANGED is emitted BEFORE the phase's own payload at every emit
  site** (18 before Task 207, which added the agora's four) — the house
  pattern, every mode. The ONE exception, audited in Task 233b, is
  `enterStageAnnounce` (phases.ts:216-218), which emits its card BEFORE the
  phase change on purpose. **Since Task 233b the TV no longer renders that
  gap**: HostScreen keeps the server's phase in `socketPhase` and DERIVES the
  rendered `phase` from it, advancing it only once that phase's own payload
  has arrived (`payloadForPhase`), so the phase and the payload feeding the
  standings and the read slab always agree within one commit. Before that
  they did not, and 233a measured the cost: 49 stale commits per game that
  useAnimatedNumber stretched into a ~1.5s visible score drift, plus a
  resolved question re-rendered with a frozen timer. A NEW PHASE THEREFORE
  NEEDS AN ENTRY IN `payloadForPhase` — it is exhaustive over GamePhase, so a
  missing one is a type error, not a silently un-gated phase — rather than a
  view that tolerates a payloadless first render.
- **Trial elimination is `trialReveal.results[].eliminated`, NEVER
  `score <= 0` — and that flag alone is still not enough.** A sudden-death
  ROUND charges no drain/hit (`eliminated: !suddenDeath && lifeAfter <= 0`),
  so its survivors — even its winner — sit at or below zero without being
  out. Deeper (Task 137): the NORMAL round that DECLARES sudden death
  (everyone left crosses zero in the same reveal) flags EVERY one of them
  `eliminated: true` in that reveal, eventual winner possibly included,
  because they all go to the decider, not out. `trial.eliminationOrder` is
  gated on `next.kind !== 'SUDDEN_DEATH'` before recording anyone
  (phases.ts:1042-1043), and the client's row-removal gates the same way on
  `trialReveal.nextSuddenDeath` (HostScreen.tsx trialConfirmedOutPlayerIds,
  ~1123) — reading `eliminated` alone, without checking whether THIS reveal
  triggers sudden death, over-eliminates. See
  HostScreen.trialEliminatedPlayerIds/trialConfirmedOutPlayerIds and
  ControllerScreen's `myTrialResult.eliminated` for the correct pattern.
- **Phase-scoped CLIENT state must be cleared on every transition that could
  follow it, not just the phase that "normally" ends it** (Task 140). A
  stale `numericReveal` in ControllerScreen sat above `question`/
  `trialQuestion` in the render if-chain (1588 vs. 1851/1969) and, since
  nothing but a fresh `numeric_question:show` ever cleared it, masked every
  phone view from the end of `full`'s numeric segment through the whole
  trial. Fixed by clearing it in `handleQuestionShow` itself (line 878 as
  of Task 209 — line numbers here drift as the file grows; the function is
  the fix, not the number), the first event of ANY quiz question.
  Corollary: bots answer at the SOCKET
  level (dev/screenshot-phases.ts:190's `joinBot` returns a raw Socket) and
  never render a phone — a bug like this one needs a Playwright phone
  client or a human, never a bot run.
- **Deploy confirm strings must be runtime literals — event names, setting
  keys — never function or variable identifiers.** The production build's
  minifier renames identifiers freely but leaves string literals alone, so
  confirming a deploy landed by grepping the built bundle for a function
  name is worthless; grep for the literal (e.g. `'vip:set_audio_volume'`
  or `'powerUpsEnabled'`) instead.
- **A pause-timing acceptance check must diff `remainingMs` against an
  injected virtual clock (Task 184's `VirtualClock`/`installTimerClock`
  pattern, server/src/timers.ts), never the real one.** A real-clock run's
  `remainingMs` readback can be a millisecond or so off across a pause/
  resume — clock-read granularity, not timer drift — and a check expecting
  bit-for-bit equality there reads as a false failure. dev/agora-wire-check.ts's
  `--pause-virtual` flag (installTimerClock before the server module even
  loads, so `resumeActiveTimer`'s stamp and the readback share one `now()`)
  is the pattern to copy for any future pause-timing check.
- **A stale/empty LOBBY standings snapshot can reach a phase that carries
  none of its own**, if a lobby update and the first phase-change land
  close enough together to batch into one React render — HostScreen's
  `lastStandingsRef` fallback (untouched by Task 210, which is where this
  was observed: 0 sophists briefly during AGORA_EXPOSE in one run of a
  fast join-then-start sequence, tasks/210-report.md). Predates Task 210,
  isn't agora-specific, and every criterion it was observed under still
  held (0 figures VISIBLE either way, which was the actual requirement).
  Known, not fixed.
- **Η Ανάβασις (the climb finale) ignores `room.settings.gameLength`
  entirely** — `startClimb` (phases.ts) draws its question pool via
  `CLIMB_MAX_QUESTIONS` = 24 and the round cap is `CLIMB_MAX_ROUNDS` = 24
  (both shared/src/index.ts), neither read off `gameLength`; grep confirms
  climb.ts/phases.ts's climb path never references it. A `short` full show
  therefore still ends on a finale that can run up to 24 rounds (~24s each —
  22000ms question + CLIMB_BEAT_MS/CLIMB_GLIDE_MS's ~2.3s reveal — so up to
  ~580s, the same order of magnitude as everything BEFORE it combined, per
  tasks/214-report.md's own six-stage sum), same as `long`. Known,
  deliberately not capped —
  pending a human playtest to decide what a gameLength-scaled cap should be,
  not fixed here.

## Working style

- Read only the files you need. Do not explore the whole repo.
- Keep final reports under 8 lines.
- **Report on EVERY acceptance criterion, individually**, with numbers.
  "Typecheck passes" is not evidence for a behavioural criterion.
- A criterion must always name its fallback value, never a bare pass:
  "report anything over 720px; if none, report the tallest element".
- Verify by running things, not by reading code and reasoning about it.
- When a task copies content from a document into code, count the rows.
- Move code rather than rewriting it during refactors.
- One task = one file at `tasks/NNN-name.md`, committed with its work.
