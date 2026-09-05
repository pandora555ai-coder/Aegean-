# 156a — Blitz mode: server, shared, bots (no UI)

A true/false blitz. All players get the SAME K statements in the same
order, each at their own pace, swiping right = ΣΩΣΤΟ, left = ΛΑΘΟΣ.
Correct +50, wrong −25, unanswered 0. BLITZ_DURATION_MS 30000, early
end when every player has finished. Display name «Η Παλαίστρα».

Half of this exists on branch `blitz-wip` (9503a09): server/src/blitz.ts,
modes/blitz.ts, shared BLITZ_STATEMENTS (218 authored statements),
plus phone/TV views that are now obsolete — main has changed too much
to merge or rebase. Do NOT merge the branch. Copy the server and
shared pieces file by file onto main, adapt them, and leave the branch
untouched.

Rules: phases BLITZ → BLITZ_REVEAL, standalone mode registered like
draw/numeric (registry, VIP-selectable, minPlayers 2). The answer key
never leaves the server before BLITZ_REVEAL. Same event, different
payloads to host vs players. All timers through the shared timer
helper. PHASE_CHANGED is emitted before the show payload — views must
survive a NULL payload (stub views are fine here; UI is 156b/156c).
Do not call ElevenLabs.

1. Shared: BLITZ_STATEMENTS count (must be 218), BLITZ_K = 12,
   BLITZ_DURATION_MS, the payload types. Report the counts and the
   file list copied from the branch vs written new.
2. Observe a 5-bot standalone blitz game: every bot received the same
   12 statements in the same order; each bot's score equals
   50·correct − 25·wrong; the phase ended early once all five finished
   (report the phase length in ms vs 30000).
3. Leak: a player socket during BLITZ receives 0 payloads containing
   the answer key; the host payload carries per-player progress counts
   only, never a player's individual answers. Report both counts.
4. Bots swipe at the socket level with a random 400–1500ms delay per
   statement. Stub BlitzView / BlitzRevealView on /host and a stub
   phone view render without error on a null payload. Typecheck clean;
   npm run screenshot:phases still produces its PNGs (report count —
   the two new phases may be missing until 156b; say so). Commit as
   task 156a and push.

Sonnet. Report each criterion separately, under 8 lines total.
