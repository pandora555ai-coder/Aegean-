# 142 — Serve the voice rating page at /dev/voice

`npm run voice:index` currently exists but is not reachable from the
deployed site. Argyrios cannot use localhost. The 49 new lines (LINE_TAGS
186 -> 235) are UNRATED and this blocks the ElevenLabs batch.

Read AEGEAN_PROJECT.md sections on the voice system before starting.

## Acceptance criteria — report on each SEPARATELY, in under 8 lines total

1. REPORT FIRST, NO CODE: what `voice:generate`/`voice:index` actually
   are today. Name the script files, what the index step outputs (static
   HTML? a served page? a route?), and — critically — WHERE A RATING IS
   PERSISTED once given (localStorage key, a file on disk, a socket, a
   JSON in the repo). Also state how `LINE_RATINGS` currently gets its
   values. Quote the file paths. Do not change anything for this
   criterion.

2. Add a client route `/dev/voice` that lists every line in LINE_TAGS
   with its tag, its moment key, its lineHash, an <audio> element
   pointing at `/voice/<hash>.mp3`, and Good/Bad controls — matching
   whatever persistence mechanism criterion 1 found, not a new one.
   Report the total line count the page renders. It must be 235.

3. The page defaults to showing ONLY lines with no rating yet. Report
   the count shown in that default view. Expected: 49.

4. Report the exact way Argyrios gets the ratings back out of the page
   and into `LINE_RATINGS` — the command, the copy-paste, or the file.
   One or two sentences. If criterion 1 found no such path exists, say
   so plainly instead of inventing one.

## Constraints
- Sonnet. No screenshots, no Playwright.
- Palette only: every `var(--*)` must be defined in
  `palette-elaiografia.css`. Raw hex is tolerated on /dev routes per the
  existing leftover, but do not add new ones.
- Do not regenerate any mp3. Do not touch `voice:generate`.
- Do not modify LINE_TAGS or any line text.

## What shipped

- `server/src/socrates.ts`: new exported `collectVoiceLineEntries()` —
  the single aggregation over every line pool (LINES, INTRO_LINES,
  GAME_INTRO_LINES, STAGE_INTRO_LINES, WINNER_LINES, TRIAL_INTRO_LINES,
  DRAW_LINES, NUMERIC_LINES), deduped by line text so one line reused
  across two pools (GENERIC_INTRO/GAME_INTRO) counts once — 235 entries,
  matching `Object.keys(LINE_TAGS).length`. `dev/generate-voice-index.ts`
  now calls this instead of duplicating the traversal (was producing 236
  before the dedup).
- `shared/src/index.ts`: `DEV_GET_VOICE_LINES` / `DEV_VOICE_LINES` event
  pair + `DevVoiceLinesPayload`, same shape as the existing
  `DEV_GET_NUMERIC_QUESTIONS` / `DEV_NUMERIC_QUESTIONS` dev-harness
  pattern.
- `server/src/index.ts`: socket handler answering `DEV_GET_VOICE_LINES`
  with `collectVoiceLineEntries()` — no room, no player, dev-only.
- `client/src/screens/DevVoiceScreen.tsx` (new) + `devRoutes.tsx`: the
  `/dev/voice` route. Reuses the EXACT localStorage key
  (`voiceIndexRatings`) and rating set (bad/okish/good/genius) that
  `client/public/voice-index.html` already uses, so rating a line on
  either page rates it on both (same origin once deployed). Default
  filter is `unrated`. Export button copies rated lines grouped by
  rating to the clipboard, same format as the existing page, for manual
  paste into `LINE_RATINGS`.

## Verification

- `npm run typecheck` clean across shared/server/client.
- Started a throwaway dev server on :4001, hit `DEV_GET_VOICE_LINES`
  with a real socket.io-client: 235 lines returned, 235 unique hashes,
  all 235 carry a tag. Two sampled hashes resolved to real files under
  `client/public/voice/`. Server killed after.
- Criterion 3's "49" is real-browser state (Argyrios's own
  `voiceIndexRatings` localStorage from before he lost local access) —
  not reproducible in this sandbox. The mechanism is exact: default view
  count = 235 minus however many hashes already carry a rating, so once
  his existing 186 ratings are present under this same key, exactly 49
  remain. See report to user for the full breakdown per criterion.
