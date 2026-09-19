# Task 278 — the coronation rebuilt: two agender sets, no gender branch, name-safe fallback

The coronation is now TWO complete three-line SETS, one chosen per game. Task
247's gendered σοφιστή/σοφίστρια pair, Task 263's opener/line-two, the
NAME_GENDER branch that chose between them and the WINNER_LINES fallback are
all gone. Nothing in the beat inflects for who won, so there is no longer any
winner this ceremony cannot address — which was the only thing the gender
branch ever existed to work around.

## What changed

- **`CORONATION_SET_B` / `CORONATION_SET_C`** (socrates.ts) replace
  `CORONATION_LINES`, `CORONATION_OPENER_NAMED`, `CORONATION_OPENER_PLAIN`
  and `CORONATION_LINE_TWO`. Sequences, not pools — three sentences of one
  argument, in order, the same reason GAME_INTRO_SEQUENCE is a sequence.
- **`pickCoronationSet()`** — a uniform `Math.random()` pick over
  `CORONATION_SETS`, consulting nothing about the winner, so both sets are
  reachable on every game. Carries a dev-only `FORCE_CORONATION_SET` hook with
  the same NODE_ENV gate as questions.ts's `FORCE_QUESTION_ID`, so a harness
  can watch a named and a nameless ceremony on demand.
- **`buildCoronationSequence(name)`** — was `(gender, name, hasVocativeClip)`.
  Returns null only if every line of the drawn set has been deleted (Task
  271); there is no "unspeakable winner" case left.
- **The name is a SUFFIX now, not a prefix** — spliced after set B's last line
  via Task 277, because that is the line that names the winner. `phases.ts`
  passes `startSocratesSequence(room, 'WINNER', lines, null, suffix)`.
- **`pickWinnerLine` deleted** (its only call site was the removed fallback).
  `WINNER_LINES` itself stays, still registered for generation — its eight
  clips are real files in the bank and deleting the pool would orphan them.
- The gendered winner-SCREEN title (Ο ΣΟΦΙΣΤΗΣ / Η ΣΟΦΙΣΤΡΙΑ) is UNTOUCHED.

## Acceptance criteria

Check: `npx tsx dev/263-coronation-check.ts` (`SCENARIO=A|B|C|D`), repaired
for the new ceremony in this task — real in-process server on 3961, real Vite
on 5962, real browser TV, real player sockets, seeded climb to a real
GAME_OVER. **49 passed, 0 failed.** Nothing was written to any voice
directory: scenario B's one dummy clip lives in a throwaway tmp dir behind
`AEGEAN_DEV_VOICE_DIR` and is deleted again (`dev voice dir now holds: []`).

**1 — the six lines as registered.** Tag, hash, all `onDisk=false`:

| | tag | hash |
|---|---|---|
| B1 Το πλήθος ξεχνάει… | `[thoughtful]` | `bd12930f9369aa78` |
| B2 Απόψε είδα κάτι σπάνιο… | `[serious]` | `908d6d37b36aa4e9` |
| B3 Το δικό σου. | `[warm]` | `8a1a964d20b629b2` |
| C1 Ήρθα απόψε να κοροϊδέψω… | `[sarcastic]` | `2edec02cc8a0cd0a` |
| C2 Κοιτάζω το σκορ σου… | `[sighs]` | `9b482d51db0ca0d7` |
| C3 Η ειρωνεία μου σωπαίνει… | `[serious]` | `029e4cb422893a1d` |

Six distinct hashes; all six tags are from the bank's own 11-tag vocabulary;
`collectVoiceLineEntries` reports exactly **6** CORONATION entries, each
matching its computed hash. Zero name/placeholder in hashed text, three ways:
no `{...}` in any of the six; `stripPlaceholders(t) === t` for all six (so
nothing is left behind when a placeholder is stripped — the Task 270 lesson);
and none of the six contains any of the **201** preset names or their
vocatives. The name reaches DISPLAY text only — `text="Το δικό σου. Νίκο."`
against `template="Το δικό σου."` — and set B hashes identically for every
winner (1 distinct hash-triple across Νίκος/Μαρία/Άρης/Χαρά). A tie (`name`
null) leaves the bare `"Το δικό σου."`, no stray punctuation.

