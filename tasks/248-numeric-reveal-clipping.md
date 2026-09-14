# Task 248 — Εκτίμηση reveal: question text clipping

One style change (`NumericRevealView.tsx`'s `numlineRootStyle` margins) plus a
new measurement harness. No text was shrunk, no question content was edited,
and the SLIDER screen was not touched.

## Criterion 1 — diagnosis

**What truncates it.** `styles.questionBlock` (hostStyles.ts) is
`flex: 1 1 0; minHeight: 0; overflow: hidden`. Plain overflow clipping — no
`-webkit-line-clamp`, no ellipsis, no fixed height. Nothing signals the loss;
the second line is simply not painted.

**Shrink-to-fit does exist, on both screens.** Both numeric views already call
`useFitFontSize(…, { maxRem: 6, minRem: 2, stepRem: 0.1 })`, which loops
`while ((scrollHeight > clientHeight || scrollWidth > clientWidth) && size >
minRem`. So it shrinks until the **2rem floor** and then stops — and whatever
still overflows is clipped by the rule above. The defect is the floor meeting
a too-short box, not a missing fit mechanism.

**Both screens render the same string**, through the same two styles
(`numeric-question-text` / `numeric-reveal-text`). They differ in the height
they can offer it: the REVEAL slab is `flexDirection: column` and carries the
Numline as well as the question (6cqh lane + 6cqh/4cqh margins ≈ 115px), so
its question block measured **57px** against the SLIDER's **198px**.

**Length distribution** (`NUMERIC_QUESTIONS`, 42 entries): min 26, **median
42**, p90 53, **p95 59**, **max 69** characters. The longest is
_"Στους πόσους βαθμούς Κελσίου βράζει το νερό στο επίπεδο της θάλασσας;"_.

**Measured overflow for that longest question, at 1280x720:**

| screen | font | height (scroll/client) | overflow | verdict |
|---|---|---|---|---|
| SLIDER | 52.8px | 198 / 198 | **0px** | fits |
| REVEAL | **32.0px (2rem FLOOR)** | 80 / 57 | **+23px** | **CLIPPED** |

Width is not involved on either screen (`scrollWidth` 732 vs `clientWidth`
861, i.e. −129px; `questionTextTv` caps itself at `maxWidth: 85%`).

## The fix, and why not the obvious ones

At 32px with `lineHeight: 1.25` a line is 40px, so this question needs two
lines = 80px, against 57px available: it is 23px short. **Shrinking further is
measurably wrong** — two lines inside 57px needs ~1.4rem (22px), which is not
TV-at-couch-distance text, and the task's own warning is borne out by the
arithmetic. **Width is not a lever either**: even at full width this string
wraps to two lines, so the height requirement is unchanged. **Editing the
question is not needed** — one outlier at 69 chars is not a content problem
when the card can hold it. So the 23px must come from height, and the only
slack on this card is the Numline's own margins: every tick label is
ABSOLUTELY positioned, so those margins are clearance, not flow, and trimming
them costs no label any room of its own. `marginTop` 6cqh → 4cqh and
`marginBottom` 4cqh → 2.5cqh returns ~25px.

## Criterion 2 — the longest question now renders fully

| | before | after |
|---|---|---|
| REVEAL height (scroll/client) | **80 / 57** | **80 / 82** |
| overflow | **+23px (clipped)** | **−2px (fits)** |
| final rendered font | **32.0px** | **32.0px** |

The font is byte-identical before and after: the text was not made smaller, it
was given the room it already needed. It still sits at the 2rem floor, so this
question remains the bank's binding case — with 2px of slack, not −23px.

## Criterion 3 — inverse: nothing else shrank or moved

REVEAL, same measurement, before → after:

- **median (40 ch)**: 44/57 (−13px) → 44/82 (−38px); font **35.2px → 35.2px**, unchanged.
- **shortest (26 ch)**: 56/57 (−1px) → 70/82 (−12px); font **44.8px → 56.0px**.

The shortest question's text **grew**, and that is a real change I am not
glossing: `useFitFontSize` now stops later because it has 82px instead of 57px.
Nothing shrank and nothing was cut off; a short question simply gets bigger on
a card that had room for it all along.

**Correct-answer number — unchanged in position and size**, all three rounds:
longest `x=402 y=361 w=297 h=32`, median `x=410 y=361 w=282 h=32`, shortest
`x=417 y=361 w=266 h=32`, identical before and after, font 28px throughout.

**Player rankings — unchanged**: sophist plaques measured identical before and
after, `ΜΑΡΙΑ x=341 y=622 w=86 h=16` and `ΝΙΚΟΣ x=853 y=622 w=86 h=16`.
(The row renders its plaques only once standings have settled, so this pair is
compared within the SAME round in both runs, never across rounds.)

**The numline itself did move, by design**: y 239 → 250 (+11px), and its three
tick labels with it (y 210 → 221, truth 248 → 259) — the question block
absorbing 25px, net of the 14.4px margin trim. Task 242's invariant still
holds, measured rather than assumed: **zero label-vs-label overlaps and zero
label-vs-question-text overlaps**, in every round, in BOTH the before and after
runs.

## Criterion 4 — the slider screen does NOT share the defect

Measured, not assumed. The longest question on the SLIDER screen fits before
and after, identically: **height 198 / 198, overflow 0px, font 52.8px**. Median
168/198 @ 67.2px and shortest 196/198 @ 78.4px, also identical across both
runs — expected, since the change is confined to `NumericRevealView`'s numline
style.

Worth flagging: that 0px is exact. The slider clears the bar with **no slack**,
because the fit hook shrinks to 52.8px — well above its 2rem floor — precisely
to make it land. It is not a defect today (the hook has ~20px of headroom left
before the floor), but this screen is the next one to clip if the bank ever
gains a materially longer question.

## Notes

- No harness name repair was needed: this check joins over raw sockets with
  preset names (Μαρία/Νίκος), so none of the eight pre-241 harnesses was
  involved.
- `dev/242-numeric-check.ts` was read but deliberately not reused: it accepts
  whatever random question `prepareNumericGame` draws, and this task needs a
  CHOSEN question. `dev/248-numeric-clip-check.ts` forces one by re-preparing
  until the wanted text comes up, using only the mode's exported API —
  `numericStateByRoom` is a module-private WeakMap and no production code was
  opened up to make this measurable.
