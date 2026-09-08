# 189 — Η Ανάβασις on the TV

Port design/anavasis-reference.html (in the repo — the approved
look) into the host screen for the climb finale phases. Server
payloads exist (188a-c); this is client-only. The phone is 190.

## Scope

- New host views for CLIMB_QUESTION, CLIMB_REVEAL, DUEL_PICK,
  DUEL_REVEAL rendering the reference's scene: the rock, the stair
  (12 visible steps + terrace at CLIMB_TOP), the glowing temple,
  the far city and theatre below, mist, torch pairs. The scene is
  generated SVG like TheatreScene — a sibling component
  (AnavasisScene), never a bitmap. Palette tokens only; the scene
  SVG is art (standing exception) but reuse the existing tokens
  where the reference does.
- Sophist figures on lane fractions (the reference's LANE_F),
  vertical travel via bottom, 900ms; name plaques through
  greekUpper; NO digits anywhere (steps are not scores).
- Deltas above heads: ↑ / ↑↑ / ↓ / ↓↓ in ember, from the reveal
  payload's delta and fastest fields.
- Duel: scrim + two large duelists + face-down tablets flipping on
  DUEL_REVEAL (the reference's card flip), verdict line at top,
  tieCount shown as «Ξανά» beats. DUEL_LOCKED tightens the wait
  (already server-driven).
- Crowning at GAME_OVER (climb only): winner into the temple beside
  Socrates, wreath descent by the reference's deterministic math,
  leaves, cheer. isTrialResult gating hides all digits.
- Socrates stays mounted (SocratesFigure) at the temple threshold.
- Every view survives a first render with a NULL payload (house
  pattern). The marble feTurbulence stays the single HostScreen
  definition; AnavasisScene gets no live filters.

## What was built

- client/src/components/AnavasisScene.tsx (new): the background
  (rock, stair, temple, far city+theatre, mist, torches — module-
  load deterministic RNG, TheatreScene's own discipline) plus three
  more exports off the SAME geometry: AnavasisClimbers (the players
  on the stair, no SophistsRow reuse — lane fractions, no digits,
  ↑/↑↑/↓/↓↓ deltas), AnavasisDuel (scrim, two duelists, face-down-
  to-front tablet flip, verdict line, tie count), AnavasisCrowning
  (winner + wreath + leaf-fall, positioned at the temple). Also
  AnavasisChrome (room-code corner + pause overlay) since all four
  climb/duel views bypass GameLayout's read column entirely — the
  whole scene IS the layout.
- Four new host views (ClimbQuestionView/ClimbRevealView/
  DuelPickView/DuelRevealView), one per phase, each rendering its
  own small MarbleSlab/caption over the Anavasis world rather than
  inside GameLayout.
- client/src/components/SocratesFigure.tsx: a climb pose (temple
  threshold, ANAVASIS_TEMPLE_BOTTOM_CQH) for the four phases plus
  the climb's own GAME_OVER (via a new `climbFinale` prop — `phase`
  alone can't tell a climb verdict from a trial one).
- client/src/screens/HostScreen.tsx: state + socket handlers +
  state:sync cases for all four payloads (mirroring TRIAL_QUESTION/
  TRIAL_REVEAL's own pattern exactly); `isClimbFinale`, set true by
  any climb/duel payload and cleared only at LOBBY, is what swaps
  AnavasisScene+AnavasisClimbers+AnavasisDuel in for TheatreScene+
  SophistsRow, straight through DUEL_PICK/DUEL_REVEAL (where
  climbQuestion/climbReveal are both null again) and the climb's own
  GAME_OVER; `showShell` (the GameLayout wrapper) now excludes the
  four climb phases, `timer`/Krater does not (still shown, off
  `inGamePhase`). Climber positions/steps are read off whichever of
  climbQuestion/climbReveal is live and held past that
  (lastClimbClimbersRef) so the row never blanks between rounds.
- shared/src/index.ts: `isDuelPickHostPayload`/
  `isDuelRevealHostPayload` type guards (188b shipped the payload
  types but not these two — 188a's own isClimbQuestionHostPayload/
  isClimbRevealHostPayload were the pattern).
- dev/screenshot-phases.ts: a THIRD game (quiz, short, finaleMode
  'climb', questionTimeMs floored to 10000, powerUpsEnabled off)
  captures the four new phases the same way blitz got its own
  second game. `forceClimbDuel` rigs two bots to force a genuine
  2-way arrival reliably: they skip the plain quiz stage entirely
  (tying at score 0, so climbEntryStep gives them the same entry
  step), then alternate every climb round which of the pair answers
  fastest. That alone isn't quite enough — see the bug found below.
  DUEL_PICK/DUEL_REVEAL are best-effort (SOCRATES_CAPTURE's own
  "detected, may not fire" shape), CLIMB_QUESTION/CLIMB_REVEAL are
  hard-required.

## Bug found and fixed before measuring: lane collision above 5 players

design/anavasis-reference.html's own LANE_F was a fixed 5-slot
array (its demo never had more than 5 players); MAX_PLAYERS is 8,
and `LANE_F[joinIndex % 5]` would seat climber 6 in the exact same
lane as climber 1 — an overlap the reference itself never could
have shown. Generalized `laneLeftPct` to any climber count (same
gap formula, reproduces the reference's own 5 values exactly at
n=5, packs tighter as n grows so the total span never exceeds the
original 0.72). Verified no overlap at n=8 (criterion 3).

## Bug found and fixed while forcing a duel for the screenshot harness

`forceClimbDuel`'s first version (alternating fast/slow every
round) reliably kept the pair tied every OTHER round but could
still let one arrive alone: tied two steps below CLIMB_TOP, a
single +2/+1 split sends only the fast one over. Reproduced directly
(a solo WINNER where a DUEL was expected). Fixed with a reactive
"danger zone" check (tracked via each bot's own `yourStep`): tied
exactly at CLIMB_TOP−2, both deliberately answer wrong instead,
re-timing past the one round that would have split them. Confirmed
in a full run: tied at 8 (CLIMB_TOP−2) before round 5, both missed
round 5 on purpose (7,7), converged again at round 7 (10,10) →
DUEL_PICK → DUEL_REVEAL, captured cleanly.

## Acceptance criteria

1. **FULL BOT GAME** — `?bot=5`, finaleMode climb (quiz, short,
   questionTimeMs 10000, powerUpsEnabled off — none of that changes
   the phase machine, only how fast the harness reaches it), driven
   to GAME_OVER on the real host page: server phase sequence
   `... STAGE_ANNOUNCE > CLIMB_QUESTION > CLIMB_REVEAL ×6 > SOCRATES
   > GAME_OVER`; TV testids observed in order: `climb-question-slab
   > climb-reveal-slab > anavasis-crowning` (no duel this run — a
   solo winner, Δημήτρης, isTrialResult true — expected, ~2.5%
   chance per game per 187b's own Monte Carlo). **Console errors: 0.**
   PASS.
2. **SCREENSHOT HARNESS** — `npm run screenshot:phases` extended
   with a third game (climb, forced duel via `forceClimbDuel`):
   **21/21 TV phase screenshots, 9/9 phone screenshots** (17 + 4:
   CLIMB_QUESTION, CLIMB_REVEAL, DUEL_PICK, DUEL_REVEAL all
   captured — the forced duel landed). Not opened. PASS.
3. **BOTTOM-EDGE MEASUREMENTS** — climber figures' own bounding-box
   bottom edge at climb entry (the widest fan, before anyone has
   moved), 1280×720, at n = 3, 5, 6, 8 total players (bot count
   n−1 + one real joined player, matching the density-scale
   convention): **614.2px at every count** — identical across all
   four, because (unlike SophistsRow) nothing in AnavasisClimbers
   scales by player count; vertical position is per-STEP only.
   Largest observed: **614.2px, under the 690px limit**. Horizontal
   overlap check (adjacent climbers' bounding boxes) at every count,
   n=8 included: **0 overlaps** (confirms the lane-collision fix
   above). PASS.
4. **PAYLOAD-FLOOR INVERSE CHECK** — the client's own rendered
   `data-step` attribute, polled every second for ~40s per run
   across all four player counts (real climbs in progress, not just
   entry): **793 values total** (618 from the n=3/6/8 batch + 175
   from n=5), **min = 0**, **0 NaN/undefined**. No figure rendered
   off-scene. PASS.

Typecheck passes in shared, server and client. Every throwaway
server/client pair (screenshot harness on 3901/5902, the console-
error/phase-sequence check on 3902/5903, the bottom-edge/floor
check on 3903/5904) exited cleanly; nothing left on any of those
ports afterward.
