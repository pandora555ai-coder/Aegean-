# Task 140 — Full mode: phones lose answer options at stages 4-5; trial TV shows one answer

Model: Sonnet.

REAL PLAYTEST FINDING (2 humans, production): in a full-mode game,
stage 4 (Συκοφαντία) phone QUESTION views showed NO answer options;
stage 5 (trial) phones ALSO showed none, and the TV's trial view
showed only ONE answer text on the papyrus instead of the grid.
Stages 1-3 worked. Bots never caught this because they answer at the
socket level and never render a phone.

HYPOTHESIS TO PROVE OR KILL: something keys on standalone-quiz stage
indices (steal=stage 3, trial=last) and the 5-stage full structure
falls outside it. Do not fix on the hypothesis — localize first.

Reproduce on localhost:5173/4001 ONLY (never the production URL),
with TWO real Playwright phone clients at 360x740 plus the host page
— player count 2, matching the report.

## Acceptance criteria

Report on EACH one separately, with observed numbers. Under 8 lines.

1. **Localize per stage.** Full short run (2+2). At the first
   QUESTION of stage 1 and stage 4 and at the first TRIAL_QUESTION:
   report, for one phone, the rendered option-button count in the
   DOM AND the options array length in the socket payload it
   received. The payload/DOM split says server or client.

2. **TV trial grid.** At the same TRIAL_QUESTION and TRIAL_REVEAL:
   report how many option texts the TV papyrus renders and the
   payload length behind it.

3. **Fix and re-observe.** After the fix: rerun (1) and (2) — 4
   options on every phone at stages 1, 4 and trial; full grid on the
   TV trial view. Name the root cause in ONE line with file:line.

4. **Inverse: standalone untouched.** Standalone quiz short run with
   one real phone client: 4 options at every QUESTION and
   TRIAL_QUESTION, steal stage included — one line with the counts.

## Out of scope

Trial balance, the 137 column behavior (working as designed), voice,
anything cosmetic.
