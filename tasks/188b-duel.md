# 188b — Η Μονομαχία: the duel phases + the round cap

Replace 188a's provisional answerRank tie-break with the real duel,
and formalize the round cap 188a improvised at pool exhaustion.
Find the // TODO(188b) marker; that is the entry point.

## The round cap (new since 188a's finding)

- CLIMB_MAX_ROUNDS = 16 in shared. The climb ends at the cap even
  with questions left; pool exhaustion keeps its ending as a second
  guard but should now be unreachable before the cap.
- At the cap: winner = highest step. If the highest step is shared,
  the two fastest occupants (answerRank of the final round) DUEL;
  any others on that step are held below. One tie-break everywhere.
- Measure first: run the 187 harness (--finale climb, seed 187,
  the three N=4 scale batches) and report p99 rounds-to-verdict;
  required < 16 so the cap almost never fires for real players.

## The duel

- Trigger: exactly 2 players reach CLIMB_TOP in the same
  CLIMB_REVEAL → duel; 3+ → two fastest duel, rest held (climb.ts).
  Plus the cap-tie trigger above.
- New GamePhase values: DUEL_PICK, DUEL_REVEAL (union grows by
  exactly 2; crowdIntensityFor: DUEL_PICK .55, DUEL_REVEAL .9).
- DUEL_PICK: 20s via the shared timer helper (continuations entry;
  pause-safe). The two duelists' phones get a pick prompt; everyone
  else a spectator flag only. Weapons: 'xifos' | 'dory' | 'aspida';
  xifos beats dory, dory beats aspida, aspida beats xifos.
- Picks are SERVER-SIDE ONLY until DUEL_REVEAL — absent from every
  payload, host included. At timeout an unpicked duelist gets a
  uniform random weapon, flagged `assigned: true` in the reveal.
- EARLY-LOCK BEAT: when the second pick lands, emit host-only
  DUEL_LOCKED and schedule the reveal at max(socrates audio_ended,
  2000ms). The DUEL_LOCKED moment's line pool is EMPTY (D1 blocks
  new lines): detection fires and logs, the beat stays silent, the
  2000ms floor carries it — the 138 pattern.
- DUEL_REVEAL: both weapons + winner to everyone. Same weapon →
  re-enter DUEL_PICK, no cap, tieCount in the host payload.
  Winner → GAME_OVER as wired in 188a.
- Bots pick uniformly at random after 400–1500ms.

## Acceptance criteria (report each separately, with numbers)

1. P99 + CAP: report p99 rounds from the harness batches (< 16),
   and one forced cap game (low-accuracy bots): report it ended at
   round 16 exactly, and whether it resolved by highest-step or
   cap-tie duel.
2. FORCED DUEL: force a 2-way arrival (state how); DUEL_PICK →
   DUEL_REVEAL → GAME_OVER; report weapons, winner, and one forced
   tie re-entering DUEL_PICK (state how).
3. LEAK COUNT: capture every payload from duel trigger to
   DUEL_REVEAL; report 0 occurrences of either weapon anywhere
   (host and players) and no weapon field in spectator payloads.
4. EARLY-LOCK + TIMEOUT: both bots pick inside 2s → measured second-
   pick-to-reveal ~2000ms ±200 with DUEL_LOCKED logged; separate
   run, one duelist silent → reveal at the 20s mark, assigned:true,
   weapon uniform-random (state observation).

Report under 8 lines. Commit the task file with the work, push.

## What was built

- shared/src/index.ts: CLIMB_MAX_ROUNDS = 16; GamePhase +DUEL_PICK
  +DUEL_REVEAL (exactly 2); crowdIntensityFor DUEL_PICK .55 / DUEL_REVEAL
  .9; DuelWeapon + DUEL_WEAPONS + duelOutcome (xifos > dory > aspida >
  xifos); DUEL_PICK_TIME_MS 20000, DUEL_LOCK_FLOOR_MS 2000; events
  `player:duel_pick`, `duel_pick:show`, `duel:progress` (host), `duel:locked`
  (host), `duel_reveal:show`; the payload types; four state:sync shapes;
  `duelistIds` on the host CLIMB_REVEAL, `duelPending`/`youDuel` on the
  player one.
- server/src/climb.ts: `pickDuelists` — THE one tie-break (final round's
  answerRank, null last, held occupants rewritten to contested−1 in place)
  — now serves both `nextAfterClimbRound` and the new `resolveClimbAtCap`
  (highest step alone wins; shared highest step → duel). `climbLeaderPlayerId`
  in phases.ts is gone; pool exhaustion uses the same resolver.
- server/src/phases.ts: the TODO(188b) site now opens `room.climb.duel`;
  the cap check sits right after scoring (`CONTINUE` at round 16 → resolver);
  startDuel / submitDuelPick / lockDuel / onDuelLockTimer / onDuelAudioEnded
  / endDuelPick / revealDuel / endDuelReveal. Timer kinds DUEL_PICK,
  DUEL_LOCKED (one kind, two stages: floor, then the audio backstop only if a
  line fired), DUEL_REVEAL — all on QUIZ_CONTINUATIONS (full merges it).
  Picks live in `duel.picks` and no builder reads them; the reveal is built
  from the frozen `duel.lastReveal`.
