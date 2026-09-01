# Task 137 — Trial: the score column empties; GAME_OVER without numbers

Model: Sonnet.

DECIDED. This REPLACES task 128's elimination display: eliminated
rows no longer stay in the column at 0.42 — they LEAVE it. Thecolumn empties round by round until one player remains; the column
itself becomes the drama. And after a trial, GAME_OVER shows NO
scores anywhere — the winner is announced without a number (trial
winners can finish negative; the prize is the discipleship, not
points). Ranking, if shown, is SURVIVAL ORDER: winner first, then
reverse elimination order. Applies wherever the trial runs:
standalone quiz AND full mode.

## Implementation rules

- The existing sink/fade at the reveal STAYS as the first beat;
  removal happens AFTER the reorder tween completes (counter 1800ms
  + reorder 400ms) — an unmount mid-tween makes the other rows
  jump, and the machinery is transform-only.
- Removal reads results[].eliminated, NEVER score<=0 — the 128
  trap: a sudden-death winner at negative life must stay in the
  column at his own winning reveal.
- Standalone draw and numeric GAME_OVER are UNTOUCHED — they keep
  their scored endings.

## Result

### Server

- `server/src/state.ts` — `TrialState` gained `eliminationOrder: string[]`
  (chronological, oldest first).
- `server/src/phases.ts` (`startTrial`, `endTrialQuestion`) — initializes
  it empty, appends each reveal's `results[].eliminated` playerIds to it —
  **except when `next.kind === 'SUDDEN_DEATH'`**. That gate matters: the
  round that *declares* sudden death scores everyone with the real
  (non-suddenDeath) formula, so a player who walks in at exactly 0 life
  and answers correctly and instantly still nets `lifeAfter <= 0` and
  shows `eliminated: true` — including the eventual winner. Recording
  that round's eliminations would both duplicate the winner in
  `buildGameOver`'s standings and (client-side) permanently remove their
  row before the decider ever runs.
- `server/src/payloads.ts` (`buildGameOver`) — when a trial declared a
  winner (`winnerPlayerId` set), standings are now `[winner, ...reverse(
  eliminationOrder), ...anyone left over sorted by score]` instead of
  score order. Added `isTrialResult: true` on that branch, `false` on the
  plain score-ranked branch.
- `shared/src/index.ts` — `GameOverPayload.isTrialResult: boolean`.

### Client

- `client/src/screens/host/PlayerScoresPanel.tsx` — new `confirmedOutPlayerIds`
  prop, separate from the existing `eliminatedPlayerIds` (fade/sink,
  unchanged). A new `useRemovedIds` hook schedules each newly-confirmed id
  for permanent removal after `REORDER_DELAY_MS + GLIDE_MS` (2200ms) from
  when it first appears, keyed on a joined-string dependency (not the raw
  array, which is a fresh instance every render) so the timer isn't
  restarted every render. Removal is applied as a **final filter** on
  `useDisplayOrder`'s already-ordered output — not fed into the
  order/delay pipeline itself — so a row's disappearance triggers the
  existing FLIP glide immediately, with no second 1800ms wait bolted on.
- `client/src/screens/HostScreen.tsx` — new `trialConfirmedOutPlayerIds()`:
  only at `TRIAL_REVEAL`, and only when `!trialReveal.nextSuddenDeath` —
  mirrors the server-side gate exactly, for the same reason.
- `client/src/screens/host/GameOverView.tsx` — `#{standing.rank}` and
  `{standing.score}` are omitted entirely when `gameOver.isTrialResult`;
  everything else (avatar, name, row order) is untouched. The row order
  alone conveys the ranking.
- `client/src/screens/DevSceneScreen.tsx` — mock `GameOverPayload` updated
  with `isTrialResult: false` (typecheck).

`npm run typecheck --workspaces` passes clean on all three workspaces.

## Verification

Built a throwaway bot+Playwright harness (not committed) against a scratch
server/client pair, driving real games over sockets and reading the TV's
actual DOM.

### 1. The column empties

4-player quiz run to GAME_OVER (staggered quiz scores → staggered trial
deaths, engineered so eliminations land in different rounds): the trial ran
11 rounds. Server-observed elimination rounds: round 1 (Ελένη, life 0→-151),
round 10 (Νίκος, 133→-18), round 11 (Μαρία, 132→-19, `next=WINNER`).
GAME_OVER standings (survival order, confirmed exactly reverse of
elimination order): Γιώργος #1 (11925, winner), Μαρία #2 (-19, eliminated
LAST), Νίκος #3 (-18), Ελένη #4 (-151, eliminated FIRST).

Row-count/timing, isolated with a clean 2-player repro (one elimination,
no sudden death) using `page.locator(...).count()` at fixed checkpoints:
- Reveal appears: **rows=2**, `data-eliminated=true` count=1 (sink+fade
  fires immediately).
- t+1005ms: **rows=2** (not yet removed).
- t+2309ms: **rows=1** (removed — between 1005ms and 2309ms, consistent
  with the 2200ms REORDER_DELAY_MS+GLIDE_MS target).
- t+2811ms: **rows=1** (stable).

Monotonic decrease confirmed (2→1); delay between reveal and unmount
measured at **~2.2–2.3s**, at least the required ~2200ms tween total.

### 2. Sudden death survives the flag

Engineered whole-group sudden death (both players enter the trial at life
0, both lose the first round together): server round 1 revealed
`next=SUDDEN_DEATH`, both `lifeAfter=-151`, `eliminated:true` for BOTH
(the real per-round formula, since this round wasn't sudden death yet).

Client, at that transitional reveal: **rows=2, data-eliminated=true
count=2** (both sink+fade, matching task 128's existing behaviour) —
**and 2413ms later, past the removal window, Γιώργος's row was still
present** (`rows=2`, `Γιώργος present=true`). The decider round then
revealed `next=WINNER`, Γιώργος `answerRank=1`, `eliminated:false` for
both (forced false — sudden-death scoring), `lifeAfter=-151` unchanged.
GAME_OVER: Γιώργος rank 1, score **-151** — the winning duelist, at
negative life, was never wrongly removed, and is the sole entrant left
standing in the final payload.

### 3. GAME_OVER without numbers

Same sudden-death run's GAME_OVER view, scanned via a DOM tree-walk for
any text node containing a digit: **`[]` — zero matches.** Winner's name
("Γιώργος") present via `winner-banner`. Order shown vs. elimination
order: only 2 entrants here (Γιώργος winner, Ελένη eliminated) — reverse
trivially holds. The 4-player run above is the stronger check: shown
order Γιώργος→Μαρία→Νίκος→Ελένη is the exact reverse of elimination order
Ελένη→Νίκος→Μαρία.

### 4. Inverse: scored endings untouched

- **Draw** (standalone, 4 bots): `isTrialResult=false`, GAME_OVER shows
  real scores — observed **Γιώργος=1497**.
- **Numeric** (standalone, 2 bots, separate quick run): reached GAME_OVER
  cleanly through all 5 questions — `isTrialResult=false`, standings
  **Γιώργος=2000, Ελένη=2000** (both rank 1).

No `[PAGEERROR]` / `[CONSOLE ERROR]` observed in any run (checked via
`page.on('pageerror'/'console')`), ruling out a client crash as an
explanation for any of the above.

## Out of scope

Trial balance constants, phone views (the eliminated spectator view
already exists, 129), Socrates lines, the full-mode stage cards.
