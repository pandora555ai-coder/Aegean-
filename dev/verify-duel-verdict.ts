// Task 197 - regression check for AnavasisScene's buildDuelVerdictLine.
// Exercises all 3x3 ordered weapon-pick combinations against the
// authoritative shared duelOutcome (the server's own resolution rule),
// so this fails loudly if the client's verdict text ever drifts from the
// real xifos>dory>aspida>xifos cycle again. Run: npx tsx dev/verify-duel-verdict.ts
import { duelOutcome, type DuelWeapon } from '@game/shared';
import { buildDuelVerdictLine } from '../client/src/components/duelVerdict.js';

const WEAPONS: readonly DuelWeapon[] = ['xifos', 'dory', 'aspida'];
const A_ID = 'playerA';
const B_ID = 'playerB';
const A_NAME = 'Alpha';
const B_NAME = 'Beta';

const WEAPON_NAME: Record<DuelWeapon, string> = { xifos: 'Το ξίφος', dory: 'Το δόρυ', aspida: 'Η ασπίδα' };
const WEAPON_ACCUSATIVE: Record<DuelWeapon, string> = { xifos: 'το ξίφος', dory: 'το δόρυ', aspida: 'την ασπίδα' };

let failures = 0;
const rows: string[] = [];

for (const weaponA of WEAPONS) {
  for (const weaponB of WEAPONS) {
    const outcome = duelOutcome(weaponA, weaponB);
    const tie = outcome === 'TIE';
    const winnerPlayerId = tie ? null : outcome === 'A' ? A_ID : B_ID;

    const expected = tie
      ? 'Ίδια όπλα. Ίδιες ιδέες. Ξανά.'
      : `${WEAPON_NAME[outcome === 'A' ? weaponA : weaponB]} περνά ${WEAPON_ACCUSATIVE[outcome === 'A' ? weaponB : weaponA]}. ${outcome === 'A' ? A_NAME : B_NAME}.`;

    const actual = buildDuelVerdictLine({
      weaponA,
      weaponB,
      tie,
      winnerPlayerId,
      aPlayerId: A_ID,
      aName: A_NAME,
      bName: B_NAME,
    });

    const pass = actual === expected;
    if (!pass) failures++;
    const winnerLabel = tie ? 'TIE' : outcome === 'A' ? A_NAME : B_NAME;
    rows.push(
      `${weaponA.padEnd(6)} vs ${weaponB.padEnd(6)} | winner=${winnerLabel.padEnd(5)} | ${pass ? 'PASS' : 'FAIL'} | "${actual}"`,
    );
  }
}

console.log(rows.join('\n'));
console.log(`\n${9 - failures}/9 passed`);
if (failures > 0) {
  process.exit(1);
}
