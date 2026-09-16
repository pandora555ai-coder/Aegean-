# Task 256 — Harness hygiene: screenshot-phases + end-state check

Scope: `dev/` only (plus this doc). Zero changes to `client/`, `server/`,
`shared/`.

## Part 1 — screenshot-phases.ts, stale finale captures

Removed the `TRIAL_QUESTION`/`TRIAL_REVEAL` entries from both `PHASE_CAPTURES`
and `ALL_PHASES_IN_ORDER` (Η Δίκη has been URL-only since `DEFAULT_ROOM_SETTINGS.
finaleMode` flipped to `'climb'` at Task 214 — the harness's own game never
overrides it), deleted the two stale PNGs, and left a comment saying Η Δίκη
would need its own flagged run (`finaleMode: 'trial'`) to capture. Fixed the
`PHASE_CAPTURES` doc comment ("-> Η Δίκη -> game over" → "-> game over") and a
second stale comment near the game-1 setup that still said "quiz/draw/numeric/
**trial**".

**A second, knock-on bug surfaced once the TRIAL_REVEAL wait was gone**: the
`GAME_OVER` capture's selector (`'[data-testid="winner-banner"]'`) is
`GameOverView`'s own testid — the TRIAL finale's ceremony. Since this run's
finale is climb, `GAME_OVER` instead mounts `AnavasisCrowning`
(`'anavasis-winner-banner'`) for `PODIUM_DELAY_MS` before `PodiumView` takes
over, so the wait would have hung for 240s on every run from here on. Fixed
the selector to accept either testid (`'[data-testid="winner-banner"],
[data-testid="anavasis-winner-banner"]'`), same OR-selector idiom the file's
own `STEAL` entry already uses. This is the same root cause as the trial
captures (harness assumptions never updated for the Task 214 finale-default
flip), one capture site further down the same pipeline — not a second,
unrelated task folded in.

### Criterion 1 — PNG counts and timestamps

- **Before**: 37 PNGs in `client/public/dev/shots/` (35 + the 2 stale
  `TRIAL_QUESTION.png`/`TRIAL_REVEAL.png`).
- **Deleted**: `TRIAL_QUESTION.png`, `TRIAL_REVEAL.png`.
- **After a full run**: 35 PNGs — 19 TV + 12 phone (both from
  `screenshot:phases`, matching the new `ALL_PHASES_IN_ORDER.length` of 19)
  + 4 `AGORA_*` files, which belong to a *separate* harness
  (`dev/agora-scene-check.ts`) that this task doesn't touch or run.
- **Timestamps**: all 31 TV+phone files are `2026-09-16` (this run), oldest
  of those `phone-join.png` at `21:30:13`. The 4 `AGORA_*` files are
  untouched from `2026-09-14 15:42` — correctly so, since a different
  harness owns them and Part 1's instructions said not to run a second game.
- The harness needed two attempts to get a clean run: the first hit a
  timing-dependent hang in the climb finale of the file's own THIRD
  chained game (`captureClimbPhases`, via `VIP_PLAY_AGAIN` on the same
  room) — a Socrates beat's backstop never fired for ~240s. A retry
  completed cleanly (`done - 19/19 phase screenshots, 12/12 phone
  screenshots`), so this reads as a pre-existing, timing-sensitive flake in
  that chained-game path, not a regression from this task's edits (which
  never touch that code) — left undocumented further since it self-resolved
  and is out of this task's two named defects.

## Part 2 — end-state-timer-subtitles-check.ts, three false failures

Ported the two corrected measurement methods from
`dev/podium-subtitle-followup-check.ts` verbatim, changing only *how* each
value is measured:
- **FAIL 1 & FAIL 3** (podium digit scans, both game 1 and game 2): swapped
  `.textContent()` → `.innerText()` on `podium-root`. `.textContent()` sweeps
  up `PodiumView`'s own `<style>{STYLE_TAG}</style>` child's raw CSS text
  (cqh/rem numbers); `.innerText()` reflects only what's actually rendered.
- **FAIL 4** (stage card vs. subtitle overlap): swapped the `cardBox`
  selector from `'[data-testid="stage-announce"]'` (the full-viewport,
  mostly-transparent positioning wrapper) to `'[data-testid="stage-announce"]
  > div'` (the actual content box).

No assertion changed — same `check(...)` calls, same thresholds, only the
DOM reads feeding them.

