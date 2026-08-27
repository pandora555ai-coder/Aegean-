// Dev-only check for the blitz selection rule (Task 69, acceptance
// criterion 3): draw 15 statements, then draw 15 more passing the seen-set
// the first draw returned, and confirm the two draws share nothing.
//
//   npm run blitz:draw-check
//
// Exercises the SAME drawBlitzStatements (shared) the client uses - no
// second copy of the shuffle/seen logic.
import { BLITZ_STATEMENTS, drawBlitzStatements } from '@game/shared';

const first = drawBlitzStatements([], 15);
const second = drawBlitzStatements(first.seen, 15);

const firstTexts = new Set(first.picks.map((p) => p.text));
const overlap = second.picks.filter((p) => firstTexts.has(p.text));

console.log(`pool size:        ${BLITZ_STATEMENTS.length}`);
console.log(`draw 1:           ${first.picks.length} statements`);
console.log(`draw 2:           ${second.picks.length} statements (seen-set carried over: ${first.seen.length})`);
console.log(`overlap:          ${overlap.length}`);
if (overlap.length > 0) {
  console.log('  repeated:', overlap.map((p) => p.text));
  process.exit(1);
}
console.log('OK - no statement repeated while unseen statements remained.');
