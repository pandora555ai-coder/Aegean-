# 187b — addendum: CLIMB_TOP 12 → 10, re-measure

One-line change: `shared/src/index.ts`'s `CLIMB_TOP` 12 → 10. Entry
formula, deltas, and duel rules untouched.

## Results (seed 187, leader p-correct 0.7, others 0.5)

1. **Median rounds per scale batch** (400 runs each, N=4): entry 400-1500
   → **7.5**, entry 1500-3000 → **7.5**, entry 5000-9000 → **7.5**. All
   inside the required 4-9 band. PASS.
2. **Median rounds at N=2 / N=8** (entry 1500-3000, 400 each): N=2 →
   **6**, N=8 → **8**. Both inside 4-9 — N=8 did not land at 10, so no
   stop needed here; reporting the measured value as asked.
3. **Comeback % at N=4 per scale**: 400-1500 → **28.8%** (115/400),
   1500-3000 → **29.5%** (118/400), 5000-9000 → **29.5%** (118/400). All
   inside the required 10-35%. PASS.
4. **Deterministic edge case** (always-correct, always-fastest leader):
   median rounds = **3**, confirmed — entry step 4 + 2×3 = 10 = CLIMB_TOP.

All four checks pass at CLIMB_TOP = 10. No further changes made.
