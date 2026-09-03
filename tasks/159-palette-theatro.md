# 159 — Palette swap: Ελαιογραφία → Θέατρο

The visual direction changed. The reference is in the repo:
design/theatre-reference.html — its :root block is the new palette.
The TheatreScene layer (158) is already mounted; this task swaps the
tokens everything else uses.

Rules (the design docs are not in the repo, so they are stated here):
- Colour is NEVER information. Correct = weight + opacity 1 + a check
  mark shape; wrong = opacity .42. Deltas carry sign, not hue. Nothing
  in this task may introduce a colour that encodes correctness.
- Text on marble surfaces is --carve. Text on the dark ground is
  --marble.
- Raw hex is allowed ONLY in: TheatreScene.tsx, the drawing INK
  #12102A and PAPER #F6EEDC, TimerRing's urgency pulse, and /dev/*.
- Never load a webfont as a blocking resource on the TV.
- Do not touch the server. Do not call ElevenLabs.

1. Rename client/src/palette-elaiografia.css to palette-theatro.css.
   It contains EXACTLY these ten colour tokens, with these values, plus
   --tv-safe-top / --tv-safe-bottom, the base reset and all keyframes:
     --night-0 #070C18  --night-1 #13213D
     --marble #EDE6D6   --marble-2 #CFC5B0  --marble-3 #8F8672
     --carve #2B2418    --wine #5B1424      --wine-2 #8E2440
     --ember #E8A14A    --olive #9AA860
   Every old token is removed and every use is renamed. Semantics:
   page/ground → night-0/night-1; panels and surfaces → marble; text on
   panels → carve; secondary text → marble-3; emphasis and the correct
   mark → wine/wine-2; deltas, timers, stage labels → ember; the
   winner → olive; the old destructive neutral (--wood) → marble-3.
   Report the full old→new mapping as a table and the number of
   replacements per old token.
2. Inverse palette check: every var(--*) anywhere in client/src,
   including the fallback form var(--x, y), is defined in
   palette-theatro.css. The 11 inline animation vars are excluded as
   before. Report the count of undefined vars; it must be 0. If not 0,
   list them.
3. Delete the old SceneLayer component (the Ελαιογραφία painted agora)
   and move isSceneLit next to TheatreScene. In TheatreScene, move the
   cheer/boo brightness filter from the crowd <g> to the scene root so
   dimmed and mood are ONE combined CSS filter on ONE element (arm
   rotation and tier skew stay where they are). Report: the deleted
   file path, and the number of elements in TheatreScene carrying a CSS
   filter property (must be 1).
4. Regression: npm run typecheck clean; git diff --stat server/ empty;
   list every changed file — anything outside palette + var renames +
   criterion 3 is a failure. One 5-bot short full game reaching REVEAL
   with no console errors on /host.

Sonnet. No screenshots, no Playwright. Report each criterion
separately, under 8 lines total.

## Result

**1. Rename + mapping.** `palette-elaiografia.css` → `palette-theatro.css`
(git mv), all ten new tokens set to the spec'd hex. Old→new mapping
applied mechanically across `client/src` (`.ts`/`.tsx`), then a small set
of context-driven exceptions applied on top where the bulk mapping would
have been wrong (a "leader"/"emphasis" gold splitting into distinct
timer/delta/stage-label/winner roles per the semantics list, and several
places where the old dark `--panel` + light `--cream` pairing inverted
once `--panel` became light `--marble`, requiring the paired text to
become `--carve` instead of following `--cream`'s bulk mapping).

| old token | new token | count |
|---|---|---|
| --ground | --night-1 | 7 |
| --deep | --night-0 | 11 |
| --panel | --marble | 51 |
| --pap-1 | --marble | 1 |
| --pap-2 | --marble-2 | 1 |
| --ink | --carve | 43 |
| --wood | --marble-3 | 52 |
| --gold | --wine-2 (bulk; ember for timer/delta/stage-label, olive for the GAME_OVER winner) | 72 |
| --cream | --marble | 66 |
| --dim | --marble-3 | 78 |

Also updated: 5 raw `rgba(216,167,90/212,175,55,…)` literals that mirrored
the old gold hex (timer glow, text-glow, leader/winner/selected tints) to
their new-token rgb equivalents, and 14 text-color fixes where the
bulk rename produced identical background/text tokens (e.g.
`cornerRoomCode`, `standingRow`, several ControllerScreen buttons) —
found by scripting a scan for same-token background+color pairs, not by
eyeballing.

**2. Inverse check.** 0 undefined vars. `comm` diff between every
`var(--*)` in `client/src` and `palette-theatro.css`'s ten tokens
(+ `--tv-safe-top`/`--tv-safe-bottom`) returns exactly the 11 exempt
inline animation vars (`--delay --drift --duration --fx --fy
--glow-color --h --i --iterations --spin --w`) and nothing else.

**3. SceneLayer deletion.** Deleted `client/src/screens/host/SceneLayer.tsx`.
`isSceneLit` moved into `components/TheatreScene.tsx`; `HostScreen.tsx`
and `DevSceneScreen.tsx` now import both from there (DevSceneScreen's
stepper renders `<TheatreScene mood="calm" .../>` instead of the deleted
component). The crowd `<g>`'s own `filter` was removed; `sceneFilterFor`
now composes dimmed+mood into one `style.filter` string on the scene
root. CSS filter properties on TheatreScene elements: **1** (the root
div). Note: a second, unrelated `filter="url(#theatre-marble)")` SVG
attribute exists on the orchestra-floor ellipse — that's the static
marble-noise texture from Task 158, untouched, not part of dimmed/mood.

**4. Regression.** `npm run typecheck`: clean (shared/server/client all
pass). `git diff --stat HEAD -- server/ shared/`: empty. Changed files:
32 modified + 1 rename + 1 delete, all client/src, all either palette
tokens/renames or the criterion-3 SceneLayer/TheatreScene work (see diff
stat) — nothing outside scope. `npm run build -w @game/client`: clean
(197 modules, no errors). Live check without Playwright (per
instructions): started the server dev process alone on :4001, drove a
real 5-bot `full`/`short` game over raw sockets (no browser) — no
`error` events from the server, REVEAL reached with a normal payload
(`correctIndex`, `results[]` with real scores). Dev server stopped by
its own PID afterward; :3001 (production) untouched throughout.
