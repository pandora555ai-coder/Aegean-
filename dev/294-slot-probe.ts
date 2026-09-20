// Task 294 - the v2 slot engine as a PURE probe: no server, no port, no
// browser, no Room beyond the three fields the engine actually reads.
//
// It exists because the engine's two hard rules are decided by the SHAPE of a
// stage rather than by anything a bot run can be made to produce on demand: a
// tie has to leave the room silent, and a stage's two slots have to land on
// two different people. A real show only demonstrates whichever of those its
// own dice happened to roll - and with the reservoir pools down to one or
// three surviving lines (the deletion filter), a slot backed by one of them
// can legitimately stay silent in a run and prove nothing either way.
//
// Same stance as Task 293's own pure probe: exercise the real recorders and
// the real selector, assert the decisions, print the numbers.
import { createSocratesState } from '../server/src/socrates.js';
import { recordLedgerQuizRound, recordLedgerSteal, resetStageLedger } from '../server/src/stageLedger.js';
import { pickSpeechSlot, type SpeechSlotId } from '../server/src/speechSlots.js';
import type { Room } from '../server/src/state.js';

let checks = 0;
let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label}: ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`);
}

// The engine reads exactly these: room.code (logging), room.socrates.ledger
// (everything) and - only through speechV2, which the CALLERS check, never
// pickSpeechSlot itself - room.settings. So a probe needs no Room at all.
function makeRoom(): Room {
  return { code: '0001', socrates: createSocratesState(), settings: { speechPolicy: 'v2' } } as unknown as Room;
}

function round(
  room: Room,
  questionCount: number,
  outcomes: { id: string; name: string; correct: boolean; points: number }[],
): void {
  recordLedgerQuizRound(
    room.socrates.ledger,
    outcomes.map((outcome) => ({
      playerId: outcome.id,
      name: outcome.name,
      answered: true,
      correct: outcome.correct,
      answerRank: outcome.correct ? 1 : null,
      scoreBefore: 0,
      scoreAfter: outcome.points,
    })),
    questionCount,
  );
}

function fired(room: Room, slot: SpeechSlotId): { target: string; pool: string } | null {
  const beat = pickSpeechSlot(room, slot);
  return beat ? { target: beat.targetName, pool: beat.pool } : null;
}

// ---------------------------------------------------------------------------
console.log('\n1. A plain quiz stage: mid speaks to the WORST, close to the BEST, never the same person');
{
  const room = makeRoom();
  resetStageLedger(room.socrates.ledger, 1, 'Γύρος 1 — Η Αγορά', 'quiz');
  // Four questions, three players: ΑΛΦΑ runs away with it, ΓΑΜΑ is last.
  for (let i = 0; i < 4; i++) {
    round(room, 4, [
      { id: 'a', name: 'ΑΛΦΑ', correct: true, points: 1000 },
      { id: 'b', name: 'ΒΗΤΑ', correct: i % 2 === 0, points: 400 },
      { id: 'c', name: 'ΓΑΜΑ', correct: false, points: 0 },
    ]);
  }
  const mid = fired(room, 'QUIZ_MID');
  const close = fired(room, 'QUIZ_CLOSE');
  check('QUIZ_MID target', mid?.target, 'ΓΑΜΑ');
  check('QUIZ_MID pool', mid?.pool, 'AGORA_WORST');
  check('QUIZ_CLOSE target', close?.target, 'ΑΛΦΑ');
  check('QUIZ_CLOSE pool', close?.pool, 'RUNAWAY_LEAD (reservoir)');
  check('the two slots named two different people', mid?.target !== close?.target, true);
}

console.log('\n2. Η Παλαίστρα: mid prefers the BEST, close the WORST - the same alternation, opposite way round');
{
  const room = makeRoom();
  resetStageLedger(room.socrates.ledger, 2, 'Γύρος 2 — Η Παλαίστρα', 'blitz');
  round(room, 0, [
    { id: 'a', name: 'ΑΛΦΑ', correct: true, points: 900 },
    { id: 'b', name: 'ΒΗΤΑ', correct: true, points: 500 },
    { id: 'c', name: 'ΓΑΜΑ', correct: false, points: 100 },
  ]);
  const mid = fired(room, 'BLITZ_MID');
  const close = fired(room, 'BLITZ_CLOSE');
  check('BLITZ_MID target/pool', mid, { target: 'ΑΛΦΑ', pool: 'PALAISTRA_MID_BEST' });
  check('BLITZ_CLOSE target/pool', close, { target: 'ΓΑΜΑ', pool: 'PALAISTRA_CLOSE_WORST' });
  check('two different people', mid?.target !== close?.target, true);
}

console.log('\n3. A TIE at both ends is SILENCE, never a generic line');
{
  const room = makeRoom();
  resetStageLedger(room.socrates.ledger, 5, 'Γύρος 5 — Η Λήθη', 'agora');
  round(room, 3, [
    { id: 'a', name: 'ΑΛΦΑ', correct: true, points: 500 },
    { id: 'b', name: 'ΒΗΤΑ', correct: true, points: 500 },
    { id: 'c', name: 'ΓΑΜΑ', correct: true, points: 500 },
  ]);
  check('LETHE_CLOSE on an all-tied stage', fired(room, 'LETHE_CLOSE'), null);
}

console.log('\n4. Η Συκοφαντία: the first theft names the THIEF, the close falls to the VICTIM');
{
  const room = makeRoom();
  resetStageLedger(room.socrates.ledger, 6, 'Γύρος 6 — Η Συκοφαντία', 'quiz');
  round(room, 4, [
    { id: 'a', name: 'ΑΛΦΑ', correct: true, points: 1000 },
    { id: 'b', name: 'ΒΗΤΑ', correct: false, points: 300 },
  ]);
  recordLedgerSteal(room.socrates.ledger, {
    thiefPlayerId: 'a',
    thiefName: 'ΑΛΦΑ',
    victimPlayerId: 'b',
    victimName: 'ΒΗΤΑ',
    stolenAmount: 250,
  });
  const first = fired(room, 'SYKO_FIRST_STEAL');
  const close = fired(room, 'SYKO_CLOSE');
  check('SYKO_FIRST_STEAL names the thief', first, { target: 'ΑΛΦΑ', pool: 'SYKO_FIRST_STEAL' });
  check('SYKO_CLOSE falls to the victim', close, { target: 'ΒΗΤΑ', pool: 'SYKO_CLOSE_VICTIM' });
}

console.log('\n5. Each slot is attempted ONCE per stage, and the boundary clears the no-repeat set');
{
  const room = makeRoom();
  resetStageLedger(room.socrates.ledger, 2, 'Γύρος 2 — Η Παλαίστρα', 'blitz');
  round(room, 0, [
    { id: 'a', name: 'ΑΛΦΑ', correct: true, points: 900 },
    { id: 'c', name: 'ΓΑΜΑ', correct: false, points: 100 },
  ]);
  check('first attempt speaks', fired(room, 'BLITZ_MID')?.target, 'ΑΛΦΑ');
  check('second attempt of the SAME slot is refused', fired(room, 'BLITZ_MID'), null);
  check('targeted set carries within the stage', room.socrates.ledger.targetedThisStage.size, 1);
  resetStageLedger(room.socrates.ledger, 3, 'Γύρος 3 — Ζωγραφική', 'draw');
  check('the stage boundary clears the targeted set', room.socrates.ledger.targetedThisStage.size, 0);
  check('the stage boundary clears the fired-slot latches', room.socrates.ledger.firedSlots.size, 0);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
