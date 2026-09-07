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
- The harness writes its PNGs to client/public/dev/shots (17 TV + 9 phone,
  360x640) — served under the protected /dev basic-auth prefix and linked
  from ΔΟΚΙΜΕΣ (Task 180). Anything new for testing/review goes UNDER
  /dev, never a public sibling path. These are the LIVE shots on the
  running site; they only refresh when a harness run is followed by a
  deploy.

## Where things live

shared/src/index.ts      Event names, payload types, all constants. THE contract.
                         Also WORD_SETS and lineHash.
server/src/index.ts      Socket handlers (LARGE)
server/src/phases.ts     QUIZ phase machine: startQuestion/endQuestion/advanceFrom*
server/src/modes/        GameMode registry — READ modes/README.md before adding a mode
server/src/modes/quiz.ts   The quiz mode
server/src/modes/draw.ts   The drawing mode (state in a WeakMap<Room, DrawState>)
server/src/modes/numeric.ts  The numeric mode shell
server/src/modes/full.ts   Full mode (Task 134): COMPOSES quiz/draw/numeric/trial as
                         one show's five stages. Holds no mechanic of its own.
server/src/payloads.ts   REVEAL / GAME_OVER payload builders
server/src/powerups.ts   POWER_UP choice validation + landing on the next question
server/src/steal.ts      STEAL thief selection + the clamped point transfer
server/src/trial.ts      Η Δίκη (the quiz FINALE) — pure mechanic only: drain, elimination,
                         what the next round must be. No Room, no io, no timers; the phase
                         shell around it is in phases.ts.
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
  runs in every mode's finishGame.
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

Quiz: LOBBY -> STAGE_ANNOUNCE -> [POWER_UP] -> QUESTION -> REVEAL
      -> [STEAL] -> [SOCRATES] -> (after the LAST question: STAGE_ANNOUNCE
      'Η Δίκη' -> (TRIAL_QUESTION -> TRIAL_REVEAL) x N, sudden death if
      everyone left falls in the same reveal) -> [SOCRATES] -> GAME_OVER
Draw: LOBBY -> DRAW -> (GUESS -> GUESS_REVEAL) x N -> GAME_OVER
Numeric: LOBBY -> NUMERIC_QUESTION -> NUMERIC_REVEAL -> GAME_OVER
Full (134): THE game — five stages, each announced, then the ONE GAME_OVER:
      1 Η Αγορά (quiz + POWER_UP) -> 2 Ζωγραφική (one draw round)
      -> 3 Εκτίμηση (3 numeric) -> 4 Η Συκοφαντία (quiz + STEAL)
      -> 5 Η Δίκη (the trial, entered with accumulated scores as life).
      It COMPOSES the other three modes (which stay VIP-selectable as the
      dev harness) through three optional GameMode hooks — stagesFor,
      beginStage, advanceAfterSegment. See modes/README.md.
      FULL_QUIZ_QUESTION_COUNTS (shared) gives EACH quiz stage's count by
      gameLength: short 2, medium 3, long 5 (so stages 1+4 total 2+2/3+3/5+5).
      Draw round count is gameLength-dependent since Task 150
      (FULL_DRAW_ROUNDS_BY_LENGTH: short 1, medium 1, long 3 — standalone
      draw's own room.settings.drawRounds setting is untouched); numeric
      count (3) stays fixed regardless of length. Every segment count is
      a CALL-SITE parameter (startDrawSegment(room, totalCycles, guessScale),
      prepareNumericGame(room, questionCount)) — standalone modes pass their
      own constants (standalone numeric still asks NUMERIC_QUESTION_COUNT =
      5), full.ts passes its own (FULL_NUMERIC_QUESTION_COUNT = 3); neither
      mode's shell branches on who's calling it.
      FULL_QUIZ_SCORE_SCALE / FULL_GUESS_SCORE_SCALE (both
      400/(BASE_POINTS+SPEED_BONUS_MAX)) put a max-speed quiz answer and a
      max-speed guess at ~400 in FULL ONLY, matching DRAWER_MAX_POINTS —
      passed as calculatePoints' existing `scale` arg (default 1, standalone
      quiz/draw unaffected), never a mode check inside the scoring function.
      STEAL's transfer and the drawer's round(400*correct/eligible)
      proportion stay INTENTIONALLY unscaled.

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
Η Συκοφαντία (quiz stage 3, full stage 4) shares ONE intro pool,
SYKOPHANTIA_INTRO_LINES, keyed under both numbers (socrates.ts:443-444). The
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
A trial GAME_OVER shows NO digits — no rank, no score — gated on
`gameOver.isTrialResult` (SophistsRow's hideScores; GameOverView has no
list at all since 161); standings are SURVIVAL order (winner, then reverse
elimination order), built from room.trial.eliminationOrder
(payloads.ts:391), never score (life can end negative). On the sophists
row, an eliminated figure sinks+fades (.out) and is removed outright
REORDER_DELAY_MS + GLIDE_MS (2200ms, see TV layout) after its reveal — the
same tween the reorder plays, so removal lands as the sink+fade finishes
(SophistsRow.tsx's useRemovedIds); the survivors re-space via `left`.

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
keep its 17/17 TV-phase coverage.
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

Standalone AND, since Task 134, composed as Stage 3 of `full` — both true at
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
'blitz'` (GAME_MODE_IDS), and server/src/modes/blitz.ts calls
registerGameMode — it IS in the registry, with its own phases (LOBBY,
BLITZ, BLITZ_REVEAL, GAME_OVER). A room can play blitz as a real
multiplayer game: the TV has host/BlitzView.tsx and
host/BlitzRevealView.tsx, and the phone has its own branch in
ControllerScreen.tsx (BlitzSwipeCard, Task 181's "card follows the finger"
rebuild, titled "Η Παλαίστρα" through greekUpper same as every other
title). Crowd mood is wired in from the mode's own Task 156a build (see
Crowd mood below).
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
Task 156a build). A short full game emits 48
crowd:mood events. LOBBY and TRIAL_QUESTION never get one attributed to
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
- **PHASE_CHANGED is emitted BEFORE the phase's own payload at all 18 emit
  sites** — the house pattern, every mode. The host therefore renders once
  with no payload for the new phase; HostScreen holds the last standings to
  cover that render. Any new phase view must tolerate a first render with
  no payload of its own.
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
  trial. Fixed by clearing it in `handleQuestionShow` itself (line 519), the
  first event of ANY quiz question. Corollary: bots answer at the SOCKET
  level (dev/screenshot-phases.ts:190's `joinBot` returns a raw Socket) and
  never render a phone — a bug like this one needs a Playwright phone
  client or a human, never a bot run.
- **Deploy confirm strings must be runtime literals — event names, setting
  keys — never function or variable identifiers.** The production build's
  minifier renames identifiers freely but leaves string literals alone, so
  confirming a deploy landed by grepping the built bundle for a function
  name is worthless; grep for the literal (e.g. `'vip:set_audio_volume'`
  or `'powerUpsEnabled'`) instead.

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