The removed WINNER call site, `git diff server/src/phases.ts`:

```
-  const coronation = buildCoronationSequence(name ? genderForName(name) : null, name, hasVocativeClip);
-  // Task 247's degrade, unchanged: no single gendered winner (a tie, a name
-  // absent from NAME_GENDER) -> the original, fully-voiced WINNER_LINES pool,
-  const fallback = pickWinnerLine(room.socrates);
-  return { lines: fallback ? [fallback] : [], prefix: null };
+  const coronation = buildCoronationSequence(name);
```

**2 — set selection.** `pickCoronationSet()`, quoted above: uniform over
`CORONATION_SETS`, no winner input. Over **40** unforced ceremony builds:
**set B 23, set C 17, neither 0** — both > 0. No build ever contained a
WINNER_LINES entry (0/40).

**3 — full local run to GAME_OVER, real review JSON, ZERO coronation mp3s on
disk** (`onDisk=false` for all six, verified against the real bank symlink).
Three games, each ending in a real GAME_OVER. Every beat ended on a real
`socrates:audio_ended` ack — the backstop fired **zero** times in all nine:

- **A** (Νίκος, set B, no vocative clip — *the shipping case*): held
  **22/13/9ms** against backstops 15000/15000/15000ms; suffix `none` on all
  three. Subtitles: `"Το πλήθος ξεχνάει…"`, `"Απόψε είδα κάτι σπάνιο…"`,
  **`"Το δικό σου. Νίκο."`** — the name is on screen with no clip recorded.
- **B** (Νίκος, set B, dummy vocative clip present): held **23/10/15ms**,
  beat 3 carries `suffix="Νίκο"` and its backstop rises 15000 → **19000ms**
  (the suffix is counted, per 277). Same three subtitles, name included.
- **C** (Μαρία, set C): held **22/14/19ms**, suffix `none` throughout, and
  **no** subtitle anywhere contains "Μαρία" — the set that names nobody.

No WINNER pool consultation in any of the three: 0 `WINNER_LINES` entries
marked in `room.socrates.usedLines`, checked against the live Room.

**4 — inverse.** `git diff --stat`: 5 files, **+435/−359** —
`server/src/{socrates,phases}.ts`, `shared/src/index.ts` (one stale comment),
`client/src/screens/DevVoiceAuditionScreen.tsx` (one stale comment naming the
deleted `pickCoronationLine`), and the repaired `dev/263-coronation-check.ts`.
Typecheck clean in all three workspaces. `dev/277-splice-check.ts`: **24
passed, 0 failed** — measured BEFORE the change as a baseline and again after,
so "still 24/24" is a real comparison. The winner-screen title is untouched:
`GameOverView.tsx` and `AnavasisScene.tsx` are unmodified, the
`shared/src/index.ts` diff touches no `ΣΟΦΙΣΤ`/`winnerTitleForName`/
`NAME_GENDER` line, and both titles were observed live — **Ο ΣΟΦΙΣΤΗΣ** for
Νίκος, **Η ΣΟΦΙΣΤΡΙΑ** for Μαρία. The gender table still drives the SCREEN;
it no longer drives a LINE.

## Two traps this task hit

- **An init script runs at document-start, where `document.documentElement`
  can still be null.** The harness's first run reported "0 subtitles" on beats
  that demonstrably render them: `observe(null)` threw and killed the rest of
  the probe, while `window.__aegeanSubs = []` on the line above had already
  been assigned — so the probe returned an empty array rather than an error,
  which reads exactly like a real failure. It observes `document` now, plus a
  5ms in-page interval. Five "failures" were this, not the game.
- **`npx tsx … ; tail -3 log` reports TAIL's exit code, not tsx's.** That run
  was summarised "exit code 0" while the harness itself printed *44 passed, 5
  failed*. The harness's own tally is authoritative; the command now
  propagates tsx's status.

## One CLAUDE.md line is stale (not edited here)

CLAUDE.md says the climb's WINNER beat "still renders no subtitle". Task 247
added `WINNER` to that branch (`HostScreen.tsx:2086-2108`) precisely so the
coronation gets a caption, and this task observed it rendering in all three
games. It is load-bearing for criterion 3 — it is what makes the coronation
subtitle observable at all in a climb-decided finale.
