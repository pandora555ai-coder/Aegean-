# 120 — Drop AnswerShape; answers are plain text in a 2×2 grid

Decision: answer options on the phone are a 2-column grid showing ONLY
the answer text — no shapes, no colours, no numbering, no glyphs. The
TV REVEAL already matched this (plain options, correctness = opacity
1 + heavier weight vs opacity 0.42) — nothing to change there.

Scope: client/src/screens/ControllerScreen.tsx, deleting
client/src/components/AnswerShape.tsx.

## Changes

- Deleted `AnswerShape.tsx` and its two call sites' shape+letter markup
  in ControllerScreen.tsx: the quiz QUESTION grid, the drawing-mode
  GUESS grid, and the phone REVEAL screen's verdict/your-choice rows.
- Both option grids (QUESTION, GUESS) dropped `identity.color` entirely.
  Border is now a flat `var(--wood)`; the player's own selection is a
  `var(--gold)` border + `color-mix(in srgb, var(--gold) 12%, var(--panel))`
  background instead of a per-slot hue — added `answerButtonSelected` to
  the stylesheet, removed `answerShapeRow`/`answerLabel` (now unused).
- The phone REVEAL screen's "Η επιλογή σου" line now reads the option
  text straight from the held `question` state (never nulled between
  QUESTION and REVEAL for the question it belongs to) instead of a
  letter; guarded on `question` being present so the rare
  reconnect-mid-REVEAL case (state:sync only restores `reveal`, not
  `question`) just omits the line rather than showing empty text.
- `ANSWER_IDENTITIES` import dropped from ControllerScreen.tsx (still
  used elsewhere — GameOverView's confetti colours — untouched, out of
  scope).

## Acceptance criteria — results

1. `grep -rn "AnswerShape" client/src` → 0 hits. File deleted.
2. `grep` for the four old identity hexes (#ef4444/#3b82f6/#eab308/#22c55e)
   in ControllerScreen.tsx + host/RevealView.tsx → 0 hits.
3. OBSERVED at 360×740 via Playwright (bot VIP + real player, forced
   question q0404, longest bank option "Η ερυθρελάτη ακτής (Sequoia
   sempervirens)", 41 chars): zero horizontal overflow
   (`scrollWidth` == `clientWidth`); all 4 option buttons 152×293px
   (`clientWidth`/`clientHeight`), well over the 44px floor; the long
   option's own `scrollWidth`/`scrollHeight` equal its `clientWidth`/
   `clientHeight` (152×293) — no clipping.
4. Inverse palette check on both touched files: 0 hits.
