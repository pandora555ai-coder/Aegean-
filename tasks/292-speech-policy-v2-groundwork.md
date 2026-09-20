# Task 292 — v2 groundwork (Sonnet, branch speech-policy)

Branch `speech-policy`, started at HEAD `c118020` (Task 291's diagnosis), tree clean.
No deploy.

## Scope done

1. Committed `content/speech-policy-lines.md` — the exact BEGIN/END block from the
   brief, verbatim.
2. `speechPolicy: 'v1'|'v2'` room setting — type, default, server validation,
   VIP set-path, phone UI. No behaviour reads it yet.
3. `FULL_DRAW_ROUNDS_BY_LENGTH.long` 3 → 2 (shared/src/index.ts).
4. Read-only find: the stage-1 quiz question count.
5. Fixed the three stale CLAUDE.md claims from tasks/291 §0.

## Acceptance criteria

**1. speechPolicy flow, end-to-end, plus one lobby payload:**

| # | Touch point | File:line |
|---|---|---|
| 1 | Type | `shared/src/index.ts:1888-1889` — `export type SpeechPolicy = 'v1' \| 'v2'` + `SPEECH_POLICY_OPTIONS` |
| 2 | Default | `shared/src/index.ts:1907` field, `:1917-1918` `speechPolicy: 'v1'` in `DEFAULT_ROOM_SETTINGS` |
| 3 | Server validation | `server/src/state.ts:602-605`, `SPEECH_POLICY_OPTIONS.includes(...)` — the `gameLength` options-list pattern, not `powerUpsEnabled`'s bare `typeof boolean` |
| 4 | VIP set-path | `server/src/index.ts:969-995`, unchanged (`updateRoomSettings` validates internally, `updated` is always broadcast) |
| 5 | Lobby payload | `LobbyUpdatePayload.settings: RoomSettings` (shared) — free, no new field |
| 6 | Phone UI | `client/src/screens/ControllerScreen.tsx:139-140` (`SPEECH_POLICY_LABELS`), `:3393-3404` (`SegmentedRow`, testid `setting-speech-policy`) — placed beside Χρόνος (shown regardless of mode, the Task 232 precedent), not inside the quiz-only block, since it governs Socrates across every mode |

Live socket run (throwaway harness, deleted after use, port 3931):
```
1. Fresh phone's own LOBBY_UPDATE.settings.speechPolicy (default): "v1"
   Full settings object: {"questionTimeMs":20000,"difficultyMix":"normal","gameLength":"long","drawRounds":1,"powerUpsEnabled":false,"speechPolicy":"v1"}
2. VIP sends invalid speechPolicy:'v3' -> SETTINGS_UPDATED.speechPolicy: "v1" (ignored, as designed)
3. VIP sends speechPolicy:'v2' -> SETTINGS_UPDATED.speechPolicy: "v2"
4. The phone's own SETTINGS_UPDATED.speechPolicy: "v2" (room-wide broadcast)
```

**2. Draw diff + a bot run showing exactly 2 cycles in full-long:**

```diff
-  long: 3,
+  long: 2,
```
(`shared/src/index.ts`, `FULL_DRAW_ROUNDS_BY_LENGTH`)

Live `mode=full`, `gameLength: 'long'` (default), 1 bot + 1 scripted socket, real
server (throwaway harness, deleted after use, port 3930):
```
stage announced: 3 "Γύρος 3 — Ζωγραφική" @ 237.2s
stage announced: 4 "Γύρος 4 — Εκτίμηση" @ 351.8s
Ζωγραφική DRAW phase count (gameLength=long): 2
Ζωγραφική stage duration: 114.6s
```

**3. content/speech-policy-lines.md committed:**
- Total lines in file: 64. Spoken `[tag] ...` lines: 36. Pool headers: 12
  (matches the file's own "36 lines, 12 pools" description).
- sha256: `265ec119498c2d85f591e57e77dc510724ab2d5df4009cc5aae6054d35022e14`
- Stage-1 quiz question count location (read-only find, nothing changed):
  `shared/src/index.ts:1409-1413` — `FULL_QUIZ_QUESTION_COUNTS: Record<GameLength, number> = { short: 2, medium: 3, long: 5 }`,
  read at `shared/src/index.ts:1467`, `:1514`, `:1531` and by
  `server/src/modes/full.ts` via `fullStagesForLength`. Not a call-site
  constant like `FULL_DRAW_ROUNDS_BY_LENGTH` — it's baked into the stage
  table itself.

**4. Inverse checks:**
- `git diff --stat`: `CLAUDE.md` (54 lines), `ControllerScreen.tsx` (+18),
  `server/src/state.ts` (+6), `shared/src/index.ts` (+16/-1); one new
  untracked file `content/speech-policy-lines.md`. No other file touched.
- `main` and tag: HEAD is still `c118020` (Task 291) before this commit —
  branch `speech-policy` only, nothing pushed to `main`.
- Typecheck ×3 (shared, server, client): all clean, zero errors.
- Existing harness counts unchanged: `npm run agora:validate` (skew verdict:
  no category exceeds 2x uniform, same as before) and `npm run
  blitz:draw-check` (15/15 statements, 0 overlap) both ran clean, untouched
  by this change.
- `grep -arn "speechPolicy"` over the whole repo returns exactly the 7 lines
  this task added (type/default in shared, validator in state.ts, 3 UI
  lines in ControllerScreen.tsx) — nothing in the Socrates/phase pipeline
  reads it, so a default-v1 bot run's beat-kind sequence is unchanged BY
  CONSTRUCTION, not just by observation.

## CLAUDE.md fixes (291 §0)

1. **finaleMode doesn't exist** — fixed at the "seven LOCKED stages" line
   (dropped the "or Η Δίκη ... finaleMode" clause) and rewrote the climb
   paragraph that cited `room.settings.finaleMode`/`FinaleMode` to state
   Task 258 removed both entirely and the climb is the only finale.
2. **Η Δίκη is fully removed (Task 258)** — the `server/src/trial.ts` file
   listing now says REMOVED and flags every mention below it as historical,
   rather than rewriting the ~15 historical paragraphs that describe the
   mechanic (CLAUDE.md's own convention for stale-but-documented history:
   flag once, don't rewrite the archive). Also fixed the `finale:
   FinaleMode | null` / `room.trial` claim in the Task 244 paragraph — the
   real type is `finale: 'climb' | null` (shared/src/index.ts:1578/2131),
   built off `room.climb` alone; `room.trial` does not exist.
3. **Agora round is 3, not 5** — verified CLAUDE.md never actually claimed
   5 anywhere (`3 x (AGORA_QUESTION...` at the Phases section, `one agora
   round` at the stage list both already correct, matching
   `AGORA_QUESTIONS_PER_ROUND = 3`). The "5→10" framing was this task's own
   incoming brief (the speech-policy plan's "Αγορά Q5/Q10" slot naming),
   not a CLAUDE.md error — resolved by this task's own naming correction
   (those slots belong to the quiz stage, not Λήθη) rather than a doc edit.
