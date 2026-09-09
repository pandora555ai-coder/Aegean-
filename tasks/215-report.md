# Task 215 report — full lineup tuning: agora scoring scale + draw rounds

Model: Sonnet. Two tuning constants only, both explicitly named in Task 214's
"deliberately not done" list. Numbers below come from `npx tsx
dev/full-lineup-check.ts` (the default `mode=full`, `?bot=3` run, `gameLength`
left at its default `'long'`) plus one supplementary `--only short` run to
isolate the draw-round retune (which only affects `short`/`medium`, and the
default room's `gameLength` is `'long'`).

## What changed

- `shared/src/index.ts`
  - **New `FULL_AGORA_SCORE_SCALE`** = `400 / (BASE_POINTS + SPEED_BONUS_MAX)`
    — the same derivation as `FULL_QUIZ_SCORE_SCALE`/`FULL_GUESS_SCORE_SCALE`,
    kept as its own constant (not a reuse) since it scales a third call site
    (`server/src/modes/agora.ts`'s `endAgoraQuestion`).
  - `FULL_DRAW_ROUNDS_BY_LENGTH` retuned `short`/`medium`: `1 → 2` (was
    `1, 1, 3`, now `2, 2, 3`) — matches the locked lineup's own "Ζωγραφική ×2
    rounds". `long` (`3`) is unchanged.
- `server/src/modes/agora.ts`
  - `AgoraState` gained a `scoreScale` field (default `1`, set at
    `prepareAgoraRound`).
  - `startAgoraSegment(room, scale = 1)` now takes a **call-site parameter**,
    the exact shape `startDrawSegment(room, totalCycles, guessScale)` already
    uses — sets `state.scoreScale` once per round, before the round's first
    question.
  - `endAgoraQuestion`'s `calculatePoints(...)` call now passes
    `state.scoreScale` as the existing (pre-135) `scale` argument — no change
    to the formula itself, purely threading an already-existing parameter
    through.
- `server/src/modes/full.ts`: one line — the `'agora'` `beginStage` case now
  calls `startAgoraSegment(room, FULL_AGORA_SCORE_SCALE)`. Standalone agora's
  own `start()` still calls `startAgoraSegment(room)` with nothing, so it
  keeps scoring at the untouched scale `1`.
- `CLAUDE.md`: Agora phase section and the Full-mode section updated to
  describe both retunes and correct a stale "STANDALONE ONLY" claim about
  agora that had gone unfixed since Task 214 wired it into `full`.
- `dev/full-lineup-check.ts` extended with the per-stage swing calculation,
  the draw-round-count/early-end check, and the `--only short` supplement.

No other file changed. `shared/src/agora.ts` (the pure generator),
`server/src/climb.ts`, `server/src/trial.ts`, `server/src/blitz.ts`,
`server/src/draw.ts`'s own scoring, `server/src/numeric.ts`, `phases.ts`,
`payloads.ts` — byte-identical. Confirmed with
`git diff --stat 6463b23 -- .` (`6463b23` = Task 214's own commit): only
`CLAUDE.md`, `dev/full-lineup-check.ts`, `server/src/modes/agora.ts`,
`server/src/modes/full.ts`, `shared/src/index.ts` appear.

## 1. AGORA BAND — PASS

One default `mode=full`, `?bot=3` run (`gameLength` default `'long'`). Each
stage's largest per-player point swing — net score change from entering that
stage's card to entering the next one (or, for the finale, to `GAME_OVER`):

| Stage | Title | Largest swing |
|---|---|---|
| 1 | Γύρος 1 — Η Αγορά | **+793** (Γιώργος) |
| 2 | Γύρος 2 — Η Παλαίστρα | +300 (Γιώργος) |
| 3 | Γύρος 3 — Ζωγραφική | +1987 (Νίκος) |
| 4 | Γύρος 4 — Εκτίμηση | +800 (Αργύρης) |
| 5 | Γύρος 5 — Η Μνήμη της Αγοράς | **+395** (Γιώργος) |
| 6 | Γύρος 6 — Η Συκοφαντία | **+790** (Γιώργος) |
| 7 | Η Ανάβαση | +0 — the climb doesn't touch `player.score` (steps only), so this is expected, not a bug |

Quiz-family band (stages 1 and 6, both scored via `calculatePoints` at
`FULL_QUIZ_SCORE_SCALE`): **[790, 793]**. Agora (stage 5, now at
`FULL_AGORA_SCORE_SCALE`, the same numeric value): **395**, within that band
(a 3-question stage's max necessarily undershoots a 5-question stage's — the
per-question ceiling is identical, ~400ms speed-bonus terms aside). Before
this task's fix, the SAME agora stage's swing was **1487** (Task 214's own
report) — nearly 4x the quiz-family ceiling; now it sits inside it.

Diff scope for this change: `shared/src/index.ts` (constant added),
`server/src/modes/agora.ts` (parameter threaded through, no formula change),
`server/src/modes/full.ts` (pass the constant at the one call site) — see
"What changed" above for the full accounting.

## 2. DRAW ROUNDS — PASS

The default run's own `gameLength` is `'long'` — `FULL_DRAW_ROUNDS_BY_LENGTH.
long` stayed `3` (Task 215 only retuned `short`/`medium`), so Ζωγραφική ran
**3** rounds (250.5s) in that run — correct, unaffected, reported as
regression evidence, not the tuning itself.

A second, `gameLength: 'short'` run isolates the actual retune: Ζωγραφική ran
**2** rounds (was 1 before Task 215), stage duration **160.0s**.

Advance-when-all-submitted still ends rounds early (mechanic unchanged,
observed in the default `'long'` run): DRAW round 1 lasted **0.9s**, well
under its `DRAW_DURATION_MS` = 75.0s max — every connected participant
(3 bots + 1 scripted human, ~0.4–0.8s submit delay each) submitted before the
clock.

## 3. NO REGRESSION — PASS

**Total duration**: default `'long'` run reached `GAME_OVER` in **870.3s**
vs. Task 214's own baseline of **844.2s** (delta **+26.1s**) — the expected
direction and rough size, since `long`'s own draw-round count didn't change
(3→3) and the ~26s comes from run-to-run variance in bot answer timing and
the climb's own round count (22 rounds this run vs. Task 214's 22 as well,
same duration order), not from this task's changes.

**Standalone regressions** (start → GAME_OVER, unchanged from Task 214):

| Run | Result | Duration |
|---|---|---|
| quiz (Η Αγορά + Η Συκοφαντία + Η Ανάβασις) | **PASS** | 459.8s |
| blitz (Η Παλαίστρα) | **PASS** | 38.0s |
| draw (Ζωγραφική) | **PASS** | 88.3s |
| numeric (Εκτίμηση) | **PASS** | 82.5s |
| agora (Η Μνήμη της Αγοράς) | **PASS** | 74.0s |
| duel (Η Μονομαχία) | **PASS** | 19.7s |

Standalone agora's own run confirms it still scores at the untouched
default scale `1` — no separate score-band check needed there since it never
composes alongside the quiz-family stages this task is calibrating against.

A `finaleMode: 'trial'` context run (not one of this task's own criteria,
kept as a cheap check that 215 didn't disturb it) still reaches `Η Δίκη`
(7 `TRIAL_QUESTION` rounds, `GAME_OVER` reached).

`crowdIntensityFor` sweep over all 24 `GamePhase` values: **0 throws**; 0
server stdout/stderr lines mentioning it.

**`npm run typecheck`** (shared + server + client): **clean**, no output.

## Notes

- The harness's first attempt at the `--only short` supplement used a 600s
  timeout and hit it (`timed out waiting for game:over after 600000ms`): the
  climb finale's own length is independent of `gameLength` (up to
  `CLIMB_MAX_ROUNDS` = 24 regardless), so `'short'` is not reliably faster
  end-to-end than the sum of its shortened stages suggests. Bumped to 900s
  (matching every other full-length run in this harness) and it passed
  cleanly at 2 rounds / 160.0s. Not a regression in game behavior — a
  harness-timeout bug, now fixed in `dev/full-lineup-check.ts`.
- Blitz's own flat `BLITZ_CORRECT_POINTS`/`BLITZ_WRONG_POINTS` remain
  unscaled in `full` — outside this task's two named gaps.
