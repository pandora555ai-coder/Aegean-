import {
  DRAIN_PER_SEC,
  POWER_UP_EFFECTS,
  SOCRATES_MAX_DURATION_MS,
  TRIAL_STAGE_TAGLINE,
  TRIAL_STAGE_TITLE,
  WRONG_HIT,
  firstQuestionIndexOfStage,
  stageForQuestionIndex,
  stagesForLength,
  type GameOverPayload,
  type GameOverStanding,
  type PlayerStanding,
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
  type TrialLife,
  type TrialQuestionShowHostPayload,
  type TrialQuestionShowPlayerPayload,
  type TrialRevealShowPayload,
} from '@game/shared';
import { resolveSocratesDurationMs } from './socratesAudio.js';
import { getConnectedPlayers, type Room } from './state.js';
import { remainingActiveTimerMs } from './timers.js';

// The stage card the TV shows during the STAGE_ANNOUNCE beat. Derived
// entirely from room.currentQuestionIndex, so the live emit and a
// mid-announcement state:sync can never disagree.
// Task 127: one branch for Η Δίκη. The trial is announced through this exact
// phase rather than one of its own, so it inherits the held beat, the
// pause-aware timer and the state:sync catch-up for free - and because the
// branch is HERE rather than at the emit site, a TV reattaching mid-card gets
// the trial card back, not stage 3's.
export function buildStageAnnounce(room: Room): StageAnnouncePayload {
  if (room.trial) {
    // One past however many quiz stages this game's length included - the
    // trial is always the last card of the night, whatever the length.
    const quizStages = stagesForLength(room.settings.gameLength).length;
    return {
      stage: quizStages + 1,
      totalStages: quizStages + 1,
      title: TRIAL_STAGE_TITLE,
      tagline: TRIAL_STAGE_TAGLINE,
      // Not a fixed run of questions like a quiz stage: the trial lasts until
      // one player is left standing. 0 is what "there is no count to show".
      questionCount: 0,
      firstQuestionIndex: room.questions.length,
      totalQuestions: room.questions.length,
    };
  }
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
// strictly ahead of it. Exported (Task 65) so the numeric mode's distance
// ranking reuses this exact function instead of a second one - pass a
// negated distance as getScore to rank ascending instead of descending.
export function computeCompetitionRanks<T>(
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
  // Task 48 - GAME_INTRO/STAGE_INTRO/WINNER beats carry their own line
  // outside room.lastReveal (there may be no reveal yet, or none at all
  // this beat is about). Checked first; a REVEAL-moment beat never sets
  // this, so the fallback below is byte-for-byte what it always was.
  const pending = room.pendingSocratesBeat;
  const line = pending?.line ?? room.lastReveal?.socratesLine;
  if (!line) {
    return null;
  }
  const lineTemplate = pending?.lineTemplate ?? room.lastReveal?.socratesLineTemplate ?? '';
  const lineTag = pending?.lineTag ?? room.lastReveal?.socratesLineTag ?? null;
  // Recomputed from the same template every call (live broadcast AND a later
  // state:sync alike) rather than read off the timer, which only ever holds
  // what's LEFT of a DIFFERENT span now (Task 42c below).
  const totalDurationMs = resolveSocratesDurationMs(lineTemplate || null, lineTag);
  // The phase's REAL timer is armed at the ceiling (SOCRATES_MAX_DURATION_MS,
  // see startSocratesIfLineFired) - it's a backstop, not this line's expected
  // length, so its own remaining time is the wrong thing to show as the
  // countdown. Deriving elapsed-since-armed from it and subtracting from
  // `totalDurationMs` instead gives a countdown that reaches 0 right as the
  // clip is expected to finish (matching the progress bar), even though the
  // phase itself may keep waiting a little past that for the completion ack.
  const elapsedMs = SOCRATES_MAX_DURATION_MS - remainingActiveTimerMs(room);
  const durationMs = Math.max(0, totalDurationMs - elapsedMs);
  return {
    line,
    lineTemplate,
    lineTag,
    // WINNER plays after the final question is already scored, so it must
    // never share a contentKey (client-side) with that same question's own
    // REVEAL-moment beat - one past the last real index is a natural,
    // always-distinct value for it.
    questionIndex: pending?.kind === 'WINNER' ? room.questions.length : room.currentQuestionIndex,
    totalQuestions: room.questions.length,
    durationMs,
    totalDurationMs,
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
    // WHO has committed, never what to - the host is a display, and this is
    // the only power-up information it ever receives (inlined when
    // power_up:progress was deleted, task 115 - this payload was its last
    // caller).
    chosenCount: room.powerUpChoices.size,
    totalPlayers: getConnectedPlayers(room).length,
    chosenPlayerIds: Array.from(room.powerUpChoices.keys()),
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

// `winnerPlayerId` (Task 127) is the trial's verdict, and it OVERRIDES the
// score ordering: a sudden death is won by the earliest correct lock-in
// between players who are all at or below zero, so the winner is not
// necessarily the highest score and there is no tie to declare. Null (every
// caller before the trial existed) keeps the original behaviour exactly:
// rank purely by score, ties shared.
export function buildGameOver(room: Room, winnerPlayerId: string | null = null): GameOverPayload {
  const players = [...room.players.values()];
  const declaredWinner = winnerPlayerId !== null ? room.players.get(winnerPlayerId) : undefined;

  if (declaredWinner) {
    const others = [...players]
      .filter((player) => player.playerId !== declaredWinner.playerId)
      .sort((a, b) => b.score - a.score);
    // Ranked among THEMSELVES, then shifted down one - so a tie for second
    // still reads as a tie (2,2,4) below the declared winner's 1.
    const otherRanks = computeCompetitionRanks(
      others,
      (player) => player.score,
      (player) => player.playerId,
    );
    const standings: GameOverStanding[] = [
      {
        playerId: declaredWinner.playerId,
        name: declaredWinner.name,
        avatarId: declaredWinner.avatarId,
        score: declaredWinner.score,
        rank: 1,
      },
      ...others.map((player) => ({
        playerId: player.playerId,
        name: player.name,
        avatarId: player.avatarId,
        score: player.score,
        rank: (otherRanks.get(player.playerId) ?? others.length) + 1,
      })),
    ];
    return {
      standings,
      winnerName: declaredWinner.name,
      isTie: false, // the trial decides between them - that is what it is for
      totalQuestions: room.questions.length,
    };
  }

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

// ---------------------------------------------------------------------------
// Η Δίκη (Task 127)
// ---------------------------------------------------------------------------

// Every player's life, alive-ness and whether they are in the question
// currently on screen. Host-only information in aggregate (a phone gets its
// own `yourLife` and nothing else), and built fresh on every send so a live
// broadcast and a state:sync catch-up can never disagree.
function trialLives(room: Room): TrialLife[] {
  const trial = room.trial;
  if (!trial) {
    return [];
  }
  const living = new Set(trial.livingPlayerIds);
  const onTrial = new Set(trial.suddenDeath ? trial.suddenDeathPlayerIds : trial.livingPlayerIds);
  return [...room.players.values()].map((player) => ({
    playerId: player.playerId,
    name: player.name,
    avatarId: player.avatarId,
    life: player.score,
    alive: living.has(player.playerId),
    onTrial: onTrial.has(player.playerId),
  }));
}

export function buildTrialQuestionHostPayload(room: Room): TrialQuestionShowHostPayload | null {
  const trial = room.trial;
  const question = trial?.questions[trial.questionIndex];
  if (!trial || !question) {
    return null;
  }
  return {
    roundIndex: trial.questionIndex,
    question: question.question,
    options: question.options,
    category: question.category,
    questionTimeMs: room.settings.questionTimeMs,
    durationMs: remainingActiveTimerMs(room),
    drainPerSec: DRAIN_PER_SEC,
    wrongHit: WRONG_HIT,
    suddenDeath: trial.suddenDeath,
    lives: trialLives(room),
    // WHO has locked in, never what they picked - the same contract as
    // answer:progress, and for the same reason: the host is a display.
    lockedInPlayerIds: Array.from(trial.lockIns.keys()),
    paused: room.paused,
    pausedByName: room.pausedByName,
    standings: computeStandings(room),
  };
}

// Per phone, never built once and reused: `yourLife`, `onTrial` and
// `lockedIn` are this player's alone. No correct index, no question text and
// nothing whatsoever about another player's lock-in - none of that is safe to
// send until TRIAL_REVEAL.
export function buildTrialQuestionPlayerPayload(room: Room, playerId: string): TrialQuestionShowPlayerPayload | null {
  const trial = room.trial;
  const question = trial?.questions[trial.questionIndex];
  if (!trial || !question) {
    return null;
  }
  const onTrial = trial.suddenDeath
    ? trial.suddenDeathPlayerIds.includes(playerId)
    : trial.livingPlayerIds.includes(playerId);
  return {
    roundIndex: trial.questionIndex,
    options: question.options,
    category: question.category,
    questionTimeMs: room.settings.questionTimeMs,
    durationMs: remainingActiveTimerMs(room),
    drainPerSec: DRAIN_PER_SEC,
    wrongHit: WRONG_HIT,
    suddenDeath: trial.suddenDeath,
    onTrial,
    yourLife: room.players.get(playerId)?.score ?? 0,
    lockedIn: trial.lockIns.has(playerId),
    paused: room.paused,
    pausedByName: room.pausedByName,
  };
}

// Public and symmetric, like reveal:show - one payload for the whole room.
// Reads the frozen snapshot (taken the instant the round resolved) plus
// whatever is live right now, so the fresh broadcast and a later state:sync
// share one code path.
export function buildTrialRevealPayload(room: Room): TrialRevealShowPayload | null {
  const snapshot = room.trial?.lastReveal;
  if (!snapshot) {
    return null;
  }
  return {
    ...snapshot,
    autoAdvanceMs: remainingActiveTimerMs(room),
    paused: room.paused,
    pausedByName: room.pausedByName,
    standings: computeStandings(room),
  };
}
