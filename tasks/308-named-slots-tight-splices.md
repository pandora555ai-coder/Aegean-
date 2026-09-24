# Task 308 — names in every v2 slot + tight vocative splices

## A. Names
Read-only first: before this task, only **SPEAR_OUT** (`startSpearOutBeatIfDue`) and
the coronation's Set B (`startSocratesSequence`'s suffix) set a splice. No
SPEECH_SLOT or DRAW_WINNER beat set one: `startSpeechSlotBeat` passed text/template/tag only.

`addressedTo(name, text)` (phases.ts) — subtitle `"<vocative>. <line>"` always
(SPEAR_OUT's form), `prefix` = the vocative clip only when `hasSocratesClip`
finds it, else null (Task 276's rule: name without a clip → subtitle only).
Line template/tag untouched. Used by `startSpeechSlotBeat` (all 9 slots) and
by DRAW_WINNER **under v2 only** (v1 unchanged). DUEL untouched.
Note: DRAW_MID/NUMERIC_CLOSE's reservoir lines are third-person ("Κάποιος…"),
so the address reads slightly off there. Content, not wiring.

## B. Trim
`speechEndSec` (useGameAudio.ts): walk back from the buffer end in 10 ms windows,
stop at the first with RMS ≥ **0.015** of full scale (~−36.5 dBFS; 307's
check used RMS 500/32768 = 0.0153), + ≤120 ms tail. Every clip but the LAST in
the chain plays via `start(0, 0, d)`; the last plays whole, so there is still one ack at
the true chain end. Pause suspends the context, which freezes `d` with it.
Backstop: the longest trimmed vocative (all 200 measured offline) is
1280 ms < the 3000 ms margin.

## Evidence — `dev/308-vocative-slot-check.ts`
- **W** (in-process): 9/9 slot kinds named, prefix = clip or null (Ζήνων); 18/18.
  Before (server stashed): all 9 unnamed, `prefix:null`.
- **T** (browser), gap speech-end → line, before → after: Άλκη 1796 → 112 ms,
  Άρη 1770 → 125 ms, Λευτέρη 1693 → 113 ms; ack 1.7 s earlier, all audio_ended.
- **P** (pause mid-prefix): timer 7730 → 7730 ms over 4 s, line waited, ack audio_ended.
- **L** (live `?bot=4&mode=full&policy=v2`, browser TV, 749 s): 10 named beats
  (QUIZ_MID/CLOSE, BLITZ_MID/CLOSE, DRAW_MID, DRAW_WINNER, NUMERIC_CLOSE,
  LETHE_CLOSE, SYKO_FIRST_STEAL, SYKO_CLOSE), gap 113–132 ms, all ended on audio_ended.
- Skip vote: `SCENARIO=A dev/300-skip-vote-check.ts` 18/18.
- `dev/277-splice-check.ts` 24/24. Its gap check now measures against the
  played span (`start()` duration), not the buffer end: it failed at −465 ms,
  which was exactly the line's trimmed tail.
- Coronation Set B forced (`SCENARIO=B dev/263-coronation-check.ts`): suffix
  "Νίκο" spliced, audio_ended, beat 3 held 2919 → 1879 ms. 9/10 — the one FAIL
  ("held < 1000ms") is identical at HEAD: stale premise, the clips now exist (306/307).
- `dev/303-hold-check.ts` C can no longer run (needs clip-less lines; found 154/0). Stale, not fixed.
