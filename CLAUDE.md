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

- **/home/argyrios/Aegean is the ONLY place code is edited, run and committed.**
- **All work runs as user `argyrios`, not root.**
- **/opt/party-game is production.** It is written ONLY by
  /usr/local/sbin/aegean-deploy.
  Never edit it, never run a dev server in it, never git in it.
- Ports: production 3001 (127.0.0.1, Caddy-proxied), dev server 4001,
  Vite 5173. Never start anything on 3001.
- **Never touch a process under /opt/party-game.** A `pkill -f tsx` kills
  production along with your own shells. Kill any dev server you start
  before reporting.
- **Never use pkill or killall.** Find the PID (lsof -i :4001) and kill
  that exact PID. A pattern match protecting production by coincidence of
  path is not protection.
- **Deploy is `sudo /usr/local/sbin/aegean-deploy`, and nothing else.** A
  root-owned wrapper (root:root 0755) that argyrios may invoke with no
  password and no arguments. It aborts loudly on a dirty tree, refuses to
  ship anything not already pushed to origin/main, never passes `--delete`,
  and builds as `partygame` rather than root.
  **Run it ONLY when Argyrios says so in that turn** — "deploy", "run
  aegean-deploy". Never on your own initiative, never rolled into another
  task because the work looks finished, and never carried over from an
  earlier turn's permission. Having the privilege to deploy without a
  password is NOT permission to decide when to deploy.
- `deploy/deploy.sh` is **GONE**, removed in this commit: it did
  `cd ~/Aegean-`, and no clone exists at that path (verified 2026-09-17), so
  as root it aborted on line 7. Do not resurrect it, do not cite it as the
  deploy path.
- Human fallback: root runs the SAME wrapper by hand
  (`/usr/local/sbin/aegean-deploy`). There is one deploy path, not two.
- Anything else about /opt/party-game stays off limits, and
  /usr/local/sbin/aegean-deploy is not a thing to edit.
- VOICE_MIN=100 since 2026-09-20 (was 283); deploy script also protects
  voice-line-review.json, voice-deleted, voice-staging (6 rsync guard
  lines). Voice file moves go through sudo -n aegean-ops (stage-clips |
  promote-to-bank <hashes>), both requiring --confirm ARGYRIOS-SAID-GO;
  promote refuses existing targets.

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
server/src/trial.ts      REMOVED (Task 258, found stale by Task 291) — Η Δίκη is gone
                         entirely: no file on disk, zero `startTrial`/`room.trial` references
                         in phases.ts or modes/full.ts. Η Ανάβασις (climb.ts) is the ONLY
                         finale. Every other mention of Η Δίκη/trial below this point is
                         HISTORICAL — describes a mechanic that no longer exists.
server/src/climb.ts      Η Ανάβαση (Task 187/188a) — the game's only finale — pure
                         mechanic only, no Room/io/timers: round
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
server/src/socrates.ts   Moment detection, Greek lines, LINE_TAGS, LINE_RATINGS.
                         Also SPEECH_V2_LINES (Task 294, a THIRTEENTH pool added by
                         296) — 39 lines copied verbatim from
                         content/speech-policy-lines.md, a SEPARATE table from
                         LINES/DRAW_LINES/NUMERIC_LINES so no v1 picker can reach
                         them. Their 39 LINE_TAGS entries are
                         load-bearing (the clip is lineHash(template, tag)); no mp3
                         exists for any of them until the October pass, so a v2 beat
                         404s and ends on the client's immediate ack (Task 154).
                         TWO EXCEPTIONS to that separation, both wired by Task 296
                         and both audible under v1 TOO, because they belong to unique
                         MECHANICS rather than to a stage's structural slot:
                         `DUEL_LOCKED` here IS DUEL_LINES.DUEL_LOCKED — literally the
                         same array, aliased, so one usedLines entry covers both names
                         (296 wrote the three lines 188b left empty; do NOT restore
                         that emptiness) — and `SPEAR_OUT` is read by phases.ts's
                         endClimbReveal through recordSpearOutAndPickLine. Neither
                         goes near pickSpeechSlot, so neither is gated on
                         room.settings.speechPolicy. QUIZ_BEST is the 13th pool,
                         the quiz stage's best side (see speechSlots.ts below).
                         A THIRD such exception since Task 300:
                         `SKIP_INTERRUPTED_LINES` (4 lines), what he says when the
                         room VOTES a narration quiet — see Voice below. It lives
                         in its OWN const beside DUEL_LINES, NOT inside
                         SPEECH_V2_LINES (which stays 13 pools / 39 lines), and is
                         drawn by `pickSkipInterruptedLine` through the plain
                         pickSpeechLine, never pickSpeechSlot — so it too is
                         ungated by speechPolicy. content/speech-policy-lines.md
                         is 14 pools / 43 lines as of 300; collectVoiceLineEntries
                         517 -> 521 (measured, both ends).
