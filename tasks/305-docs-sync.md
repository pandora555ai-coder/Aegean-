# Task 305 — Docs sync after 289-303 (docs only)

Branch main. 4b5b674 (reports/STATUS.md, 4 lines, HQ Console convention) was
unpushed at start; its line 1 claimed "main synced with origin at Task 303",
false (main was 1 ahead) — rewritten and pushed with this task.

No 304 report exists on disk; the 304 findings came inline in the prompt and
every one was re-verified against code before editing.

## CLAUDE.md corrections (old -> new)
- L144 v2 beat "404s and ends on the client's immediate ack" -> client acks at
  once, server absorbs it and holds (303).
- L323 "GamePhase has 24 values" -> 22 (counted; TRIAL_QUESTION/REVEAL removed
  in d8324bc, Task 258).
- L445 reference timing -> marked PRE-292/295, no new numbers.
- L477 FULL_QUIZ_QUESTION_COUNTS "each quiz stage 2/3/5" -> stage 1 via
  FULL_QUIZ_STAGE1_QUESTION_COUNTS 2/3/10, stage 6 keeps 2/3/5.
- L479-485 draw "2/2/3, default long = 3 rounds" -> 2/2/2 (292).
- L1066 "283 mp3s, 276 active" -> bank 137; collectVoiceLineEntries 521, 125
  with a clip on disk, 396 without (measured via resolveSocratesClip).
- L1132-1134, L1139-1141, L1190-1193 -> no-clip ack is absorbed into the 303
  hold; skip exempt.
- L1143 "exactly ONE way to end early ... three callers" -> traced list of four
  end paths with file:line.
- Added: ?policy=v1|v2 (302), merged default v1 + lobby toggle (298),
  SOCRATES_HOLD_* / socratesHoldMs (303). Resolved the stale "276" NOTE.

## Early-end trace (file:line)
1. host ack: index.ts:1408 -> endSocratesBeat index.ts:603; hold absorb
   index.ts:654, re-arm index.ts:661.
2. VIP skip: vip:skip_socrates index.ts:1438, vip:next index.ts:1375 (skip:true,
   hold-exempt, refused if unskippable/paused/stale).
3. skip vote: index.ts:1455/1499, disconnect index.ts:2011 ->
   phases.ts:795 -> startSequenceSkip phases.ts:743 (enterSocratesBeat re-arm
   cancels the hold; pool-spent -> advanceFromSocrates phases.ts:772).
4. timer: backstop phases.ts:433 / 1302, or the re-armed hold expiring.
Dev-only: wireHostSocratesAck bots.ts:436 (enters path 1).

NEXT-CHAT.md rewritten (numbering at 306).
