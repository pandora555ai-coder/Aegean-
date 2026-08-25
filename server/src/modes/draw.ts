import {
  DRAW_DURATION_MS,
  DRAW_MIN_PLAYERS,
  DRAW_ROUNDS_OPTIONS,
  DRAWER_POINTS_PER_CORRECT_GUESSER,
  DRAWING_MAX_BYTES,
  GUESS_DURATION_MS,
  GUESS_REVEAL_DURATION_MS,
  ServerEvents,
  WORD_SETS,
  type DrawShowHostPayload,
  type DrawShowPlayerPayload,
  type GamePhase,
  type GuessRevealResult,
  type GuessRevealShowPayload,
  type GuessShowDrawerPayload,
  type GuessShowGuesserPayload,
  type GuessShowHostPayload,
  type RoomCode,
  type WordSet,
} from '@game/shared';
import { getConnectedPlayers, getRoom, type Room } from '../state.js';
import { armActiveTimer, clearActiveTimer, remainingActiveTimerMs } from '../timers.js';
import { calculatePoints } from '../scoring.js';
import { buildGameOver, computeStandings } from '../payloads.js';
import { io } from '../realtime.js';
import { registerGameMode } from './registry.js';
import type { GameMode } from './types.js';

// The drawing mode (Task 56a, client views in 56b). A room needs its own
// runtime state (who's drawing what, the submitted pictures, the guess
// queue) that has nowhere to live in the mode-agnostic Room interface
// (state.ts is deliberately untouched by this mode - see modes/README). A
// WeakMap keyed on the Room OBJECT itself, not room.code, solves that with
// zero coupling: once a room is deleted from state.ts's own map and nothing
// else references it, this entry is garbage-collected for free.
//
// "Play again" reuses the SAME Room object (state.ts's resetRoomForNewGame
// never creates a new one), so prepareGame is what has to guarantee a
// second game never sees a trace of the first: it now deletes any existing
// entry unconditionally, up front, before deciding whether it can even deal
// a fresh one in (Task 56b fix - see the comment there).
interface DrawState {
  // playerId -> the word set they were dealt this game. Built once, in
  // prepareGame, from players connected at that moment - never rebuilt
  // mid-game, so a late joiner simply has no word and can't be drawn into
  // the queue below.
  assignment: Map<string, WordSet>;
  // playerId -> the image they submitted, in SUBMISSION order (a Map
  // preserves insertion order) - this doubles as the guess queue's source
  // once DRAW ends. Players who never submitted are simply absent, which is
  // what "players who submitted nothing are skipped" falls out of for free.
  drawings: Map<string, string>;
  // The fixed queue of drawer playerIds the GUESS/GUESS_REVEAL pairs run
  // through, snapshotted from `drawings`' keys the instant DRAW ends so a
  // later disconnect can't reshuffle or shrink it mid-game.
  queue: string[];
  // -1 before the first GUESS round starts; index into `queue` thereafter.
  roundIndex: number;
  // This round's 4 shuffled options and which of them is correct - null
  // outside GUESS/GUESS_REVEAL. Never sent to a client before GUESS_REVEAL.
  currentOptions: string[] | null;
  currentCorrectIndex: number | null;
  // playerId -> this round's guess, cleared at the start of every round.
  guesses: Map<string, { choice: number; timeMs: number }>;
  roundStartedAt: number;
  // Task 56b - the last computed GUESS_REVEAL, snapshotted once (exactly
  // like Room.lastReveal in the quiz mode - see state.ts) so a reconnect
  // mid-GUESS_REVEAL can be caught up via state:sync without recomputing or
  // re-scoring anything. Only the fields that are true FOR THE ROUND are
  // frozen here; autoAdvanceMs/paused/pausedByName/standings are always
  // read live (see buildGuessRevealPayload) since those can change under a
  // reconnect (e.g. someone paused after the round already resolved).
  lastGuessReveal: Omit<GuessRevealShowPayload, 'autoAdvanceMs' | 'paused' | 'pausedByName' | 'standings'> | null;
  // Task 57 - "rounds" (room.settings.drawRounds, 1 or 2): how many full
  // draw-then-guess-everything cycles this game runs. `cycleIndex` is
  // 0-based; `totalCycles` is frozen at prepareGame time (a mid-game
  // settings change is impossible anyway - VIP_UPDATE_SETTINGS is LOBBY-only).
  cycleIndex: number;
  totalCycles: number;
}

