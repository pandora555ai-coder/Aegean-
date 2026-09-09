# Task 205 — Wire the spear elimination rule into the live climb

The pure mechanic (`server/src/climb.ts:127-224`, `CLIMB_SPEAR_MIN_PLAYERS`
= 4, `CLIMB_SPEAR_LIMIT` = 2) is **untouched** — `git diff --stat` never
lists `server/src/climb.ts`. This task only connects it: `server/src/
phases.ts` (`endClimbQuestion`, `endDuelReveal`, `startDuel`,
`allConnectedClimbersLockedIn`, `submitClimbAnswer`), `server/src/
state.ts` (`ClimbState.spearCounters`/`eliminationOrder`,
`ClimbDuelState.cause`), `server/src/payloads.ts` (`climbSteps`,
`buildClimbQuestionPlayerPayload`, `buildGameOver`'s climb branch),
`server/src/bots.ts`, `server/src/modes/duel.ts`, `shared/src/index.ts`
(two new payload fields), and minimal client rendering of the
already-designed states: `client/src/components/AnavasisScene.tsx`
(`AnavasisClimberData.eliminated`), `client/src/screens/HostScreen.tsx`
(`climbHiddenPlayerIds` reuses the live-duel fade), `client/src/screens/
ControllerScreen.tsx` (reuses the trial's own spectator notice, no new
component). No new Socrates lines were added.

## Wiring decisions worth naming

- **Resolution order** implemented exactly as specified inside
  `endClimbQuestion`: step movement (`applyClimbRound`) → spear strikes
  (`applyClimbSpearRound`/`nextAfterSpearRound`, eliminations applied
  immediately) → win priority (1) `nextAfterSpearEliminations` (last-
  survivor) → (2) `nextAfterClimbRound`/`resolveClimbAtCap` (CLIMB_TOP) →
  (3) CONTINUE. A struck player can never be a same-round TOP arriver (a
  strike needs a non-positive delta, arriving needs a positive one) — true
  by construction, not by a special-cased guard.
- **Duel-cause tagging**: `ClimbDuelState.cause: 'top' | 'spear'` lets the
  ONE existing `startDuel`/`endDuelReveal` pair serve both triggers — a
  'top' duel still ends the whole climb on a winner (unchanged); a
  'spear' duel eliminates the loser, resets the winner's streak, and
  continues the climb (checking last-survivor again).
- **Rare double-duel collision** (both a top-arrival duel and a spear duel
  want the room's one duel slot in the same round — needs 4 distinct
  players in one round): the top duel keeps the slot; the spear pair is
  settled the way the duel would have anyway (faster reactor survives,
  streak reset; the other is eliminated outright, no weapon pick). Not
  exercised by any acceptance criterion; documented in `endClimbQuestion`
  where it's handled.
- **Figure exit**: an eliminated player's OWN elimination-round
  `ClimbRevealHostResult.eliminated: true` feeds `climbHiddenPlayerIds`
  (client/src/screens/HostScreen.tsx) — the exact same fade a live duel's
  two participants already get. From the NEXT `climb_question:show` on,
  `climbSteps` (payloads.ts) drops them from the payload entirely, so
  their figure is not just hidden but absent from the data the TV renders
  from.

## Verification

`npm run climb:spear-live-check` (new, `server/scripts/
climb-spear-live-check.ts`) drives the REAL phase machine — `startClimb`,
`submitClimbAnswer`, `endClimbQuestion`, `endDuelReveal` — on a virtual
clock (the same `installTimerClock` technique as `trial-montecarlo.ts`),
scripted into the exact conditions each criterion needs. **35/35 checks
passed.**

### Criterion 1 — LIVE ELIMINATION
N=4, one player (D) answers wrong every round while the other three answer
correctly; struck out exactly at **round K=3** (step 1→0, then two bad
rounds at 0). Three observations, all true:
- **Spectator from round K+1 on**: `buildClimbQuestionPlayerPayload`
  returns `eliminated: true` for D at round 4.
- **Answer ignored**: `submitClimbAnswer(room, D, 0)` at round 4 returns
  `false`; `climb.lockIns` size and membership unchanged — sending one
  changed nothing.
- **Figure absent from the TV board**: `buildClimbQuestionHostPayload`'s
  `steps` array at round 4 has no entry for D at all (climbSteps drops
  eliminated players), vs. round 3's own reveal where D's row is present
  with `eliminated: true` (the exit fade).

### Criterion 2 — WIN PATHS
- **(a) Field whittled to 1, no CLIMB_TOP arrival**: N=4, three players
  eliminated one at a time (forced to step 0, two bad rounds each); the
  lone survivor is declared winner with the max step ever recorded across
  the whole game at **9, below CLIMB_TOP (10)** — confirming the ceremony
  fired via last-survivor, not a top arrival. `GAME_OVER.isTrialResult ===
  true` (no digits).
- **(b) Same round, different players**: W forced to step 9 answers
  fastest+correct (→11, alone at the top); in the SAME round E (forced to
  step 0, streak preset to 1) answers wrong (2nd strike → eliminated). 3
  players remained alive afterward (not 1), confirming the TOP path
  resolved, not last-survivor. `climb.winnerPlayerId === W`; GAME_OVER
  ranks W 1st and **E strictly below both surviving bystanders**.

### Criterion 3 — GATE + INVARIANTS
- **N=3 inverse**: the identical bad-round script (one player wrong every
  round) run for 4 rounds at N=3 (`climbSpearRuleActive(3) === false`)
  produced **0 eliminations** — the gate holds.
- **step ≥ 0 across every payload of runs 1–3**: 49 step/stepAfter/
  yourStep fields sampled across scenarios 1 and 3 (host + player
  payloads, every round) — **0 violations**.
- **Spectator payloads carry 0 answer/weapon fields**: 1 spectator payload
  sampled (D at round 4, scenario 1) — `Object.keys()` inspected at
  runtime — **0 violations** (the type itself has no such field for any
  player, climbing or not, so this is structural, not incidental).

### Criterion 4 — NON-REGRESSION
- `npm run climb:spear-check` (the Task 203 pure-mechanic unit check,
  untouched): **17/17 passed.**
- `trial-montecarlo.ts --finale climb` rerun at 3 of Task 203's exact
  seed/config rows — **byte-identical** to the recorded baseline:
  N=4 all-random spear off: median 24, cap 88.0% (both unchanged); spear
  on: median 12, cap 6.2% (both unchanged); N=8 skilled spear on: median
  8, cap 2.0% (both unchanged). climb.ts is untouched, so this simply
  confirms nothing else in the tree perturbed it.
- **Pause mid-streak**: a player forced to step 0 with streak already at 1
  (mid-streak), paused 2000ms into the question, clock advanced 30000ms
  while paused, then resumed. Streak read immediately after resume:
  **1 → 1 (unchanged)**; timer remaining before pause vs. immediately
  after resume: **20000ms → 20000ms, drift = 0ms**. The round was then
  played out for real (the player's 2nd bad round) and they were
  correctly eliminated (streak 1→2), proving the freeze didn't also
  freeze the eventual real update.

### Full-game smoke test
`npm run screenshot:phases` (unrelated bot-driven full game, 21/21 TV +
12/12 phone captures, unchanged from before this task) ran a real climb
segment at N=5 (spear active) with `eliminated:false` correctly present
on every result row throughout — confirms the new field/wiring doesn't
disturb an ordinary game where nobody happens to be eliminated.

## Report
All 4 acceptance criteria pass, evidence above. `npm run typecheck`
(shared+server+client) clean throughout.
