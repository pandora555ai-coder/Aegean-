# Task 315 — fix the whole-prefix double start (Task 314's diagnosis)

Context: main, clean; HEAD 067130a, origin/main was c10d0a0 (314 unpushed, goes up with this push).

## 1. Fix (client/src/hooks/useGameAudio.ts only)
- :822 `if (playFor === undefined || playFor >= buf.duration) {` — plain `start(when)` unless the clip is really cut.
- :865-869 `let advanced = false; play(chain[index], () => { if (advanced) return; advanced = true; playFrom(index + 1, owed); }, ...)`
  — the next-clip step runs at most once per chain link.

## 2. dev/308 T
bankVocatives now returns one TRIM-path vocative (Νίκο) and one WHOLE-path one (Χρυσάνθη); per vocative:
exactly 2 clip starts, exactly 1 accepted socrates:audio_ended, 0 rejected (1.5s settle for a trailing duplicate).
Fixed: 5/5 (Νίκο playFor 540/640ms, gap 457ms; Χρυσάνθη playFor=whole, gap 460ms). Pre-fix client (swapped in
temporarily): Χρυσάνθη FAIL 3 clips, 1 accepted + 1 rejected — the assertion catches the defect.

## 3. Inverse
typecheck shared/server/client 0/0/0. 263 52/0 (re-run alone after a pre-fix swap overlapped the first run),
277 24/0, 300 55/55, 303 23/0, 308 W 18/0, P 3/0, 310 20/20.
Throwaway (scratchpad copy of 308, untrimmed Χρυσάνθη prefix):
- pause 200ms into the prefix: timer 7756 -> 7756ms over 4s; line started once 564ms after resume; prefix `ended`
  x1; 1 ack accepted, 0 rejected.
- skip-vote cut (startSequenceSkip) 200ms into the prefix: cut beat never acked (0 ended, 0 stale); interruption
  line (8640ms) started once and ended beat 2 on its one ack; the cut line never started. Pre-fix client: same shape.

## 4. Deploy
See the report of this task's deploy below.