const drawStateByRoom = new WeakMap<Room, DrawState>();

function requireDrawState(room: Room): DrawState {
  const state = drawStateByRoom.get(room);
  if (!state) {
    throw new Error(`room ${room.code} has no draw state - prepareGame was never called for it`);
  }
  return state;
}

const DRAW_PHASES: readonly GamePhase[] = ['LOBBY', 'DRAW', 'GUESS', 'GUESS_REVEAL', 'GAME_OVER'];

// The drawing mode's own phase-advance timer kinds, exhaustively covered by
// DRAW_CONTINUATIONS below - see modes/README's acceptance criteria: a phase
// that arms a timer must appear in this table, or pause/resume freezes the
// game forever.
export type DrawTimerKind = 'DRAW' | 'GUESS' | 'GUESS_REVEAL';

function armDrawTimer(room: Room, kind: DrawTimerKind, durationMs: number, onFire: () => void): void {
  armActiveTimer(room, kind, durationMs, onFire);
}

// Fisher-Yates, used both for dealing distinct word sets and for shuffling
// one round's 4 options - never a naive sort-by-random, which biases.
function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Deals one cycle's word sets to whoever is CURRENTLY connected - shared by
// prepareGame (cycle 0) and advanceToNextCycleOrGameOver (cycle 1, if the
// VIP picked 2 rounds). Returns null (logging why) rather than dealing
// anyone in below DRAW_MIN_PLAYERS connected players, or if the word bank
// somehow ran short - both callers treat null as "can't proceed".
function dealAssignment(room: Room): Map<string, WordSet> | null {
  const connected = getConnectedPlayers(room);
  if (connected.length < DRAW_MIN_PLAYERS) {
    console.log(
      `room ${room.code} draw mode: not dealing a cycle - only ${connected.length} connected player(s), need ${DRAW_MIN_PLAYERS}`,
    );
    return null;
  }
  if (connected.length > WORD_SETS.length) {
    // Structurally unreachable today (WORD_SETS is far larger than
    // MAX_PLAYERS) - guarded anyway rather than silently dealing duplicates.
    console.log(
      `room ${room.code} draw mode: not enough distinct word sets (${WORD_SETS.length}) for ${connected.length} players`,
    );
    return null;
  }

  const dealt = shuffled(WORD_SETS).slice(0, connected.length);
  const assignment = new Map<string, WordSet>();
  connected.forEach((player, index) => {
    assignment.set(player.playerId, dealt[index]);
  });
  return assignment;
}

// Task 57 - room.settings.drawRounds, clamped defensively even though
// updateRoomSettings (state.ts) already validates it against
// DRAW_ROUNDS_OPTIONS before it ever reaches here.
function roundsFromSettings(room: Room): number {
  return (DRAW_ROUNDS_OPTIONS as readonly number[]).includes(room.settings.drawRounds) ? room.settings.drawRounds : 1;
}

// Draws/builds the game (Task 52's prepareGame contract). Refuses to deal
// anyone in below DRAW_MIN_PLAYERS connected players - `start` below checks
// for that same shortfall and stays in LOBBY, which is what "refuse to
// start" actually looks like from a mode whose prepareGame returns void.
//
// Task 56b fix: the delete is now UNCONDITIONAL and happens FIRST, before
// anything else runs - a second game (via "play again", which reuses this
// same Room object) must never be able to observe the first game's
// drawings or word assignments, even for the instant between this call
// starting and the fresh `.set()` below landing.
function prepareGame(room: Room): void {
  drawStateByRoom.delete(room);

  const assignment = dealAssignment(room);
  if (!assignment) {
    return;
  }

  drawStateByRoom.set(room, {
    assignment,
    drawings: new Map(),
    queue: [],
    roundIndex: -1,
    currentOptions: null,
    currentCorrectIndex: null,
    guesses: new Map(),
    roundStartedAt: 0,
    lastGuessReveal: null,
    cycleIndex: 0,
    totalCycles: roundsFromSettings(room),
  });
  console.log(`room ${room.code} draw mode: dealt ${assignment.size} distinct word sets (${roundsFromSettings(room)} round(s))`);
}

