# Task 225 — final standings and the winner's position

There is exactly one winner, and the finale ranks by POSITION, never points.
The quiz score keeps its only real job (it seeds each player's entry step in
Η Ανάβασις) and keeps travelling in the payload — it simply stops being
rendered as a result.

Verified from running games, not from reading code: five scenarios in
`npm run climb:ceremony-check` (new, `dev/climb-ceremony-check.ts`) —
94 checks, 0 failures — plus one real-phone run for the phone screen.

## What was already right (server)

`buildGameOver`'s climb branch (payloads.ts:448) already implemented both
ranking rules — winner, then survivors by step (ties by the last round's
answerRank), then `climb.eliminationOrder` REVERSED — and already flagged the
result `isTrialResult: true`. Nothing there was touched.

## Changes

- `client/src/screens/ControllerScreen.tsx` — the phone's GAME_OVER plaque
  drops its "N πόντοι" line when `gameOver.isTrialResult`; `#rank` above it
  already carries the verdict. (Was in the tree at task start.)
- `client/src/screens/HostScreen.tsx` — the ceremony renders from
  `gameOver.standings` (the server's complete, de-duplicated roster) instead
  of the last live climb payload, which a spear elimination can already have
  shrunk; lanes by final rank; the winner forced onto the top visual step;
  `climbClimberHistoryRef` remembers every climber ever seen so an eliminated
  player still stands in the final frame. (Was in the tree at task start.)
- `client/src/screens/HostScreen.tsx` — **the ceremony hides nobody**:
  `climbHiddenPlayerIds` is empty at a climb GAME_OVER. Both mid-climb
  reasons to hide a figure (a duelist shown in the foreground, a player the
  spear just struck) outlived their round — in a duel-decided climb the
  WINNER themself rendered at opacity 0.
- `client/src/screens/HostScreen.tsx` — `handleGameOver` clears
  `duelPick`/`duelReveal`. A duel-decided climb goes DUEL_REVEAL →
  GAME_OVER and nothing on that path cleared the settled duel, so
  AnavasisDuel stayed mounted on top of the crowning (scrim, tablets and
  all). Same clear `handleClimbQuestionShow` already does for the other exit
  from DUEL_REVEAL (Task 219).
- `client/src/components/AnavasisScene.tsx` — `useClimbMovement` returns the
  CURRENT `climbers` whenever `revealKey === null`. Its effect only re-runs on
  a new revealKey, and PHASE_CHANGED lands one render before the game_over
  payload (the house pattern), so the ceremony painted the previous round's
  positions: on the round-cap path the winner stood on step 8 instead of the
  temple, 135px below the wreath instead of the intended 68px.

## Acceptance criteria

**1. No quiz score anywhere in the final standings.**
TV ceremony: **zero digits on the whole page** (`body.innerText` swept, not
just the scene subtree) in all 9 browser scenarios — no score, no rank, no
step, and no corner room code at GAME_OVER. The only numbers are positional
and geometric, never rendered as text: a figure's `bottom` on the stair and
its lane `left`. Phone: exactly **one** number, `#2`, the player's own rank;
`gameover-score` is absent from the DOM (not merely hidden) and the plaque
reads just `ΔΟΚΙΜΗ`. `score` still travels in the payload ([0,0,0,0,0] in
scenario E, unrendered) because it still seeds entry steps.

**2. Ranking in a normal game (winner by elimination).**
Scenario E, 5 players, socket-level, elimination order taken from the
CLIMB_REVEAL events as they arrived: **[Δέλτα, Έψιλον]**. Final standings from
the game_over event: **#1 Άλφα, #2 Βήτα, #3 Γάμα, #4 Έψιλον, #5 Δέλτα**. The
eliminated tail [Έψιλον, Δέλτα] is the exact reverse of [Δέλτα, Έψιλον]; both
survivors (Βήτα step 6, Γάμα step 3) rank above both eliminated players; ranks
are a clean 1,2,3,4,5 with no duplicates.

**3. Ranking on the round-cap path.**
Scenario C, 3 players, cap reached with all 3 still climbing, 0 eliminations,
nobody at CLIMB_TOP (10). Final steps **Άλφα=8, Βήτα=4, Γάμα=0** → standings
**#1 Άλφα, #2 Βήτα, #3 Γάμα**, i.e. steps descending. On the TV the three
figures stand top-to-bottom Άλφα > Βήτα > Γάμα (478px / 241px / 72px above the
viewport bottom) — the winner lifted to the temple, the other two at their own
real steps.

**4. INVERSE: winner on the top step, nobody twice or missing.**
At every player count 2, 3, 4, 5, 6 (scenario D) plus the duel finish (A), the
spear-on-the-winning-reveal finish (B) and the round cap (C): figures rendered
= players, unique ids = players, and the rendered name set equals the roster
exactly. The winner sits at bottom 478px in all 9 runs — the highest figure,
68px below the wreath (the wreath hangs a fixed 9.4cqh = 67.7px above the
temple step) and centred on it to within 0px. Exactly one figure at opacity 1
(the winner), every other at 0.45, and **none at opacity 0**. Before the fixes:
A had the winner AND runner-up at opacity 0 under a still-mounted duel overlay;
B had the speared player at opacity 0; C had the winner 135px below the wreath.

## Also found, not fixed (out of scope)

- **CLAUDE.md is stale about Η Λόγχη.** It says the spear rule is "a PURE
  MECHANIC ONLY — NOT wired into the live climb". It IS wired: phases.ts:1487
  calls `applyClimbSpearRound` in `endClimbQuestion` (Task 205/205b), and this
  task watched real reveals strike real players out over real sockets.
  Corrected in CLAUDE.md as part of this task's doc pass.
- A GAME_OVER that is NOT a finale result (`isTrialResult: false` — the
  standalone draw/numeric/blitz/agora dev-harness modes, which have no finale)
  still shows points on the phone plaque and scores on the sophists row. That
  is correct for those modes: there the score IS the result. Only the
  quiz/full show, which always ends in Η Ανάβασις or Η Δίκη, is position-only.
- The winner is rendered on the temple even when they never actually reached
  CLIMB_TOP (the round-cap verdict, scenario C: real step 8, rendered at 10).
  This is deliberate per the task's design decision — there is exactly one
  winner and the ceremony crowns them — but it does mean the ceremony's
  geometry is not a faithful map of final steps for that one figure.
