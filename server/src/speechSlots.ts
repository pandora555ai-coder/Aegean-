// Task 294 - the v2 speech policy's SLOT ENGINE: which fixed moments of a
// stage Socrates speaks at, and who each of those lines is about.
//
// v1 (the per-reveal picker, socrates.ts's recordRoundAndPickLine) is
// untouched and still the default. Everything here runs only when
// room.settings.speechPolicy === 'v2' (Task 292's setting), and the four v1
// per-reveal sites are gated off in that same mode - so a v2 show speaks at
// STRUCTURAL moments (a stage's midpoint and its close, the first theft,
// between two blitz windows) rather than after every single reveal.
//
// DECISION LAYER ONLY: no io, no timers, no phase changes. It answers "is
// there a line for this slot, and about whom" and nothing else; the caller
// (phases.ts's startSpeechSlotBeat) is what actually enters the beat. That is
// the same split crowd.ts keeps between deciding a mood and playing one.
//
// TWO RULES the whole engine hangs off:
//   1. A slot is always ABOUT ONE PLAYER, chosen from the stage ledger's own
//      extremes (Task 293's stageExtremes - score delta, ties leave null).
//   2. NEVER the same player twice in one stage. The no-repeat set lives on
//      the LEDGER, which is cleared at the stage boundary (phases.ts's
//      recordStageStart), so it resets for free and can never leak into the
//      next stage or the next game.
// When neither rule can be satisfied - a tie at both ends, or the only
// candidate has already been spoken about - the slot SKIPS and the room is
// SILENT. It never falls back to GENERIC_TRANSITION: a generic line is
// exactly the filler v2 exists to remove.
import type { Room } from './state.js';
import { LINES, SPEECH_V2_LINES, pickSpeechLine, type Moment, type PickedLine, type SpeechSlotPool } from './socrates.js';
import { stageExtremes, type StageExtreme, type StageLedger } from './stageLedger.js';

// THE gate. Read off room.settings, which is LOBBY-only (index.ts's
// VIP_UPDATE_SETTINGS), so the policy is frozen for the whole game the instant
// it starts - which is why no site that reads this needs a mid-game-change
// guard.
export function speechV2(room: Room): boolean {
  return room.settings.speechPolicy === 'v2';
}

// The fixed slots of the show. Named for WHERE they sit, not for what they
// say: a stage's midpoint, its close, and the two one-offs Η Συκοφαντία adds.
export type SpeechSlotId =
  | 'QUIZ_MID' // after the reveal that completes a quiz stage's first half
  | 'QUIZ_CLOSE' // after that stage's last reveal, before the next card
  | 'SYKO_FIRST_STEAL' // the first theft of Η Συκοφαντία, once per stage
  | 'SYKO_CLOSE'
  | 'BLITZ_MID' // between Η Παλαίστρα's two swipe windows
  | 'BLITZ_CLOSE'
  | 'DRAW_MID' // between Ζωγραφική's cycles
  | 'NUMERIC_CLOSE' // Εκτίμηση's last reveal
  | 'LETHE_CLOSE'; // Η Λήθη's last reveal

// Where a slot's words come from. 'slot' is one of Task 294's twelve new
// pools (content/speech-policy-lines.md); 'reservoir' is an EXISTING v1 pool
// reused verbatim - the script's own "speak from the reservoir where lines
// exist". A reservoir pool is shared with v1's usedLines bookkeeping, so it
// can genuinely run dry mid-show, and that is a silent slot rather than a
// repeat.
type PoolRef = { kind: 'slot'; pool: SpeechSlotPool } | { kind: 'reservoir'; moment: Moment };

const slot = (pool: SpeechSlotPool): PoolRef => ({ kind: 'slot', pool });
const reservoir = (moment: Moment): PoolRef => ({ kind: 'reservoir', moment });

