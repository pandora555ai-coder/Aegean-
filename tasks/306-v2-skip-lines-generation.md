# Task 306 — generate the 43 v2/skip lines (real spend)

Selection: every `collectVoiceLineEntries()` row whose line text appears in
content/speech-policy-lines.md — 43 of 43 matched, 14 pools, none in the bank or
in staging beforehand. Tags used: dry/amused/thoughtful/sighs/warm/serious/deadpan
(all already in use elsewhere; the generator has no tag whitelist).

## Spend (staging, default dir, voice NOpBlnGInO9m6vDvFkFC)
- Dry run: 43 lines, **3736 chars** planned.
- Run 1 (`--max-chars 6000`): 29 landed, then STOPPED — `d65f0ef0064953a4` failed
  the Task 251 tail check 3 times in a row (a tail-check abort, NOT the 287
  budget guard). 13 lines never attempted. Billed 3120 chars.
- Run 2 (resume, same hash list, `--max-chars 2880` so the two runs cannot
  exceed 6000 together): the remaining 14 landed, `d65f` on a fresh attempt 1.
  Billed 1375 chars (planned 1197; `fd9b6ca3293e1170` needed 2 retries).
- **Total billed 4495 chars** vs 3736 planned; 8 wasted attempts (e7fc, 132f,
  de23 x1 each; d65f x3; fd9b x2 = 759 chars). 43/43 landed.

## Tail check (dev/voice/tailCheck.ts, the generator's own test)
0 of 43 fail. Duration 4640–11040 ms (mean 7557). Tail silence (trailing 20 ms
windows under RMS 500): 20 clips 0 ms; three shortest tails 0 ms
(0d4df705, e7fca4c9, 639d1fee — ratio 0.25/0.18/0.14); longest 1140 ms.
Five clips have ratio >= 0.6 yet PASS on the MIN_RMS clause (quiet tail):
7a422ef9 (1.00), 268d8e83 (1.00), 76476b74 (1.00), e452ddbf (0.96),
cbfac507 (0.60) — worth an ear when auditioning.

## Audible for Argyrios
- audition-drop/2026-09-24/ — 43 mp3 (POOL-tag-hash8.mp3) + README.md.
- `sudo -n aegean-ops stage-clips --confirm ARGYRIOS-SAID-GO`: 43 STAGED
  (exactly the 43 hashes), 265 SKIPPED. Prod staging 265 -> 308.
- Bank NOT touched: 137 files before and after; voice dir mtime and newest
  file (069ef3480d9af33f.mp3) both 2026-09-19 21:39:12 UTC.
- No promote, no deploy, no source change.
