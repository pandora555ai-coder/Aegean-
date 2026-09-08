# Task 197 — Duel verdict line must match the actual weapon pair

## Root cause (client-side, not server)

Server truth (journalctl -u party-game.service, last 4h, `grep "duel revealed"`,
room 3721):
```
Sep 08 16:53:40 ... room 3721 duel revealed — Δημήτρης:aspida vs Mel:dory -> winner Mel
Sep 08 16:54:16 ... room 3721 duel revealed — Δημήτρης:xifos vs Mel:dory -> winner Δημήτρης
Sep 08 16:54:43 ... room 3721 duel revealed — Δημήτρης:dory vs Mel:aspida -> winner Δημήτρης
```
All three match shared's `DUEL_BEATS` cycle (`xifos: 'dory', dory: 'aspida',
aspida: 'xifos'`, shared/src/index.ts:2327) exactly. **Stop-gate did not
fire — server resolution is correct.**

Two client bugs in `client/src/components/AnavasisScene.tsx` (pre-fix,
line 590):
```
`${WEAPON_NAME[weaponA as DuelWeapon]} περνά ${WEAPON_BEATEN[weaponA as DuelWeapon]}. ${winnerPlayerId === a.playerId ? a.name : b.name}.`
```
1. Always narrates from `weaponA`, regardless of who actually won
   (`winnerPlayerId`) — wrong pair described whenever B won.
2. `WEAPON_BEATEN` (old line 606) was keyed backwards from shared's real
   cycle: `{ xifos: 'aspida', dory: 'xifos', aspida: 'dory' }`-shaped (by
   accusative value) instead of the true `DUEL_BEATS` direction — wrong
   even when A won.

Both bugs compound, so the printed line was wrong on effectively every
reveal, matching the report.

## Fix

Extracted the pure resolver into a new non-JSX module,
`client/src/components/duelVerdict.ts` (`buildDuelVerdictLine`), so it's
importable from a plain script with no React/JSX runtime needed. Reads
only `{ weaponA, weaponB, tie, winnerPlayerId, aPlayerId, aName, bName }`
— every one a direct DUEL_REVEAL payload field (traced in HostScreen.tsx's
`liveDuel` construction, ~line 1915: `weaponA`/`weaponB` come from
`duelReveal.duelists[*].weapon`, never from the pre-reveal `duelPick`
branch, which sets them `null`). Determines the actual winning weapon from
`winnerPlayerId === aPlayerId`, not a fixed side.

## Unit test: 9/9 combinations

`dev/verify-duel-verdict.ts` (run: `npx tsx dev/verify-duel-verdict.ts`),
cross-checked against shared's own `duelOutcome`:

| A | B | winner | result | line |
|---|---|---|---|---|
| xifos | xifos | TIE | PASS | Ίδια όπλα. Ίδιες ιδέες. Ξανά. |
| xifos | dory | Alpha | PASS | Το ξίφος περνά το δόρυ. Alpha. |
| xifos | aspida | Beta | PASS | Η ασπίδα περνά το ξίφος. Beta. |
| dory | xifos | Beta | PASS | Το ξίφος περνά το δόρυ. Beta. |
| dory | dory | TIE | PASS | Ίδια όπλα. Ίδιες ιδέες. Ξανά. |
| dory | aspida | Alpha | PASS | Το δόρυ περνά την ασπίδα. Alpha. |
| aspida | xifos | Alpha | PASS | Η ασπίδα περνά το ξίφος. Alpha. |
| aspida | dory | Beta | PASS | Το δόρυ περνά την ασπίδα. Beta. |
| aspida | aspida | TIE | PASS | Ίδια όπλα. Ίδιες ιδέες. Ξανά. |

9/9 passed. Both orders of a decisive pair (e.g. xifos/dory and
dory/xifos) yield the identical weapon sentence, differing only in the
winner's name — confirms "a pick pair triggers only its own line."

Live end-to-end check (Playwright, dev server, real DUEL_REVEAL payload
for aspida vs dory): rendered `[data-testid="anavasis-duel-verdict"]` text
= `"Το δόρυ περνά την ασπίδα. Mel."`, matching the real server log combo
verbatim.
