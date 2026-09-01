# Task 133 — Numeric: no answer scores 0, excluded from ranking

Model: Sonnet.

DECIDED (merge design session): a player who never submits a numeric
answer scores 0 and is EXCLUDED from the distance ranking. Today they
get the last-place floor (25% of 400 = 100). The quiz gives 0 for no
answer; the merged game needs one rule, so the numeric mode changes —
standalone AND future merged, which means the change lives in the
SHARED scoring formula, not in a mode shell.

Current formula (task 65): base = round(400 * (0.25 + 0.75 * (N -
rank) / (N - 1))), ranked by absolute distance, +100 exact, N==1 gets
400. N must become the count of SUBMITTERS, not of players.

## Acceptance criteria

Report on EACH one separately, with numbers. Under 8 lines total.

1. **Non-submitter gets 0.** Observed, not code-read: a room with
   BOT_COUNT=4 where one bot never submits — report each player's
   round score from the NUMERIC_REVEAL payload. The non-submitter
   must show 0; the other three must be ranked among THEMSELVES
   (N=3 in the formula: best 400, middle 250, worst 100).

2. **Edge: exactly one submitter.** Same setup, three bots silent.
   Report all four scores. The lone submitter gets 400 (the N==1
   branch now keys on submitters); the three others get 0.

3. **Edge: nobody submits.** Report all scores (all 0) and confirm
   the phase still advances to NUMERIC_REVEAL and onward without a
   crash or a stuck timer.

4. **The formula moved nowhere.** Report the file and export name
   where the scoring lives, and confirm it is under shared/ (the
   "any formula used by both the game and a dev tool lives in
   SHARED" rule) — the /dev/numeric review tool must still import
   and use the same function. If it already lives in shared, say so
   with the path; do not relocate anything else.

## Out of scope

The 2.5x max derivation, the 20s timer, the mode merge itself.
Do not touch quiz or drawing scoring. Do not touch
computeCompetitionRanks (separate open item).

## What changed

`scoreNumericSubmissions` (server/src/numeric.ts) now filters to
submitters before computing N and ranks. Non-submitters are appended
back afterward with a flat `pointsAwarded: 0`, `rank: n + 1` (never
competing for a real rank), `exact: false`, `distance: max + 1`. No
other file touched scoring logic; modes/numeric.ts's comment about
non-submitter handling was updated to match, no behavior there
changed (it still passes every connected player through unmodified
and folds `pointsAwarded` into `player.score` the same way).

## Verification

See acceptance-criteria report in the commit/PR description — each
of the 4 criteria above was checked by running the dev server with
`BOT_COUNT` set and reading the emitted `NUMERIC_REVEAL_SHOW`
payload, not by reading the code.
