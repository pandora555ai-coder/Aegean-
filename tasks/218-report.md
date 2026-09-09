# Task 218 — STAGE_INTRO_LINES: key by stage identity, not index

## 1. DIAGNOSIS (pre-fix, from observation)

`STAGE_INTRO_LINES` (pre-fix `server/src/socrates.ts:~448`) was keyed
`Partial<Record<number, readonly string[]>>` by raw table position: `1` (6
lines, "Η Αγορά" flavor), `2` (6 lines, "Οι Σοφιστές" flavor), `3` and `4`
both pointing at `SYKOPHANTIA_INTRO_LINES` (8 lines) — 3 pools, 4 keys.
`pickStageIntroLine(state, stage)` read `STAGE_INTRO_LINES[stage] ?? []`.

Ran a genuine `?bot=3` full-mode game against the unmodified codebase
(`dev/stage-intro-check.ts`, room 7924) and grepped the server's own log
for each of the 7 stages:
- Stage 1 Η Αγορά (key 1): STAGE_INTRO fired correctly.
- Stage 2 Η Παλαίστρα/blitz: no key, silent (correct — no pool expected).
- Stage 3 Ζωγραφική/draw: no key, silent (correct).
- Stage 4 Εκτίμηση/numeric: key `4` exists (SYKOPHANTIA lines) but
  `beginStage` intercepts numeric before `pickStageIntroLine` runs, so key
  4 is dead code — never observed firing.
- Stage 5 Η Μνήμη της Αγοράς/agora: no key, silent (correct).
- Stage 6 Η Συκοφαντία (the real steal stage): key `6` doesn't exist —
  `entering stage 6/7 — Γύρος 6 — Η Συκοφαντία` immediately followed by
  `started — question 6/10 (stage 6)` with **zero** `Socrates
  (STAGE_INTRO)` line between them. Confirmed: plays NOTHING, not a wrong
  line.
- Stage 7 finale: bypasses this table entirely (own trial/climb path).

Verdict: 1 stage silent by real bug (6, Η Συκοφαντία in full mode); 4
silent by design (2/3/4/5 — blitz/draw/numeric/agora, all correctly
intercepted before reaching this table, so key `4`'s content is moot).

## 2. MAPPING (post-fix, ?bot=3 full game, room 7186)

| stage | identity | STAGE_INTRO fired? | first ~40 chars |
|---|---|---|---|
| 1 Η Αγορά | quiz | yes | "Οι Σοφιστές. Από εδώ και πέρα δεν αρκεί..." |
| 2 Η Παλαίστρα | blitz | no (no pool) | — |
| 3 Ζωγραφική | draw | no (no pool; own DRAW_INTRO fires separately) | — |
| 4 Εκτίμηση | numeric | no (no pool) | — |
| 5 Η Μνήμη της Αγοράς | agora | no (no pool) | — |
| 6 Η Συκοφαντία | steal | **yes** | "Η Συκοφαντία ανοίγει. Κρατήστε τους πόντ..." |
| 7 Η Ανάβαση | finale | no (own climb/trial announce path, not this table) | — |

Stage 6 now fires a `steal`-pool line — the fix's whole point. Every fired
line belongs to its stage's own pool (stage 1 drew a line originally
written for "Οι Σοφιστές" but that's the intended merge, see criterion 4).

## 3. SILENCE (inverse), pre-fix vs post-fix durations (STAGE_ANNOUNCE→next log line)

| stage | pre-fix gap | post-fix gap |
|---|---|---|
| 2 blitz | 3503ms | 3503ms |
| 3 draw | 3500ms | 3501ms (176857−173356) |
| 4 numeric | 3501ms | 3502ms |
| 5 agora | 3503ms (461707−458204) | 3502ms |

All four match `STAGE_ANNOUNCE_DURATION_MS` = 3500ms exactly, before and
after — zero STAGE_INTRO delay added or removed by this change, as
expected (these stages never reach `pickStageIntroLine`).

## 4. NO REGRESSION

Ran each standalone mode (`?bot=3`, one real game each):
- **quiz**: stage 1 (Η Αγορά) → `quiz`-pool line "Τα πρώτα ερωτήματα...";
  stage 2 (Οι Σοφιστές) → `quiz`-pool line "Η γνώση χωρίς πονηριά..."; stage
  3 (Η Συκοφαντία) → `steal`-pool line "Η Συκοφαντία ανοίγει...". All three
  correct.
- **draw**: DRAW_INTRO, 3× DRAW_MOMENT, DRAW_WINNER all fired normally,
  GAME_OVER reached, 0 errors.
- **numeric**: 3× NUMERIC_MOMENT fired, GAME_OVER reached, 0 errors.
- **blitz**: GAME_OVER reached, 0 errors (mode has no SOCRATES phase at
  all — untouched by this change by construction).
- **agora**: 3× AGORA_MOMENT fired, GAME_OVER reached, 0 errors (mode has
  no STAGE_ANNOUNCE phase — untouched by construction).

Total line count in `STAGE_INTRO_LINES`: pre-fix 3 distinct arrays (6 + 6
+ 8 = 20 unique lines, `SYKOPHANTIA_INTRO_LINES` referenced twice under
keys 3/4); post-fix 2 pools, `quiz` (12 = the same 6+6 merged) + `steal`
(the same 8-line array, referenced once). 20 unique lines both times — no
line added, removed, or reworded.

## Typecheck

`npm run typecheck` (shared + server + client) passes clean post-fix.
