// Task 206 - validation harness for the pure agora module (shared/src/
// agora.ts). Runs a fixed batch of seeds through generateAgora +
// buildAgoraQuestions and checks every acceptance criterion from
// tasks/206-*.md: option-set validity, twin-guard/absent-subject
// invariants, count bounds, and distribution/uniqueness stats. No Room, no
// io - this is npm run agora:validate, an in-process check like
// climb-spear-check.ts.
//
//   npx tsx server/scripts/agora-validate.ts [--seeds N] [--base-seed N]

import {
  AGORA_COLOURS,
  AGORA_GEESE_MAX,
  AGORA_GEESE_MIN,
  AGORA_GOODS_MAX,
  AGORA_GOODS_MIN,
  AGORA_STALL_LABEL_GR,
  AGORA_STALL_TYPES,
  buildAgoraQuestions,
  generateAgora,
  type AgoraScene,
  type AgoraStallType,
} from '@game/shared';

interface Cfg {
  seeds: number;
  baseSeed: number;
}

function parseArgs(argv: string[]): Cfg {
  const cfg: Cfg = { seeds: 10000, baseSeed: 1 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--seeds') cfg.seeds = Number(argv[++i]);
    if (argv[i] === '--base-seed') cfg.baseSeed = Number(argv[++i]);
  }
  return cfg;
}

let checksPassed = 0;
let checksFailed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean): void {
  if (condition) {
    checksPassed += 1;
  } else {
    checksFailed += 1;
    if (failures.length < 40) failures.push(label);
  }
}

// Reverse lookup: an existence-option label -> the stall type it names, if
// any (used to test presence/absence and the twin guard against the
// module's OWN label dictionary, not a reimplementation of its picking
// logic).
const LABEL_TO_STALL = new Map<string, AgoraStallType>(AGORA_STALL_TYPES.map((t) => [AGORA_STALL_LABEL_GR[t], t]));
const ANIMAL_LABELS = new Set(['Σκύλος', 'Κατσίκα', 'Γάτα', 'Χήνες']);
const TWIN_OF: Partial<Record<AgoraStallType, AgoraStallType>> = { amphorae: 'pottery', pottery: 'amphorae' };

function animalPresent(scene: AgoraScene, label: string): boolean {
  if (label === 'Σκύλος') return scene.animals.dog;
  if (label === 'Κατσίκα') return scene.animals.goat;
  if (label === 'Γάτα') return scene.animals.cat;
  if (label === 'Χήνες') return scene.animals.geeseN > 0;
  throw new Error(`not an animal label: ${label}`);
}

function isPresentOption(scene: AgoraScene, label: string): boolean {
  const stall = LABEL_TO_STALL.get(label);
  if (stall) return scene.stalls.some((s) => s.type === stall);
  if (ANIMAL_LABELS.has(label)) return animalPresent(scene, label);
  throw new Error(`unrecognized existence option label: ${label}`);
}

// --- distribution accumulators ---------------------------------------------
let variantYparhe = 0;
let variantDen = 0;
const stallPresentCount = new Map<AgoraStallType, number>(AGORA_STALL_TYPES.map((t) => [t, 0]));
const colourCorrectCount = new Map<string, number>(AGORA_COLOURS.map((c) => [c.id, 0]));
const countSubjectCount = new Map<string, number>();
const signatures = new Set<string>();

let twinGuardViolations = 0;
let absentSubjectViolations = 0;
let countBoundsViolations = 0;

