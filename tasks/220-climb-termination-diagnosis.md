# Task 220 — Why Η Ανάβασις can run to the cap with no winner (DIAGNOSIS ONLY)

Zero code changes. Evidence: two live socket-level games against a dev server on a
throwaway port 4055 (quiz mode, `gameLength: 'short'`, `finaleMode: 'climb'`, one
scripted human + bots, all answering at random ≈ 25%), plus
`server/scripts/trial-montecarlo.ts --finale climb` at 400 runs/seed 220.

## 1. TERMINATION PATHS

| # | file:line | condition | N=3? |
|---|---|---|---|
| 1a | phases.ts:1505,1513 → 1549 → 1608 → endClimb 1889 | `nextAfterSpearEliminations` — spear left exactly one alive | NO (spear gated) |
| 1b | phases.ts:1516 (climb.ts:75) → 1549 → 1608 → 1889 | exactly one player at `stepAfter >= CLIMB_TOP` | yes |
| 1c | phases.ts:1517-1525 (climb.ts:105) → 1549 → 1608 → 1889 | `roundsPlayed >= CLIMB_MAX_ROUNDS` (24) and one occupant of the highest step | yes |
| 2 | phases.ts:1551-1555 → 1612 startDuel → endDuelReveal 1883-1884 | 2+ arrivals, or a shared highest step at the cap; `duel.cause === 'top'` | yes |
| 3 | phases.ts:1869-1877 | `duel.cause === 'spear'`, and the loser's removal leaves one alive | NO (spear gated) |
| 4 | phases.ts:1324-1345 | pool exhausted (`questionIndex >= questions.length`), `resolveClimbAtCap` → WINNER | only if the unused pool < 24 |
| 5 | phases.ts:1339-1341 | same, → DUEL → path 2 | only if the unused pool < 24 |
| 6 | phases.ts:1241-1243, 1250-1252 → 873-879 | `startClimb` declines (<2 connected, or 0 unused questions) — the climb never opens | yes |

Unreachable at N=3: **1a and 3** — both need the spear, gated at
`CLIMB_SPEAR_MIN_PLAYERS = 4` (climb.ts:148, 151-153) and re-gated inside
`applyClimbSpearRound` itself (climb.ts:173-181). Paths 4/5 are effectively dead at
any N because `CLIMB_MAX_QUESTIONS === CLIMB_MAX_ROUNDS === 24`, so the cap (1c) always
fires first on a full-size draw. **At N=3 the only live exits are 1b, 1c and 2.**

## 2. THE eliminated/climbing STATE — REPRODUCED (live N=6 run)

- `climbing` ← payloads.ts:720 `climb.climberIds.includes(playerId)`; `climberIds`
  **never shrinks** (phases.ts:1303-1307). `eliminated` ← payloads.ts:721
  `climb.eliminationOrder.includes(playerId)` (written at phases.ts:1488, 1492, 1539, 1871).
- They read two independent lists, so **both hold at once for every eliminated player,
  always** — not an ordering race. Observed: 8 of 20 `climb_question:show` payloads to the
  speared-out human carried `climbing=true eliminated=true`.
- (a) recipients: **NOT filtered** — `broadcastClimbQuestion` (phases.ts:1372) loops
  `getConnectedPlayers`. 8 climb questions delivered after elimination.
- (b) submits: **filtered** — `submitClimbAnswer` phases.ts:1405. 8 sent, 8
  `rejected player:climb_submit` in the server log, 0 `answer:accepted`.
- (c) survivor set: **filtered** — `climbAliveIds` (phases.ts:1308) feeds round entries
  (1448), the early-advance check (1387) and the survivor win (1505); the host board's
  `climbSteps` (payloads.ts:672) drops them too. Observed: eliminated names vanish from
  `standingsOnBoard` the very next round.
- **This cannot prevent termination.** It is a phone-payload-only leak: the eliminated
  player sees a live answer grid and taps into a void.

## 3. THE CAP — run deliberately at N=3

Live run: 24 climb rounds, entry steps [4,3,1], everyone parked at 0 for rounds 10-13,
peak step reached across the whole climb = 6 (never 10). Server log:
`room 5704 climb round cap (24) reached — WINNER at the highest step`.

- Branch that ran: phases.ts:1517-1525 → `resolveClimbAtCap` (climb.ts:105-112) → WINNER
  → phases.ts:1549-1550 → `endClimbReveal` 1608 → `endClimb` 1889 → `finishGame` 1900.
- Round-24 `CLIMB_REVEAL_SHOW` carried `winnerPlayerId` = Αργύρης; `GAME_OVER` carried
  `isTrialResult: true`, `winnerName`, `standings[0]` = that same player
  (payloads.ts:442-468).
- **Somebody IS crowned.** Monte Carlo N=3 @0.25, 400 runs: 400/400 reached a verdict
  (top 333, top-duel 67), 0 no-verdict, 0 anomalies. There is no missing cap-crowning
  branch.

## 4. VERDICT

The N=3 stall is **not** a missing crowning branch and **not** the eliminated/climbing
leak. Ranked:

1. **Negative step drift at quiz-family accuracy (dominant).** Delta is +2/+1/−1/−2 with
   a floor at 0 (climb.ts:52-54); at 25% accuracy the field parks on step 0 and
   `CLIMB_TOP` is unreachable. Cap-hit rate at N=3: **84.0% @0.25, 19.3% @0.4, 0.3% @0.6**
   (400 runs each) — the climb is accuracy-sensitive, not player-count-sensitive.
2. **The spear's N>=4 gate (the reason N=3 has no shortcut out).** With the gate ON at
   otherwise identical settings, cap-hits fall **84.0% → 7.3%** and median rounds
   **24 → 12** (N=4 @0.25). At N=3 there is simply no mechanic that shrinks the field.
   `--spear on` cannot even simulate the fix: climb.ts:173-181 re-applies the gate.
3. **The eliminated/climbing leak (cosmetic, contributes nothing to the stall).**

**Smallest change guaranteeing a crowned winner at every N: none needed — one already is.**
What needs fixing is *time to verdict*. The smallest change for that is
`CLIMB_SPEAR_MIN_PLAYERS: 4 → 2` (climb.ts:148) — **an escalation of the existing spear**,
one constant, no second elimination path, honouring Task 205b DEFECT 1. Separately and
independently, phases.ts:1372 should skip eliminated players (criterion 2), which is a
one-line UI-correctness fix, not a termination fix.
