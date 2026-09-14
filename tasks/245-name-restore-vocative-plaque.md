# Task 245 — restore 102 Greek names, extend the vocative table, fix the ΞΕΝΟΦΩΝ plaque clip

Context check: repo `/root/Aegean-`, tree clean, HEAD `14eed31` (Task 241:
preset-only Greek names, vocative lookup, lane width for long names).

## What changed

- `shared/src/index.ts`: `PRESET_NAMES` grows from 99 to 201 — the existing
  99 are untouched, and 45 masculine + 57 feminine names are appended after
  them as their own male-block-then-female-block segment (not interleaved
  into the original 99). `VOCATIVE_FORMS` gets the matching 102 entries,
  copied verbatim from the task's own literal table (not derived).
- `client/src/components/SophistsRow.tsx`: `nameFontSizeCqh` now sizes
  names off a real per-glyph width table instead of raw character count.

## Acceptance criteria

**1. Shape.** `PRESET_NAMES.length === 201`; a duplicate scan
(`Set`-based) over all 201 entries found `0` duplicates; the first 99
entries diff byte-for-byte, in order, against `git show 14eed31:shared/src/index.ts`'s
own `PRESET_NAMES` array (confirmed via script: `first 99 match old exactly,
in order: true`). `VOCATIVE_FORMS` has exactly 201 keys, and every
`PRESET_NAMES` entry has exactly one `VOCATIVE_FORMS` entry (0 missing
either direction) — re-confirmed live inside `dev/245-name-check.ts`
against the actual `@game/shared` module the server/client import (4/4
checks passed).

**2. Table fidelity.** A normalize-and-diff script (strip tonos, uppercase
both sides) compared all 102 new `VOCATIVE_FORMS` entries against the
task's literal ALL-CAPS table verbatim: **0 mismatches** (45 male + 57
female entries, all matched).

Separately, computing what a naive "drop final Σ" rule (241's own rule,
applied to any name ending -ΟΣ/-ΗΣ/-ΑΣ) would produce vs. the actual table:
**16 entries differ**, all of them proparoxytone -ΟΣ names that need the
irregular -Ε ending instead of a plain dropped-Σ -Ο:

```
ΘΟΔΩΡΟΣ, ΣΤΕΦΑΝΟΣ, ΑΓΓΕΛΟΣ, ΑΛΕΞΑΝΔΡΟΣ, ΑΠΟΣΤΟΛΟΣ, ΕΛΕΥΘΕΡΙΟΣ,
ΕΥΑΓΓΕΛΟΣ, ΘΕΟΔΩΡΟΣ, ΚΛΕΑΡΧΟΣ, ΜΕΝΕΛΑΟΣ, ΝΕΚΤΑΡΙΟΣ, ΠΟΛΥΚΑΡΠΟΣ,
ΧΑΡΑΛΑΜΠΟΣ, ΙΑΚΩΒΟΣ, ΝΙΚΗΦΟΡΟΣ, ΕΥΣΤΑΘΙΟΣ
```

That's 16, not the task's own estimated "~20" — worth flagging precisely:
of the task's three named examples (ΑΛΕΞΑΝΔΡΕ, ΜΑΡΚΟ, ΡΑΦΑΗΛ), only
ΑΛΕΞΑΝΔΡΕ is actually a naive-rule mismatch. ΜΑΡΚΟΣ is **paroxytone**
(Μάρ-κος), so its regular -Ο ending already agrees with naive drop-Σ — no
mismatch. ΡΑΦΑΗΛ doesn't end in Σ/ΗΣ/ΑΣ at all (it's one of the four
indeclinables), so the naive rule never touches it either — also no
mismatch. All -ΗΣ and -ΑΣ names among the 45 (12 and 8 respectively) agree
with naive drop-Σ in every case; the four indeclinables (Εμμανουήλ,
Σεραφείμ, Ραφαήλ, Γαβριήλ) are untouched by the naive rule and correct by
construction. The real divergence is confined entirely to the 21 -ΟΣ
names, split 16 proparoxytone (irregular -Ε, listed above) vs. 5 paroxytone
(regular -Ο, agrees with naive: Σίμος, Ματθαίος, Μάρκος, Θύμιος, Πάνος).

**3. ΞΕΝΟΦΩΝ plaque fix.** Root cause: `nameFontSizeCqh` treated every
character as equal width. ΞΕΝΟΦΩΝ is 7 chars — exactly `NAME_BASE_CHARS` —
so it landed in the flat, never-shrinks branch, but its own letters (Ξ,Ν,Ο,
Φ,Ω,Ν) are real-metric *wider* than average, so it clipped anyway
(pre-fix: scrollWidth 90 vs clientWidth 86). A 10-char new name,
ΧΑΡΑΛΑΜΠΟΣ, clipped too (87 vs 86) despite sitting inside the harmonic
branch (8–10 chars), for the same reason.

