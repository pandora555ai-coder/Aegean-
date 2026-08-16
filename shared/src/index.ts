export const ClientEvents = {
  PING: 'client:ping',
  CREATE_ROOM: 'host:create_room',
  HOST_REJOIN: 'host:rejoin',
  PLAYER_JOIN: 'player:join',
  VIP_START_GAME: 'vip:start_game',
  SUBMIT_ANSWER: 'player:submit_answer',
  VIP_NEXT: 'vip:next',
  VIP_PLAY_AGAIN: 'vip:play_again',
  VIP_UPDATE_SETTINGS: 'vip:update_settings',
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
  REVEAL_SHOW: 'reveal:show',
  SCOREBOARD_SHOW: 'scoreboard:show',
  GAME_OVER: 'game:over',
  STATE_SYNC: 'state:sync',
  VIP_CHANGED: 'vip:changed',
  SETTINGS_UPDATED: 'settings:updated',
} as const;

export type RoomCode = string;

export const MAX_PLAYERS = 8;
export const MAX_NAME_LENGTH = 12;
export const MIN_PLAYERS = 2;
export const BASE_POINTS = 1000;
export const SPEED_BONUS_MAX = 500;
export const REVEAL_DURATION_MS = 6000;
export const SCOREBOARD_DURATION_MS = 8000;

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

// Sent by the TV display to reattach to a room it believes it created
// earlier (from localStorage) - covers both a page refresh and the
// automatic socket.io reconnect after the underlying transport drops (e.g.
// a smart TV putting the browser to sleep). On success the server responds
// exactly like a fresh room:created followed by a state:sync for whatever
// phase the game is actually in; on failure (room no longer exists) it
// responds with server:error so the client clears its stored code.
export interface HostRejoinPayload {
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
  /** Initialised to 0 on join, preserved across reconnects. */
  score: number;
  /** Tied to playerId, not socketId - survives reconnects/refreshes. */
  isVip: boolean;
}

/** Player as seen by clients - never includes socketId, which is server-internal only. */
export interface LobbyPlayer {
  playerId: string;
  name: string;
  connected: boolean;
  isVip: boolean;
}

export interface LobbyUpdatePayload {
  code: RoomCode;
  players: LobbyPlayer[];
  canStart: boolean;
  settings: RoomSettings;
}

export type GamePhase = 'LOBBY' | 'QUESTION' | 'REVEAL' | 'SCOREBOARD' | 'GAME_OVER';

// A question's own intrinsic difficulty, as authored in the question bank.
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Question {
  id: string;
  category: string;
  difficulty: Difficulty;
  question: string; // Greek
  options: string[]; // exactly 4, Greek
  correctIndex: number; // 0-3 - SERVER ONLY, never sent to clients
}

// The PLAYER-FACING difficulty setting, distinct from a question's own
// `difficulty`. Maps to which question difficulties get drawn from:
//   'easy'   -> easy + medium
//   'normal' -> easy + medium + hard
//   'hard'   -> medium + hard
export type DifficultyMix = 'easy' | 'normal' | 'hard';
export const DIFFICULTY_MIX_OPTIONS: readonly DifficultyMix[] = ['easy', 'normal', 'hard'];

export const QUESTION_COUNT_OPTIONS = [10, 15, 20] as const;
export const QUESTION_TIME_OPTIONS_MS = [10000, 20000, 30000] as const;

export type RoomSettings = {
  questionCount: number;
  questionTimeMs: number;
  difficultyMix: DifficultyMix;
};

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  questionCount: 10,
  questionTimeMs: 20000,
  difficultyMix: 'normal',
};

// VIP -> server: only the fields being changed. Server -> room: the full,
// validated settings after applying (and possibly rejecting) that partial.
export type VipUpdateSettingsPayload = Partial<RoomSettings>;
export type SettingsUpdatedPayload = RoomSettings;

export interface VipStartGamePayload {}

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
  questionTimeMs: number; // the ROOM's configured per-question time, not a global
}

