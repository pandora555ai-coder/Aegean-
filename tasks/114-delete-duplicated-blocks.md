# 114 — Delete the duplicated blocks below the papyrus

Same finding as task 108: content under the papyrus that repeats what the
right-hand score column already shows. Three were named; one of them had
already gone in 108 (see "GUESS_REVEAL" below).

## Work

**NUMERIC_REVEAL** — the number line is gone. NumericRevealView.tsx lost its
whole beeswarm PapyrusPanel (old lines 132-165) plus everything that fed it:
`assignLanes`, the dead `PlacedMarker` interface, the `laneOf` useMemo,
`answerPercent`, `submitted`. 176 -> 78 lines. The reveal is now the
question, `Σωστή απάντηση: N`, and each player's own `+N` in the column.

**NUMERIC_QUESTION** — the `N/M κλείδωσαν` counter and the answered-avatar
strip under it are gone (old lines 73-92), with no replacement indicator.
NumericQuestionView.tsx lost the `progress` and `players` props with them
(95 -> 60 lines); the two call sites, HostScreen.tsx and DevSceneScreen.tsx,
are updated. `numericProgress` state in HostScreen was then write-only, so
it and the `numeric:progress` subscription went too — the server-side count
is untouched.

**GUESS_REVEAL** — nothing to delete. Task 108 already removed the
per-player result list; GuessRevealView.tsx says so in its own header
comment, and a live GUESS_REVEAL renders no per-player rows. What is still
below the options is the drawer's own bonus line and the aggregate
`N/M μάντεψαν σωστά` — left alone, neither is the named list.

## Measured — 1280x720, bottom-most content pixel, before -> after

BOT_COUNT 4 and 5 (densityScale 0.82 at <=5), real games over sockets:

| phase | 4 players | 5 players |
| --- | --- | --- |
| NUMERIC_QUESTION | 662 -> 662 | 662 -> 662 |
| NUMERIC_REVEAL | 662 -> 662 | 662 -> 662 |
| GUESS_REVEAL | 662 -> 662 | 662 -> 662 |

Nothing overflowed before and nothing does now: the bottom edge is set by
the flexed papyrus panel, not by the deleted blocks, so the freed height
went into the question text instead of into the column. NUMERIC_REVEAL's
question text moved from behind the track to 558px; NUMERIC_QUESTION's
bottom-most element is now the `0 — max` readout where it was the avatar
strip.

## The early-advance path still fires

The deleted counter shared its value with "everyone locked in, end the phase
early". Observed after the deletion, all bots locking in at ~3.3s of a
20000ms NUMERIC_QUESTION_DURATION_MS:

- 4 players: NUMERIC_QUESTION -> NUMERIC_REVEAL after 3255ms
- 5 players: NUMERIC_QUESTION -> NUMERIC_REVEAL after 3504ms

i.e. it ends when the last player locks in, not on the timer.

## Deleted because nothing referenced them any more

hostStyles.ts: `numericTrackWrap`, `numericTrackLine`, `numericTick`,
`numericAnswerLine`, `numericAnswerLabel`, `numericMarker`,
`numericMarkerDot`, `numericMarkerName`, and the helpers
`NUMERIC_TRACK_LANES`, `numericLanePitch`, `numericTrackHeight`,
`numericMarkerNameStyle` — plus the two already-dead entries `answerCount`
and `stealScoreLine`. 951 -> 901 lines. `answerCounter`, `answeredNames`,
`nameAnswered`, `nameNotAnswered`, `answeredAvatarSize` and
`answeredNamesSizeStyle` stay: QuestionView, DrawView, GuessView and
PowerUpView still use them. No file became unreferenced — the number line
was inline in NumericRevealView, not its own component.

Typecheck clean across shared, server and client.