- server/src/socrates.ts: DuelMoment 'DUEL_LOCKED', DUEL_LINES (empty),
  recordDuelLockedAndPickLine — detection logs, pool empty, silent (138).
- server/src/index.ts: DUEL_PICK handler, state:sync host+player for both
  phases, VIP_NEXT skip of DUEL_REVEAL, `socrates:audio_ended` during
  DUEL_PICK routed to onDuelAudioEnded.
- server/src/bots.ts: a duelist bot picks uniformly at random after
  400–1500ms.
- server/scripts/trial-montecarlo.ts: cap = CLIMB_MAX_ROUNDS resolved by
  resolveClimbAtCap (outcomes cap-winner / cap-duel), p90/p95/p99/max,
  `--cap N` to look at the uncapped tail.

## Acceptance criteria

Driver: scratchpad `duel-drive.mts`, the REAL server imported in-process on
3901–3904 (never 4001), scripted player sockets that lock in with the
server's own correctIndex read in-process, bots where the scenario wants
them; every socket records every event with a timestamp.

1. **P99 + CAP** — harness `--finale climb --seed 187 --runs 400 --players 4
   --p-correct-leader 0.7 --p-correct-others 0.5`, three entry scales
   400-1500 / 1500-3000 / 5000-9000: median **8, 8, 8**, **p99 = 16, 16,
   16** (the cap itself), cap hit **20, 19, 19** of 400 (highest-step
   14/14/14, cap-tie duel 6/5/5). Uncapped (`--cap 200`): median 7.5, p90
   14, p95 16, **p99 21**, max 27 (4000 runs: p99 21, max 36). N=2 / N=8
   (1500-3000): p99 16 / 16, cap hit 16 / 30 of 400. **FAIL against
   "< 16"**: at this skill split the cap sits at the natural p95 and fires
   in ~5% of games. Not tuned — the cap value is a design call. Forced cap
   game (quiz short, finaleMode climb, 3 random bots + random VIP): **16
   CLIMB_REVEALs, last roundIndex+1 = 16**, server log "climb round cap (16)
   reached — WINNER at the highest step": resolved by **highest step**
   (Νίκος at step 4, the other three at 0), no cap-tie duel; GAME_OVER
   isTrialResult true. PASS.
2. **FORCED DUEL** — 4 scripted sockets, 0 bots, entry steps 4/3/2/1,
   lock-in order scripted (p0 fastest r1, p1 fastest r2+r3, p2 fastest r4,
   p0 fastest r5): r5 lands p0 9+2=11 and p1 9+1=10 → CLIMB_REVEAL
   `duelistIds` [p0, p1]. Phases: `… CLIMB_REVEAL > DUEL_PICK > DUEL_REVEAL
   > DUEL_PICK > DUEL_REVEAL > SOCRATES > GAME_OVER`. Forced tie: both
   scripted picks 'xifos' → reveal 1 **xifos vs xifos, tie, tieCount 0** →
   DUEL_PICK re-entered with **tieCount 1** → picks dory vs aspida → reveal
   2 **winner p0 (dory beats aspida)** → GAME_OVER winner p0, standings
   [p0, p1, p2, p3]. Bot duel (botlock run): Γιώργος=dory vs Ελένη=xifos →
   winner Ελένη. PASS.
3. **LEAK COUNT** — every payload on host + 4 phones from the
   duel-declaring CLIMB_REVEAL up to (excluding) the first DUEL_REVEAL:
   **28 payloads, 0 occurrences of xifos/dory/aspida**. Spectator DUEL_PICK
   payload: `{youDuel:false, opponentName:null, picked:false, tieCount,
   durationMs, paused, pausedByName}` — **0 weapon/pick-shaped keys**.
   Host DUEL_PICK keys: duelists, durationMs, paused, pausedByName,
   pickedPlayerIds, standings, tieCount. DUEL_LOCKED reached 0 phones (host
   only, 2 events). PASS.
4. **EARLY-LOCK + TIMEOUT** — two BOT duelists (Γιώργος, Ελένη), picks on
   their own: second pick at **+1395ms** after DUEL_PICK opened, DUEL_LOCKED
   emitted **+0ms** after it and logged (`[socrates] duel moment
   detected=DUEL_LOCKED`, `duel locked — reveal in >= 2000ms`),
   second-pick-to-reveal **2002ms** (scripted run: 2002, 2002). Timeout, one
   duelist silent (scripted p0 vs bot Γιώργος), three runs: DUEL_PICK open →
   DUEL_REVEAL after **20000, 20000, 20001ms**, p0 `assigned: true` every
   time with weapon **aspida, xifos, aspida** (bot's own pick `assigned:
   false`: xifos, dory, dory), no DUEL_LOCKED in any timeout run. Uniform-
   random: three draws hit two of the three weapons — consistent, not
   proof; the code is `DUEL_WEAPONS[floor(random * 3)]`. PASS.

Typecheck passes in shared, server and client. Server log across all
scenarios: 0 lines matching error / "no continuation". All four in-process
servers exited; nothing left on 3901–3904.
