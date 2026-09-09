// Task 206 - Η Μνήμη της Αγοράς: a procedurally generated night-agora scene
// plus the 3 multiple-choice questions asked about it afterward. PURE ONLY -
// no server/runtime imports, no Room, no io, no timers (the same discipline
// climb.ts/trial.ts follow). NOT wired into the phase machine, payloads, or
// any client code yet - this file and its validation harness
// (server/scripts/agora-validate.ts) are the whole of this task.
//
// Everything here is deterministic from a numeric seed via its own PRNG
// (mulberry32 - never Math.random, so a room can regenerate the same scene
// from a stored seed without keeping the scene itself around). The
// generator and the question builder each run their OWN mulberry32 stream
// off the same seed - two independent, reproducible sequences, not one
// shared one - so calling buildAgoraQuestions again for an already-built
// scene can never depend on how many random draws generation happened to
// consume.
//
// TWIN GUARD: amphorae and pottery are visually similar enough that asking
// "which of these did NOT exist" about one while the OTHER is actually on
// stage would be a genuinely confusing question, not just a hard one - so
// an absent stall whose twin IS present is filtered out of the pool an
// existence question can ever be built from, for either phrasing.

export const AGORA_EXPOSURE_MS = 12000;
export const AGORA_STALL_SLOTS = 3;
export const AGORA_GOODS_MIN = 2;
export const AGORA_GOODS_MAX = 5;
export const AGORA_GEESE_MIN = 1;
export const AGORA_GEESE_MAX = 3;
export const AGORA_GEESE_PRESENCE_P = 0.55;
export const AGORA_ANIMAL_PRESENCE_P = 0.5;
// How often the count question (Q3) asks about the geese instead of a
// stall's goods, when geese happen to be present at all.
const AGORA_COUNT_GEESE_P = 0.35;

export type AgoraStallType = 'amphorae' | 'fish' | 'cloth' | 'pottery' | 'fruit';

export const AGORA_STALL_TYPES: readonly AgoraStallType[] = ['amphorae', 'fish', 'cloth', 'pottery', 'fruit'];

// Accusative "with ___" form - the {stallLabel} slot in the colour
// question, and the tail of the existence-option label below.
const AGORA_STALL_LABEL_ACC_GR: Readonly<Record<AgoraStallType, string>> = {
  amphorae: 'τους αμφορείς',
  fish: 'τα ψάρια',
  cloth: 'τα υφάσματα',
  pottery: 'τα κεραμικά',
  fruit: 'τους καρπούς',
};

// Standalone existence-question option label: "Πάγκος με ___".
export const AGORA_STALL_LABEL_GR: Readonly<Record<AgoraStallType, string>> = {
  amphorae: `Πάγκος με ${AGORA_STALL_LABEL_ACC_GR.amphorae}`,
  fish: `Πάγκος με ${AGORA_STALL_LABEL_ACC_GR.fish}`,
  cloth: `Πάγκος με ${AGORA_STALL_LABEL_ACC_GR.cloth}`,
  pottery: `Πάγκος με ${AGORA_STALL_LABEL_ACC_GR.pottery}`,
  fruit: `Πάγκος με ${AGORA_STALL_LABEL_ACC_GR.fruit}`,
};

// The count question's full sentence per stall type - authored per type
// rather than templated, because the grammar isn't uniform (amphorae takes
// a masculine accusative "Πόσους", not the neuter/feminine "Πόσα" every
// other stall takes, and each stall's "merchant" noun is irregular).
const AGORA_STALL_COUNT_TEXT_GR: Readonly<Record<AgoraStallType, string>> = {
  amphorae: 'Πόσους αμφορείς είχε ο αμφορέας;',
  fish: 'Πόσα ψάρια είχε ο ψαράς;',
  cloth: 'Πόσα τόπια ύφασμα είχε ο υφαντής;',
  pottery: 'Πόσα πιθάρια είχε ο κεραμέας;',
  fruit: 'Πόσα καλάθια είχε ο οπωροπώλης;',
};

// The only twin pair today. A list (not a single hardcoded pair) so a
// second pair can be added later without touching the guard logic itself.
const AGORA_TWIN_PAIRS: readonly (readonly [AgoraStallType, AgoraStallType])[] = [['amphorae', 'pottery']];

function stallTwin(type: AgoraStallType): AgoraStallType | null {
  for (const [a, b] of AGORA_TWIN_PAIRS) {
    if (a === type) return b;
    if (b === type) return a;
  }
  return null;
}

export type AgoraAwningColourId = 'krasati' | 'ladi' | 'ochra' | 'porfyri' | 'lefki';

export interface AgoraColourDef {
  id: AgoraAwningColourId;
  nameGr: string;
  hex: string;
}

