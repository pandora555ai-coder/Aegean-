# Task 314 — untrimmed vocative starts the line twice (diagnosis only)

Context: main, clean, HEAD = origin/main = c10d0a0. PID 157305 on :4001 was argyrios's tsx dev server
(cwd /home/argyrios/Aegean/server), killed. No code changed. Repro: a scratchpad copy of dev/308 T whose probe
also logs each start()'s call stack and wraps `onended` to count firings per node; Playwright used because the
double fire is a browser Web Audio event and cannot be seen from the server or by reading the code.

## 1. Root cause
`client/src/hooks/useGameAudio.ts:859` sets `playFor = min(duration, speechEnd + 0.12)`. For a vocative with no
trailing silence (Χρυσάνθη: buffer 720ms = speech end) that is the WHOLE buffer, so `:823` calls
`start(0, 0, 0.720)`. Chromium then fires the source's `ended` TWICE (same node, 0.2-0.3ms apart), and the
continuation bound at `:861` (`() => playFrom(index + 1, owed)`) runs twice, so `:855` starts the line twice at the
same `when`. Measured 2/2 runs: prefix node ended x2, two line nodes (4960ms) at identical `when`. Control Νίκο
(buffer 640, playFor 540): prefix ended x1, one line node.

## 2. Ack
Sent TWICE, each with the same `beatId` (HostScreen.tsx:767), 2-3ms apart. Observed: first ends beat 1, second
`rejected socrates:audio_ended ... phase is STAGE_ANNOUNCE` (server/src/index.ts:604). If the advance lands in
another SOCRATES beat, enterSocratesBeat bumps the id and index.ts:630 rejects it as stale. No double-advance is
reachable (this beat has a clip, so no Task 303 hold absorbs the first). The audible fault is the doubled line
(two identical sources summed, ~+6dB).

## 3. Blast radius
Any non-last chain clip whose buffer <= speech end + 120ms. Prefix producers: v2 single-target slots (phases.ts:518
via addressedTo), DRAW_WINNER under v2 (modes/draw.ts:586), SPEAR_OUT (phases.ts:1967) — all exposed for the 60
names. Coronation passes prefix null; Set B's suffix follows "Το δικό σου." whose clip is 2240ms with speech end
1090ms (trimmed), so it is safe today. Count re-run: 201 vocatives on disk, 141 trim path, 60 whole path.

## 4. Fix proposal
useGameAudio.ts only: in `play`, pass the duration argument only when `playFor < buf.duration` (else `start(when)`),
AND latch the chain continuation to run once (a local `advanced` flag). dev/308 T: take one trim-path and one
whole-path vocative (Χρυσάνθη) from bankVocatives, and for each assert exactly 2 non-loop clips, exactly one
`audio_ended` server log line after t0, and zero `rejected socrates:audio_ended`.
