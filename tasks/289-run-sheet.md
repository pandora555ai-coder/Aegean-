# Task 289 — Run sheet: the full show flow, who acts, when Socrates speaks

Read-only. Deliverable: `docs/RUNSHEET.md`, built from the code at HEAD
(`a43dbdc`) via four parallel research passes (phase/beat sequence,
Socrates moment-pool census, voice-bank cross-check, dead-pipe
verification), then reconciled and written by hand. Zero code changes.

## Acceptance criteria

1. **Ordered phase/beat list with file:line, count of steps.** 21 numbered
   steps (0 Lobby through 20 Game over) in `docs/RUNSHEET.md`, each citing
   the server function and line(s) that drive it (e.g.
   `server/src/phases.ts:1122` for the single post-Task-258 `startClimb`
   call site). Full-mode-only side pools noted separately, not numbered
   into the main sequence.

2. **Pool census totals.** 12 distinct Socrates pool constants; ~43
   individual moment-keys walked; 2 ⚠ SILENT GAP (`HOT_STREAK_3`,
   `CLOSE_SCORES`, both inside the generic `LINES` reveal pool — emptied by
   a prior voice-review deletion pass, not newly broken); 1 ☠ DEAD PIPE
   (`pickQuestionIntro`/`INTRO_LINES` — Task 219 deleted the on-screen
   caption it fed and no audio path was ever wired to it; still confirmed
   dead at HEAD, `client/src/screens/HostScreen.tsx` has zero references to
   `socratesIntro`). These reconcile against a live, in-process run of
   `collectVoiceLineEntries()` against the real bank (478 registered lines,
   125 on disk, 12 orphans of 137 total files) and against
   `server/src/data/voice-line-review.json` (274 reviewed records: 155
   "deleted" — matching `voice-deleted`'s 155 files exactly — 119 "kept").

3. **Three spot-checks, quoted from the doc:**
   - Coronation entry (step 19): "One of two 3-line SETS is chosen by a
     plain uniform coin flip... Set B... ends on *"Το δικό σου."*... gets
     the winner's own name **spliced on as a suffix**... Set C... names no
     one, by construction, ever. **AUDIO REALITY: 6/6 set lines playable**"
     — shows sets B/C and the suffix mechanism as required.
   - A REVEAL moment (step 4): "ONLY_ONE_CORRECT, 9 lines, 5 onDisk):
     *"Ένας. Μόνο ένας ανάμεσά σας. Κοιτάξτε καλά."*"
   - A ⚠/☠ entry (step 4): "**☠ DEAD PIPE.** Its result IS sent to the
     host as `QuestionShowHostPayload.socratesIntro`
     (`server/src/phases.ts:672`/`:677`) — but `grep -an "socratesIntro"
     client/src/screens/HostScreen.tsx` returns **zero hits**."

4. **Inverse — zero code changes.** `git diff --stat` shows exactly
   `docs/RUNSHEET.md` (new) and this task report (new); nothing else
   touched.

## Corrections surfaced

CLAUDE.md is stale on two points, both called out at the top of the run
sheet rather than silently worked around: Η Δίκη (the trial finale) was
fully removed in Task 258 — the climb is now the only finale, for `full`
and standalone quiz alike — and the voice bank is 137 files today, not the
283 the docs still cite (a delete-then-partial-restore history: 283 → 130
via an unrestored review backup → blocked one deploy on the `VOICE_MIN=283`
floor → 137 after Task 286's promotion of 7 approved clips).
