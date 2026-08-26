# Aegean — Greek party quiz game

Jackbox-style. TV = display only (no input). Phones = controllers.
4-digit numeric room code. Server-authoritative. Host persona: Socrates,
in Ancient Athens. All player-facing text is Greek.

## Stack
TypeScript monorepo, npm workspaces: /shared /server /client
Server: Node + Express + Socket.IO (tsx, no build step, systemd)
Client: Vite + React. Routes: / (landing), /host (TV), /play (phone),
/dev/draw (canvas test route)

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
- Deploy: `~/deploy.sh` — cds into /root/Aegean-, `git pull --ff-only`,
  aborts loudly on a dirty tree or failed pull, then rsyncs into
  /opt/party-game excluding .git, voice and voice-test.

## Where things live

shared/src/index.ts      Event names, payload types, all constants. THE contract.
                         Also WORD_SETS and lineHash.
server/src/index.ts      Socket handlers (LARGE)
server/src/phases.ts     QUIZ phase machine: startQuestion/endQuestion/advanceFrom*
server/src/modes/        GameMode registry — READ modes/README.md before adding a mode
server/src/modes/quiz.ts   The quiz mode
server/src/modes/draw.ts   The drawing mode (state in a WeakMap<Room, DrawState>)
server/src/modes/numeric.ts  The numeric mode shell
server/src/payloads.ts   REVEAL / GAME_OVER payload builders
server/src/powerups.ts   POWER_UP choice validation + landing on the next question
server/src/steal.ts      STEAL thief selection + the clamped point transfer
server/src/realtime.ts   Socket.IO server instance (io, httpServer)
server/src/state.ts      Rooms Map, room/player/VIP/settings accessors
server/src/timers.ts     Shared phase-advance timer helper (arm/pause/resume)
server/src/questions.ts  Loads questions.json, difficulty filtering
server/src/socrates.ts   Moment detection, Greek lines, LINE_TAGS, LINE_RATINGS
server/src/scoring.ts    Pure scoring function
server/src/numeric.ts    maxForAnswer, clamping, scoring, pure payload builders. MODE-AGNOSTIC — keep it that way.
server/src/data/questions.json  899 questions, 49 categories
client/src/screens/HostScreen.tsx        TV, all phases (LARGE)
client/src/screens/ControllerScreen.tsx  Phone (LARGE)
client/src/components/DrawingCanvas.tsx  Canvas, tools, colour wheel
client/src/theme.css     Gameshow theme

## Core rules — do not break these

- playerId (UUID in localStorage) is identity. NEVER socketId.
- Room codes are STRINGS always. "0042" must keep its zero.
- The correct answer NEVER leaves the server before REVEAL / GUESS_REVEAL.
- Same event name can carry DIFFERENT payloads to host vs players.
  Players never receive another player's answer or score breakdown.
- VIP = first player to join, tracked by playerId. TV cannot control the game.
- All timers go through the shared timer helper so pause can freeze them.
- One function decides what follows REVEAL; auto-advance and vip:next both use it.
- A resumed timer's continuation comes from the MODE's continuations table,
  never a switch — a phase that arms a timer must have an entry or pause breaks.
- Audio: host only, ONE AudioContext, reused.
- React StrictMode double-invokes effects in dev — guard anything that fires once.
- Relative imports need explicit .js extensions. tsx runs ESM; typecheck
  passes without them but the server will not boot.
- payloads.ts and realtime.ts import nothing local back. The dependency
  graph is acyclic. Keep it that way.

## Phases

Phases belong to a MODE (room.mode), not to the room. The mode owns its
phase list, its continuations table and its STAGES table.

Quiz: LOBBY -> STAGE_ANNOUNCE -> [POWER_UP] -> QUESTION -> REVEAL
      -> [STEAL] -> [SOCRATES] -> GAME_OVER
Draw: LOBBY -> DRAW -> (GUESS -> GUESS_REVEAL) x N -> GAME_OVER
Numeric: LOBBY -> NUMERIC_QUESTION -> NUMERIC_REVEAL -> GAME_OVER

`paused` is a boolean flag, NOT a phase.
**There is no mid-game SCOREBOARD.** It was deleted — scores live in the
TV's right-hand column at all times. Do not reintroduce it.
Every quiz question is entered via enterQuestionOrPowerUp() — the only gate.
STAGE_ANNOUNCE is a real held phase: the TV shows the stage card alone and
the question timer starts only after it.
continueAfterReveal() is the one function deciding what follows a REVEAL.
SOCRATES is skipped entirely when no moment fires.

"Phase" = the state machine. The progression of the show is a STAGE.
Never write "phase 1" when you mean a stage.

## Stages (quiz)

QUIZ_STAGES in shared owns the shape: stage 1 = 3 plain questions,
stage 2 = 5 questions each preceded by POWER_UP, stage 3 = 4 questions
each FOLLOWED by a STEAL. Question count is NOT a setting — it is the sum
of the stages. room.stage is server-side; the TV announces each stage once.
Landed effects STACK per target: ice in duration (10s cap), ink in
intensity (cap 3), both via addAppliedSabotage().

## Drawing mode

Guess-from-options, not free text. Everyone draws simultaneously, then each
drawing goes up in turn and everyone else picks from four words.
WORD_SETS rows are { words: [4], rotatable }; the target is chosen at deal
time, and two players must never get the same target word.
The drawer scores round(400 * correct / eligible) — a proportion, so it
measures clarity rather than player count.
Export bakes the canvas background (flattenToPaper) so an erased area and
a white stroke render identically on the TV.

## Numeric mode

Standalone for now, for testing in isolation — it is meant to become a quiz
STAGE later. server/src/numeric.ts must import nothing from modes/, so that
merge is a rewrite of the mode shell (modes/numeric.ts) only. `max` is
derived from the answer, never authored directly.

## Voice

193 -> 186 pre-generated ElevenLabs mp3s in client/public/voice, named by
lineHash(text, tag). **They are gitignored and cost credits to rebuild.**
In the dev copy that path is a SYMLINK — the .gitignore entry is `voice`
with NO trailing slash, because a trailing slash does not match a symlink.
The SOCRATES phase ends on socrates:audio_ended from the host; the timer
is only a backstop.
`npm run voice:generate` regenerates only changed lines and reports the
longest clip. `npm run voice:index` builds the rating page.

## Traps that have bitten before

- A commit deleting a file does NOT remove an untracked copy of it.
  After a rename or deletion, check `git status` for the ghost.
- Centered flex overflow is invisible to scrollHeight. The host container
  is overflow:hidden, so content is clipped silently. Test TV layouts with
  per-element bounding-box checks against the viewport.
- destination-out over an anti-aliased edge only attenuates alpha to
  a*(1-a), never 0. More passes will not clear it.
- The screenshot harness has twice accused the game wrongly. Suspect the
  harness first.
- computeCompetitionRanks does standard 1,2,2,4 ranking. Duplicate rank
  numbers are genuine ties. Reported as a bug twice; it is not one.

## Working style

- Read only the files you need. Do not explore the whole repo.
- Keep final reports under 8 lines.
- **Report on EVERY acceptance criterion, individually.** "Typecheck
  passes" is not evidence for a behavioural criterion.
- Verify by running things, not by reading code and reasoning about it.
- When a task copies content from a document into code, count the rows and
  report the count.
- Move code rather than rewriting it during refactors.
