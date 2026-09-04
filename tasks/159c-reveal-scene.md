# 159c — The theatre must be visible

TheatreScene (158) is mounted first in HostScreen, but something above
it paints an opaque surface over the whole viewport, so the scene is
never seen. Only the reading panel and the score column may have their
own surface; the ground between them is the scene.

Rules: do not touch the server, TheatreScene.tsx, or the palette. Do
not restyle panels — that is 160/161. Do not call ElevenLabs.

1. Find every element rendered above TheatreScene whose background is
   opaque AND whose box covers 80% or more of the 1280x720 viewport,
   in every phase (measure in the running app, not by reading CSS).
   Report each as file:line, phase(s), and the background value BEFORE
   the fix.
2. Make them transparent (the phone/landing routes keep their own
   backgrounds). After the fix the count from criterion 1 is 0 in all
   15 phases; report it. The dimmed filter from 158 must still apply
   in QUESTION and lift in SOCRATES — report the computed filter value
   of the scene root in both phases.
3. Re-run npm run screenshot:phases (BOT_COUNT=5) so /dev-shots/ shows
   the result. Report the PNG count and that you did not open them.

Sonnet. No Playwright beyond what the harness and the measurement in
criterion 1 need. Report each criterion separately, under 8 lines.
