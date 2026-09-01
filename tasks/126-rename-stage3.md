Rename quiz stage 3 from "Η Δίκη" to "Η Συκοφαντία".
The name "Η Δίκη" is reserved for an upcoming finale phase.
STRING CHANGE ONLY — no mechanics, no ids, no audio files touched.

## Acceptance criteria — report on each SEPARATELY

1. BEFORE changing: report every occurrence of "Δίκη" in the repo
   (grep -rn, all of shared/server/client, count + locations).
   Remember the NUL-byte trap: use plain grep or add -a for shared/.

2. The stage 3 display name is "Η Συκοφαντία" everywhere a player or
   the TV sees it. Report the exact lines changed.

3. Anything NOT changed from the list in (1) — report each with one
   line on why it stays (e.g. voice line text keyed by lineHash,
   comments, task files).

## Report
Under 8 lines.
