# Task 249 — Socrates TTS audible cutoff at end of lines

Context check: HEAD was de69183 at start, as expected.

## Diagnosis (required before any fix)

**Where the loss happens: the FILES (case a), not playback (case b).**

### Three-number comparison, 16 real lines across 12+ pools

Driven through a real Chromium host (`dev/socrates-cutoff-check.ts`) against a
real in-process server, forcing the actual sequence machinery
(`enterSocratesBeat`/`advanceFromSocrates`) so every clip really decodes and
plays through the app's own `useGameAudio.ts`. `AudioContext.createBufferSource`
and `window.fetch` were patched (browser-side only, no app code touched) to
capture the browser's own `decodeAudioData` buffer length and the wall-clock
span between `source.start()` and the native `ended` event.

| line | ffprobe | decoded (browser) | played (browser) | beat-held (server) |
|---|---|---|---|---|
| STAGE_INTRO/blitz#11 (over-cap) | 11233ms | 11200ms | 11206ms | 11269ms |
| STAGE_INTRO/draw#15 (over-cap) | 10998ms | 10960ms | 10977ms | 11047ms |
| ANAVASIS_INTRO#22 (over-cap) | 13949ms | 13920ms | 13923ms | 13995ms |
| ANAVASIS_INTRO#21 (under-cap) | 9326ms | 9280ms | 9282ms | 9326ms |
| ANAVASIS_INTRO#20 (under-cap) | 4127ms | 4080ms | 4090ms | 4140ms |
| STAGE_INTRO/steal | 9247ms | 9200ms | 9204ms | 9250ms |
| STAGE_INTRO/numeric | 9561ms | 9520ms | 9515ms | 9570ms |
| WINNER | 6348ms | 6320ms | 6324ms | 6369ms |
| REVEAL/SPLIT_GUESS | 8829ms | 8800ms | 8798ms | 8859ms |
| REVEAL/ALL_CLUSTERED | 8202ms | 8160ms | 8167ms | 8210ms |
| REVEAL/NOBODY_CLOSE (a) | 8751ms | 8720ms | 8711ms | 8760ms |
| REVEAL/NOBODY_CLOSE (b) | 8751ms | 8720ms | 8725ms | 8770ms |
| REVEAL/ONLY_ONE_CORRECT | 5564ms | 5520ms | 5512ms | 5560ms |
| REVEAL/LEAD_CHANGE | 7471ms | 7440ms | 7432ms | 7470ms |
| REVEAL/SPEED_DEMON | 9953ms | 9920ms | 9918ms | 9970ms |

(GAME_INTRO#9 fired but its client-side probe collided with the LOBBY
prefetch's own concurrent fetch of the same hash — beat-held from the server
log alone was 13428ms against a 15388ms backstop, i.e. it also ended on a
natural ack, well short of the backstop.)

For all 15 matched lines: **decoded ≈ played** (within ~10ms — the browser
plays every clip to the full length its own decoder reports, every time) and
**beat-held ≈ played + ~40-60ms** (the ack round-trip). None of the 16 beats
hit their backstop. This rules out (b) categorically: playback is never cut
short, the timer never advances early, and Task 238's duration-aware backstop
is doing exactly what it's supposed to.

