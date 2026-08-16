import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { Server, type Socket } from 'socket.io';
import {
  ClientEvents,
  MIN_PLAYERS,
  QUESTION_TIME_MS,
  REVEAL_DURATION_MS,
  SCOREBOARD_DURATION_MS,
  ServerEvents,
  type AnswerProgressPayload,
  type ClientToServerEvents,
  type GameOverPayload,
  type GameOverStanding,
  type LobbyPlayer,
  type LobbyUpdatePayload,
  type Player,
  type QuestionShowHostPayload,
  type QuestionShowPlayerPayload,
  type RevealHostPayload,
  type RevealPlayerPayload,
  type RevealPlayerResult,
  type RoomCode,
  type ScoreboardPayload,
  type ScoreboardStanding,
  type ServerToClientEvents,
  type StateSyncPayload,
  type VipChangedPayload,
} from '@game/shared';
import {
  addPlayer,
  claimVipIfVacant,
  createRoom,
  deleteRoom,
  getActiveRoomCount,
  getConnectedPlayers,
  haveAllConnectedPlayersAnswered,
  getPlayer,
  getRoom,
  isNameTaken,
  isRoomFull,
  isValidPlayerName,
  isVip,
  migrateVipAwayFrom,
  normalizePlayerName,
  resetRoomForNewGame,
  type Room,
} from './rooms.js';
import { calculatePoints } from './scoring.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isProduction = process.env.NODE_ENV === 'production';
const PRODUCTION_ORIGIN = 'https://demboyz11.duckdns.org';
// Permissive in dev (any origin - useful for testing from a phone on the
// LAN against the Vite dev server); locked to the real domain in prod.
const corsOptions = { origin: isProduction ? PRODUCTION_ORIGIN : true };

const app = express();
app.use(cors(corsOptions));

if (isProduction) {
  // In production, Caddy proxies both the built client and the API through
  // this same process, so Express also serves the static build - with an
  // SPA fallback so a direct load or refresh of e.g. /play doesn't 404.
  const clientDistPath = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    // Never let the fallback intercept Socket.IO's own HTTP endpoints.
    if (req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: corsOptions,
});

// socket.id -> the single room/role a socket is currently associated with
// (either hosting a room, or joined as a player in one).
type SocketAssociation =
  | { role: 'host'; code: RoomCode }
  | { role: 'player'; code: RoomCode; playerId: string };

const socketAssociationBySocketId = new Map<string, SocketAssociation>();

function buildLobbyUpdate(code: RoomCode): LobbyUpdatePayload | null {
  const room = getRoom(code);
  if (!room) {
    return null;
  }

  const players: LobbyPlayer[] = Array.from(room.players.values()).map((player) => ({
    playerId: player.playerId,
    name: player.name,
    connected: player.connected,
    isVip: player.playerId === room.vipPlayerId,
  }));
  const canStart = players.filter((player) => player.connected).length >= MIN_PLAYERS;

  return { code, players, canStart };
}

function broadcastLobbyUpdate(code: RoomCode): void {
  const payload = buildLobbyUpdate(code);
  if (payload) {
    io.to(code).emit(ServerEvents.LOBBY_UPDATE, payload);
  }
}

// Tied scores share the same rank (1,1,3 - not 1,2,3): the "competition
// ranking" convention, where a rank equals 1 + the number of players
// strictly ahead of it.
function computeCompetitionRanks<T>(
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

// How much of the current REVEAL/SCOREBOARD auto-advance window is left,
// computed from the server's own clock - used both for the fresh emission
// (where it's ~the full duration) and for catching a reconnecting player up
// via state:sync (where it's whatever's actually left).
function remainingPhaseMs(room: Room, durationMs: number): number {
  return Math.max(0, durationMs - (Date.now() - room.phaseTimerStartedAt));
}

// Reads room.lastReveal (set once, at the moment REVEAL begins) rather than
// recomputing anything, so these can be reused identically for the fresh
// broadcast and for a later state:sync catch-up.
function buildRevealHostPayload(room: Room): RevealHostPayload | null {
  if (!room.lastReveal) {
    return null;
  }
  return {
    correctIndex: room.lastReveal.correctIndex,
    correctOption: room.lastReveal.correctOption,
    results: room.lastReveal.results,
    answerCounts: room.lastReveal.answerCounts,
    autoAdvanceMs: remainingPhaseMs(room, REVEAL_DURATION_MS),
  };
}

function buildRevealPlayerPayload(room: Room, playerId: string): RevealPlayerPayload | null {
  if (!room.lastReveal) {
    return null;
  }
  const autoAdvanceMs = remainingPhaseMs(room, REVEAL_DURATION_MS);
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
  };
}

