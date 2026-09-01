# tasks/130-pause-target.md

PauseControl's tap target is 328x39px — below the 44px floor. It was
outside task 119's measured set (that criterion covered the settings
panel only; PauseControl renders only mid-game).

## Acceptance criteria — report each SEPARATELY

1. PauseControl's interactive bounding box is >= 44px tall at 360px
   width, via hit-area (padding/min-height on the interactive
   element), NOT by growing the visual — the task-122 wrapper pattern.
   Report before/after bounding boxes.

2. No layout shift below it: report the y-position of the element
   underneath PauseControl before and after, at 360x740, in a
   mid-game phase.

## Report

Under 5 lines.

## Result

1. `styles.pauseButton` (ControllerScreen.tsx) got `minHeight: '2.75rem'`
   (44px) plus `display: 'flex', alignItems: 'center', justifyContent:
   'center'` to keep the label centered in the taller box — padding and
   font-size untouched, so the pill's visual weight is unchanged, just
   taller. Measured via a real Playwright phone page (VIP, 360x740, QUESTION
   phase, 3 bot players) against a throwaway server+client pair:
   before `{"x":16,"y":647.8125,"width":328,"height":39.1875}`, after
   `{"x":16,"y":643,"width":328,"height":44}`.

2. Element underneath is `ResetToLobbyControl` (VIP-only, same
   `questionFooter` flex column). Its y-position: **695 before, 695
   after** — identical. `answerGrid` above (flex:1, minHeight:0) is the
   column's only flexible child, so it absorbed PauseControl's ~4.8px
   growth and questionFooter's start point shifted up by the same
   amount PauseControl grew — net zero shift for anything below it.
