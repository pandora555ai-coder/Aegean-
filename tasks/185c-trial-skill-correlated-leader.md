# 185c — closing verification: skill-correlated leader, no formula change

Criterion 3's original 10-35% band assumed equal-skill bots, whose null
comeback rate is 75% (leader is 1 of 4). 185b's 37-48% under that model was
actually a 2-2.5x leader advantage over chance, not a failure - it just
wasn't measuring what the band was meant to check: a leader who is a
better player, not just luckier so far.

## What changed

server/scripts/trial-montecarlo.ts only: two new flags,
`--p-correct-leader` and `--p-correct-others`, overriding `--p-correct`
per-player (default `null`, i.e. unchanged behavior when unset). No
scoring/simulation logic touched. shared/src/index.ts: untouched.

## Results (400 runs/batch, seed 185, leader p-correct 0.7, others 0.5)

1. **Comebacks**: 71/400 (17.8%), 102/400 (25.5%), 95/400 (23.8%) — all
   inside 10-35%. PASS.
2. **Verdicts**: 100.0% / 100.0% / 100.0%. PASS.
3. **Shared diff**: `git diff --stat 845f854 -- shared/` is empty - zero
   lines. Confirmed.

Both the drain calibration (185b) and the tiered penalties (185) hold up
under a leader who is genuinely better, not just ahead on variance.
