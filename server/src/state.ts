import {
  type CrowdMood,
  type GamePhase,
  type Player,
  type PowerUpEffect,
  type Question,
  type RevealPlayerResult,
  type RoomCode,
  type RoomSettings,
  type SabotageEffect,
  type StealResolvedPayload,
  DEFAULT_ROOM_SETTINGS,
  DIFFICULTY_MIX_OPTIONS,
  GAME_LENGTH_OPTIONS,
  MAX_PLAYERS,
  QUESTION_TIME_OPTIONS_MS,
  sanitizeCustomName,
  totalQuestionsForLength,
} from '@game/shared';
import { getQuestionSet } from './questions.js';
import { createSocratesState, resetSocratesState, type SocratesState } from './socrates.js';
import { AVAILABLE_AVATAR_IDS } from './avatars.js';
import { clearActiveTimer, clearSimpleTimer, type ActiveTimer, type SimpleTimer } from './timers.js';

export interface RecordedAnswer {
  choice: number;
  timeMs: number;
}

// A sabotage that has actually LANDED on someone (Task 28b). Kept for the
// whole question so a reconnecting victim is re-served the same effect with
// its REMAINING time, and dropped when the next question starts.
export interface AppliedSabotage {
  effect: SabotageEffect;
  // The wall-clock moment it landed - always the question's own
  // questionStartedAt, since an effect only ever starts with its question.
  startedAt: number;
  // Already clamped to `questionTimeMs` below, so an effect can never
  // outlive - let alone extend - the round it landed in. For ice this is
  // also where STACKING shows up (capped at MAX_ICE_STACK_MS).
  durationMs: number;
  // Stacking (Task 31a) - how many instances have been folded in along the
  // INTENSITY axis. >1 only for ink; ice stacks in durationMs instead.
  intensity: number;
  // The full length of the question it landed in, kept so remaining time can
  // be derived from the shared timer helper (which is what pause freezes)
  // rather than from a raw Date.now() that would keep ticking through one.
  questionTimeMs: number;
}

// One phone's POWER_UP choice (Task 30a): the effect THEY picked - the
// server never picks one here - and who they aimed it at. Names are captured
// at choice time so a later disconnect can't blank them out.
export interface PowerUpChoice {
  casterPlayerId: string;
  casterName: string;
  targetPlayerId: string;
  targetName: string;
  effect: PowerUpEffect;
}

// The STEAL phase in flight (Task 32) - null outside it. Everything a
// steal:show/state:sync needs lives here, so a reconnecting phone is told
// whether IT is the thief straight from server state rather than from
// anything the client remembered. `resolved` is what turns the phase from
// "the thief is picking" into "the TV is announcing the theft"; it is set
// exactly once, by resolveSteal, which is also what moves the points.
export interface StealState {
  thiefPlayerId: string;
  thiefName: string;
  thiefAvatarId: string;
  // Earned by the thief's answer SPEED, computed once when the phase begins -
  // the attempt, before the clamp to whatever the victim actually has.
  amount: number;
  chosenTargetPlayerId: string | null;
  resolved: StealResolvedPayload | null;
}

// A snapshot of the last computed reveal, kept around so a player who
// reconnects mid-REVEAL can be caught up via state:sync without recomputing
// (or worse, re-scoring) anything.
export interface RevealSnapshot {
  correctIndex: number;
  correctOption: string;
  results: RevealPlayerResult[];
  answerCounts: number[];
  // Socrates (Task 24, renamed Task 37a) - computed once, alongside the
  // rest of this snapshot, at the moment REVEAL begins - so a reconnecting
  // host gets the SAME line via state:sync, never a freshly (and
  // differently) picked one.
  socratesLine: string | null;
  // The same line's raw template (Task 42b) - carried alongside `socratesLine`
  // purely so the client can hash it to find this line's audio file; never
  // shown on screen itself.
  socratesLineTemplate: string | null;
}

// A room is deleted only once it's been fully empty - no host/TV display
// AND no connected players - for this long. Reattaching either cancels it.
export const ROOM_TTL_MS = 300000; // 5 minutes

