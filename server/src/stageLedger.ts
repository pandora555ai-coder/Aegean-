// Task 293 - the cumulative per-stage, per-player ledger.
//
// DATA ONLY. Nothing here decides anything, speaks, or changes a phase: every
// function below is an accumulator called from a scoring site that had already
// computed the numbers, plus one selector and one dev-only dump. v1 Socrates
// (the per-reveal picker) never reads it; it exists so the v2 speech-policy
// slot engine (tasks/291 §2) has a per-stage record to pick a TARGET from.
//
// Scope: exactly ONE stage at a time. `resetStageLedger` is called at the
// stage boundary (phases.ts's recordStageStart), so whatever is in here always
// belongs to the stage the room is currently in - that is what makes "never
// target the same player twice per stage" answerable, and it is why the
// selector below takes the ledger rather than a stage number: there is only
// ever one stage's worth of data alive.
//
// PURE: no Room, no io, no timers, no imports back into socrates.ts (the round
// input below is structurally identical to SocratesPlayerRoundInput, so the
// quiz/agora call sites pass theirs straight in without this module and that
// one importing each other).
import type { StageSegment } from '@game/shared';

// The quiz/agora per-question shape - structurally SocratesPlayerRoundInput
// (socrates.ts), deliberately redeclared rather than imported so the
// dependency graph stays one-way.
export interface LedgerRoundInput {
  playerId: string;
  name: string;
  answered: boolean;
  correct: boolean;
  answerRank: number | null;
  scoreBefore: number;
  scoreAfter: number;
}

export interface LedgerBlitzRound {
  round: number; // 1-based, across the stage's BLITZ_ROUND_COUNT windows
  correct: number;
  wrong: number;
  unanswered: number;
  points: number;
}

// One entry per round this player DREW in - the per-DRAWER guess outcome the
// slots need, which `drawerPointsByPlayer` (modes/draw.ts) could not answer
// because it is points only.
export interface LedgerDrawRound {
  correctGuessers: number;
  eligibleGuessers: number;
  drawerPoints: number;
}

export interface LedgerNumericMiss {
  questionIndex: number; // 0-based within the segment
  distance: number | null; // null = never submitted
  exact: boolean;
}

export interface StageLedgerEntry {
  playerId: string;
  name: string;
  // Across every segment kind in the stage: a blitz swipe, a quiz answer, a
  // draw guess and a numeric exact hit all fold in here, so the selector can
  // compare players inside a stage without asking what mechanic ran.
  correct: number;
  wrong: number;
  noAnswer: number;
  // The stage's true score delta: every recorder adds the points its own
  // scoring site awarded, and a steal moves points between two entries, so
  // this stays "what this stage did to this player's score".
  points: number;
  fastestCount: number; // answerRank === 1 on a quiz/agora question
  // The quiz-stage per-half split, for the Q-mid / Q-end slots. Filled only
  // by the quiz/agora recorder, which is the only one with an ordered
  // question index inside the stage.
  firstHalf: { correct: number; wrong: number };
  secondHalf: { correct: number; wrong: number };
  blitzRounds: LedgerBlitzRound[];
  drawRounds: LedgerDrawRound[];
  numericMisses: LedgerNumericMiss[];
  stealTaken: number; // points this player took off someone else
  stealGiven: number; // points taken off this player
}

export interface StageLedger {
  stage: number; // 0 = nothing recorded yet (before the first stage card)
  title: string;
  segment: StageSegment | null;
  // How many quiz/agora questions this stage has resolved so far - doubles as
  // the 0-based index of the NEXT one, which is what the half split needs and
  // what no caller has to pass in.
  quizQuestionsSeen: number;
  entries: Map<string, StageLedgerEntry>;
}

export function createStageLedger(): StageLedger {
  return { stage: 0, title: '', segment: null, quizQuestionsSeen: 0, entries: new Map() };
}

