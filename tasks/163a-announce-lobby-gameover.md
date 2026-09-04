# 163a — Stage announce, lobby, game over

The three screens without a clock. Reference in the repo:
design/theatre-reference.html — the .overlay rules (.n stage label in
ember, .t serif title 16cqh, .r rule line), #lobby (.brand with the
tagline, .join slab with code / URL / QR), #gameover (.n "Ο μαθητής",
.t winner 11cqh, .r closing line) and the .leaves / .fall keyframe.

Rules: the slab is hidden on all three. The sophists row (161) stays
VISIBLE in LOBBY so joining players appear on the orchestra — change
its hide rule to STAGE_ANNOUNCE only. Animation via transform and
opacity only, no layout animation; honour prefers-reduced-motion.
Nothing player-related on any overlay except the winner's name. Text
on the dark ground is --marble; no --marble-3 for anything that must
be read. Every view survives a first render with a NULL payload. Do
not touch the server, TheatreScene, the palette, MarbleSlab, Krater
or SophistsRow internals (only its phase visibility). Do not call
ElevenLabs.

1. STAGE_ANNOUNCE: centred overlay — stage label (ember, tracked
   caps), title in the serif at 16cqh, rule line below in --marble-2,
   text-shadow as in the reference. Delete the old stage card. Report
   the title's width at the longest stage name (Η Συκοφαντία) and the
   overlay's bottom edge.
2. LOBBY: brand left (Αιγαίον + tagline), join slab right (Κωδικός,
   code 12cqh 900 tabular, URL in --wine, QR 20cqh), one line of
   settings summary in --marble-2 under the slab. Delete the old
   player list, waiting message and power hint — the row shows who
   joined. Report the bottom edge at 0, 3, 5 and 8 bots (the 103
   overflow was at 0 players).
3. GAME_OVER: overlay "Ο μαθητής", the winner's name at 11cqh (ties:
   names joined with " · "), the closing line from the payload if it
   carries one, else the reference's fixed line. 60 olive leaves fall
   once, staggered, via transform; the row stays with the wreath.
   Report the leaf count in the DOM and a grep of the leaf keyframe
   proving only transform/opacity are animated.
4. Bottom edge > 690 for all 15 phases at 3, 5, 6, 8 bots — report
   offenders or the largest per count; npm run typecheck clean;
   git diff --stat server/ empty; re-run npm run screenshot:phases
   (BOT_COUNT=5), report PNG count, do not open them.

Sonnet. Playwright only for the measurements. Report each criterion
separately, under 8 lines total.