// vip:start_game calls only this. Stays in LOBBY (a no-op) if prepareGame
// refused - see the comment there - so a VIP can simply wait for a third
// player and try again rather than the room getting stuck mid-transition.
function start(room: Room): void {
  const state = drawStateByRoom.get(room);
  if (!state || state.assignment.size < DRAW_MIN_PLAYERS) {
    console.log(`room ${room.code} draw mode: refusing to start - fewer than ${DRAW_MIN_PLAYERS} players were dealt in`);
    return;
  }
  startDrawPhase(room, state);
}

function startDrawPhase(room: Room, state: DrawState): void {
  room.phase = 'DRAW';
  state.drawings.clear();
  armDrawTimer(room, 'DRAW', DRAW_DURATION_MS, () => endDrawPhase(room.code));

  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
  broadcastDrawShow(room);
  console.log(`room ${room.code} draw phase started - ${state.assignment.size} players drawing`);
}

// Task 56b - pure builders, read-only against room/state, used by BOTH the
// live broadcast below and server/src/index.ts's state:sync catch-up (a
// host or player reattaching mid-phase gets exactly what a fresh phase
// entry would have sent, never a stale or guessed value). `durationMs` is
// always the time STILL LEFT (remainingActiveTimerMs, frozen while paused),
// never the phase's full nominal duration - same discipline as every other
// mode's buildXShowPayload in payloads.ts.
export function buildDrawHostPayload(room: Room): DrawShowHostPayload | null {
  const state = drawStateByRoom.get(room);
  if (!state) {
    return null;
  }
  return {
    durationMs: remainingActiveTimerMs(room),
    submittedCount: state.drawings.size,
    totalPlayers: state.assignment.size,
    submittedPlayerIds: Array.from(state.drawings.keys()),
    paused: room.paused,
    pausedByName: room.pausedByName,
    standings: computeStandings(room),
  };
}

export function buildDrawPlayerPayload(room: Room, playerId: string): DrawShowPlayerPayload | null {
  const state = drawStateByRoom.get(room);
  const wordSet = state?.assignment.get(playerId);
  if (!state || !wordSet) {
    return null; // never dealt into this game - nothing to show them
  }
  return {
    wordToDraw: wordSet[0],
    durationMs: remainingActiveTimerMs(room),
    submitted: state.drawings.has(playerId),
    paused: room.paused,
    pausedByName: room.pausedByName,
  };
}

function broadcastDrawShow(room: Room): void {
  const hostPayload = buildDrawHostPayload(room);
  if (hostPayload && room.hostSocketId) {
    io.to(room.hostSocketId).emit(ServerEvents.DRAW_SHOW, hostPayload);
  }
  for (const player of getConnectedPlayers(room)) {
    const payload = buildDrawPlayerPayload(room, player.playerId);
    if (payload) {
      io.to(player.socketId).emit(ServerEvents.DRAW_SHOW, payload);
    }
  }
}

// Every DEALT player who is CURRENTLY connected has submitted - mirrors
// haveAllConnectedPlayersAnswered's identity-based reasoning (state.ts), but
// scoped to this game's own participants so a player who joins mid-DRAW
// (never dealt a word, can never submit) can't block the early end forever.
function allConnectedParticipantsSubmitted(room: Room, state: DrawState): boolean {
  const connectedIds = new Set(getConnectedPlayers(room).map((player) => player.playerId));
  const participantIds = [...state.assignment.keys()].filter((id) => connectedIds.has(id));
  return participantIds.length > 0 && participantIds.every((id) => state.drawings.has(id));
}

