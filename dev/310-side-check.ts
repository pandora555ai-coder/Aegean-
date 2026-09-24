// Task 310 - pure probe (no server, no port): which SIDE of a v2 slot does the
// stage data select? Every slot is built >=20 times from ledgers shaped to hit
// each side, plus a skip case; DRAW_MID / NUMERIC_CLOSE follow the drawer's
// guess outcome / the estimates' relative miss, the others the score-delta
// extremes (both sides reached via the alternation + fallback).
import { createSocratesState } from '../server/src/socrates.js';
import {
  recordLedgerBlitzRound, recordLedgerDrawRound, recordLedgerNumericRound, recordLedgerQuizRound, resetStageLedger,
} from '../server/src/stageLedger.js';
import { pickSpeechSlot, type SpeechSlotId } from '../server/src/speechSlots.js';
import type { Room } from '../server/src/state.js';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail: string): void {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label}: ${detail}`);
}
const log = console.log;
function quiet<T>(fn: () => T): T {
  console.log = () => {};
  try { return fn(); } finally { console.log = log; }
}
const N = 24;
const room = (): Room => ({ code: '0001', socrates: createSocratesState(), settings: { speechPolicy: 'v2' } } as unknown as Room);
const IDS = ['a', 'b', 'c', 'd', 'e'];
const NAMES = ['Άρης', 'Νίκη', 'Τάκης', 'Χαρά', 'Λευτέρης'];

function tally(build: () => Room, slot: SpeechSlotId): { pools: Record<string, number>; targets: Record<string, number> } {
  const pools: Record<string, number> = {};
  const targets: Record<string, number> = {};
  for (let i = 0; i < N; i++) {
    const beat = quiet(() => pickSpeechSlot(build(), slot));
    const key = beat ? beat.pool : 'SKIP';
    pools[key] = (pools[key] ?? 0) + 1;
    if (beat) targets[beat.targetName] = (targets[beat.targetName] ?? 0) + 1;
  }
  return { pools, targets };
}
const show = (t: { pools: Record<string, number>; targets: Record<string, number> }): string => `${JSON.stringify(t.pools)} targets=${JSON.stringify(t.targets)}`;

// ---- DRAW_MID: one cycle, five drawers; outcome[i] = correct guessers of 4 eligible
function drawRoom(outcomes: number[]): Room {
  const r = room();
  resetStageLedger(r.socrates.ledger, 3, 'Ζωγραφική', 'draw');
  outcomes.forEach((correct, i) => {
    recordLedgerDrawRound(r.socrates.ledger, {
      drawerPlayerId: IDS[i], drawerName: NAMES[i], drawerPoints: Math.round((400 * correct) / 4),
      correctGuessers: correct, eligibleGuessers: 4, guessers: [],
    });
  });
  return r;
}
console.log('DRAW_MID (side = how the drawing landed, not the score leader)');
{
  const everyone = tally(() => drawRoom([4, 2, 1, 3, 2]), 'DRAW_MID');
  check('one drawer everyone got -> BEST only', everyone.pools.DRAW_MID_BEST === N && Object.keys(everyone.pools).length === 1, show(everyone));
  const nobody = tally(() => drawRoom([2, 0, 3, 1, 2]), 'DRAW_MID');
  check('one drawer nobody got -> WORST only', nobody.pools.DRAW_MID_WORST === N && Object.keys(nobody.pools).length === 1, show(nobody));
  // The score leader is NOT the target: b drew the unguessed picture but a/c lead on points.
  check('WORST names the unguessed drawer, not the score leader', Object.keys(nobody.targets).join() === 'Νίκη', show(nobody));
  const both = tally(() => drawRoom([4, 0, 1, 2, 3]), 'DRAW_MID');
  check('both extremes present -> BOTH sides reached', (both.pools.DRAW_MID_BEST ?? 0) > 0 && (both.pools.DRAW_MID_WORST ?? 0) > 0, show(both));
  const many = tally(() => drawRoom([4, 4, 4, 1, 2]), 'DRAW_MID');
  check('several drawers everyone got -> BEST, target varies among them', many.pools.DRAW_MID_BEST === N && Object.keys(many.targets).length > 1, show(many));
  const neither = tally(() => drawRoom([1, 2, 3, 2, 3]), 'DRAW_MID');
  check('nobody extreme -> SKIP', neither.pools.SKIP === N, show(neither));
  const none = tally(() => { const r = room(); resetStageLedger(r.socrates.ledger, 3, 'Ζωγραφική', 'draw'); return r; }, 'DRAW_MID');
  check('empty ledger -> SKIP', none.pools.SKIP === N, show(none));
}

// ---- NUMERIC_CLOSE: 3 questions, max 1000; means[i] = that player's relative miss every question
function numRoom(means: number[]): Room {
  const r = room();
  resetStageLedger(r.socrates.ledger, 4, 'Εκτίμηση', 'numeric');
  for (let q = 0; q < 3; q++) {
    recordLedgerNumericRound(
      r.socrates.ledger, q,
      means.map((m, i) => ({ playerId: IDS[i], name: NAMES[i], value: 100, distance: m * 1000, exact: m === 0, pointsAwarded: 0 })),
      1000,
    );
  }
  return r;
}
console.log('NUMERIC_CLOSE (side = the more extreme of closest vs farthest, mean relative miss)');
{
  const near = tally(() => numRoom([0.01, 0.4, 0.5, 0.6, 0.55]), 'NUMERIC_CLOSE');
  check('closest is more extreme (0.99 vs 0.60) -> BEST', near.pools.NUMERIC_CLOSE_BEST === N && Object.keys(near.pools).length === 1, show(near));
  const far = tally(() => numRoom([0.4, 0.45, 0.5, 0.95, 0.42]), 'NUMERIC_CLOSE');
  check('farthest is more extreme (0.95 vs 0.60) -> WORST', far.pools.NUMERIC_CLOSE_WORST === N && Object.keys(far.pools).length === 1, show(far));
  const tie = tally(() => numRoom([0.25, 0.5, 0.75, 0.6, 0.55]), 'NUMERIC_CLOSE');
  check('equal extremes (0.75 vs 0.75) -> SKIP', tie.pools.SKIP === N, show(tie));
  const tiedClosest = tally(() => numRoom([0.1, 0.1, 0.5, 0.6, 0.9]), 'NUMERIC_CLOSE');
  check('tied closest is dropped, unique farthest kept -> WORST', tiedClosest.pools.NUMERIC_CLOSE_WORST === N, show(tiedClosest));
  const allTied = tally(() => numRoom([0.3, 0.3, 0.3, 0.3, 0.3]), 'NUMERIC_CLOSE');
  check('everyone equal -> SKIP', allTied.pools.SKIP === N, show(allTied));
  const solo = tally(() => numRoom([0.3]), 'NUMERIC_CLOSE');
  check('one answerer -> SKIP', solo.pools.SKIP === N, show(solo));
  // A random sweep: both sides must show up across differently-shaped fields.
  let seed = 310;
  const rnd = (): number => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const sweep: Record<string, number> = {};
  for (let i = 0; i < 40; i++) {
    const means = IDS.map(() => Math.round(rnd() * 1000) / 1000);
    const beat = quiet(() => pickSpeechSlot(numRoom(means), 'NUMERIC_CLOSE'));
    const key = beat ? beat.pool : 'SKIP';
    sweep[key] = (sweep[key] ?? 0) + 1;
  }
  check('40 random fields -> both sides reached', (sweep.NUMERIC_CLOSE_BEST ?? 0) > 0 && (sweep.NUMERIC_CLOSE_WORST ?? 0) > 0, JSON.stringify(sweep));
  const repeat = quiet(() => {
    const r = numRoom([0.01, 0.4, 0.5, 0.6, 0.55]);
    const first = pickSpeechSlot(r, 'NUMERIC_CLOSE');
    r.socrates.ledger.firedSlots.clear();
    return [first?.targetName, pickSpeechSlot(r, 'NUMERIC_CLOSE')?.pool];
  });
  check('never the same target twice in a stage (best already spoken about -> falls to WORST)', repeat[0] === 'Άρης' && repeat[1] === 'NUMERIC_CLOSE_WORST', JSON.stringify(repeat));
}

// ---- the score-delta slots: random quiz/blitz ledgers, both pools must appear
console.log('score-delta slots (prefer + fallback; both sides via ties)');
{
  let seed = 7;
  const rnd = (): number => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const quizRoom = (slot: SpeechSlotId): Room => {
    const r = room();
    resetStageLedger(r.socrates.ledger, 1, 'x', slot === 'LETHE_CLOSE' ? 'agora' : 'quiz');
    if (slot.startsWith('BLITZ')) {
      recordLedgerBlitzRound(r.socrates.ledger, 1, IDS.map((id, i) => ({ playerId: id, name: NAMES[i], correct: 0, wrong: 0, unanswered: 0, pointsAwarded: Math.floor(rnd() * 4) * 100 })));
    } else {
      recordLedgerQuizRound(r.socrates.ledger, IDS.map((id, i) => {
        const pts = Math.floor(rnd() * 4) * 100;
        return { playerId: id, name: NAMES[i], answered: true, correct: pts > 0, answerRank: pts > 0 ? 1 : null, scoreBefore: 0, scoreAfter: pts };
      }), 2);
    }
    return r;
  };
  for (const slot of ['QUIZ_MID', 'QUIZ_CLOSE', 'BLITZ_MID', 'BLITZ_CLOSE', 'LETHE_CLOSE'] as SpeechSlotId[]) {
    const pools: Record<string, number> = {};
    for (let i = 0; i < 60; i++) {
      const beat = quiet(() => pickSpeechSlot(quizRoom(slot), slot));
      const key = beat ? beat.pool : 'SKIP';
      pools[key] = (pools[key] ?? 0) + 1;
    }
    const sides = Object.keys(pools).filter((k) => k !== 'SKIP').length;
    check(`${slot}: both sides reached`, sides >= 2, JSON.stringify(pools));
  }
}
console.log(`${checks - failures}/${checks} checks`);
process.exit(failures === 0 ? 0 : 1);
