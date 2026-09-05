# 164 — Socrates stands on the orchestra (placeholder SVG)

Socrates is a separate layer between the scene and the slab; later he
becomes WebM or Rive, so this component must be replaceable without
touching anything else. Reference in the repo:
design/theatre-reference.html — the .socrates block (SVG: himation,
head, beard, the .hand group), its positions per phase, and the
@keyframes speak.

Rules: one component, client/src/components/SocratesFigure.tsx, props
{ phase } only — it decides its own pose from the phase. Animation via
transform only; the hand moves ONLY in SOCRATES and STEAL; honour
prefers-reduced-motion. Raw hex allowed INSIDE this SVG (art, like
TheatreScene). Delete whatever currently stands in for Socrates on
/host (image, avatar, or nothing — report which). Do not touch the
server, TheatreScene, the palette, MarbleSlab, Krater, SophistsRow or
the phase views. Do not call ElevenLabs.

Positions (from the reference): default left 7%, bottom 9cqh, width
12cqh, height 30cqh, transform-origin bottom centre. SOCRATES and
STEAL: left 12%, scale 1.35, hand speaking. LOBBY and STAGE_ANNOUNCE:
left 44%, scale 1.15. GAME_OVER: left 40%, scale 1.3. Transitions
450ms on transform and left.

1. The component, mounted once in HostScreen at z-order above
   TheatreScene and below the slab, speech slab and overlays. Report
   what it replaced, and the computed left / transform in QUESTION,
   SOCRATES, LOBBY and GAME_OVER.
2. The hand: the speak animation is running in SOCRATES and STEAL and
   NOT running in any other phase — report the computed
   animation-name in SOCRATES and in QUESTION. Under
   prefers-reduced-motion: reduce it must be none in SOCRATES too.
3. Overlap: in SOCRATES the figure must not cover the speech slab; in
   LOBBY it must not cover the join slab or the brand; in QUESTION it
   must not cover the slab or the krater. Report the intersection
   area in px² for each pair (all must be 0).
4. Bottom edge > 690 for all 15 phases at 3, 5, 6, 8 bots — offenders
   or the largest per count; npm run typecheck clean; git diff --stat
   server/ empty; re-run npm run screenshot:phases (BOT_COUNT=5),
   report PNG count, do not open them.

Sonnet. Playwright only for the measurements. Report each criterion
separately, under 8 lines total.