Fix: measured each Greek capital's real rendered width in the actual
`.plaque .n` font/weight/letter-spacing (Playwright + a probe span at a
fixed 100px font-size, averaged over a 10-glyph run per letter, normalized
so the alphabet average = 1.0 — widest Μ=1.204, Θ/Ο=1.126, Φ=1.187,
Ψ=1.17, Ω=1.16; narrowest Ι=0.414, Σ=0.873, Γ=0.874, Τ=0.888). `nameFontSizeCqh`
now uses `Math.max(name.length, weightedLength(name))` as its character
count everywhere (flat / harmonic / decay branches alike) — a
narrower-than-average name's weighted sum comes out *below* its own raw
length and is clamped straight back up to the unchanged original value, so
this can only ever shrink a name relative to the old formula, never grow
one.

Verified with `npx tsx dev/245-name-check.ts` (real in-process server,
real Vite client, real Playwright pages) across all four surfaces — **24/24
checks passed**:

- Plaques (SophistsRow, 5-player board): ΞΕΝΟΦΩΝ `fontSize=14.8493px
  scrollWidth=86 clientWidth=86` (was 90/86, ellipsis, pre-fix). ΚΥΡΙΑΚΟΣ
  baseline **13.860px** (unchanged, exact). ΠΑΝΑΓΙΩΤΗΣ baseline
  **11.088px**, `scrollWidth=86 clientWidth=86` (unchanged, exact, still
  zero margin — full text, no ellipsis). ΧΑΡΑΛΑΜΠΟΣ `scrollWidth=86
  clientWidth=86` (was 87/86 pre-fix). ΤΕΡΨΙΧΟΡΗ `scrollWidth=86
  clientWidth=86` (unchanged from pre-fix — already fit).
- Standalone duel (`anavasis-duelist` plaques): ΞΕΝΟΦΩΝ vs ΧΑΡΑΛΑΜΠΟΣ, both
  rendered, neither clipped.
- Live climb lane (`anavasis-climber-name`, direct `startClimb`): all 4 of
  ΞΕΝΟΦΩΝ/ΚΥΡΙΑΚΟΣ/ΧΑΡΑΛΑΜΠΟΣ/ΤΕΡΨΙΧΟΡΗ rendered, none clipped.
- Podium (`podium-name`, real short-quiz-to-trial game): all 4 names
  rendered, none clipped (e.g. `Τερψιχόρη fontSize=22.3171px
  scrollWidth=102 clientWidth=102`, `Χαράλαμπος fontSize=17.0035px
  scrollWidth=93 clientWidth=93`).

**4. Inverse — new-block names, two real phones.** All via
`dev/245-name-check.ts` section 4:

- `name-list` renders all 201 `PRESET_NAMES` entries (`count=201`).
- Phone 1 joins as Χριστίνα (new block); phone 2's `preset-name-option`
  for Χριστίνα shows `data-taken="true"` **449ms** after phone 1's join —
  live grey-out sync still works across the enlarged list.
- Phone 2 then joins as Αλέξανδρος (new block, one of the 16 proparoxytone
  -Ε names) — zero collision, join succeeds.
- Lobby greeting for Αλέξανδρος: `"Καλώς ήρθες, Αλέξανδρε!"` — vocative
  (-Ε form), confirmed absent of the nominative string.
- TV plaques for the same room show `["ΧΡΙΣΤΙΝΑ","ΑΛΕΞΑΝΔΡΟΣ"]` — the
  **nominative**, never `ΑΛΕΞΑΝΔΡΕ` — confirming the vocative stays
  strictly 2nd-person (lobby only), 3rd-person surfaces are untouched.
- Bot room (`botCount: 4`): bot names are drawn from the end of the new
  201-long list — `["Σμαράγδα","Παρθένα","Χρυσάνθη","Ξανθίππη"]`
  (order-insensitive match against `PRESET_NAMES.slice(-4)`), i.e.
  ΧΡΥΣΑΝΘΗ backwards as expected (`PRESET_NAMES[200] === 'Χρυσάνθη'`
  confirmed).
- A human joining that same bot room as front-of-list Νίκος collided with
  none of the 4 bot names — zero collisions.

## Out of scope, documented not fixed

`dev/242-name-clip-check.ts` (pre-241) is already broken at HEAD,
independent of this task: it joins players with synthetic non-preset
strings (`'ΑΒΓΔ'`, `'ΝΞΟΠΡΣΤΥΦΧΨΩ'`), which Task 241's preset-only join
policy now rejects outright, so its very first join times out
(`timed out waiting for player:joined after 15000ms`). Reproduced on this
branch, unrelated to the `nameFontSizeCqh` change — the successor harness
`dev/241-name-check.ts` (and this task's `dev/245-name-check.ts`) already
cover the same ground with real preset names.