server/src/speechSlots.ts  Η v2 speech policy's SLOT ENGINE (Task 294) — pure decision
                         layer, no io/timers/phases. v2 (room.settings.speechPolicy,
                         Task 292) RETIRES per-reveal speech and speaks at fixed
                         per-stage SLOTS instead: quiz mid/close, blitz between-rounds
                         /close, draw between-rounds, Εκτίμηση close, Η Λήθη close,
                         Η Συκοφαντία first-steal/close. The quiz stage's two slots
                         draw from AGORA_WORST (worst side) and — since Task 296 —
                         QUIZ_BEST (best side, on BOTH the mid and the close). Before
                         296 the mid's best side was `null` and the close's was the
                         RUNAWAY_LEAD reservoir, so a stage whose WORST end was a tie
                         could say nothing at all. Reservoir pools stay live as extra
                         variety: STUCK_IN_LAST on the close's worst side,
                         DRAW_MID/NUMERIC_CLOSE wholly reservoir-backed. The four retired v1 sites are
                         gated at the PICKER, not the beat (phases.ts:890,
                         modes/agora.ts:427, modes/draw.ts:908, modes/numeric.ts:354) —
                         a picker left running consumes usedLines out of pools the
                         slots draw from. KEPT in v2: GAME_INTRO, every STAGE_INTRO,
                         the anavasis sequence, the coronation, DRAW_WINNER, and
                         DRAW_INTRO once per STAGE rather than per cycle.
                         Targets come from Task 293's stageExtremes; a stage's mid and
                         close prefer OPPOSITE ends (the alternation), with
                         ledger.targetedThisStage as the hard "never the same target
                         twice per stage" guarantee. A tie, or no untargeted standout
                         with a line, SKIPS — silence, never GENERIC_TRANSITION.
                         Slot beats ride the ordinary beat path (startSpeechSlotBeat,
                         phases.ts) under the CALLING MODE's own timer kind, because
                         the ack resolves its continuation from the mode's
                         continuations table by kind (modes/registry.ts) and not from
                         the closure — which is why BLITZ_SOCRATES had to join
                         BLITZ_CONTINUATIONS. Reservoir-backed slots (RUNAWAY_LEAD 1
                         line alive, STUCK_IN_LAST 3, after the deletion filter) go
                         silent once spent; the eight new-pool slots do not.
                         `speechPolicy` rides host:create_room (Task 222's precedent):
                         an all-bot room self-starts with no VIP, so
                         vip:update_settings is unreachable there.
                         Check: `npx tsx dev/294-slot-probe.ts` (pure, 16/16) and
                         `SCENARIO=V2 npx tsx dev/294-speech-policy-check.ts`.
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
      1 Η Αγορά (quiz + POWER_UP) -> 2 Η Παλαίστρα (BLITZ_ROUND_COUNT = 2
      blitz windows back to back since Task 253, BLITZ_STATEMENT_COUNT = 12
      statements EACH) -> 3 Ζωγραφική (draw)
      -> 4 Εκτίμηση (3 numeric) -> 5 Η Μνήμη της Αγοράς (one agora round)
      -> 6 Η Συκοφαντία (quiz + STEAL) -> 7 Η Ανάβασις (the climb, entered
      with accumulated scores as the ladder's entry order — the ONLY finale;
      `finaleMode`/Η Δίκη were removed at Task 258, see the file listing
      above and Task 291's diagnosis, tasks/291-speech-policy-diagnosis.md).
      **Reference timing, socket-level bots, NOT a human estimate**: a
      seeded `?bot=3` full run (default settings, `gameLength: 'long'`)
      takes ~845-870s end to end across all seven stages — 844.2s in Task
      214's own run (its per-stage table: Η Αγορά 119.1s, Η Παλαίστρα 41.5s,
      Ζωγραφική 225.6s, Εκτίμηση 61.6s, Η Μνήμη της Αγοράς 77.7s,
      Η Συκοφαντία 124.6s, Η Ανάβαση 183.1s — tasks/214-report.md), 870.3s in
      Task 215's own run (tasks/215-report.md). **Task 253 gave Η Παλαίστρα a
      second round**: two 5-bot `mode=full` runs of ONE harness
      (dev/253-blitz-rounds-check.ts) put that stage at 41.5s before and 79.5s
      after, whole show 505.5s -> 531.4s (tasks/253-blitz-second-round.md).
      Those two totals sit well under the 214/215 baselines because their
      climb finale happened to resolve in fewer rounds — the climb ignores
      gameLength and varies hugely run to run (see the trap below), so compare
      a STAGE against that stage, never one run's total against another's.
      This is a FLOOR: bots answer
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
**The end state (Task 239)** — a podium screen, client-only (no phase-machine
change: room.phase stays GAME_OVER throughout). `PodiumView.tsx` replaces
whichever ceremony was playing (GameOverView / AnavasisCrowning) once
HostScreen's `showPodium` flips true, `PODIUM_DELAY_MS` = 6000ms after
GAME_OVER; reset on every fresh GAME_OVER and on leaving it via play-again.
Renders `gameOver.standings` in the order the server already computed —
NEVER re-sorts — as name+avatar rows, ZERO digits (no rank, no score, no
step count; position on screen is the rank, SophistsRow's own idiom).
SophistsRow is force-hidden once `showPodium` is true. The VIP's phone
button is relabelled "Νέο παιχνίδι" (same testid `play-again-button`, same
`vip:play_again` mechanism — already did the full reset before this task,
untouched); non-VIP gets `waiting-for-play-again`, the LOBBY's own
"waiting-for-vip" idiom.
**The game timer (Task 239)** — `Room.stageTimings` (state.ts) records one
`{stage, title, startTs, endTs}` per stage, opened/closed inside
`enterStageAnnounce`/`finishGame` (phases.ts) — the existing functions every
stage transition and the real GAME_OVER already go through, no new call
site. Exposed as `GameOverPayload.stageDurations`/`gameStartedAt`/
`gameEndedAt` (additive). The TV's top-left clock (`GameClock.tsx`) ticks
off `StageAnnouncePayload.gameStartedAt` (additive, set once in `startGame`)
with a client-observed fallback for a mode with no stage table (draw/
numeric/blitz standalone never call enterStageAnnounce); `?clock=off` hides
it.
**SOCRATES subtitles (Task 239)** — `SocratesSubtitle.tsx` renders
`socrates.line` (already fully-substituted, no payload change needed for
the text itself) as a caption bar on EVERY beat. `SocratesShowPayload.kind`
(additive: `'REVEAL'` for the ordinary post-question beat, else the pending
beat's own kind) lets the TV tell an announce beat (GAME_INTRO/STAGE_INTRO)
apart from every other kind, so it keeps the stage-announce card up
underneath the subtitle for those — `stageAnnounce` client state was
already never cleared on entering SOCRATES. The climb's own WINNER beat
(`isClimbSocratesBeat`) renders the subtitle too, since Task 247.
Check: `dev/end-state-timer-subtitles-check.ts` (real server/browser, TWO
real phones as the whole roster — bots were tried and rejected: any bot
count meeting minPlayers self-starts an all-bot room, Task 217, the INSTANT
the bots join inside CREATE_ROOM's own handler, before a harness can even
read the room code back) plus `dev/podium-subtitle-followup-check.ts` (targeted
re-checks: `.innerText()` vs `.textContent()` for the zero-digit claim —
the latter sweeps up a component's own `<style>` tag CSS numbers, a trap
for ANY of this codebase's `<style>{STYLE_TAG}</style>`-pattern views, not
just this one; and the ACTUAL content box of `[data-testid="stage-announce"]
> div`, not that testid's own full-viewport, mostly-transparent positioning
wrapper, for an accurate overlap check).
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
`stealAfterEveryQuestion` stage, and — since Task 236 — `'blitz'` (3),
`'draw'` (2), `'numeric'` (2) and `'agora'` (2) POPULATED with the Task 230
lines. They were "reserved but never populated" before 236, and the pools
were not merely empty but UNREACHABLE: `endStageAnnounce` called full.ts's
`beginStage` hook, which starts a non-quiz stage's mechanic and returns
true, BEFORE `pickStageIntroLine` was ever consulted. Task 236 reversed
only that ORDER (the hook itself is untouched) in the new
`resumeAfterStageAnnounce`, and resolves the definition by `room.stage`
(`definitionForCurrentStage`) rather than `stageOfQuestion`, which maps a
QUESTION index and is blind to every `questionCount: 0` stage. `'finale'`
still has no STAGE_INTRO_LINES entry — the finale row is announced through
its own room.trial/room.climb branches, which since 236 play
TRIAL_INTRO_LINES and ANAVASIS_INTRO_SEQUENCE respectively.
Check: `npx tsx dev/intro-lines-check.ts` (a real `?bot=3&mode=full` room
against a throwaway server, with a PAUSE-AWARE Socrates audio ack on the
host socket — without that ack every beat rides the full 11s backstop and
every timestamp it reports is wrong). It joins its human as `minotaur`,
AVATAR_CATALOGUE[0], because bots take avatars from the END (bots.ts:466):
dev/stage-intro-check.ts asks for `sphinx`, collides with a bot at
`?bot=3`, and times out waiting for a fourth player — broken, not fixed. The
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
**The climb (Task 188a) became the DEFAULT finale at Task 214, then the
ONLY finale at Task 258**, which removed Η Δίκη and the
`room.settings.finaleMode` setting/`FinaleMode` type entirely (found stale
here by Task 291, corrected by Task 292 — `grep -arn "FinaleMode|finaleMode"
shared/src server/src client/src` is zero hits at this HEAD; `RoomSettings`,
shared/src/index.ts, has no such field; there is no finale-mode selector in
ControllerScreen.tsx). `advanceToNextQuestionOrGameOver` (phases.ts) calls
`startClimb` unconditionally now — no branch, since there is nothing left
to branch to. CLIMB_* constants (all shared/src/index.ts): `CLIMB_TOP` = 10
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
**Task 296 WROTE DUEL_LINES.DUEL_LOCKED's three lines**, so a line now fires on
every lock and the floor is back to being a MINIMUM rather than the whole wait:
measured lock -> DUEL_REVEAL at 2002ms against that 2000ms floor, i.e. the ack
lands inside it and the 11s backstop never applies. The beat plays INSIDE
DUEL_PICK (no SOCRATES phase, 0 measured) and `socrates:audio_ended` during
DUEL_PICK routes to onDuelAudioEnded, which is load-bearing now rather than a
no-op. **DUEL_PICK's own 20s input window is untouched** — the beat only ever
runs after both picks are already in. Timeout assigns a uniform-random weapon flagged
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
DUEL_LOCKED` is NO LONGER empty: Task 296 wrote its three lines (and
SPEECH_V2_LINES.DUEL_LOCKED aliases that same array), so the early-lock beat is
audible under BOTH policies. Every earlier "empty by design / the 138 pattern"
note about THIS pool is historical.
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
`applyClimbSpearRound` every reveal. **Task 296 gave the strike a VOICE** — the
hook tasks/291 §4 recorded as missing: `startSpearOutBeatIfDue`, called from
`endClimbReveal` BEFORE it routes anywhere, fires ONE `SPEAR_OUT` beat about the
first player that round struck out (`lastResults`' `eliminated` flags ∩
`eliminationOrder`), under BOTH speech policies. Latch
`ClimbState.spearBeatPlayed`, once per GAME and set on ATTEMPT — NOT the stage
ledger's firedSlots, which clears at every stage boundary, and the climb is one
stage; it resets for free because resetRoomForNewGame nulls room.climb. On a
DOUBLE spear only the first speaks. It CANNOT stall the climb: an ordinary held
SOCRATES phase under the quiz's own 'SOCRATES' timer kind (already in
QUIZ_CONTINUATIONS, so pause resumes it), and every exit — ack, the immediate
404 ack, the backstop, vip:skip_socrates — lands in advanceFromSocrates's
`case 'SPEAR_OUT'` -> `resumeAfterClimbReveal`, which is endClimbReveal's own
former body MOVED, so there is still exactly ONE routing decision after a climb
reveal. Measured: CLIMB_REVEAL@11188ms -> SOCRATES@17192ms ->
CLIMB_QUESTION@17194ms, the climb carrying on. A spear DUEL's loser is
eliminated in endDuelReveal, which never passes through endClimbReveal, so it
never speaks — deliberate. The line addresses the player by name in the
SUBTITLE unconditionally (the template stays unsubstituted, since that is what
hashes to the mp3) and splices the vocative CLIP only when hasSocratesClip finds
it; no vocative clip exists for any preset name yet, so today it is READ with
the name and HEARD without it. Check: `npx tsx dev/296-spear-duel-check.ts`
(SCENARIO=A|B|C, socket-only, 34/34). (This paragraph said "a PURE MECHANIC
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

**A harness that calls `startClimb` directly MUST seed
`room.gameIntroPlayed = true` first** (Task 237). Since Task 236 the opening
`GAME_INTRO_SEQUENCE` (ten lines) fires from `resumeAfterStageAnnounce`
whenever that flag is false, so a room jumped straight to the climb plays
the whole narration at the CLIMB's own STAGE_ANNOUNCE and CLIMB_QUESTION
never arrives. This silently killed BOTH climb suites — ceremony-check and
lane-check timed out at HEAD from 236 until 237 repaired them; a real game
is unaffected, since stage 1 has long since played it.

**The climb's WINNER beat stays in the temple (Task 237).** `endClimb`
plays it as a plain SOCRATES phase, which is NOT one of the four phases
`isAnavasisPhase` names, so the whole world used to fall back to
TheatreScene for it and back again for the ceremony — measured at 77
consecutive theatre frames (~5.2s) with Socrates gliding 57% → 5% → 57%.
HostScreen's `isClimbSocratesBeat` (`isClimbFinale && phase === 'SOCRATES'`)
now feeds `showAnavasisWorld`, `showShell` and the AnavasisChrome gate, and
`SocratesFigure`'s `poseFor` tests the temple pose BEFORE
`RAISED_LEFT_PHASES` — which contains 'SOCRATES' and was what walked him
off the terrace. That phase renders no `SocratesView` at all (it passes
`{null}` children; the line is audio, and AnavasisChrome already supplies
the room code/pause). EVERY terminal path funnels through `endClimb`, so
this one flag covers all seven. Third member of the family Task 227
documented — 227 fixed only SophistsRow for this same phase.
Check: `npm run climb:staging-check` (dev/finale-staging-check.ts, ports
3915/5916 — samples the scene every 50ms off the Anavasis container plus
Socrates' own computed `left`; 35 checks over the winner sequence, the
slab-vs-leader boxes, a top-arrival duel, and all seven terminal paths).

**The duel says why it is happening (Task 237).** `duel.cause` existed
server-side from Task 205 but never left the server, so the whole overlay
read `"ΑΛΦΑ | ΒΗΤΑ"`. `DuelCause` now travels on `DuelPickShowHostPayload`
and `DuelRevealHostPayload` (HOST ONLY, like `standings`) and AnavasisDuel
renders a reason line that clears on reveal so the verdict gets the frame.
`CLIMB_STAGE_TAGLINE` also promises the tie now, not just "first to the
top".

**The climb's ENTRY window is the Anavasis world too (Task 244)** — the
FOURTH and last member of that family, and the one 237 diagnosed but left.
The card announcing Η Ανάβασις and the three `ANAVASIS_INTRO_SEQUENCE` rule
lines after it (Task 236) all land BEFORE the first CLIMB payload, and
`isClimbFinale` was set only BY one of those payloads — so the quiz's
TheatreScene and its WREATHED SophistsRow rendered over the whole
announcement. The server says which stage the card belongs to now: an
additive **`finale: 'climb' | null` on StageAnnouncePayload AND
SocratesShowPayload** (shared/src/index.ts:1578/2131 — the type narrowed off
`FinaleMode` when Task 258 removed the trial finale; a stale earlier draft
of this paragraph said `FinaleMode | null` built off `room.climb`/
`room.trial` — `room.trial` does not exist, fixed by Task 292/291), built
off `room.climb` alone (payloads.ts) — the one fact the card's WORDS already
swap on. HostScreen sets `isClimbFinale` from it, live and on state:sync, so
a TV reloading ON the card (buildStageAnnounce is the sync's own builder,
index.ts:447) or MID-NARRATION (the rule lines are plain SOCRATES beats,
whose sync carries no card at all) comes back to the temple rather than the
theatre. `isClimbAnnounceBeat` is the fourth term of `showAnavasisWorld`,
and SocratesFigure's temple pose now covers STAGE_ANNOUNCE as well, or
CENTRE_STAGE_PHASES would plant him mid-stair at 44% for the card and glide
him to 57% the moment the narration began. Scoped to ONE game by
construction: `resetRoomForNewGame` clears room.climb, so game 2's stage 1
announces `finale: null` and every ordinary stage always did.
**The climb's STAGE_INTRO beats render their card + Task 239 subtitle
DIRECTLY** (HostScreen's renderPhaseView), not through SocratesView, whose
GameLayout would duplicate AnavasisChrome — the SOCRATES branch is gated
`!isClimbFinale`, so without that new branch those three lines would have
gone silent the moment the flag moved earlier. The climb's WINNER beat still
falls through to nothing, exactly as 237 left it.
Check: `npx tsx dev/climb-entry-check.ts` — a real `?bot=1&mode=full` show
played END TO END (no startClimb shortcut: the defect is about which stage a
card belongs to) on throwaway ports 3920/5921, reporting the entry timeline,
the committed scene across the whole window, every other stage's card, and
play-again. `?bot=1` deliberately: full's minPlayers is 2 and Task 217
auto-starts a room holding ONLY bots, which would leave no VIP to press
play-again. `RELOAD=on` runs the reload pass instead, and SERVER_PORT/
CLIENT_PORT let both shows run at once.

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
that same wrapper has a determinate height (was auto-height, so
`useFitFontSize`'s shrink never triggered and the bank's longest question
pushed the slab to 1148px, past the 720px canvas) with `MarbleSlab` at
`flex: '1 1 0'` inside it — the same "give the slab real height so its
flex children have something to shrink against" shape `TrialQuestionView`
already used via GameLayout. **Task 237 changed that height from
`top:'9%'`/`42vh` to `top:'1%'`/`23vh`**: 199's box was y 97..367 at
1280x720 and a climber near the top of the stair stands inside it, so
zIndex 3 painted the SLAB OVER THE LEADER — measured overlaps of
2320/4292/4930/4872 px² with the leader at real steps 6/7/8/9 (every other
climber, down at steps 0-2, overlapped 0). The box is now y 39..173. Real
step 9 is the highest anyone can stand DURING a question (reaching
CLIMB_TOP ends the climb in that same reveal; a 3+-way arrival holds the
extras at TOP−1) and its figure box starts at y 192, so this clears the
worst case by 19px at EVERY player count — `laneLeftPct`'s leftmost offset
is a constant −0.36 of the step width, independent of `n`. `left`/`width`
are deliberately unchanged: Socrates still passes behind the slab, which is
198's own accepted arrangement, not a bug.

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
**Since Task 253 Η Παλαίστρα runs BLITZ_ROUND_COUNT = 2 swipe windows back
to back** (shared/src/index.ts), standalone AND as full's stage 2 — one
constant, passed as prepareBlitzGame's own third parameter, never a mode
check. All roundCount x K statements are drawn ONCE at prepareGame
(drawBlitzGameRounds, server/src/blitz.ts) from a pool that shrinks per
round, so nothing repeats within a game AND each round keeps its own
ceil/floor true/false balance. Each round ends in its own BLITZ_REVEAL, and
that reveal IS the between-rounds transition — it carries `hasNextRound`
and says another round follows, rather than cutting the room silently from
a result into a fresh deck. **room.stage never moves across the rounds**, so
the stage card and its STAGE_INTRO line still play exactly ONCE for the
whole stage (startNextBlitzRound deliberately does not go near
enterStageAnnounce). The blitz STAGE_INTRO pool still says "δώδεκα
πράγματα" — true of each WINDOW, not of the stage's 24; documented, NOT
fixed, since 253 was forbidden from touching voice lines.
Check: `SCENARIO=A npx tsx dev/253-blitz-rounds-check.ts` (a 5-bot
`mode=full` show end to end: per-round hashes, the repeat check, card/intro
counts, GAME_OVER's stageDurations) and `SCENARIO=B` (pause/resume in round
2 and in the transition, real TV in a real browser).
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

283 pre-generated ElevenLabs mp3s in client/public/voice, named by
lineHash(text, tag). 276 of them are ACTIVE lines (collectVoiceLineEntries'
count, up from 254 when Task 236 wired Task 230's 22); the rest are
orphans from replaced line text — nothing prunes them.
**Two multi-line SEQUENCES exist since Task 236** — GAME_INTRO_SEQUENCE
(10, full mode's opening) and ANAVASIS_INTRO_SEQUENCE (3, the climb's
announcement). They are sequential PROSE, not pools: a random pick emits
nonsense, so `pickSequence` returns every line in order and
`startSocratesSequence`/`room.pendingSocratesQueue` (phases.ts) play them
one at a time, each with its own held phase and its own audio ack.
**Those two sequences — and ONLY those two — can be voted quiet (Task 300).**
Every connected phone (not just the VIP) gets a `skip-vote-button`;
`player:skip_vote` is one-way, one vote per playerId per SEQUENCE, refused
while paused and against a stale beat id. The threshold is strictly more than
half of the CURRENTLY-connected roster, recomputed live — so a DISCONNECT can
pass a vote with nobody voting again (`recheckSkipVoteOnDisconnect`, beside the
other disconnect rechecks). `room.skipVote` (state.ts) belongs to the
NARRATION, not the beat: it survives every line boundary inside one and is
closed at the single site where the drain routes onward. On pass,
`startSequenceSkip` (phases.ts) discards `pendingSocratesQueue`, emits host-only
`socrates:stop`, and enters ONE `SKIP_INTERRUPTED` beat carrying the ORIGINAL
kind — so the existing switch resumes the flow with ZERO new routing, and that
beat is `unskippable` by both the vote and Task 238's Παράλειψη. The coronation
is a sequence too and deliberately opens NO vote. **The client must never
synthesise the stopped beat's ack**: `stopSocratesLine` (useGameAudio.ts) nulls
`source.onended` BEFORE `source.stop()`, because stop() fires onended, and a
generation counter covers the play path's four awaits. Check:
`npx tsx dev/300-skip-vote-check.ts` (SCENARIO=A|B|C|D|E, 47/47).
NOTE, unverified and NOT fixed here: the "276 ... (collectVoiceLineEntries'
count)" claim just above is stale in at least its parenthetical — that function
measured 517 before Task 300 and 521 after.
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
SOCRATES ends on socrates:audio_ended from the host. **AUDIO LENGTH IS
AUTHORITATIVE since Task 238** — an explicit Argyrios decision (2026-09-13)
to raise what was a flat cap, which is why the "never raise the cap" rule
below now reads differently than it did. The phase's backstop is armed
PER BEAT at that line's own clip + SOCRATES_BACKSTOP_MARGIN_MS (3000ms), or
a flat SOCRATES_BACKSTOP_UNKNOWN_MS (15000ms) when the clip's length can't
be measured at all; `socratesBackstopMs` (server/src/socratesAudio.ts) is
the one place that decides, and the armed value is echoed in the server log
(`Socrates ... beat N backstop=Xms`) and kept on room.socratesBackstopMs so
buildSocratesPayload can still derive its countdown. SOCRATES_MAX_DURATION_MS
(11000ms) is NO LONGER that backstop: it survives only as the duel's
early-lock ceiling (onDuelLockTimer) and as the neutral value the field holds
outside a beat. Clip length comes from the mp3's BYTE SIZE (CBR, Task 42b) —
measured against ffprobe over all 283 files in Task 238, within 32ms every
time and always erring slightly HIGH, which is the safe direction here.
That source cannot regress the Task 154 missing-clip path: it is read
server-side when the beat is ARMED, while Task 154 is a CLIENT behaviour
(a 404/decode failure calls onEnded at once), and an ack is accepted the
moment it arrives whatever the backstop was set to — measured at 1ms.
**socrates:audio_ended carries a `beatId` (Task 236)** and the server drops
an ack whose id isn't the beat currently on screen. An over-cap clip is cut
off by the backstop and its audio finishes AFTERWARDS, so its ack lands
while the next beat is already playing; before beats could follow one
another directly that was harmless (the phase check rejected it), but in a
sequence it advanced twice and swallowed a line whole. Deliberately an
identity check, not a "too early" check: a missing clip legitimately acks
at ~0ms (Task 154) carrying the CURRENT id, and must still end the beat.
**A beat has exactly ONE way to end early, whoever asked (Task 238).**
`endSocratesBeat` (server/src/index.ts) owns the phase/pause/stale-beat
rules, and all three callers go through it: the host's audio ack, the VIP's
new `vip:skip_socrates`, and `vip:next`'s own SOCRATES branch. A skip is NOT
a parallel advance — it synthesises exactly the advance the natural end
produces, so mid-sequence it plays the NEXT line rather than jumping the
narration (the queue drain in advanceFromSocrates decides that, untouched).
The server log says which fired: `Socrates beat N ended (<event>) -
advancing`, identical but for the event name, and a beat that leaves NO such
line was ended by its backstop instead. `ServerEvents.SOCRATES_BEAT` carries
the beat id ROOM-WIDE (the id alone — the line itself stays host-only) so the
VIP's phone can name what it is skipping; a second press inside one beat
cites an id that is no longer current and is refused as stale, and a press
with NO id means "whatever is current" (so a VIP who reloaded mid-beat can
still skip). `startSocratesIfLineFired` now increments `socratesBeatId` too —
pre-238 only `enterSocratesBeat` did, so every REVEAL-moment beat reused the
previous beat's id, which was harmless for a stale AUDIO ack but would have
let one press match two beats. The phone's control is
`data-testid="socrates-skip-button"`, rendered on the reveal card and on the
waiting screen (the intro/stage beats have no round view of their own); a
non-VIP renders no such node at all — a branch, not a disabled control.
Check: `npx tsx dev/socrates-pacing-check.ts` (in-process real server on
3917, so the harness reads the LIVE Room and reports what the timer was
ACTUALLY armed at; `SCENARIO=A|B|C|D|E` runs one). Beats are driven through
the real sequence machinery rather than waiting out a ~14-minute show for
lines that are random pool picks — #11 is 1 of 3 and #15 is 1 of 2, so a live
run covers all four over-cap clips about one time in six.
Measured ~100ms of audio per character. Keep a line short because a room
will not sit through a lecture — NOT because the phase will cut it off; it
no longer will (Task 238). Task 149's "shorten the line rather than raise
the cap" still stands as PACING advice, but it is no longer a correctness
rule, and the cap it referred to is gone.
**The four over-cap lines are no longer truncated (Task 238).** All four are
from Task 230's batch, wired by Task 236: Εισαγωγή#9, Παλαίστρα#11,
Ζωγραφική#15 and Ανάβασις#22. Each now plays to its natural end — measured,
in that order: clips of 12356/11233/10998/13949ms held for 12357/11233/
10998/13949ms against backstops of 15388/14264/14029/16981ms, every one
advancing on its own audio ack with the backstop firing zero times
(`SCENARIO=A npx tsx dev/socrates-pacing-check.ts`). Ζωγραφική#15 is the
subtle one: ffprobe says 10998ms, UNDER the old 11000ms cap, but the server's
byte-size estimate says 11029ms and that estimate is what the cap clamped —
so judge "over-cap" by the estimate, never by ffprobe. Ανάβασις#21 (9.3s) was
always complete and still is.
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

**The TV tap-to-start gate (Task 259) fixes a real silent-cold-open bug.**
getAudioCtx() (useGameAudio.ts) was only ever first reached from
ROOM_CREATED's startKeepAliveAudio — a SOCKET ACK, a round trip after
whatever click sent CREATE_ROOM, well outside that click's own
user-activation window in a strict browser. A freshly constructed context
born there commonly stayed 'suspended' with nothing left to ever resume it
(Task 213's page-wide gesture listener only retries an EXISTING context;
it never constructs one), so the whole ~80s GAME_INTRO_SEQUENCE played out
SILENTLY and the per-beat backstop — not real audio — advanced every beat.
It looked designed, not broken. `unlockAudioGate()` (useGameAudio.ts) now
runs `getAudioCtx()` + `attemptResumeAudio()` SYNCHRONOUSLY inside a new
gate's own onClick, so construction and resume both happen inside one
trusted gesture. The gate itself
(`data-testid="audio-gate"`, HostScreen.tsx, styled in hostStyles.ts's
`audioGate`/`audioGateTitle`/`audioGateSubtitle`) is a full-bleed
`position:fixed` BUTTON at `zIndex: 60` — above every other chrome
layer — rendered whenever `roomCode === null && !audioGatePassed`; "Create
Room" stays exactly as it was underneath, DOM-present but occluded (a real
click on it times out/is intercepted, exactly as a real tap would land on
the gate instead). `audioGatePassed` initializes to `botCount > 0`
(HostScreen's own `?bot=N` state): an all-bot room self-starts the instant
CREATE_ROOM spawns enough bots to hit minPlayers (Task 217) with no human
ever present to tap anything, so the gate is skipped ENTIRELY for any
bot-driven room — verified with `SCENARIO=B npx tsx
dev/259-tap-to-start-check.ts` (`?bot=5&mode=full` to GAME_OVER, gate node
count sampled every 2s, stays 0 throughout). `SCENARIO=A` (default) is the
human-tap flow: gate present and "Create Room" unreachable before any tap,
gate gone (0 nodes) and `AudioContext.state === 'running'` after exactly
one, then a Web-Audio probe patched into the page (a raw JS string passed
to `page.addInitScript`, NOT a TS closure — tsx/esbuild's keep-names
support rewrites a named function into `function Patched(){} __name(Patched,
"Patched")`, and shipping that via `Function.prototype.toString()` to the
browser throws "__name is not defined" the instant it runs, silently
killing the whole probe) confirms the first GAME_INTRO clip's PLAYED
duration lands within ~6ms of its own decoded file duration — real
playback, not the 7000ms backstop a suspended context would have silently
fallen back to.
Only two dev harnesses were required to keep working and were verified:
`dev/climb-entry-check.ts` (already bypassed via its own `?bot=1`, unchanged)
and `dev/podium-subtitle-followup-check.ts` (no `?bot=`, patched with one
`page.getByTestId('audio-gate').click()` before each of its two "Create
Room" clicks). Every OTHER dev harness that loads `/host` with no `?bot=`
param (there are roughly fifteen, `screenshot-phases.ts` included) will now
hang on its own "Create Room" click until it gets the same one-line gate
tap — the Task 241/245 preset-names precedent applies verbatim: repair each
ONE AT A TIME, only its own gate-tap line, only when it's next actually
needed, never folded into an unrelated task.

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
- **The stage titled «Η Αγορά» does NOT use the AGORA_* phases — «Η Λήθη»
  does.** full's stage 1 (Η Αγορά, modes/full.ts:29) is a PLAIN QUIZ stage:
  QUESTION/REVEAL, TheatreScene, Socrates on his terrace. The agora mechanic
  is stage 5, titled «Η Λήθη» since Task 231's display rename off «Η Μνήμη
  της Αγοράς» — modes/full.ts:40 records the reason, that the old title read
  as a return to stage 1. Every agora gate keys on the GamePhase VALUE,
  never on a stage title or number: `isAgoraScenePhase`
  (HostScreen.tsx:2837) is literally `phase === 'AGORA_EXPOSE' || phase ===
  'AGORA_QUESTION' || phase === 'AGORA_REVEAL'`. This has already caused one
  false alarm — a Task 252 review read "Socrates is hidden for the agora
  scene" as "…hidden in Η Αγορά too", and the follow-up (cd498a0,
  dev/lethe-vs-agora-stage-check.ts) had to play a real show to settle it:
  socrates-figure count 1 during stage 1's QUESTION, 0 during stage 5's
  AGORA_QUESTION. Read the phase, never the card.
- **Preset-only names (Task 241/245) silently killed eight dev harnesses.**
  `isValidPlayerName` (state.ts:655) is now strict membership in
  PRESET_NAMES, so any harness hardcoding the pre-241 Άλφα/Βήτα/Γάμα/Δέλτα/
  Έψιλον set is rejected at index.ts:826 with `{"reason":"INVALID_NAME"}` on
  its FIRST sim join — before a single check runs, so it scores NOTHING
  rather than failing loudly. Measured against the real function: Άλφα,
  Βήτα, Γάμα, Δέλτα, Έψιλον all false; Άρης, Νίκη, Τάκης true. Three were
  repaired at Task 246 (climb-ceremony-check, climb-lane-check,
  finale-staging-check) and one at Task 249 (socrates-pacing-check) — those
  four still MENTION the old names in comments and check labels, which is
  not breakage. **FIVE are still broken** (verified at ed608e2):
  dev/242-subtitle-check.ts, dev/climb-entry-check.ts, dev/duel-hint-check.ts,
  dev/end-state-timer-subtitles-check.ts,
  dev/podium-subtitle-followup-check.ts. When one is needed, repair ONLY its
  NAMES constant (preset entries, e.g. Άρης/Νίκη/Χαρά/Τάκης) and say so in
  the report — never fold a harness rewrite into an unrelated task. **Never
  trust a "suite green" claim until the harness has been SHOWN to run**: at
  Task 246 all three climb suites had been scoring zero since 241 and
  nothing reported a failure. Corollary (Task 254): the NAMES constant is
  not always the whole repair. Task 241 ALSO deleted the custom-name entry
  UI — `grep -arn "custom-name" client/src` returns 0, and
  dev/241-name-check.ts:229-230 asserts those testids are absent by design
  (the flow is now name-search/name-list/preset-name-option) — so the four
  browser-driven files of the five above also drive the dead
  `custom-name-toggle` and will hang there after a NAMES-only fix; only
  dev/climb-entry-check.ts, which joins at the socket level, is a NAMES-only
  repair. dev/242-numeric-check.ts hit this same wall at Task 252 and was
  documented, not fixed; dev/screenshot-phases.ts:739 and
  dev/socrates-pacing-check.ts:665 still carry that dead flow on their phone
  paths too, unverified by execution.

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
