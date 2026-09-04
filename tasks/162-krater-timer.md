# 162 — The krater replaces TimerRing

The timer is a wine krater: the wine level IS the remaining time.
Reference in the repo: design/theatre-reference.html — .krater, the
#bowl clipPath, the .wine rect scaled by scaleY(secs/total) with a
1s linear transform transition, the number below in 800 weight
tabular-nums 4.2cqh.

Rules: same component API and the same mount point as TimerRing, so
nothing else moves — repositioning is 161's job. Animation via
transform only, never height. All timing comes from the shared timer
helper so pause freezes it. TimerRing's urgency-pulse hex #ef4444 is
the ONE sanctioned raw hex on the host; it moves into the krater and
nowhere else. Do not touch the server, TheatreScene, the palette, or
MarbleSlab. Do not call ElevenLabs.

1. client/src/components/Krater.tsx replaces TimerRing; the old file
   is deleted; every call site renamed and nothing else in it changed.
   Report: TimerRing references left in client/src (0), and the raw
   hex count in client/src excluding TheatreScene.tsx, /dev/*, and
   the drawing INK/PAPER constants (must be exactly 1, in Krater).
2. Wine level = remaining/total as a scaleY transform on the wine rect
   with transform-origin at the bowl's bottom; the number pulses only
   under 5s remaining. Measure live in QUESTION: report the computed
   transform of the wine rect at ~1s after entry and at ~half time.
3. Pause: in QUESTION, pause for ~3s, resume. Report the wine
   transform and the displayed number immediately before the pause
   and immediately after resume — both must be identical.
4. npm run typecheck clean; git diff --stat server/ empty; bottom
   edge > 690 check at 3, 5, 6, 8 bots for the five timer phases
   (QUESTION, DRAW, GUESS, NUMERIC_QUESTION, TRIAL_QUESTION) — report
   offenders or the largest bottom edge per count; re-run
   npm run screenshot:phases (BOT_COUNT=5), report PNG count, do not
   open them.

Sonnet. Playwright only for the measurements in 2–4. Report each
criterion separately, under 8 lines total.
