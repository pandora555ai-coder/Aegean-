import {
  type GamePhase,
  type Player,
  type Question,
  type RevealPlayerResult,
  type RoomCode,
  type RoomSettings,
  DEFAULT_ROOM_SETTINGS,
  DIFFICULTY_MIX_OPTIONS,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  QUESTION_COUNT_OPTIONS,
  QUESTION_TIME_OPTIONS_MS,
} from '@game/shared';
import { getQuestionSet } from './questions.js';
import { createGameMasterState, resetGameMasterState, type GameMasterState } from './gamemaster.js';

export interface RecordedAnswer {
  choice: number;
  timeMs: number;
}

// A snapshot of the last computed reveal, kept around so a player who
// reconnects mid-REVEAL can be caught up via state:sync without recomputing
// (or worse, re-scoring) anything.
export interface RevealSnapshot {
  correctIndex: number;
  correctOption: string;
  results: RevealPlayerResult[];
  answerCounts: number[];
  // Game Master (Task 24) - computed once, alongside the rest of this
  // snapshot, at the moment REVEAL begins - so a reconnecting host gets the
  // SAME line via state:sync, never a freshly (and differently) picked one.
  gmLine: string | null;
}

// A room is deleted only once it's been fully empty - no host/TV display
// AND no connected players - for this long. Reattaching either cancels it.
export const ROOM_TTL_MS = 300000; // 5 minutes

// The ONE shared timer mechanism behind the question timer, the REVEAL
// auto-advance, and the SCOREBOARD auto-advance - previously three ad-hoc
// setTimeout fields. Whichever phase-advancing timer is currently running
// (at most one at a time - a room is only ever in one phase) lives here.
export interface ActiveTimer {
  kind: 'QUESTION' | 'REVEAL' | 'SCOREBOARD';
  handle: NodeJS.Timeout | null;
  startedAt: number;
  durationMs: number;
  // Set only while paused: how much of `durationMs` was left when
  // pauseActiveTimer() froze it. null whenever the timer is actually
  // running (including right after a fresh arm).
  remainingAtPause: number | null;
}

export interface Room {
  code: RoomCode;
  // null when no TV/display is currently attached (e.g. it went to sleep) -
  // the game keeps running regardless; broadcasts to it are simply skipped
  // until a display reattaches via host:rejoin.
  hostSocketId: string | null;
  createdAt: number;
  players: Map<string, Player>; // keyed by playerId
  phase: GamePhase;
  questions: Question[];
  currentQuestionIndex: number; // -1 until the game starts
  answers: Map<string, RecordedAnswer>; // keyed by playerId, cleared every question
  // The speed-bonus reference point - kept SEPARATE from activeTimer
  // (which drives when the timer fires) because pausing adjusts these two
  // differently: activeTimer restarts its clock fresh from the remaining
  // duration, but questionStartedAt shifts FORWARD by the paused duration,
  // so elapsed "thinking time" for scoring never includes the break.
  questionStartedAt: number;
  // Whichever phase-advance timer (QUESTION/REVEAL/SCOREBOARD) is
  // currently running or frozen - null only in LOBBY/GAME_OVER.
  activeTimer: ActiveTimer | null;
  lastReveal: RevealSnapshot | null;
  settings: RoomSettings;
  vipPlayerId: string | null;
  // A boolean flag, not a GamePhase - the phase itself stays QUESTION/
  // REVEAL/SCOREBOARD throughout a pause, so no existing phase guard needs
  // to change. Only ever true during those three phases.
  paused: boolean;
  pausedByName: string | null;
  // Wall-clock moment the CURRENT pause began - needed to compute the
  // pause's own duration on resume, distinct from remainingAtPause (which
  // records how much of the TIMER was left, not how long the pause lasted).
  pausedAt: number | null;
  // Armed only while the room is fully empty (see refreshRoomTtl); cleared
  // the instant anyone (host display or player) reattaches.
  emptyTtlTimer: NodeJS.Timeout | null;
  // Game Master (Task 24) - per-player streak/rank/cooldown tracking plus
  // every line already used this game, so commentary never repeats itself
  // and never roasts the same player every single round.
  gameMaster: GameMasterState;
}

