# 159d — Phone text is white on white

After the palette swap (159) the /play answer options and other
phone surfaces show light text on a light surface. Text on a marble
surface (--marble, --marble-2) must be --carve; text on the dark
ground (--night-0, --night-1) must be --marble. Secondary text on
marble is --marble-3.

Rules: phone only (ControllerScreen and its views). No new tokens, no
raw hex. No layout or size changes — 44px targets stay. Do not touch
the server or /host. Do not call ElevenLabs.

1. Measure, don't read: for every text element on /play in LOBBY,
   QUESTION (all four options), REVEAL, DRAW toolbar, GUESS, NUMERIC,
   TRIAL_QUESTION, compute the WCAG contrast ratio between its color
   and its nearest opaque background. Report every element under 4.5
   with its testid, colors and ratio, BEFORE the fix.
2. Fix them by the rule above. Re-measure; report the count under 4.5
   (must be 0) and the lowest ratio remaining.
3. npm run typecheck clean; git diff --stat server/ empty; list the
   changed files.

Sonnet. Playwright only for the measurement. Report each criterion
separately, under 6 lines total.
