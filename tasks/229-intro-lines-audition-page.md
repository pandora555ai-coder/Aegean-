# Task 229 — a dev page to audition the intro lines

A dev-only page, `/dev/intro-lines`, that plays back the ten Task 228
game-intro lines in order for a human to review. Wires nothing into any
phase, pool, or registry — listening only, same as `/dev/voice-ab`.

Task 228 itself left no committed report or code: its ten lines exist only
as a one-off scratch generator (never committed) that wrote their mp3s
straight into the voice bank under the standard `lineHash(text, null).mp3`
convention. Ten root-owned files with matching timestamps were found in
the bank; their hashes were confirmed against the recovered generator
script's exact line text, and that `{n, text, hash}` list is hardcoded
into `DevIntroLinesScreen.tsx` since nothing else registers these lines.

## What's here

- `client/src/screens/DevIntroLinesScreen.tsx` (new) — one row per line
  (number, Greek text, native `<audio>` player, its own duration read off
  `loadedmetadata`), a running total duration at the top, and a "play all
  in sequence" control with a settable gap (default 0.8s) that awaits each
  clip's `ended` event before starting the next.
- `client/src/devRoutes.tsx` — registered the new route; this is the only
  list `/dev`'s index and `App.tsx`'s routes are both built from, so the
  page is linked from `/dev` automatically and reachable nowhere else.

## Verified (Playwright, localhost:5173, dev server on 4001)

- All ten filenames resolve and load (durations 2.1s–11.8s each); page-
  displayed total: 66.6s across 10/10 clips, zero console errors.
- "Play all" ran 1→10 in strict order at the default 0.8s gap; observed
  end-to-end time 75.7s (66.6s of audio + 9×0.8s gaps ≈ 73.8s expected,
  the remainder is headless-audio scheduling overhead).
- Inverse: no reference to `intro-lines` in `LandingScreen.tsx`,
  `HostScreen.tsx`, or `ControllerScreen.tsx` — unreachable outside `/dev`.
  Voice bank file count unchanged at 271; nothing but this page and the
  route registration touched.
- `/dev*` sits behind Caddy's existing `basic_auth` (`deploy/Caddyfile`'s
  `@protected` path matcher), same as every other dev page — not
  re-verified live since that's production-only and out of scope here.