const rooms = new Map<RoomCode, Room>();

const CODE_LENGTH = 4;
const MAX_GENERATE_ATTEMPTS = 50;

export function generateRoomCode(): RoomCode {
  for (let attempt = 0; attempt < MAX_GENERATE_ATTEMPTS; attempt++) {
    const code = Math.floor(Math.random() * 10 ** CODE_LENGTH)
      .toString()
      .padStart(CODE_LENGTH, '0');

    if (!rooms.has(code)) {
      return code;
    }
  }

  throw new Error(`failed to generate a unique room code after ${MAX_GENERATE_ATTEMPTS} attempts`);
}

export function createRoom(hostSocketId: string): Room {
  const code = generateRoomCode();
  const room: Room = {
    code,
    hostSocketId,
    createdAt: Date.now(),
    players: new Map(),
    phase: 'LOBBY',
    // Nobody reads `questions` before the game actually starts - built for
    // real by buildRoomQuestions() on vip:start_game and vip:play_again, so
    // settings changes made while still in LOBBY never waste a shuffle.
    questions: [],
    currentQuestionIndex: -1,
    answers: new Map(),
    questionStartedAt: 0,
    activeTimer: null,
    lastReveal: null,
    settings: { ...DEFAULT_ROOM_SETTINGS },
    vipPlayerId: null,
    paused: false,
    pausedByName: null,
    pausedAt: null,
    emptyTtlTimer: null,
    gameMaster: createGameMasterState(),
  };

  rooms.set(code, room);
  return room;
}

export function getRoom(code: RoomCode): Room | undefined {
  return rooms.get(code);
}

export function deleteRoom(code: RoomCode): boolean {
  const room = rooms.get(code);
  if (room) {
    // No timer may fire against a room that no longer exists.
    if (room.activeTimer?.handle) {
      clearTimeout(room.activeTimer.handle);
    }
    if (room.emptyTtlTimer) {
      clearTimeout(room.emptyTtlTimer);
    }
  }
  return rooms.delete(code);
}

function isRoomFullyEmpty(room: Room): boolean {
  return room.hostSocketId === null && getConnectedPlayers(room).length === 0;
}

// Re-evaluates whether `room` should be scheduled for TTL deletion - call
// after ANY change to host-display attachment or player connectivity.
// Always clears any existing timer first, then reschedules only if the
// room is CURRENTLY fully empty, so reattaching anyone (host display or
// player) cancels a pending deletion for free.
export function refreshRoomTtl(room: Room): void {
  if (room.emptyTtlTimer) {
    clearTimeout(room.emptyTtlTimer);
    room.emptyTtlTimer = null;
  }
  if (isRoomFullyEmpty(room)) {
    room.emptyTtlTimer = setTimeout(() => {
      deleteRoom(room.code);
      console.log(
        `room ${room.code} deleted - empty (no host display, no connected players) for ${ROOM_TTL_MS}ms`,
      );
    }, ROOM_TTL_MS);
  }
}

// Attaches `socketId` as the room's host/TV display - used both when a room
// is first created and when a TV reconnects (host:rejoin) after
// sleeping/refreshing. "Replacing the old hostSocketId" is the point: the
// newest attacher always wins. Cancels any pending empty-room TTL.
export function attachHostDisplay(room: Room, socketId: string): void {
  room.hostSocketId = socketId;
  refreshRoomTtl(room);
}

// Detaches the host display WITHOUT deleting the room or touching the game
// in progress - the TV going to sleep must never end the game. May arm the
// empty-room TTL if no players are connected either.
export function detachHostDisplay(room: Room): void {
  room.hostSocketId = null;
  refreshRoomTtl(room);
}

// Arms a fresh timer for `kind`, replacing whatever was active before (its
// handle is cleared first, if any) - the ONE place any phase-advance timer
// gets created, whether that's a brand-new phase starting or (via
// resumeActiveTimer) a paused one picking back up.
export function armActiveTimer(
  room: Room,
  kind: ActiveTimer['kind'],
  durationMs: number,
  onFire: () => void,
): void {
  if (room.activeTimer?.handle) {
    clearTimeout(room.activeTimer.handle);
  }
  room.activeTimer = {
    kind,
    handle: setTimeout(onFire, durationMs),
    startedAt: Date.now(),
    durationMs,
    remainingAtPause: null,
  };
}

