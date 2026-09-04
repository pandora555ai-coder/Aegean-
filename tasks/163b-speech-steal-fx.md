# 163b — Speech slab, the steal token, ice and ink

Reference in the repo: design/theatre-reference.html — #speech (the
speech slab: left 24%, bottom 38%, width 52%, serif 4.8cqh 700,
padding 3.4cqh 4.5cqh), the .token kylix and its flight in steal(),
the .fx.ice / .fx.ink overlays and the .iced / .inked figure filters.

Rules: the speech slab is a MarbleSlab. The scene stays dimmed only
where it already is; SOCRATES and STEAL are LIT with the row at 60%.
Deltas in ember, sign carries direction. Animation via transform /
opacity / left only. Every view survives a first render with a NULL
payload. Do not touch the server, TheatreScene, the palette, Krater,
or the scoring. Do not call ElevenLabs.

1. Speech slab in SOCRATES (the line from the payload) and STEAL (the
   existing resolved-narration text). Delete the old speech and
   resolved panels. Report the slab's bottom edge, and the line count
   at the longest line in LINE_TAGS (report its character count) —
   must be 3 lines or fewer at 4.8cqh.
2. Steal flight: on STEAL resolution the kylix token appears at the
   victim's row position and flies to the thief's over 1.1s, then the
   ember deltas show (−N on the victim, +N on the thief) and the
   counter tween runs as in REVEAL. Observe a short full game with
   5 bots: report the time from the STEAL payload to token arrival and
   that the two deltas equal the payload's amount.
3. Ice and ink on the row during QUESTION: crystal / blot overlay on
   the figure and the reference's figure filter, IF the host payload
   for QUESTION or POWER_UP identifies the targets. Report the payload
   field used. If NO host payload identifies targets, report that,
   build nothing for FX, and do not touch the server — it becomes its
   own task. If built: observe a game where bots cast and report the
   count of iced and inked figures seen.
4. Bottom edge > 690 for all 15 phases at 3, 5, 6, 8 bots — offenders
   or the largest per count; npm run typecheck clean; git diff --stat
   server/ empty; re-run npm run screenshot:phases (BOT_COUNT=5),
   report PNG count, do not open them.

Sonnet. Playwright only for the measurements. Report each criterion
separately, under 8 lines total.
