# 169 — The drawing screen fits a 360×640 phone

/play in DRAW overflows by 84px at 360×640 (found in 165, pre-existing).
The canvas plus the two-row toolbar plus the header exceed the
viewport. The canvas must size itself to what remains.

Rules: phone only, DrawingCanvas and its DRAW view. The canvas stays
square. The export keeps 512px WebP with the baked PAPER background —
the on-screen size is display only. 44px targets stay; no motion. Do
not touch the server or /host. Do not call ElevenLabs.

1. Canvas side = min(available width, available height) where
   available height = viewport − header − toolbar − the 13s time
   display, computed from layout (flex / dvh), not a hard-coded pixel.
   Report scrollHeight − innerHeight in DRAW at 360×640, 360×780 and
   412×915 (all must be 0) and the canvas side in px at each.
2. Toolbar: every control still ≥ 44px at 360 wide; report the smallest.
3. Draw one stroke via Playwright at 360×640 and submit: report the
   exported image dimensions (512×512) and that the stroke is present
   (non-PAPER pixel count > 0). Typecheck clean; commit as task 169
   and push.

Sonnet. Playwright only for the measurements. Report each criterion
separately, under 6 lines total.
