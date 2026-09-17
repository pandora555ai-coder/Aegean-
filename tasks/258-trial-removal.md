# Task 258 — Η Δίκη removed

Executes the map in `tasks/257-trial-removal-diagnosis.md`: everything in its
Section A is gone, everything in its Section B is untouched and **unrenamed**
(renaming inside a removal hides what broke — that is a later task). Section E's
order was followed, so the tree typechecks and a full game stays playable at
every step.

`server/src/modes/trial.ts` never existed (257 flagged this) — the trial was the
quiz's FINALE, not a mode, so there was no registry entry to unregister.

**Diff:** 34 files — 30 modified, 3 deleted, 1 added (this doc) — with
**2348 deletions against 376 insertions outside this doc**. The three deletions:
`server/src/trial.ts` (115), `client/src/screens/host/TrialQuestionView.tsx` (62),
`client/src/screens/host/TrialRevealView.tsx` (80).

---

## 1. Typecheck + a full `?bot=5&mode=full` game

**Typecheck: clean** across all three workspaces (`@game/shared`, `@game/server`,
`@game/client`), run against the final tree.

**GamePhase: 24 → 22.** Counted off the union, not assumed:
`TRIAL_QUESTION` and `TRIAL_REVEAL` are gone; the remaining 22 are LOBBY,
STAGE_ANNOUNCE, POWER_UP, QUESTION, REVEAL, STEAL, SOCRATES, DRAW, GUESS,
GUESS_REVEAL, NUMERIC_QUESTION, NUMERIC_REVEAL, CLIMB_QUESTION, CLIMB_REVEAL,
DUEL_PICK, DUEL_REVEAL, BLITZ, BLITZ_REVEAL, AGORA_EXPOSE, AGORA_QUESTION,
AGORA_REVEAL, GAME_OVER.

**Full game** — `SCENARIO=A npx tsx dev/253-blitz-rounds-check.ts` (a 5-bot
`mode=full` show, end to end, socket-level), reached GAME_OVER:

| stage | title | duration |
|---|---|---|
| 1 | Γύρος 1 — Η Αγορά | 53.4s |
| 2 | Γύρος 2 — Η Παλαίστρα | 79.5s |
| 3 | Γύρος 3 — Ζωγραφική | 184.3s |
| 4 | Γύρος 4 — Εκτίμηση | 40.4s |
| 5 | Γύρος 5 — Η Λήθη | 46.2s |
| 6 | Γύρος 6 — Η Συκοφαντία | 76.2s |
| 7 | Η Ανάβαση | 72.9s |

**Stage count 7/7** (7 STAGE_ANNOUNCE renders, every card `totalStages=7`).
**Total 552.9s** (sum of stages == wall clock, 552.9s).

**Winner path: a top arrival.** Round 5 struck Ξανθίππη out by the spear
(`eliminated: true` at step 0); round 7 revealed `next=WINNER` with Σμαράγδα
reaching `stepAfter: 10` = `CLIMB_TOP`. GAME_OVER ranked her 1st on **position,
not points** — she finished on 6959 while the 4th-placed Μαρκέλλα held 10231,
which is exactly the `isTrialResult` no-digits contract still doing its job.

---

## 2. The five `finaleMode:'trial'` harnesses

All five ran. Their old short path was "pick the trial, it ends fast"; the new
one is "answer Η Ανάβασις' questions", because every climber locking in ends the
round at once (`submitClimbAnswer` → `endClimbQuestion`), which costs ~3s a round
instead of the full 22s timer. Each sim's deleted TRIAL handler was replaced by a
`CLIMB_QUESTION_SHOW` → `CLIMB_SUBMIT` one (and a duel weapon pick where the run
can reach a duel).

| harness | command | new short path | runtime | result |
|---|---|---|---|---|
| `dev/245-name-check.ts` | `npx tsx dev/245-name-check.ts` | climb-answering sim | 251s | **31 passed, 0 failed** |
| `dev/242-podium-name-check.ts` | `npx tsx dev/242-podium-name-check.ts` | climb + duel sim; GAME_OVER deadline 240s → 600s | 336s | **2 passed, 0 failed** |
| `dev/242-name-clip-check.ts` | `npx tsx dev/242-name-clip-check.ts` | climb-answering sim; podium deadline 180s → 600s | 351s | **9 passed, 0 failed** |
| `dev/podium-subtitle-followup-check.ts` | `npx tsx dev/podium-subtitle-followup-check.ts` | drove the climb through the phone UI + duel weapon taps | 206s | **6 passed, 0 failed** |
| `dev/241-name-check.ts` | `npx tsx dev/241-name-check.ts` | climb-answering sim; `short` → `medium`; STEAL poll 60s → 240s; podium deadline 240s → 600s; climb-lane sample waits for painted text | 425s | **30 passed, 0 failed** |

