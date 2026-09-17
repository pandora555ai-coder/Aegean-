# Task 259 — TV tap-to-start gate (audio unlock + first-tap dead zone)

## Problem

Confirmed live: the TV needs a user gesture before any audio plays. With no
tap, the ~80s cold open (`GAME_INTRO_SEQUENCE`, 10 lines) ran SILENTLY and
the per-beat backstop — not real audio — advanced every beat, so it looked
designed rather than broken. Separately, a known first-tap dead zone
swallows the first click ~1-2s after page load.

Root cause: `getAudioCtx()` (client/src/hooks/useGameAudio.ts) was only
ever first reached from `ROOM_CREATED`'s `startKeepAliveAudio` — a SOCKET
ACK, a round trip after whatever click sent `CREATE_ROOM`, well outside
that click's own user-activation window in a strict browser. A freshly
constructed context born there commonly stayed `'suspended'` with nothing
left to ever resume it (Task 213's page-wide gesture listener only retries
an EXISTING context — it never constructs one).

## Fix

`unlockAudioGate()` (useGameAudio.ts) runs `getAudioCtx()` +
`attemptResumeAudio()` synchronously inside a new gate's own `onClick`, so
construction and resume happen inside one trusted gesture.

The gate (`data-testid="audio-gate"`, HostScreen.tsx render + hostStyles.ts
`audioGate`/`audioGateTitle`/`audioGateSubtitle`) is a full-bleed
`position:fixed` `<button>` at `zIndex: 60` — above every other chrome
layer — text "Πάτα για να ξεκινήσεις" / "Ο Σωκράτης περιμένει", rendered
whenever `roomCode === null && !audioGatePassed`. "Create Room" underneath
is unchanged — same testid, same label, same `handleCreateRoom` — just
occluded until the gate is tapped.

**Bypass**: `audioGatePassed` initializes to `botCount > 0` (HostScreen's
existing `?bot=N` state). An all-bot room self-starts the instant
`CREATE_ROOM` spawns enough bots to hit `minPlayers` (Task 217), with no
human ever present to tap anything, so any `?bot=N` room skips the gate
entirely — verified, not assumed (criterion 2 below).