`decoded` sits ~30-40ms under `ffprobe` on every single file (283/283,
server's own byte-size estimate is always ≥ ffprobe by 31-1962ms, confirming
Task 238's "within 32ms, always high" claim still holds) — an MP3
encoder-delay/padding artifact, not evidence of anything being lost.

### File-level truncation evidence

**230 of 283 voice files (81%) end with less than ~150ms of near-silence**
(RMS < ~-38dB in the trailing window, walked back from EOF). **144 of 283
(51%) end with literally zero ms of trailing silence** — the waveform is
still above the noise floor on its very last sample.

That alone doesn't distinguish "TTS just doesn't pad silence" from "cut off
mid-word", so a second, independent test: for each file, compare the RMS of
its last 20ms window against the loudest 20ms window in the preceding 300ms.
**36 files end at ≥60% of their own recent peak loudness** (14 of those at
ratio 1.00 — the very last sample IS the loudest point in that window,
meaning the energy is still rising or flat, not decaying, right up to EOF).
Spot-checked three of these (`14e053df27b48679`, `7127858876a53ef9`,
`44d7deab557fb288`) with `ffmpeg -af silencedetect` independently: each has
several genuine mid-sentence pauses throughout the clip (proving the voice
DOES pause naturally between phrases) but the LAST 1-1.5 seconds before EOF
is continuous unbroken speech with no silence event at all — the sentence
was still going when the file stopped.

The 36 highest-confidence truncated files (ratio ≥ 0.60, sorted worst first):

```
14e053df27b48679.mp3  20a639c5547c1fc2.mp3  44d7deab557fb288.mp3  4ed8cea53e2397ed.mp3
67d8f742d5ca6159.mp3  6a43e68a43eb634d.mp3  708893b717d38c4c.mp3  7127858876a53ef9.mp3
92a08ad77a486cbb.mp3  a51a621782a1e469.mp3  c04967d6b19523b8.mp3  cd4d921843879703.mp3
e827ecccaf3484e5.mp3  f642aef7c5f4a838.mp3  bfe20a42ba3a3751.mp3  b0d549c3fcc2b0f3.mp3
931e1a38950f65cf.mp3  d44a8fa67a2ce775.mp3  eb791807f9a802fb.mp3  8e66904297c37ec2.mp3
3e43cfe16e10d639.mp3  3a99081f131a5102.mp3  040c8ef98a982d1f.mp3  dbca5c501889ff7f.mp3
fdeab1a002e73e91.mp3  b55bbb406348b3b9.mp3  2d9ec8029a434137.mp3  3da959538a84cd60.mp3
8405bac8b8bbb493.mp3  6b0fe7045826ca78.mp3  7f65c17fb13041f8.mp3  988a178febecf5f0.mp3
8bc1e50284c9f7d5.mp3  8afbba987f55de40.mp3  1b402890cca29843.mp3  7bdab5357e0ac580.mp3
```

**Per task instructions: cause is (a), so no regeneration was performed.**
This is Argyrios's call. The 36 named above are the highest-confidence set;
the broader 230/283 "<150ms trailing silence" figure is a looser signal
(plenty of those may just be genuinely short pauses at a sentence's natural
end, not truncation) and shouldn't be read as "230 files are broken" —
treat the 36 as the actionable list if regeneration is decided on.

## Acceptance criteria

**1. Diagnosis** — delivered above: three-number table (15/16 lines,
decoded≈played≈ffprobe, zero backstop hits), 230/283 files ending with
<150ms trailing silence, and the stricter 36-file "still near peak loudness
at EOF" list cross-verified with an independent `silencedetect` pass.

**2. Cause is (a), the files** — named above (36 highest-confidence, list of
283-file sweep methodology documented). No fix applied to audio or to
playback/timing code, per instructions.

**3. Nothing got slower** — no code in `server/src` or `client/src` was
changed (`git status` at the end of this task shows only `dev/*.ts` and this
report touched). A 5-bot full game measured just now (`dev/socrates-cutoff-timing-check.ts`,
`mode=full`, default settings, real server-side bots acking real Socrates
audio the way `?bot=N` always has) took 892.2s total: Η Αγορά 167.1s, Η
Παλαίστρα 51.2s, Ζωγραφική 273.7s, Εκτίμηση 66.6s, Η Λήθη 72.4s, Η
Συκοφαντία 108.7s, Η Ανάβαση 152.6s. This differs substantially from the
687.6s sample quoted in the task prompt, but that gap is **run-to-run
variance in which Socrates REVEAL moments randomly fire** (bot answers are
randomised each run, and moment detection — CLOSE_SCORES, SPLIT_GUESS, etc.
— is answer-pattern-dependent), not a regression: zero lines of production
code differ between "before" and "after" this task, so there is nothing a
timing diff could actually be measuring here. (First attempt at this
measurement forgot to wire the harness's own host socket to
`wireHostSocratesAck` — server/src/bots.ts's documented fix for exactly this
— which rode every beat's full backstop and never reached GAME_OVER in
900s; re-run with it fixed the harness, not the game.)

**4. VIP skip / missing-clip fallback still work** — re-verified via the
existing `dev/socrates-pacing-check.ts` (Task 238's own suite), scenarios B
and C, both 6/6 passed:
  - **Missing clip**: a beat with no `.mp3` on disk falls back to the flat
    15000ms `SOCRATES_BACKSTOP_UNKNOWN_MS`, but the ack still arrives at
    ~0ms and ends the beat immediately (Task 154's path, intact).
  - **VIP skip**: pressing mid-beat ends it through the exact same
    `endSocratesBeat` path a natural ack takes (`... ended (vip:skip_socrates)
    - advancing`), advances to the NEXT line in a sequence (not past the
    whole narration), a second press inside the same beat is refused as a
    stale beat id, and a non-VIP's press is refused server-side.
  - `dev/socrates-pacing-check.ts`'s `NAMES` constant was pre-241
    (`Άλφα/Βήτα/Γάμα/Δέλτα`) and died on join with `INVALID_NAME` — repaired
    to preset names (`Άρης/Νίκη/Χαρά/Τάκης`), matching what
    `dev/finale-staging-check.ts` already did for the same reason. Only the
    NAMES constant changed; no scenario, threshold, or check logic touched.

## Proposed fix

Cause is (a): the audio files themselves were generated with the sentence
still in progress when the clip stopped, before ElevenLabs' own natural
trailing pause. This cannot be fixed in application code — the backstop,
the ack path, and playback are all already doing the right thing, confirmed
above. The only real fix is regenerating the 36 files named above (or all
283, or the broader 230, depending on how much churn Argyrios wants to
accept — `npm run voice:generate` regenerates changed lines by hash, so a
regeneration can be scoped with `ONLY_HASHES`). Since the task instructs
against doing that here, no code or audio was changed as part of this task.

## Files touched

- `dev/socrates-cutoff-check.ts` (new) — the 16-line three-number diagnostic
  harness described above.
- `dev/socrates-cutoff-timing-check.ts` (new) — the 5-bot full-game timing
  check described above.
- `dev/socrates-pacing-check.ts` — `NAMES` constant repaired to preset names
  (pre-241 leftover, per the task's own note about eight such harnesses).
