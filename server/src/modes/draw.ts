import {
  DRAW_DURATION_MS,
  DRAW_MIN_PLAYERS,
  DRAW_ROUNDS_OPTIONS,
  DRAWER_MAX_POINTS,
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
import { modeForRoom, registerGameMode } from './registry.js';
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
// One player's dealt row plus WHICH of its four words they must draw. For a
// non-rotatable row targetIndex is always 0; for a rotatable row it's
// whichever index dealAssignment picked - see assignTargets below for how
// it guarantees every player in the game gets a distinct target word even
// though rows are no longer sufficient for that on their own (Task 58).
interface DealtWord {
  words: WordSet['words'];
  targetIndex: number;
}

interface DrawState {
  // playerId -> the row + target word they were dealt this game. Built once,
  // in prepareGame, from players connected at that moment - never rebuilt
  // mid-game, so a late joiner simply has no word and can't be drawn into
  // the queue below.
  assignment: Map<string, DealtWord>;
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
  // Task 136 - multiplies a guesser's calculatePoints result before it's
  // awarded. Frozen at deal time, same as totalCycles; defaults to 1 for the
  // standalone mode's own prepareGame, which passes none.
  guessScale: number;
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

// Picks one target index per dealt row - 0 for a non-rotatable row, any of
// 0-3 for a rotatable one - such that the resulting target WORDS are all
// distinct. Plain backtracking: rows are small in number (<= MAX_PLAYERS)
// and each offers at most 4 candidates, so exhaustively trying every
// candidate in a random order before giving up is cheap and, unlike a
// pick-and-hope approach, is guaranteed to find a valid assignment
// whenever one exists for this exact set of rows. Returns null only if no
// such assignment exists at all (e.g. two non-rotatable rows sharing a
// word[0], or a too-tightly-overlapping draw of rotatable rows).
function assignTargets(rows: readonly WordSet[]): number[] | null {
  const targetIndex = new Array<number>(rows.length).fill(-1);
  const usedWords = new Set<string>();

  function place(i: number): boolean {
    if (i === rows.length) {
      return true;
    }
    const row = rows[i];
    const candidates = row.rotatable ? shuffled([0, 1, 2, 3]) : [0];
    for (const idx of candidates) {
      const word = row.words[idx];
      if (usedWords.has(word)) {
        continue;
      }
      usedWords.add(word);
      targetIndex[i] = idx;
      if (place(i + 1)) {
        return true;
      }
      usedWords.delete(word);
    }
    return false;
  }

  return place(0) ? targetIndex : null;
}

// Deals one cycle's word sets to whoever is CURRENTLY connected - shared by
// prepareGame (cycle 0) and advanceToNextCycleOrGameOver (cycle 1, if the
// VIP picked 2 rounds). Returns null (logging why) rather than dealing
// anyone in below DRAW_MIN_PLAYERS connected players, if the word bank
// somehow ran short, or if no duplicate-free target assignment could be
// found - all callers treat null as "can't proceed".
function dealAssignment(room: Room): Map<string, DealtWord> | null {
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

  // Retried with a freshly reshuffled ROW selection, not just a reshuffled
  // target search (assignTargets already exhausts every target combination
  // for the rows it's given) - a different draw of rows is the only thing
  // that can rescue a subset whose overlaps make it truly unsolvable.
  const MAX_ATTEMPTS = 25;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const dealtRows = shuffled(WORD_SETS).slice(0, connected.length);
    const targetIndex = assignTargets(dealtRows);
    if (!targetIndex) {
      continue;
    }
    const assignment = new Map<string, DealtWord>();
    connected.forEach((player, index) => {
      assignment.set(player.playerId, { words: dealtRows[index].words, targetIndex: targetIndex[index] });
    });
    return assignment;
  }

  console.log(
    `room ${room.code} draw mode: couldn't find a duplicate-free target-word assignment for ${connected.length} players after ${MAX_ATTEMPTS} attempts`,
  );
  return null;
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
// The deal itself (and the Task 56b fix that opens it) is in dealFreshState.
function prepareGame(room: Room): void {
  dealFreshState(room, roundsFromSettings(room));
}

// Task 134 - the deal, split out of prepareGame unchanged so the full mode can
// deal at the moment ITS drawing stage begins rather than at the start of the
// game: it runs mid-show, after a quiz stage, and the players it deals to are
// whoever is connected THEN. Returns whether a cycle could be dealt at all.
function dealFreshState(room: Room, totalCycles: number, guessScale = 1): boolean {
  // Unconditional and FIRST, before anything else runs - a second game (via
  // "play again", which reuses this same Room object) must never be able to
  // observe the first game's drawings or word assignments, even for the
  // instant between this call starting and the fresh `.set()` below landing.
  drawStateByRoom.delete(room);

  const assignment = dealAssignment(room);
  if (!assignment) {
    return false;
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
    totalCycles,
    guessScale,
  });
  console.log(`room ${room.code} draw mode: dealt ${assignment.size} distinct word sets (${totalCycles} round(s))`);
  return true;
}

// Task 134 - what a composing mode's prepareGame calls so no trace of the
// previous game's drawings survives into a second one played by the SAME Room
// object. The drawing stage deals its own state when it starts.
export function clearDrawState(room: Room): void {
  drawStateByRoom.delete(room);
}

// Task 134 - the drawing round as ONE STAGE of a longer show. Deals against
// whoever is connected right now and opens the DRAW phase; returns false (the
// caller then skips the stage) when there are too few players left to deal.
export function startDrawSegment(room: Room, totalCycles: number, guessScale = 1): boolean {
  if (!dealFreshState(room, totalCycles, guessScale)) {
    return false;
  }
  startDrawPhase(room, requireDrawState(room));
  return true;
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
  const dealt = state?.assignment.get(playerId);
  if (!state || !dealt) {
    return null; // never dealt into this game - nothing to show them
  }
  return {
    wordToDraw: dealt.words[dealt.targetIndex],
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
  console.log(
    `room ${room.code} draw:submit from ${playerId} - ${state.drawings.size}/${state.assignment.size} submitted`,
  );

  if (allConnectedParticipantsSubmitted(room, state)) {
    endDrawPhase(room.code);
  }
  return true;
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
  const dealt = state.assignment.get(drawerId);
  const image = state.drawings.get(drawerId);
  if (!drawer || !dealt || image === undefined) {
    // Defensive only - every id in `queue` came from `drawings`, whose keys
    // are exactly `assignment`'s, and players are never removed from
    // room.players. Skips rather than crashing the room if this ever did fire.
    advanceToNextGuessRoundOrGameOver(room, state);
    return;
  }

  const targetWord = dealt.words[dealt.targetIndex];
  const options = shuffled(dealt.words);
  state.currentOptions = options;
  state.currentCorrectIndex = options.indexOf(targetWord);
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
// QUESTION rounds use); the drawer earns a PROPORTION of eligible guessers
// who got it right (round(DRAWER_MAX_POINTS * correctGuessers /
// eligibleGuessers)), so the max per drawing is the same regardless of
// player count - it measures how clear the drawing was, not how many
// people showed up. `results` (built below from connected non-drawer
// players) IS the eligible-guesser set: it already excludes the drawer and
// anyone disconnected by reveal time.
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
    const pointsAwarded = calculatePoints(
      correct,
      recorded?.timeMs ?? GUESS_DURATION_MS,
      GUESS_DURATION_MS,
      state.guessScale,
    );
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

  // eligibleGuessers is `results.length`, not a fresh count - it must be
  // EXACTLY the set just scored above, or the proportion and the results
  // array could disagree. Guarded against 0 (every guesser disconnected
  // before reveal) so this can never divide by zero.
  const eligibleGuessers = results.length;
  const drawerPointsAwarded =
    eligibleGuessers > 0 ? Math.round((DRAWER_MAX_POINTS * correctGuessers) / eligibleGuessers) : 0;
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
  // Task 134 - in the full show this is not the end of the game but the end of
  // ONE stage, and the mode routes to whatever card follows. The hook is
  // absent in this mode itself, so a standalone drawing game ends here exactly
  // as it always has.
  if (modeForRoom(room).advanceAfterSegment?.(room)) {
    return;
  }
  room.phase = 'GAME_OVER';
  clearActiveTimer(room);
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
  const gameOverPayload = buildGameOver(room);
  io.to(room.code).emit(ServerEvents.GAME_OVER, gameOverPayload);
  console.log(`room ${room.code} draw game over - final standings: ${JSON.stringify(gameOverPayload.standings)}`);
}

// Exported since Task 134 - see QUIZ_CONTINUATIONS' note in quiz.ts.
export const DRAW_CONTINUATIONS: Record<DrawTimerKind, (room: Room) => void> = {
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
