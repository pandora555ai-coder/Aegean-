// Task 309 - pure probe: which pool do DRAW_MID and NUMERIC_CLOSE draw from,
// and how many voice-line entries does collectVoiceLineEntries register.
// No server, no port. Run at HEAD~ vs HEAD to read the dispatch diff.
import { collectVoiceLineEntries, createSocratesState, SPEECH_V2_LINES } from '../server/src/socrates.js';
import { recordLedgerQuizRound } from '../server/src/stageLedger.js';
import { pickSpeechSlot, type SpeechSlotId } from '../server/src/speechSlots.js';
import type { Room } from '../server/src/state.js';

function makeRoom(): Room {
  const room = { code: '0001', socrates: createSocratesState(), settings: { speechPolicy: 'v2' } } as unknown as Room;
  const outcome = (id: string, name: string, correct: boolean, points: number) => ({
    playerId: id, name, answered: true, correct, answerRank: correct ? 1 : null, scoreBefore: 0, scoreAfter: points,
  });
  recordLedgerQuizRound(
    room.socrates.ledger,
    [outcome('a', 'Άρης', true, 400), outcome('b', 'Νίκη', false, 0), outcome('c', 'Τάκης', true, 200)],
    1,
  );
  return room;
}

const entries = collectVoiceLineEntries();
console.log(`collectVoiceLineEntries: ${entries.length}; SPEECH_V2 pools: ${Object.keys(SPEECH_V2_LINES).length}`);
for (const slot of ['DRAW_MID', 'NUMERIC_CLOSE'] as SpeechSlotId[]) {
  const pools = new Map<string, number>();
  const targets = new Set<string>();
  const lines: string[] = [];
  for (let i = 0; i < 20; i++) {
    const beat = pickSpeechSlot(makeRoom(), slot);
    if (!beat) { pools.set('(silent)', (pools.get('(silent)') ?? 0) + 1); continue; }
    pools.set(beat.pool, (pools.get(beat.pool) ?? 0) + 1);
    targets.add(beat.targetName);
    if (lines.length < 2) lines.push(`${beat.targetName}: ${beat.picked.template}`);
  }
  console.log(`${slot}: ${JSON.stringify([...pools])} targets=${[...targets].join(',')}`);
  for (const l of lines) console.log(`   ${l}`);
}