**A third, unrelated bug blocked a clean run**: scenario 0 (the `?bot=3&mode=
full&clock=off` throwaway all-bot room) was only ever closed at the
*browser* level (`ctx.close()`); server-side the room and its bots kept
playing their own multi-minute `full` show for the rest of the file's
execution ("game continues running" logs on host disconnect). This starved
the main run's SECOND phone's socket connection badly enough that
`useSocketConnection`'s `connected` flag never flipped true within
Playwright's 30s action timeout, hanging forever on an `avatar-option` click
that could never become enabled (measured: 3 of 4 runs before the fix hung
there; the 4th hung 15s earlier, waiting on scenario 0's own `room-code`).
Fixed by capturing scenario 0's room code and calling `deleteRoom()`
(`server/src/state.js`, already exported) on it once the check completes —
this file boots the server *in-process* (`await import('../server/src/
index.js')`), so the room can just be deleted outright rather than merely
orphaned. Confirmed via a throwaway diagnostic (not committed): with
scenario 0 skipped entirely, "both phones joined" printed immediately; with
the real fix applied to the committed file, the same held on the very next
full run.

### Criterion 2 — final line

**`27 passed, 0 failed`.** (Full check-by-check pass list captured in the
run log; scenario 0's own check plus all 26 main-run checks passed,
including the three previously-false ones: `1: zero digit characters
anywhere in the podium text — matches: []`, `3: game 2 podium is correct and
digit-free too — digits=[]`, `4: the stage card and the subtitle never
overlap — 16 sampled`.)

Getting there took 4 attempts of the ~23-minute two-game harness: run 1
reproduced the scenario-0 starvation bug (avatar-option click, 30s
timeout — a further methodology/reliability bug in the harness's OWN setup,
not a product defect, not one of the three named issues); run 2 hit the same
root cause one step earlier (scenario 0's own `room-code` wait); run 3
reproduced the avatar-option hang again, confirming it wasn't a one-off
flake; a diagnostic (scenario 0 skipped) confirmed the root cause instantly.
After applying the `deleteRoom()` fix to the real file, the very next run
went to `27 passed, 0 failed` with no further retries.

### Criterion 3 — proof the three fixed checks can still fail

- **Podium digit checks (1 and 3)**: `dev/podium-subtitle-followup-check.ts`
  exercises the identical `PodiumView` component and was run live this
  session — its own check A logged `podium .textContent() digit count: 31`
  against `podium .innerText() digit matches: []` for the same podium. Since
  end-state's checks assert `digitMatches.length === 0`, the un-fixed
  `.textContent()` reading (31 matches) would fail that assertion — the
  exact false failure being fixed, on the same markup.
- **Overlap check (4)**: injected the OLD selector side-by-side with the new
  one in a throwaway diagnostic (`startClimb` invoked directly against a
  real 2-player `full`-mode room, deleted after use, not committed). Live
  measurement at a real `STAGE_INTRO` beat:
  - OLD selector (`'[data-testid="stage-announce"]'`) box:
    `{"x":0,"y":36,"width":1280,"height":648}` — the exact full-viewport box
    CLAUDE.md's own trap notes document from the original false failure.
    Overlap against the subtitle box (`{"x":153.6,"y":14.4,"width":972.8,
    "height":56.9}`): **true**.
  - NEW selector (`'[data-testid="stage-announce"] > div'`) box:
    `{"x":390,"y":261.6,"width":500,"height":196.8}`. Overlap: **false**.

  Both methods measured against the same live beat — a check that used the
  old selector fails every time; the fixed one passes, matching reality (no
  visible overlap on screen).

### Criterion 4 — inverse diff + regression checks

`git diff --stat`:
```
dev/end-state-timer-subtitles-check.ts |  30 ++++++++++++++++++++++++++----
dev/screenshot-phases.ts               | Bin 52834 -> 53605 bytes
2 files changed, 26 insertions(+), 4 deletions(-)
```
(`screenshot-phases.ts` shows as binary because it deliberately holds a NUL
byte as a key separator — CLAUDE.md's own documented `grep`/diff trap;
`git diff -a` confirms the change is the plain text edit described above.)
Zero `client/`, `server/`, or `shared/` paths touched.

- `dev/245-name-check.ts`: **31 passed, 0 failed**.
- `dev/podium-subtitle-followup-check.ts`: **6 passed, 0 failed**
  (unaffected — this task ported methods *from* it, never edited it).

No deploy run (dev tooling only, per instructions).