// Mutates in place rather than returning a fresh object: SocratesState holds
// ONE ledger reference for the room's whole life, exactly as it holds one
// `players` Map, so nothing can end up writing into a detached copy.
export function resetStageLedger(
  ledger: StageLedger,
  stage: number,
  title: string,
  segment: StageSegment | null,
): void {
  ledger.stage = stage;
  ledger.title = title;
  ledger.segment = segment;
  ledger.quizQuestionsSeen = 0;
  ledger.entries.clear();
}

function entryFor(ledger: StageLedger, playerId: string, name: string): StageLedgerEntry {
  const existing = ledger.entries.get(playerId);
  if (existing) {
    // A player's display name can change between stages (reconnect with a
    // different preset); the latest one wins, since a line names them NOW.
    existing.name = name;
    return existing;
  }
  const fresh: StageLedgerEntry = {
    playerId,
    name,
    correct: 0,
    wrong: 0,
    noAnswer: 0,
    points: 0,
    fastestCount: 0,
    firstHalf: { correct: 0, wrong: 0 },
    secondHalf: { correct: 0, wrong: 0 },
    blitzRounds: [],
    drawRounds: [],
    numericMisses: [],
    stealTaken: 0,
    stealGiven: 0,
  };
  ledger.entries.set(playerId, fresh);
  return fresh;
}

// ------------------------------ the recorders ------------------------------
// Each is called from the site that just finished scoring, with the numbers
// that site already had in hand. None of them re-derive anything.

// The quiz's endQuestion and agora's endAgoraQuestion, both of which build the
// same per-player round input. `questionCountInStage` is the stage table's own
// questionCount (0 for agora, whose count comes from its question tuple) and
// decides which half this question lands in.
export function recordLedgerQuizRound(
  ledger: StageLedger,
  inputs: readonly LedgerRoundInput[],
  questionCountInStage: number,
): void {
  const index = ledger.quizQuestionsSeen;
  ledger.quizQuestionsSeen += 1;
  // Strictly-before-the-midpoint is the first half, so an odd count puts the
  // middle question in the FIRST half (3 questions -> 2 + 1, 5 -> 3 + 2).
  const inFirstHalf = questionCountInStage > 0 ? index * 2 < questionCountInStage : false;
  for (const input of inputs) {
    const entry = entryFor(ledger, input.playerId, input.name);
    entry.points += input.scoreAfter - input.scoreBefore;
    if (!input.answered) {
      entry.noAnswer += 1;
    } else if (input.correct) {
      entry.correct += 1;
    } else {
      entry.wrong += 1;
    }
    if (input.answerRank === 1) {
      entry.fastestCount += 1;
    }
    const half = inFirstHalf ? entry.firstHalf : entry.secondHalf;
    if (input.answered && input.correct) {
      half.correct += 1;
    } else if (input.answered) {
      half.wrong += 1;
    }
  }
}

export interface LedgerBlitzResult {
  playerId: string;
  name: string;
  correct: number;
  wrong: number;
  unanswered: number;
  pointsAwarded: number;
}

// modes/blitz.ts's endBlitz, called with the results it just scored - BEFORE
// startNextBlitzRound nulls `state.lastReveal`, which is why the stage's two
// windows can be compared at all.
export function recordLedgerBlitzRound(
  ledger: StageLedger,
  round: number,
  results: readonly LedgerBlitzResult[],
): void {
  for (const result of results) {
    const entry = entryFor(ledger, result.playerId, result.name);
    entry.correct += result.correct;
    entry.wrong += result.wrong;
    entry.noAnswer += result.unanswered;
    entry.points += result.pointsAwarded;
    entry.blitzRounds.push({
      round,
      correct: result.correct,
      wrong: result.wrong,
      unanswered: result.unanswered,
      points: result.pointsAwarded,
    });
  }
}

export interface LedgerDrawRoundInput {
  drawerPlayerId: string;
  drawerName: string;
  drawerPoints: number;
  correctGuessers: number;
  eligibleGuessers: number;
  guessers: readonly { playerId: string; name: string; correct: boolean; choice: number | null; pointsAwarded: number }[];
}