### Pre-existing breakage found while repairing these (NOT caused by Task 258)

- **`242-podium-name-check` and `242-name-clip-check` had been scoring zero
  since Tasks 241/245.** Their names were synthetic width-test strings
  (`ΑΒΓΔ` / `ΔΗΜΗΤΡΗΣ` / `ΝΞΟΠΡΣΤΥΦΧΨΩ`), which `isValidPlayerName` rejects
  outright now that names are preset-only, so the FIRST join timed out and the
  run died before any check ran. Repaired to real presets `Άρης` / `Δημήτρης` /
  `Κωνσταντίνα`. **No preset is 12 characters** (the longest is `Κωνσταντίνα` at
  11), so those width checks are now 4/8/**11**, relabelled in place.
  `242-name-clip` also joined a hardcoded `'ΝΙΚΟΛΑΟΣ'` — likewise not a preset —
  now `Κυριάκος`, still a second 8-char name distinct from `Δημήτρης`.
- **`241-name-check`'s "B2: STEAL banner reached" was unsatisfiable.**
  `GAME_LENGTH_STAGE_COUNT.short = 2`, so a `short` quiz stops after Οι Σοφιστές
  and never reaches Η Συκοφαντία (stage 3) — the only stage that fires a STEAL.
  That line already said `gameLength: 'short'` before this task; Task 258 only
  removed `finaleMode` from the same emit. Fixed with `medium`, and the 60s poll
  widened to 240s so it outlasts stages 1-2. Now captures a real banner
  (`steal-thief captured: ["Κυριάκος"]`).
- **`241-name-check`'s climb-lane check was racing the paint.** It sampled the
  climber plaques on element-presence plus a fixed 500ms, which catches rows
  that already have a fitted `fontSize` but no text yet — observed as
  `["ΚΥΡΙΑΚΟΣ","","",""]`, with a *different* name populated each run, so the
  ΠΑΝΑΓΙΩΤΗΣ lookup missed at random. It failed three runs running, on a quiet
  box as well as a loaded one, in a section that builds its own room via
  `startClimb` and never reads `gameLength`. Fixed by waiting for the TEXT of
  all four plaques instead of the first node; the check now reports
  `["ΚΥΡΙΑΚΟΣ","ΕΥΑΓΓΕΛΙΑ","ΠΑΝΑΓΙΩΤΗΣ","ΑΡΗΣ"]` and ΠΑΝΑΓΙΩΤΗΣ at
  scrollWidth 53 = clientWidth 53, no spill past its 57.6px lane.
- **One regression of my own, caught and fixed:** changing `NAME_8` from the
  literal `'ΔΗΜΗΤΡΗΣ'` to the preset `'Δημήτρης'` silently broke
  `rows.find((r) => r.text === NAME_8)` in `242-name-clip`, because plaques
  render through `greekUpper` (uppercase AND tonos dropped) and plain
  `toUpperCase()` keeps the tonos. Added a `foldName()` helper that folds both
  away.

---

## 3. Voice bank — met IN CODE, explicitly NOT on disk

**Active line count: 278 → 273** (observed via `collectVoiceLineEntries()`), and
**0 pools still reference the five hashes** — 0 entries with moment
`TRIAL_INTRO`, 0 entries carrying any of those hashes.

**The five mp3s were NOT deleted.** `client/public/voice` is the symlink into
`/opt/party-game` (production); the files are owned by `partygame`, and there is
no passwordless sudo. Per Argyrios' decision (2026-09-17): leave them, do not
write to `/opt/party-game`, no sudo, no deletion.

The five hashes, **code-dead but present on disk in production**:

```
d295dac7a65e30d9  3ddebe8b10733d14  6218772f908eaf1e  d059880e03c6da1f  74674c00d0b43251
```

**Criterion 3 is met IN CODE (278 → 273 active lines, 0 pool references) and
explicitly NOT on disk.** This is not reported as passed.

**Orphan count in the voice dir goes from 7 to 12** (measured: 283 mp3s on disk,
273 active lines, 271 active-with-an-mp3 → 12 orphans, and all five trial hashes
are among them). **A future bank audit or mass line-rating pass must exclude
orphans, or it will rate dead clips.**

On "0 missing-clip lookups": every one of the 273 active lines resolves to a file
on disk **except two CORONATION lines** (`06cbdcc48f4e5b6b`, `a735117c0fd3c013`),
which have been absent by design since Task 247 and are unrelated to this task.
No ENOENT/404/decode-failure line appears in any run log — though note those logs
capture server and harness stdout, not the browser console, so the static
resolution check above is the real evidence.

---

## 4. INVERSE — every Section B survivor still works

Not renamed, not touched: `isTrialResult`, `trialStageRow`, `StageSegment 'trial'`,
`trialStageNumber`, `TrialLockIn`, `renderTrialSpectator`, `sortAndRankResults`,
the `'finale'` StageIntroIdentity, and `server/scripts/trial-montecarlo.ts`.

| check | runtime | result |
|---|---|---|
| `npm run climb:ceremony-check` | 455s | **94 passed, 0 failed** (all 5 scenarios: duel-decided, spear-on-the-winning-reveal, round cap, top-arrival at 2/3/4/5/6 players, socket-level ranking) |
| `npx tsx dev/podium-subtitle-followup-check.ts` | 206s | **6 passed, 0 failed** |
| `npx tsx dev/245-name-check.ts` | 251s | **31 passed, 0 failed** |
| `npx tsx dev/climb-entry-check.ts` | 475s | **8 passed, 1 failed** — see below |
| `npm run climb:spear-check` | <1s | **17 passed, 0 failed** |
| `npm run trial:montecarlo -- --runs 200 --players 4` | 24ms | 200 runs, **0 anomalies**, 0 invariant violations (climb-only now) |

**The climb ceremony still hides digits — `isTrialResult` path alive.** The
ceremony suite's 94 checks include the zero-digit gating, and criterion 1's own
GAME_OVER proves it live: rank 1 on 6959 placed above rank 4 on 10231, i.e.
position ordering with the score carried but never rendered. `payloads.ts` sets
`isTrialResult: true` on the climb branch exactly as before.

**`dev/climb-entry-check.ts`: 8/1, the same failure before and after.**
"the committed scene is the Anavasis world for the WHOLE entry window — 1 theatre
sample of 618". It reproduced **identically on a loaded box and on a quiet one**
(1/618 both times, window 422.73s..453.61s then 420.93s..451.81s), and the same
lone sample also shows no card at all (card visible in 617 of 618) — it is the one
50ms frame before React commits the first card+world, at the very start of the
window. Everything substantive passes: the card carries `finale="climb"` on the
wire, zero wreath sightings, the MutationObserver saw no wreath flash, all six
non-finale cards still commit TheatreScene, and game 2 resets the signal
(`finale=null`, theatre). **Not verified against pre-removal code** — I did not
stash and re-run HEAD — so it is recorded as an unresolved harness boundary
condition rather than claimed as pre-existing.

---

## Also done

- `server/scripts/trial-montecarlo.ts` **keeps its name** (Section B) and lost
  only its trial half: the VirtualClock, `simulateOne`, `RunResult`,
  `runTrialBatch`, the `--finale` flag and the express/Room/timer imports. The
  climb simulation and `--spear` are untouched; `package.json`'s
  `trial:montecarlo` script still works.
- `StageAnnouncePayload.finale` / `SocratesShowPayload.finale` narrowed
  `FinaleMode | null` → `'climb' | null` rather than deleted — the TV reads them
  to enter the Anavasis world (Task 244).
- `trialStageRow` now falls back to `CLIMB_STAGE_TITLE`/`CLIMB_STAGE_TAGLINE`
  (the two TRIAL_STAGE_* constants it used are gone). `buildStageAnnounce`
  rebuilds the card off `room.climb` anyway.
- SophistsRow's elimination machinery (`eliminatedPlayerIds` /
  `confirmedOutPlayerIds`) is left in place but now receives `null`: TRIAL_REVEAL
  was the only phase that ever sank+removed a figure mid-game. Dead, deliberately
  not torn out in a removal task.
- Dead `finaleMode` references cleaned from `dev/climb-entry-check.ts` and
  `dev/screenshot-phases.ts` (the key is silently ignored now, so behaviour was
  already identical).
- Final sweep: **zero live references** to any removed symbol across
  `shared/src`, `server/src`, `client/src`, `dev`, `server/scripts`,
  `package.json`. All 12 edited harnesses parse clean.

## Deploy — NOT done, by instruction

Argyrios ran the deploy himself. Two blockers were found and **left alone** (no
`deploy.sh` edit, no `~/Aegean-` symlink, nothing written under
`/opt/party-game`):

1. `deploy/deploy.sh` sets `DEV_DIR=~/Aegean-` (trailing hyphen). That path does
   not exist for user `argyrios`; `cd "$DEV_DIR"` would abort on line 7 under
   `set -e`.
2. The script needs `sudo` five times, which this account does not have without a
   password.

**Working-copy handoff:** `whoami=argyrios`, `pwd -P=/home/argyrios/Aegean`,
remote `https://github.com/pandora555ai-coder/Aegean-.git`. The only working copy
visible to this account is `/home/argyrios/Aegean`; `/opt/party-game` has no
`.git` (consistent with deploy.sh rsyncing into it). `/root` is `root:root 0700`
and unlistable from this account, so **whether `/root/Aegean-` exists cannot be
verified from here** — the trailing hyphen matches the GitHub repo name, so
`~/Aegean-` in deploy.sh is most likely root's own clone, not a second copy under
`argyrios`.
