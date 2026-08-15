export const ClientEvents = {
  PING: 'client:ping',
  CREATE_ROOM: 'host:create_room',
  PLAYER_JOIN: 'player:join',
  START_GAME: 'host:start_game',
  SUBMIT_ANSWER: 'player:submit_answer',
} as const;

export const ServerEvents = {
  PONG: 'server:pong',
  ERROR: 'server:error',
  ROOM_CREATED: 'room:created',
  PLAYER_JOINED: 'player:joined',
  JOIN_REJECTED: 'join:rejected',
  LOBBY_UPDATE: 'lobby:update',
  QUESTION_SHOW: 'question:show',
  PHASE_CHANGED: 'phase:changed',
  ANSWER_ACCEPTED: 'answer:accepted',
  ANSWER_PROGRESS: 'answer:progress',
} as const;

export type RoomCode = string;

export const MAX_PLAYERS = 8;
export const MAX_NAME_LENGTH = 12;
export const MIN_PLAYERS = 2;
export const QUESTION_TIME_MS = 20000;

export interface ClientPingPayload {
  sentAt: number;
}

export interface ServerPongPayload {
  sentAt: number;
  serverTime: number;
}

export interface ServerErrorPayload {
  message: string;
}

export interface HostCreateRoomPayload {}

export interface RoomCreatedPayload {
  code: RoomCode;
}

export type JoinRejectedReason = 'ROOM_NOT_FOUND' | 'NAME_TAKEN' | 'ROOM_FULL' | 'INVALID_NAME';

export interface PlayerJoinPayload {
  code: RoomCode;
  name: string;
  playerId: string;
}

export interface PlayerJoinedPayload {
  playerId: string;
  name: string;
  code: RoomCode;
}

export interface JoinRejectedPayload {
  reason: JoinRejectedReason;
}

export interface Player {
  playerId: string;
  name: string;
  /** Changes on every reconnect - never use as identity. */
  socketId: string;
  connected: boolean;
}

/** Player as seen by clients - never includes socketId, which is server-internal only. */
export interface LobbyPlayer {
  playerId: string;
  name: string;
  connected: boolean;
}

export interface LobbyUpdatePayload {
  code: RoomCode;
  players: LobbyPlayer[];
  canStart: boolean;
}

export type GamePhase = 'LOBBY' | 'QUESTION' | 'REVEAL' | 'SCOREBOARD' | 'GAME_OVER';

export interface Question {
  id: string;
  category: string;
  question: string; // Greek
  options: string[]; // exactly 4, Greek
  correctIndex: number; // 0-3 - SERVER ONLY, never sent to clients
}

export interface HostStartGamePayload {}

export interface PhaseChangedPayload {
  phase: GamePhase;
}

// 'question:show' is asymmetric: the host gets the question text, players
// don't (they read it off the TV - the phone is a controller). Both shapes
// share the same event name, so clients narrow on the presence of `question`.
export interface QuestionShowHostPayload {
  questionIndex: number; // 0-based
  totalQuestions: number;
  question: string;
  options: string[];
  category: string;
}

export interface QuestionShowPlayerPayload {
  questionIndex: number;
  totalQuestions: number;
  options: string[];
  category: string;
}

export type QuestionShowPayload = QuestionShowHostPayload | QuestionShowPlayerPayload;

export function isQuestionShowHostPayload(payload: QuestionShowPayload): payload is QuestionShowHostPayload {
  return 'question' in payload;
}

export interface SubmitAnswerPayload {
  choice: number; // 0-3
}

export interface AnswerAcceptedPayload {
  choice: number;
}

export interface AnswerProgressPayload {
  answered: number;
  total: number;
  answeredPlayerIds: string[]; // so the TV can show WHO has answered - never the choice
}

export type ClientToServerEvents = {
  [ClientEvents.PING]: (payload: ClientPingPayload) => void;
  [ClientEvents.CREATE_ROOM]: (payload: HostCreateRoomPayload) => void;
  [ClientEvents.PLAYER_JOIN]: (payload: PlayerJoinPayload) => void;
  [ClientEvents.START_GAME]: (payload: HostStartGamePayload) => void;
  [ClientEvents.SUBMIT_ANSWER]: (payload: SubmitAnswerPayload) => void;
};

export type ServerToClientEvents = {
  [ServerEvents.PONG]: (payload: ServerPongPayload) => void;
  [ServerEvents.ERROR]: (payload: ServerErrorPayload) => void;
  [ServerEvents.ROOM_CREATED]: (payload: RoomCreatedPayload) => void;
  [ServerEvents.PLAYER_JOINED]: (payload: PlayerJoinedPayload) => void;
  [ServerEvents.JOIN_REJECTED]: (payload: JoinRejectedPayload) => void;
  [ServerEvents.LOBBY_UPDATE]: (payload: LobbyUpdatePayload) => void;
  [ServerEvents.QUESTION_SHOW]: (payload: QuestionShowPayload) => void;
  [ServerEvents.PHASE_CHANGED]: (payload: PhaseChangedPayload) => void;
  [ServerEvents.ANSWER_ACCEPTED]: (payload: AnswerAcceptedPayload) => void;
  [ServerEvents.ANSWER_PROGRESS]: (payload: AnswerProgressPayload) => void;
};
