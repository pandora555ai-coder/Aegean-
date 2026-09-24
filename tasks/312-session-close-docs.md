# Task 312 — session-close docs after 306-311 (docs only)

Branch main, clean at start. HEAD f78f6dd. Sources: git log 25fdd16..HEAD, tasks/306-311 reports.

## NEXT-CHAT.md
Rewritten: numbering 313; LIVE section (v2 default, v1 routes, bank 396, named slots, 450ms gap, 310 sides,
311 humans-only skip vote, 303 hold); budget; next-in-order; traps since 305. Fixed the stale
"303's deploy is unverified": verified DEPLOY OK 54a1582 (Argyrios's statement — no log in the repo).
Deploy state of 308-311 is not recorded in the repo; said so instead of guessing.

## CLAUDE.md corrections (old -> new)
- L142-144 "no mp3 exists for any of them until the October pass, so a v2 beat 404s" -> voiced since 306/307;
  only a clip-less line 404s/holds.
- L181 "DRAW_MID/NUMERIC_CLOSE wholly reservoir-backed" -> own BEST/WORST pools since 309.
- L216 "v2 slot beats have no mp3s yet" -> voiced since 306/307/309.
- L1089-1095 "137 mp3s; 521 entries, 125 on disk, 396 none, 12 orphans" -> 396 mp3s; 533 entries, 380 on disk,
  153 none, 16 orphans (measured Task 312: collectVoiceLineEntries + resolveSocratesClip.known, ls voice = 396).
- Already correct, left alone: default v2 (L204), 450ms gap (L1270), humans-only skip vote (L1106).

## Budget
ElevenLabs billed: 306 **4495** (report §"Total billed 4495 chars"), 307 **1372**, 309 **1589** = **7456**.
~30,000 baseline is Argyrios's figure (no report states it) -> ~22,544 left.
