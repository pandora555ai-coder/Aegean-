# Task 313 — harness debt + prod proof

## 1. dev/300-skip-vote-check.ts scenario E
Before: 3 stale expectations (521 entries / 14 pools / 43 lines vs actual 533 / 18 / 55). After: none hard-coded.
Expected values now come from `SPEECH_V2_LINES` + `SKIP_INTERRUPTED_LINES`: entries registered = distinct texts of
those tables (55); file pools = table keys + SKIP_INTERRUPTED (18); file lines = sum of table lengths + 4 (55); every
file header must be a table key. Total entry count (533) is logged, not asserted. E 15/15; whole file 55/55.

## 2. dev/308-vocative-slot-check.ts scenario T
Runs bare. With no VOCS it decodes the bank's preset vocative mp3s (ffprobe+ffmpeg, client's own `speechEndSec`
algorithm) and takes the first/middle/last one on the TRIM path (buffer > speech end + 120ms). VOCS still overrides.
Asserts per vocative: exactly 2 clips, ack via socrates:audio_ended. Measured gap speech-end -> line: 453/442/441ms
(SPLICE_GAP_MS = 450). 4/4.

## 3. Prod proof (read-only grep -a, /opt/party-game)
308 `addressedTo` phases.ts:530 · 309 `SPLICE_GAP_MS = 450` useGameAudio.ts:48 (+ bundle index-CbJi1tO7.js `.015,.01,.12,450`)
· 310 `drawCandidates`/`numericCandidates` speechSlots.ts:200/236 · 311 `getConnectedHumans` state.ts:809, `speechPolicy: 'v2'`
shared/src/index.ts:1969. The six touched files are `cmp`-identical to dev. All four tasks are live.

## 4. Found, NOT fixed (client, out of scope)
T's first bare run picked a vocative with no trailing silence (Χρυσάνθη, 720ms buffer = speech end): the prefix plays
whole and the line clip is started TWICE at the same instant (3 clips, 2/2 runs). 60 of 201 bank vocatives are on that
path, 141 trimmed. Cause undiagnosed. T asserts only the trim path until this is fixed (NEXT-CHAT item 1).

## 5. Inverse
typecheck shared/server/client exit 0/0/0. 277 24/0, 294 probe 16/16, 308 W 18/0, P 3/0, T 4/0, 310 20/20, 263 52/0, 303 23/0.
No deploy, no server/client code changed. CLAUDE.md deploy section: task reports that deploy must quote `DEPLOY OK` verbatim.
