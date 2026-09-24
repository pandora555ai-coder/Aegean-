# Task 309 — line fixes, new draw/numeric pools, 450ms splice gap (real spend, deployed)

## A. Gap
`SPLICE_GAP_MS = 450` (useGameAudio.ts). The next clip of a chain starts 450 ms after the previous
clip's SPEECH end, prefix -> line AND line -> suffix, scheduled on the context clock
(`source.start(when)`) so a pause freezes it. `speechEndSec` now returns the speech end alone (308's
detection unchanged); the previous clip still plays to speech end + 120 ms and the wait owed after that
is `450 - tail actually played`. One ack per beat, unchanged (bound to the last clip).
- Measured, real browser (`SCENARIO=T dev/308-vocative-slot-check.ts`, speech ends measured offline):
  Άλκη 448 ms, Άρη 457 ms, Λευτέρη 451 ms (308: 112/125/113).
- Live full v2 game: 7 prefixed beats with a trimmed prefix 444-448 ms; the 3 beats whose prefix speech runs
  to its buffer end (Σμαράγδα 880, Χρυσάνθη 720) started the line 455/452/454 ms after the buffer end
  (the probe's "GAP=575" for those is its own assumed −120 ms; read the `line+` column).
- Backstop margin: prefix chain adds ≤ 1160 + 450 = 1610 ms against the 3000 ms margin (≥ 1390 left);
  suffix chain (277 A, real clips): measured 9627 ms vs armed 12912 ms = 3285 ms spare; prefix beats in
  the live run: ack 7.5-11.6 s vs backstop 9.5-13.2 s, all `socrates:audio_ended`, backstop never fired.
- Pause (`SCENARIO=P`): timer 7716 -> 7716 ms over 4 s, line waited, ack audio_ended.

## B. Replaced lines (old clips are orphans, not deleted)
CORONATION_SET_C #2 -> "Σε έψαξα όλη τη νύχτα για ένα λάθος να σε πιάσω. Δεν το βρήκα." [sighs];
AGORA_WORST #1 [warm]; PALAISTRA_MID_BEST #1 [dry]; LITHI_CLOSE_OBSERVER #3 [amused]. Tags unchanged per
position; LINE_TAGS re-keyed on the new text. content/speech-policy-lines.md updated (Set C's line lives in
socrates.ts, noted in the file header).

## C. New pools
SPEECH_V2_LINES + SpeechSlotPool: DRAW_MID_BEST/WORST, NUMERIC_CLOSE_BEST/WORST (12 lines, LINE_TAGS,
md). speechSlots.ts SLOT_SPECS: DRAW_MID and NUMERIC_CLOSE read them instead of RUNAWAY_LEAD/STUCK_IN_LAST;
NOBODY/EVERYBODY_GUESSED, EXACT_HIT/WILDLY_OFF untouched (v1).
`dev/309-dispatch-check.ts` (HEAD -> now): collectVoiceLineEntries **521 -> 533**; SPEECH_V2 pools 13 -> 17;
DRAW_MID 20/20 RUNAWAY_LEAD (reservoir) -> 20/20 DRAW_MID_BEST; NUMERIC_CLOSE 20/20 STUCK_IN_LAST
(reservoir) -> 20/20 NUMERIC_CLOSE_WORST.

## D. Spend + promote (voice NOpBlnGInO9m6vDvFkFC)
- Dry run 16 lines, **1411** chars planned; real run `--max-chars 2500`: **1589** billed (+178), 2 tail-check
  retries (7eb44ff5, 1d372638, each fixed on attempt 2), 0 refusals. 16/16 landed; staging 508 -> 524.
- Tail check re-run on all 16: 0 fail; 5.84-8.72 s. 6e658f7e (NUMERIC_CLOSE_BEST thoughtful) has ratio
  1.00 and passes only on the quiet-tail MIN_RMS clause — worth an ear.
- audition-drop/2026-09-24/task309/ (16 mp3 + README).
- `aegean-ops stage-clips`: 16 STAGED. `promote-to-bank` <16 hashes>: **16 PROMOTED, 0 refused**;
  bank 380 -> **396**, voice dir mtime 2026-09-24 17:38:30 -> 19:48:05 UTC.

## E. Live v2 run (dev server 3968, `?bot=4&mode=full&policy=v2`, real browser audio, 768 s)
33 beats, 10 named. DRAW_MID -> pool=DRAW_MID_BEST, beat 19 "Ξανθίππη. Όλοι κατάλαβαν τι ζωγράφισες…" (ack
+8658 ms / backstop 10581). NUMERIC_CLOSE -> pool=NUMERIC_CLOSE_WORST, beat 22 "Ξανθίππη. Σε κάθε ερώτηση,
ήσουν μακριά…" (ack +7549 / 9458). QUIZ_MID beat 12 is the new AGORA_WORST #1, ack +11578 / 13219.
Set C was not drawn in that game; forced instead (`SCENARIO=C dev/263-coronation-check.ts`): beat 2 is the new
C2, held 5469 ms (clip 5440 ms), backstop 8517, ended on audio_ended. That scenario's one FAIL
("each beat held < 1000ms") is the same stale premise 308 recorded — the clips exist now.

## Inverse
typecheck x3 clean; `dev/277-splice-check.ts` 24/24 (its gap check now reads the EFFECTIVE start, 336.9 ms
after the played span = 450 from speech end); 308 W 18/18, T 3/3, P 3/3.
Deploy proof: see the report.
