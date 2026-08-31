# 117 — CLAUDE.md corrections (6 edits, no code changes)

Six claims in CLAUDE.md had gone stale. Each was verified against the repo
before the doc was rewritten; nothing outside CLAUDE.md was touched.

| # | section | old claim | verified truth |
| --- | --- | --- | --- |
| 1 | Colour — traps | "`--tv-safe-bottom: 5vh` still lives in theme.css. Move it to the palette" | Both `--tv-safe-top` and `--tv-safe-bottom` are already in palette-elaiografia.css:30-31. theme.css:47 is only a comment recording the move. Folded into the `--gold` trap: the double definition of `--gold`, not the safe area, is what keeps theme.css alive. |
| 2 | TV layout | "`--tv-safe-bottom` is the single knob" | Two knobs, `--tv-safe-top` and `--tv-safe-bottom`, both in the palette. |
| 3 | TV layout — score column | "900ms-settle-then-400ms-glide" | `REORDER_DELAY_MS = DEFAULT_DURATION_MS = 1800` (PlayerScoresPanel.tsx:29, useAnimatedNumber.ts:9) and `GLIDE_MS = 400` (PlayerScoresPanel.tsx:30) → **1800ms + 400ms**, doubled in task 112. |
| 4 | Core rules — audio | silent on cue status | No `CUES_ENABLED` exists anywhere in client/server/shared (zero hits). The cues in client/src/hooks/useGameAudio.ts are LIVE, gated only by the host mute toggle — every `play*` function checks `mutedRef` itself. They retire only when the crowd subsystem plays. `answer:progress` STAYS: ServerEvents.ANSWER_PROGRESS (shared/src/index.ts:55) drives `playAnswerBlip` at HostScreen.tsx:341. |
| 5 | Colour — inverse check | inversion reported local animation vars as violations | Eleven local inline animation vars are set by components on themselves and are not palette tokens: `--i --delay --w --h --spin --drift --duration --iterations --fx --fy --glow-color`. All eleven are live in client/src/theme.css. Added as an explicit exclusion. |
| 6 | new "Phone layout" section | 690px read as a global rule | 690px is TV-only. Phone criteria: 44px minimum tap targets, zero horizontal overflow at 360px wide. |

## Note on the verification of #5

The eleven vars are written `var(--x, default)`, with a fallback. A grep for
`var\(--i\)` — closing paren immediately after the name — finds ZERO of them
and reads as "these do not exist". The grep that works matches the comma too:
`grep -aroE "var\(--$v[,)]" client/src`. Counted that way: `--glow-color` 4
uses, `--delay` 2, the other nine 1 each, all in client/src/theme.css.

Also: `client/dist/` contains a built copy of theme.css, so an unscoped grep
double-reports every one of these. Scope repo greps to `client/src`.
