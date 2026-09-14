# Task 250 — remove the in-game leader wreath

HEAD at start: `cd498a0ac8509aa6d557b88ae83e0e5321e45b0c`.

The olive wreath/stem drawn above the sophist at rank 1 is removed from
`SophistsRow.tsx` (its `Wreath()` SVG component, the `<Wreath />` render call,
and the `.wreath`/`.soph.lead .wreath` CSS). Nothing else in that file moved —
`computeCompetitionRanks`, the plaque's own `.soph.lead .plaque` tint, sort
order, and layout geometry are all untouched. Two stale comments (in
`SophistsRow.tsx` and `GameOverView.tsx`) that described the removed wreath
were updated to match.

## Criterion 1 — inventory

Every "wreath" site found by `grep -rniE wreath client/src`:

- **`client/src/components/SophistsRow.tsx`** — `Wreath()` + `.wreath`/
  `.soph.lead .wreath` CSS, shown on whichever sophist has `rank === 1`.
  **In-play** (this component is mounted for the whole game, GAME_OVER
  included, per its own doc comment — CLAUDE.md's "always mounted" rule).
  **Removed.**
- **`client/src/components/AnavasisScene.tsx`** — `.anavasis-wreath` inside
  `AnavasisCrowning`, the climb finale's temple crowning. **Terminal/winner.**
  **Kept** — `git diff` on this file is empty.
- **`client/src/screens/host/PodiumView.tsx`** — `.podium-wreath`
  (`PodiumLaurel`), Task 239's end-state podium shown `PODIUM_DELAY_MS`
  (6000ms) after any GAME_OVER. **Terminal/winner.** **Kept** — `git diff` on
  this file is empty.
- **`client/src/screens/HostScreen.tsx`** — no separate drawing site; three
  comments only, describing SophistsRow's wreath in historical bug narratives
  (Tasks 227/237/244, left as-is — they're accurate records of what WAS
  visible before those fixes) plus one present-tense comment describing
  future behavior, updated to say "plaque-highlighted" instead of "wreath
  included" since that's now what actually renders there.
- **`client/src/screens/host/GameOverView.tsx`** — no separate drawing site;
  reused `SophistsRow`'s wreath for the trial finale's brief (pre-podium)
  GAME_OVER window. Comment updated to say the winner's wreath now lives only
  on the coronation and the podium.

Not part of this element's family: the plaque's own `.soph.lead .plaque`
background/colour tint (a *different* leader-status indicator, using the same
`.lead` class). Out of scope per the task's own framing ("the olive
wreath/stem") — documented, not fixed. It has the identical 0-0 misfire the
wreath had (see the `lead:"true"` on every sophist in the round-1 snapshot
below), so it remains a candidate for a future task.

## Criterion 2 — observed wreath counts, real `?bot=5&mode=full` game

`dev/250-leader-wreath-check.ts`, a real browser against the dev server (no
shortcuts, no screenshots), played one game end to end. `[data-testid=
"sophist-wreath"]` count at each checkpoint:

| checkpoint | expected | actual |
|---|---|---|
| round 1, all scores 0 | 0 | **0** (5 sophists present, all `rank=1`/`lead=true` — the misfire case, but with no wreath element to render) |
| mid-game, clear leader (397/396/373/0/0) | 0 | **0** |
| finale (Η Ανάβαση / AnavasisScene mounted) | 0 | **0** |

The element no longer exists in the DOM at all — count is 0 by construction,
not by a hidden/opacity trick.

## Criterion 3 — inverse: the winner's wreath still appears

Observed on the podium (`PodiumView`, reached 6s after GAME_OVER):
`podium-wreath` count = **2** (the winner's row renders one `PodiumLaurel`
before their name and one after — see `PodiumView.tsx`'s `isWinner &&
<PodiumLaurel …>` on both sides). `podium-standing` count = **5** (full
roster, all five names). Body text carries zero digits (only the running game
clock, `14:07`, is excluded from that check by design — it's a `GameClock`
reading, not a standing). Standings shown in order: Παρθένα (winner),
Ξανθίππη, Χρυσάνθη, Μαρκέλλα, Σμαράγδα.

`AnavasisCrowning`'s own `.anavasis-wreath` was not separately re-observed
live in this run (the harness moves straight to the podium once it appears);
its file has an empty `git diff` against HEAD, so its rendering is unchanged
by construction — it was never touched.

## Criterion 4 — nothing else moved

Plaque geometry, `?bot=2&mode=quiz`, two players, captured via `git stash` /
`git stash pop` around the fix (same code, same run, only the wreath CSS
differs):

| player | before (x,y,w,h) | after (x,y,w,h) | wreath present |
|---|---|---|---|
| A | 334, 618, 101, 55 | 334, 618, 101, 55 | true → **false** |
| B | 846, 618, 101, 55 | 846, 618, 101, 55 | true → **false** |

Rects are byte-identical; only `wreathPresent` changed. Both players showed
`wreathPresent: true` **before** the fix (0-0 misfire, confirmed live), and
`false` **after**.

Sort order, mid-game snapshot above: scores `[397, 396, 373, 0, 0]` left to
right by `x` — strictly descending, leader (rank 1) leftmost at `x=180`,
confirming the row still sorts by score with no reordering side effect from
removing the wreath.

## Verification

`npm run typecheck --workspace=client` — clean.
`npx tsx dev/250-leader-wreath-check.ts` (kept as a permanent check; run
against `localhost:4001`/`5173`) — **8 passed, 0 failed**, full log:

```
round 1, all scores 0 — wreaths=0
mid-game, clear leader — wreaths=0
finale (climb) — wreaths=0
row still sorted by score, leader leftmost — [397,396,373,0,0]
podium shows a winner wreath — podium-wreath count=2
podium shows all standings rows — podium-standing count=5
no digits in podium body text
=== 8 passed, 0 failed ===
```

No dev harness needed a NAMES repair (this check joins bots only, no scripted
human socket).

Both dev servers started for this task (port 4001, port 5173) were killed by
exact PID before finishing; production (`/opt/party-game`, port 3001) was
never touched.
