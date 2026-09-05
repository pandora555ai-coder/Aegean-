# 156b — Blitz on the TV

Two phases, in the theatre language. Reference in the repo:
design/theatre-reference.html — the slab (.cat, .q, .mid), the row's
.d delta, the .opt.ok check shape.

Layout rule: TOP slab = anything READ; BOTTOM row = anything about
PLAYERS. Colour is never information: true statements get the check
shape, false ones a short dash in --marble-3 weight 700; nothing red or
green. Every view survives a first render with a NULL payload. Do not
touch the server, TheatreScene, the palette, MarbleSlab, Krater or the
phone. Do not call ElevenLabs.

1. BLITZ: slab with the label «Η Παλαίστρα», one serif line «Δεξιά το
   σωστό, αριστερά το λάθος.» and a --carve line «Δώδεκα προτάσεις,
   τριάντα δευτερόλεπτα.»; the krater runs 30s; above each plaque an
   ember counter «n/12» live from the host progress payload, no
   animation on the number. Report the slab bottom edge and the
   counter's font size in cqh.
2. BLITZ_REVEAL: the slab lists all 12 statements in two columns,
   «Αληθινά» / «Ψεύτικα», at ~3cqh 700 --carve, check shape before
   each true one, dash before each false one; the statement most
   players got wrong is set in 800 weight (an emphasis, not a colour).
   The row shows ember deltas (sign carried) and the counter tween /
   reorder as in REVEAL. Report the slab bottom edge with the 12
   LONGEST statements in BLITZ_STATEMENTS (report their max length).
3. Extend npm run screenshot:phases to ALSO run a standalone blitz
   game and capture BLITZ.png and BLITZ_REVEAL.png (17 PNGs total,
   index updated). Report the count. Do not open them.
4. Bottom edge > 690 at 3, 5, 6, 8 bots for both phases; typecheck
   clean; git diff --stat server/ empty. Commit as task 156b and push.

Sonnet. Playwright only for the measurements. Report each criterion
separately, under 8 lines total.