function startQuestion(room: Room): void {
  room.answers.clear();
  room.questionStartedAt = Date.now();
  if (room.questionTimer) {
    clearTimeout(room.questionTimer);
  }
  room.questionTimer = setTimeout(() => endQuestion(room.code), QUESTION_TIME_MS);

  const question = room.questions[room.currentQuestionIndex];
  const totalQuestions = room.questions.length;

  const hostPayload: QuestionShowHostPayload = {
    questionIndex: room.currentQuestionIndex,
    totalQuestions,
    question: question.question,
    options: question.options,
    category: question.category,
  };
  io.to(room.hostSocketId).emit(ServerEvents.QUESTION_SHOW, hostPayload);

  const playerPayload: QuestionShowPlayerPayload = {
    questionIndex: room.currentQuestionIndex,
    totalQuestions,
    options: question.options,
    category: question.category,
  };
  for (const player of getConnectedPlayers(room)) {
    io.to(player.socketId).emit(ServerEvents.QUESTION_SHOW, playerPayload);
  }

  console.log(`room ${room.code} started — question ${room.currentQuestionIndex + 1}/${totalQuestions}`);
}

// Ends the current question exactly once - guarded by the phase check, so
// whichever of (all connected players answered) / (timer fired) happens
// first wins, and the timer is always cleared so it can never fire twice.
function endQuestion(code: RoomCode): void {
  const room = getRoom(code);
  if (!room || room.phase !== 'QUESTION') {
    return;
  }

  if (room.questionTimer) {
    clearTimeout(room.questionTimer);
    room.questionTimer = null;
  }

  const question = room.questions[room.currentQuestionIndex];
  const connectedPlayers = getConnectedPlayers(room);

  const results: RevealPlayerResult[] = connectedPlayers.map((player) => {
    const recorded = room.answers.get(player.playerId);
    const choice = recorded ? recorded.choice : null;
    const correct = choice === question.correctIndex;
    const pointsAwarded = calculatePoints(correct, recorded?.timeMs ?? QUESTION_TIME_MS, QUESTION_TIME_MS);
    player.score += pointsAwarded;

    return {
      playerId: player.playerId,
      name: player.name,
      choice,
      correct,
      pointsAwarded,
      totalScore: player.score,
    };
  });

  const answerCounts = [0, 0, 0, 0];
  for (const result of results) {
    if (result.choice !== null) {
      answerCounts[result.choice] += 1;
    }
  }

  const correctOption = question.options[question.correctIndex];

  room.phase = 'REVEAL';
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });

  // Snapshot + timestamp so a player who reconnects mid-REVEAL can be
  // caught up via state:sync without recomputing (or re-scoring) anything.
  room.phaseTimerStartedAt = Date.now();
  room.lastReveal = { correctIndex: question.correctIndex, correctOption, results, answerCounts };

  const hostPayload = buildRevealHostPayload(room);
  if (hostPayload) {
    io.to(room.hostSocketId).emit(ServerEvents.REVEAL_SHOW, hostPayload);
  }

  for (const result of results) {
    const player = room.players.get(result.playerId);
    if (!player) {
      continue;
    }
    const playerPayload = buildRevealPlayerPayload(room, result.playerId);
    if (playerPayload) {
      io.to(player.socketId).emit(ServerEvents.REVEAL_SHOW, playerPayload);
    }
  }

  console.log(
    `room ${room.code} question ${room.currentQuestionIndex + 1} revealed — correctIndex=${question.correctIndex} results: ${JSON.stringify(results)}`,
  );

  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
  }
  room.phaseTimer = setTimeout(() => advanceFromReveal(room.code), REVEAL_DURATION_MS);
}

