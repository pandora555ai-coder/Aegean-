# Task 321 — beats harness: MutationObserver subtitles, fast climb-intro check, flake verdict

Dev tooling only. No product code, no deploy.

## Context check

main, clean, HEAD == origin/main == 04add47. Strays, all from /home/argyrios/Aegean, killed
by exact PID (21:40:47 / 21:41:28 UTC):
- 4001: node 312103 <- `tsx watch` 60660 <- `sh -c PORT=4001 tsx watch` 60659 <- `npm run dev`
  60636 <- `concurrently` 60628 <- 60627 <- `npm run dev` 60615 (ppid 1), started Sep 21 10:55.
- A SECOND Sep-21 tree (10:52): `npm run dev` 60122 (ppid 1) -> concurrently 60135 -> ... ->
  `tsx watch` 60169 with NO child at that moment — a watcher that would have re-spawned a
  4001 server on the next file change. Killed too.
- 5914 / 5915: vite 242377 / 242374 <- `npm exec vite` 242273 / 242274 (ppid 1), Sep 25 10:42.
Ports 4001/5914/5915 free at 21:44:31 (>3 min after the last kill) and again at the end of
every harness run below. Load while they ran: load average 0.10, all at 0.0 %CPU; cumulative
CPU over their lifetimes 1s (tsx), 14s and 18s (the two vites, ~11 h each).

## 1. MutationObserver subtitles

`dev/subtitle-observer.ts` (new, shared): a raw-string `addInitScript` (the Task 259 `__name`
trap) installs a MutationObserver on `document`; every change to (subtitle text minus the
skip-vote counter child, card present, temple present) is pushed with the page's `Date.now()`
plus boxes at mutation time and ~600ms later. `dev/end-state-timer-subtitles-check.ts`:
`sampleCurrentBeat` and the `onBeforeSkip` hook are DELETED; criterion 4 matches each
`socrates:show` frame to a log entry BY ORDER (`matchRenders`: beat i takes the first entry
with exactly its line after the one beat i-1 took) — not by time window, because the harness's
frame stamp (Playwright framereceived, in the same Node process as the in-process server) can
lag the page. It prints each run's render latency (DOM after frame).
Checks now: every beat that lived >= 150ms rendered its line; every rendered text is a payload
line; all three Ανάβασις lines rendered; card in 1280x720 and no card/subtitle overlap per
announce beat. The VIP phone gets its own view observer (skip control / steal view / reveal
card) so each run prints WHY an Ανάβασις beat was or was not skipped. Also fixed a
pre-existing `never`-narrowing type error at the game-2 score check (was line 521).

Skip dwell: the driver presses a skip control only after the same testid has been enabled
>= 1500ms. Found the hard way, both times the observer reporting faithfully that a line never
reached the DOM: series A run 5 (press on first sight) ended Ανάβασις#20 and a Παλαίστρα
STAGE_INTRO within ms; with a 500ms dwell, series B run 1 lost Εισαγωγή#1 (lived 673ms) and
series C run 2 lost Ανάβασις#20 (702ms). Cause of the latter, MEASURED in series D run 3:
Εισαγωγή#1 reached the TV DOM 1051ms after its frame — HostScreen's Task 233b gate
(payloadForPhase, HostScreen.tsx:468-532): when phase:changed SOCRATES and socrates:show land
in ONE React render, the entry snapshot already holds the new payload, "arrived" reads false,
and the phase commits only at PHASE_PAYLOAD_WATCHDOG_MS = 1000 (HostScreen.tsx:168). A beat
skipped before then never shows. PRODUCT OBSERVATION, NOT FIXED (no product changes here): in
a real room that is up to ~1s of a stale view/subtitle on the first beat after a card, seen in
1 of 5 D runs.

## 2. Fast climb check

`dev/321-climb-intro-check.ts` — existing path only (climb-ceremony/finale-staging pattern):
in-process server 3922, Vite 5923, real TV page creates the room, two socket players, then
`room.gameIntroPlayed = true; startClimb(room)`. No new server hook. Real audio + real TV
acks. Final version: 15/15, CLIMB_QUESTION at 30896ms after startClimb, 35.6s end to end; the three
lines rendered 8/8/8ms after their frames, temple world throughout, card {390,262,500x197}
vs subtitle {154,14,973x57..89}, 0 unmatched renders.

## 3. Flake verdict

Final harness, 5 runs SEQUENTIAL at HEAD, strays gone (series D, logs 00:40-02:31 UTC):
**5/5 exit 0, 28/28 each**, 23-25 of 23-25 beats rendered per run, max render latency
20/21/1051/24/19ms, ~21.5 min per run. Earlier series on intermediate versions, reported for
completeness: A (no dwell, window match) 4/5 — run 5 the instant-skip miss; B (500ms dwell)
stopped after run 1 failed on the frame-stamp window; C (order match, 500ms dwell) 1 pass then
run 2 failed on the 233b watchdog, stopped. Every failure across A-C was a harness defect now
fixed, and in each the observer showed the line truly absent from the DOM — never a mis-read.

Why the old harness never pressed skip on the Ανάβασις beats: it read the TV only inside
`onBeforeSkip`, which ran only when the VIP phone's DOM held an enabled `continue-button` /
`socrates-skip-button`. The phone renders that control on the REVEAL card or the plain waiting
screen — but ControllerScreen's render chain tests `steal` (line 2116) BEFORE `reveal` (2224),
and `steal` is cleared only by the next question/segment payload, not by STAGE_ANNOUNCE or
SOCRATES. So when Η Συκοφαντία's LAST question is followed by a STEAL (server/src/steal.ts:
whenever the fastest answer was correct — both phones tap the first option, ≈ 7/16 per
question), the phone sits on the steal view through the climb card and all three rule beats:
no control, no press, no sample -> "none found". Measured in series A: runs 3 and 4 went
`REVEAL -> STEAL -> STAGE_ANNOUNCE -> SOCRATES`, phone `skip=false steal=true` on #20/#21/#22,
0 presses; runs 1, 2, 5 had no STEAL and the phone pressed on each beat. (Series C run 1 hit
the steal case too — 0 presses — and still captured 3/3 lines; series D happened to draw none.) The old 4/6 vs 0/5
is that coin: a ~44% per-run event, and 0/5 at p≈0.44 happens ~5% of the time, >=4/6 ~24% —
no commit-dependent mechanism needed (318 found 316 touched no in-game code). CPU load from
the strays does NOT account for it: they were idle (above), and the trigger is DOM state,
not timing. (Separate product observation, not fixed: the VIP has no Παράλειψη control during
Η Ανάβασις' narration whenever a steal preceded it.)

## 4. Inverse

`npm run typecheck` exit 0. The dev files are outside every workspace tsconfig; compiled
separately (`tsc --noEmit --strict --module nodenext ...` on the three dev files) with 0
errors. `git diff --stat` + untracked: dev/end-state-timer-subtitles-check.ts (M),
dev/subtitle-observer.ts, dev/321-climb-intro-check.ts, tasks/321-beats-harness.md — nothing
outside dev/ and tasks/. No deploy. Ports 4001/5914/5915/3920/5921/3922/5923 all free at
02:32 UTC, after every run; every dev server a harness started was gone at its exit.
