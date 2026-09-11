# Task 227 — stable lanes in Η Ανάβασις, plus two small finale fixes

## Fix A — climbers reshuffled lanes every round

`HostScreen.tsx` built each `AnavasisClimberData.joinIndex` as a raw array
index (`(s, i) => i`) off whichever payload was live: `climbQuestion.steps`
is join-order (`climbSteps()`, state.ts), but `climbReveal.results` is
RANK-sorted (`sortAndRankResults`, scoring.ts). A player's array position
therefore changed with that round's speed, and `laneLeftPct` turns
`joinIndex` straight into a horizontal `left%` — so lanes reshuffled by
performance every reveal, and shrank/renumbered further whenever an array
lost a row (a spear elimination, `climbSteps()` filtering the eliminated
out).

Fixed with `climbLaneRef` (`HostScreen.tsx`): a `Map<playerId, lane>`
populated once per playerId, first-seen, held for the rest of the climb
regardless of which array or what rank later payloads sort them into, and
regardless of anyone else being eliminated. `laneForClimber(playerId)`
replaces every `(s, i) => i` / `(r, i) => i` site (`liveClimbClimbers`,
`climbClimbersForRender`'s GAME_OVER branch, the ceremony's `winnerLeft`,
and the live-duel's own hue/flip lookup). `AnavasisClimbers` (AnavasisScene.
tsx) takes a new `totalClimbers` prop — the FIXED lane count `laneLeftPct`
spreads offsets across — instead of `climbers.length`, which shrinks as
players are eliminated and would otherwise re-center everyone else's
spacing. A `data-lane` attribute was added to `[data-testid="anavasis-
climber"]` for verification (the rendered pixel `left` legitimately drifts
round to round even with a rock-stable lane, because the stair narrows
with height — `stepWidthPct` scales the lane offset by the climber's own
visual step).

## Fix B — two separate ways the wreath leaked into the climb

Neither was the dead `isLeader`/`.win` field on `AnavasisClimberData` (never
actually set `true` anywhere in the codebase — confirmed by grep, left
untouched). Both are `SophistsRow`'s own wreath, `showAnavasisWorld`
(HostScreen.tsx) failing to cover two real gaps:

1. **The PHASE_CHANGED-before-payload gap** (CLAUDE.md's own documented
   trap, "18 before Task 207... every mode"), applied to climb entry:
   `phase` becomes `CLIMB_QUESTION` one render before the
   `CLIMB_QUESTION_SHOW` payload that flips `isClimbFinale` true. The old
   `showAnavasisWorld = isClimbFinale && (isAnavasisPhase || GAME_OVER)`
   was false on that one render, so the quiz's own TheatreScene+SophistsRow
   rendered instead — visible, briefly, with the pre-climb score leader's
   wreath. Fixed: `showAnavasisWorld = isAnavasisPhase || (isClimbFinale &&
   phase === 'GAME_OVER')` — `isAnavasisPhase` alone (not ANDed with
   `isClimbFinale`) covers the render regardless of which state update
   landed first.