// modes/draw.ts's endGuessReveal. The drawer gets the round's guess outcome
// (what DrawGuessRoundContext could not carry), every guesser gets their own
// correct/wrong - so the stage can name a person, not just a count.
export function recordLedgerDrawRound(ledger: StageLedger, input: LedgerDrawRoundInput): void {
  const drawer = entryFor(ledger, input.drawerPlayerId, input.drawerName);
  drawer.points += input.drawerPoints;
  drawer.drawRounds.push({
    correctGuessers: input.correctGuessers,
    eligibleGuessers: input.eligibleGuessers,
    drawerPoints: input.drawerPoints,
  });
  for (const guesser of input.guessers) {
    const entry = entryFor(ledger, guesser.playerId, guesser.name);
    entry.points += guesser.pointsAwarded;
    if (guesser.choice === null) {
      entry.noAnswer += 1;
    } else if (guesser.correct) {
      entry.correct += 1;
    } else {
      entry.wrong += 1;
    }
  }
}

export interface LedgerNumericResult {
  playerId: string;
  name: string;
  value: number | null;
  distance: number | null;
  exact: boolean;
  pointsAwarded: number;
}

// modes/numeric.ts's endNumericQuestion. The playerId RESCUE: NumericRoundContext
// (socrates.ts) is `{ answer, values }` with no id at all, so a numeric moment
// structurally cannot name anyone - the ids exist one frame earlier, in the
// results array this is handed, and are simply never passed on. Here they are.
export function recordLedgerNumericRound(
  ledger: StageLedger,
  questionIndex: number,
  results: readonly LedgerNumericResult[],
): void {
  for (const result of results) {
    const entry = entryFor(ledger, result.playerId, result.name);
    entry.points += result.pointsAwarded;
    if (result.value === null) {
      entry.noAnswer += 1;
    } else if (result.exact) {
      entry.correct += 1;
    } else {
      entry.wrong += 1;
    }
    entry.numericMisses.push({
      questionIndex,
      distance: result.value === null ? null : result.distance,
      exact: result.exact,
    });
  }
}

export interface LedgerStealInput {
  thiefPlayerId: string;
  thiefName: string;
  victimPlayerId: string | null;
  victimName: string | null;
  stolenAmount: number;
}

// phases.ts's resolveSteal. Nothing accumulated steals before this: room.steal
// is nulled at advanceFromSteal and StealResolvedPayload is fire-and-forget.
// Recorded on BOTH sides so `points` stays a true per-stage score delta.
export function recordLedgerSteal(ledger: StageLedger, input: LedgerStealInput): void {
  if (input.stolenAmount <= 0) {
    return;
  }
  const thief = entryFor(ledger, input.thiefPlayerId, input.thiefName);
  thief.stealTaken += input.stolenAmount;
  thief.points += input.stolenAmount;
  if (input.victimPlayerId !== null) {
    const victim = entryFor(ledger, input.victimPlayerId, input.victimName ?? '');
    victim.stealGiven += input.stolenAmount;
    victim.points -= input.stolenAmount;
  }
}

// ------------------------------- the selector -------------------------------

export interface StageExtreme {
  playerId: string;
  name: string;
  points: number;
  correct: number;
  wrong: number;
  noAnswer: number;
}

export interface StageExtremes {
  stage: number;
  title: string;
  segment: StageSegment | null;
  best: StageExtreme | null;
  worst: StageExtreme | null;
}

function toExtreme(entry: StageLedgerEntry): StageExtreme {
  return {
    playerId: entry.playerId,
    name: entry.name,
    points: entry.points,
    correct: entry.correct,
    wrong: entry.wrong,
    noAnswer: entry.noAnswer,
  };
}

