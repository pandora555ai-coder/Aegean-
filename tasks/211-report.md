# Task 211 — Docs refresh: the Agora stage lands (tasks 206-210)

Documentation only. `git diff --stat`: 1 file changed (CLAUDE.md), 0 code
files touched. Every claim below was checked against HEAD before writing;
citations are file:line, not guesses.

## 1. COVERAGE

- **New stage overview** (12s exposed scene + 3 questions
  existence→colour→count, truth table server-side): CLAUDE.md:232-233
  (unchanged, already correct) plus the new `shared/src/agora.ts` entry,
  CLAUDE.md:61-79 — verified against shared/src/agora.ts:23-96,308-314.
- **Validation harnesses, one-liners**: `agora:validate` — CLAUDE.md:76-79
  (verified against server/scripts/agora-validate.ts:1-7); `agora:wire-check`
  with `--pause-virtual` — the existing line (CLAUDE.md:251-253) plus a new
  Traps bullet, CLAUDE.md:798-806 (verified against dev/agora-wire-check.ts
  and the 37f0324 commit message); phone check (`agora-phone-check.ts`) —
  CLAUDE.md:312-319; TV check (`agora-sophists-check.ts`) — CLAUDE.md:328-330
  and CLAUDE.md:585-595.
- **GamePhase 24 / GameModeId 7**: already correct at CLAUDE.md:222-224
  before this task (verified: 24 members counted in shared/src/index.ts:
  475-526, `GameModeId`/`GAME_MODE_IDS` at shared/src/index.ts:449-450) —
  no edit needed, confirmed rather than assumed.
- **AGORA_\* constants**: CLAUDE.md:61-75 — EXPOSURE_MS=12000,
  STALL_SLOTS=3, GOODS 2-5, the 5 stall types, the 5 colour id/nameGr/hex
  tokens, all read from shared/src/agora.ts:23-30,35-37,90-96.
- **design/agora-reference.html in the reference listing**: new
  `client/src/components/AgoraScene.tsx` entry, CLAUDE.md:128-136,
  parallel to the existing AnavasisScene.tsx entry.
- **Rule (a) market frame**: new bullet, CLAUDE.md:585-595 (TV layout) plus
  a cross-referencing paragraph in Phases, CLAUDE.md:320-330 — verified
  against SophistsRow.tsx:110,465,502 and HostScreen.tsx:2280,2364.
- **Rule (b) TimerClock, never REAL_CLOCK**: new Traps bullet,
  CLAUDE.md:798-806 — verified against server/src/timers.ts:38-54,
  dev/agora-wire-check.ts's `--pause-virtual`, and commit 37f0324's own
  "1 ms readback tick is clock granularity, not timer drift" wording.
- **Design note: reveal proof TV-only**: already present pre-task
  (CLAUDE.md:238-241); reinforced with Task 209's own runtime confirmation
  in the new phone paragraph, CLAUDE.md:312-319 ("0 scene-derived DOM
  nodes on the phone at runtime").
- **Design note: phone swatches name-keyed, renaming breaks them**: folded
  into the new shared/src/agora.ts entry, CLAUDE.md:70-74, and repeated
  briefly in the phone paragraph, CLAUDE.md:306-309.
- **Known issue: stale standings fallback**: new Traps bullet,
  CLAUDE.md:807-815 — verified against tasks/210-report.md's own
  "Note — an unrelated timing quirk" section and `lastStandingsRef`
  (HostScreen.tsx:1583).

## 2. ACCURACY (inverse)

Full re-read of the 829-line file end to end after editing (not spot
checks). Every new identifier/path/line-number I added was independently
re-verified with a fresh grep/Read against HEAD (see citations above, all
of which round-tripped). One PRE-EXISTING claim was found stale as a
side effect of my own Task 209 work growing ControllerScreen.tsx: the
Traps section's "Fixed by clearing it in `handleQuestionShow` itself
(line 519)" no longer pointed at that function (it's now at line 878) —
corrected in place, CLAUDE.md:787-789. No other broken file/export
references or HEAD-contradicting claims were found in the full read.

Boundary: I did not attempt to re-verify every historical line-number
citation elsewhere in the file (e.g. the Task 140 bug's own historical
"1588 vs. 1851/1969" snapshot, or the "18 before Task 207" PHASE_CHANGED
emit-site count) — those predate the 206-210 work this task documents and
describe historical states, not live ones; re-auditing the whole file's
history is outside this task's brief. 0 references to nonexistent
files/exports found among the ~15 identifiers/paths I introduced or
touched; 0 HEAD-contradicting claims found among them.

## 3. STALENESS

Patterns used (all via `grep -n`/`grep -ni` against CLAUDE.md, all after
editing): `"GamePhase has 2[0-3]"`, `"has 20/21/23 values"`, `"GameModeId
has [56]"`, `"6 modes"`/`"six modes"`, a check that every `GameModeId`
listing includes `'agora'`, and `"phase-only placeholder"`/`"not yet
built"`/`"not yet wired"`. **0 stale hits remain** — the one genuine
placeholder sentence ("The phone view is Task 209 ... still a phase-only
placeholder") was removed and replaced with the built description; every
`GameModeId` union listing already included `'agora'` pre-task. The two
pre-existing "21" hits elsewhere in the file (screenshot-harness PNG
count, TV-phase coverage count) are unrelated to `GamePhase` and are
correct as written.
