# Task 263 — serial coronation beat + optional vocative splice

The WINNER beat played ONE line (Task 247) and no coronation clip existed, so
the coronation was over in milliseconds. It is now THREE lines spoken serially,
with an optional vocative clip spliced ahead of line 1. Built and verified
with **no audio files present** — none were created, none deleted.

## The blocker, and what was actually supplied

The brief said "the four texts are final". They were not in the repo: only
line 3 (`CORONATION_LINES`, two gendered variants) existed. There was no
`{ΚΛΗΤΙΚΗ}` placeholder anywhere, no tasks/261 or /262, and no 261/262 commits
in `git log --all` or the reflog. Line 1 (both variants) and line 2 were
supplied by Argyrios mid-task and used verbatim. They were NOT invented here:
`lineHash` keys each mp3's filename off the exact text, so invented wording
would have silently committed him to it.

Tags: the drafts' `[solemn]`/`[dryly]` are not in the bank's 11-tag vocabulary
and were mapped to `[serious]`/`[dry]` (the Task 230 collapse), per his
instruction. In this codebase a tag is **never** part of the template — it
lives in `LINE_TAGS[template]` and is folded into the hash — so the tags are
`LINE_TAGS` entries, not text. Line 3 was not retexted or re-tagged.

## What changed

- **server/src/socrates.ts** — `CORONATION_OPENER_NAMED` /
  `CORONATION_OPENER_PLAIN` / `CORONATION_LINE_TWO`, their `LINE_TAGS`
  entries, `coronationVocative(name)` and `buildCoronationSequence(gender,
  name, hasVocativeClip)`. The sequence reuses `pickCoronationLine` for line 3,
  so Task 247's gender logic is untouched.
- **server/src/phases.ts** — `pickWinnerBeatLine` becomes
  `pickWinnerBeatSequence`; both WINNER sites now call `startSocratesSequence`
  (which already supported `'WINNER'`) instead of `startSocratesBeat`. Task
  247's degrade is unchanged: no single gendered winner → the fully-voiced
  `WINNER_LINES` pool, as one line.
- **`prefix` on the wire** — `SocratesShowPayload.prefix`, set from the
  pending beat, plumbed through `enterSocratesBeat`/`startSocratesSequence`
  (first line only) and `PendingSocratesBeat`. The client plays prefix → line
  and acks **once**, when the LINE ends. A missing prefix never ends the beat;
  a missing LINE still acks immediately (Task 154, unchanged).
- **server/src/socratesAudio.ts** — `hasSocratesClip`, plus `VOICE_DIRS`, a
  dev-only search path (see groundwork).

## Groundwork (all three items, as asked)

1. **`getVocative()` is no longer dead code** — `coronationVocative` is its
   first server-side call site, used both to name the vocative clip and to
   fill `{ΚΛΗΤΙΚΗ}` into the display text.
2. **`collectVoiceLineEntries` now registers vocatives** — 201 `VOCATIVE`
   entries (one per PRESET_NAMES vocative, all distinct) plus all 5
   `CORONATION` texts. The generator (`dev/generate-voice-lines.ts`) did not
   read that function at all; it re-walked the pools by hand, which is exactly
   why it could never have produced these. `allLineTemplates()` now derives
   from `collectVoiceLineEntries()`, so the generator, `/dev/voice` and the
   voice index can no longer disagree. **Nothing was generated.**
3. **A dev-only voice search path** — `AEGEAN_DEV_VOICE_DIR`, NODE_ENV-guarded
   (the `FORCE_QUESTION_ID` idiom). Criterion 2 was otherwise *impossible*:
   `client/public/voice` is a SYMLINK into `/opt/party-game`, and
   `socratesAudio.ts` hardcoded it, so there was no way to put a test clip
   "on disk" without writing to production. It is a search path, not a
   replacement, so an override holding one file cannot make every other line
   look missing and move the whole game onto the unknown-duration backstop.

Also fixed: **`stripPlaceholders` used `/\{\w+\}/g`, and `\w` is ASCII-only in
JS**, so `{ΚΛΗΤΙΚΗ}` sailed through and would have been SPOKEN literally on the
first generation run. Now `/\{[^}]+\}/g`; ASCII placeholders strip as before.

## Acceptance criteria

Check: `npx tsx dev/263-coronation-check.ts` (`SCENARIO=A|B|C|D`) — real
in-process server on 3961, real Vite, real browser TV, real player sockets.
**38 passed, 0 failed.** The climb is SEEDED (`startClimb`, then one player
forced to the top) rather than played out over ~14 minutes; the coronation is
the last thing before GAME_OVER either way and the game genuinely ends.

**1 — the sequence actually emitted.** Three beats, in order, every one ending
on a real `socrates:audio_ended` ack (never a backstop), each armed at
`SOCRATES_BACKSTOP_UNKNOWN_MS` = 15000ms because no clip is measurable:

| beat | id | held (A / B / C) | line |
|---|---|---|---|
| 1 | 4 | 23 / 26 / 26 ms | opener (nameless in A and C, named in B) |
| 2 | 5 | 14 / 15 / 15 ms | «Ήρθατε εδώ λέγοντας πως είστε σοφιστές…» |
| 3 | 6 | 10 / 20 / 14 ms | 3α in A and B, 3β in C |

All nine beats acked at ~10–26ms, i.e. ~0ms as predicted by Task 154.

**2 — both line-1 branches.** With no vocative clip: **NAMELESS** selected,
`prefix` null (scenarios A and C). With a dummy clip for **Νίκος** (vocative
«Νίκο», hash `069ef3480d9af33f`) written to the throwaway dev dir: **NAMED**
selected — `"Νίκο. Το πλήθος αγάπησε…"` — with `prefix="Νίκο"` spliced ahead.
The dummy was deleted; the dir ends empty. Nothing was ever written under
`/opt/party-game` or `client/public/voice`.

**3 — gender.** Νίκος, `NAME_GENDER` = **m** → line **3α** («…Σοφιστή… σε
κανέναν…»), screen «Ο ΣΟΦΙΣΤΗΣ». Μαρία, `NAME_GENDER` = **f** → line **3β**
(«…Σοφίστρια… σε καμία…»), screen «Η ΣΟΦΙΣΤΡΙΑ».

**4 — inverse.** Subtitle (247): rendered in all three runs, carrying
coronation text. Zero digits (225): digits inside `anavasis-scene-container` =
**NONE** in all three runs, and whole-page digits = **NONE**. Socrates stays in
the temple (237): `anavasis-scene-container` sampled 442/443/448 times across
the beats, **min = max = 1** — the world is never dropped — and his computed
`left` held one single value, `729.594px`, for the whole sequence. Production:
`/opt/party-game` had **283 mp3s before and 283 after**, and **0 files modified**;
**zero ElevenLabs calls** (the generator was never invoked).

## Two things to know

- **`npm run voice:generate` is now a much bigger run.** 206 newly-registered
  lines are missing from disk (201 vocatives + 5 coronation), so the next
  invocation will try to synthesize all of them and cost credits accordingly.
  That is the point of the groundwork, but it is no longer a cheap command.
- **A harness measuring a splice must not sample the Room.** These beats hold
  ~20ms with no audio, so this harness's own 50ms poll missed the splice
  outright and reported a false failure on the one scenario that had it. The
  prefix is now stated in the server's per-beat log (Task 238's idiom) and read
  from there. Same class of trap as Task 247's single-frame subtitle.