// Records one player's submitted drawing. Returns whether it was accepted -
// the caller (server/src/index.ts's draw:submit handler) logs/acks on that.
export function submitDrawing(room: Room, playerId: string, image: string): boolean {
  if (room.phase !== 'DRAW') {
    return false;
  }
  if (room.paused) {
    return false;
  }
  if (typeof image !== 'string' || !image.startsWith('data:image/')) {
    return false;
  }
  if (image.length > DRAWING_MAX_BYTES) {
    return false;
  }
  const state = requireDrawState(room);
  if (!state.assignment.has(playerId)) {
    return false; // never dealt into this game - nothing to submit against
  }
  if (state.drawings.has(playerId)) {
    return false; // one submission per player per game
  }

  state.drawings.set(playerId, image);
  broadcastDrawProgress(room, state);
  console.log(
    `room ${room.code} draw:submit from ${playerId} - ${state.drawings.size}/${state.assignment.size} submitted`,
  );

  if (allConnectedParticipantsSubmitted(room, state)) {
    endDrawPhase(room.code);
  }
  return true;
}

function broadcastDrawProgress(room: Room, state: DrawState): void {
  if (!room.hostSocketId) {
    return;
  }
  io.to(room.hostSocketId).emit(ServerEvents.DRAW_PROGRESS, {
    submittedCount: state.drawings.size,
    totalPlayers: state.assignment.size,
    submittedPlayerIds: Array.from(state.drawings.keys()),
  });
}

// Re-run whenever a player disconnects during DRAW (server/src/index.ts) -
// the player who just left might have been the only one still drawing.
export function recheckDrawPhaseOnDisconnect(room: Room): void {
  if (room.phase !== 'DRAW') {
    return;
  }
  const state = drawStateByRoom.get(room);
  if (state && allConnectedParticipantsSubmitted(room, state)) {
    endDrawPhase(room.code);
  }
}

// Ends DRAW exactly once - guarded by the phase check, so whichever of (the
// 75s timer firing) / (every connected participant submitting) happens
// first wins, and every LATER call - a late submit, a disconnect after this
// already ran - hits the guard and is a no-op. `clearActiveTimer` is called
// explicitly (not left to the next arm to clean up) so an EARLY end always
// cancels the still-pending DRAW timeout through the one shared helper,
// exactly like every other phase's early end in this codebase.
export function endDrawPhase(code: RoomCode): void {
  const room = getRoom(code);
  if (!room || room.phase !== 'DRAW') {
    return;
  }
  const state = requireDrawState(room);
  clearActiveTimer(room);

  // The guess queue is a SNAPSHOT, fixed the instant DRAW ends - a Map's
  // keys iterate in insertion (submission) order, so this is already "in a
  // fixed queue" per spec. Anyone who submitted nothing is simply absent.
  state.queue = Array.from(state.drawings.keys());
  state.roundIndex = -1;
  console.log(`room ${room.code} draw phase ended - ${state.queue.length}/${state.assignment.size} drawings submitted`);

  advanceToNextGuessRoundOrGameOver(room, state);
}

function advanceToNextGuessRoundOrGameOver(room: Room, state: DrawState): void {
  state.roundIndex += 1;
  if (state.roundIndex >= state.queue.length) {
    advanceToNextCycleOrGameOver(room, state);
    return;
  }
  startGuessRound(room, state);
}

// Task 57 - every submitted drawing of the current cycle has now had its
// GUESS/GUESS_REVEAL pair. If the VIP picked more than one round, deal a
// FRESH assignment (to whoever is connected right now) and start another
// DRAW phase; otherwise this is what GAME_OVER actually is. A cycle that
// can't be dealt (too few connected players left) ends the game with
// whatever was already scored rather than getting the room stuck.
function advanceToNextCycleOrGameOver(room: Room, state: DrawState): void {
  if (state.cycleIndex + 1 >= state.totalCycles) {
    finishGame(room);
    return;
  }

  const assignment = dealAssignment(room);
  if (!assignment) {
    console.log(`room ${room.code} draw mode: ending early - can't deal round ${state.cycleIndex + 2}`);
    finishGame(room);
    return;
  }

  state.cycleIndex += 1;
  state.assignment = assignment;
  state.queue = [];
  state.roundIndex = -1;
  state.currentOptions = null;
  state.currentCorrectIndex = null;
  state.guesses.clear();
  state.lastGuessReveal = null;
  console.log(`room ${room.code} draw mode: starting round ${state.cycleIndex + 1}/${state.totalCycles}`);
  startDrawPhase(room, state);
}