export const AGORA_COLOURS: readonly AgoraColourDef[] = [
  { id: 'krasati', nameGr: 'κρασάτη', hex: '#8E2440' },
  { id: 'ladi', nameGr: 'λαδί', hex: '#9AA860' },
  { id: 'ochra', nameGr: 'ώχρα', hex: '#E8A14A' },
  { id: 'porfyri', nameGr: 'πορφυρή', hex: '#5A3350' },
  { id: 'lefki', nameGr: 'λευκή', hex: '#EDE6D6' },
];

function colourNameGr(id: AgoraAwningColourId): string {
  return AGORA_COLOURS.find((c) => c.id === id)!.nameGr;
}

export interface AgoraStall {
  type: AgoraStallType;
  colour: AgoraAwningColourId;
  count: number; // AGORA_GOODS_MIN..AGORA_GOODS_MAX
  slot: number; // 0..AGORA_STALL_SLOTS-1
}

export interface AgoraAnimals {
  dog: boolean;
  goat: boolean;
  cat: boolean;
  geeseN: number; // 0 = absent, else AGORA_GEESE_MIN..AGORA_GEESE_MAX
}

export interface AgoraScene {
  stalls: [AgoraStall, AgoraStall, AgoraStall];
  animals: AgoraAnimals;
  absentStalls: [AgoraStallType, AgoraStallType];
}

export type AgoraQuestionKind = 'existence' | 'colour' | 'count';