function buildScoreboard(room: Room): ScoreboardPayload {
  const players = [...room.players.values()];
  const ranks = computeCompetitionRanks(
    players,
    (player) => player.score,
    (player) => player.playerId,
  );

  const standings: ScoreboardStanding[] = [...players]
    .sort((a, b) => b.score - a.score)
    .map((player) => ({
      playerId: player.playerId,
      name: player.name,
      score: player.score,
      rank: ranks.get(player.playerId) ?? players.length,
      connected: player.connected,
    }));

  return {
    standings,
    questionIndex: room.currentQuestionIndex,
    totalQuestions: room.questions.length,
    isLastQuestion: room.currentQuestionIndex >= room.questions.length - 1,
    autoAdvanceMs: remainingPhaseMs(room, SCOREBOARD_DURATION_MS),
  };
}

function buildGameOver(room: Room): GameOverPayload {
  const players = [...room.players.values()];
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

// Ends REVEAL exactly once - guarded by the phase check, so whichever of
// (the auto-advance timer firing) / (host clicking "skip") happens first
// wins, and the timer is always cleared so it can never fire twice.
function advanceFromReveal(code: RoomCode): void {
  const room = getRoom(code);
  if (!room || room.phase !== 'REVEAL') {
    return;
  }

  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }

  room.phase = 'SCOREBOARD';
  room.phaseTimerStartedAt = Date.now();
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
  io.to(room.code).emit(ServerEvents.SCOREBOARD_SHOW, buildScoreboard(room));
  console.log(`room ${room.code} showing scoreboard after question ${room.currentQuestionIndex + 1}`);

  room.phaseTimer = setTimeout(() => advanceFromScoreboard(room.code), SCOREBOARD_DURATION_MS);
}

// Same one-shot discipline as advanceFromReveal.
function advanceFromScoreboard(code: RoomCode): void {
  const room = getRoom(code);
  if (!room || room.phase !== 'SCOREBOARD') {
    return;
  }

  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }

  const isLastQuestion = room.currentQuestionIndex >= room.questions.length - 1;
  if (isLastQuestion) {
    room.phase = 'GAME_OVER';
    io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
    const gameOverPayload = buildGameOver(room);
    io.to(room.code).emit(ServerEvents.GAME_OVER, gameOverPayload);
    console.log(`room ${room.code} game over — final standings: ${JSON.stringify(gameOverPayload.standings)}`);
    return;
  }

  room.currentQuestionIndex += 1;
  room.phase = 'QUESTION';
  io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
  startQuestion(room);
}

// Catches a single player up to whatever's currently happening in the room -
// used right after a join/reconnect when phase !== 'LOBBY', so nobody is
// ever stuck looking at a stale waiting view.
function buildStateSyncForPlayer(room: Room, playerId: string): StateSyncPayload | null {
  switch (room.phase) {
    case 'QUESTION': {
      const question = room.questions[room.currentQuestionIndex];
      const remainingMs = Math.max(0, room.questionStartedAt + QUESTION_TIME_MS - Date.now());
      const recorded = room.answers.get(playerId);
      return {
        phase: 'QUESTION',
        questionIndex: room.currentQuestionIndex,
        totalQuestions: room.questions.length,
        options: question.options,
        category: question.category,
        remainingMs,
        yourChoice: recorded ? recorded.choice : null,
      };
    }
    case 'REVEAL': {
      const payload = buildRevealPlayerPayload(room, playerId);
      return payload ? { ...payload, phase: 'REVEAL' } : null;
    }
    case 'SCOREBOARD':
      return { ...buildScoreboard(room), phase: 'SCOREBOARD' };
    case 'GAME_OVER':
      return { ...buildGameOver(room), phase: 'GAME_OVER' };
    default:
      return null; // LOBBY - callers never ask for this
  }
}

