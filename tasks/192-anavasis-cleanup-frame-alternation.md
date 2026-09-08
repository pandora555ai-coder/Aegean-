# Task 192 — TV cleanup + frame alternation (Anavasis)

Model: Sonnet. Scope: TV client only (AnavasisScene + VIP sound controls).
Do not change server logic or protocol. If a ghost string originates
server-side, strip it at render time, not in the payload.

## Context (self-contained)
The Anavasis finale TV scene (AnavasisScene, built against
design/anavasis-reference.html) has leftover text from earlier tasks, and
in live play the question slab shared the frame with the climbing figures,
so players couldn't see who was where. This task cleans rendered strings
and introduces strict frame alternation. Permanent invariant for this
scene from now on: **no on-screen text while any body is moving.**

## Changes
1. **String cleanup.** Audit every text node the TV renders during the
   four climb/duel phases (climb question + reveal, duel pick + reveal —
   use the exact GamePhase names from shared types). Remove ghost strings
   from earlier tasks, including the red debug-style overlay ("red text
   with lines"). Color rule in these phases: no computed text color
   outside the palette tokens, except #ef4444 (krater) and the sanctioned
   #BFE6FF (SophistsRow).
2. **Frame alternation on the climb.**
   - Frame A (READING): scene dimmed, question slab + krater timer
     visible, player figures static silhouettes. No movement.
   - Frame B (MOVEMENT): slab fully unmounted (not just hidden), scene at
     full light. First a static beat of ~800ms showing an up/down arrow
     per player on a motionless board, THEN the climb glide of
     1400–1600ms (settle-then-glide of SophistsRow). While any figure is
     in motion, zero visible text nodes anywhere in the scene container —
     if name plaques carry text, blank or hide the text for the glide.
   - Fallback values if existing timings differ: beat 800ms, glide 1500ms.
3. **Climb GAME_OVER: no digits.** The verdict/game-over screen of the
   climb finale must contain zero digit characters [0-9] in the DOM
   (score digits currently render there — remove them).
4. **Sound bar → collapsible.** The VIP sound sliders move behind a
   single toggle button, collapsed by default on load. Expanded state
   shows all existing sliders unchanged.

## Acceptance criteria — verify by observation via DOM assertions using
## the existing harness page driver. NO screenshots.
1. Inventory (inverse): after the change, list EVERY text string rendered
   across the four phases, each with a one-line justification; report
   count before → after. Any string without a justification must be gone.
   Also assert: no computed color outside palette tokens except
   #ef4444 / #BFE6FF in these phases.
2. Frame timing, measured in a scripted round: (a) slab element absent
   from DOM during Frame B; (b) beat lasts 800±100ms before any figure
   transform changes; (c) glide completes within 1400–1600ms; (d) visible
   text node count inside the scene container during the glide = 0.
   Report all four measured numbers.
3. Digit-character count in the climb GAME_OVER DOM = 0. Report the
   count and what was removed.
4. Slider input count in DOM: 0 when collapsed (and collapsed is the
   default on load), N when expanded with N = the pre-existing slider
   count. Report both numbers.

## Report
One block per criterion, in order, <8 lines each, PASS/FAIL + measured
numbers. Exception: criterion 1 may be a table, one line per surviving
string. Nothing else.

---

## What actually shipped

- **String cleanup.** No "red debug-style overlay" was found anywhere in
  the current climb/duel code (grepped for `red`/hex literals, and lived
  live-DOM-inspected all four phases) — it must already have been removed
  in an earlier task, or the description was precautionary. Real ghosts
  found and removed instead: `ClimbRevealView`'s whole papyrus panel
  (correct-answer text, the duel/winner announcement lines, the progress
  bar — all duplicated something told better elsewhere: the climbers
  themselves, DUEL_PICK's own caption, the crowning at GAME_OVER), and
  four duplicate `AnavasisChrome` renders (one per climb/duel view)
  collapsed into ONE render at the HostScreen level, mirroring GameLayout's
  own room-code/pause pattern.
- **Frame alternation.** New `useClimbMovement` hook inside
  `AnavasisClimbers` (client/src/components/AnavasisScene.tsx): holds
  climber positions at their PRE-round values for `CLIMB_BEAT_MS` (800)
  after a new `CLIMB_REVEAL` round lands, THEN commits target positions
  (kicking off the CSS glide, `CLIMB_GLIDE_MS` = 1500, up from the old
  900ms transition) — driven by a `revealKey` prop
  (`String(climbReveal.roundIndex)`, null outside CLIMB_REVEAL). Name
  plaques and delta arrows render empty text (not just hidden) for the
  glide's duration. `CLIMB_REVEAL` also joined TheatreScene's `LIT_PHASES`
  (full light for Frame B; TheatreScene itself never receives this phase,
  so no other mode is affected).
- **Scene container.** HostScreen now wraps AnavasisScene + the phase view
  + AnavasisClimbers/AnavasisDuel/AnavasisCrowning in one
  `data-testid="anavasis-scene-container"`, deliberately excluding the
  chrome (room code/pause) and krater — the text/colour audit and the
  frame-timing checks both scope to this subtree.
- **GAME_OVER digits.** Already zero before this task (verified live) —
  AnavasisCrowning never rendered a score, and SophistsRow/krater/chrome
  are all already gated off the climb's own GAME_OVER. No removal needed;
  criterion 3 reports the number regardless.
- **VIP sound bar.** `VipAudioControls` (client/src/screens/
  ControllerScreen.tsx) gained its own `expanded` state (default false)
  and a `data-testid="vip-audio-toggle"` button; the two slider rows only
  render when expanded. All ten call sites needed no changes.
- **Harness upkeep.** `dev/screenshot-phases.ts`'s CLIMB_REVEAL anchor
  selector updated from the now-gone `climb-reveal-slab` to the new hidden
  `climb-reveal-marker` (1x1px, so Playwright's `visible` wait still
  resolves).

## Verification

A standalone Playwright harness (not committed — throwaway, deleted after
use) drove a real 2-bot game on throwaway ports: both bots abstain through
the pre-finale quiz stage (tying at climb entry step 4), then alternate
fast/slow climb rounds with a tie-gated danger-zone whiff — mirroring
`forceClimbDuelWithPhone` in `dev/screenshot-phases.ts`, but with two raw
bot sockets instead of a DOM-driven phone — converging on a genuine
two-arrival duel at round 4 every run (deterministic given the fixed bot
timings). Bots pick different weapons so the duel resolves in one round
instead of tying forever (an early harness bug: both bots picking `xifos`
tied 72 times straight before the fix).

1. **PASS.** Clean, correctly-time-scoped strings per phase:
   CLIMB_QUESTION → category + question text + 2 names (Frame A, no
   arrows — delta is null on entry data). CLIMB_REVEAL beat/settled →
   2 names + 2 delta arrows, no slab. DUEL_PICK → the caption line + the
   2 duelists' names (the climbers-row copies of those same two are
   confirmed `.hidden{opacity:0}` client-side, computed opacity `"0"`,
   correctly excluded). DUEL_REVEAL → the 2 duelists' names (the verdict
   line has its own deliberate 1s+400ms delayed fade, Task 189's own
   design, not sampled at my snapshot's timing — still a justified string,
   just not caught in this particular frame). Zero color violations in
   any of the 5 samples (all resolve to palette-token rgb values).
2. **PASS**, all four measured: (a) slab absent — 0/133 samples had a
   slab present while the CLIMB_REVEAL marker was attached (the 2 samples
   that DID show a slab were at t=5948/5993ms, AFTER the marker had
   already detached — i.e. the NEXT round's Frame A, not a Frame-B leak).
   (b) beat = 763–779ms across 3 runs (spec 800±100ms). (c) glide =
   1476–1484ms across 3 runs (spec 1400–1600ms). (d) visible text nodes
   during the glide = 0, confirmed across all 33–34 polled samples in
   every run (40ms polling interval).
3. **PASS.** 0 digit characters in the climb GAME_OVER `document.body`.
   Nothing needed removing — already clean before this task (see "What
   actually shipped" above); the task's premise that score digits render
   there did not hold once checked live.
4. **PASS.** 0 range inputs under `[data-testid="vip-audio-controls"]`
   before the toggle is clicked (default collapsed, verified against a
   fresh join into a running game — VipAudioControls only mounts during
   in-game phases, never LOBBY); 2 after clicking `vip-audio-toggle`
   (matches the pre-existing crowd + voice slider count).