// Each slot names a pool for EACH END of the stage and which end it would
// rather speak about. `prefer` is what produces the ALTERNATION the brief
// asks for: a stage's mid slot and its close slot prefer opposite ends, so
// the two beats of one stage are about two different people by construction,
// with the no-repeat set below as the hard guarantee rather than the
// mechanism. A null pool means that end has nothing written for it yet, so
// the slot simply cannot speak about it.
interface SlotSpec {
  prefer: 'best' | 'worst';
  best: PoolRef | null;
  worst: PoolRef | null;
}

const SLOT_SPECS: Record<Exclude<SpeechSlotId, 'SYKO_FIRST_STEAL' | 'SYKO_CLOSE'>, SlotSpec> = {
  // Η Αγορά's midpoint is written for the player having the WORST of it -
  // AGORA_WORST is the one new quiz pool, and it reads as an aside to
  // someone still in the stage ("you have questions left to make it regret
  // that"). The close then goes to the other end, out of the reservoir.
  QUIZ_MID: { prefer: 'worst', best: null, worst: slot('AGORA_WORST') },
  QUIZ_CLOSE: { prefer: 'best', best: reservoir('RUNAWAY_LEAD'), worst: reservoir('STUCK_IN_LAST') },
  BLITZ_MID: { prefer: 'best', best: slot('PALAISTRA_MID_BEST'), worst: slot('PALAISTRA_MID_WORST') },
  BLITZ_CLOSE: { prefer: 'worst', best: slot('PALAISTRA_CLOSE_BEST'), worst: slot('PALAISTRA_CLOSE_WORST') },
  DRAW_MID: { prefer: 'best', best: reservoir('RUNAWAY_LEAD'), worst: reservoir('STUCK_IN_LAST') },
  NUMERIC_CLOSE: { prefer: 'worst', best: reservoir('RUNAWAY_LEAD'), worst: reservoir('STUCK_IN_LAST') },
  LETHE_CLOSE: { prefer: 'best', best: slot('LITHI_CLOSE_OBSERVER'), worst: slot('LITHI_CLOSE_BLIND') },
};

// What a slot produced, for the caller to enter as a beat and for the server
// log to state. `pool` is carried purely so a run can be read back: it is the
// difference between "this slot fired" and "this slot fired FROM the pool it
// was supposed to".
export interface SpeechSlotBeat {
  slot: SpeechSlotId;
  picked: PickedLine;
  pool: string;
  targetPlayerId: string;
  targetName: string;
}

function poolLines(ref: PoolRef): readonly string[] {
  return ref.kind === 'slot' ? SPEECH_V2_LINES[ref.pool] : LINES[ref.moment];
}

function poolName(ref: PoolRef): string {
  return ref.kind === 'slot' ? ref.pool : `${ref.moment} (reservoir)`;
}

// The candidates for a slot, in the order it would rather speak about them,
// already filtered by the no-repeat rule. A tie at either end is `null` from
// stageExtremes and simply isn't a candidate - which is what makes "no
// standout, no line" the default rather than a special case.
function candidatesFor(
  ledger: StageLedger,
  spec: SlotSpec,
): { extreme: StageExtreme; ref: PoolRef }[] {
  const extremes = stageExtremes(ledger);
  const ends: { extreme: StageExtreme | null; ref: PoolRef | null }[] =
    spec.prefer === 'best'
      ? [
          { extreme: extremes.best, ref: spec.best },
          { extreme: extremes.worst, ref: spec.worst },
        ]
      : [
          { extreme: extremes.worst, ref: spec.worst },
          { extreme: extremes.best, ref: spec.best },
        ];
  return ends.flatMap(({ extreme, ref }) =>
    extreme && ref && !ledger.targetedThisStage.has(extreme.playerId) ? [{ extreme, ref }] : [],
  );
}