// Authorises a vip:* event: the emitting socket must be a connected PLAYER
// (never the TV/host socket, which has no playerId at all) whose playerId
// is the room's current vipPlayerId. Logs and returns null on any failure
// so every vip:* handler gets identical, one-line rejection behaviour.
function getVipRoomForSocket(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  eventName: string,
): Room | null {
  const association = socketAssociationBySocketId.get(socket.id);
  if (!association || association.role !== 'player') {
    console.log(`rejected ${eventName} from ${socket.id}: not a player`);
    return null;
  }

  const room = getRoom(association.code);
  if (!room) {
    console.log(`rejected ${eventName} from ${socket.id}: room ${association.code} not found`);
    return null;
  }

  if (!isVip(room, association.playerId)) {
    console.log(`rejected ${eventName} from ${socket.id}: player ${association.playerId} is not VIP in room ${room.code}`);
    return null;
  }

  return room;
}

io.on('connection', (socket) => {
  console.log(`client connected: ${socket.id}`);

  socket.on(ClientEvents.PING, (payload) => {
    console.log(`received ${ClientEvents.PING} from ${socket.id}: sentAt=${payload.sentAt}`);
    socket.emit(ServerEvents.PONG, {
      sentAt: payload.sentAt,
      serverTime: Date.now(),
    });
  });

  socket.on(ClientEvents.CREATE_ROOM, () => {
    const room = createRoom(socket.id);
    socketAssociationBySocketId.set(socket.id, { role: 'host', code: room.code });
    socket.join(room.code);
    socket.emit(ServerEvents.ROOM_CREATED, { code: room.code });
    console.log(`room ${room.code} created by ${socket.id}`);
    console.log(`active room count: ${getActiveRoomCount()}`);
  });

  socket.on(ClientEvents.PLAYER_JOIN, (payload) => {
    const { code, name, playerId } = payload;

    const room = getRoom(code);
    if (!room) {
      socket.emit(ServerEvents.JOIN_REJECTED, { reason: 'ROOM_NOT_FOUND' });
      return;
    }

    if (!isValidPlayerName(name)) {
      socket.emit(ServerEvents.JOIN_REJECTED, { reason: 'INVALID_NAME' });
      return;
    }

    // Same playerId already in this room -> reconnect, not a new join.
    // The original name is kept, and this bypasses ROOM_FULL / NAME_TAKEN:
    // the player already occupies a seat and can't clash with their own name.
    const existingPlayer = getPlayer(code, playerId);
    if (existingPlayer) {
      existingPlayer.socketId = socket.id;
      existingPlayer.connected = true;
      // Only matters if VIP had gone vacant (everyone left, then this
      // player was first back) - a no-op if VIP is already held, so a
      // former VIP reconnecting after someone else took over does NOT
      // reclaim it here.
      claimVipIfVacant(room, existingPlayer);
      socketAssociationBySocketId.set(socket.id, { role: 'player', code, playerId });
      socket.join(code);
      socket.emit(ServerEvents.PLAYER_JOINED, { playerId, name: existingPlayer.name, code });
      console.log(`player ${existingPlayer.name} reconnected to room ${code}`);
      broadcastLobbyUpdate(code);
      if (room.phase !== 'LOBBY') {
        const syncPayload = buildStateSyncForPlayer(room, playerId);
        if (syncPayload) {
          socket.emit(ServerEvents.STATE_SYNC, syncPayload);
        }
      }
      return;
    }

    if (isRoomFull(room)) {
      socket.emit(ServerEvents.JOIN_REJECTED, { reason: 'ROOM_FULL' });
      return;
    }

    if (isNameTaken(room, name)) {
      socket.emit(ServerEvents.JOIN_REJECTED, { reason: 'NAME_TAKEN' });
      return;
    }

    const trimmedName = normalizePlayerName(name);
    const player: Player = {
      playerId,
      name: trimmedName,
      socketId: socket.id,
      connected: true,
      score: 0,
      isVip: false,
    };
    addPlayer(code, player);
    // The first player to ever join a room becomes VIP; a no-op otherwise.
    claimVipIfVacant(room, player);
    socketAssociationBySocketId.set(socket.id, { role: 'player', code, playerId });
    socket.join(code);
    socket.emit(ServerEvents.PLAYER_JOINED, { playerId, name: trimmedName, code });
    console.log(`player ${trimmedName} (${playerId}) joined room ${code}`);
    broadcastLobbyUpdate(code);
    if (room.phase !== 'LOBBY') {
      const syncPayload = buildStateSyncForPlayer(room, playerId);
      if (syncPayload) {
        socket.emit(ServerEvents.STATE_SYNC, syncPayload);
      }
    }
  });

  socket.on(ClientEvents.VIP_START_GAME, () => {
    const room = getVipRoomForSocket(socket, ClientEvents.VIP_START_GAME);
    if (!room) {
      return;
    }

    const connectedCount = Array.from(room.players.values()).filter((player) => player.connected).length;
    if (connectedCount < MIN_PLAYERS) {
      console.log(
        `rejected ${ClientEvents.VIP_START_GAME} for room ${room.code}: only ${connectedCount} connected players`,
      );
      return;
    }

    if (room.phase !== 'LOBBY') {
      console.log(`rejected ${ClientEvents.VIP_START_GAME} for room ${room.code}: phase is ${room.phase}, not LOBBY`);
      return;
    }

    room.phase = 'QUESTION';
    room.currentQuestionIndex = 0;
    io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
    startQuestion(room);
  });

  socket.on(ClientEvents.SUBMIT_ANSWER, (payload) => {
    const association = socketAssociationBySocketId.get(socket.id);
    if (!association || association.role !== 'player') {
      console.log(`rejected ${ClientEvents.SUBMIT_ANSWER} from ${socket.id}: not a player`);
      return;
    }

    const room = getRoom(association.code);
    if (!room) {
      console.log(`rejected ${ClientEvents.SUBMIT_ANSWER} from ${socket.id}: room ${association.code} not found`);
      return;
    }

    if (room.phase !== 'QUESTION') {
      console.log(`rejected ${ClientEvents.SUBMIT_ANSWER} for room ${room.code}: phase is ${room.phase}, not QUESTION`);
      return;
    }

    const { choice } = payload;
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) {
      console.log(`rejected ${ClientEvents.SUBMIT_ANSWER} from ${socket.id}: invalid choice ${choice}`);
      return;
    }

    const { playerId } = association;
    if (room.answers.has(playerId)) {
      console.log(`rejected ${ClientEvents.SUBMIT_ANSWER} from player ${playerId}: already answered this question`);
      return;
    }

    // Server clock only - a client-supplied timestamp can never be trusted.
    const timeMs = Date.now() - room.questionStartedAt;
    room.answers.set(playerId, { choice, timeMs });
    socket.emit(ServerEvents.ANSWER_ACCEPTED, { choice });

    const connectedPlayers = getConnectedPlayers(room);
    const progressPayload: AnswerProgressPayload = {
      answered: room.answers.size,
      total: connectedPlayers.length,
      answeredPlayerIds: Array.from(room.answers.keys()),
    };
    io.to(room.hostSocketId).emit(ServerEvents.ANSWER_PROGRESS, progressPayload);

    console.log(`player ${playerId} answered question ${room.currentQuestionIndex + 1} in room ${room.code}`);

    if (haveAllConnectedPlayersAnswered(room)) {
      endQuestion(room.code);
    }
  });

  socket.on(ClientEvents.VIP_NEXT, () => {
    const room = getVipRoomForSocket(socket, ClientEvents.VIP_NEXT);
    if (!room) {
      return;
    }

    // "vip:next" is a manual SKIP of whichever auto-advance is pending -
    // both advanceFrom* functions already clear the pending timer before
    // doing anything else, so calling them directly here is exactly "cancel
    // the timer and advance immediately".
    if (room.phase === 'REVEAL') {
      console.log(`room ${room.code} skipped past reveal (VIP)`);
      advanceFromReveal(room.code);
      return;
    }

    if (room.phase === 'SCOREBOARD') {
      console.log(`room ${room.code} skipped past scoreboard (VIP)`);
      advanceFromScoreboard(room.code);
      return;
    }

    console.log(`rejected ${ClientEvents.VIP_NEXT} for room ${room.code}: phase is ${room.phase}, not REVEAL or SCOREBOARD`);
  });

  socket.on(ClientEvents.VIP_PLAY_AGAIN, () => {
    const room = getVipRoomForSocket(socket, ClientEvents.VIP_PLAY_AGAIN);
    if (!room) {
      return;
    }

    if (room.phase !== 'GAME_OVER') {
      console.log(`rejected ${ClientEvents.VIP_PLAY_AGAIN} for room ${room.code}: phase is ${room.phase}, not GAME_OVER`);
      return;
    }

    resetRoomForNewGame(room);
    io.to(room.code).emit(ServerEvents.PHASE_CHANGED, { phase: room.phase });
    broadcastLobbyUpdate(room.code);
    console.log(`room ${room.code} reset for a new game`);
  });

  socket.on('disconnect', () => {
    console.log(`client disconnected: ${socket.id}`);

    const association = socketAssociationBySocketId.get(socket.id);
    if (!association) {
      return;
    }
    socketAssociationBySocketId.delete(socket.id);

    if (association.role === 'host') {
      deleteRoom(association.code);
      console.log(`room ${association.code} closed (host left)`);
      console.log(`active room count: ${getActiveRoomCount()}`);
      return;
    }

    const player = getPlayer(association.code, association.playerId);
    if (player) {
      player.connected = false;
      console.log(`player ${player.name} disconnected from room ${association.code}`);
      const room = getRoom(association.code);
      console.log(
        `room ${association.code} players: ${JSON.stringify(Array.from(room?.players.values() ?? []))}`,
      );

      // VIP migrates IMMEDIATELY on disconnect - no grace period, this is a
      // couch game and control moving to whoever's sitting next to them is
      // fine. Must happen before broadcastLobbyUpdate so the lobby payload
      // already reflects the new VIP.
      if (room && isVip(room, association.playerId)) {
        const newVip = migrateVipAwayFrom(room, association.playerId);
        if (newVip) {
          const vipChangedPayload: VipChangedPayload = { playerId: newVip.playerId, name: newVip.name };
          io.to(room.code).emit(ServerEvents.VIP_CHANGED, vipChangedPayload);
          console.log(`room ${room.code} VIP transferred to ${newVip.name} (${newVip.playerId})`);
        } else {
          console.log(`room ${room.code} has no connected players left - VIP vacant`);
        }
      }

      broadcastLobbyUpdate(association.code);

      // The player who just left might have been the only one still
      // unanswered - re-run the "everyone answered" check so the question
      // doesn't sit waiting on the timer for someone who's no longer here.
      if (room && room.phase === 'QUESTION' && haveAllConnectedPlayersAnswered(room)) {
        endQuestion(room.code);
      }
    }
  });
});

const PORT = Number(process.env.PORT) || 3001;
// In production, only Caddy (on the same machine) should ever reach this
// port directly - bind to loopback only. In dev, stay on all interfaces so
// a phone on the LAN can hit the dev server directly if needed.
const HOST = isProduction ? '127.0.0.1' : '0.0.0.0';

httpServer.listen(PORT, HOST, () => {
  console.log(`server listening on ${HOST}:${PORT} (${isProduction ? 'production' : 'development'})`);
});
