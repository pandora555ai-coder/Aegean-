import {
  POWER_UP_EFFECTS,
  firstQuestionIndexOfStage,
  stageForQuestionIndex,
  stagesForLength,
  type GameOverPayload,
  type GameOverStanding,
  type PlayerStanding,
  type PowerUpProgressPayload,
  type PowerUpShowHostPayload,
  type PowerUpShowPlayerPayload,
  type PowerUpTarget,
  type RevealHostPayload,
  type RevealPlayerPayload,
  type SocratesShowPayload,
  type StageAnnouncePayload,
  type StealShowHostPayload,
  type StealShowPlayerPayload,
  type StealTarget,
} from '@game/shared';
import { resolveSocratesDurationMs } from './socratesAudio.js';
import { getConnectedPlayers, type Room } from './state.js';
import { remainingActiveTimerMs } from './timers.js';

// The stage card the TV shows during the STAGE_ANNOUNCE beat. Derived
// entirely from room.currentQuestionIndex, so the live emit and a
// mid-announcement state:sync can never disagree.
export function buildStageAnnounce(room: Room): StageAnnouncePayload {
  const definition = stageForQuestionIndex(room.currentQuestionIndex);
  return {
    stage: definition.stage,
    totalStages: stagesForLength(room.settings.gameLength).length,
    title: definition.title,
    tagline: definition.tagline,
    questionCount: definition.questionCount,
    firstQuestionIndex: firstQuestionIndexOfStage(definition.stage),
    totalQuestions: room.questions.length,
  };
}

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

