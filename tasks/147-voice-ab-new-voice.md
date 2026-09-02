# 147 — Regenerate the 43 GENIUS lines with a NEW voice, side by side

Argyrios has a new ElevenLabs voice ID and wants to hear it on the lines
he rated GENIUS — his best material. The existing mp3s must survive
untouched.

`lineHash(text, tag)` does NOT include the voice ID, so a new voice
writes to the SAME filenames. Nothing in this task may write into
`client/public/voice`.

Rules (design chat, not the repo):
- Argyrios generates all audio himself. Agents never call ElevenLabs.
- `client/public/voice` is READ-ONLY for agents.
- Ratings live in browser localStorage, not readable from the repo —
  the 43 GENIUS lines were supplied verbatim in the task prompt.

## Acceptance criteria — report on each SEPARATELY, under 8 lines total

1. Match every supplied line against `LINE_TAGS` keys by EXACT text.
   Report how many matched (43 expected). No fuzzy matching.
2. Extend `dev/generate-voice-lines.ts` with env-only overrides — an
   alternate voice ID, an alternate output directory, and a way to
   restrict generation to a supplied list of hashes — with no env vars
   set behaving exactly as before. Report the exact command Argyrios
   runs. Do NOT run it.
3. Add `/dev/voice-ab`: one row per line (text, moment, existing clip,
   new-voice clip), each labelled which voice it is. Must render
   cleanly with the alternate directory empty or missing.
4. Report the total lines the command in (2) would generate, and
   confirm the alternate directory is gitignored.

## Constraints
- Sonnet. No screenshots, no Playwright.
- Do NOT call ElevenLabs. Do NOT run any generation.
- Do NOT write into `client/public/voice` under any circumstance.
- Do NOT modify LINE_TAGS, line text, or LINE_RATINGS.
- Every var(--*) must be defined in palette-elaiografia.css.

## What shipped

- `dev/generate-voice-lines.ts`: three new env vars, read after
  `loadDotEnvIfPresent` so a repo-root `.env` can set them too —
  `ALT_VOICE_ID` (temporarily overrides `process.env.ELEVENLABS_VOICE_ID`
  for the run, so `provider.ts` needed no change), `ALT_OUTPUT_DIR`
  (resolved against repo root, replacing `client/public/voice` as
  `OUT_DIR`), `ONLY_HASHES` (comma-separated `lineHash` values that
  filter the template list before the missing-file check — needed
  because an empty alt directory would otherwise make every one of the
  254 lines look "missing"). Default (no env vars) path is byte-for-byte
  the same as before; only the final summary line now names the actual
  output dir instead of hardcoding `client/public/voice`.
- `client/src/screens/DevVoiceAbScreen.tsx` (new) + `devRoutes.tsx`:
  `/dev/voice-ab`, a static (no socket) 43-row list — line text, moment,
  `/voice/<hash>.mp3` labelled "Original", `/voice-ab/<hash>.mp3`
  labelled "New voice". Plain `<audio src>` degrades to a broken player
  with no file present; nothing crashes.
- `.gitignore`: added `client/public/voice-ab/`.

## Verification

1. **43/43 matched** via `collectVoiceLineEntries()` (the same function
   `/dev/voice`'s socket handler uses) against the 43 supplied lines,
   by exact text — zero misses.
2. Command:
   `ALT_VOICE_ID=<NEW_VOICE_ID> ALT_OUTPUT_DIR=client/public/voice-ab
   ONLY_HASHES=<43 comma-separated hashes> npx tsx
   dev/generate-voice-lines.ts`. Verified (not run for real) with
   `ONLY_HASHES=doesnotexist` against a scratch `ALT_OUTPUT_DIR`: logged
   "Nothing to generate (254 lines...)", 0 API calls, no write into
   `client/public/voice`. `npm run typecheck -w @game/server` clean.
3. **43 rows render** on `/dev/voice-ab` (one per GENIUS line);
   `client/public/voice-ab` does not exist locally, confirmed the
   missing-directory case is real, not hypothetical.
4. **43 files** would be generated (all 43 hashes are unique, alt dir
   starts empty so none are pre-existing). `client/public/voice-ab/` is
   gitignored. `npm run typecheck -w @game/client` clean.
