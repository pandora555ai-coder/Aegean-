import {
  type GameOverPayload,
  type GameOverStanding,
  type RevealHostPayload,
  type RevealPlayerPayload,
  type ScoreboardPayload,
  type ScoreboardStanding,
} from '@game/shared';
import type { Room } from './state.js';
import { remainingActiveTimerMs } from './timers.js';

// Tied scores share the same rank (1,1,3 - not 1,2,3): the "competition
// ranking" convention, where a rank equals 1 + the number of players
// strictly ahead of it.
function computeCompetitionRanks<T>(
  items: T[],
  getScore: (item: T) => number,
  getId: (item: T) => string,
): Map<string, number> {
  const sorted = [...items].sort((a, b) => getScore(b) - getScore(a));
  const ranks = new Map<string, number>();
  let previousScore: number | null = null;
  let previousRank = 0;
  sorted.forEach((item, index) => {
    const score = getScore(item);
    const rank = score === previousScore ? previousRank : index + 1;
    ranks.set(getId(item), rank);
    previousScore = score;
    previousRank = rank;
  });
  return ranks;
}

// Reads room.lastReveal (set once, at the moment REVEAL begins) rather than
// recomputing anything, so these can be reused identically for the fresh
// broadcast and for a later state:sync catch-up. `paused`/`pausedByName`
// and the autoAdvanceMs figure always read the room's CURRENT live state -
// at the instant of a fresh broadcast that's always "not paused" (nothing
// can pause a phase before it exists), and on a state:sync catch-up it's
// whatever's actually true right now, both correct from one code path.
export function buildRevealHostPayload(room: Room): RevealHostPayload | null {
  if (!room.lastReveal) {
    return null;
  }
  return {
    correctIndex: room.lastReveal.correctIndex,
    correctOption: room.lastReveal.correctOption,
    results: room.lastReveal.results,
    answerCounts: room.lastReveal.answerCounts,
    autoAdvanceMs: remainingActiveTimerMs(room),
    paused: room.paused,
    pausedByName: room.pausedByName,
    gmLine: room.lastReveal.gmLine,
  };
}

export function buildRevealPlayerPayload(room: Room, playerId: string): RevealPlayerPayload | null {
  if (!room.lastReveal) {
    return null;
  }
  const autoAdvanceMs = remainingActiveTimerMs(room);
  const myResult = room.lastReveal.results.find((result) => result.playerId === playerId);

  if (myResult) {
    const ranks = computeCompetitionRanks(
      room.lastReveal.results,
      (result) => result.totalScore,
      (result) => result.playerId,
    );
    return {
      correctIndex: room.lastReveal.correctIndex,
      correctOption: room.lastReveal.correctOption,
      yourChoice: myResult.choice,
      yourCorrect: myResult.correct,
      pointsAwarded: myResult.pointsAwarded,
      totalScore: myResult.totalScore,
      rank: ranks.get(playerId) ?? room.lastReveal.results.length,
      autoAdvanceMs,
      paused: room.paused,
      pausedByName: room.pausedByName,
      yourTimeMs: myResult.timeMs,
      yourAnswerRank: myResult.answerRank,
    };
  }

  // Wasn't connected when this question ended (e.g. reconnecting now, mid
  // REVEAL, after having been offline for the whole question) - a neutral
  // view: no points this round, but their real total/rank among everyone.
  const player = room.players.get(playerId);
  if (!player) {
    return null;
  }
  const ranks = computeCompetitionRanks(
    [...room.players.values()],
    (p) => p.score,
    (p) => p.playerId,
  );
  return {
    correctIndex: room.lastReveal.correctIndex,
    correctOption: room.lastReveal.correctOption,
    yourChoice: null,
    yourCorrect: false,
    pointsAwarded: 0,
    totalScore: player.score,
    rank: ranks.get(playerId) ?? room.players.size,
    autoAdvanceMs,
    paused: room.paused,
    pausedByName: room.pausedByName,
    yourTimeMs: null,
    yourAnswerRank: null,
  };
}

export function buildScoreboard(room: Room): ScoreboardPayload {
  const players = [...room.players.values()];
  const ranks = computeCompetitionRanks(
    players,
    (player) => player.score,
    (player) => player.playerId,
  );

  const standings: ScoreboardStanding[] = [...players]
    .sort((a, b) => b.score - a.score)
    .map((player) => ({
      playerId: player.playerId,
      name: player.name,
      avatarId: player.avatarId,
      score: player.score,
      rank: ranks.get(player.playerId) ?? players.length,
      connected: player.connected,
    }));

  return {
    standings,
    questionIndex: room.currentQuestionIndex,
    totalQuestions: room.questions.length,
    isLastQuestion: room.currentQuestionIndex >= room.questions.length - 1,
    autoAdvanceMs: remainingActiveTimerMs(room),
    paused: room.paused,
    pausedByName: room.pausedByName,
  };
}

export function buildGameOver(room: Room): GameOverPayload {
  const players = [...room.players.values()];
  const ranks = computeCompetitionRanks(
    players,
    (player) => player.score,
    (player) => player.playerId,
  );

  const standings: GameOverStanding[] = [...players]
    .sort((a, b) => b.score - a.score)
    .map((player) => ({
      playerId: player.playerId,
      name: player.name,
      avatarId: player.avatarId,
      score: player.score,
      rank: ranks.get(player.playerId) ?? players.length,
    }));

  const winners = standings.filter((standing) => standing.rank === 1);

  return {
    standings,
    winnerName: winners.map((winner) => winner.name).join(' & '),
    isTie: winners.length > 1,
    totalQuestions: room.questions.length,
  };
}