function run(cfg: Cfg): void {
  let questionTotal = 0;

  for (let i = 0; i < cfg.seeds; i += 1) {
    const seed = cfg.baseSeed + i;
    const scene = generateAgora(seed);

    // Determinism (criterion 1): regenerating from the same seed must be
    // byte-identical.
    const sceneAgain = generateAgora(seed);
    check(`seed ${seed}: generateAgora is deterministic`, JSON.stringify(scene) === JSON.stringify(sceneAgain));

    // Scene shape.
    check(`seed ${seed}: 3 distinct stall types`, new Set(scene.stalls.map((s) => s.type)).size === 3);
    check(`seed ${seed}: 3 distinct colours`, new Set(scene.stalls.map((s) => s.colour)).size === 3);
    check(`seed ${seed}: 2 absent stalls, disjoint from present`, scene.absentStalls.length === 2 && scene.absentStalls.every((t) => !scene.stalls.some((s) => s.type === t)));
    for (const s of scene.stalls) {
      stallPresentCount.set(s.type, (stallPresentCount.get(s.type) ?? 0) + 1);
      if (s.count < AGORA_GOODS_MIN || s.count > AGORA_GOODS_MAX) countBoundsViolations += 1;
    }
    if (scene.animals.geeseN > 0 && (scene.animals.geeseN < AGORA_GEESE_MIN || scene.animals.geeseN > AGORA_GEESE_MAX)) {
      countBoundsViolations += 1;
    }

    signatures.add(JSON.stringify(scene));

    const questions = buildAgoraQuestions(scene, seed);
    const questionsAgain = buildAgoraQuestions(scene, seed);
    check(`seed ${seed}: buildAgoraQuestions is deterministic`, JSON.stringify(questions) === JSON.stringify(questionsAgain));
    check(`seed ${seed}: exactly 3 questions in existence/colour/count order`, questions.length === 3 && questions[0].kind === 'existence' && questions[1].kind === 'colour' && questions[2].kind === 'count');

    for (const q of questions) {
      questionTotal += 1;
      check(`seed ${seed} ${q.kind}: exactly 4 options`, q.options.length === 4);
      check(`seed ${seed} ${q.kind}: 4 distinct options`, new Set(q.options).size === 4);
      check(`seed ${seed} ${q.kind}: correctIndex in range`, q.correctIndex >= 0 && q.correctIndex < q.options.length);
    }

    // --- existence question -------------------------------------------
    const [existence] = questions;
    const isYparhe = existence.textGr.includes('ΥΠΗΡΧΕ');
    if (isYparhe) variantYparhe += 1;
    else variantDen += 1;

    const presentFlags = existence.options.map((label) => isPresentOption(scene, label));
    const presentCountInOptions = presentFlags.filter(Boolean).length;
    if (isYparhe) {
      check(`seed ${seed} existence(ΥΠΗΡΧΕ): 1 present + 3 absent`, presentCountInOptions === 1 && presentFlags[existence.correctIndex] === true);
    } else {
      check(`seed ${seed} existence(ΔΕΝ): 3 present + 1 absent`, presentCountInOptions === 3 && presentFlags[existence.correctIndex] === false);
    }
    // Twin guard: no option naming an absent stall whose twin is present.
    for (const label of existence.options) {
      const stall = LABEL_TO_STALL.get(label);
      if (!stall) continue;
      const present = scene.stalls.some((s) => s.type === stall);
      if (present) continue;
      const twin = TWIN_OF[stall];
      if (twin && scene.stalls.some((s) => s.type === twin)) {
        twinGuardViolations += 1;
        if (failures.length < 40) failures.push(`seed ${seed}: twin guard violated (${stall} absent, twin ${twin} present, option in play)`);
      }
    }

    // --- colour question -------------------------------------------
    const [, colour] = questions;
    const subjectType = AGORA_STALL_TYPES.find((t) => colour.textGr === agoraColourText(t));
    const colourStall = subjectType ? scene.stalls.find((s) => s.type === subjectType) : undefined;
    if (!colourStall) {
      absentSubjectViolations += 1;
      if (failures.length < 40) failures.push(`seed ${seed}: colour question subject not resolvable to a present stall`);
    } else {
      const correctColourName = AGORA_COLOURS.find((c) => c.id === colourStall.colour)!.nameGr;
      check(`seed ${seed} colour: correct option matches the stall's real colour`, colour.options[colour.correctIndex] === correctColourName);
      colourCorrectCount.set(colourStall.colour, (colourCorrectCount.get(colourStall.colour) ?? 0) + 1);
    }

    // --- count question -------------------------------------------
    const [, , count] = questions;
    const truth = Number(count.options[count.correctIndex]);
    if (count.textGr.includes('χήνες')) {
      check(`seed ${seed} count(geese): truth within 1..3`, truth >= AGORA_GEESE_MIN && truth <= AGORA_GEESE_MAX && truth === scene.animals.geeseN);
      countSubjectCount.set('geese', (countSubjectCount.get('geese') ?? 0) + 1);
    } else {
      const countSubjectType = AGORA_STALL_TYPES.find((t) => count.textGr === agoraCountText(t));
      const countStall = countSubjectType ? scene.stalls.find((s) => s.type === countSubjectType) : undefined;
      if (!countStall) {
        absentSubjectViolations += 1;
        if (failures.length < 40) failures.push(`seed ${seed}: count question subject not resolvable to a present stall`);
      } else {
        check(`seed ${seed} count(stall): truth within 2..5 and matches the stall's real count`, truth >= AGORA_GOODS_MIN && truth <= AGORA_GOODS_MAX && truth === countStall.count);
        check(`seed ${seed} count: never about the colour question's own stall`, colourStall === undefined || countStall.type !== colourStall.type);
        countSubjectCount.set(countStall.type, (countSubjectCount.get(countStall.type) ?? 0) + 1);
      }
    }
  }

  report(cfg, questionTotal);
}

// Exact colour-question sentence per stall type, mirrored from the
// {stallLabel} accusative forms in shared/src/agora.ts, so the subject
// stall can be recovered from textGr without importing an internal.
function agoraColourText(type: AgoraStallType): string {
  const acc: Record<AgoraStallType, string> = {
    amphorae: 'τους αμφορείς',
    fish: 'τα ψάρια',
    cloth: 'τα υφάσματα',
    pottery: 'τα κεραμικά',
    fruit: 'τους καρπούς',
  };
  return `Τι χρώμα είχε η τέντα στον πάγκο με ${acc[type]};`;
}

