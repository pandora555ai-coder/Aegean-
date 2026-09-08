# Task 195 — Fix: Socrates silent after VIP sound collapse (192)

## Hypothesis (from Task 195 brief) — NOT CONFIRMED

Leading theory: Task 192 collapsed the VIP sound sliders behind a
toggle, collapsed by default, so `voiceGain` never got its intended
value because the slider's mount effect stopped running.

Trace of every write to `voiceGain.gain.value` (client/src/hooks/useGameAudio.ts):

| Write site | Trigger | Depends on slider mounted? |
|---|---|---|
| `useGameAudio.ts:267` (`voiceGain.gain.value = voiceVolumeRef.current`) | AudioContext construction (`getAudioCtx`, called from `startKeepAliveAudio` on the ROOM_CREATED handler, HostScreen.tsx:286) | No — `voiceVolumeRef` defaults to `useRef(1)` (line 77), a plain ref, never read from DOM |
| `useGameAudio.ts:236-237` (`setVoiceVolume`) | Only ever called from HostScreen.tsx:329, itself only fired by the server relay of `vip:set_audio_volume` | No — this is an event-driven ramp, not a mount effect |

Crowd's `bedGain` follows the exact same two-write shape (construction
default + event-driven `setCrowdVolume`), confirming there was never a
"slider must be mounted to seed the gain" dependency for either.

`git show a42ea43 -- client/src/screens/ControllerScreen.tsx
client/src/screens/HostScreen.tsx | grep voiceVolume|voiceGain|crowdVolume|VIP_SET_AUDIO_VOLUME|handleAudioVolumeChange`
touches **zero** lines of that logic — the diff is a pure JSX/CSS wrap
of the existing two `<input>` rows behind `{expanded && (...)}`, plus
one new toggle button and its style object. `onChange` and the emit
call are untouched.

**Empirical confirmation** (throwaway Playwright run, dev server,
sound panel never opened): `voiceGain.gain.value` at construction and
at the first live SOCRATES beat = **1** (full volume, not 0).

Per the task's step 4, the hypothesis is not confirmed, so no fix was
applied to the gain-init path. Alternative candidate: a live, unlogged
failure inside `playSocratesLine`'s fetch/decode/start (the Task 154
silent-catch design) — that's the actual code the two console.warn
additions below now surface.

## Change made (step 3 only)

`playSocratesLine`'s catch block, and the adjacent `!res.ok` early
return, both used to fail completely silently (Task 154's intentional
design — `onEnded()` and nothing else). Added `console.warn` to both:

```
console.warn(`[socrates-audio] fetch failed for ${hash}.mp3: HTTP ${res.status}`);
...
console.warn('[socrates-audio] playSocratesLine failed', err);
```

`onEnded()` behavior is unchanged in both branches. Verified via a
forced decode failure (Playwright, `page.route` returning garbage
bytes for `**/voice/*.mp3`): logged
`[socrates-audio] playSocratesLine failed EncodingError: Unable to decode audio data`.

Verified the slider's live path still works: VIP emits
`vip:set_audio_volume` with `voiceVolume: 42` → `voiceGain.gain.value`
went from `1` to `0.41999998688697815` (~42%, the 50ms ramp settled).

Root cause of the original report remains open — this task only rules
out the stated hypothesis and adds the logging that will catch it live
next time it recurs.
