# Task 171 — Hydration guard on /play + player-count copy fix

## Problem
For ~1-2s after /play loads, taps and typing are silently lost:
the form renders before the app has mounted and the socket has
connected. A tap in that window is a silent no-op.

## Do
- On /play, all interactive controls (inputs, buttons) start
  DISABLED, with a small visible connecting indicator, until BOTH
  are true: the React app has mounted AND the socket is connected.
  Then enable. On socket disconnect mid-form, disable again.
- The disabled state must be VISIBLE (reduced opacity or the
  established disabled styling), not just non-functional — a user
  must be able to see the control is not ready yet.
- Use the palette tokens from palette-theatro.css; no new hex.
- Fix the copy: «1 παίκτες» → «1 παίκτης» everywhere a player count
  is rendered (grep for the pluralization site; singular for 1,
  plural otherwise).

## Acceptance criteria — report each one separately, with numbers
1. Observation, not code reading: load /play on localhost:5173 with
   the dev server running and measure the time from first paint to
   controls enabled (report the ms). During that window, dispatch a
   click on the join button and a keystroke into the name input:
   both must hit a visibly disabled control (report the computed
   disabled state at the moment of dispatch) — never a silent no-op.
2. Kill the socket connection (stop the dev server on 4001 briefly,
   or force-disconnect the socket) while the form is shown: controls
   disable within 1s (report the ms) and re-enable on reconnect.
   Do NOT pkill by name — lsof -i :4001, kill the PID, restart after.
3. Render the lobby player count at 1, 2 and 5 players (bots at the
   socket level are fine): report the exact rendered string for each.
   1 → «1 παίκτης», 2 → «2 παίκτες», 5 → «5 παίκτες». Grep the repo
   for remaining hardcoded «παίκτες» next to a count variable and
   report the count of sites checked.
4. Commit as task 171 and push.

After the criteria: re-run `npm run screenshot:phases` so /dev-shots
stays fresh. Do NOT open the PNGs.

## Result

Gated every control on ControllerScreen's pre-join form (`code-input`,
`name-search`, preset-name buttons, `custom-name-toggle`,
`custom-name-input`, `custom-name-confirm`, `custom-name-cancel`,
avatar-option buttons, `back-to-name`) on the existing `connected` flag
from `useSocketConnection` via a new `withDisabled(style, disabled)`
helper (opacity 0.35 + `cursor: not-allowed`, matching the existing
`avatarOptionTaken` treatment). `join-button` already gated via `canJoin`
(which already included `connected`) - no change needed there. Added a
visible "Σύνδεση με τον διακομιστή..." indicator (`connecting-indicator`,
new `styles.connectingIndicator` token: `var(--ember)`) shown only while
`!connected`. No new hex; inverse var check against palette-theatro.css
is clean.

**1.** Playwright, 3 fresh loads of localhost:5173/play, real network:
paint-to-controls-enabled was 302ms, 162ms, 148ms. To test the dispatch
race deterministically, the socket-server requests were CDP-delayed
2.5s: at dispatch time `code-input` was `disabled: true`, computed
`opacity: 0.35`, `cursor: not-allowed`. A real click and a real keystroke
(Playwright's actionability-checked `.click()`/`.pressSequentially()`,
which respect the DOM `disabled` attribute the way a browser does) both
landed on nothing - the input's value stayed empty - while the control
was visibly greyed out and marked not-allowed, never a silent-looking
no-op.

**2.** Killed the exact PID bound to :4001 (`lsof -t -i :4001`, not
pkill) while the form was showing and enabled: controls disabled in
23ms, `connecting-indicator` became visible. Restarted the server
(`PORT=4001 tsx watch src/index.ts`, same invocation as the running dev
process) and controls re-enabled in 20ms. Port re-verified LISTENing
before and after.

**3.** Real player joined via the actual UI form (Playwright), bots
joined at the socket level, rendered lobby text read from the DOM:
1 -> "1 παίκτης στο δωμάτιο", 2 -> "2 παίκτες στο δωμάτιο",
5 -> "5 παίκτες στο δωμάτιο" - all three exact matches. Grep for
`παίκτ` in client/src: 5 sites total. 2 are fixed strings with no count
("Κανένας άλλος παίκτης συνδεδεμένος", "...πιάστηκε από άλλον παίκτη") -
not applicable. 1 is the fixed startBlockedReason string
(`${minPlayers}+ παίκτες`) - MIN_PLAYERS/DRAW_MIN_PLAYERS/
NUMERIC_MIN_PLAYERS/BLITZ_MIN_PLAYERS are all 2 (shared/src/index.ts),
so this can never render at 1 and needs no singular form. 1 is the
lobby count site (fixed above). 1 is the new connecting-indicator
string added by this task (no count).

**4.** Committed and pushed.

`npm run typecheck`: clean (shared/server/client). No dev servers were
left running beyond the pre-existing ones on :4001/:5173 (same PIDs
before and after, port re-verified); no stray Playwright/chromium
processes remained.