// Every player's current score + rank, in room.players' insertion (join)
// order. The client is what sorts this by score for display (Task 41) -
// keeping it in a fixed join order here is just a stable base for that sort
// to break ties against. Included on every host payload (QUESTION/POWER_UP/
// REVEAL/STEAL), built fresh each time so a live broadcast and a later
// state:sync catch-up always agree.
export function computeStandings(room: Room): PlayerStanding[] {
  const players = [...room.players.values()];
  const ranks = computeCompetitionRanks(
    players,
    (player) => player.score,
    (player) => player.playerId,
  );
  return players.map((player) => ({
    playerId: player.playerId,
    name: player.name,
    avatarId: player.avatarId,
    score: player.score,
    rank: ranks.get(player.playerId) ?? players.length,
    connected: player.connected,
  }));
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
    standings: computeStandings(room),
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

// ---------------------------------------------------------------------------
// SOCRATES (Task 39)
// ---------------------------------------------------------------------------

// The commentary beat's own card. Reads room.lastReveal.socratesLine - picked
// once, when the round was scored - so the live broadcast and a later
// state:sync catch-up can never show two different lines. Null only when
// there is no line at all, which is precisely when the server skips the phase.
export function buildSocratesPayload(room: Room): SocratesShowPayload | null {
  const line = room.lastReveal?.socratesLine;
  if (!line) {
    return null;
  }
  const lineTemplate = room.lastReveal?.socratesLineTemplate ?? '';
  return {
    line,
    lineTemplate,
    questionIndex: room.currentQuestionIndex,
    totalQuestions: room.questions.length,
    durationMs: remainingActiveTimerMs(room),
    // Recomputed from the same template every call (live broadcast AND a
    // later state:sync alike) rather than read off the timer, which only
    // ever holds what's LEFT, not the original span (Task 42b).
    totalDurationMs: resolveSocratesDurationMs(lineTemplate || null),
    paused: room.paused,
    pausedByName: room.pausedByName,
    standings: computeStandings(room),
  };
}

// ---------------------------------------------------------------------------
// POWER_UP (Task 30a)
// ---------------------------------------------------------------------------

// Built fresh from room state on every send - the live broadcast and a later
// state:sync catch-up therefore share one code path, and `durationMs` is the
// time STILL LEFT (frozen while paused, since it comes from the shared timer
// helper) rather than a flat 10s, so a phone that reconnects five seconds in
// counts down five, not ten.
export function buildPowerUpHostPayload(room: Room): PowerUpShowHostPayload {
  return {
    questionIndex: room.currentQuestionIndex,
    totalQuestions: room.questions.length,
    durationMs: remainingActiveTimerMs(room),
    ...buildPowerUpProgress(room),
    paused: room.paused,
    pausedByName: room.pausedByName,
    standings: computeStandings(room),
  };
}

// Per phone, never built once and reused: `targets` omits its own reader (so
// self-targeting isn't even offered) and `yourChoice` is that phone's own
// choice alone. No phone ever learns another's - that stays hidden until it
// lands on the next question.
export function buildPowerUpPlayerPayload(room: Room, playerId: string): PowerUpShowPlayerPayload {
  const targets: PowerUpTarget[] = getConnectedPlayers(room)
    .filter((player) => player.playerId !== playerId)
    .map((player) => ({ playerId: player.playerId, name: player.name, avatarId: player.avatarId }));

  const choice = room.powerUpChoices.get(playerId);
  return {
    questionIndex: room.currentQuestionIndex,
    totalQuestions: room.questions.length,
    durationMs: remainingActiveTimerMs(room),
    effects: POWER_UP_EFFECTS,
    targets,
    yourChoice: choice ? { effect: choice.effect, targetPlayerId: choice.targetPlayerId } : null,
    paused: room.paused,
    pausedByName: room.pausedByName,
  };
}

// WHO has committed, never what to - the host is a display, and this is the
// only power-up information it ever receives.
export function buildPowerUpProgress(room: Room): PowerUpProgressPayload {
  return {
    chosenCount: room.powerUpChoices.size,
    totalPlayers: getConnectedPlayers(room).length,
    chosenPlayerIds: Array.from(room.powerUpChoices.keys()),
  };
}

// ---------------------------------------------------------------------------
// STEAL (Task 32)
// ---------------------------------------------------------------------------

// Every OTHER connected player, with the score the steal will be clamped to.
// Built fresh on each send, so a target who left between the phase starting
// and a reconnect simply isn't offered any more.
export function stealTargetsFor(room: Room, thiefPlayerId: string): StealTarget[] {
  return getConnectedPlayers(room)
    .filter((player) => player.playerId !== thiefPlayerId)
    .map((player) => ({
      playerId: player.playerId,
      name: player.name,
      avatarId: player.avatarId,
      score: player.score,
    }));
}

// Built fresh from room state on every send - live broadcast and state:sync
// catch-up therefore share one code path, and `durationMs` is the time STILL
// LEFT (frozen while paused, since it comes from the shared timer helper).
export function buildStealHostPayload(room: Room): StealShowHostPayload | null {
  const steal = room.steal;
  if (!steal) {
    return null;
  }
  return {
    questionIndex: room.currentQuestionIndex,
    totalQuestions: room.questions.length,
    durationMs: remainingActiveTimerMs(room),
    thiefPlayerId: steal.thiefPlayerId,
    thiefName: steal.thiefName,
    thiefAvatarId: steal.thiefAvatarId,
    amount: steal.amount,
    standings: computeStandings(room),
    resolved: steal.resolved,
    paused: room.paused,
    pausedByName: room.pausedByName,
  };
}

// Per phone, never built once and reused: `youAreThief` and the target list
// are exactly what differ, and only the thief's phone is ever handed a list
// to pick from. Everyone else gets a spectator view naming the thief.
export function buildStealPlayerPayload(room: Room, playerId: string): StealShowPlayerPayload | null {
  const steal = room.steal;
  if (!steal) {
    return null;
  }
  const youAreThief = steal.thiefPlayerId === playerId;
  return {
    questionIndex: room.currentQuestionIndex,
    totalQuestions: room.questions.length,
    durationMs: remainingActiveTimerMs(room),
    thiefName: steal.thiefName,
    thiefAvatarId: steal.thiefAvatarId,
    youAreThief,
    amount: steal.amount,
    targets: youAreThief ? stealTargetsFor(room, playerId) : [],
    yourChoice:
      youAreThief && steal.chosenTargetPlayerId !== null
        ? { targetPlayerId: steal.chosenTargetPlayerId }
        : null,
    resolved: steal.resolved,
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