// Freezes the active timer without discarding it: clears the underlying
// setTimeout and records exactly how much time was left, clamped at >= 0.
// A no-op if there's no active timer.
export function pauseActiveTimer(room: Room): void {
  const timer = room.activeTimer;
  if (!timer) {
    return;
  }
  if (timer.handle) {
    clearTimeout(timer.handle);
    timer.handle = null;
  }
  const elapsed = Date.now() - timer.startedAt;
  timer.remainingAtPause = Math.max(0, timer.durationMs - elapsed);
}

// Resumes a frozen timer for EXACTLY its remaining time - never the full
// original duration. `onFire` must be the continuation appropriate for the
// timer's `kind` (endQuestion / advanceFromReveal / advanceFromScoreboard)
// - the caller picks it, since those live in index.ts and reach into `io`.
// A no-op if there's no timer, or it isn't actually paused.
export function resumeActiveTimer(room: Room, onFire: () => void): void {
  const timer = room.activeTimer;
  if (!timer || timer.remainingAtPause === null) {
    return;
  }
  const remaining = timer.remainingAtPause;
  timer.startedAt = Date.now();
  timer.durationMs = remaining;
  timer.remainingAtPause = null;
  timer.handle = setTimeout(onFire, remaining);
}

// How much time is left on the active timer RIGHT NOW - the frozen value
// while paused, or a live countdown against the server clock otherwise.
// The ONE source of truth for every remainingMs/autoAdvanceMs a client
// ever sees, replacing three separate ad-hoc computations (one each for
// QUESTION/REVEAL/SCOREBOARD).
export function remainingActiveTimerMs(room: Room): number {
  const timer = room.activeTimer;
  if (!timer) {
    return 0;
  }
  if (timer.remainingAtPause !== null) {
    return timer.remainingAtPause;
  }
  return Math.max(0, timer.durationMs - (Date.now() - timer.startedAt));
}

export function clearActiveTimer(room: Room): void {
  if (room.activeTimer?.handle) {
    clearTimeout(room.activeTimer.handle);
  }
  room.activeTimer = null;
}

// (Re)builds `room.questions` from the room's CURRENT settings - called on
// vip:start_game and vip:play_again (never eagerly at creation or on every
// settings tweak, since nobody reads it until the game is actually live).
export function buildRoomQuestions(room: Room): void {
  room.questions = getQuestionSet(room.settings.difficultyMix, room.settings.questionCount);
}

// Merges a VIP-supplied partial settings update into `room.settings`,
// validating every field against its allowed option list and silently
// IGNORING (not rejecting the whole update for) any field that isn't one
// of the allowed values - never trust the client. Returns the resulting
// settings (unchanged if nothing in the partial was valid).
export function updateRoomSettings(room: Room, partial: Partial<RoomSettings>): RoomSettings {
  if (partial.questionCount !== undefined && (QUESTION_COUNT_OPTIONS as readonly number[]).includes(partial.questionCount)) {
    room.settings.questionCount = partial.questionCount;
  }
  if (
    partial.questionTimeMs !== undefined &&
    (QUESTION_TIME_OPTIONS_MS as readonly number[]).includes(partial.questionTimeMs)
  ) {
    room.settings.questionTimeMs = partial.questionTimeMs;
  }
  if (partial.difficultyMix !== undefined && DIFFICULTY_MIX_OPTIONS.includes(partial.difficultyMix)) {
    room.settings.difficultyMix = partial.difficultyMix;
  }
  return room.settings;
}

export function getActiveRoomCount(): number {
  return rooms.size;
}

export function normalizePlayerName(name: string): string {
  return name.trim();
}

export function isValidPlayerName(name: string): boolean {
  const trimmed = normalizePlayerName(name);
  return trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH;
}

