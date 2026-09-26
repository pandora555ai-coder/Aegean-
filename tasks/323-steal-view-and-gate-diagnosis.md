# Task 323 — diagnosis: phone stuck on the steal view (A), TV 1000ms phase watchdog (B)

Diagnosis only. No product code changed, no deploy. Only this file is committed.

## Context check

main, clean, HEAD == origin/main == 5f293ae. Read tasks/321-beats-harness.md. Ports
4001/3924/5925/3926/5927 free before and after every run. Two throwaway harnesses were written
under dev/, run once each (sequentially) and deleted uncommitted. Both are described below so
they can be rebuilt.

## 1. Bug A: root cause

**Phone view selection.** ControllerScreen's render chain is an if-ladder: `gameOver`
(ControllerScreen.tsx:2068), then **`if (steal)` (:2134)**, then `if (reveal)` (:2242), and so on,
ending at the `joined` fallback (:3424). The only two places that render the VIP's
`socrates-skip-button` and the room's `skip-vote-button` are the reveal card (:2288 / :2304) and
the `joined` fallback (:3624 / :3639). The steal view renders neither.

**Nothing clears `steal` at a stage boundary.** `applySteal(null)` runs only in these handlers:
LOBBY phase change (:854), question:show (:972), draw (:1047), numeric (:1087), blitz (:1115),
climb_question:show (:1152), agora expose (:1213), reveal:show (:1261), game over (:1268) and
state sync (:1308). `handlePhaseChanged` (:826) does not clear it for STAGE_ANNOUNCE or SOCRATES.

**Server order at the boundary.** The sequence runs through these functions:
- advanceFromSteal (phases.ts:1250) nulls `room.steal` on the server only. It then calls
  continueAfterReveal (:1269), which tries the v1 moment and the v2 slot (a SOCRATES beat if one
  fires), then advanceToNextQuestionOrGameOver (:1448) and startClimb (:1500).
- startClimb calls enterStageAnnounce (:240), which emits `stage:announce` and then
  `phase:changed STAGE_ANNOUNCE`.
- After the card, resumeAfterStageAnnounce (:304) calls startSocratesSequence. The server emits
  `skip_vote:progress {open:true}`, then `phase:changed SOCRATES` + `socrates:beat` three times.
- The next event after that is `phase:changed CLIMB_QUESTION` + `climb_question:show`. That
  climb_question:show is the first event that clears the phone's `steal`.

**Reproduced deterministically through an existing path.** No new hook was needed; the harness
only changes live Room state, as dev/321 does. Setup: in-process server, `?mode=quiz` (stage 3
steals after every question, and the last question leads into startClimb), real TV, two real
360x640 phones. While stage 1's card is up, the harness sets `room.currentQuestionIndex` to the
last question. The VIP then taps `room.questions[i].correctIndex` first, so the VIP is guaranteed
to be the thief.

Timeline, ms from start:
- 21150: STEAL.
- 25231: STAGE_ANNOUNCE for Η Ανάβαση.
- 28732: `skip:progress open:true`, then SOCRATES beats 2, 3 and 4.
- 56111: CLIMB_QUESTION.

Both phones' DOM showed **only the steal view from 21155 to 56110**: no Παράλειψη and no vote
button at any point in that window.

## 2. Bug A: scope

**Which phones.** Every phone is affected, not just the thief and the victim. broadcastSteal
(phases.ts:1191) sends every connected player a `steal:show` payload. In the repro, the
non-thief phone Νίκη was stuck exactly like the VIP.

**What is lost:**
- For all players: the Ανάβαση skip vote, for the whole climb intro.
- For the VIP only: Παράλειψη on every SOCRATES beat while the steal view is up. That is the
  three intro beats, plus in full mode any v1 moment beat or v2 Συκοφαντία slot beat (first
  steal or close) that follows a steal. This includes beats between mid-stage questions, not only
  the last one.

**The stage card itself loses nothing.** STAGE_ANNOUNCE is never skippable: vip:next rejects it
(index.ts:1543). The reveal card's `continue-button` shown during a card is a dead press
everywhere.

**Other stage boundaries have the same pattern.** This was found by reading the code; I did not
run it. Three other overlay views also sit above the `joined` fallback, have no skip control, and
survive STAGE_ANNOUNCE and SOCRATES:
- `guessReveal` (:2440), still up through Εκτίμηση's card and its STAGE_INTRO beat until
  numeric_question:show clears it (:1090).
- `numericReveal` (:2578), still up through Η Λήθη's card and intro until the agora expose event
  clears it (:1218).
