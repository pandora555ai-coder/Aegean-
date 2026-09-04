# 161 — The sophists row replaces the score column

The players are the SOPHISTS Socrates debates. They stand in a row on
the orchestra at the bottom of the TV, each a figure with a marble
plaque (name, score). The score column on the right is deleted.
Reference in the repo: design/theatre-reference.html — .sophists,
.soph, .plaque, .wreath, .d (delta), .out, the layout() and tween()
functions, and the five himation colours in `hues`.

## Layout rule (supersedes the old LEFT read / RIGHT players)
TOP: the marble slab — anything READ. BOTTOM: the orchestra — anything
about PLAYERS. Nothing on the slab names or counts players. Standing
exceptions: "X ΖΩΓΡΑΦΙΣΕ ΑΥΤΟ" in GUESS, and the numeric number line
(it is read). The krater moves to the top-right (right 6%, top 13%)
now that the column is gone.

## Rules and traps — read before writing code
- The row lives in HostScreen, NOT inside any phase view (107).
- Sorted by score, ties keep join order. Rows reorder ONLY after the
  score counter tween finishes: 1800ms tween, then 400ms, then the
  `left` transition (700ms). computeCompetitionRanks' duplicate ranks
  are genuine ties, not a bug.
- endQuestion emits PHASE_CHANGED before REVEAL_SHOW; every view must
  survive a first render with a NULL payload.
- TRIAL TRAP (137): the round that DECLARES sudden death flags EVERY
  duelist eliminated:true — winner included. Removal from the row must
  ALSO gate on nextSuddenDeath, or the winner vanishes.
- densityScale worst case is the count just BELOW each threshold; for
  the ROW the worst case is 8 wide: 8 × 14cqh must fit in 177cqh.
- Colour is never information: the leader gets a wreath and a wine
  score (an object and a position), deltas are ember with the SIGN
  carrying direction. Figures use the five himation colours by join
  index, mirrored alternately — no avatars on the figures.
- Animation via transform/opacity/left only. No layout-affecting
  animation. Do not touch the server, TheatreScene, the palette,
  MarbleSlab or Krater's internals. Do not call ElevenLabs.

1. client/src/components/SophistsRow.tsx mounted once in HostScreen:
   figure + plaque per player, absolute `left` = (rank+.5)/n, leader
   wreath + wine score, ember delta above the plaque during REVEAL /
   STEAL / NUMERIC_REVEAL / TRIAL_REVEAL, 60% opacity in SOCRATES and
   STEAL, hidden in LOBBY and STAGE_ANNOUNCE. The score column is
   deleted, and so is every per-phase score panel inside a phase view
   (DRAW, GUESS, GUESS_REVEAL, TRIAL_REVEAL currently carry one).
   Report: files deleted, and a grep across client/src/screens/host
   proving no phase view renders a player's score.
2. Reorder, observed in a 5-bot short full game: log the time from
   REVEAL_SHOW to the first `left` change on a rank change; report it
   (expected ~2200ms + transition) and the number of reorders seen.
   Report whether any tie occurred and, if so, that join order held.
3. Trial, observed in a MEDIUM full game to verdict: eliminated
   sophists get .out (sink + fade) and leave the row ~2200ms later,
   the rest re-space. Report: players flagged eliminated vs players
   removed from the row, and that the winner is still on the orchestra
   at GAME_OVER with the wreath.
4. Layout + height: bottom edge > 690 for all 15 phases at 3, 5, 6, 8
   bots — report offenders or the largest bottom edge per count; the
   row's total width at 8 players in cqh; npm run typecheck clean;
   git diff --stat server/ empty; re-run npm run screenshot:phases
   (BOT_COUNT=5), report PNG count, do not open them.

Fable. Playwright only for the observations in 2–4. Report each
criterion separately, under 10 lines total.
