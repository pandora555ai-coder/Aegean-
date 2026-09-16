# Task 255 — Repair the five name-broken harnesses (dev/ only)

## Part 0 — commits since the last handoff

`git log --oneline 9569d75..HEAD`:

```
f250422 Task 254 follow-up: correct the report's own diff stat
60a5ff8 Task 254: status report + two CLAUDE.md traps (docs only)
ed608e2 chore: ignore local .claude directory
e8fc792 docs: working dir moved to /home/argyrios/Aegean, runs as argyrios
```

`git show --stat` on each: f250422 touches only `tasks/254-status-and-traps.md`;
60a5ff8 touches `CLAUDE.md` + `tasks/254-status-and-traps.md`; ed608e2 touches
only `.gitignore`; e8fc792 touches only `CLAUDE.md`. **None touch a non-docs
file** — clear to proceed.

## Environment note (not part of the scope, but blocked every harness)

Playwright's Chromium binary was not installed in this environment
(`browserType.launch: Executable doesn't exist at .../chromium_headless_shell-1234/...`).
Every one of the eight harnesses below failed identically until
`npx playwright install chromium` was run once. Installed, not otherwise
part of this task's file scope.

## Part 1 — the five name-broken harnesses

### dev/climb-entry-check.ts — NAMES-only (joins at socket level)
Changed `joinSim('Άλφα', ...)`/`joinSim('Βήτα', ...)` to `'Άρης'`/`'Νίκη'` (the
same replacements Tasks 246/249 already used for their own Greek-letter
names).
Run: `npx tsx dev/climb-entry-check.ts` (this session ran it on
`SERVER_PORT=3925 CLIENT_PORT=5926` only because the default 3920/5921 were
in concurrent use by another harness this same session; the default
invocation is unaffected).
Runtime: ~10 minutes (a real `?bot=1&mode=full` show to the climb's first
question, then a pinned climb to GAME_OVER for the play-again check).
Result: **9/9 passed** — climb entry timeline (finale="climb" on the wire,
zero theatre frames, zero wreath sightings across 618 samples, zero
MutationObserver flashes), every other stage's card still committing
TheatreScene (6 checked, exactly 1 finale card), and play-again's game 2
back on TheatreScene with `finale: null`.

### dev/242-subtitle-check.ts — join flow ported
Two phones' join steps: `custom-name-toggle`/`custom-name-input`/
`custom-name-confirm` → `?room=` deep link straight to `name-list` →
`preset-name-option` (names Άλφα/Βήτα → Άρης/Νίκη).
Run: `npx tsx dev/242-subtitle-check.ts`. Runtime: ~50s.
Result: **7/7 passed** — intro-beat subtitle text + zero overlap vs
SophistsRow/stage-card, stage-announce beat likewise, all with the real
DOM text logged.

### dev/duel-hint-check.ts — join flow ported
Same swap, but via `code-input` (no deep link in this file) →
`name-list` → `preset-name-option`.
Run: `npx tsx dev/duel-hint-check.ts`. Runtime: ~15s.
Result: **8/8 passed** — both duelists' weapon hint present, full
Ξίφος▸Δόρυ▸Ασπίδα▸Ξίφος cycle, 4 icons, 3 real weapon slabs (regression
check) — for both Άρης and Νίκη.

### dev/end-state-timer-subtitles-check.ts — NAMES + join flow
`NAMES = ['Άλφα','Βήτα']` → `['Άρης','Νίκη']`; both phones' join steps
ported off `custom-name-*` to `name-list`/`preset-name-option`.
Run: `npx tsx dev/end-state-timer-subtitles-check.ts`. Runtime: ~34 minutes
(two full `mode=full` games back to back, each including a climb finale).
Result: **24 passed, 3 failed**. The 3 failures are the SAME pre-existing,
already-diagnosed false failures this file's own follow-up
(`podium-subtitle-followup-check.ts`, written for exactly this) explains:
`.textContent()` on `podium-root` picks up `<style>` tag CSS digits (not a
real digit on screen — `.innerText()` is the correct read, confirmed
digit-free below), and the "stage card overlaps the subtitle" check reads
`stage-announce`'s own full-viewport positioning wrapper instead of its
actual content box. Both are called out in this file's own comments as
NOT what a viewer sees; nothing here regressed by the name/join fix — every
other check (stage-duration record, subtitle text matching payload
exactly across 24 beats, an Ανάβασις rule line captured, podium
row order, "Νέο παιχνίδι" relabel, play-again integrity, fresh
question draw, beat-id reset, scores at 0) passed clean.

### dev/podium-subtitle-followup-check.ts — join flow ported (2 spots)
Both the climb-announce setup (2 phones) and the podium quiz+trial setup
(2 phones) ported off `custom-name-*` to `name-list`/`preset-name-option`.
Run: `npx tsx dev/podium-subtitle-followup-check.ts`. Runtime: ~5 minutes.
Result: **6/6 passed** — this is the very harness that re-verifies the two
false failures above: `.textContent()` DOES pick up style-tag digits
(confirms the mechanism) while `.innerText()` has zero; the corrected
`[data-testid="stage-announce"] > div` content box shows zero overlap with
the subtitle across all 3 Ανάβασις announce beats, each producing real
subtitle text.

## Part 2 — screenshot-phases.ts and socrates-pacing-check.ts

