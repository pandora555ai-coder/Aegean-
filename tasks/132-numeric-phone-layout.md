# Task 132 — /play numeric: phone layout audit and fix

Model: Sonnet.

The numeric phone view (slider + number input, task 66) is the ONLY
`/play` view that never went through the phone criteria. It is
palette-clean (whole-tree inverse check, 123) but it has never been
MEASURED. Tasks 118-122 covered ControllerScreen, the answer grid and
the drawing toolbar; task 130 found PauseControl had been outside
119's measured set. Do not repeat that: name the set you measured.

Phone criteria are NOT the 690px TV rule. They are:
- every interactive element's BOUNDING BOX at least 44x44 (hit area,
  not visual size)
- zero horizontal overflow at 360px width

## How to observe

Playwright against **localhost:5173 and localhost:4001 only**. Never
the production URL. No screenshots — report numbers in words.

Viewports: **360x740 and 360x640**, both.

Get into the numeric view the same way task 120 got into QUESTION:
a real room in numeric mode with bots, phone client joined.

## THE TRAP — read before criterion 2

`getBoundingClientRect()` on `<input type="range">` returns the TRACK,
which is full-width and will look like a pass. **The thumb is what the
finger hits and it is a pseudo-element with no bounding box.** A
range input whose track measures 328x40 can have a 16px thumb.

Read the thumb instead with:

    getComputedStyle(el, '::-webkit-slider-thumb').width  / .height

If those come back empty or `auto`, say so and report the browser
default rather than reporting a pass.

## Acceptance criteria

Report on EACH one separately, with numbers. Under 8 lines total.

1. **Inventory and measure.** List EVERY interactive element in the
   numeric phone view — slider, number input, submit/lock-in control,
   and anything else that takes a tap. For each: data-testid (add one
   if missing) and bounding box at 360x740 and at 360x640. State the
   full list you measured, so the next task knows what was covered.

2. **Slider thumb.** Report the thumb's computed width and height per
   the method above, NOT the track's bounding box. State which of the
   two you are reporting.

3. **Fix everything under 44.** Use min-height or invisible 44px
   hit-area WRAPPERS around unchanged visuals, the task-122 pattern.
   No visual redesign, no palette changes, no new vars. Re-measure and
   report the before and after number for each element you touched.
   If nothing was under 44, report the SMALLEST element and its size.

4. **Zero horizontal overflow at 360.** Report the widest element and
   its width at both heights. If any element exceeds 360, fix it and
   report the before and after. A bare "passes" is not a report.

## Out of scope

The layout rule (papyrus/score column) is a TV rule. The 690px height
criterion is a TV criterion. Neither applies here. Do not touch the
numeric scoring, the 2.5x max derivation, or the 20s timer — those are
open playtest questions, not layout.