// Exact count-question sentence per stall type, mirrored from
// AGORA_STALL_COUNT_TEXT_GR in shared/src/agora.ts, so the subject stall
// can be recovered from textGr without importing an internal.
function agoraCountText(type: AgoraStallType): string {
  switch (type) {
    case 'amphorae':
      return 'Πόσους αμφορείς είχε ο αμφορέας;';
    case 'fish':
      return 'Πόσα ψάρια είχε ο ψαράς;';
    case 'cloth':
      return 'Πόσα τόπια ύφασμα είχε ο υφαντής;';
    case 'pottery':
      return 'Πόσα πιθάρια είχε ο κεραμέας;';
    case 'fruit':
      return 'Πόσα καλάθια είχε ο οπωροπώλης;';
  }
}

function report(cfg: Cfg, questionTotal: number): void {
  console.log(`agora:validate - ${cfg.seeds} seeds (base ${cfg.baseSeed}), ${questionTotal} questions`);
  console.log(`checks: ${checksPassed} passed, ${checksFailed} failed`);
  console.log(`twin guard violations: ${twinGuardViolations}`);
  console.log(`absent-subject violations (colour/count about an absent stall): ${absentSubjectViolations}`);
  console.log(`count-bounds violations (truth outside its valid range): ${countBoundsViolations}`);
  console.log(`param-signature uniqueness: ${signatures.size}/${cfg.seeds} (${((signatures.size / cfg.seeds) * 100).toFixed(2)}%)`);

  const variantTotal = variantYparhe + variantDen;
  console.log(`existence variant split: ΥΠΗΡΧΕ ${variantYparhe} (${((variantYparhe / variantTotal) * 100).toFixed(1)}%), ΔΕΝ υπήρχε ${variantDen} (${((variantDen / variantTotal) * 100).toFixed(1)}%)`);

  console.log('--- stall present-frequency (of 3 slots per seed) ---');
  for (const [type, n] of stallPresentCount) console.log(`  ${type}: ${n} (${((n / (cfg.seeds * 3)) * 100).toFixed(2)}%)`);

  console.log('--- colour correct-answer frequency ---');
  const colourTotal = [...colourCorrectCount.values()].reduce((a, b) => a + b, 0);
  for (const [id, n] of colourCorrectCount) console.log(`  ${id}: ${n} (${((n / colourTotal) * 100).toFixed(2)}%)`);

  console.log('--- count question subject frequency ---');
  const countTotal = [...countSubjectCount.values()].reduce((a, b) => a + b, 0);
  for (const [subject, n] of countSubjectCount) console.log(`  ${subject}: ${n} (${((n / countTotal) * 100).toFixed(2)}%)`);

  // Skew verdict: flag anything more than 2x away from a uniform
  // expectation within its own category.
  console.log('--- skew verdict (>2x uniform expectation) ---');
  let anySkew = false;
  const stallExpected = (cfg.seeds * 3) / AGORA_STALL_TYPES.length;
  for (const [type, n] of stallPresentCount) {
    if (n > stallExpected * 2 || n < stallExpected / 2) {
      anySkew = true;
      console.log(`  SKEW stall ${type}: ${n} vs expected ~${stallExpected.toFixed(0)}`);
    }
  }
  const colourExpected = colourTotal / AGORA_COLOURS.length;
  for (const [id, n] of colourCorrectCount) {
    if (n > colourExpected * 2 || n < colourExpected / 2) {
      anySkew = true;
      console.log(`  SKEW colour ${id}: ${n} vs expected ~${colourExpected.toFixed(0)}`);
    }
  }
  const countExpected = countTotal / countSubjectCount.size;
  for (const [subject, n] of countSubjectCount) {
    if (n > countExpected * 2 || n < countExpected / 2) {
      anySkew = true;
      console.log(`  SKEW count-subject ${subject}: ${n} vs expected ~${countExpected.toFixed(0)}`);
    }
  }
  const variantExpected = variantTotal / 2;
  if (variantYparhe > variantExpected * 2 || variantYparhe < variantExpected / 2) {
    anySkew = true;
    console.log(`  SKEW existence variant ΥΠΗΡΧΕ: ${variantYparhe} vs expected ~${variantExpected.toFixed(0)}`);
  }
  console.log(anySkew ? 'VERDICT: skew flagged above' : 'VERDICT: no category exceeds 2x uniform skew');

  if (failures.length > 0) {
    console.log('--- first failures ---');
    for (const f of failures) console.log(`  FAIL: ${f}`);
  }

  if (checksFailed > 0 || twinGuardViolations > 0 || absentSubjectViolations > 0 || countBoundsViolations > 0) {
    process.exitCode = 1;
  }
}

run(parseArgs(process.argv.slice(2)));
