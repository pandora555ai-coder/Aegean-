# Task 216 report — CLAUDE.md refresh: lineup composed and tuned (214, 215)

Model: Sonnet. Documentation only. `git diff --stat` confirms exactly one
file changed: `CLAUDE.md` (63 insertions, 13 deletions). Every claim below
was checked against the code at HEAD (commit `b6e78e7`, Task 215) before
being written; file:line citations are in this report, not duplicated as
inline comments in CLAUDE.md beyond what already existed there.

## 1. COVERAGE — every bullet present, mapped to its verification evidence

| Bullet | CLAUDE.md location | Verified against |
|---|---|---|
| Full lineup is the 7-stage locked show | CLAUDE.md:336-343 | `shared/src/index.ts:932` (`FULL_STAGES`, 6 rows) + `:997` (`fullStagesForLength`, appends `trialStageRow` as the 7th) |
| Old 5-stage description replaced everywhere | see STALENESS below | grep swept the whole file |
| `finaleMode` default is now `'climb'`, `'trial'` still selectable | CLAUDE.md:446-449 | `shared/src/index.ts:1357`: `finaleMode: 'climb',` inside `DEFAULT_ROOM_SETTINGS` (Task 214 flipped it; unrelated to 215) |
| `StageSegment` actual variant list | CLAUDE.md:356-357 | `shared/src/index.ts:720`: `export type StageSegment = 'quiz' \| 'draw' \| 'numeric' \| 'blitz' \| 'agora' \| 'trial';` — exact order matched |
| Blitz composable into `full`; Η Παλαίστρα COMPLETE, no "156c pending"/incomplete claim | CLAUDE.md:697-713 (new sentences at 710-713) | `server/src/modes/blitz.ts:80` (`prepareBlitzGame`), `:94` (`startBlitzSegment`); `server/src/modes/full.ts`'s `beginStage` `'blitz'` case calls both. grep for `156c`/`pending`/`not yet.*phone` = 0 hits before AND after this task |
| Agora scoring scale, named + valued | CLAUDE.md:384-385 | `shared/src/index.ts:926`: `export const FULL_AGORA_SCORE_SCALE = 400 / (BASE_POINTS + SPEED_BONUS_MAX);` — `BASE_POINTS=1000` (:288), `SPEED_BONUS_MAX=500` (:289) → 400/1500 ≈ 0.267 |
| `FULL_DRAW_ROUNDS_BY_LENGTH = 2/2/3`, default room plays `long` (3 rounds) | CLAUDE.md:369-376 | `shared/src/index.ts:893-897` (values), `:1351` `DEFAULT_ROOM_SETTINGS.gameLength: 'long'` |
| Known issue: Η Ανάβασις ignores `gameLength` | CLAUDE.md:881-890 (Traps) | `grep -n gameLength server/src/phases.ts server/src/climb.ts shared/src/index.ts \| grep -i climb` → 0 hits; `CLIMB_MAX_ROUNDS`/`CLIMB_MAX_QUESTIONS` both fixed at 24 regardless |
| Reference `?bot=3` full-run timing, floor not estimate | CLAUDE.md:344-352 | `tasks/214-report.md` (844.2s, per-stage table), `tasks/215-report.md` (870.3s) — both files, numbers copied verbatim |
| Remove/correct contradicting claims | see below | full-file read + targeted fixes (list below) |

## 2. ACCURACY (inverse) — PASS

**Method**: read the entire 917-line CLAUDE.md top to bottom in ~150-line
chunks after editing (six `Read` passes covering every line), cross-checking
every code-referencing claim I was uncertain of against the actual source
with `grep`/`sed` at HEAD. Checked **~40 discrete factual claims** this way
(constant names/values, function names, line-number citations, stage
numbers, file paths). Result: **0 references to nonexistent files/exports**,
**0 claims contradicting code at HEAD** after the fixes below were applied.

Fixes made during this pass (each one a real staleness/inaccuracy the sweep
found, not from the task's own bullet list except where noted):

1. `server/src/modes/full.ts`'s "Where things live" entry said "COMPOSES
   quiz/draw/numeric/trial as one show's five stages" — corrected to name
   all six composed modes and "seven LOCKED stages" (CLAUDE.md:86-88).
2. `server/src/modes/agora.ts`'s entry said "standalone only" — corrected;
   it's been full's stage 5 since Task 214 (CLAUDE.md:104-105).
3. "Η Συκοφαντία (quiz stage 3, full stage 4)" — full's Η Συκοφαντία is
   stage 6 now, not 4. Rewrote the whole paragraph (CLAUDE.md:415-426) and
   in the process found a REAL bug (not a doc error) while verifying it:
   `socrates.ts`'s `STAGE_INTRO_LINES` still keys `SYKOPHANTIA_INTRO_LINES`
   under stage numbers `3` and `4` (socrates.ts:460-461) — a leftover from
   when full's Η Συκοφαντία WAS stage 4. Key `4` is now orphaned (full's
   actual stage 4, Εκτίμηση, never reaches `pickStageIntroLine` — its
   `beginStage` hook intercepts first) and key `6` doesn't exist, so full's
   own Η Συκοφαντία stage plays **no** STAGE_INTRO line — confirmed by
   reading `pickLine`'s empty-pool-returns-null path (socrates.ts:1040-1043)
   and `startSocratesBeat`'s `if (!picked) return false;` (phases.ts). Not
   fixed — this task is documentation only — but documented in both the
   Phases section and a new Traps bullet (CLAUDE.md:891-895).
4. `## Numeric mode` said "composed as Stage 3 of `full`" — it's stage 4
   now (CLAUDE.md:685-686).
5. Crowd mood's "a short full game emits 48 crowd:mood events" — this
   number predates Task 214's two extra crowd-wired stages (blitz, agora)
   and is almost certainly no longer accurate; I did not re-measure it (out
   of this task's scope and not one of its named bullets), so I marked it
   explicitly STALE rather than delete or silently keep it as current
   (CLAUDE.md:790-792).

## 3. STALENESS — 0 stale hits remain

Grep patterns run against the edited file (all after the edits, in the
repo root):

```
grep -n "default 'trial'" CLAUDE.md                                    # 0
grep -n "five stages\|5 stages" CLAUDE.md                              # 0
grep -n "standalone only\|STANDALONE ONLY\|standalone-only" CLAUDE.md  # 0
grep -ni "phone view.*pending\|pending.*phone view\|not yet.*phone" CLAUDE.md  # 0
grep -n "156c" CLAUDE.md                                               # 0
grep -n "full stage 4\|stage 4)" CLAUDE.md                              # 0
grep -n "quiz stage 3, full stage" CLAUDE.md                            # 0
grep -n "future decision" CLAUDE.md                                    # 0 (old pre-214 agora wording)
```

Every pattern returned 0 matches. The two matches an earlier looser sweep
returned for `"quiz.*draw.*numeric.*trial"` were both false positives — the
`StageSegment` union list and the (correct, current) "quiz/blitz/draw/
numeric/agora/trial(climb)" description of `full.ts`'s composition — not
stale text.

## Not done (in scope for a future task, not this one)

- The orphaned `STAGE_INTRO_LINES` key (item 3 above) is a real behavioral
  gap, not just documentation. Fixing it is a one-line code change
  (`socrates.ts`) explicitly out of scope here.
- Crowd mood's `48 events` figure needs a fresh `full` run to re-measure,
  not attempted (docs-only, not named in the task).
