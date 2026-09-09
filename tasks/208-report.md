# Task 208 — Η Μνήμη της Αγοράς: TV scene + phase views

TV only, matching design/agora-reference.html. New: `client/src/components/
AgoraScene.tsx` (the backdrop, TheatreScene's sibling, ported from the
reference's own 1600×900 coordinate space verbatim), `client/src/screens/
host/AgoraExposeView.tsx`/`AgoraQuestionView.tsx`/`AgoraRevealView.tsx`
(the three phase views, reusing GameLayout/MarbleSlab/CheckMark exactly as
QuestionView/RevealView do), `dev/agora-scene-check.ts` (a dedicated
Playwright verification harness, screenshot-phases.ts's own spawn/cleanup
shape on its own throwaway ports 3902/5903). Edited: `HostScreen.tsx` (state,
handlers, socket wiring, the backdrop swap, `AGORA_REVEAL_GRID_MS`), no
server code touched, `shared/src/agora.ts` untouched. `npm run typecheck`
(shared+server+client): clean.

The backdrop swap is lighter than Anavasis's: only TheatreScene is replaced
for the three agora phases (`isAgoraScenePhase`) — GameLayout, the sophists
row, Socrates and the krater stay exactly as they are for every other
in-game phase, per the task's "reuse the existing conventions" instruction.
AGORA_REVEAL gets its own two-stage frame alternation (the Anavasis 192
pattern, applied inside GameLayout instead of by bypassing it): a 1800ms
'grid' beat (the options slab, market still closed) then 'proof' (slab
unmounted to a 1×1 hidden marker, market restored with a highlight) — the
stage lives in HostScreen since the scene and the slab are siblings, both
driven off one value.

## Criterion 1 — SPEC FIDELITY
One seeded round (seed 1064351456): stalls fish/krasati/5, fruit/ladi/4,
amphorae/ochra/2, animals `{dog:false, goat:false, cat:true, geeseN:0}`.
- **Goods per stall, spec vs rendered DOM**: amphorae 2/2, fish 5/5, cloth
  0/0, pottery 0/0, fruit 4/4 — every pair equal.
- **Animals, spec vs DOM**: dog false/false, goat false/false, cat
  true/true, geese 0/0 — every pair equal.
- **Awning fills**: `[#8E2440, #9AA860, #E8A14A]` — all 3 are exactly
  AGORA_COLOURS hexes (krasati/ladi/ochra), the sanctioned 5. PASS.

## Criterion 2 — FAIRNESS (inverse)
Checked by reading `document.querySelectorAll('[data-testid="agora-market"]')
.length` the instant each of the round's 3 `agora_question:show` events
landed (event-driven, not DOM-visibility polling — a whole round can finish
in a couple of seconds since both players answer in ~200ms, fast enough that
a re-armed `waitForSelector` missed a question's window outright in an
earlier version of this harness; fixed before this run).
- **Question 1/3: 0. Question 2/3: 0. Question 3/3: 0.**
- All three zero: PASS. The market `<g>` is never rendered at all during
  AGORA_QUESTION (an absent node, not a hidden one).

## Criterion 3 — PROOF BEAT
This round's 3rd reveal (kind 'count'): subject
`{"kind":"stall","type":"fruit","present":true}`.
- **Highlight elements** (`[data-testid="agora-highlight"]`) during the
  proof stage: **1**.
- **Positioned on the correct subject**: checked by locating that one
  highlight INSIDE `[data-testid="agora-stall"][data-type="fruit"]` (the
  spec reference for this round's fruit stall) — PASS.
- **Announcement text over the scene during the proof**:
  `[data-testid="agora-reveal-slab"]` count = **0** (AgoraRevealView renders
  only the hidden 1×1 marker once 'proof' begins).
- Screenshot `AGORA_REVEAL_PROOF.png` confirms visually: a gold ring around
  the middle (fruit) stall, both players' +1495 deltas showing, no slab.

## Criterion 4 — RECONNECT REDRAW
Reloaded the TV mid-AGORA_EXPOSE (the room was still in that phase on
reattach, confirmed by the server log).
- **Pre-reload counts**: `{amphorae:2, fish:5, cloth:0, pottery:0, fruit:4}`,
  animals `{dog:false, goat:false, cat:true, geeseN:0}`.
- **Post-reload counts**: byte-for-byte identical to the above.
- **Pre/post awning hexes**: `[#8E2440, #9AA860, #E8A14A]` both times.
- Counts identical: PASS. Hexes identical: PASS.
- `npm run typecheck`: clean (see above).

## Notes
- The reveal's true (host-only) `proof` is asymmetric — a player socket
  never receives it (Task 207 by design). The harness's own player sockets
  can't be used as the ground-truth oracle for criterion 3, so it sniffs the
  TV page's raw WebSocket frames directly (Playwright's `websocket` event)
  for the host-shaped `agora_reveal:show` payload — genuinely independent of
  whatever AgoraScene does with it, not just "the DOM agrees with itself."
- Socrates keeps the plain default pose (`left:7%`) for every agora phase,
  per the task's explicit instruction not to invent a new treatment — this
  is the same position a normal quiz QUESTION already uses.
- An absent-subject reveal (existence's own "ΔΕΝ υπήρχε" phrasing) renders
  NO highlight at all, since nothing present exists to point at — verified
  this run's Q1/Q2 both happened to ask about present subjects too (fish,
  amphorae), so every highlight this run rendered exactly one ring/rect.