// Η Συκοφαντία's two slots read the ledger's STEAL columns rather than its
// extremes: the stage is about theft, so the person worth naming is whoever
// took the most (or, at the close, whoever LOST the most once the thief has
// already been spoken about). Task 293 books every steal on both sides, which
// is what makes both of these answerable at all.
function stealCandidates(ledger: StageLedger, slotId: 'SYKO_FIRST_STEAL' | 'SYKO_CLOSE'): {
  extreme: StageExtreme;
  ref: PoolRef;
}[] {
  const entries = [...ledger.entries.values()];
  const thief = entries.filter((entry) => entry.stealTaken > 0).sort((a, b) => b.stealTaken - a.stealTaken)[0];
  const victim = entries.filter((entry) => entry.stealGiven > 0).sort((a, b) => b.stealGiven - a.stealGiven)[0];
  const asExtreme = (entry: (typeof entries)[number]): StageExtreme => ({
    playerId: entry.playerId,
    name: entry.name,
    points: entry.points,
    correct: entry.correct,
    wrong: entry.wrong,
    noAnswer: entry.noAnswer,
  });
  const ordered =
    slotId === 'SYKO_FIRST_STEAL'
      ? [{ entry: thief, ref: slot('SYKO_FIRST_STEAL') }]
      : [
          { entry: thief, ref: slot('SYKO_CLOSE_THIEF') },
          { entry: victim, ref: slot('SYKO_CLOSE_VICTIM') },
        ];
  return ordered.flatMap(({ entry, ref }) =>
    entry && !ledger.targetedThisStage.has(entry.playerId) ? [{ extreme: asExtreme(entry), ref }] : [],
  );
}

// THE one entry point. Returns the beat to play, or null for a slot that must
// stay silent - and logs which of the two it was, with the reason, because a
// silent slot is otherwise indistinguishable from one that was never reached.
//
// LATCHES ON ATTEMPT, not on success: `firedSlots` is marked whether or not a
// line came out, so "once per stage" is structural. A slot that found nothing
// to say does not get a second try at the next reveal - it is a fixed moment
// of the show, and the moment has passed.
export function pickSpeechSlot(room: Room, slotId: SpeechSlotId): SpeechSlotBeat | null {
  const ledger = room.socrates.ledger;
  if (ledger.firedSlots.has(slotId)) {
    return null;
  }
  ledger.firedSlots.add(slotId);

  const candidates =
    slotId === 'SYKO_FIRST_STEAL' || slotId === 'SYKO_CLOSE'
      ? stealCandidates(ledger, slotId)
      : candidatesFor(ledger, SLOT_SPECS[slotId]);

  for (const { extreme, ref } of candidates) {
    const picked = pickSpeechLine(room.socrates, poolLines(ref));
    if (!picked) {
      // This end had a standout but its pool is spent (a reservoir pool
      // shared with v1, or a slot pool already used this game). Try the other
      // end rather than repeating a line.
      console.log(
        `[slot] room ${room.code} stage ${ledger.stage} ${slotId} — pool ${poolName(ref)} exhausted for ${extreme.name}`,
      );
      continue;
    }
    ledger.targetedThisStage.add(extreme.playerId);
    console.log(
      `[slot] room ${room.code} stage ${ledger.stage} ${slotId} FIRED — target=${extreme.name} ` +
        `(${extreme.points >= 0 ? '+' : ''}${extreme.points}) pool=${poolName(ref)}`,
    );
    return { slot: slotId, picked, pool: poolName(ref), targetPlayerId: extreme.playerId, targetName: extreme.name };
  }

  console.log(
    `[slot] room ${room.code} stage ${ledger.stage} ${slotId} SKIPPED — no untargeted standout with a line ` +
      `(already targeted this stage: ${[...ledger.targetedThisStage].length})`,
  );
  return null;
}

// Whether a quiz stage's MIDPOINT is the reveal that just resolved. The
// ledger counts the stage's own resolved questions (quizQuestionsSeen), so
// this asks nothing of the caller and cannot drift from the half-split the
// ledger itself records. The last question is never the midpoint: its own
// close slot follows immediately, and two beats back to back is the pacing v2
// exists to avoid.
export function isQuizMidpoint(ledger: StageLedger, questionCountInStage: number): boolean {
  if (questionCountInStage < 2) {
    return false;
  }
  const half = Math.ceil(questionCountInStage / 2);
  return ledger.quizQuestionsSeen === half && ledger.quizQuestionsSeen < questionCountInStage;
}
