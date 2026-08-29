# 113 — GAME_OVER must fit 690px at every player count

Fallout from 112: the TV safe area now costs 10vh, and GAME_OVER is the
one host screen stacking a celebration header ABOVE a list that grows
with the room. At 5 players its last standing row reached 721px.

## Work

GameOverView's whole stack (header + standings) is wrapped in one block
and scaled to fit by `useFitScale` (client/src/hooks/useFitScale.ts): one
transform, applied only when the stack would otherwise overflow the
container's inner height, so counts that already fit render untouched.
The confetti stays outside that block - it is fixed-position, animated
and deliberately off-panel, and scaling it would be meaningless.

## Why 5 and not 8

densityScale steps at <=5 (0.82) and <=6 (0.68), so five rows render at
the LARGEST scale while six shrink hard. The worst case is always the
count just below a threshold, not MAX_PLAYERS. Now recorded in CLAUDE.md.

## Measured

Measured on the real /host route at 1280x720, sampled over 4s (the rows
have an entry animation), decorative confetti excluded - an earlier report
of a -61px "top" was a confetti piece, which is fixed-position, animated
and off-panel by design.

Bottom-most pixel, before -> after the fit:
4: 684 -> 684   5: 721 -> 684   6: 684 -> 684   7: 684 -> 684   8: 684 -> 684
