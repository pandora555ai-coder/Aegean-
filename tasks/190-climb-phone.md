# 190 — Η Ανάβασις on the phone

Client-only. The TV (189) and server (188a-c) are done. The phone
gets the climb + duel views in ControllerScreen. Design rules are
the phone's standing ones: marble slabs, --carve on marble, 44px
targets, zero overflow at 360×640, NO motion not driven by the
finger (state changes at a moment are allowed, animations are not).

## Scope

- CLIMB_QUESTION: the existing quiz answer grid, unchanged — climb
  questions are quiz questions. Above it, one compact strip: your
  step as a horizontal 10-notch ladder glyph with your notch filled
  (no digits, no other players).
- CLIMB_REVEAL: your delta as ↑ / ↑↑ / ↓ / ↓↓ in ember plus the
  strip updating — a single state change, no animation.
- DUEL_PICK (duelist): three weapon slabs — ΞΙΦΟΣ / ΔΟΡΥ / ΑΣΠΙΔΑ,
  stacked full-width, 44px+, icons from the reference's weapon
  SVGs. Tap = lock: selected slab gets the --wine-2 edge + weight,
  others drop to .42. After lock, taps are dead (server ignores
  repicks — mirror that client-side).
- DUEL_PICK (spectator): «Μονομαχία» + the two duelists' names
  through greekUpper, nothing else. No weapon UI exists in the
  spectator DOM at all.
- DUEL_REVEAL: both weapons + winner; your result emphasized if
  you dueled. Tie: «Ξανά» and the pick UI re-arms.
- Phase-scoped state clears on every transition that could follow
  it (the 140 corollary): a stale duel pick must never survive
  into a re-entered DUEL_PICK or the next game.
- Every view survives a first render with a NULL payload.

## Acceptance criteria (report each separately, with numbers)

1. Playwright phone client through a full climb game with a forced
   duel (the 189 harness game): report the view sequence rendered
   and 0 console errors; the tie re-arm renders a fresh unlocked
   pick UI (report the re-entered state).
2. Overflow: at 360×640 report scrollWidth === clientWidth (no
   horizontal overflow) for each new view, and every tap target's
   measured box ≥ 44px (report the smallest).
3. Spectator DOM: during DUEL_PICK, dump the spectator phone's DOM;
   report 0 weapon strings and 0 weapon-shaped elements.
4. Harness phone shots: extend the 9 phone PNGs with climb-question,
   duel-pick (duelist), duel-reveal; report the new count (12) and
   do NOT open them.

Report under 8 lines. Commit the task file with the work, push.
