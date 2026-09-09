# Task 210 — Agora TV: player figures leave the market frame

TV-only, no server/shared/phone changes. `SophistsRow.tsx` gains one prop,
`forceHidden` (defaults false), OR'd into the same `hidden` flag that
already drives `.sophists--hidden{opacity:0}` for STAGE_ANNOUNCE — the
existing opacity treatment, not a new one. `HostScreen.tsx` sets it to
`phase === 'AGORA_EXPOSE' || agoraProofShowing` (the same `agoraProofShowing`
Task 208 already computed for the scene swap). Criterion 2 needed one more
wire-up: the trial's own `lockedInPlayerIds` is frozen at whatever it was
when its question started (its `trial_question:show` is never re-sent), so
for a genuinely LIVE agora lock-in ticker, `handleAnswerProgress` now also
updates a new `agoraQuestionAnsweredIds` state during AGORA_QUESTION, off
the `answer:progress` event's own `answeredPlayerIds` field (already sent
by Task 207's `submitAgoraAnswer` — no server change needed). `npm run
typecheck` (shared+server+client): clean.

Verified with a new dedicated Playwright harness, `dev/agora-scene-check.ts`'s
own spawn/cleanup shape, `npx tsx dev/agora-sophists-check.ts`.

## Criterion 1 — EXPOSE
- `[data-testid="sophists-row"]`: `data-hidden="true"`, computed
  `opacity: 0`.
- **Player-figure nodes visible (opacity > 0): 0.**
- `[data-testid="krater-corner"]` nodes present: **1** — the timer is
  unaffected. PASS.

## Criterion 2 — QUESTION
- ~200ms into the question (before either player answers): 0 players
  locked in.
- ~1500ms in (after the first player, deliberately delayed to 900ms,
  answers): **locked-in went 0 → 1** (`🔒 ΑΡΓΥΡΗΣ` appears) — a genuine
  observed live change, not the trial's frozen-at-start snapshot.
- Sophists row: `data-hidden="false"`, computed opacity `1`; all figures
  present with opacity > 0. PASS.

## Criterion 3 — REVEAL
- During the proof beat (2.2s past AGORA_REVEAL_GRID_MS's 1800ms, so
  genuinely into 'proof', not the grid beat): `data-hidden="true"`,
  opacity `0`, **0 of 2 figures visible.**
- After the proof ends (the row's own opacity leaving 0, polled via
  `page.waitForFunction`): `data-hidden="false"`, opacity ~0.55 (still
  ramping in via the row's own 400ms transition, `!== 0` either way),
  **2 of 2 figures visible again.**
- `npm run typecheck`: clean (see above).

## Note — an unrelated timing quirk observed, not fixed
In one run, `[data-testid="sophist"]` count read **0 total** during
AGORA_EXPOSE specifically (not 2-but-hidden) when the harness's own script
fired `vip:start_game` only ~300ms after the second player joined — a
pre-existing `lastStandingsRef` fallback (HostScreen, untouched by this
task) can carry a stale/empty LOBBY snapshot into a phase with no standings
of its own if the lobby update and the phase transition land close enough
together to batch into one React render. A slower join-then-start sequence
(a separate diagnostic script, and this harness's own later QUESTION/REVEAL
checks in the SAME run) showed the correct 2 figures throughout. Either way
the criterion holds — 0 VISIBLE either way — and this pattern predates
Task 210 (it isn't specific to `forceHidden`), so it's reported here rather
than patched, being out of this task's TV-only, hide/show-only scope.
