// Dev-only check for the blitz two-slot feed (Task 71, acceptance
// criterion 5): run a round that ENDS with a statement still sitting in the
// buffer, and confirm the seen-set size equals the number of statements
// that were actually displayed - i.e. the buffered-but-never-shown
// statement is not silently counted as seen.
//
//   npm run blitz:feed-check
//
// Exercises the SAME startBlitzFeed / advanceBlitzFeed (shared) the client
// uses - no second copy of the promote/refill/seen logic.
import { BLITZ_STATEMENTS, advanceBlitzFeed, startBlitzFeed } from '@game/shared';

// --- main case: a normal round that ends mid-stack -----------------------
const ADVANCES = 40; // ~a 45s round's worth of swipes, far below the 218 pool

let state = startBlitzFeed([]); // two draws: current (shown) + buffer (not)
const displayed: string[] = [];
if (state.current) displayed.push(state.current.text);

for (let i = 0; i < ADVANCES; i += 1) {
  state = advanceBlitzFeed(state);
  if (state.current) displayed.push(state.current.text);
}
// The round ends HERE. state.buffer holds a statement that was drawn but
// never promoted to current, so it was never on screen.

const buffered = state.buffer;
const seenSize = state.seen.length;
const displayedCount = displayed.length;
const distinctDisplayed = new Set(displayed).size;

console.log(`pool size:            ${BLITZ_STATEMENTS.length}`);
console.log(`advances:             ${ADVANCES}`);
console.log(`still buffered:       ${buffered ? `"${buffered.text}"` : '(none)'}`);
console.log(`statements displayed: ${displayedCount} (${distinctDisplayed} distinct)`);
console.log(`seen-set size:        ${seenSize}`);

let ok = true;
const fail = (msg: string) => {
  console.log(`FAIL: ${msg}`);
  ok = false;
};

if (!buffered) fail('round did not end with a statement buffered');
if (seenSize !== displayedCount) fail(`seen-set (${seenSize}) != statements displayed (${displayedCount})`);
if (distinctDisplayed !== displayedCount) fail('a statement was displayed more than once in the round');
if (buffered && state.seen.includes(buffered.text)) fail('the buffered statement leaked into the seen-set');
if (buffered && displayed.includes(buffered.text)) fail('the buffered statement was actually displayed');

// --- exhaustion case: tiny pool, many reshuffles -----------------------
// With a 4-statement pool the unseen pool runs dry every few advances. The
// reshuffle must never hand back the statement already sitting in the
// buffer (the one just promoted to current), and no statement may show
// twice back-to-back.
const tiny = BLITZ_STATEMENTS.slice(0, 4);
let s2 = startBlitzFeed([], Math.random, tiny);
let prev = s2.current?.text ?? null;
let bufferEqualsCurrent = s2.current != null && s2.buffer != null && s2.current.text === s2.buffer.text;
let adjacentRepeat = false;

for (let i = 0; i < 300; i += 1) {
  s2 = advanceBlitzFeed(s2, Math.random, tiny);
  if (s2.current && s2.buffer && s2.current.text === s2.buffer.text) bufferEqualsCurrent = true;
  if (s2.current && s2.current.text === prev) adjacentRepeat = true;
  prev = s2.current?.text ?? null;
}
console.log(`\nexhaustion (pool ${tiny.length}, 300 advances):`);
console.log(`  buffer ever == current: ${bufferEqualsCurrent}`);
console.log(`  adjacent repeat:        ${adjacentRepeat}`);
if (bufferEqualsCurrent) fail('reshuffle put the on-screen statement back into the buffer');
if (adjacentRepeat) fail('a statement was shown twice back-to-back across a reshuffle');

if (!ok) process.exit(1);
console.log('\nOK - seen-set size == statements displayed; buffered statement never counted; reshuffle never echoes the on-screen scroll.');
