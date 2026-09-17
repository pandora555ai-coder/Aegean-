# Task 260 — Add the tap-gate line to the remaining harnesses

Scope: `dev/` only (plus this doc). Zero changes to `client/`, `server/`,
`shared/`.

Task 259 added the TV tap-to-start gate (`data-testid="audio-gate"`),
rendered whenever `roomCode === null && !audioGatePassed`, and
`audioGatePassed` initializes to `botCount > 0`. Any dev harness that loads
`/host` with **no** `?bot=` param and then clicks the real "Create Room"
button now hangs on that click until the gate is tapped first, the same
one-line fix `dev/podium-subtitle-followup-check.ts` already used:
`await page.getByTestId('audio-gate').click();` immediately before the
"Create Room" click.

## Enumeration method (criterion 3)

`grep -arl "'/host\|\`.*\/host\|\"/host" dev/*.ts` found every `dev/*.ts`
file that references `/host` at all: 29 files. For each, `grep -ac "Create
Room"` counted real button-click sites (browser-driven joins) vs. files that
never click it at all (raw-socket `CREATE_ROOM` + `hostRoomCode` +
`page.goto` HOST_REJOIN pattern — the gate self-clears on rejoin once
`roomCode` is set, since nothing ever interacts with it):

- **0 clicks, correctly untouched** (socket-level room creation only):
  `241-name-check.ts`, `242-name-clip-check.ts`, `242-podium-name-check.ts`,
  `245-name-check.ts`, `247-winner-gender-check.ts`,
  `248-numeric-clip-check.ts`, `bot-mode-param-check.ts`,
  `duel-overlay-check.ts`.
- **Clicks present but `?bot=N` always in the URL, correctly untouched**
  (gate auto-skipped, `audioGatePassed` starts `true`):
  `250-leader-wreath-check.ts` (`?bot=5`), `climb-entry-check.ts`
  (`?bot=1`), `intro-seam-check.ts` (`?bot=${BOTS}`, default 3).
- **`259-tap-to-start-check.ts`**: the gate's own test harness (11
  Create-Room-related locator hits across its pre-tap/post-tap assertions,
  5 real gate taps) — deliberately untouched, it tests the exact feature
  this task is patching around.
- **`podium-subtitle-followup-check.ts`**: already fixed in Task 259 itself
  (2 navigations, both already tapped) — untouched here.
- **Everything else — 17 files, no `?bot=`, real "Create Room" click(s) —
  got the one-line tap added**, unconditionally except one file where the
  URL is scenario-dependent (see below).

## 1. Files touched, run results

All commands from `/home/argyrios/Aegean`. Ports are each file's own
hardcoded/env-default throwaway pair (39xx/59xx) — no production risk.

