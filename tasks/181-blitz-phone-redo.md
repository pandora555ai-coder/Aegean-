# Task 181 — Blitz phone card: follow the finger, fix layout,
# occluded labels, uppercase accents

## Problems (visible in dev/shots phone-blitz.png + live play 7/9)
1. THE CARD DOES NOT MOVE during drag — only the labels grow. The
   card must track the finger horizontally. Core gesture feedback
   is missing.
2. The ΛΑΘΟΣ / ΣΩΣΤΟ labels sit in the card's band and are OCCLUDED
   by it («ΛΑΘΟ…» / «…ΩΣΤΟ»).
3. The card is far too small — a floating box in dead space, not in
   the phone's option-slab language.
4. «Η ΠΑΛΑΊΣΤΡΑ»: Greek uppercase must DROP the tonos — a
   text-transform artifact; fix every Greek-title site, shared
   helper preferred.

## Do
- Card = a proper marble slab: chamfer clip-path, --marble fill,
  --carve text, near full width (option-slab side margins),
  vertically generous — roughly the middle third of 360×640.
- DRAG: the card translates horizontally with the pointer delta
  (transform: translateX driven directly by the finger — allowed;
  a slight finger-driven rotation is optional, not required).
  Labels keep growing with distance (existing 1+|dx|/120). On
  release past threshold → submit; below threshold → INSTANT reset,
  no transition, no snap-back animation (rule: no motion on the
  phone not driven by the finger).
- Labels live in zones the card never overlaps AT REST — fully
  legible before any touch. During drag the card MAY pass over the
  far-side label; the active-side label must stay visible (place
  them accordingly, e.g. a band below the card or edge zones).
- Uppercase tonos fix everywhere; palette tokens only; 44px; zero
  overflow at 360×640.

## Acceptance criteria — report each one separately, with numbers
1. Drag tracking: at pointer deltas ~40px and ~120px right, report
   the card's computed translateX (must equal or proportionally
   track the delta) and the ΣΩΣΤΟ scale (1+|dx|/120). Release below
   threshold: card back at translateX 0 on the SAME frame, no
   transition property active — report the computed transition.
2. Rest geometry at 360×640: card width ≥ viewport − 2× option-slab
   margin; card box intersects NEITHER label box (report all three
   boxes, intersection 0 px²); both labels' full text rendered.
3. Uppercase audit: list every Greek-title uppercase site found +
   the rendered strings after the fix («Η ΠΑΛΑΙΣΤΡΑ» tonos-free).
4. Full 12-statement run still submits exactly 12 server-side; zero
   overflow at 360×640. Re-run `npm run screenshot:phases`, commit
   as task 181, push, then deploy (push first) so /dev/shots
   refreshes.
