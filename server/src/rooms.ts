import { MAX_NAME_LENGTH, MAX_PLAYERS, type GamePhase, type Player, type Question, type RoomCode } from '@game/shared';
import { getQuestions } from './questions.js';

export interface Room {
  code: RoomCode;
  hostSocketId: string;
  createdAt: number;
  players: Map<string, Player>; // keyed by playerId
  phase: GamePhase;
  questions: Question[];
  currentQuestionIndex: number; // -1 until the game starts
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
    questions: getQuestions(),
    currentQuestionIndex: -1,
  };

  rooms.set(code, room);
  return room;
}

export function getRoom(code: RoomCode): Room | undefined {
  return rooms.get(code);
}

export function deleteRoom(code: RoomCode): boolean {
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