export interface QuestionShowPlayerPayload {
  questionIndex: number;
  totalQuestions: number;
  options: string[];
  category: string;
  questionTimeMs: number;
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

export interface RevealPlayerResult {
  playerId: string;
  name: string;
  choice: number | null; // null = did not answer
  correct: boolean;
  pointsAwarded: number;
  totalScore: number;
}

// 'reveal:show' is asymmetric, like 'question:show': the host sees every
// player's result, players only ever see their own.
export interface RevealHostPayload {
  correctIndex: number; // now safe to send - the question has ended
  correctOption: string;
  results: RevealPlayerResult[];
  answerCounts: number[]; // how many picked each option
  autoAdvanceMs: number; // so clients can render a progress bar
}

export interface RevealPlayerPayload {
  correctIndex: number;
  correctOption: string;
  yourChoice: number | null;
  yourCorrect: boolean;
  pointsAwarded: number;
  totalScore: number;
  rank: number; // current position, 1-based
  autoAdvanceMs: number;
}

export type RevealShowPayload = RevealHostPayload | RevealPlayerPayload;

export function isRevealHostPayload(payload: RevealShowPayload): payload is RevealHostPayload {
  return 'results' in payload;
}

export interface VipNextPayload {}

export interface ScoreboardStanding {
  playerId: string;
  name: string;
  score: number;
  rank: number; // tied scores share the same rank (1,1,3 - not 1,2,3)
  connected: boolean;
}

// Symmetric, unlike question:show / reveal:show - standings are public,
// that's the point of a scoreboard.
export interface ScoreboardPayload {
  standings: ScoreboardStanding[];
  questionIndex: number; // the question just completed, 0-based
  totalQuestions: number;
  isLastQuestion: boolean;
  autoAdvanceMs: number;
}

export interface VipPlayAgainPayload {}

// Broadcast to the whole room whenever VIP moves - either the first player
// claiming a vacant VIP slot, or a migration away from a disconnecting VIP.
export interface VipChangedPayload {
  playerId: string;
  name: string;
}

export interface GameOverStanding {
  playerId: string;
  name: string;
  score: number;
  rank: number;
}

export interface GameOverPayload {
  standings: GameOverStanding[];
  winnerName: string; // if tied, joined names: "Άννα & Μπάμπης"
  isTie: boolean;
  totalQuestions: number;
}

// Sent to a single socket right after it joins/reconnects, whenever the
// room isn't in LOBBY - lets a late joiner or a reconnecting phone jump
// straight to the correct current view instead of being stuck waiting.
// Discriminates on `phase`; QUESTION and REVEAL further discriminate on
// role using the same `isQuestionShowHostPayload` / `isRevealHostPayload`
// guards as their live counterparts, since they carry the identical shapes
// plus a couple of catch-up-only fields.
export interface StateSyncLobbyPayload {
  phase: 'LOBBY';
  code: RoomCode;
  players: LobbyPlayer[];
  canStart: boolean;
  settings: RoomSettings;
}

export type StateSyncQuestionHostPayload = QuestionShowHostPayload & {
  phase: 'QUESTION';
  remainingMs: number;
};

export type StateSyncQuestionPlayerPayload = QuestionShowPlayerPayload & {
  phase: 'QUESTION';
  remainingMs: number;
  yourChoice: number | null; // null if this player hasn't answered yet
};

export type StateSyncRevealHostPayload = RevealHostPayload & { phase: 'REVEAL' };
export type StateSyncRevealPlayerPayload = RevealPlayerPayload & { phase: 'REVEAL' };

export interface StateSyncScoreboardPayload extends ScoreboardPayload {
  phase: 'SCOREBOARD';
}

export interface StateSyncGameOverPayload extends GameOverPayload {
  phase: 'GAME_OVER';
}

export type StateSyncPayload =
  | StateSyncLobbyPayload
  | StateSyncQuestionHostPayload
  | StateSyncQuestionPlayerPayload
  | StateSyncRevealHostPayload
  | StateSyncRevealPlayerPayload
  | StateSyncScoreboardPayload
  | StateSyncGameOverPayload;

export type ClientToServerEvents = {
  [ClientEvents.PING]: (payload: ClientPingPayload) => void;
  [ClientEvents.CREATE_ROOM]: (payload: HostCreateRoomPayload) => void;
  [ClientEvents.HOST_REJOIN]: (payload: HostRejoinPayload) => void;
  [ClientEvents.PLAYER_JOIN]: (payload: PlayerJoinPayload) => void;
  [ClientEvents.VIP_START_GAME]: (payload: VipStartGamePayload) => void;
  [ClientEvents.SUBMIT_ANSWER]: (payload: SubmitAnswerPayload) => void;
  [ClientEvents.VIP_NEXT]: (payload: VipNextPayload) => void;
  [ClientEvents.VIP_PLAY_AGAIN]: (payload: VipPlayAgainPayload) => void;
  [ClientEvents.VIP_UPDATE_SETTINGS]: (payload: VipUpdateSettingsPayload) => void;
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
  [ServerEvents.REVEAL_SHOW]: (payload: RevealShowPayload) => void;
  [ServerEvents.SCOREBOARD_SHOW]: (payload: ScoreboardPayload) => void;
  [ServerEvents.GAME_OVER]: (payload: GameOverPayload) => void;
  [ServerEvents.STATE_SYNC]: (payload: StateSyncPayload) => void;
  [ServerEvents.VIP_CHANGED]: (payload: VipChangedPayload) => void;
  [ServerEvents.SETTINGS_UPDATED]: (payload: SettingsUpdatedPayload) => void;
};
