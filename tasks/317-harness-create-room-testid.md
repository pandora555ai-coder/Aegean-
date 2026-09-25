# Task 317 — harnesses select the host button by testid

Task 316 relabelled the host lobby button; dev/ harnesses clicking
`getByRole('button', { name: 'Create Room' })` stopped working. Tooling only.

1. `grep -arn "Create Room" dev/`: before 39 lines / 24 files, after 0. Clicks are
   `getByTestId('create-room')`; comments/check labels reworded to "create-room".
2. Run results (own pass line, or exit 0 for measurement-only harnesses):
   - Pass: 242-subtitle 7/7, 259 8/8, 303 23/23, 308 26/26, duel-hint 8/8, climb-ceremony 94/94,
     climb-lane 22/22, finale-staging 35/35, podium-followup 6/6, 250 8/8, agora-scene, agora-sophists
     (after rerun), climb-entry (after rerun on ports 3990/5990), 253, lethe-scene, lethe-vs-agora,
     pause-resume, intro-seam, blitz-timing, socrates-cutoff, screenshot-phases (exit 0).
   - Already failing at 03cd60e, unrelated (verified in a worktree): 242-numeric and agora-phone —
     `waiting for getByTestId('custom-name-toggle')` (Task 241 deleted that UI). Not fixed.
   - Flaky, not 316: end-state-timer-subtitles fails `4: one captured beat is an Ανάβασις rule line`
     (DOM subtitle sampling race) in 2 of 3 runs at HEAD; the same file passed 27/27 at 03cd60e (2/2).
   - First pass ran 6-9 harnesses at once; `page.goto` timeouts and one agora-sophists failure were
     load, and passed when rerun with fewer running.
3. CLAUDE.md Working style: UI harnesses select by `data-testid`, never visible text.
4. Typecheck exit 0 (shared/server/client). Diff: dev/, CLAUDE.md, this file only.