function startGuessRound(room: Room, state: DrawState): void {
  const drawerId = state.queue[state.roundIndex];
  const drawer = room.players.get(drawerId);
  const wordSet = state.assignment.get(drawerId);
  const image = state.drawings.get(drawerId);
  if (!drawer || !wordSet || image === undefined) {
    // Defensive only - every id in `queue` came from `drawings`, whose keys
    // are exactly `assignment`'s, and players are never removed from
    // room.players. Skips rather than crashing the room if this ever did fire.
    advanceToNextGuessRoundOrGameOver(room, state);
    return;
  }

  const options = shuffled(wordSet);
  state.currentOptions = options;
  state.currentCorrectIndex = options.indexOf(wordSet[0]);
  state.guesses.clear();
  state.roundStartedAt = Date.now();

  room.phase = 'GUESS';
  armDrawTimer(room, 'GUESS', GUESS_DURATION_MS, () => endGuessRound(room.code));
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
  broadcastGuessShow(room);

  console.log(
    `room ${room.code} guess round ${state.roundIndex + 1}/${state.queue.length} - drawer ${drawer.name}`,
  );
}

// Task 56b - same read-only builder discipline as buildDraw*Payload above,
// reused by the live broadcast, state:sync, AND submitGuess's progress
// updates (guessedCount/totalGuessers change on every guess, so a mid-round
// reconnect must see the live count, not the round's opening one).
export function buildGuessHostPayload(room: Room): GuessShowHostPayload | null {
  const state = drawStateByRoom.get(room);
  if (!state || state.roundIndex < 0 || state.roundIndex >= state.queue.length || !state.currentOptions) {
    return null;
  }
  const drawerId = state.queue[state.roundIndex];
  const drawer = room.players.get(drawerId);
  const image = state.drawings.get(drawerId);
  if (!drawer || image === undefined) {
    return null;
  }
  return {
    drawerPlayerId: drawerId,
    drawerName: drawer.name,
    drawerAvatarId: drawer.avatarId,
    image,
    options: state.currentOptions,
    roundIndex: state.roundIndex,
    totalRounds: state.queue.length,
    durationMs: remainingActiveTimerMs(room),
    guessedCount: state.guesses.size,
    totalGuessers: guesserCount(room, drawerId),
    paused: room.paused,
    pausedByName: room.pausedByName,
    standings: computeStandings(room),
  };
}

export function buildGuessPlayerPayload(
  room: Room,
  playerId: string,
): GuessShowGuesserPayload | GuessShowDrawerPayload | null {
  const state = drawStateByRoom.get(room);
  if (!state || state.roundIndex < 0 || state.roundIndex >= state.queue.length || !state.currentOptions) {
    return null;
  }
  const drawerId = state.queue[state.roundIndex];
  const drawer = room.players.get(drawerId);
  if (!drawer) {
    return null;
  }
  const totalGuessers = guesserCount(room, drawerId);

  if (playerId === drawerId) {
    return {
      isDrawer: true,
      roundIndex: state.roundIndex,
      totalRounds: state.queue.length,
      durationMs: remainingActiveTimerMs(room),
      guessedCount: state.guesses.size,
      totalGuessers,
      paused: room.paused,
      pausedByName: room.pausedByName,
    };
  }

  const guess = state.guesses.get(playerId);
  return {
    isDrawer: false,
    drawerName: drawer.name,
    drawerAvatarId: drawer.avatarId,
    options: state.currentOptions,
    roundIndex: state.roundIndex,
    totalRounds: state.queue.length,
    durationMs: remainingActiveTimerMs(room),
    yourGuess: guess ? guess.choice : null,
    paused: room.paused,
    pausedByName: room.pausedByName,
  };
}

function guesserCount(room: Room, drawerId: string): number {
  return Math.max(0, getConnectedPlayers(room).filter((player) => player.playerId !== drawerId).length);
}