export function isNameTaken(room: Room, name: string): boolean {
  const normalized = normalizePlayerName(name).toLowerCase();
  for (const player of room.players.values()) {
    if (player.name.toLowerCase() === normalized) {
      return true;
    }
  }
  return false;
}

export function isRoomFull(room: Room): boolean {
  return room.players.size >= MAX_PLAYERS;
}

export function getConnectedPlayers(room: Room): Player[] {
  return Array.from(room.players.values()).filter((player) => player.connected);
}

// Identity-based, not a count comparison: answers.size === connectedPlayers
// .length can coincidentally match even when the *specific* players differ
// (e.g. two players disconnect at once - one who'd answered, one who
// hadn't - leaving a remaining connected player who never got to answer).
export function haveAllConnectedPlayersAnswered(room: Room): boolean {
  const connectedPlayers = getConnectedPlayers(room);
  return connectedPlayers.length > 0 && connectedPlayers.every((player) => room.answers.has(player.playerId));
}

export function isVip(room: Room, playerId: string): boolean {
  return room.vipPlayerId === playerId;
}

// Claims a vacant VIP slot for `player` - called on every player:join
// (fresh join AND reconnect), so it covers both "first player ever joins"
// and "everyone had left, vipPlayerId went null, someone (re)joins and
// picks it back up." A no-op if VIP is already held by anyone (including
// this same player), so it never overrides an existing holder.
export function claimVipIfVacant(room: Room, player: Player): void {
  if (room.vipPlayerId !== null) {
    return;
  }
  room.vipPlayerId = player.playerId;
  player.isVip = true;
}

// Moves VIP off `playerId` to the longest-connected remaining connected
// player - `room.players` is a Map, whose iteration order is insertion
// (original join) order and is unaffected by later reconnects (Map.set on
// an existing key updates the value in place, not its position), so the
// first currently-connected player in that order is exactly "whoever has
// been part of this room the longest and is still here." Returns the new
// VIP, or null if no connected player remains (vipPlayerId goes null, and
// the next joiner claims it via claimVipIfVacant). No-op (returns null) if
// `playerId` didn't hold VIP to begin with.
export function migrateVipAwayFrom(room: Room, playerId: string): Player | null {
  if (room.vipPlayerId !== playerId) {
    return null;
  }

  const formerVip = room.players.get(playerId);
  if (formerVip) {
    formerVip.isVip = false;
  }

  const nextVip = getConnectedPlayers(room)[0] ?? null;
  room.vipPlayerId = nextVip ? nextVip.playerId : null;
  if (nextVip) {
    nextVip.isVip = true;
  }
  return nextVip;
}

export function addPlayer(code: RoomCode, player: Player): void {
  const room = rooms.get(code);
  if (!room) {
    throw new Error(`cannot add player to unknown room ${code}`);
  }
  room.players.set(player.playerId, player);
}

export function getPlayer(code: RoomCode, playerId: string): Player | undefined {
  return rooms.get(code)?.players.get(playerId);
}

export function removePlayer(code: RoomCode, playerId: string): boolean {
  const room = rooms.get(code);
  if (!room) {
    return false;
  }
  return room.players.delete(playerId);
}

// Resets a finished game back to a fresh LOBBY - keeps every player (both
// connected and disconnected) with their playerId/name intact, so nobody
// has to rejoin for "play again".
export function resetRoomForNewGame(room: Room): void {
  room.phase = 'LOBBY';
  room.currentQuestionIndex = -1;
  room.answers.clear();
  clearActiveTimer(room);
  room.paused = false;
  room.pausedByName = null;
  room.pausedAt = null;
  room.lastReveal = null;
  // A fresh game means fresh commentary too - no streaks/cooldowns/used
  // lines carried over from the game that just ended.
  resetGameMasterState(room.gameMaster);
  // Settings PERSIST across play_again (room.settings is untouched) - the
  // VIP doesn't have to reconfigure every game, only the question SET gets
  // rebuilt (a fresh shuffle/draw against those same settings).
  buildRoomQuestions(room);
  for (const player of room.players.values()) {
    player.score = 0;
  }
}
