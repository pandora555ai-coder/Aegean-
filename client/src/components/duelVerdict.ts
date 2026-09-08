import type { DuelWeapon } from '@game/shared';

const WEAPON_NAME: Record<DuelWeapon, string> = { xifos: 'Το ξίφος', dory: 'Το δόρυ', aspida: 'Η ασπίδα' };
// Accusative (object-case) form of each weapon's own name - grammar only,
// independent of the beats cycle. Task 197: the old WEAPON_BEATEN table
// keyed these by "the weapon that beats this one" AND the verdict line
// always narrated from weaponA regardless of who actually won, so the
// sentence named the wrong pair (and the wrong winner's weapon) whenever B
// won, and was backwards from shared's DUEL_BEATS cycle (xifos beats dory
// beats aspida beats xifos) even when A won.
const WEAPON_ACCUSATIVE: Record<DuelWeapon, string> = { xifos: 'το ξίφος', dory: 'το δόρυ', aspida: 'την ασπίδα' };

export interface DuelVerdictInput {
  weaponA: DuelWeapon | null;
  weaponB: DuelWeapon | null;
  tie: boolean;
  winnerPlayerId: string | null;
  aPlayerId: string;
  aName: string;
  bName: string;
}

// Pure: (DUEL_REVEAL payload fields) in, verdict line out - no JSX, no
// React import, so this stays importable from a plain node/tsx script for
// the Task 197 regression check (dev/verify-duel-verdict.ts). Names ONLY
// the pair that was actually picked, describing the weapon that actually
// WON (per winnerPlayerId, matching a's playerId or not) beating the
// weapon that actually lost - never assumes weaponA is the winner.
export function buildDuelVerdictLine({ weaponA, weaponB, tie, winnerPlayerId, aPlayerId, aName, bName }: DuelVerdictInput): string {
  if (tie) {
    return 'Ίδια όπλα. Ίδιες ιδέες. Ξανά.';
  }
  if (!weaponA || !weaponB) {
    return '';
  }
  const aWon = winnerPlayerId === aPlayerId;
  const winningWeapon = aWon ? weaponA : weaponB;
  const losingWeapon = aWon ? weaponB : weaponA;
  const winnerName = aWon ? aName : bName;
  return `${WEAPON_NAME[winningWeapon]} περνά ${WEAPON_ACCUSATIVE[losingWeapon]}. ${winnerName}.`;
}