Palette: zero new hex, `.enter-pop` reused verbatim, only existing tokens
(`--night-1`/`--marble`/`--marble-3`) — confirmed by the inversion check
(`comm -23` of every `var(--x)` against the palette's own token list): only
the three documented local-var exceptions (`--dx --glow-color --i`) turn
up, nothing new.

## Files touched

- `client/src/hooks/useGameAudio.ts` — `unlockAudioGate()`, exported.
- `client/src/screens/HostScreen.tsx` — `audioGatePassed` state, the tap
  handler, the gate's render block.
- `client/src/screens/host/hostStyles.ts` — `audioGate`/`audioGateTitle`/
  `audioGateSubtitle`.
- `dev/259-tap-to-start-check.ts` (new) — `SCENARIO=A` (default, criterion
  1) and `SCENARIO=B` (criterion 2), same spawn/cleanup shape as
  `dev/climb-entry-check.ts`.
- `dev/podium-subtitle-followup-check.ts` — one `page.getByTestId('audio-
  gate').click()` added before each of its two "Create Room" clicks (it
  joins two REAL phone pages, no `?bot=`, so the gate is not bypassed).
- `CLAUDE.md` — new paragraph in the Voice section documenting the gate,
  its bypass, and the harness blast radius (see below).

## Acceptance criteria

### 1. Manual tap flow (`npx tsx dev/259-tap-to-start-check.ts`, SCENARIO=A)

Before tap: gate node count = **1**, a click on "Create Room" **times out /
is intercepted** by the gate sitting on top of it (Playwright's own
actionability check — the button is DOM-present underneath, unchanged, but
covered), no `AudioContext` constructed yet (nothing to resume).

After one tap: gate node count = **0**, `AudioContext.state` = **`running`**,
"Create Room" now clickable. Continuing into a real 2-player game and
`vip:start_game`: the first `GAME_INTRO` clip's decoded file duration =
**2000ms**; a Web Audio probe (patched into the page before navigation)
recorded its actual played span (start → `ended`) at **2005.5ms** — within
6ms of the file's own length, i.e. REAL playback, not the 7000ms backstop a
still-suspended context would have silently fallen back to instead.

**8 passed, 0 failed.**

### 2. Bypass (`SCENARIO=B npx tsx dev/259-tap-to-start-check.ts`, `?bot=5&mode=full`)

Gate node count sampled every 2s for the whole show: **97 samples, every
one 0** (`max=0`). Room reached `GAME_OVER` unattended after **836.2s**,
having announced all **7** stages (`1,2,3,4,5,6,7` — the full locked
lineup, unaffected). No human tap anywhere in this run.

**3 passed, 0 failed.**

(This run needed two prior attempts: the first two combined runs of
scenario A+B concurrently, and one solo retry, were killed by the
environment for low memory — this is a small shared VM, also running
`/opt/party-game` production, a `trader` bot, and code-server, on 7.6GB
total RAM. Each retry showed zero application-level errors before being
killed; only a clean, sequential, one-harness-at-a-time run finally
completed. Not a defect in the gate or the harness.)

### 3. `dev/climb-entry-check.ts` and `dev/podium-subtitle-followup-check.ts`

- `dev/climb-entry-check.ts` (`?bot=1&mode=full`, bypassed via `botCount >
  0`, unchanged): **9 passed, 0 failed** — identical to its documented
  baseline (climb entry timeline, 0 theatre frames across 617 samples, 0
  wreath sightings, both game-2/play-again checks).
- `dev/podium-subtitle-followup-check.ts` (no `?bot=`, patched with one
  gate tap before each of its two "Create Room" clicks): **6 passed, 0
  failed** — identical to its pre-259 baseline (3 Ανάβασις-announce
  subtitle checks, the standalone-quiz GAME_OVER setup, the `.textContent`
  vs `.innerText` digit checks).

Neither harness died on the gate.

### 4. INVERSE — intro beats unchanged, zero new screenshots

- **Diff scope**: `git diff --stat HEAD` touches only
  `client/src/hooks/useGameAudio.ts`, `client/src/screens/HostScreen.tsx`,
  `client/src/screens/host/hostStyles.ts`, `dev/podium-subtitle-followup-
  check.ts`, plus the new `dev/259-tap-to-start-check.ts` and this task's
  own files. **Zero server-side files changed** — `server/src/socrates.ts`
  (where `GAME_INTRO_SEQUENCE` lives) is byte-identical.
- **All 10 `GAME_INTRO_SEQUENCE` beats observed, matching across
  independent runs** (scenario A, scenario B, and `climb-entry-check.ts`,
  which all ran the same fixed, sequential, non-random 10-line script):
  beat backstops in order were 7000 / 12984 / 7000 / 11469 / 8439 / 13872
  / 9144 / 7000 / 15388 / 9223 ms, with matching text in every run. Beat
  9's 15388ms backstop matches CLAUDE.md's own documented Εισαγωγή#9 value
  exactly.
- `dev/intro-lines-check.ts` (the harness CLAUDE.md names for this exact
  10-beat check) currently fails with "timed out waiting for player:joined
  after 15000ms" on its 4th scripted join — confirmed via `git stash -u` /
  `git stash pop` A/B testing to be **byte-identical pre-existing
  behaviour**, unrelated to this task (it never loads `/host` at all — it
  drives everything at the socket level, so a client-only change cannot
  have touched it). Left undiagnosed and unfixed, per the "never fold a
  harness rewrite into an unrelated task" rule — flagged here as newly
  confirmed-still-broken, not previously documented in CLAUDE.md.
- **Zero `page.screenshot` calls added**: `grep -n "page.screenshot" dev/259-tap-to-start-check.ts dev/podium-subtitle-followup-check.ts` returns nothing.

## CLAUDE.md — deploy path + working directory (requested alongside this task)

Checked: the deploy-path cleanup (single `sudo /usr/local/sbin/aegean-
deploy` path, `deploy/deploy.sh` removal, `/home/argyrios/Aegean` as the
working copy) was **already landed** in the immediately-preceding commit
(`42fbe2a chore: retire deploy.sh`, HEAD at the start of this task) — `grep
-n "Aegean-\|/root/Aegean" CLAUDE.md` finds no stale reference. No further
edit was needed for that part; this task's own CLAUDE.md change is the new
Voice-section paragraph documenting the gate (see above).

## Known blast radius — dev harnesses NOT covered by this task

Roughly fifteen other `dev/*.ts` harnesses load `/host` with no `?bot=`
param and click "Create Room" directly (`agora-scene-check.ts`,
`agora-sophists-check.ts`, `agora-phone-check.ts`, `climb-ceremony-check.ts`,
`climb-lane-check.ts`, `finale-staging-check.ts`, `socrates-cutoff-check.ts`,
`lethe-scene-check.ts`, `lethe-vs-agora-stage-check.ts`, `duel-hint-check.ts`,
`242-numeric-check.ts`, `242-subtitle-check.ts`, `pause-resume-check.ts`,
`blitz-timing-check.ts`, `253-blitz-rounds-check.ts`, and
`screenshot-phases.ts` itself). These will now hang on that click until
they get the same one-line `page.getByTestId('audio-gate').click()` this
task added to `podium-subtitle-followup-check.ts`. Per CLAUDE.md's own
Task 241/245 precedent: repair each ONE AT A TIME, only its own gate-tap
line, only when it's next actually needed — not folded into this task.
