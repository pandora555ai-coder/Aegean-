# Task 207 — Η Μνήμη της Αγοράς: phase-machine wiring (no TV/phone visuals)

Server wiring of Task 206's pure module (`shared/src/agora.ts`, **not
modified**). New: `server/src/modes/agora.ts` (the mode shell — standalone
`'agora'` in GameModeId, VIP-selectable, `minPlayers` 2), `server/src/agora.ts`
(pure helpers: seed draw, render spec, the reveal's subject resolver),
`dev/agora-wire-check.ts` (`npm run agora:wire-check`). Edited: shared contract
(3 phases, 3 server events, `player:agora_submit`, payload + state:sync types,
`crowdIntensityFor` cases), `server/src/index.ts` (submit handler, host+player
state:sync branches, disconnect recheck), `bots.ts` (bots answer agora
questions), `state.ts` (`'AGORA_MOMENT'` beat kind), `modes/index.ts`, and a
phase-only placeholder in HostScreen/ControllerScreen (208/209 own the views).
Flow: AGORA_EXPOSE (12000 ms) → 3 × (AGORA_QUESTION on
`room.settings.questionTimeMs` → AGORA_REVEAL on REVEAL_DURATION_MS [→ SOCRATES
if a GENERIC quiz moment fired — no new lines, D1]) → GAME_OVER. Scoring is
`calculatePoints` at scale 1 + `sortAndRankResults`, the quiz's path verbatim.
Seed: server RNG per round, logged as `agora expose started - seed=N`.

Harness: socket-level (socket.io-client) against the dev server on 4001 —
`?bot=2` plus one scripted "human" (answers ~1 s in), no Playwright, no
screenshots. Note the first run failed inside the HARNESS (its player took the
`minotaur` avatar, so one bot was rejected AVATAR_TAKEN and the lobby never
reached 3) — the scripted player now uses `sphinx`; the game was never at fault.

## Criterion 1 — FLOW
- Observed (host `phase:changed`, ms since Έναρξη): AGORA_EXPOSE@39 →
  AGORA_QUESTION@12041 → AGORA_REVEAL@32049 → SOCRATES@38050 →
  AGORA_QUESTION@49055 → AGORA_REVEAL@53530 → SOCRATES@59536 →
  AGORA_QUESTION@70541 → AGORA_REVEAL@73789 → SOCRATES@79793 → GAME_OVER@90797.
- expose 1, questions 3, reveals 3, SOCRATES 3 (generic moments fired
  naturally; each held the 11 s backstop because the harness host never acks
  audio), GAME_OVER reached, no stall.
- **Total stage duration 90,760 ms (90.8 s) ≤ 240 s.** Q1 ran its full 20 s
  because the harness reconnected its phone mid-question (a state:sync, not a
  fresh `agora_question:show`, so the scripted answerer never fired); Q2/Q3
  ended early on everyone-answered (4.5 s / 3.2 s).

## Criterion 2 — LEAKS (inverse)
- **101 payloads captured** (host + phone, entire round, the 4 reconnect
  state:syncs included): phase:changed 22, lobby:update 14, crowd:mood 12,
  crowd:intensity 11, answer:progress 8, agora_question:show 6,
  agora_reveal:show 6, state:sync 4, socrates:show 3, agora_expose:show 2, …
- **Scene fields (stalls/animals/spec/proof/colour/geeseN/slot/…) outside
  AGORA_EXPOSE/AGORA_REVEAL: 0.** The 7 carriers were agora_expose:show (host,
  phone), state:sync in AGORA_EXPOSE (host, phone) and host agora_reveal:show.
- **correctIndex outside an AGORA_REVEAL payload: 0.**
- Union of every key in the 6 `agora_question:show` payloads: answered,
  answeredPlayerIds, avatarId, connected, kind, name, options, paused,
  pausedByName, playerId, question, questionIndex, questionTimeMs, rank, score,
  standings, totalQuestions — no scene field, no correctIndex.

## Criterion 3 — RECONNECT FAIRNESS
- Mid-AGORA_QUESTION (fresh sockets, +400 ms): TV state:sync has `question` +
  `options` + `answeredPlayerIds`, **sceneKeys=[], correctIndex=false**,
  remainingMs 19,596; phone state:sync has `options` + `answered`,
  **sceneKeys=[], correctIndex=false**, remainingMs 19,592.
- Mid-AGORA_EXPOSE (+2 s): TV state:sync has `spec` (stalls/colour/slot/
  animals/geeseN) + **remainingMs 9,990**; phone state:sync the same spec +
  **remainingMs 9,985** (durationMs field carries the same value).
- Both PASS; the same rule is what the LEAKS scan above saw.

## Criterion 4 — PAUSE
- Paused 3,006 ms into AGORA_EXPOSE. Frozen remainingMs read off a fresh TV's
  state:sync while paused: **8,995**. After a 30 s wall-clock hold, read again:
  **8,995**. On `game:resumed`: **8,995 → drift 0 ms.**
- After resume the exposure ran 9,000 ms more before AGORA_QUESTION (expected
  ~8,995); the round then completed normally to GAME_OVER (104,794 ms total
  including the 30 s hold; the log's tripled phases are the three host probe
  sockets the harness left in the room, one line each).
- `npm run typecheck` (shared + server + client): clean.

## Extra — subject resolver (the proof's `subject`)
`server/src/agora.ts` resolves the subject from strings agora.ts exports plus
two small mirrors of its private tables; the pure `--subjects` sweep over
20,000 seeds / 60,000 questions (20,000 per kind): **0 unresolved, 0 disagree
with the scene's truth** (colour → that stall's awning IS the correct option,
count → that stall's/the geese's count IS, existence → `present` matches the
phrasing). A drift in agora.ts's wording shows up there; live, a miss warns
and falls back to the first stall rather than crashing the phase.

Not done here by design: full-show composition (`startAgoraSegment` /
`prepareAgoraRound` are the entry points, numeric's pattern), the TV view
(208), the phone view (209). `shared/src/agora.ts`'s header still says "NOT
wired" — that file was off limits for this task; the re-export comment in
`shared/src/index.ts` and CLAUDE.md now describe the wiring.
