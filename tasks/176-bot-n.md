# Task 176 — ?bot=N: server-side bots as a room feature

## Goal
The screenshot harness already drives socket-level bots. Make bots
a ROOM feature: /host?bot=N spawns N server-side bots into the room
so one person can run a full game to verdict alone. This is the
floor of all future testing (MASTER-PLAN step 6).

## Rules (inline)
- Bots answer at the SOCKET level (or equivalent server-side path)
  and never render a phone. They are players to the engine: playerId
  identity, roster entries, scores.
- Bots must never be VIP — the first HUMAN to join is VIP.
- The answer key never leaves the server: bots pick randomly (or
  from the payload players legitimately receive), NOT by reading
  the correct answer.
- Configurable delay: default random in a range; support the proven
  divergence pattern (some fast ~0.5s, some slow ~4s) so scores
  spread — expose as a simple param or built-in spread.

## Do
- /host?bot=N (cap it, e.g. 7): N bots join on room creation with
  distinct Greek preset names. They handle quiz, drawing-guess,
  numeric estimate, blitz swipes; for DRAW as the drawer, submit a
  trivial scribble or skip cleanly (report which). Excluded from
  nothing else; Παλαίστρα included since 156a bots exist.
- Bots are excluded from the human-count for canStartRoom? NO —
  decide: the VIP human + bots must be able to start (that's the
  point). Report the rule you implement.
- Clean up bots with the room. Zero bot ghosts after game end.

## Acceptance criteria — report each one separately, with numbers
1. /host?bot=3, one human VIP joins and starts: a FULL game runs to
   the verdict (GAME_OVER) with no manual intervention. Report the
   stage sequence observed and total wall-clock minutes.
2. Score divergence: with the fast/slow spread, report the final
   scores — they must NOT be clustered (spread ≥ a few hundred
   points), and the trial must reach an actual verdict (winner
   name reported). If the trial stalls, report entry scores + rounds
   — that is finding, not failure (known Δίκη issue, MASTER-PLAN 7).
3. VIP rule: with ?bot=3, the human who joins after the bots is
   still VIP (report VIP playerId + isBot flags of the roster).
   canStartRoom passes with 1 human + 3 bots (report the rule).
4. Cleanup: after GAME_OVER and room reset/expiry, roster bot count
   = 0, no bot sockets/timers alive (report how verified). Commit
   as task 176 and push.

After the criteria: re-run `npm run screenshot:phases`. Do NOT open
the PNGs.
