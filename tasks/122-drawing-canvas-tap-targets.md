# Task 122 — DrawingCanvas toolbar: 44px tap targets at 360px

Pre-existing (measured in 121): size dots 27×27, swatches 30.6×30.6.
Constraint: the task-63 single-row VISUAL layout is good — prefer
enlarging the HIT AREA (padding, or a wrapper with negative margin)
over enlarging the visible control. Two rows only if hit-area
enlargement cannot reach 44px without overlapping neighbours.

## Why two rows

9 interactive controls (2 swatches + wheel + 3 tools + 3 sizes) at a
44px floor is 396px minimum before any gaps — more than a 360px
viewport can hold in one row without overlap. Split into a colour row
(swatches + wheel) and an action row (tools + sizes); each control's
hit area grew via a wrapper around an unchanged-size visible control
(swatch circle, wheel gradient, size dot), not by enlarging what's
drawn.

## Results (measured at 360×800 via Playwright, /dev/draw)

1. Every toolbar control's hit box: 44×44px exactly (all 9 controls —
   2 swatches, wheel, 3 tool buttons, 3 size buttons).
2. docWidth == viewportWidth == 360 (zero horizontal overflow).
   Smallest gap between adjacent hit boxes: 2px (positive, no overlap).
3. A stroke drawn via Playwright pointer events across the canvas
   center: 100/100 sampled pixels came back non-paper-colour — the
   stroke landed on the canvas, not a toolbar hit area.
4. Inverse palette check (`comm -23` of `var(--x)` usages in
   DrawingCanvas.tsx against palette-elaiografia.css tokens): 0.
