# Game modes (Task 52)

A **GameMode** is one GAME the room can run. `room.mode` (a `GameModeId`,
default and currently only `'quiz'`) selects it. The mode owns its phase
sequence, what follows each of its phases, and its own stage table — none of
that is hardcoded in the phase machine any more.

- `types.ts`    the `GameMode` interface
- `registry.ts` the mode map + `modeForRoom()` + `continuationForActiveTimer()`
- `quiz.ts`     the quiz mode (its phase machine is still `../phases.ts`)
- `index.ts`    the barrel — importing a mode module is what registers it

## Adding a mode

Everything a new mode has to define, and nothing else:

1. **`shared/src/index.ts`** — add the id to `GameModeId`/`GAME_MODE_IDS`, and
   add any phase names it introduces to the `GamePhase` union (the wire
   vocabulary the TV and phones are allowed to be told about). If it has
   stages, export its own `StageDefinition[]` table alongside `QUIZ_STAGES`.
2. **`server/src/modes/<mode>.ts`** — build a `GameMode` and call
   `registerGameMode()`:
   - `id`
   - `phases` — every phase it can enter, `LOBBY` and `GAME_OVER` included
     (registration throws at startup if either is missing)
   - `stages` — its own table; pass it to the `@game/shared` stage helpers,
     all of which take the table to read as their last argument
   - `prepareGame(room)` — draw/build whatever one game needs
   - `start(room)` — enter the first phase; `vip:start_game` calls only this
   - `continuations` — keyed by `ActiveTimer.kind`: what each phase-advance
     timer advances to. **A phase that arms a timer MUST appear here**, or
     pause/resume would leave the game frozen. Key it off a mode-local
     `TimerKind` union (see `QuizTimerKind`) to keep that exhaustive.
   - its own phase module, the way the quiz has `phases.ts`
3. **`server/src/modes/index.ts`** — one `import './<mode>.js';` line.
4. **`client/`** — host/controller views for its new phases.

## What does NOT change

`state.ts`, `timers.ts` and `realtime.ts` are mode-agnostic:

- `Room.mode` is a `GameModeId`, so widening that union is enough — `state.ts`
  neither names a mode nor knows the phase list, and `buildRoomQuestions()`
  delegates to `prepareGame()`.
- `ActiveTimer.kind` is a plain `string`; the vocabulary belongs to the mode,
  and `continuationForActiveTimer()` dispatches through the mode's own table
  instead of a fixed switch. That is what keeps pause, resume and mid-phase
  reconnect correct for phases `timers.ts` has never heard of.
- `realtime.ts` only owns the Socket.IO instance.

`index.ts` and `payloads.ts` are NOT in that set: socket handlers and payload
builders for a mode's own events (`POWER_UP`, `STEAL`, `SOCRATES_AUDIO_ENDED`,
`STAGE_ANNOUNCE`) are still per-mode and live there.
