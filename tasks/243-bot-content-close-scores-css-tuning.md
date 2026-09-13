# Task 243 — content/bot batch: bot slider, vendor-noun audit, steal earner clarity, CLOSE_SCORES filter, ceremony-check clock exemption, enter-pop tuning

Context check: `/root/Aegean-`, clean tree, HEAD `94cbf8a` (Task 242) at start.

## A — bot estimation guesses never at the slider minimum

`server/src/bots.ts`: `sampleNumericValue`'s lower clamp changed from
`Math.max(0, ...)` to `Math.max(1, ...)`, and the race-condition fallback
(room state not ready) from `randomChoice(payload.max + 1)` (uniform
0..max) to `1 + randomChoice(payload.max)` (uniform 1..max). Min is always
0 server-side (no explicit min field on the wire — confirmed via
`clampNumericValue`/the client's hardcoded `min={0}`); max comes from
`maxForAnswer`, smallest possible value 20, so clamping to 1 never
collides with max.

**Measured** (`?bot=4&mode=full`, two games, socket-level host listener on
`numeric_reveal:show`, stopped after each game's 3rd numeric reveal —
`FULL_NUMERIC_QUESTION_COUNT`):

| game | player  | max  | value | question |
|---|---|---|---|---|
| 1 | Γιώργος | 20   | 7   | Πόσα μάτια έχει η μέλισσα; |
| 1 | Νίκος   | 20   | 1   | Πόσα μάτια έχει η μέλισσα; |
| 1 | Ελένη   | 20   | 2   | Πόσα μάτια έχει η μέλισσα; |
| 1 | Μαρία   | 20   | 10  | Πόσα μάτια έχει η μέλισσα; |
| 1 | Γιώργος | 20   | 2   | Πόσους σπονδύλους έχει ο λαιμός της καμηλοπάρδαλης; |
| 1 | Νίκος   | 20   | 4   | Πόσους σπονδύλους έχει ο λαιμός της καμηλοπάρδαλης; |
| 1 | Ελένη   | 20   | 2   | Πόσους σπονδύλους έχει ο λαιμός της καμηλοπάρδαλης; |
| 1 | Μαρία   | 20   | 12  | Πόσους σπονδύλους έχει ο λαιμός της καμηλοπάρδαλης; |
| 1 | Γιώργος | 200  | 34  | Πόσα χιλιόμετρα είναι ο μαραθώνιος; |
| 1 | Νίκος   | 200  | 117 | Πόσα χιλιόμετρα είναι ο μαραθώνιος; |
| 1 | Ελένη   | 200  | 63  | Πόσα χιλιόμετρα είναι ο μαραθώνιος; |
| 1 | Μαρία   | 200  | 45  | Πόσα χιλιόμετρα είναι ο μαραθώνιος; |
| 2 | Γιώργος | 100  | 3   | Πόσα πιόνια και κομμάτια έχει το σκάκι στην αρχή; |
| 2 | Μαρία   | 100  | 53  | Πόσα πιόνια και κομμάτια έχει το σκάκι στην αρχή; |
| 2 | Ελένη   | 100  | 45  | Πόσα πιόνια και κομμάτια έχει το σκάκι στην αρχή; |
| 2 | Νίκος   | 100  | 58  | Πόσα πιόνια και κομμάτια έχει το σκάκι στην αρχή; |
| 2 | Γιώργος | 2000 | 374 | Πόσες μέρες κρατά η κύηση του ελέφαντα; |
| 2 | Μαρία   | 2000 | 638 | Πόσες μέρες κρατά η κύηση του ελέφαντα; |
| 2 | Ελένη   | 2000 | 606 | Πόσες μέρες κρατά η κύηση του ελέφαντα; |
| 2 | Νίκος   | 2000 | 420 | Πόσες μέρες κρατά η κύηση του ελέφαντα; |
| 2 | Γιώργος | 100  | 21  | Πόσα χρόνια κράτησε ο Πελοποννησιακός Πόλεμος; |
| 2 | Μαρία   | 100  | 47  | Πόσα χρόνια κράτησε ο Πελοποννησιακός Πόλεμος; |
| 2 | Ελένη   | 100  | 15  | Πόσα χρόνια κράτησε ο Πελοποννησιακός Πόλεμος; |
| 2 | Νίκος   | 100  | 1   | Πόσα χρόνια κράτησε ο Πελοποννησιακός Πόλεμος; |

**24 submissions, 0 at the slider minimum, 20 distinct values.** Human
input path (client) is untouched.

## B — Λήθη vendor nouns

The bug is not in `server/src/data/questions.json` (verified — no
"αμφορ*" hits anywhere in that file or its git history). It's in the
Agora mini-game's procedural sentence table,
`AGORA_STALL_COUNT_TEXT_GR` (`shared/src/agora.ts`):

- **Before**: `amphorae: 'Πόσους αμφορείς είχε ο αμφορέας;'` — the vendor
  ("ο αμφορέας") was literally the object's own name.
- **After**: `amphorae: 'Πόσους αμφορείς είχε ο αγγειοπλάστης;'`

Audited all 5 stall types' merchant-vs-goods nouns for the same
self-referential class: `fish`/ο ψαράς, `cloth`/ο υφαντής,
`pottery`/ο κεραμέας, `fruit`/ο οπωροπώλης are all distinct real nouns —
**amphorae was the only hit**. Picked "αγγειοπλάστης" (vase-maker) rather
than reusing "κεραμέας" (pottery's own merchant, the declared twin pair)
to keep the two stalls reading as different people.

Fixed in all 3 authored-text locations: `shared/src/agora.ts` (canonical),
`server/scripts/agora-validate.ts` (mirror, `agoraCountText`),
`design/agora-reference.html` (design reference `STALLS.amphorae.who`).
`AGORA_STALL_TYPES`/ids are untouched — this is text-only, no id renamed.

## C+D — steal earner clarity + CLOSE_SCORES filter

**C**: added `data-testid="steal-earner-reason"` under the thief's name in
`StealView.tsx`'s choosing beat: "Ταχύτερη σωστή απάντηση στην προηγούμενη
ερώτηση" — a standalone nominative fact (no player name inside the
sentence, so no declension question even arises). TV only; phone's own
Task-235a steal strings untouched.

Rendered banner, captured live (`?bot=3` standalone quiz, browser,
choosing beat):
```
steal-thief: Γιώργος
steal-earner-reason: Ταχύτερη σωστή απάντηση στην προηγούμενη ερώτηση
steal-title: Διαλέγει θύμα...
steal-attempt: Παίζει για 396 πόντους
```

**D**: `server/src/socrates.ts` — `CLOSE_SCORES_EXCLUDED` (a
`ReadonlySet<string>`, same Task-231 "filtered, never deleted" mechanism)
now filters `'Στενό. Μου αρέσει όταν δεν ξέρω το τέλος.'`
(`81d46a24dad02508`, `[amused]`) out of `LINES.CLOSE_SCORES` at pick time,
applied unconditionally in `recordRoundAndPickLine`'s dispatch loop — not
mode-scoped like the Task 231 precedent, since this one was asked filtered
everywhere. mp3 stays on disk, untouched.

**Grep proof, both A-games' full server logs**: `81d46a24dad02508` — **0
hits**. `CLOSE_SCORES` fired once, in game 1, with `lineHash=435b14337d4c53fb`
('Κολλητά. Κανείς σας δεν έχει κερδίσει τίποτα ακόμα.', `[serious]`) — a
surviving pool member, confirming the filter removed only the target line.

**CLOSE_SCORES pool size after filter: 5** (was 6):
1. `435b14337d4c53fb` — Κολλητά. Κανείς σας δεν έχει κερδίσει τίποτα ακόμα.
2. `4aa0bc1bcf785d86` — Τόσο κοντά που η επόμενη κρίνει χαρακτήρες, όχι πόντους.
3. `35bdaad704a47d22` — Ισορροπία. Κάποιος πρέπει να τη χαλάσει.
4. `357a782abb6a9f6f` — Λίγοι πόντοι σας χωρίζουν. Λίγοι πόντοι, μεγάλη διαφορά.
5. `a6168b6d6edf293a` — Κανένας σας δεν έχει ξεχωρίσει ακόμη από τους υπόλοιπους...

Not zero, so the moment stays audible — narrower, not silent.

## E+F — ceremony-check clock exemption + enter-pop tuning

**E**: `dev/climb-ceremony-check.ts`'s `newRoom` now navigates to
`/host?clock=off` instead of `/host`. Chose the URL param over excluding
`[data-testid="game-clock"]` from the scan: the check's own comment says
it deliberately sweeps the WHOLE page (`body.innerText`), not just the
scene subtree, so carving out one element after the fact would weaken
that intent — not rendering the clock at all keeps the sweep exactly as
strict. The scene-scoped `sceneDigits` check (`[data-testid=
"anavasis-scene-container"]`) was never affected either way.

**Before** (from the notification that started this task, prior HEAD):
documented 8 known clock-digit fails. **After**: `npm run
climb:ceremony-check` — **94 passed, 0 failed**, 0 `FAIL` lines in the
full log. The known baseline is 94/94 (Task 225/237 reports), not "35/35"
— 35/35 belongs to `climb:staging-check` (see below); confirmed no
regression there either.

Unchanged baselines re-verified fresh:
- `npm run climb:lane-check` — **21 passed, 1 failed** (the pre-existing
  wreath-timing fail, unrelated to this task).
- `npm run climb:staging-check` — first run: 33/35 (2 fails, both the
  scene-swap "1 theatre sample" timing race at the very first post-transition
  sample, t≈0.02s — unrelated file/logic to this task's CSS/harness edits);
  **re-run: 35 passed, 0 failed**, confirming the first run's 2 fails were a
  pre-existing flake, not a regression.

**F**: `client/src/palette-theatro.css`'s `.enter-pop`: `scale(0.94)` →
`scale(0.98)`, `420ms cubic-bezier(0.22,1,0.36,1)` → `200ms ease-out`.
Transform + opacity only, confirmed (both the class and its `@keyframes`
block touch nothing else); `prefers-reduced-motion` disable is untouched.

**Computed style, live browser** (`getComputedStyle` on the mounted
`.enter-pop` node): `animationName: "enter-pop"`, `animationDuration:
"0.2s"`, `animationTimingFunction: "ease-out"`, `animationFillMode:
"backwards"`. Transform start value confirmed via a real rAF trace on a
QUESTION→REVEAL transition (`dev/242-subtitle-check.ts`, re-run unmodified):
first sampled frame `t=1.5ms transform=matrix(0.98, 0, 0, 0.98, 0, 0)`.

**One phase transition's before/after bounds** (same script, same
element — the largest `.enter-pop` node, QUESTION→REVEAL):
- before (first frame, t=1.5ms): `width=903.16px`
- after (settled): `width=921.59px`
- **excursion: 18.43px** — vs. Task 242's documented baseline of
  `866.3px → 921.6px` = **~55.3px**. Matches this task's own "~18px vs
  ~55px" expectation.

## Findings outside scope (documented, not fixed)

- `dev/242-subtitle-check.ts`'s own verdict-print for item D still
  hardcodes the OLD description text ("scale(0.94)->scale(1), 420ms
  cubic-bezier") in its console.log — cosmetic, a stale log string in a
  diagnosis-only script, not a check assertion. Not fixed here (out of
  this task's file list).
- The `climb:staging-check` "1 theatre sample" race (scene-swap timing at
  the very first post-transition sample) is a pre-existing flake,
  reproducible about 1 run in 2 in this session's testing — worth a
  harness fix (a slightly later first-sample time, or an explicit wait for
  the phase-changed DOM commit) but out of this task's scope.
