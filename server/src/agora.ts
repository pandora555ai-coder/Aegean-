// Task 207 - Η Μνήμη της Αγοράς: the server-side PURE helpers around Task
// 206's shared/src/agora.ts (which is not modified - it stays the untouched,
// import-free generator). Same discipline as numeric.ts: no Room, no io, no
// timers, mode-agnostic - the phase shell is server/src/modes/agora.ts.
import {
  AGORA_COLOURS,
  AGORA_STALL_LABEL_GR,
  AGORA_STALL_TYPES,
  type AgoraProof,
  type AgoraQuestion,
  type AgoraRenderSpec,
  type AgoraScene,
  type AgoraStallType,
  type AgoraSubject,
} from '@game/shared';

// A fresh 32-bit seed off the server's own RNG - one per round, never from a
// client. Logged by the shell at expose time so a scene can be regenerated
// (generateAgora(seed) + buildAgoraQuestions(scene, seed)) for reproduction.
export function drawAgoraSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

// What the TV needs to draw the market - the scene MINUS absentStalls (the
// answer to a "ΔΕΝ υπήρχε" existence question, so it never travels).
export function toAgoraRenderSpec(scene: AgoraScene): AgoraRenderSpec {
  return {
    stalls: scene.stalls.map((stall) => ({ ...stall })),
    animals: { ...scene.animals },
  };
}

// agora.ts's own ANIMAL_LABEL_GR / AGORA_STALL_COUNT_TEXT_GR are private to
// it and this task may not modify that file, so the reverse lookups below
// are keyed off strings it DOES export (AGORA_STALL_LABEL_GR, whose
// "Πάγκος με ___" tail is also the accusative the colour question uses) plus
// two small mirrors of its private tables. The harness
// (dev/agora-wire-check.ts --subjects) cross-checks the resolution against
// the scene's truth over thousands of seeds, so a drift in agora.ts's
// wording shows up there rather than as a silent wrong highlight.
const ANIMAL_BY_LABEL_GR: Readonly<Record<string, 'dog' | 'goat' | 'cat' | 'geese' | undefined>> = {
  Σκύλος: 'dog',
  Κατσίκα: 'goat',
  Γάτα: 'cat',
  Χήνες: 'geese',
};

// The noun each count question names its goods by (mirrors
// AGORA_STALL_COUNT_TEXT_GR's per-type sentences).
const COUNT_NOUN_GR: Readonly<Record<AgoraStallType, string>> = {
  amphorae: 'αμφορείς',
  fish: 'ψάρια',
  cloth: 'ύφασμα',
  pottery: 'πιθάρια',
  fruit: 'καλάθια',
};

const STALL_LABEL_PREFIX_GR = 'Πάγκος με ';

function stallAccusativeGr(type: AgoraStallType): string {
  return AGORA_STALL_LABEL_GR[type].slice(STALL_LABEL_PREFIX_GR.length);
}

function stallPresent(scene: AgoraScene, type: AgoraStallType): boolean {
  return scene.stalls.some((stall) => stall.type === type);
}

function animalPresent(scene: AgoraScene, animal: 'dog' | 'goat' | 'cat' | 'geese'): boolean {
  return animal === 'geese' ? scene.animals.geeseN > 0 : scene.animals[animal];
}

// The subject a question is about, for the reveal's proof. Returns null
// only if agora.ts's wording drifted away from the mirrors above - the
// shell logs that loudly and falls back to the first stall rather than
// crashing the phase.
export function resolveAgoraSubject(scene: AgoraScene, question: AgoraQuestion): AgoraSubject | null {
  switch (question.kind) {
    case 'existence': {
      const label = question.options[question.correctIndex];
      const stallType = AGORA_STALL_TYPES.find((type) => AGORA_STALL_LABEL_GR[type] === label);
      if (stallType) {
        return { kind: 'stall', type: stallType, present: stallPresent(scene, stallType) };
      }
      const animal = ANIMAL_BY_LABEL_GR[label];
      if (animal) {
        return { kind: 'animal', animal, present: animalPresent(scene, animal) };
      }
      return null;
    }
    case 'colour': {
      const stall = scene.stalls.find((s) => question.textGr.includes(stallAccusativeGr(s.type)));
      return stall ? { kind: 'stall', type: stall.type, present: true } : null;
    }
    case 'count': {
      if (question.textGr.includes('χήνες')) {
        return { kind: 'animal', animal: 'geese', present: true };
      }
      const stall = scene.stalls.find((s) => question.textGr.includes(COUNT_NOUN_GR[s.type]));
      return stall ? { kind: 'stall', type: stall.type, present: true } : null;
    }
  }
}

export function buildAgoraProof(scene: AgoraScene, question: AgoraQuestion): AgoraProof {
  let subject = resolveAgoraSubject(scene, question);
  if (!subject) {
    console.warn(`agora: could not resolve the subject of "${question.textGr}" - falling back to the first stall`);
    subject = { kind: 'stall', type: scene.stalls[0].type, present: true };
  }
  return { spec: toAgoraRenderSpec(scene), subject };
}

// Harness-only cross-check: does the resolved subject actually agree with
// the scene's truth for this question? (colour: that stall's awning IS the
// correct option; count: that stall's/the geese's count IS the correct
// option; existence: `present` matches the phrasing.) Pure, so the wire
// harness can run it over thousands of seeds without a Room.
export function agoraSubjectAgreesWithTruth(scene: AgoraScene, question: AgoraQuestion): boolean {
  const subject = resolveAgoraSubject(scene, question);
  if (!subject) {
    return false;
  }
  const correct = question.options[question.correctIndex];
  switch (question.kind) {
    case 'existence':
      return subject.present === question.textGr.includes('ΥΠΗΡΧΕ');
    case 'colour': {
      if (subject.kind !== 'stall') return false;
      const stall = scene.stalls.find((s) => s.type === subject.type);
      return !!stall && AGORA_COLOURS.find((c) => c.id === stall.colour)?.nameGr === correct;
    }
    case 'count': {
      if (subject.kind === 'animal') {
        return subject.animal === 'geese' && scene.animals.geeseN === Number(correct);
      }
      const stall = scene.stalls.find((s) => s.type === subject.type);
      return !!stall && stall.count === Number(correct);
    }
  }
}
