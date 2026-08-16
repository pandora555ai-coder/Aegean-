import {
  type DifficultyMix,
  type GamePhase,
  type Player,
  type Question,
  type RevealPlayerResult,
  type RoomCode,
  DEFAULT_DIFFICULTY_MIX,
  DEFAULT_QUESTION_COUNT,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
} from '@game/shared';
import { getQuestionSet } from './questions.js';

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
}

export interface Room {
  code: RoomCode;
  hostSocketId: string;
  createdAt: number;
  players: Map<string, Player>; // keyed by playerId
  phase: GamePhase;
  questions: Question[];
  currentQuestionIndex: number; // -1 until the game starts
  answers: Map<string, RecordedAnswer>; // keyed by playerId, cleared every question
  questionStartedAt: number;
  questionTimer: NodeJS.Timeout | null;
  // Auto-advance timer for REVEAL -> SCOREBOARD -> next question/GAME_OVER.
  // Reused across both phases since a room is only ever in one at a time.
  phaseTimer: NodeJS.Timeout | null;
  phaseTimerStartedAt: number; // when the current phaseTimer was armed
  lastReveal: RevealSnapshot | null;
  difficultyMix: DifficultyMix;
  questionCount: number;
  vipPlayerId: string | null;
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
  const difficultyMix = DEFAULT_DIFFICULTY_MIX;
  const questionCount = DEFAULT_QUESTION_COUNT;
  const room: Room = {
    code,
    hostSocketId,
    createdAt: Date.now(),
    players: new Map(),
    phase: 'LOBBY',
    questions: getQuestionSet(difficultyMix, questionCount),
    currentQuestionIndex: -1,
    answers: new Map(),
    questionStartedAt: 0,
    questionTimer: null,
    phaseTimer: null,
    phaseTimerStartedAt: 0,
    lastReveal: null,
    difficultyMix,
    questionCount,
    vipPlayerId: null,
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
    if (room.questionTimer) {
      clearTimeout(room.questionTimer);
    }
    if (room.phaseTimer) {
      clearTimeout(room.phaseTimer);
    }
  }
  return rooms.delete(code);
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
  if (room.questionTimer) {
    clearTimeout(room.questionTimer);
    room.questionTimer = null;
  }
  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }
  room.phaseTimerStartedAt = 0;
  room.lastReveal = null;
  room.questions = getQuestionSet(room.difficultyMix, room.questionCount);
  for (const player of room.players.values()) {
    player.score = 0;
  }
}
