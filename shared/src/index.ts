export const ClientEvents = {
  PING: 'client:ping',
  CREATE_ROOM: 'host:create_room',
  PLAYER_JOIN: 'player:join',
} as const;

export const ServerEvents = {
  PONG: 'server:pong',
  ERROR: 'server:error',
  ROOM_CREATED: 'room:created',
  PLAYER_JOINED: 'player:joined',
  JOIN_REJECTED: 'join:rejected',
} as const;

export type RoomCode = string;

export const MAX_PLAYERS = 8;
export const MAX_NAME_LENGTH = 12;

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

export type ClientToServerEvents = {
  [ClientEvents.PING]: (payload: ClientPingPayload) => void;
  [ClientEvents.CREATE_ROOM]: (payload: HostCreateRoomPayload) => void;
  [ClientEvents.PLAYER_JOIN]: (payload: PlayerJoinPayload) => void;
};

export type ServerToClientEvents = {
  [ServerEvents.PONG]: (payload: ServerPongPayload) => void;
  [ServerEvents.ERROR]: (payload: ServerErrorPayload) => void;
  [ServerEvents.ROOM_CREATED]: (payload: RoomCreatedPayload) => void;
  [ServerEvents.PLAYER_JOINED]: (payload: PlayerJoinedPayload) => void;
  [ServerEvents.JOIN_REJECTED]: (payload: JoinRejectedPayload) => void;
};