2. **`endClimb`'s own WINNER beat** (phases.ts) plays as a plain `SOCRATES`
   phase between the last `CLIMB_REVEAL` and `GAME_OVER` — not one of the
   four phases `isAnavasisPhase` names, so `showAnavasisWorld` is false
   there by design and `SophistsRow` renders normally, wreath included, on
   whoever leads by SCORE (never the climb's own winner — steps aren't
   score). Fixed by OR-ing `isClimbFinale` into `SophistsRow`'s existing
   `forceHidden` prop (the same "market frame belongs to the market"
   mechanism Task 210 already established) — `isClimbFinale` can only be
   true during that game's own climb tail end, so this can't misfire
   outside it.

   Fixing this exposed a THIRD, pre-existing bug: `forceHidden` and
   `dim` (`phase === 'SOCRATES' || 'STEAL'`) can now both be true at once,
   and `.sophists--hidden`/`.sophists--dim` have equal specificity, so
   **source order** decided the cascade — `--dim` was declared after
   `--hidden`, so `forceHidden` alone didn't actually reach opacity 0 during
   a SOCRATES/STEAL phase (a case that never arose before this task, since
   agora's own `forceHidden` never coincides with `dim`). Swapped the
   declaration order in `ROW_STYLE_TAG` so hidden always wins.

## Fix C — Η Μονομαχία's weapon hint

Added a static text+icon strip to the phone's DUEL_PICK screen
(`ControllerScreen.tsx`, duelist branch only — spectators still get no
weapon UI at all): `DUEL_HINT_SEQUENCE = ['xifos', 'dory', 'aspida',
'xifos']`, shared's own `DUEL_BEATS` cycle spelled out, rendered as
`Ξίφος▸Δόρυ▸Ασπίδα▸Ξίφος` with a `WeaponIcon` per entry. No server data, no
new Socrates line, no audio.

## Scope

No climb rule, scoring, step logic, or game constant changed — `climb.ts`,
`phases.ts`, `state.ts`, and every `CLIMB_*`/`DUEL_*` constant are
untouched. All three fixes are presentation-only (`HostScreen.tsx`,
`AnavasisScene.tsx`, `SophistsRow.tsx`, `ControllerScreen.tsx`).

**Found, not fixed:** CLAUDE.md's TV layout section says the sophists row
is "opacity 0 in LOBBY/STAGE_ANNOUNCE" — stale since Task 163a, which
explicitly stopped hiding it in LOBBY ("it's how joining players show up
now that the lobby overlay names no one"); only STAGE_ANNOUNCE (and now
`forceHidden`) hide it. Not corrected here — out of this task's scope, and
CLAUDE.md edits weren't asked for.

## Verification

Two new dev harnesses (real in-process server, real Vite client, real
Playwright browser — no code read-and-reasoned-about in place of running
it): `npx tsx dev/climb-lane-check.ts` (`npm run climb:lane-check`) and
`npx tsx dev/duel-hint-check.ts`. The existing `npm run climb:ceremony-check`
(94 checks, Task 225's own suite) was re-run unmodified as a regression
check.

### 1. Lane stability

One climb, 4 players, 9 real `CLIMB_QUESTION`→`CLIMB_REVEAL` rounds (seeded
steps to control pacing, the existing harness's own technique), a REAL Η
Λόγχη spear-out of Δέλτα at round 2 (2 wrong lock-ins at step 0, the actual
mechanic — no manual elimination hack). Per-round `data-lane` read off the
DOM:

| round | Άλφα | Βήτα | Γάμα | Δέλτα |
|---|---|---|---|---|
| 1 | lane 0 | lane 1 | lane 2 | lane 3 (last seen) |
| 2–9 | lane 0 | lane 1 | lane 2 | gone |

Every survivor's lane is identical in all 9 appearances (0 changes each,
where before this fix it changed every single round). Δέλτα's elimination
left lanes 0/1/2 exactly as they were before round 2. Left-to-right pixel
order (Άλφα<Βήτα<Γάμα) is also unchanged from round 1 to round 9, even
though the raw pixel `x` values themselves DO drift (368→404→380→... as
steps change) — expected, since the stair narrows with height; `data-lane`
is what stays fixed. **9/9 rounds pass** (all lane-stability checks green).

### 2. Vertical still works

Steps observed across the run: `0, 3, 4, 5, 6, 7` — genuinely varying.
Bottom-px (vertical position) changed round-to-round for a mover: **yes**,
confirmed by direct comparison of consecutive rounds' bounding boxes.

### 3. No wreath during the climb; ceremony wreath at end

A `MutationObserver` armed from STAGE_ANNOUNCE onward (after LOBBY, where a
real score leader legitimately shows the row per Task 163a — unrelated to
this task) watched every child-list AND class/style mutation for the
entire climb, re-checking `[data-testid="sophist-wreath"]`'s ACTUAL
computed visibility (its ancestor `.sophists` row's opacity, not the
wreath's own — which is always 1) on every mutation batch. **0 visible
sightings** across the whole climb, including the STAGE_ANNOUNCE→
CLIMB_QUESTION transition and the WINNER Socrates beat (both previously
positive before the fix — 5 sightings, then 3 at opacity 0.6, in earlier
runs of this same harness). The ceremony's own wreath (`anavasis-wreath`,
`AnavasisCrowning`): **present, count 1**, banner reads the forced winner
("Άλφα").

### 4. INVERSE — no shared lanes; reveal ordering unchanged

Fresh climbs at every player count 2 through 6, first `CLIMB_QUESTION`
sampled: **n distinct `data-lane` values every time** (2/2, 3/3, 4/4, 5/5,
6/6 — 0 collisions at any count). Within the 9-round main run, every
single round's 3–4 climbers also had 0 overlapping lanes.
`room.climb.lastResults[].answerRank` (server-side, untouched by this
task) read directly after a mixed-speed round: `1, 2, 3` — still strictly
non-decreasing, i.e. still `sortAndRankResults`-sorted.

**Totals: `climb:lane-check` 22/22, `duel-hint-check` 8/8 (both duelists —
hint text, icon count, and the 3 real weapon slabs still present as
regression), `climb:ceremony-check` 94/94 (unmodified, re-run as
regression). `npm run typecheck` clean across all three workspaces.**
