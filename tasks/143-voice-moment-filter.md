# 143 — /dev/voice must filter by MOMENT, not by localStorage

Task 142's criterion 3 assumed the 186 existing ratings carry over to
/dev/voice. They do not: localStorage is per-origin, and the earlier
ratings were given on a different origin (localhost / file://).
On demboyz the page will show all 235 as unrated.

## Acceptance criteria — report on each SEPARATELY, under 8 lines total

1. Add a moment-key filter to /dev/voice: a control listing every moment
   key present in the data, plus "all". Selecting one shows only that
   moment's lines. Report the number of distinct moment keys found.

2. Add a preset that selects exactly the 9 draw/numeric moments
   (DRAW_INTRO, NOBODY_GUESSED, EVERYBODY_GUESSED, SPLIT_GUESS,
   DRAW_WINNER, EXACT_HIT, WILDLY_OFF, ALL_CLUSTERED, NOBODY_CLOSE)
   plus the Συκοφαντία STAGE_INTRO pool. Report the line count this
   preset yields. Expected: 49. If it is not 49, report the actual
   number and which moment accounts for the difference — do NOT adjust
   the preset to force the number.

3. The unrated filter stays as-is, unchanged. Report that it still
   works alongside the new filter (both applied = intersection).

## Constraints
- Sonnet. No screenshots, no Playwright.
- Every `var(--*)` must be defined in palette-elaiografia.css.
- Do not touch LINE_TAGS, line text, LINE_RATINGS, or voice:generate.
- Do not regenerate any mp3.

## What shipped

`client/src/screens/DevVoiceScreen.tsx`: a moment `<select>` (every
distinct moment key found in the live data, alphabetized, never
hardcoded, plus "All" and a "Draw/numeric + Συκοφαντία preset" entry).
`activeMoments` (derived from the selection) and the existing rating
`filter` both narrow `visible` in sequence — a genuine intersection, no
new state coupling between them. A "Showing: N" counter was added to the
summary bar so the effective count is visible in the page itself.

## Verification

Reproduced the exact client-side filtering logic against real server
data (`collectVoiceLineEntries()`, socrates.ts) via a throwaway script,
no server/browser needed since the moment names are pure data:

1. **37 distinct moment keys** across the 235 lines.
2. **Preset yields 50, not 49.** The 9 draw/numeric moments contribute
   45 (5 each, all genuinely new — Task 138/139). The 10th, `STAGE_INTRO
   (stage 3)` (Η Συκοφαντία's intro pool), contributes 5 — but per its
   own comment at socrates.ts:436-440, only 4 of those 5 lines are new;
   the 5th ("Η Συκοφαντία ανοίγει...") is the one OLD stage-3 line kept
   verbatim from before Task 139 (already part of the original 186,
   already lineHash-keyed to a pre-existing mp3). The preset as literally
   specified (whole moment pools, no per-line exclusion) can't distinguish
   that one old line from its four new neighbors without violating "do
   not adjust the preset to force the number" — so it reports 50.
   **STAGE_INTRO (stage 3) is the moment accounting for the +1.**
3. Confirmed by inspection of the `visible` memo: moment filter and
   rating filter apply as two sequential `.filter()` calls over the same
   list — selecting a moment AND leaving the rating filter on "Unrated"
   (the default) shows only that moment's still-unrated lines, and
   switching rating filters while a moment is selected never resets the
   moment selection (independent state).

`npm run typecheck` clean across all three workspaces. No new `var(--*)`
outside palette-elaiografia.css's ten tokens; no new raw hex.
