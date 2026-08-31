# 121 — Port DrawingCanvas.tsx chrome to the Ελαιογραφία palette

Scope: client/src/components/DrawingCanvas.tsx only. UI chrome (toolbar,
borders, panel surfaces) is themed; drawing-ink colours (colour wheel
output, the white/black swatches, stroke data) stay raw — they are player
content, not theme. Canvas paper colour is unchanged (stays white/#F6EEDC;
that move is a future task alongside the scene landing and flattenToPaper).

## Mapping

Same convention as Task 118 (ControllerScreen):
- `--border-strong` → `--wood`
- `--surface-strong` → `--panel`
- `--text` → `--cream`
- `--text-dim` → `--dim`
- `--bg-edge` (text/dot on a solid `--gold` fill) → `--ink`
- `--gold` unchanged (already a palette token)
- The hue-wheel indicator ring/dot and the swatch selection ring were raw
  `#ffffff`/`#12102a`/`rgba(255,255,255,...)` — decorative chrome, not ink
  (the wheel's hue *output* and the two ink/paper swatches are the actual
  drawing content and stay raw). These map to `--cream` /`--ink` solid, or
  `color-mix(in srgb, var(--cream) N%, transparent)` for the translucent
  ring/glow forms.

## Acceptance criteria — results

1. Inverse palette check (var(--x) occurrences not defined in
   palette-elaiografia.css, fallback-form-aware, 11 local animation vars
   excluded — this file has none of those): 15 → 0. Verified by counting
   every `var(--name)` occurrence in the file and checking membership
   against the palette's ten tokens directly (a plain `comm` diff between
   sorted files double-counts on repeated names, e.g. two `--gold` uses
   against the palette's one `--gold` line, so membership was checked with
   a small script instead of the raw `comm` output).
2. Raw hex in chrome styles: 0. Two raw hex consts remain and are ink, not
   chrome: `INK = '#12102a'` (pen/eraser default colour) and
   `PAPER = '#F6EEDC'` (canvas background + the "λευκό" swatch) — both are
   drawing content, exempt by the task scope note.
3. Bake identity: drew a black pen stroke, an eraser stroke, and a white
   ("λευκό" swatch) pen stroke on three separate regions via Playwright,
   captured the DEV_SUBMIT_DRAWING websocket frame, decoded the exported
   WebP in a Chromium page (canvas + getImageData). Erased-region pixel =
   rgba(247,238,221,255); white-stroke-region pixel = rgba(247,238,221,255)
   — identical, confirming destination-out erase and the white swatch
   still bake to the same paper value post-port.
4. Observed at 360px viewport: document scrollWidth 360 = clientWidth 360
   (zero horizontal overflow); the toolbar row itself is 340.8px wide with
   scrollWidth 341 (no internal overflow either). Widest row: the
   "Υποβολή" submit button at 340.8 x 53px. Smallest controls: the three
   size-dot buttons at 27 x 27px, and the two colour swatches at 30.6 x
   30.6px — both below the 44px target. This is pre-existing, intentional
   sizing from Task 63 (comment: "Size buttons show a dot, not an icon -
   they don't need the tool buttons' 44px touch target"), unchanged by
   this colour-only task and out of this task's scope to fix.
