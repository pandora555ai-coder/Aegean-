# Task 252 — Η Λήθη: remove Socrates from the scene, and the 1s background flash

HEAD at start: d3cb437 (Task 251's commit).

"Η Λήθη" is a display-only title (Task 231) for `full`'s stage 5 — the
mechanic underneath is the agora scene (`AgoraScene.tsx`, `HostScreen`'s
`isAgoraScenePhase`). Both defects live there.

## Diagnosis of (b), before any fix

**Family: a conditional render keyed on state that is briefly absent — NOT
the PHASE_CHANGED-before-payload race.** `HostScreen.tsx`'s `agoraSpec` is
explicitly `null` for the *entire* `AGORA_QUESTION` phase and for
`AGORA_REVEAL_GRID_MS` (1800ms) of the reveal (`agoraSpec = phase ===
'AGORA_EXPOSE' ? ... : agoraProofShowing ? ... : null`), and
`AgoraScene.tsx` rendered its whole `Market` group — ground, torches, glow,
stalls, animals, ALL of it — behind one `{spec && <Market .../>}` gate. The
ground is not answer-bearing content, but it disappeared together with the
content that is, for the fairness rule's sake.

**Measured** (`dev/lethe-scene-check.ts`, jumping `full` straight to stage 5
via `buildRoomQuestions` + `startAgoraSegment`, 4 real players, 40ms DOM
samples): the `agora-market` element (the only signal available pre-fix)
was absent from **1211ms before the last submit through 1823ms after it** —
a continuous ~3.0s gap that straddles the whole question. Restricting to
the actual answer→reveal transition window (−1000ms…+3000ms around the
last submit, 100 samples): **70/100 samples had the background absent**,
ending at **+1823ms** — within 23ms of `AGORA_REVEAL_GRID_MS = 1800ms`
exactly. This is far longer than Task 161's 35-145ms PHASE_CHANGED flash,
confirming this is NOT that family.

**What's on screen during the gap**: the static sky layer (stars, moon,
Acropolis silhouette — always present) plus the sophist figures/plaques,
the krater, the question slab, and (before the (a) fix) Socrates — but no
ground, no torches, no stalls. Sophists literally standing on the bare sky
gradient, which is what "avatars are briefly standing on nothing" describes.

## Fixes applied

**(b)**: `AgoraScene.tsx` — split the old `Market` group into `MarketGround`
(ground rect, torch glow, torches — none of it depends on `spec`, none of
it reveals a round's answer) rendered **unconditionally**, and `Market`
(stalls + animals only, still `data-testid="agora-market"`, still gated by
`{spec && ...}` — the fairness rule is completely intact for the content
that actually matters). No PHASE_CHANGED emit touched, no timer touched —
this is a pure render change.

**(a)**: `HostScreen.tsx` — `<SocratesFigure>` is now gated behind
`!isAgoraScenePhase` (the same flag that already selects `AgoraScene` over
`TheatreScene`). An `AGORA_MOMENT` beat is phase `'SOCRATES'`, not one of
the three agora scene phases, so he still speaks normally right after a
reveal — only the three scene phases (`AGORA_EXPOSE`/`AGORA_QUESTION`/
`AGORA_REVEAL`) hide him.

## Acceptance criteria

**1. Diagnosis** — given in full above: family (conditional render on
briefly-null state, `agoraSpec`/`{spec && <Market/>}`), measured gap
(~1823ms post-submit, 70/100 samples absent in the transition window,
30+ px² element = the whole ground/torch/stall/animal group), and what
remains on screen (sky, sophists, krater, slab).

**2. (b) fixed, same measurement before/after** (`dev/lethe-scene-check.ts`,
one question cycle, 4 real players, 40ms samples):
| | longest background-absent gap | transition window [-1000,+3000ms] absent samples |
|---|---|---|
| before | 3034ms (−1211ms…+1823ms around last submit) | 70/100 |
| after | none | **0/100** |

**3. (a) done** — `socrates-figure` count during the whole Λήθη scene
window (132 samples spanning pre-submit through reveal proof): **132/132
before → 0/132 after**. Confirmed he still renders elsewhere, observed in
the SAME run both times: **LOBBY: 1** (before starting anything) and a
**standalone quiz `QUESTION` phase: 1** (an unrelated mode/stage, real
players, no shortcuts) — both stages unaffected by the `isAgoraScenePhase`
gate, unchanged before and after.

**4. Inverse — nothing moved.** Sophist figures (`[data-testid="sophist"]`,
4 of them) and plaques (`[data-testid="sophist-name"]`) and the question
text (`[data-testid="question-text"]`) were captured in the SAME
`AGORA_QUESTION` moment before and after removing Socrates:
```
sophists   x=205.6/461.6/717.6/973.6  y=476.1  w=100.8  h=197.1   (all 4, before == after)
plaques    x=212.8/468.8/724.8/980.8  y=622.2  w=86.4   h=15.8    (all 4, before == after)
question   x=184.5  y=175.0  w=731.7  h=184.0                     (before == after)
```
Byte-for-byte identical in every field, before vs after — removing a
sibling element (`SocratesFigure`, rendered outside the read column/sophists
row entirely) moved nothing. Task 242's Numline invariant
(`NUMLINE_LABEL_GAP_CQH` in `NumericRevealView.tsx`) is unrelated code with
zero import relationship to either file this task touched (`grep` for
agora/socrates imports in `NumericRevealView.tsx`: none) — the diff is
`git diff --stat`-confirmed to be exactly `AgoraScene.tsx` +
`HostScreen.tsx`'s one JSX line, so there is no mechanism by which it could
regress. Could not re-run `dev/242-numeric-check.ts` itself to confirm by
execution — it dies on `getByTestId('custom-name-toggle')`, a UI element
Task 241 removed entirely (the whole custom-name entry flow, not just a
NAMES constant), which is outside this task's sanctioned "repair only the
NAMES constant" license. Documented, not fixed.

## Regression checks run

- `dev/agora-scene-check.ts`: 6/6 PASS (spec fidelity, fairness — "market-
  layer nodes visible = 0" all 3 questions, proof beat, reconnect redraw) —
  the `agora-market` testid's "0 nodes during AGORA_QUESTION" contract is
  unchanged by the ground/content split.
- `dev/agora-sophists-check.ts`: 5/5 PASS (expose hiding, question
  visibility + live lock-in ticker, reveal hide/reshow) — Task 210's
  sophists-row-vs-market-frame behavior is untouched.
- `npm run typecheck -w @game/client`: clean.

## Scope

Only `client/src/components/AgoraScene.tsx` and
`client/src/screens/HostScreen.tsx` changed (one JSX line + its comment).
No PHASE_CHANGED emit reordered, no other stage, audio, name, or scoring
code touched.