export interface Room {
  code: RoomCode;
  // null when no TV/display is currently attached (e.g. it went to sleep) -
  // the game keeps running regardless; broadcasts to it are simply skipped
  // until a display reattaches via host:rejoin.
  hostSocketId: string | null;
  createdAt: number;
  players: Map<string, Player>; // keyed by playerId
  phase: GamePhase;
  // Stages (Task 31a) - which stage of the STAGES table the game is currently
  // in, 1-based; 0 before the game starts. Server-authoritative and derived
  // from currentQuestionIndex (see syncStage in phases.ts) - it exists as a
  // field only so the "has the stage CHANGED" edge is detectable, which is
  // what keeps the TV's stage announcement to exactly once per stage.
  stage: number;
  questions: Question[];
  currentQuestionIndex: number; // -1 until the game starts
  answers: Map<string, RecordedAnswer>; // keyed by playerId, cleared every question
  // The speed-bonus reference point - kept SEPARATE from activeTimer
  // (which drives when the timer fires) because pausing adjusts these two
  // differently: activeTimer restarts its clock fresh from the remaining
  // duration, but questionStartedAt shifts FORWARD by the paused duration,
  // so elapsed "thinking time" for scoring never includes the break.
  questionStartedAt: number;
  // Whichever phase-advance timer (QUESTION/REVEAL/STEAL/...) is
  // currently running or frozen - null only in LOBBY/GAME_OVER.
  activeTimer: ActiveTimer | null;
  lastReveal: RevealSnapshot | null;
  settings: RoomSettings;
  vipPlayerId: string | null;
  // A boolean flag, not a GamePhase - the phase itself stays QUESTION/
  // REVEAL/STEAL throughout a pause, so no existing phase guard needs
  // to change.
  paused: boolean;
  pausedByName: string | null;
  // Wall-clock moment the CURRENT pause began - needed to compute the
  // pause's own duration on resume, distinct from remainingAtPause (which
  // records how much of the TIMER was left, not how long the pause lasted).
  pausedAt: number | null;
  // Armed only while the room is fully empty (see refreshRoomTtl); cleared
  // the instant anyone (host display or player) reattaches.
  emptyTtlTimer: NodeJS.Timeout | null;
  // Socrates (Task 24, renamed Task 37a) - per-player streak/rank/cooldown
  // tracking plus every line already used this game, so commentary never
  // repeats itself and never roasts the same player every single round.
  socrates: SocratesState;
  // Sabotage (Task 28b) - what is actually running RIGHT NOW, keyed by
  // targetPlayerId. Only ever populated during QUESTION, and rebuilt from
  // scratch at the start of every one. A LIST since Task 31a: at most one
  // entry per EFFECT (stacking folds instances together - see
  // addAppliedSabotage in sabotage.ts), but a player can be under an ice and
  // an ink simultaneously.
  activeSabotageByTarget: Map<string, AppliedSabotage[]>;
  // Sabotage (Task 28c) - the option order the victim of a 'shuffle' is
  // seeing THIS question, keyed by targetPlayerId. permutation[displayIndex]
  // = canonicalIndex, i.e. what the phone shows in slot 0 is really the
  // question's option number permutation[0]. Read (never regenerated) on
  // every later broadcast/state:sync, so a mid-question reconnect gets the
  // same order back. Canonical order is what the TV always shows; this map
  // is the only place the victim's order exists. Cleared at REVEAL.
  shuffledOptionsByTarget: Map<string, number[]>;
  // Choices made during POWER_UP, keyed by casterPlayerId - hidden from
  // everyone but their own caster until they LAND on the next question.
  // Emptied into pendingPowerUpByTarget the instant the phase ends.
  powerUpChoices: Map<string, PowerUpChoice>;
  // A power-up lands on the very next question. Keyed by targetPlayerId, and
  // consumed - cleared - by applyPendingPowerUps when that question starts.
  // A LIST of choices per target since Task 31a: in stage 2
  // the whole room chooses every round, so several players piling onto one
  // victim is the normal case and every one of them must STACK rather than
  // the last one silently winning.
  pendingPowerUpByTarget: Map<string, PowerUpChoice[]>;
  // Steal (Task 32) - the STEAL phase currently in flight, null outside it.
  // Set by startSteal, read by every steal payload builder, cleared the
  // moment the phase is left.
  steal: StealState | null;
  // Crowd mood (Task 35) - server-derived, HOST ONLY. See server/src/crowd.ts.
  crowdMood: CrowdMood;
  // The mid-QUESTION timer that switches crowdMood to 'tension' for the last
  // third of the question - runs ALONGSIDE activeTimer (which stays 'QUESTION'
  // the whole time), so it has its own SimpleTimer rather than sharing the
  // room's single activeTimer slot. null outside QUESTION.
  crowdTensionTimer: SimpleTimer | null;
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
    stage: 0, // no stage until the first question is entered
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
    socrates: createSocratesState(),
    activeSabotageByTarget: new Map(),
    shuffledOptionsByTarget: new Map(),
    powerUpChoices: new Map(),
    pendingPowerUpByTarget: new Map(),
    steal: null,
    crowdMood: 'calm',
    crowdTensionTimer: null,
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
    clearSimpleTimer(room.crowdTensionTimer);
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

// (Re)builds `room.questions` from the room's CURRENT settings - called on
// vip:start_game and vip:play_again (never eagerly at creation or on every
// settings tweak, since nobody reads it until the game is actually live).
// HOW MANY is not a setting of its own (Task 31a/33): the stage table decides
// it, gated by how many of those stages the VIP's gameLength setting includes.
export function buildRoomQuestions(room: Room): void {
  room.questions = getQuestionSet(room.settings.difficultyMix, totalQuestionsForLength(room.settings.gameLength));
}

// Merges a VIP-supplied partial settings update into `room.settings`,
// validating every field against its allowed option list and silently
// IGNORING (not rejecting the whole update for) any field that isn't one
// of the allowed values - never trust the client. Returns the resulting
// settings (unchanged if nothing in the partial was valid).
export function updateRoomSettings(room: Room, partial: Partial<RoomSettings>): RoomSettings {
  if (
    partial.questionTimeMs !== undefined &&
    (QUESTION_TIME_OPTIONS_MS as readonly number[]).includes(partial.questionTimeMs)
  ) {
    room.settings.questionTimeMs = partial.questionTimeMs;
  }
  if (partial.difficultyMix !== undefined && DIFFICULTY_MIX_OPTIONS.includes(partial.difficultyMix)) {
    room.settings.difficultyMix = partial.difficultyMix;
  }
  if (partial.gameLength !== undefined && GAME_LENGTH_OPTIONS.includes(partial.gameLength)) {
    room.settings.gameLength = partial.gameLength;
  }
  return room.settings;
}

export function getActiveRoomCount(): number {
  return rooms.size;
}

// A preset-list pick already IS clean Greek text, so running it through the
// same sanitizer as a free-typed name is a no-op for it - this is
// deliberately the ONE validation path for both, never trusting a client
// claim of "this came from the preset list" over what the string actually
// contains.
export function normalizePlayerName(name: string): string {
  return sanitizeCustomName(name);
}

export function isValidPlayerName(name: string): boolean {
  return normalizePlayerName(name).length > 0;
}

export function isRoomFull(room: Room): boolean {
  return room.players.size >= MAX_PLAYERS;
}

// Avatars are unique PER ROOM, checked against every player who has ever
// occupied a seat (connected or not) - not just currently-connected ones,
// so a disconnected player's avatar can never be stolen out from under them
// while they're offline (they keep it on reconnect, per spec).
// `excludePlayerId` lets a reconnecting player's OWN existing seat be
// ignored when re-validating (irrelevant today, since reconnects never
// re-run this check at all - see player:join in index.ts - but keeps this
// helper correct/reusable regardless of caller).
export function isAvatarTaken(room: Room, avatarId: string, excludePlayerId?: string): boolean {
  for (const player of room.players.values()) {
    if (player.playerId !== excludePlayerId && player.avatarId === avatarId) {
      return true;
    }
  }
  return false;
}

// True once every AVAILABLE avatar (see server/src/avatars.ts) is already
// claimed by someone in this room - the signal used to relax strict
// uniqueness (see player:join in index.ts) so an Nth player past the
// available-avatar count is never blocked from joining, just handed a
// duplicate. With MAX_PLAYERS=8 and only 7 avatar images shipped so far,
// this is the room's normal, expected 8th-player state, not an edge case.
export function allAvailableAvatarsTaken(room: Room, excludePlayerId?: string): boolean {
  const taken = new Set<string>();
  for (const player of room.players.values()) {
    if (player.playerId !== excludePlayerId) {
      taken.add(player.avatarId);
    }
  }
  for (const id of AVAILABLE_AVATAR_IDS) {
    if (!taken.has(id)) {
      return false;
    }
  }
  return true;
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

// Power-up (Task 30a) - identity-based for exactly the same reason as
// haveAllConnectedPlayersAnswered above: a bare size comparison can match
// while the specific players differ. Whoever is connected RIGHT NOW is who
// the phase waits for, so a chooser disconnecting doesn't hold it open and a
// non-chooser disconnecting ends it early.
export function haveAllConnectedPlayersChosenPowerUp(room: Room): boolean {
  const connectedPlayers = getConnectedPlayers(room);
  return connectedPlayers.length > 0 && connectedPlayers.every((player) => room.powerUpChoices.has(player.playerId));
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
  // Back to "no stage" so the next game announces stage 1 again from scratch.
  room.stage = 0;
  room.currentQuestionIndex = -1;
  room.answers.clear();
  clearActiveTimer(room);
  room.paused = false;
  room.pausedByName = null;
  room.pausedAt = null;
  room.lastReveal = null;
  // A fresh game means fresh commentary too - no streaks/cooldowns/used
  // lines carried over from the game that just ended.
  resetSocratesState(room.socrates);
  room.activeSabotageByTarget.clear();
  room.shuffledOptionsByTarget.clear();
  // No unspent power-up choice carries over from the game that just ended.
  room.powerUpChoices.clear();
  room.pendingPowerUpByTarget.clear();
  // No half-finished theft survives into the next game.
  room.steal = null;
  // Fresh game, fresh crowd - back to calm, and no leftover tension timer
  // from whatever question was in flight when this reset was triggered.
  room.crowdMood = 'calm';
  clearSimpleTimer(room.crowdTensionTimer);
  room.crowdTensionTimer = null;
  // Settings PERSIST across play_again (room.settings is untouched) - the
  // VIP doesn't have to reconfigure every game, only the question SET gets
  // rebuilt (a fresh shuffle/draw against those same settings).
  buildRoomQuestions(room);
  for (const player of room.players.values()) {
    player.score = 0;
  }
}
