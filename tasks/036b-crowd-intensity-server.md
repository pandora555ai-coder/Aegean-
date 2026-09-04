# 36b — crowd:intensity, server side

The crowd audio is a RAMP: one number 0–1 drives a three-loop
crossfade on the host. The server decides the number; the client (36c)
ramps to it. crowd:mood STAYS untouched — the scene consumes it and the
one-shots key off it. This is a second event, not a replacement.

Rules: host-only like crowd:mood — single host socket, never
room.code, players receive nothing. payloads.ts and realtime.ts import
nothing local back. Any formula a dev tool may reuse lives in SHARED.
Do not touch the client, useGameAudio.ts, or audio files. Do not call
ElevenLabs.

Event: `crowd:intensity` with `{ value: number, from?: number,
rampMs: number }` — "ramp from `from` (or the current value) to
`value` over rampMs".

Table, as a pure function crowdIntensityFor(phase, ctx) in shared:
  LOBBY .1/800 · STAGE_ANNOUNCE .3/800 · POWER_UP .35/800
  QUESTION from .25 to .7 over the question timer duration
  REVEAL .3/800 · STEAL .12/300 · SOCRATES .12/300
  DRAW .3/800 · GUESS from .25 to .6 over the guess timer
  GUESS_REVEAL .3/800 · NUMERIC_QUESTION from .25 to .6 over its timer
  NUMERIC_REVEAL .3/800
  TRIAL_QUESTION and TRIAL_REVEAL: min(.9, .4 + .5 * round/16)/800
  GAME_OVER .8/600
  Modifiers on the target value, cap .95: last question of a quiz
  stage +.15; CLOSE_SCORES beat pending +.15.

1. Shared: the type, the event name, and crowdIntensityFor with every
   phase above as an explicit case (no default branch that silently
   returns a value). Report the case count.
2. Server: ONE helper emitCrowdIntensity(room, payload), host-only,
   called AFTER phase:changed at every phase entry, for all four modes
   (quiz, draw, numeric, full inherit by composition). Report the
   call-site count and confirm a grep for the event name across
   server/ finds only the helper's emit.
3. Observe, don't read: short FULL game, 4 bots, log every
   crowd:intensity with its phase. Report: total events, min and max
   value, that TRIAL_QUESTION appears with the right formula value
   (this proves the ordering — mood was lost there in 151), and that
   a player socket listening for the event received 0.
4. Pause: on resume, re-emit the current phase's target with the
   REMAINING rampMs from the pause-aware timer helper. Run QUESTION,
   pause ~3s, resume; report the two events with their rampMs.

Sonnet. No Playwright, no screenshots. Report each criterion
separately, under 8 lines total.
