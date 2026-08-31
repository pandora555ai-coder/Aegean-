# 118 — Port ControllerScreen.tsx to the Ελαιογραφία palette

Scope: client/src/screens/ControllerScreen.tsx only. AnswerShape,
DrawingCanvas and other files are later tasks.

## Mapping

- `--bg` → `--deep`, `--surface`/`--surface-strong` → `--panel`,
  `--border`/`--border-strong` → `--wood`, `--text` → `--cream`,
  `--text-dim`/`--text-faint` → `--dim` (both former tiers collapse to the
  one muted-on-dark-ground reading, same as the TV's hostStyles.ts).
- Text on a solid `--gold` fill (button, vipBadge, segmentActive) →
  `var(--ink)`, matching how the TV already uses `--ink` for text on its
  light papyrus/gold surfaces.
- The purple `#7c3aed` power-up/sabotage accent border → `var(--wood)`.
- The palette has no red/danger token. The reset-to-lobby confirm
  (destructive, previously `--danger`/`--danger-text`/`--danger-strong`
  plus a raw `#ef4444`) now reads as a heavier `--wood` fill/border
  instead of a hue — extending the same "no colour encodes state" rule
  the correctness sites already follow, since the palette gives this
  screen no other way to say "serious" without inventing an off-palette
  colour.
- Correctness (`revealCorrect`/`revealWrong`, feeding the quiz reveal,
  guess-reveal and numeric-reveal verdicts) dropped `--success`/
  `--danger-text` for one shared `--cream`, split only by opacity/weight:
  new `WRONG_OPACITY = 0.42` constant mirrors host/RevealView.tsx's own.

## Acceptance criteria — results

1. Inverse palette check (fallback-form-aware, animation vars excluded):
   87 → 0.
2. Raw hex: 7 → 0 (`#14161c`×3, `#7c3aed`×3, `#ef4444`×1).
3. Correctness sites converted to opacity/weight, all three call sites:
   quiz reveal (ControllerScreen.tsx:~1246), guess-reveal (~1318),
   numeric-reveal (~1441) — all route through the shared
   `revealCorrect`/`revealWrong` styles.
4. 360px Playwright (localhost:5173, join flow + lobby settings panel,
   2 players): widest element overflows to 366px (6px past the 360px
   viewport, inside `settings-panel`'s segmented-control row); smallest
   tap target is `setting-mode-quiz` at 62.1×31.8px, under the 44px
   floor. **Both confirmed pre-existing**: stashed the palette change,
   re-measured the same two elements on the unmodified file, got the
   identical numbers (366.1875px / 62.140625×31.78125px) — this task
   only changed colour, not layout, and did not introduce or fix either
   issue.
