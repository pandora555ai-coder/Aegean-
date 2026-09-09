# Task 206 — Η Μνήμη της Αγοράς: pure generation module + truth table +
# validation harness

New files only: `shared/src/agora.ts` (the module), `server/scripts/
agora-validate.ts` (the harness, `npm run agora:validate`). `shared/src/
index.ts` gained one line (`export * from './agora.js';`) so the harness
can reach it via `@game/shared`, same as every other shared export — no
phase machine, payloads, or client code touched.

## Criterion 1 — DETERMINISM
- Same seed twice: `generateAgora(42)` + `buildAgoraQuestions(scene, 42)`
  hashed twice → **`b15fae9e09242fc7` both times, byte-identical JSON**
  (harness also asserts this for all 10,000 seeds in the main run: 0
  failures on the "deterministic" checks).
- 3 different seeds → 3 different scenes: seed 1 `190184e661673e4f`, seed 2
  `d39ed460a06a82b6`, seed 3 `ff7187fec0e5bf00` — all distinct.
- Import list of `shared/src/agora.ts`: **empty** (`grep -n "^import"`
  returns nothing) — no server/runtime imports, pure by construction.

## Criterion 2 — VALIDITY
10,000 seeds / 30,000 questions, all assertion categories from the task
(4-options, exactly-one-correct via 4-distinct-options, twin guard,
colour/count subject-is-a-present-stall, count truth in bounds,
never-the-colour-question's-stall) run per seed/question:
- **187,739 checks passed, 0 failed.**
- **Twin guard violations: 0.**
- **Absent-subject violations (colour/count asked about an absent
  stall): 0.**
- **Count-bounds violations (truth outside 2..5 for a stall / 1..3 for
  geese): 0.**

## Criterion 3 — DISTRIBUTION
- **Verdict: no category exceeds 2x uniform skew** (automated check over
  stall presence, colour correctness, count subject, and existence
  variant — see `tasks/206-distribution.md` for the reasoning behind the
  widest gaps, none of which tripped the flag).
- **Param-signature uniqueness: 9,995/10,000 = 99.95%** (> 99% ✓).
- Full frequency table: `tasks/206-distribution.md`.

## Criterion 4 — HYGIENE
- `npm run typecheck` (shared + server + client): **all three `tsc
  --noEmit` clean, 0 errors.**
- The three phrasings actually rendered (verbatim from `shared/src/
  agora.ts`, per the addendum that superseded the task's own "approved
  demo" reference):
  - existence: `"Ποιο από αυτά ΥΠΗΡΧΕ στην αγορά;"` (preferred; falls back
    to `"Ποιο από αυτά ΔΕΝ υπήρχε στην αγορά;"` when the safe absent pool
    has fewer than 3 items — fired on 22.6% of the 10,000 seeds).
  - colour: `"Τι χρώμα είχε η τέντα στον πάγκο με {stallLabel};"`, e.g.
    `"...με τους αμφορείς;"` / `"...με τα ψάρια;"`.
  - count: `"Πόσα {goodsPlural} είχε {merchantNom};"` per stall (amphorae
    is the sole grammatical exception, `"Πόσους αμφορείς είχε ο
    αμφορέας;"`), or `"Πόσες χήνες τριγύριζαν στην αγορά;"` for geese.

## Notes
- Twin guard (amphorae↔pottery) makes more sense with the addendum's real
  Greek nouns than my first draft's: κεραμικά (ceramics) and αμφορείς
  (clay storage jars) are genuinely the same visual family, unlike the
  placeholder "πήλινα σκεύη" wording I'd started with.
- No screenshots, no Playwright — per the task, this is a pure-module +
  harness task only.
