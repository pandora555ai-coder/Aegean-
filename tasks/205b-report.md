# Task 205b — Fable review of the spear wiring (task 205, commit 00b3473)

Scope: `git diff origin/main`, concurrency/ordering only. climb.ts untouched.
Fixes below are in phases.ts (ordering) and payloads.ts (clamp), each with a
seeded scenario in `npm run climb:spear-live-check` (was 41 checks, now 54).

## 1. Resolution order — DEFECT (fixed)
- Struck ⇒ arriver is impossible: a strike needs stepBefore 0 and a non-positive delta (stepAfter 0), an arrival needs stepAfter ≥ 10. Simultaneous strikes are deterministic: `scored` is join order through a stable sort, ties in nextAfterSpearRound keep that order; the Sets are insertion-ordered.
- DEFECT was the round cap: phases.ts passed ALL scored rows to `resolveClimbAtCap`, so with everyone at step 0 at round 24 a player struck out THAT round was a tie occupant, got seated in the top duel (first in order as the fastest wrong answerer) and could be crowned — GAME_OVER then listed them twice. Same hole in startClimbQuestion's pool-exhaustion branch after a spear duel (the loser is still in lastResults). The Monte Carlo already filtered to survivors; the wiring did not.
- Fix: phases.ts:1521 and :1331 filter the cap rows to survivors. Scenarios 5 and 6 fail 8 checks before the fix, pass after.

## 2. Pause — SAFE
- spearCounters/eliminationOrder are written only inside endClimbQuestion (phase-guarded, runs once per round) and endDuelReveal. Pause freezes the question timer and submitClimbAnswer rejects while paused, so a round boundary cannot be crossed twice. Scenario 4: 0ms drift, exactly one tick after resume.
- Pre-existing, outside this diff: recheckClimbPhaseOnDisconnect (like the trial's) can end a question while paused; not a spear issue.

## 3. Reconnect race — SAFE
- Node is single-threaded; nothing interleaves inside endClimbQuestion. Mid-game a disconnect never removes the Player (only LOBBY grace does), so a same-UUID rejoin reuses the same record; its state:sync reads `eliminated` live from eliminationOrder, submitClimbAnswer rejects them (phases.ts:1402), and climbAliveIds keeps the lock-in wait from including them.

## 4. Payload audit — SAFE
- An eliminated phone gets the same CLIMB_QUESTION shape as an entry spectator (options, no correctIndex), the public correctIndex at CLIMB_REVEAL, `youDuel: false` with no weapon field at DUEL_PICK; the duel reveal is symmetric by design. No negative step anywhere: the mechanic floors at 0, held occupants floor at 0 (188c). Harness audit: 49 step fields, 0 negative; spectator payloads carry no choice/weapon key.

## 5. GAME_OVER routing — SAFE (misnomer by design)
- The climb never flows through the trial builder: buildGameOver's climb branch (payloads.ts:436-470) is its own, and only reuses `isTrialResult: true` as the no-digits gate. On the TV the flag reaches exactly one place, `hideScores` (HostScreen.tsx:2072); the scene choice is `isClimbFinale` (HostScreen.tsx:1584 → AnavasisCrowning). GameOverView has no trial elements; drain bars exist only in the trial phases.

## 6. Step overflow — DEFECT (fixed)
- Yes: a +2 from step 9 emits stepAfter 11 on the host reveal row and (before the fix) `yourStep` 11 on the winner's phone. TV is safe — visualStepFor clamps the ratio to 1 (AnavasisScene.tsx:41), no off-scene draw. The phone's ClimbStrip fills only the notch `=== step` (ControllerScreen.tsx:250), so 11 painted the winner's strip exactly like step 0: empty.
- Fix: `phoneStep` clamps `yourStep` to CLIMB_TOP at the payload boundary (payloads.ts:660/722/786). The host row keeps 11 on purpose — it is the true mechanic value GAME_OVER's step order reads. Scenario 7: host 11, phone 10.

## Reruns
- `npm run typecheck`: clean. `npm run climb:spear-check`: 17/17.
- `npm run climb:spear-live-check`: 54/54 (task 205 criteria 1–4 all still pass; criterion 3's invariant audit: 49 step fields, 0 violations).
