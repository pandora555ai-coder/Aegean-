# 165 — Phone dressing + the drawing warning

The phone was re-skinned through the tokens (159) and made readable
(159d). Now it gets the theatre's language — slabs and a plaque —
without breaking the phone rules. Reference in the repo:
design/theatre-reference.html — the --slab chamfer polygon and the
.plaque shape.

Phone rules: no gradients, no veins, no filters. NO motion that is
not driven by the player's finger — a state change at a moment is
allowed, an animation is not. 44px tap targets everywhere. Zero
overflow at 360×640. Text on marble is --carve; on the ground
--marble; never --marble-3 for anything read. Do not call ElevenLabs.

1. Options (quiz, guess, trial) become marble slabs: chamfer
   clip-path, --marble, --carve text, pressed/selected state by
   weight + a --wine-2 edge, wrong at .42 in reveals. The player's own
   score becomes a plaque (name over score, the TV plaque's shape).
   The numeric slider track and thumb in --wine-2. Report: the minimum
   contrast ratio across /play phases (≥ 4.5), every tap target under
   44px (must be none), and scrollHeight − innerHeight at 360×640 in
   every /play phase (all 0).
2. Drawing warning: DRAW_WARNING_MS = 13000 in shared. When the
   drawer's remaining time crosses it, the phone's time display turns
   --ember and steps up one size (once, no animation), and
   navigator.vibrate(200) fires once where supported. At the same
   moment the server emits a host-only crowd:intensity bump of +.15
   over 400ms (through the pause-aware timer helper, so pause holds
   it). Observe with one bot slowed to submit late: report the phone
   flip time and the intensity event time relative to DRAW start —
   both ~62s.
3. Motion audit: grep the phone styles for animation and transition;
   list every match with the state that drives it. Anything not tied
   to a touch/press state is a failure — report the list.
4. npm run typecheck clean; git diff --stat server/ shows ONLY the
   warning emit (report it); a player socket receives 0
   crowd:intensity events during a draw round (report the count).

Sonnet. Playwright only for the measurements. Report each criterion
separately, under 8 lines total.