| file | command | runtime | check summary | verdict |
|---|---|---|---|---|
| dev/242-numeric-check.ts | `npx tsx dev/242-numeric-check.ts` | ~15s to fail (killed by 180s timeout wrapper, but the actual failure — the dead join UI — surfaces within seconds of room creation) | room created via gate fine; fails afterward on `custom-name-toggle` (pre-existing, unrelated — see §2) | gate fix confirmed; harness FAILS (pre-existing) |
| dev/agora-phone-check.ts | `npx tsx dev/agora-phone-check.ts` | 51s | room created via gate fine; fails on `custom-name-toggle` (pre-existing, unrelated) | gate fix confirmed; harness FAILS (pre-existing) |
| dev/agora-sophists-check.ts | `npx tsx dev/agora-sophists-check.ts` | 40s | criteria 1/2/3a/3b all PASS | PASS |
| dev/agora-scene-check.ts | `npx tsx dev/agora-scene-check.ts` | 51s | criteria 1/2 PASS; criterion 3 (proof-beat highlight count) FAIL — this run's random seed drew a `count`-kind subject that is always-present, so 2 highlight elements instead of 1; a scene-rendering edge case, not gate-related, out of this task's scope (would require client/ changes) | gate fix confirmed; 1 pre-existing FAIL |
| dev/duel-hint-check.ts | `npx tsx dev/duel-hint-check.ts` | 15s | 8 passed, 0 failed | PASS |
| dev/climb-ceremony-check.ts | `npx tsx dev/climb-ceremony-check.ts` | 460s | 94 passed, 0 failed | PASS |
| dev/climb-lane-check.ts | `npx tsx dev/climb-lane-check.ts` | 283s | 22 passed, 0 failed | PASS |
| dev/finale-staging-check.ts | `npx tsx dev/finale-staging-check.ts` | 477s | 35 passed, 0 failed | PASS |
| dev/socrates-cutoff-check.ts | `npx tsx dev/socrates-cutoff-check.ts` | 175s | 16 captured playbacks, all natural ack (one documented "NO ENDED LINE" case, expected), 0 explicit FAIL lines, exit 0 | PASS |
| dev/lethe-scene-check.ts | `npx tsx dev/lethe-scene-check.ts` | 41s | diagnostic-only (no `check()` framework in this file) — completed cleanly, exit 0, printed its 132-sample scene table | PASS (by completion) |
| dev/lethe-vs-agora-stage-check.ts | `npx tsx dev/lethe-vs-agora-stage-check.ts` | 94s | diagnostic-only — `socrates-figure count = 1` (stage 1 QUESTION) vs `= 0` (stage 5 AGORA_QUESTION), matching CLAUDE.md's documented expectation; exit 0 | PASS (by completion) |
| dev/242-subtitle-check.ts | `npx tsx dev/242-subtitle-check.ts` | 37s (1st, FAIL) / 51s (retry, PASS) | 1st attempt: `avatar-option:not([disabled])` click for the second phone timed out (a flaky UI-timing issue in the already-Task-255-fixed preset-name/avatar-grid flow, NOT the dead `custom-name-toggle`) — gate itself worked fine both times (room created instantly). Retry: 7 passed, 0 failed | PASS on retry; one pre-existing flake, unrelated to the gate |
| dev/253-blitz-rounds-check.ts (SCENARIO=B) | `SCENARIO=B npx tsx dev/253-blitz-rounds-check.ts` | 91s | reached GAME_OVER after both rounds, `[B] DONE`, exit 0 (no explicit pass/fail counter — this scenario's own success criterion is reaching GAME_OVER) | PASS |
| dev/blitz-timing-check.ts (SCENARIO=B) | `SCENARIO=B DIAG_OUT=<writable dir> npx tsx dev/blitz-timing-check.ts` | 100s | ran to completion, wrote timing logs, exit 0. **Needed `DIAG_OUT` overridden** — the file's own fallback default (`OUT_DIR = process.env.DIAG_OUT ?? '/tmp/claude-0/-root-Aegean-/<stale-session-id>/scratchpad'`) is a hardcoded path from a past session that this user cannot write to; pre-existing, unrelated to the gate, NOT fixed here (out of scope — would be a `dev/` edit unrelated to the gate task) | gate fix confirmed; pre-existing `DIAG_OUT` default is broken, unfixed, reported |
| dev/pause-resume-check.ts | `npx tsx dev/pause-resume-check.ts` | ~1250s (file's own header documents "~20 minutes serially") | `20 timed phases probed`, every row `phase held = true`, exit 0. My first two attempts used a 400s `timeout` — too short for this suite by the file's own documentation — and were killed mid-run, producing a `locator.count: ... browser has been closed` red herring that was my own harness-runner mistake, not a real failure | PASS |
| dev/end-state-timer-subtitles-check.ts | `npx tsx dev/end-state-timer-subtitles-check.ts` | ~1330s (two full 7-stage `mode=full` shows, back to back via play-again; this file's own scenario-0 pre-check plus games 1+2 needed a 1400s budget — a first attempt at 400s was killed mid-climb-finale) | `27 passed, 0 failed` | PASS |
| dev/screenshot-phases.ts | `BOT_COUNT=2 npx tsx dev/screenshot-phases.ts` | 1057s (two earlier attempts run concurrently with other harnesses in this task both failed on `locator.waitFor`/`Target page, context or browser has been closed` — resource contention from several simultaneous Chromium instances on this 7.6GB shared VM, the same failure mode `tasks/259-tap-to-start.md` already documents; a solo run cleared it) | `done - 19/19 phase screenshots, 12/12 phone screenshots`, exit 0 | PASS (solo) |

## 2. Failures unrelated to the gate

- **`custom-name-toggle`** (dev/242-numeric-check.ts, dev/agora-phone-check.ts):
  the dead join-UI element deleted at Task 241/245 — CLAUDE.md's own
  documented trap (`grep -arn "custom-name-toggle" client/src` returns 0
  hits; the flow is now name-search/name-list/preset-name-option). Both
  files reach "room created" via the gate fine, then hang/timeout waiting
  for this testid. Determined by the exact locator name in the Playwright
  timeout log matching the documented dead flow, not a gate symptom (the
  gate's own testid, `audio-gate`, never appears in either failure).
- **`dev/agora-scene-check.ts` criterion 3**: a scene-rendering edge case
  for a `count`-kind agora question whose subject happens to be present
  (2 highlight elements instead of the harness's hardcoded expectation of
  1). Unrelated to the gate (room creation and the whole flow up to this
  point succeed); fixing it would mean editing `client/` code, out of this
  task's scope.
- **`dev/blitz-timing-check.ts`'s `DIAG_OUT` default**: points at another
  session's now-nonexistent, unwritable scratchpad path. Worked around for
  verification by passing `DIAG_OUT` explicitly; not fixed in the file
  itself since it's unrelated to the gate.
- **`dev/242-subtitle-check.ts`'s one-time avatar-click flake**: did not
  reproduce on retry (7/7 clean); logged as a flake, not a stable
  pre-existing bug, since the gate portion of both runs behaved identically
  (instant room creation).
- **`dev/screenshot-phases.ts` and `dev/pause-resume-check.ts` both hit
  `Target page, context or browser has been closed` mid-run** when run
  concurrently with several other Playwright-driven harnesses from this
  task (running four verification groups in parallel, each spawning its own
  Chromium). Both had already created their room via the gate successfully
  before the crash, and both passed cleanly once re-run alone — this is the
  same environmental resource-contention failure mode `tasks/259-tap-to-
  start.md` documents for this small 7.6GB shared VM, not a gate defect.

## 3. Enumeration completeness

See "Enumeration method" above — all 29 `dev/*.ts` files referencing
`/host` were individually classified; the 17 that needed the tap all have
it, the 12 that didn't (0-click socket-only files, `?bot=`-driven files,
and the two already-correct gate-testing/podium files) are correctly
unchanged.

## 4. Inverse diff

```
$ git diff --stat
 dev/242-numeric-check.ts               |   1 +
 dev/242-subtitle-check.ts              |   1 +
 dev/253-blitz-rounds-check.ts          |   1 +
 dev/agora-phone-check.ts               |   2 ++
 dev/agora-scene-check.ts               |   1 +
 dev/agora-sophists-check.ts            |   1 +
 dev/blitz-timing-check.ts              |   1 +
 dev/climb-ceremony-check.ts            |   1 +
 dev/climb-lane-check.ts                |   1 +
 dev/duel-hint-check.ts                 |   1 +
 dev/end-state-timer-subtitles-check.ts |   1 +
 dev/finale-staging-check.ts            |   1 +
 dev/lethe-scene-check.ts               |   2 ++
 dev/lethe-vs-agora-stage-check.ts      |   1 +
 dev/pause-resume-check.ts              |   1 +
 dev/screenshot-phases.ts               | Bin 52113 -> 52161 bytes
 dev/socrates-cutoff-check.ts           |   1 +
 17 files changed, 18 insertions(+)
```
Zero `client/`, `server/`, or `shared/` paths touched.
(`screenshot-phases.ts` shows as binary because it deliberately holds a NUL
byte as a key separator — CLAUDE.md's own documented trap.)

`dev/245-name-check.ts`: **31 passed, 0 failed** (exit 0, 217s — re-verified
directly, not touched by this task since it never clicks "Create Room").

No deploy run (dev tooling only, per instructions).