export interface AgoraQuestion {
  kind: AgoraQuestionKind;
  textGr: string;
  options: [string, string, string, string];
  correctIndex: number;
}

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32) - same implementation as
// server/scripts/trial-montecarlo.ts's, duplicated rather than imported
// because this module must stay import-free of anything outside shared.
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function shuffle<T>(rng: () => number, items: readonly T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Scene generation
// ---------------------------------------------------------------------------
export function generateAgora(seed: number): AgoraScene {
  const rng = mulberry32(seed);

  const shuffledTypes = shuffle(rng, AGORA_STALL_TYPES);
  const presentTypes = shuffledTypes.slice(0, AGORA_STALL_SLOTS) as [AgoraStallType, AgoraStallType, AgoraStallType];
  const absentStalls = shuffledTypes.slice(AGORA_STALL_SLOTS) as [AgoraStallType, AgoraStallType];

  const colourIds = shuffle(
    rng,
    AGORA_COLOURS.map((c) => c.id),
  ).slice(0, AGORA_STALL_SLOTS);

  const stalls = presentTypes.map((type, slot) => ({
    type,
    colour: colourIds[slot],
    count: randInt(rng, AGORA_GOODS_MIN, AGORA_GOODS_MAX),
    slot,
  })) as [AgoraStall, AgoraStall, AgoraStall];

  const animals: AgoraAnimals = {
    dog: rng() < AGORA_ANIMAL_PRESENCE_P,
    goat: rng() < AGORA_ANIMAL_PRESENCE_P,
    cat: rng() < AGORA_ANIMAL_PRESENCE_P,
    geeseN: rng() < AGORA_GEESE_PRESENCE_P ? randInt(rng, AGORA_GEESE_MIN, AGORA_GEESE_MAX) : 0,
  };

  return { stalls, animals, absentStalls };
}

// ---------------------------------------------------------------------------
// Question building
// ---------------------------------------------------------------------------
interface AgoraItem {
  key: string; // e.g. 'stall:fish' / 'animal:dog' - unique within a scene
  labelGr: string;
}

function stallItem(type: AgoraStallType): AgoraItem {
  return { key: `stall:${type}`, labelGr: AGORA_STALL_LABEL_GR[type] };
}

const ANIMAL_LABEL_GR = { dog: 'Σκύλος', goat: 'Κατσίκα', cat: 'Γάτα', geese: 'Χήνες' } as const;

function animalItem(kind: keyof typeof ANIMAL_LABEL_GR): AgoraItem {
  return { key: `animal:${kind}`, labelGr: ANIMAL_LABEL_GR[kind] };
}

function buildMcQuestion(
  rng: () => number,
  kind: AgoraQuestionKind,
  textGr: string,
  correct: AgoraItem,
  distractors: readonly AgoraItem[],
): AgoraQuestion {
  const options = shuffle(rng, [correct, ...distractors]);
  const correctIndex = options.findIndex((item) => item.key === correct.key);
  return {
    kind,
    textGr,
    options: options.map((item) => item.labelGr) as [string, string, string, string],
    correctIndex,
  };
}

function buildExistenceQuestion(rng: () => number, scene: AgoraScene): AgoraQuestion {
  const presentTypes = scene.stalls.map((s) => s.type);

  const presentItems: AgoraItem[] = [
    ...scene.stalls.map((s) => stallItem(s.type)),
    ...(scene.animals.dog ? [animalItem('dog')] : []),
    ...(scene.animals.goat ? [animalItem('goat')] : []),
    ...(scene.animals.cat ? [animalItem('cat')] : []),
    ...(scene.animals.geeseN > 0 ? [animalItem('geese')] : []),
  ];

  const safeAbsentStalls = scene.absentStalls.filter((type) => {
    const twin = stallTwin(type);
    return twin === null || !presentTypes.includes(twin);
  });
  const absentItems: AgoraItem[] = [
    ...safeAbsentStalls.map(stallItem),
    ...(!scene.animals.dog ? [animalItem('dog')] : []),
    ...(!scene.animals.goat ? [animalItem('goat')] : []),
    ...(!scene.animals.cat ? [animalItem('cat')] : []),
    ...(scene.animals.geeseN === 0 ? [animalItem('geese')] : []),
  ];

  if (absentItems.length >= 3) {
    const distractors = shuffle(rng, absentItems).slice(0, 3);
    const correct = presentItems[randInt(rng, 0, presentItems.length - 1)];
    return buildMcQuestion(rng, 'existence', 'Ποιο από αυτά ΥΠΗΡΧΕ στην αγορά;', correct, distractors);
  }
  // Fallback phrasing - the safe absent pool never runs dry entirely (at
  // most one of the two absent stalls is twin-guarded away, and the other
  // absent stall or an absent animal always remains), so this branch is
  // always resolvable with at least 1 candidate.
  const distractors = shuffle(rng, presentItems).slice(0, 3);
  const correct = absentItems[randInt(rng, 0, absentItems.length - 1)];
  return buildMcQuestion(rng, 'existence', 'Ποιο από αυτά ΔΕΝ υπήρχε στην αγορά;', correct, distractors);
}

function buildColourQuestion(rng: () => number, scene: AgoraScene): { question: AgoraQuestion; stallType: AgoraStallType } {
  const stall = scene.stalls[randInt(rng, 0, scene.stalls.length - 1)];
  const distractorColours = shuffle(
    rng,
    AGORA_COLOURS.filter((c) => c.id !== stall.colour),
  ).slice(0, 3);
  const options = shuffle(rng, [stall.colour, ...distractorColours.map((c) => c.id)]);
  const correctIndex = options.findIndex((id) => id === stall.colour);
  return {
    question: {
      kind: 'colour',
      textGr: `Τι χρώμα είχε η τέντα στον πάγκο με ${AGORA_STALL_LABEL_ACC_GR[stall.type]};`,
      options: options.map(colourNameGr) as [string, string, string, string],
      correctIndex,
    },
    stallType: stall.type,
  };
}

// The count question's option set is a fixed contiguous window covering
// every value the truth could actually take, so "contains the truth" is
// true by construction rather than needing a per-call window computation.
const STALL_COUNT_RANGE: readonly number[] = [AGORA_GOODS_MIN, AGORA_GOODS_MIN + 1, AGORA_GOODS_MIN + 2, AGORA_GOODS_MAX];
const GEESE_COUNT_RANGE: readonly number[] = [AGORA_GEESE_MIN, AGORA_GEESE_MIN + 1, AGORA_GEESE_MIN + 2, AGORA_GEESE_MIN + 3];

function buildCountOptionsQuestion(rng: () => number, textGr: string, truth: number, range: readonly number[]): AgoraQuestion {
  const options = shuffle(rng, range);
  const correctIndex = options.indexOf(truth);
  return { kind: 'count', textGr, options: options.map(String) as [string, string, string, string], correctIndex };
}

function buildCountQuestion(rng: () => number, scene: AgoraScene, excludeStallType: AgoraStallType): AgoraQuestion {
  const geeseEligible = scene.animals.geeseN > 0;
  if (geeseEligible && rng() < AGORA_COUNT_GEESE_P) {
    return buildCountOptionsQuestion(rng, 'Πόσες χήνες τριγύριζαν στην αγορά;', scene.animals.geeseN, GEESE_COUNT_RANGE);
  }
  const eligibleStalls = scene.stalls.filter((s) => s.type !== excludeStallType);
  const stall = eligibleStalls[randInt(rng, 0, eligibleStalls.length - 1)];
  return buildCountOptionsQuestion(rng, AGORA_STALL_COUNT_TEXT_GR[stall.type], stall.count, STALL_COUNT_RANGE);
}

// Difficulty ladder is fixed: Q1 existence, Q2 awning colour, Q3 count. The
// question builder runs its OWN mulberry32(seed) stream, independent of
// generateAgora's - see the file header.
export function buildAgoraQuestions(scene: AgoraScene, seed: number): [AgoraQuestion, AgoraQuestion, AgoraQuestion] {
  const rng = mulberry32(seed);
  const existence = buildExistenceQuestion(rng, scene);
  const colour = buildColourQuestion(rng, scene);
  const count = buildCountQuestion(rng, scene, colour.stallType);
  return [existence, colour.question, count];
}
