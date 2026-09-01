import { DRAIN_PER_SEC, WRONG_HIT, type TrialRevealResult } from '@game/shared';
import { sortAndRankResults } from './scoring.js';

// Η Δίκη (Task 127) - the PURE mechanic of the quiz finale: how much life a
// round costs, who is left standing, and what the next round has to be.
// Nothing here touches a Room, a socket or a timer (that is the phase machine
// in phases.ts); everything is arithmetic over plain data, so the whole
// mechanic is checkable without a game running.
//
// The one rule the rest of the file exists to serve:
//   lifeAfter = lifeBefore - round(elapsed_s * DRAIN_PER_SEC) - (wrong ? WRONG_HIT : 0)
// with "no answer at all" being elapsed = the full question timer, AND wrong.

// One player's lock-in as the round hands it over. `elapsedMs` is the
// pause-aware figure the phase machine measured at lock-in time (question
// time minus what the shared timer says is left) - never a Date.now delta,
// which would keep running through a pause.
export interface TrialRoundEntry {
  playerId: string;
  name: string;
  avatarId: string;
  lifeBefore: number;
  choice: number | null; // null = never locked in
  elapsedMs: number | null; // null exactly when choice is null
}

// The drain a given elapsed time costs. Rounded ONCE, here, so no caller can
// disagree with the reveal about what a lock-in cost.
export function trialDrain(elapsedMs: number): number {
  return Math.round((elapsedMs / 1000) * DRAIN_PER_SEC);
}

// Scores one trial round. `suddenDeath` rounds take NO drain and NO hit:
// every participant is already at or below zero by definition, and the round
// is a decider - the winner is answerRank === 1 (earliest correct lock-in),
// which sortAndRankResults computes here the same way the quiz reveal does.
//
// `eliminated` is the ONLY place elimination is decided, and it is reached
// only from a reveal - never mid-question.
export function scoreTrialRound(
  entries: TrialRoundEntry[],
  correctIndex: number,
  questionTimeMs: number,
  suddenDeath: boolean,
): TrialRevealResult[] {
  const results: TrialRevealResult[] = entries.map((entry) => {
    const correct = entry.choice !== null && entry.choice === correctIndex;
    // No lock-in: the full timer's drain, and a wrong answer's hit on top.
    const elapsedMs = entry.elapsedMs ?? questionTimeMs;
    const drain = suddenDeath ? 0 : trialDrain(elapsedMs);
    const hit = suddenDeath || correct ? 0 : WRONG_HIT;
    const lifeAfter = entry.lifeBefore - drain - hit;
    return {
      playerId: entry.playerId,
      name: entry.name,
      avatarId: entry.avatarId,
      choice: entry.choice,
      correct,
      timeMs: entry.elapsedMs,
      answerRank: null, // filled in by sortAndRankResults below
      lifeBefore: entry.lifeBefore,
      drain,
      hit,
      // Deliberately NOT clamped at 0: the reveal's three figures must always
      // add up, and an eliminated player's exact overshoot is the truth of
      // how they went out.
      lifeAfter,
      eliminated: !suddenDeath && lifeAfter <= 0,
    };
  });

  // Correct-by-speed first, then wrong, then non-answerers last - the same
  // order (and the same 1-based answerRank among correct lock-ins) the quiz
  // reveal is read in.
  sortAndRankResults(results);
  return results;
}

// What the phase machine must do next, decided from one scored round.
// Exhaustive by construction: every trial reveal is exactly one of these.
export type TrialNext =
  | { kind: 'WINNER'; winnerPlayerId: string } // one left standing (or a decider won)
  | { kind: 'SUDDEN_DEATH'; playerIds: string[] } // everyone left fell at once
  | { kind: 'CONTINUE'; playerIds: string[] }; // two or more still above zero

// A normal (non-sudden-death) round. `results` must be exactly the round's
// living players, already scored.
export function nextAfterTrialRound(results: TrialRevealResult[]): TrialNext {
  const survivors = results.filter((result) => result.lifeAfter > 0);
  if (survivors.length === 1) {
    return { kind: 'WINNER', winnerPlayerId: survivors[0].playerId };
  }
  if (survivors.length === 0) {
    // Everyone still in the trial crossed zero in the SAME reveal - nobody is
    // eliminated by that alone; they settle it between themselves.
    return { kind: 'SUDDEN_DEATH', playerIds: results.map((result) => result.playerId) };
  }
  return { kind: 'CONTINUE', playerIds: survivors.map((result) => result.playerId) };
}

// A sudden-death round. Earliest correct lock-in wins - answerRank === 1,
// NOT a buzzer. Nobody correct means nothing was settled, so the same
// players go again on a fresh question.
export function nextAfterSuddenDeath(results: TrialRevealResult[]): TrialNext {
  const winner = results.find((result) => result.answerRank === 1);
  if (winner) {
    return { kind: 'WINNER', winnerPlayerId: winner.playerId };
  }
  return { kind: 'SUDDEN_DEATH', playerIds: results.map((result) => result.playerId) };
}