function broadcastGuessShow(room: Room): void {
  const hostPayload = buildGuessHostPayload(room);
  if (hostPayload && room.hostSocketId) {
    io.to(room.hostSocketId).emit(ServerEvents.GUESS_SHOW, hostPayload);
  }
  for (const player of getConnectedPlayers(room)) {
    const payload = buildGuessPlayerPayload(room, player.playerId);
    if (payload) {
      io.to(player.socketId).emit(ServerEvents.GUESS_SHOW, payload);
    }
  }
}

function broadcastGuessProgress(room: Room, state: DrawState): void {
  if (!room.hostSocketId) {
    return;
  }
  const drawerId = state.queue[state.roundIndex];
  io.to(room.hostSocketId).emit(ServerEvents.GUESS_PROGRESS, {
    guessedCount: state.guesses.size,
    totalGuessers: guesserCount(room, drawerId),
    guessedPlayerIds: Array.from(state.guesses.keys()),
  });
}

// Every CONNECTED player except the drawer has guessed - same identity-based
// reasoning as allConnectedParticipantsSubmitted above.
function allConnectedGuessersHaveGuessed(room: Room, state: DrawState, drawerId: string): boolean {
  const guesserIds = getConnectedPlayers(room)
    .map((player) => player.playerId)
    .filter((id) => id !== drawerId);
  return guesserIds.length > 0 && guesserIds.every((id) => state.guesses.has(id));
}

// Records one guess. Returns whether it was accepted - the drawer's own
// draw:guess is rejected here (spec: "server-side draw:guess is rejected
// for the drawer"), not just hidden from their client.
export function submitGuess(room: Room, playerId: string, choice: number): boolean {
  if (room.phase !== 'GUESS') {
    return false;
  }
  if (room.paused) {
    return false;
  }
  const state = requireDrawState(room);
  const drawerId = state.queue[state.roundIndex];
  if (playerId === drawerId) {
    return false; // the drawer may never guess their own drawing
  }
  if (!state.currentOptions || !Number.isInteger(choice) || choice < 0 || choice >= state.currentOptions.length) {
    return false;
  }
  if (state.guesses.has(playerId)) {
    return false; // one guess per player per round
  }

  const timeMs = Date.now() - state.roundStartedAt;
  state.guesses.set(playerId, { choice, timeMs });
  broadcastGuessProgress(room, state);
  console.log(`room ${room.code} draw:guess from ${playerId} - choice ${choice}`);

  if (allConnectedGuessersHaveGuessed(room, state, drawerId)) {
    endGuessRound(room.code);
  }
  return true;
}

// Re-run whenever a player disconnects during GUESS (server/src/index.ts) -
// the player who just left might have been the only one still guessing.
export function recheckGuessPhaseOnDisconnect(room: Room): void {
  if (room.phase !== 'GUESS') {
    return;
  }
  const state = drawStateByRoom.get(room);
  if (!state) {
    return;
  }
  const drawerId = state.queue[state.roundIndex];
  if (allConnectedGuessersHaveGuessed(room, state, drawerId)) {
    endGuessRound(room.code);
  }
}

