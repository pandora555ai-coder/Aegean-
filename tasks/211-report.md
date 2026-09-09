# Task 211 — Docs refresh: the Agora stage lands (tasks 206-210)

Independent post-hoc verification against HEAD (commit 3b4935b, the commit
that made the CLAUDE.md edits). Read-only on CLAUDE.md this pass — every
figure below was re-derived fresh with grep/Read against current source,
not recalled. Note: `tasks/211-agora-docs.md` does not exist in the repo
(`ls tasks/` has no such file) — verified instead against the task-211
spec as given (12s-scene stage overview, harness one-liners, GamePhase/
GameModeId counts, AGORA_\* constants, agora-reference.html listing, the
two rules, the two design notes, the known-issue bullet).

## 1. COVERAGE — PASS, all 8 spec items present

- Stage overview + truth table in shared/src/agora.ts: CLAUDE.md:61-79,
  232-233.
- Harness one-liners: `agora:validate` CLAUDE.md:76-79; `agora:wire-check`
  + `--pause-virtual` CLAUDE.md:251-253,798-806; TV check
  (`agora-scene-check.ts`) CLAUDE.md:288; phone check
  (`agora-phone-check.ts`) CLAUDE.md:312-319; sophists/market check
  (`agora-sophists-check.ts`) CLAUDE.md:328-330,586.
- Counts: `GamePhase has 24 values` / `GameModeId has 7` — CLAUDE.md:222-223.
- AGORA_\* constants + 5 stall types + 5 colour tokens: CLAUDE.md:64-70.
- `design/agora-reference.html` in the reference listing (AgoraScene.tsx
  entry, parallel to AnavasisScene.tsx): CLAUDE.md:128-136,134.
- Rule (a) market frame: CLAUDE.md:585-595 (TV layout) +
  CLAUDE.md:320-330 (Phases cross-reference).
- Rule (b) TimerClock/never REAL_CLOCK: CLAUDE.md:798-806.
- Design notes (proof TV-only; swatch name-keyed brittleness): CLAUDE.md:
  68-74, 239.
- Known issue (stale standings snapshot, unfixed): CLAUDE.md:807-815.

## 2. ACCURACY (inverse) — PASS, 0 contradictions found

Checked 12 distinct facts by re-running the source query fresh (not
trusting the prior write-up): `AGORA_EXPOSURE_MS`/`AGORA_STALL_SLOTS`/
`AGORA_GOODS_MIN`/`MAX` (shared/src/agora.ts:23-26) and the 5-row
`AGORA_COLOURS` table (shared/src/agora.ts:90-96) all match their
CLAUDE.md values exactly; `GamePhase`'s member count re-counted
programmatically (`awk`+`grep -c` over the type's own line range) = 24,
not assumed from the doc; `GameModeId`'s union (shared/src/index.ts:449)
= 7 members ending in `'agora'`; `SophistsRow.tsx:110,465,502` and
`HostScreen.tsx:2280,2364` (`forceHidden`/`agoraProofShowing`) match
CLAUDE.md's citations verbatim; `dev/agora-sophists-check.ts:1`'s own
comment contains the exact quoted phrase CLAUDE.md attributes to it;
`server/scripts/agora-validate.ts:1-7`'s header matches the CLAUDE.md
description; `dev/agora-phone-check.ts`'s ports (3904/5905, lines 22-23)
match; `HostScreen.tsx:1583`'s `lastStandingsRef` exists as cited; and
`tasks/210-report.md:47-50` contains the quirk CLAUDE.md's known-issue
bullet describes. 0 references to nonexistent files/exports, 0 claims
contradicting HEAD among everything re-checked. Not re-audited: line
numbers on claims that predate 206-210 and describe historical (already-
fixed) states elsewhere in the file — out of this task's scope.

## 3. STALENESS — PASS, 0 hits

Patterns run fresh against CLAUDE.md at HEAD, each confirmed 0-match
(grep exit 1): `"GamePhase has 2[0-3] values"`, `"GameModeId has [1-6] "`,
`"6 modes"`/`"six modes"`, and any `GameModeId` union listing ending
before `'agora'` (`` 'quiz' | 'draw' | 'numeric' | 'full' | 'blitz' |
'duel'` ``). Also checked `"phase-only placeholder"`/`"not yet built"`/
`"not yet wired"`/`"still a placeholder"` — 0 hits (the one genuine
placeholder sentence for Task 209's phone view is gone). Sanity check
that the Agora phase list itself is present: `"^Agora (207):"` — 1 hit,
CLAUDE.md:232.
