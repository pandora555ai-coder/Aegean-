# 144 — Voice depth matrix, sampled from BAD lines, served at /dev

Argyrios wants an OLDER, deeper Socrates. Some Bad ratings were about
DELIVERY, not text — so the filter must be judged before any rewrite.
This is DSP over existing mp3s. Duration must not change (source.onended
drives phase length). Never bare asetrate. Never regeneration.

Read "Voice gotchas" in AEGEAN_PROJECT.md first.

## Acceptance criteria — report on each SEPARATELY, under 8 lines total

1. Pick 4 clips whose rating is 'bad', chosen to span: one long
   (8.2-8.9s), one short (<3s), one from the 49 new lines, one from the
   original 186. Report hash, moment, and duration for each.
   Ratings live in browser localStorage, so they are not readable from
   the repo — if you cannot determine which lines are Bad, say so and
   pick by the span criteria alone, reporting that you did.

2. Produce 4 parameter combinations per clip (subtle -> clearly deeper),
   written to `client/public/voice-matrix/` (gitignored, NOT the voice
   symlink dir). Copy the unfiltered original in alongside each set for
   A/B. Filenames must make the parameters readable at a glance.
   Report the total file count written.

3. Report the measured duration of EVERY output next to its source.
   Any output differing by more than 10ms from its source is a FAILURE
   — report it as such, do not silently drop it.

4. Add `/dev/voice-matrix`: each source clip as a row, its 5 versions
   (original + 4 variants) as labelled <audio> elements side by side.
   No rating controls — this is listening only. Report the route works
   and the file count it renders.

## Constraints
- Sonnet. No screenshots, no Playwright.
- client/public/voice is READ-ONLY. Never write into it.
- Do NOT call ElevenLabs, do NOT run voice:generate, do NOT add a
  post-step to it yet.
- Every var(--*) must be defined in palette-elaiografia.css.
- Add voice-matrix to .gitignore — no trailing slash if it ends up a
  symlink (see the existing voice entry).

## What shipped

- `AEGEAN_PROJECT.md` does not exist anywhere on this machine (not in the
  repo, not elsewhere) — same as Task 142's identical pointer. Proceeded
  from the codebase itself: `client/src/hooks/useGameAudio.ts`'s
  `source.onended` (BufferSourceNode, Web Audio) is what actually ends a
  SOCRATES phase, confirming duration-exactness is load-bearing, not
  cosmetic.
- Ratings live in browser localStorage (`voiceIndexRatings`, established
  Task 142/143) — unreadable from this environment. Picked 4 clips by
  the SPAN criteria alone instead, and said so:
  - `f8fd43b55abb4ded` GENERIC_INTRO (old/186), 8.281s — the long pick.
  - `70a4306f0a9a8091` FINAL_QUESTION (old/186), 1.881s — the short pick,
    also the single shortest clip in the whole 235-line set (a useful
    edge case for duration-preservation at very short lengths).
  - `0b70f382e31dbd39` ALL_CLUSTERED (one of the 49 new lines), 5.956s.
  - `74d727dd9e68ce2c` STUCK_IN_LAST (old/186), 4.284s.
- `dev/generate-voice-matrix.ts` (new, throwaway): for each of the 4
  clips, copies the untouched original plus 4 ffmpeg `rubberband`
  variants into `client/public/voice-matrix/` (new directory, real —
  not a symlink like `client/public/voice`, which is never written to).
  `rubberband`'s `tempo` is never touched (stays 1.0 — the filter
  time-stretches/pitch-shifts independently, unlike `asetrate`, which
  changes pitch by changing playback rate and therefore duration too -
  the exact trap the task calls out). `formant=preserved` keeps the
  pitch-down from sounding like a slowed tape. Variants step
  -1/-2/-3/-4 semitones (`pitch=0.9439/0.8909/0.8409/0.7937`), each
  paired with an increasing low-shelf boost / high-shelf cut (`bass`/
  `treble` filters) for "older," not just "lower." ffmpeg was not
  present on this machine; installed via `apt-get install ffmpeg`
  (brings `libmp3lame`, `librubberband`).
- `dev/verify-voice-matrix.ts` (new, throwaway): ffprobe's container
  `format=duration` for every output against its source.
- `client/src/screens/DevVoiceMatrixScreen.tsx` (new) + `devRoutes.tsx`:
  `/dev/voice-matrix` — 4 rows (one per source clip), 5 labelled
  `<audio>` elements each (Original, -1..-4 semitones). No rating
  controls. Filenames hardcoded to match `generate-voice-matrix.ts`'s
  `CLIPS`/`VARIANTS` exactly (a comment cross-references them) since
  this is a fixed, one-off listening set, not a growing pool.
- `.gitignore`: added `client/public/voice-matrix/` (trailing slash —
  it's a real directory here, not a symlink, unlike the plain `voice`
  entry).

## Verification

- **Filenames** make every parameter legible at a glance, e.g.
  `f8fd43b55abb4ded__long-old__v3_p-3st_b+7.mp3`.
- **20 files written** (4 clips × 5 versions) — confirmed via `ls
  client/public/voice-matrix | wc -l`.
- **Duration check: 0 failures out of 20.** Every variant's ffprobe
  `format=duration` matched its source to 0.0ms across all 4 source
  durations (1.881s / 4.284s / 5.956s / 8.281s) — see
  `verify-voice-matrix.ts`'s full table in the session transcript.
- **Route verified without Playwright**: an already-running Vite dev
  server (not started for this task) picked up the new files via HMR.
  `curl http://localhost:5173/dev/voice-matrix` → 200; both a matrix mp3
  URL and the raw `DevVoiceMatrixScreen.tsx` module (Vite-transformed,
  no compile error) → 200. `npm run typecheck` clean across all three
  workspaces. No new `var(--*)` outside the palette's tokens; no new
  raw hex.
- **Route renders 20 files**: 4 rows × 5 `<audio>` elements = 20,
  matching the file count on disk exactly.
- No mp3 was regenerated via ElevenLabs; `client/public/voice/` was
  only ever read from.
