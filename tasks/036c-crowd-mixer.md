# 36c — Crowd mixer on the host; the cue set retires

Seven OGG files exist in client/public/crowd/ (murmur, unrest, roar
loops of 30s; cheer-small, cheer-big, boo-small, boo-big one-shots).
The server already emits crowd:intensity {value, from?, rampMs} (36b)
and crowd:mood {mood} (35/151), both host-only. /dev/crowd has a
working reference mixer — reuse its crossfade math.

Rules: audio is host-only, ONE AudioContext, the same one the Socrates
voice uses — never create a second. The 254 Socrates mp3s stay
HTTP-cache only; the 7 crowd files ARE decoded. Do not touch the
server or the audio files. Do not call ElevenLabs. React StrictMode
double-invokes effects — guard once-only setup.

1. Mixer in client/src/hooks/useGameAudio.ts: decode the 7 files on
   LOBBY entry; the three loops start together on the first host
   gesture and never stop; three GainNodes with equal-power crossfade
   (murmur full at 0, unrest at .5, roar at 1) driven by
   crowd:intensity — `from` snaps then ramps, no `from` ramps from the
   current value, over rampMs, using scheduled AudioParam curves, not
   a JS timer. On pause: cancel and hold the current value (the server
   re-emits on resume). A bed master gain constant CROWD_BED_GAIN
   (start .6). Report: AudioContext count on /host (must be 1) and the
   total decoded bytes of the seven buffers.
2. One-shots: on crowd:mood cheer/boo play the small variant when the
   current intensity < .5, else big, at gain max(intensity, .3), over
   the bed without touching it; calm/tension play nothing. Observe a
   short full game with 4 bots: log each one-shot with the intensity
   at that moment; report count, and the min/max intensity seen.
3. The old cue set retires: remove the cue functions in useGameAudio
   and their five call sites in HostScreen, and the countdown audio.
   The host mute toggle now mutes crowd AND Socrates together. Report
   the removed function names and net lines removed, and PROVE the
   voice still plays: in the same bot run, socrates:audio_ended fires
   with a real clip duration (report it), not the 11000 backstop.
4. Ducking is not a separate mechanism — it is the .12 target from the
   server. Observe: report the summed bed gain during a SOCRATES phase
   and 1s after it ends.

Sonnet. No screenshots, no Playwright beyond the bot-run observation.
Report each criterion separately, under 8 lines total.
