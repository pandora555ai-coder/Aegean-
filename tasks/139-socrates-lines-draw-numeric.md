# Task 139 — Socrates speaks in draw and numeric: lines + TTS

Model: Fable.

Task 138 built detection; every moment sits silent behind an empty
LINE_TAGS entry. This task: observe what actually fires, WRITE the
Greek lines, generate ONLY the new mp3s, surface them for rating.

## Step 1 — observe before writing

One medium full run + the 138 engineered standalone runs. Collect
per-moment detection counts. Where two moments co-detect on one
reveal (EXACT_HIT + ALL_CLUSTERED did in 138), confirm the task-62
rarity/priority machinery picks ONE — if numeric/draw moments sit
outside that machinery, wire them into it, do not invent a second
picker.

## Step 2 — write the lines

Greek, 5-6 lines per moment, all 9 moments (DRAW_INTRO,
NOBODY_GUESSED, EVERYBODY_GUESSED, SPLIT_GUESS, DRAW_WINNER,
EXACT_HIT, WILDLY_OFF, ALL_CLUSTERED, NOBODY_CLOSE) PLUS 4 STAGE_INTRO
lines for Η Συκοφαντία (stage 3 currently speaks the old trial lines
— accepted mismatch from 126, closes here).

THE CRAFT RULES — from rating all 193 by ear, they are binding:
1. Open with FLOW — a clipped one-word opening lands flat spoken.
2. Two movements: an observation, then a turn.
3. Socrates EXPOSES HIMSELF mid-line («αναρωτιέμαι», «με ανησυχεί»).
4. Land on a JUDGEMENT or a THREAT — never a reflection.
5. Bookkeeping is death («Σημειώνω» records instead of judging).
Also: no {name} placeholders; every line must read cleanly as pure
text (placeholders are stripped before TTS); tags from the existing
11 only; keep lines SHORT — the longest clip crept to 9.4s and round
time pays for it.

## Step 3 — generate and surface

npm run voice:generate, then voice:index.

## Acceptance criteria

Report on EACH one separately, with numbers. Under 8 lines.

1. **One voice per reveal.** From the step-1 runs: per-moment
   detection counts, and proof that a co-detecting reveal fired
   exactly one SOCRATES phase.

2. **Count criterion.** Lines added to LINE_TAGS: exactly 9×(5-6) +
   4, reported as an exact number, with the same count command run
   before and after. Every line tagged, zero placeholders.

3. **Generate is incremental.** Report mp3s WRITTEN vs SKIPPED
   (pre-existing hashes) — skipped must equal the old line count.
   Report voice:generate's longest-clip figure; flag any new clip
   over 8s.

4. **Heard in place.** One full run AFTER generation: report at
   least one draw and one numeric SOCRATES phase whose length
   followed source.onended (real duration, not the 11s backstop),
   and that voice:index lists all new lines for rating.

## Out of scope

Rating (Argyrios's ears), the voice-depth filter, crowd audio,
rewriting any of the existing 193, moment threshold retuning.