// The one selector the v2 slots read. Ranked on the stage's SCORE DELTA, which
// is the only measure every segment kind produces - a blitz window, a quiz
// answer, a drawing and a steal all move it, so one stage's players are always
// comparable to each other (never across stages: the scales differ).
//
// TIES LEAVE NULL, deliberately: a slot that cannot name one person falls back
// rather than picking arbitrarily. A single-player stage is a tie with itself
// for the OTHER end and returns best only.
export function stageExtremes(ledger: StageLedger): StageExtremes {
  const entries = [...ledger.entries.values()];
  const head: Pick<StageExtremes, 'stage' | 'title' | 'segment'> = {
    stage: ledger.stage,
    title: ledger.title,
    segment: ledger.segment,
  };
  if (entries.length === 0) {
    return { ...head, best: null, worst: null };
  }
  const maxPoints = Math.max(...entries.map((entry) => entry.points));
  const minPoints = Math.min(...entries.map((entry) => entry.points));
  const bests = entries.filter((entry) => entry.points === maxPoints);
  const worsts = entries.filter((entry) => entry.points === minPoints);
  return {
    ...head,
    best: bests.length === 1 ? toExtreme(bests[0]) : null,
    // maxPoints === minPoints means every player is tied on the stage (which
    // includes the one-player case) - there is no "worst" to name.
    worst: worsts.length === 1 && maxPoints !== minPoints ? toExtreme(worsts[0]) : null,
  };
}

// --------------------------------- the dump ---------------------------------

const isProduction = process.env.NODE_ENV === 'production';

function formatEntry(entry: StageLedgerEntry): string {
  const parts = [
    `${entry.name}`,
    `pts=${entry.points >= 0 ? '+' : ''}${entry.points}`,
    `c/w/-=${entry.correct}/${entry.wrong}/${entry.noAnswer}`,
  ];
  if (entry.fastestCount > 0) parts.push(`fastest=${entry.fastestCount}`);
  const half = entry.firstHalf;
  const second = entry.secondHalf;
  if (half.correct + half.wrong + second.correct + second.wrong > 0) {
    parts.push(`halves=${half.correct}/${half.wrong}|${second.correct}/${second.wrong}`);
  }
  for (const round of entry.blitzRounds) {
    parts.push(`r${round.round}=${round.correct}/${round.wrong}/${round.unanswered}(${round.points})`);
  }
  for (const round of entry.drawRounds) {
    parts.push(`drew=${round.correctGuessers}/${round.eligibleGuessers}(${round.drawerPoints})`);
  }
  if (entry.numericMisses.length > 0) {
    parts.push(`dist=[${entry.numericMisses.map((miss) => (miss.distance === null ? '-' : miss.distance)).join(',')}]`);
  }
  if (entry.stealTaken > 0) parts.push(`stole=${entry.stealTaken}`);
  if (entry.stealGiven > 0) parts.push(`robbed=${entry.stealGiven}`);
  return parts.join(' ');
}

// Dev-only, and only for a `?bot=N` room (the harness case this was built to be
// read in) - same NODE_ENV idiom as logMomentFireSummary (socrates.ts) and
// FORCE_QUESTION_ID (questions.ts). Called at every stage CLOSE: the boundary
// in recordStageStart, plus finishGame for the last stage, which has no next
// stage to close it - exactly the two sites Task 239's stageTimings uses.
export function dumpStageLedger(ledger: StageLedger, roomCode: string, botRoom: boolean): void {
  if (isProduction || !botRoom || ledger.stage === 0) {
    return;
  }
  const extremes = stageExtremes(ledger);
  console.log(
    `[ledger] room ${roomCode} stage ${ledger.stage} "${ledger.title}" (${ledger.segment ?? 'quiz'}) closed — ` +
      `${ledger.entries.size} players, ${ledger.quizQuestionsSeen} quiz questions`,
  );
  for (const entry of ledger.entries.values()) {
    console.log(`[ledger]   ${formatEntry(entry)}`);
  }
  console.log(
    `[ledger]   best=${extremes.best ? `${extremes.best.name} (${extremes.best.points})` : 'null (tie)'} ` +
      `worst=${extremes.worst ? `${extremes.worst.name} (${extremes.worst.points})` : 'null (tie)'}`,
  );
}
