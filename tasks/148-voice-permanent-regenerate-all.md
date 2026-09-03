# 148 — Make the new voice permanent, regenerate all 254 lines safely

The new ElevenLabs voice was A/B'd on the 43 GENIUS lines (147) and
accepted. All 254 lines are to be regenerated with it.

## Acceptance criteria — report on each SEPARATELY

1. `dev/generate-voice-lines.ts` (after `loadDotEnvIfPresent`, before
   `OUT_DIR`): `process.env.ELEVENLABS_VOICE_ID ??= 'NOpBlnGInO9m6vDvFkFC'`
   — only fills in when nothing already set it, so shell env / `.env`
   still fully override it. Restore the old voice by setting
   `ELEVENLABS_VOICE_ID=gFpOFEriJA3T1VbGi2Be` in the environment or
   `.env` (both the code comment and `.env` itself now document the old
   ID). `.env` (gitignored, local-only) was also updated to the new ID
   so the new voice is the real default for local runs, not just a
   dormant fallback. Verified: with `ELEVENLABS_VOICE_ID` unset in both
   shell and a temporarily-moved-aside `.env`, the script ran past its
   "Set ELEVENLABS_API_KEY..." guard using only a fake API key/model —
   proving the fallback fired.

2. Staging write reuses task 147's `ALT_OUTPUT_DIR` — an empty staging
   dir makes every line look "missing" with no code change needed, so
   the incremental skip logic is bypassed for free. Command:
   `ALT_OUTPUT_DIR=client/public/voice-staging npx tsx dev/generate-voice-lines.ts`
   Verified (not run for real) with `ONLY_HASHES=doesnotexist` layered
   on top: "Nothing to generate (254 lines...)", 0 API calls, confirming
   254 total lines and that no file lands in `client/public/voice`.
   `client/public/voice-staging/` added to `.gitignore`.

3. New script `dev/voice/swap-staging.sh`:
   `bash dev/voice/swap-staging.sh` (env-overridable `STAGING_DIR`,
   `LIVE_DIR`, `EXPECTED_COUNT`, default 254). Count check:
   `COUNT=$(find "$STAGING_DIR" -maxdepth 1 -name '*.mp3' -type f | wc -l)`,
   refuses (exit 1, copies nothing) unless `COUNT -eq EXPECTED_COUNT`;
   also refuses if `STAGING_DIR` doesn't exist. On a pass it
   `cp`s `*.mp3` from staging into `client/public/voice`. Tested against
   scratch directories (never the real staging/live paths): 5-file
   staging against `EXPECTED_COUNT=254` refused and copied nothing;
   the same 5 files against `EXPECTED_COUNT=5` copied cleanly; a missing
   staging dir refused. Script was not run against real paths.

4. Old audio survives untouched: `client/public/voice` (235 files) and
   `client/public/voice-ab` (43 files, the 147 A/B evidence) are
   unmodified — nothing in this task writes, copies, or deletes there.
   Backups already exist in `~` (`voice-backup*.tar.gz`,
   `socrates-voice-backup.tar.gz`); this task adds no new backup, since
   the swap command in (3) is a `cp` (additive/overwrite by filename),
   never a delete, and is never invoked here. Restore path if the swap
   ever needs undoing: re-extract the newest `~/voice-backup-*.tar.gz`
   over `client/public/voice`.

## Constraints
- Sonnet. No screenshots, no Playwright.
- Did NOT call ElevenLabs. Did NOT run any generation or any swap
  against real paths.
- `client/public/voice-ab` left untouched.
- `LINE_TAGS`, line text, `LINE_RATINGS` untouched.

## What shipped

- `dev/generate-voice-lines.ts`: one-line new default voice ID fallback.
- `.env` (gitignored, local): `ELEVENLABS_VOICE_ID` updated to the new
  voice, old ID left in a comment.
- `dev/voice/swap-staging.sh` (new): count-gated staging→live swap.
- `.gitignore`: added `client/public/voice-staging/`.