### dev/screenshot-phases.ts — DID carry the dead flow, repaired
`grep` (plain) found nothing because this file holds a deliberate NUL byte
(CLAUDE.md's own documented trap); `grep -a` found it at lines 739-741.
`PHONE_NAME` was `'Δοκιμή'` (not a preset name at all) driven through
`custom-name-toggle/input/confirm`. Changed to `'Άρης'` (picked from the
FRONT of PRESET_NAMES — bots claim from the END, so this is collision-free
at any `BOT_COUNT` up to `MAX_BOTS`=7) and ported the join step to
`name-list`/`preset-name-option`.
Run: `npm run screenshot:phases` (default `BOT_COUNT=4`). Runtime: ~11
minutes before timeout.
Result: the join-flow fix **works** — LOBBY/join/lobby captured
immediately, then the game played cleanly through stage 6 (Η Συκοφαντία),
capturing 35 of the 37 files on disk fresh (STAGE_ANNOUNCE, POWER_UP,
QUESTION, REVEAL, DRAW, GUESS, GUESS_REVEAL, NUMERIC_*, STEAL, all AGORA_*,
BLITZ*, and every phone-*.png up through phone-gameover.png). The run then
**timed out** (240s) waiting for `trial-reveal-progress`. Root cause,
confirmed via the server log ("room 1082 entering the climb — 5
climbing...") and via `TRIAL_REVEAL.png`'s on-disk timestamp staying at
2026-09-09 while every phase around it refreshed to today: the primary
capture run (line ~1051-1054) never sets `finaleMode` explicitly, and
`DEFAULT_ROOM_SETTINGS.finaleMode` has been `'climb'` since Task 214 — so
this harness's own stage-6→"Η Δίκη" assumption (stated in its PHASE_CAPTURES
comment) has been stale since 214, unrelated to Task 241/245's name changes.
**Not fixed** — it is not a join-path failure, and Task 255's mandate
("repair it the same way" for a join-path failure) does not cover a
separate, pre-existing settings-default regression; fixing it would mean
adding an explicit `finaleMode: 'trial'` to the first run's
`VIP_UPDATE_SETTINGS`, which is a real but DIFFERENT bug worth its own task.

### dev/socrates-pacing-check.ts — DID carry the dead flow (scenario E only), repaired
Lines 664-667: `custom-name-toggle/input/confirm` → `name-list`/
`preset-name-option`, using `NAMES[0]` (already `'Άρης'`, Task 249's own
NAMES-only fix).
Run: `SCENARIO=E npx tsx dev/socrates-pacing-check.ts` (isolates exactly the
phone-driven path this task touched). Runtime: ~10s.
Result: **4/4 passed** — VIP-first/non-VIP-second confirmed by badge, the
skip control renders for the VIP phone (count=1) and not for the non-VIP
phone (count=0).
Also ran the full unfiltered suite (`npx tsx dev/socrates-pacing-check.ts`,
all scenarios A-E) to check for regressions: scenario A passed 6/6 checks
shown, scenario B started, then the run **crashed** inside scenario D
(`TypeError: Cannot read properties of undefined (reading 'category')` at
`server/src/phases.ts:613`, called from `startQuestion → beginRound →
beginStageOrRound → advanceFromSocrates`). Confirmed via `git diff` that
this session's edit touches ONLY the three join-flow lines inside scenario
E's `phoneSkipNodeCount` — scenario D's code (direct `startClimb` +
`VIP_SKIP_SOCRATES` calls) was not touched — so this is a pre-existing
server-side crash, unrelated to the join-flow repair and out of scope to
fix (server/ is off-limits for this task).

## Acceptance criteria

1. **Part 0**: commit list above, one line each — none touch a non-docs
   file (all four are `CLAUDE.md`/`tasks/*.md`/`.gitignore` only).
2. **Each of the five**, command/runtime/results:
   - `dev/climb-entry-check.ts` — `npx tsx dev/climb-entry-check.ts`, ~10 min, **9/9**.
   - `dev/242-subtitle-check.ts` — `npx tsx dev/242-subtitle-check.ts`, ~50s, **7/7**.
   - `dev/duel-hint-check.ts` — `npx tsx dev/duel-hint-check.ts`, ~15s, **8/8**.
   - `dev/end-state-timer-subtitles-check.ts` — `npx tsx dev/end-state-timer-subtitles-check.ts`, ~34 min, **24/27 (3 pre-existing known false failures, see above)**.
   - `dev/podium-subtitle-followup-check.ts` — `npx tsx dev/podium-subtitle-followup-check.ts`, ~5 min, **6/6**.
   All five ran to completion; none timed out or hung on the join path.
3. **screenshot-phases.ts / socrates-pacing-check.ts at HEAD**: both
   DID carry the dead custom-name flow (contrary to "flagged, not
   verified" — verified broken), both repaired the same way as Part 1.
   `screenshot-phases.ts`: join-flow fix confirmed working (35 fresh
   screenshots through stage 6), full run still fails on an unrelated
   pre-existing `finaleMode` default bug (not fixed, out of scope).
   `socrates-pacing-check.ts`: `SCENARIO=E` (the affected scenario) **4/4**;
   full suite hits an unrelated pre-existing server crash in scenario D
   (not fixed, out of scope — server/ is off-limits).
4. **Inverse**: `git diff --stat` — 7 files, all under `dev/`
   (`242-subtitle-check.ts`, `climb-entry-check.ts`, `duel-hint-check.ts`,
   `end-state-timer-subtitles-check.ts`, `podium-subtitle-followup-check.ts`,
   `screenshot-phases.ts`, `socrates-pacing-check.ts`) plus this task file.
   **Zero** `client/`, `server/`, `shared/` paths. `dev/245-name-check.ts`
   re-run: **31/31 passed** — `PRESET_NAMES`/`VOCATIVE_FORMS`/`NAME_GENDER`
   untouched.
