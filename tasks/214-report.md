# Task 214 report — the locked full-game lineup

All numbers from one `npx tsx dev/full-lineup-check.ts` run (throwaway server
on port 3907, socket-level, 3 bots + 1 scripted human as VIP, every setting
default unless stated). Raw log: the script re-runs and reprints it.

## 1. FULL RUN — PASS

`mode=full`, `?bot=3`, all settings default (`gameLength: 'long'`,
`powerUpsEnabled: false`, `finaleMode` untouched). Stage order as announced by
the server's own `stage:announce` cards, with each card's duration measured to
the next card (the finale's, to GAME_OVER):

| Stage | Card title | Duration |
|---|---|---|
| 1 | Γύρος 1 — Η Αγορά | 119.1s |
| 2 | Γύρος 2 — Η Παλαίστρα | 41.5s |
| 3 | Γύρος 3 — Ζωγραφική | 225.6s |
| 4 | Γύρος 4 — Εκτίμηση | 61.6s |
| 5 | Γύρος 5 — Η Μνήμη της Αγοράς | 77.7s |
| 6 | Γύρος 6 — Η Συκοφαντία | 124.6s |
| 7 | Η Ανάβαση | 183.1s |

Total to GAME_OVER: **844.2s**. Stages announced: **7**, and every card
reported `totalStages: 7`. No stall: the run entered 18 distinct phases —
`STAGE_ANNOUNCE QUESTION REVEAL STEAL SOCRATES BLITZ BLITZ_REVEAL DRAW GUESS
GUESS_REVEAL NUMERIC_QUESTION NUMERIC_REVEAL AGORA_EXPOSE AGORA_QUESTION
AGORA_REVEAL CLIMB_QUESTION CLIMB_REVEAL GAME_OVER` — and reached GAME_OVER
without the harness's 900s watchdog firing.

(Durations are inflated relative to a real show: the harness host never emits
`socrates:audio_ended`, so every SOCRATES beat holds the full
`SOCRATES_MAX_DURATION_MS` = 11000ms backstop instead of the clip's length.)

## 2. FINALE DEFAULT — PASS

**Default (no VIP toggle):** the run above. Evidence: the finale card read
`stage 7/7 "Η Ανάβαση"`; the run entered `CLIMB_QUESTION` **22** times and
`CLIMB_REVEAL` **22** times, `TRIAL_QUESTION` **0** times, `DUEL_PICK` **0**
times (no two-arrival tie this run); `game_over.isTrialResult` was `true`
(the no-digits GAME_OVER both finales share).

**`finaleMode: 'trial'` (one `vip:update_settings`, nothing else changed):** a
second full room announced the same six stages —
`1:Γύρος 1 — Η Αγορά | 2:Γύρος 2 — Η Παλαίστρα | 3:Γύρος 3 — Ζωγραφική |
4:Γύρος 4 — Εκτίμηση | 5:Γύρος 5 — Η Μνήμη της Αγοράς | 6:Γύρος 6 — Η Συκοφαντία`
— and then `stage 7/7 "Η Δίκη"`, with `TRIAL_QUESTION` **7** /
`CLIMB_QUESTION` **0**, reaching GAME_OVER. Stage durations 119.6 / 41.5 /
226.6 / 50.5 / 77.1 / 124.4 / 91.0s.

## 3. SCORE CONTINUITY + COVERAGE — PASS

Standings observed on the host at each stage card (so, the totals carried INTO
that stage), first run:

| At card | Αργύρης | Γιώργος | Νίκος | Ελένη |
|---|---|---|---|---|
| 1 Η Αγορά | 0 | 0 | 0 | 0 |
| 2 Η Παλαίστρα | 396 | 792 | 396 | 379 |
| 3 Ζωγραφική | 696 | 867 | 396 | 554 |
| 4 Εκτίμηση | 1620 | 1663 | 1454 | 1937 |
| 5 Η Μνήμη της Αγοράς | 2420 | 2463 | 2054 | 2837 |
| 6 Η Συκοφαντία | 2420 | 3950 | 2054 | 2837 |
| **7 Η Ανάβαση (finale entry)** | **2032** | **5136** | **4426** | **2814** |

Nothing resets between stages, and the finale's entry values are the totals
accumulated over all six preceding stages. Checked INDEPENDENTLY of those
snapshots: the harness rebuilt each player's total from every reveal payload's
own `results[].pointsAwarded` (quiz REVEAL, `blitz_reveal:show`,
`guess_reveal:show` + its `drawerPointsAwarded`, `numeric_reveal:show`,
`agora_reveal:show`) plus every `steal:resolved` transfer —
Αργύρης 2032, Γιώργος 5136, Νίκος 4426, Ελένη 2814: **4/4 MATCH**.

`crowdIntensityFor`: **0 throws** across a sweep of all **24** `GamePhase`
values, and 0 across the 18 phases this run actually entered; **0** lines in
the server's stdout/stderr mentioning `crowdIntensityFor` or `unhandled
phase`. Corroborating: a throw there propagates out of `emitCrowdIntensity`
and would freeze the transition, and all **8** games in this session reached
GAME_OVER.

## 4. NO REGRESSION — PASS (7/7 stage mechanics, 6/6 standalone rooms)

Each run is a fresh standalone room, 3 bots + 1 human, start → GAME_OVER:

| Standalone run | Result | Duration | Phases entered |
|---|---|---|---|
| `quiz` — covers Η Αγορά, Η Συκοφαντία (its stage 3 STEAL) and Η Ανάβασις | **PASS** | 469.9s | SOCRATES STAGE_ANNOUNCE QUESTION REVEAL STEAL CLIMB_QUESTION CLIMB_REVEAL GAME_OVER |
| `blitz` — Η Παλαίστρα | **PASS** | 38.0s | BLITZ BLITZ_REVEAL GAME_OVER |
| `draw` — Ζωγραφική | **PASS** | 89.5s | SOCRATES DRAW GUESS GUESS_REVEAL GAME_OVER |
| `numeric` — Εκτίμηση | **PASS** | 101.1s | NUMERIC_QUESTION NUMERIC_REVEAL SOCRATES GAME_OVER |
| `agora` — Η Μνήμη της Αγοράς | **PASS** | 73.9s | AGORA_EXPOSE AGORA_QUESTION AGORA_REVEAL SOCRATES GAME_OVER |
| `duel` — Η Μονομαχία (Task 191's harness mode) | **PASS** | 28.8s | DUEL_PICK DUEL_REVEAL SOCRATES GAME_OVER |

Η Δίκη's standalone-equivalent path is covered by criterion 2's
`finaleMode: 'trial'` run (7 TRIAL_QUESTION rounds → GAME_OVER).

`npm run typecheck` (shared + server + client): **clean**, no output.

## Notes worth carrying forward

- The agora stage scores at `calculatePoints` scale 1, i.e. the standalone
  quiz's up-to-1500 band rather than full's ~400 one. It shows in the table
  above: Γιώργος gained 1487 in that single stage, the largest swing of the
  night. Retuning it was out of scope (the task forbids touching a stage's
  internals and says not to retune), so it is left as-is and flagged in
  CLAUDE.md.
- `FULL_DRAW_ROUNDS_BY_LENGTH` is untouched (short 1 / medium 1 / long 3), so
  the drawing stage does not yet run the lineup's stated "×2 rounds" — same
  reason: "keep current defaults, do not retune here". One-line change when
  someone decides to.
- The default run's climb ran 22 rounds, two short of `CLIMB_MAX_ROUNDS` = 24,
  and produced no duel. That is the mechanic behaving as its own Monte Carlo
  predicts, not a composition effect.