- `agoraReveal` (:3259), still up through Η Συκοφαντία's card and intro until question:show.
  Strictly, question:show does not clear it. `question` simply outranks it in the ladder.

For these three the VIP loses Παράλειψη on that stage's STAGE_INTRO beat and on in-stage beats.
Those beats are DRAW_WINNER, the v2 draw/numeric/Λήθη slots and AGORA_MOMENT. `climbReveal`
(:2327) does the same for the SPEAR_OUT beat. No vote is lost at these boundaries, because only
the two sequences open a vote. `blitzReveal` is safe, since it is cleared on every non-blitz phase
change (:878).

## 3. Bug B: root cause

**Where it is.** HostScreen.tsx:522-553. The "arrived" test compares the phase's payload slot
against a snapshot of that slot. The snapshot is taken **during render**, on the first render
where `socketPhase` differs from the committed phase (:528-531). It is not taken when
`phase:changed` arrives (handlePhaseChanged, :630).

**Why it falls through to the watchdog.** Sometimes `phase:changed` and the phase's own payload
land in one React render. That happens when both socket messages run before React's scheduled
render task, for example when the main thread is busy right after a card. In that case the entry
snapshot already holds the NEW payload, so `socketPhasePayload !== phaseEntryPayloadRef.current`
is false. The phase then commits only when the `PHASE_PAYLOAD_WATCHDOG_MS = 1000` timer fires
(:169, :551).

**Confirmed deterministically.** A throwaway copy of dev/321-climb-intro-check.ts added a
raw-string init script that holds a `phase:changed SOCRATES` frame and delivers it together with
the next `socrates:show`, in one task. Result:
- The check still passed 15/15 (3 batched deliveries).
- Ανάβασις#20 rendered **1009ms** after its frame, against 8ms unbatched in Task 321.
- #21 and #22 rendered in 4ms and 3ms. Their SOCRATES→SOCRATES transition never engages the gate.

**What else can be lost.** It is not only a beat skipped inside that second:
- **Any phase that is entered this way and lasts under about 1s is never rendered at all.** That
  includes a REVEAL or CLIMB_REVEAL that the VIP skips quickly.
- A second phase change inside the window re-snapshots and silently drops the intermediate phase.
- Otherwise the TV shows the PREVIOUS phase's view for about 1s. For SOCRATES, the audio has
  already started at event time (the socrates:show handler, HostScreen.tsx:774), so the subtitle
  trails the voice by about 1s.
- Every client timer keyed off the committed `phase` also starts about 1s late. That covers
  AGORA_REVEAL_GRID_MS, CLIMB_BEAT_MS/CLIMB_GLIDE_MS, the krater countdown and PODIUM_DELAY_MS.

The state:sync path is unaffected, because it stamps PHASE_PAYLOAD_SYNCED.

## 4. Fix proposals (no code written)

**A.** One file, ControllerScreen.tsx. In `handlePhaseChanged`, clear the overlay states when a
phase arrives that they can no longer belong to:
- `applySteal(null)` unless the phase is STEAL.
- `setGuessReveal(null)` unless GUESS_REVEAL, `setNumericReveal(null)` unless NUMERIC_REVEAL,
  `setAgoraReveal(null)` unless AGORA_REVEAL, and `setClimbReveal(null)` unless CLIMB_REVEAL.

That is the Task 140 / Task 156a blitz rule (:874-880) applied to the rest. The phone then falls
through to the `joined` view, which carries both controls. If a result card should stay up during
a beat, add the two controls to those views instead. That is a product decision to make before
coding.

The harness should be a new SCENARIO=STEAL in dev/321-climb-intro-check.ts. It would use the
same in-process setup as the repro above (quiz mode, index jump, correct-first VIP, two real
phones with a view MutationObserver). It asserts that on both phones `skip-vote-button` is
present, and on the VIP `socrates-skip-button` too, for each of the three Ανάβασις beats. It
fails at HEAD: 0 of 3 on both phones.

**B.** One file, HostScreen.tsx. Take the entry snapshot at EVENT time. Keep
`payloadForPhaseRef.current = payloadForPhase` updated on each render. In handlePhaseChanged, set
`phaseEntryPhaseRef` and `phaseEntryPayloadRef` from `payloadForPhaseRef.current(payload.phase)`.
That is the last-rendered slot, still pre-payload, because the server emits phase:changed first.
Then delete the render-time snapshot block (:528-531). The 1000ms watchdog stays as the safety
net for a payload the server never sends.

The harness should be `BATCH=on` in dev/321-climb-intro-check.ts, using the frame-holding init
script above. It asserts that Ανάβασις#20 renders under 200ms after its frame. That measures
1009ms at HEAD.
