# Task 156c — Blitz phone UI + TV reveal wrap

## Phone (BLITZ phase, /play)
- Render the current statement as a marble card-slab in the phone's
  established slab language: chamfer clip-path, flat --marble fill,
  --carve text, NO veins/filters/gradients. Progress «n/12» above it.
- Drag right = ΣΩΣΤΟ, drag left = ΛΑΘΟΣ. The label on the drag side
  GROWS continuously with pointer distance (transform scale driven
  directly by the pointer delta — finger-driven motion is allowed).
  Nothing moves before touch. Release past a threshold submits via
  the existing blitz answer event; release below threshold resets
  the card INSTANTLY — no snap-back animation, no transition. Rule:
  no motion on the phone that is not driven by the finger.
- Colour is never information: both labels use the same palette
  tokens; side + growth carry the meaning. Touch targets ≥44px.
- Bots answer at the socket level and never render a phone.
  Test on localhost:5173/4001 only.

## TV (BLITZ_REVEAL)
- Statements in the Αληθινά/Ψεύτικα slab wrap to a maximum of TWO
  lines instead of ellipsis. No content that must be read is ever
  truncated.

## Acceptance criteria — report each one separately, with numbers
1. At 360×640 in BLITZ: before touch, zero animated elements; during
   a right drag the ΣΩΣΤΟ label scale grows with distance — report
   the scale at ~0px and at ~120px of drag. A full 12-statement run
   submits exactly 12 answers server-side (count them).
2. Zero horizontal and vertical overflow at 360×640 with the longest
   statement in BLITZ_STATEMENTS on the card; all touch targets
   ≥44px (report the smallest).
3. Force a BLITZ_REVEAL containing the 12 LONGEST statements from
   BLITZ_STATEMENTS at 1280×720: zero ellipsis, every statement ≤2
   lines, and report the slab's BOTTOM EDGE in px — must be ≤690.
   If it passes, also report the bottom edge value, never a bare pass.
4. Player BLITZ_REVEAL payload unchanged: leak count of truth keys /
   statement list in the player payload = 0 (prove with a count, as
   in 156b). Commit as task 156c and push.

After the criteria: re-run `npm run screenshot:phases` so /dev-shots
is fresh. Do NOT open the PNGs.
