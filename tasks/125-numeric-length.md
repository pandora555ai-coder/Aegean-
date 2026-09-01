Fix the numeric game length to exactly 5 questions.
Scoring is UNTOUCHED — a separate balance pass handles it later.

## Acceptance criteria — report on each SEPARATELY, with numbers

1. BEFORE changing anything: report where the numeric question count
   is decided — file, line, current value. If more than one place
   decides it, list all. Change nothing until this is reported.

2. A numeric game serves exactly 5 questions, then GAME_OVER.
   Report the constant's name and its file.

3. OBSERVED, not read: run one numeric game with bots on localhost
   and report the number of NUMERIC_REVEAL emissions before
   GAME_OVER, and the final scores. If no bot harness can drive
   numeric mode, say so explicitly and report what you ran instead —
   do not simulate the count by reading code.

## Report
Under 8 lines. One line per criterion, with numbers.
