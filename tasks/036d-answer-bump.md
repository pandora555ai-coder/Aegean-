# 36d — The crowd reacts to each answer

During QUESTION (and GUESS, NUMERIC_QUESTION) the host receives
answer:progress as each player locks in. The crowd mixer (36c) ramps
intensity from .25 toward the phase target; each answer should push
it a step further, so a room that answers fast boils faster.

Rules: host-only, client-side, in useGameAudio.ts. Do not touch the
server, the mixer's crossfade math, or the audio files. Do not call
ElevenLabs.

1. Re-add an answer:progress listener in useGameAudio. On each event
   during QUESTION / GUESS / NUMERIC_QUESTION, add +.05 to the
   CURRENT ramp position over 200ms, then continue ramping toward the
   phase target over the remaining time; cap at the target + .1, never
   above .95. Outside those phases the event does nothing. Report the
   implementation in two lines and that no JS timer is used for the
   ramp itself.
2. Observe: short full game, 4 bots, log intensity immediately before
   and after every bump. Report bump count, and that every "after" is
   exactly +.05 above "before" unless the cap applied (report how many
   capped).
3. Inverse: a phase entry after a bumped question resets cleanly —
   report the intensity at the first REVEAL after a bumped QUESTION
   (must be the REVEAL target .3, not .3 + leftover).

Sonnet. No screenshots, no Playwright beyond the observation. Report
each criterion separately, under 6 lines total.
