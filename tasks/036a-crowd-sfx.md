# 36a — Generate the crowd sound set (seven files)

The crowd is a RAMP, not four moods: three continuous loops mixed by one
intensity number 0–1, plus one-shots layered on top. This task only
GENERATES and lets Argyrios LISTEN. Playback in the game is 36b.

## ElevenLabs — explicit one-time unlock
CLAUDE.md says the agent never calls ElevenLabs. For THIS task only,
you may call the ElevenLabs sound-generation endpoint (SFX v2), using
ELEVENLABS_API_KEY from .env. HARD CAP: 14 calls total (7 sounds, at
most one retry each). On any error, network failure or a rejected
parameter: STOP and report — no retry loops, no parameter guessing.
Never call the text-to-speech endpoint. Never touch client/public/voice.

## The seven sounds — ancient Greek theatre at dusk, open air, stone
Loops (30s, request looping output; if 30 is rejected use the maximum
allowed and report it):
  murmur  — a few hundred people seated, low conversational hum,
            occasional cough, no words intelligible, no music
  unrest  — the same crowd restless: shifting, murmur rising and
            falling, isolated shouts, feet on stone, tension
  roar    — the crowd on its feet, sustained roar, rhythmic stamping
            and clapping, no whistles, no modern stadium sound
One-shots (3s):
  cheer-small — a warm approving swell, "ah" and applause, brief
  cheer-big   — a full eruption, shouts and stamping, big decay
  boo-small   — a disapproving groan, scattered jeers, brief
  boo-big     — loud booing and hissing from the whole theatre
No words, no music, no instruments, no birds, no wind.

1. dev/generate-crowd-sfx.ts writes MP3 to client/public/crowd/ then
   converts each to OGG (ffmpeg, libvorbis q5) beside it; crowd/ is
   gitignored with a trailing slash. Report: calls made, failures,
   loop duration actually granted, and the account's credit balance
   BEFORE and AFTER (from the subscription endpoint), so the real cost
   of a sound is known.
2. All seven .ogg exist. Report each file's ffprobe duration in
   seconds; loops must be ≥ 25s, one-shots between 2 and 4s.
3. /dev/crowd listening page: one AudioContext, created on a Start
   button; the three loops play simultaneously and continuously, mixed
   by an intensity slider 0–1 with equal-power crossfade (murmur full
   at 0, unrest full at .5, roar full at 1); four buttons fire the
   one-shots at gain = intensity (min .3); a Duck toggle drops the bed
   to .12 over 300ms. Palette vars for chrome. Report curl 200 on the
   route and on one .ogg.
4. Nothing else changed: no useGameAudio.ts, no HostScreen, no server.
   Report the changed-file list.

Sonnet. No Playwright, no screenshots. Report each criterion separately,
under 8 lines total.
