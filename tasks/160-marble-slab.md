# 160 — MarbleSlab replaces PapyrusPanel

The reading surface becomes marble. Reference in the repo:
design/theatre-reference.html — the .slab rules (chamfer clip-path
--slab, the .vein layer using filter #marble, the .lit gradient, the
drop-shadow, padding 4.2cqh 5cqh, text --carve).

Rules: same component API as PapyrusPanel so no phase view changes
except the import. The slab is `flex: 0 0 auto`. Text on marble is
--carve; secondary text --marble-3. No raw hex outside the filter's
colour matrix. Animation only via transform/opacity; the filter must
sit on a static child, never on the element that transitions. Do not
touch the server, TheatreScene, or the palette. Do not call
ElevenLabs.

1. client/src/components/MarbleSlab.tsx replaces PapyrusPanel; the old
   file is deleted. The feTurbulence filter is defined ONCE in a
   shared hidden <svg> (mount it once in HostScreen) and referenced
   by url(#marble) from every slab. Report: PapyrusPanel references
   left in client/src (must be 0), and the number of feTurbulence
   elements in the DOM on /host in QUESTION (must be 1).
2. The slab's visual: chamfer clip-path, vein layer, lit gradient,
   drop-shadow — as in the reference. Report the computed clip-path
   and filter on the slab in QUESTION, measured in the running app.
3. Height, all 15 phases, at 3, 5, 6 AND 8 bots: report every element
   whose BOTTOM EDGE exceeds 690px, with data-testid and bottom value.
   If none, report the largest bottom edge per bot count and its
   phase. (Bottom edge, not height.)
4. npm run typecheck clean; git diff --stat server/ empty; re-run
   npm run screenshot:phases (BOT_COUNT=5) so /dev-shots/ is current;
   report PNG count. Do not open them.

Sonnet. No screenshots beyond the harness, Playwright only for the
measurements in 2 and 3. Report each criterion separately, under 8
lines total.
