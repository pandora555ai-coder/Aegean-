// Task 309 - the 16 lines to generate: 4 replacements + 12 new pool lines,
// resolved to their lineHash. Prints comma-separated hashes to stdout's last
// line; per-line detail to stderr.
import { CORONATION_SET_C, LINE_TAGS, SPEECH_V2_LINES } from '../server/src/socrates.js';
import { lineHash } from '../shared/src/index.js';

const replaced = [
  CORONATION_SET_C[1],
  SPEECH_V2_LINES.AGORA_WORST[0],
  SPEECH_V2_LINES.PALAISTRA_MID_BEST[0],
  SPEECH_V2_LINES.LITHI_CLOSE_OBSERVER[2],
];
const fresh = (['DRAW_MID_BEST', 'DRAW_MID_WORST', 'NUMERIC_CLOSE_BEST', 'NUMERIC_CLOSE_WORST'] as const).flatMap(
  (pool) => [...SPEECH_V2_LINES[pool]],
);
const all = [...replaced, ...fresh];
const hashes = all.map((t) => {
  const tag = LINE_TAGS[t] ?? null;
  const h = lineHash(t, tag);
  console.error(`${h} ${tag} ${t.length}ch ${t}`);
  return h;
});
console.error(`total ${all.length} lines, ${all.reduce((n, t) => n + t.length, 0)} raw chars (excl. tag)`);
console.log(hashes.join(','));
