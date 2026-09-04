# 159b — Phase screenshots for human review

The palette was swapped in 159. Argyrios needs to see every /host
phase with the new tokens before the port continues. The existing
screenshot harness (npm run screenshot:phases, bots on port 3901, one
PNG per phase anchored to data-testid) already does this; it only
needs to write where the browser can reach it.

Rules: do not touch the server, TheatreScene, the palette, or any
phase view. Do not call ElevenLabs.

1. The harness writes to client/public/dev-shots/ (add dev-shots/ to
   .gitignore with a trailing slash — real directory, not a symlink),
   one PNG per phase named <PHASE>.png at 1280x720 with BOT_COUNT=5,
   plus a generated dev-shots/index.html that shows all PNGs in phase
   order with the phase name above each, dark background, one column,
   no CSS framework. If the harness had another output dir, keep it
   working via an env var; default becomes dev-shots. Report the PNG
   count (must be 15, list any missing phase) and total size in MB.
2. Do NOT open, view, describe or analyse the PNGs. Report only: the
   URL path where index.html will be served after deploy, and the
   changed-file list (harness script, .gitignore, nothing else).

Sonnet. No Playwright outside the harness itself. Report each
criterion separately, under 6 lines total.