// Task 56b - the reveal builder, reused by the live broadcast below AND
// state:sync. Reads `state.lastGuessReveal` (set once, at the moment the
// round resolves - see endGuessRound) rather than recomputing anything, so
// a fresh send and a later reconnect always agree byte-for-byte on what
// happened. `autoAdvanceMs`/`paused`/`pausedByName`/`standings` are always
// live - the one thing about this beat that CAN change after the fact.
export function buildGuessRevealPayload(room: Room): GuessRevealShowPayload | null {
  const state = drawStateByRoom.get(room);
  const snapshot = state?.lastGuessReveal;
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

// Ends GUESS exactly once - guarded by the phase check, same one-shot
// discipline as endDrawPhase: whichever of (the 20s timer) / (every
// connected guesser guessing) happens first wins, and clearActiveTimer
// cancels the other path through the shared helper on an early end.
// Scoring: guessers reuse calculatePoints (the same speed-bonus path
// QUESTION rounds use); the drawer earns a flat
// DRAWER_POINTS_PER_CORRECT_GUESSER per guesser who got it right.
export function endGuessRound(code: RoomCode): void {
  const room = getRoom(code);
  if (!room || room.phase !== 'GUESS') {
    return;
  }
  const state = requireDrawState(room);
  clearActiveTimer(room);

  const drawerId = state.queue[state.roundIndex];
  const drawer = room.players.get(drawerId);
  const options = state.currentOptions ?? [];
  const correctIndex = state.currentCorrectIndex ?? 0;

  const results: GuessRevealResult[] = [];
  let correctGuessers = 0;
  for (const player of getConnectedPlayers(room)) {
    if (player.playerId === drawerId) {
      continue;
    }
    const recorded = state.guesses.get(player.playerId);
    const choice = recorded ? recorded.choice : null;
    const correct = choice === correctIndex;
    const pointsAwarded = calculatePoints(correct, recorded?.timeMs ?? GUESS_DURATION_MS, GUESS_DURATION_MS);
    if (correct) {
      correctGuessers += 1;
    }
    player.score += pointsAwarded;
    results.push({
      playerId: player.playerId,
      name: player.name,
      avatarId: player.avatarId,
      choice,
      correct,
      pointsAwarded,
      totalScore: player.score,
      timeMs: recorded ? recorded.timeMs : null,
    });
  }

  const drawerPointsAwarded = correctGuessers * DRAWER_POINTS_PER_CORRECT_GUESSER;
  if (drawer) {
    drawer.score += drawerPointsAwarded;
  }

  // Snapshotted BEFORE the phase/timer changes below - the round is fully
  // scored and frozen the instant it resolves, exactly like Room.lastReveal.
  state.lastGuessReveal = {
    drawerPlayerId: drawerId,
    drawerName: drawer?.name ?? '',
    drawerAvatarId: drawer?.avatarId ?? '',
    image: state.drawings.get(drawerId) ?? '',
    correctIndex,
    correctWord: options[correctIndex] ?? '',
    options,
    results,
    drawerPointsAwarded,
    drawerTotalScore: drawer?.score ?? 0,
    roundIndex: state.roundIndex,
    totalRounds: state.queue.length,
  };

  room.phase = 'GUESS_REVEAL';
  armDrawTimer(room, 'GUESS_REVEAL', GUESS_REVEAL_DURATION_MS, () => endGuessReveal(room.code));
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });

  const payload = buildGuessRevealPayload(room);
  if (payload) {
    io.to(room.code).emit(ServerEvents.GUESS_REVEAL_SHOW, payload);
  }

  console.log(
    `room ${room.code} guess round ${state.roundIndex + 1} revealed - correct="${options[correctIndex]}" ` +
      `${correctGuessers}/${results.length} guessed right, drawer +${drawerPointsAwarded}`,
  );
}

// Ends the reveal beat exactly once - same one-shot discipline as every
// other advanceFrom*, guarded by the phase check.
export function endGuessReveal(code: RoomCode): void {
  const room = getRoom(code);
  if (!room || room.phase !== 'GUESS_REVEAL') {
    return;
  }
  const state = requireDrawState(room);
  clearActiveTimer(room);
  advanceToNextGuessRoundOrGameOver(room, state);
}

function finishGame(room: Room): void {
  room.phase = 'GAME_OVER';
  clearActiveTimer(room);
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
  const gameOverPayload = buildGameOver(room);
  io.to(room.code).emit(ServerEvents.GAME_OVER, gameOverPayload);
  console.log(`room ${room.code} draw game over - final standings: ${JSON.stringify(gameOverPayload.standings)}`);
}

const DRAW_CONTINUATIONS: Record<DrawTimerKind, (room: Room) => void> = {
  DRAW: (room) => endDrawPhase(room.code),
  GUESS: (room) => endGuessRound(room.code),
  GUESS_REVEAL: (room) => endGuessReveal(room.code),
};

export const drawMode: GameMode = {
  id: 'draw',
  label: 'Ζωγραφική',
  minPlayers: DRAW_MIN_PLAYERS,
  phases: DRAW_PHASES,
  // No stage table - this mode has no notion of stages, unlike the quiz.
  stages: [],
  prepareGame,
  start,
  continuations: DRAW_CONTINUATIONS,
};

registerGameMode(drawMode);
