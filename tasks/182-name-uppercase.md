# Task 182 — Apply greekUpper to uppercased NAME displays too

Task 181's greekUpper helper was applied to authored titles only;
uppercased player-name displays still show tonos artifacts
(«ΕΛ΄ΕΝΗ» on plaques in BLITZ_REVEAL). Greek uppercase drops the
tonos regardless of who typed the text — this is display only; the
stored name is never modified.

## Do
Route every uppercased NAME rendering through greekUpper: SophistsRow
plaque, GameOverView winner, ControllerScreen's own plaque, and any
other site grep finds. Names not rendered in uppercase are untouched.

## Acceptance criteria — report each one separately
1. List of name-display sites changed.
2. With a player named «Ελένη»: plaque renders «ΕΛΕΝΗ» (report the
   rendered string); the stored/server-side name remains «Ελένη»
   exactly (report it).
3. Re-run `npm run screenshot:phases` — fresh shots, PNGs not
   opened. Commit as task 182 and push.
