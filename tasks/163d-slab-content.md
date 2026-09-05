# 163d — Canvas, number line and the check mark on the slab

Reference in the repo: design/theatre-reference.html — .drawing and
.canvas in draw()/guess(), .numline in numeric(), .opts / .opt.ok and
its ::before check shape in reveal().

Rules: colour is never information. Correct = weight + opacity 1 + a
CHECK MARK SHAPE drawn in --wine-2 (the shape carries it); wrong sits
at opacity .42. Standing exceptions to "nothing player-related on the
slab": "X ΖΩΓΡΑΦΙΣΕ ΑΥΤΟ" in GUESS, and the numeric number line with
player names — it is READ. The drawing is a raster (WebP on PAPER
#F6EEDC); no stroke-reveal animation. Every view survives a first
render with a NULL payload. Do not touch the server, TheatreScene,
the palette, Krater, SophistsRow or the scoring. Do not call
ElevenLabs.

1. DRAW / GUESS / GUESS_REVEAL: the canvas sits on the slab at 30cqh
   square with the inset --marble-2 edge, text beside it (drawer line
   in the serif, waiting line in --marble-2 → use --carve for anything
   that must be read). GUESS options in ONE column beside the canvas;
   GUESS_REVEAL marks the correct one with the check shape, wrong at
   .42. Report the slab's bottom edge in GUESS at 8 bots and the
   longest word in the drawing word sets that fits on one line.
2. NUMERIC_REVEAL: the number line on the slab — one tick per player
   labelled "name value", the truth in --wine-2, taller, larger
   label; positions proportional across [min, max] of all values
   including the truth, 6% padding each side. Labels that would
   overlap alternate above / below the line. Observe at 8 bots and
   report the number of overlapping label pairs (must be 0), or list
   them.
3. REVEAL and TRIAL_REVEAL: options in the 2-column grid at 4cqh 700;
   the correct option gets the check shape + weight, wrong at .42.
   Report a grep across client/src/screens/host for any colour named
   red/green or any hex — must be 0 — and the computed opacity of one
   wrong option.
4. Bottom edge > 690 for all 15 phases at 3, 5, 6, 8 bots — offenders
   or the largest per count; npm run typecheck clean; git diff --stat
   server/ empty; re-run npm run screenshot:phases (BOT_COUNT=5),
   report PNG count, do not open them.

Sonnet. Playwright only for the measurements. Report each criterion
separately, under 8 lines total.
