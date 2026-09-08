# Task 199 — Climb slab: height ceiling so long questions never clip

## Root cause

`ClimbQuestionView`'s wrap (`SLAB_WRAP_STYLE`) had `left`/`top`/`width` but
no `height` — an auto-height box. `useFitFontSize` shrinks text by
comparing `text.scrollHeight` against `container.clientHeight`, but an
auto-height container's `clientHeight` always equals its content's own
height, so the shrink loop's condition (`scrollHeight > clientHeight`)
never fired — the font sat at `maxRem` regardless of question length.
With the longest question in the bank (100 chars) this pushed the slab's
`MarbleSlab` to 1051px, well past the 720px TV canvas (Task 198, criterion
2). `TrialQuestionView` never hits this: it sits inside `GameLayout`, whose
outer column has a real `height: READ_AREA_HEIGHT`, and its `MarbleSlab`
takes `flex: '1 1 0'` to fill the remainder under the category label — a
genuine, bounded `clientHeight` for the hook to shrink against.

## Fix

Same pattern, applied locally since the climb bypasses `GameLayout`
entirely:
- `SLAB_WRAP_STYLE` gains `height: '42vh'`, `display: 'flex'`,
  `flexDirection: 'column'` — a determinate-height flex column, category
  label on top, slab filling the rest.
- `MarbleSlab` gets `style={{ flex: '1 1 0' }}` (was unstyled) so it fills
  that remainder rather than sizing to its content.
- `questionBlock`'s inline `minHeight: '10rem'` override is dropped back to
  the base `styles.questionBlock` (`flex: '1 1 0', minHeight: 0,
  overflow: 'hidden'`) — the override was fighting the exact
  flex-shrink-to-fit shape `useFitFontSize` needs; `TrialQuestionView`
  never applied it either.

No change to the Task 198 z-order fix (`zIndex: 3` untouched), Frame B, or
any animation.

## Verification

Same throwaway-server-plus-Playwright harness as Task 198 (scratch ports,
temporary `FORCE_CLIMB_QUESTION_ID` dev hook in `questions.ts`, reverted
before commit — `git diff` at commit time touches only
`ClimbQuestionView.tsx`), driving a `quiz`/`short`/`finaleMode: 'climb'`
game to CLIMB_QUESTION.

**Criterion 1** (longest question, `q0427`, 100 chars): the Task 198 5×3
grid probe — **15/15** resolved to the slab, all on-canvas (slab bbox:
top 96.8, height 270.4, bottom 367.2 — well inside the 720px canvas).

**Criterion 2** (shortest question, `q0175`, "Τι σημαίνει URL;", 16
chars) vs. longest: rendered slab height is **identical, 270.4px, for
both** — `flex: '1 1 0'` makes the slab always fill its allotted 42vh
region regardless of content, so there's no collapsed box for a short
question and no overgrown one for a long one; only the *font size* (via
the existing `useFitFontSize` shrink) varies with content length. Both
sit fully within the allotted region.

**Criterion 3** (longest question): slab bottom edge **367.2px** <
canvas height **720px**, and **367.2px** < topmost `AnavasisClimbers`
figure's own top edge, measured at **394.6px** in this run (climb entry,
2 players) — the slab ends 27.4px above where the climbers begin, with
margin to spare.
