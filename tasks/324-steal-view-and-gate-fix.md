# Task 324 — fix: phone result overlays mask the skip controls (A); TV phase-gate snapshot at event time (B)

Implements tasks/323-steal-view-and-gate-diagnosis.md. Client only: ControllerScreen.tsx,
HostScreen.tsx, plus dev/321-climb-intro-check.ts. No server, phase-machine or ack change.

## Context check

main, clean, HEAD == origin/main == 3d30cf9 at start.

## Fix A — ControllerScreen.tsx handlePhaseChanged

The 156a blitz rule, extended. On any phase change that is not their own, the phone
clears `steal` (unless STEAL), `guessReveal` (GUESS_REVEAL), `numericReveal`
(NUMERIC_REVEAL), `agoraReveal` (AGORA_REVEAL), `climbReveal` (CLIMB_REVEAL) and
`duelReveal` (DUEL_REVEAL).

**Beyond 323's proposal, found by the FULL run.** With only the reveals cleared, the VIP
still had no Παράλειψη on 0/2 beats after AGORA_REVEAL, 0/3 after STEAL and 0/4 after
CLIMB_REVEAL. The cause is that neither handleAgoraRevealShow nor handleClimbRevealShow
clears its question, because the reveal outranks the question in the view ladder. With
the reveal gone, a stale `agoraQuestion` (from stage 5 onward, for the rest of the show) or
`climbQuestion` sat above the `joined` fallback. So both are also cleared outside their own
QUESTION/REVEAL pair. The STEAL scenario never ran agora, which is why it passed without
this.

## Fix B — HostScreen.tsx

`handlePhaseChanged` now takes the 233b entry snapshot at EVENT time:
`phaseEntryPayloadRef.current = payloadForPhaseRef.current(payload.phase)`, which is the
last-rendered slot and so still pre-payload. `payloadForPhaseRef` is refreshed on every
render. The render-time snapshot block is gone.

"Arrived" now also requires a non-null slot. An earlier handler's pending clear is
therefore never taken for an arrival, which is the stale case 233b exists to prevent. A
state:sync (PHASE_PAYLOAD_SYNCED) is still arrived at once. The 1000ms watchdog is
unchanged.

## Harness — dev/321-climb-intro-check.ts

- `BATCH=on` holds the TV's `phase:changed SOCRATES` frame and delivers it in one task
  with the next `socrates:show`.
- `SCENARIO=STEAL`: quiz mode, two real 360x640 phones. The room jumps to the last
  question and the VIP answers correctly first, so the VIP is the thief.
- `SCENARIO=FULL`: a short `?bot=1&mode=full` show with 3 idle real phones, so 4 players
  and the spear is live. Each SOCRATES beat is attributed to the result phase before it.

## Results

All harnesses were run sequentially. Every dev server was killed afterwards: no listener was
left on the harness ports or on 4001.

**Before, at 3d30cf9** (a worktree with the new harness copied in):
- `SCENARIO=STEAL` failed **0/3** beats. Both phones showed the steal overlay throughout,
  sampled 0/45, 0/107 and 0/164.
- `BATCH=on` rendered Ανάβασις#20 **1011ms** after its frame.

**After:**
- `SCENARIO=STEAL` passed 10/10 (twice). All 3 beats had the VIP's Παράλειψη, the VIP's vote
  and Νίκη's vote in every sample (45/45, 108/108, 164/164). Νίκη had no Παράλειψη.
- `BATCH=on` passed 17/17. There were 3 batched deliveries, and #20 rendered in **3ms**.
- The default scenario passed 15/15.
- `SCENARIO=FULL` passed 7/7 in 825s, with each results screen confirmed shown on the VIP
  first. The VIP had Παράλειψη on every beat that followed:
  - steal: 3/3
  - Ζωγραφική: 3/3
  - Εκτίμηση: 1/1
  - Η Λήθη: 2/2
  - climb reveal (SPEAR_OUT + WINNER): 3/3

  The first FULL run, with only 323's five clears, was 4/7 because of the stale question
  views described above.

**Regressions:**
- typecheck: 0 errors.
- 319: 35/35. 320: 22/22. 322: 24/24. 263: 52/52. 277: 24/24.
- 300: 55/55. 303: 23/23. 308 W: 18/18. 308 P: 3/3. 308 T: 5/5. 310: 20/20.
- end-state-timer-subtitles: **27/28**, run once. The one FAIL was a stale label assertion.
  It expects `play-again-button` to read "Νέο παιχνίδι", but Task 322 (5f293ae) relabelled it
  "Ξανά, ίδια παρέα". The assertion string is corrected in this commit, and the harness was
  not rerun.
