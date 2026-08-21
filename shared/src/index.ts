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
  GAME_PAUSE: 'game:pause',
  GAME_RESUME: 'game:resume',
  VIP_RESET_TO_LOBBY: 'vip:reset_to_lobby',
  ROOM_PEEK: 'room:peek',
  SABOTAGE_CAST: 'player:sabotage_cast',
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
  GAME_PAUSED: 'game:paused',
  GAME_RESUMED: 'game:resumed',
  ROOM_PEEK_RESULT: 'room:peek_result',
  SABOTAGE_CAST_ACCEPTED: 'sabotage:cast_accepted',
} as const;

export type RoomCode = string;

export const MAX_PLAYERS = 8;
export const MAX_NAME_LENGTH = 12;
export const MIN_PLAYERS = 2;

// ~150 common Greek first names, roughly balanced masculine/feminine,
// including short forms people actually go by (Μάκης, Τάκης, Ρούλα,
// Τούλα). Offered as a scrollable/searchable preset list in the join flow
// (Task 26) - "Άλλο όνομα" falls back to free text for anyone not on it.
// A name is considered "preset" (see Player.isPresetName) iff it appears
// here verbatim - computed server-side, never trusted from the client.
export const PRESET_NAMES: readonly string[] = [
  // masculine
  'Γιώργος', 'Νίκος', 'Δημήτρης', 'Γιάννης', 'Κώστας', 'Χρήστος', 'Βασίλης', 'Παναγιώτης',
  'Μιχάλης', 'Θανάσης', 'Ανδρέας', 'Αντώνης', 'Σπύρος', 'Θόδωρος', 'Στέλιος', 'Στέφανος',
  'Άγγελος', 'Αλέξανδρος', 'Απόστολος', 'Αριστείδης', 'Γρηγόρης', 'Δημοσθένης', 'Ελευθέριος',
  'Εμμανουήλ', 'Ευάγγελος', 'Ζήσης', 'Ηλίας', 'Θεόδωρος', 'Ιάσονας', 'Ιωάννης', 'Κλέαρχος',
  'Κυριάκος', 'Λάμπρος', 'Λεωνίδας', 'Μάριος', 'Μενέλαος', 'Νεκτάριος', 'Ξενοφών', 'Οδυσσέας',
  'Ορέστης', 'Παναγής', 'Παύλος', 'Περικλής', 'Πέτρος', 'Πλάτωνας', 'Πολύκαρπος', 'Σάββας',
  'Σεραφείμ', 'Σίμος', 'Σταμάτης', 'Σωτήρης', 'Τάσος', 'Τρύφωνας', 'Φίλιππος', 'Φώτης',
  'Χαράλαμπος', 'Ιάκωβος', 'Ματθαίος', 'Μάρκος', 'Λουκάς', 'Ραφαήλ', 'Γαβριήλ', 'Μιλτιάδης',
  'Αχιλλέας', 'Διονύσης', 'Νικηφόρος', 'Θεοφάνης', 'Ευστάθιος', 'Κοσμάς', 'Παρασκευάς',
  'Μάκης', 'Τάκης', 'Πάνος', 'Γιωργάκης', 'Δημητράκης', 'Βαγγέλης', 'Θύμιος', 'Λευτέρης',
  'Μανώλης', 'Ορφέας',
  // feminine
  'Μαρία', 'Ελένη', 'Κατερίνα', 'Σοφία', 'Άννα', 'Βασιλική', 'Δήμητρα', 'Ειρήνη', 'Αικατερίνη',
  'Παναγιώτα', 'Γεωργία', 'Χριστίνα', 'Αγγελική', 'Αναστασία', 'Ευαγγελία', 'Θεοδώρα', 'Ιωάννα',
  'Κωνσταντίνα', 'Μαργαρίτα', 'Νικολέτα', 'Ξένια', 'Ολυμπία', 'Παρασκευή', 'Ρωξάνη', 'Σταματία',
  'Φωτεινή', 'Χαρίκλεια', 'Ζωή', 'Ηλέκτρα', 'Θάλεια', 'Ιουλία', 'Καλλιόπη', 'Λαμπρινή', 'Μελίνα',
  'Μυρτώ', 'Νεφέλη', 'Ουρανία', 'Πηνελόπη', 'Ραφαέλα', 'Στέλλα', 'Τατιάνα', 'Φιλίτσα', 'Αφροδίτη',
  'Άρτεμις', 'Δανάη', 'Ελισάβετ', 'Ζωίτσα', 'Θεανώ', 'Κυριακή', 'Λυδία', 'Μαρίνα', 'Ναταλία',
  'Πολυξένη', 'Ρέα', 'Σεβαστή', 'Τερψιχόρη', 'Υπατία', 'Φανή', 'Χρυσή', 'Άλκηστη', 'Βέρα',
  'Γιώτα', 'Δέσποινα', 'Ελπίδα', 'Ζαχαρούλα', 'Ρούλα', 'Τούλα', 'Λένα', 'Νίκη', 'Μάρω', 'Λίνα',
  'Βίκυ', 'Ντίνα', 'Ζωζώ', 'Φρόσω', 'Ασπασία', 'Ασημίνα', 'Ερασμία', 'Θεοδοσία', 'Καλλιρόη',
  'Μαρκέλλα', 'Ξανθίππη', 'Παρθένα', 'Σμαράγδα', 'Χρυσάνθη',
];

export interface AvatarDefinition {
  id: string;
  filename: string; // relative to /avatars/ - lowercase PNG
  name: string; // Greek display name
}

// The FULL mythological creature catalogue (Task 26) - every entry the
// design calls for, whether or not its image file has actually landed in
// client/public/avatars/ yet. This list never needs to grow when an image
// is added; it only grows when a genuinely NEW creature is designed. See
// server/src/avatars.ts (AVAILABLE_AVATAR_IDS) and
// client/src/hooks/useAvailableAvatars.ts for the two independent,
// filesystem/image-probe-driven mechanisms that narrow this catalogue down
// to "actually offerable right now" without either of THEM ever needing a
// code change either, as more files land.
export const AVATAR_CATALOGUE: readonly AvatarDefinition[] = [
  { id: 'minotaur', filename: 'minotaur.png', name: 'Μινώταυρος' },
  { id: 'medusa', filename: 'medusa.png', name: 'Μέδουσα' },
  { id: 'cyclops', filename: 'cyclops.png', name: 'Κύκλωπας' },
  { id: 'centaur', filename: 'centaur.png', name: 'Κένταυρος' },
  { id: 'sphinx', filename: 'sphinx.png', name: 'Σφίγγα' },
  { id: 'pegasus', filename: 'pegasus.png', name: 'Πήγασος' },
  { id: 'cerberus', filename: 'cerberus.png', name: 'Κέρβερος' },
  { id: 'satyr', filename: 'satyr.png', name: 'Σάτυρος' },
  { id: 'siren', filename: 'siren.png', name: 'Σειρήνα' },
  { id: 'chimera', filename: 'chimera.png', name: 'Χίμαιρα' },
  { id: 'hydra', filename: 'hydra.png', name: 'Ύδρα' },
  { id: 'griffin', filename: 'griffin.png', name: 'Γρύπας' },
  { id: 'phoenix', filename: 'phoenix.png', name: 'Φοίνικας' },
  { id: 'triton', filename: 'triton.png', name: 'Τρίτωνας' },
  { id: 'nymph', filename: 'nymph.png', name: 'Νύμφη' },
  { id: 'titan', filename: 'titan.png', name: 'Τιτάνας' },
  { id: 'charon', filename: 'charon.png', name: 'Χάρων' },
  { id: 'harpy', filename: 'harpy.png', name: 'Άρπυια' },
  { id: 'dryad', filename: 'dryad.png', name: 'Δρυάδα' },
  { id: 'nereid', filename: 'nereid.png', name: 'Νηρηίδα' },
  { id: 'gorgon', filename: 'gorgon.png', name: 'Γοργόνα' },
  { id: 'lamia', filename: 'lamia.png', name: 'Λάμια' },
  { id: 'kallikantzaros', filename: 'kallikantzaros.png', name: 'Καλλικάντζαρος' },
  { id: 'drakos', filename: 'drakos.png', name: 'Δράκος' },
] as const;

// The ONLY free-text field in the whole app (a custom player name - every
// other piece of player identity is a pick from a closed list). Strips
// anything that isn't a Greek/Latin letter or whitespace via the Unicode
// Script property (catches digits, emoji, punctuation, HTML-tag-like
// characters, everything), collapses repeated whitespace, trims, and caps
// at MAX_NAME_LENGTH. Both the client (as-you-type) and the server
// (defense in depth - never trust the client) call this exact function,
// so the two can never drift apart on what counts as "clean".
const CUSTOM_NAME_STRIP_PATTERN = /[^\p{Script=Greek}\p{Script=Latin}\s]/gu;
export function sanitizeCustomName(input: string): string {
  return input
    .replace(CUSTOM_NAME_STRIP_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}
export const BASE_POINTS = 1000;
export const SPEED_BONUS_MAX = 500;
export const REVEAL_DURATION_MS = 6000;
export const SCOREBOARD_DURATION_MS = 4000;
// REVEAL already shows who answered what, how fast, and the points gained -
// a separate SCOREBOARD phase after EVERY question just repeats it. Shown
// only every Nth question (see shouldShowScoreboard in server/src/index.ts)
// and always after the final question, right before GAME_OVER.
export const SCOREBOARD_EVERY_N_QUESTIONS = 3;

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

// NAME_TAKEN is gone (Task 26) - names may repeat now that identity is
// name+avatar together, not name alone. AVATAR_TAKEN/INVALID_AVATAR cover
// the new uniqueness/validity checks on the other half of that pair.
export type JoinRejectedReason = 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'INVALID_NAME' | 'INVALID_AVATAR' | 'AVATAR_TAKEN';

// A read-only "is this room joinable, and which avatars are already
// claimed" lookup - fired from the room-code step of the join flow, BEFORE
// player:join, so the avatar grid can grey out taken creatures up front
// instead of only discovering a clash via JOIN_REJECTED after the fact.
// Deliberately minimal (no player list, no settings) - this socket hasn't
// joined the room yet and isn't owed anything beyond "can I join, and with
// which avatar". The eventual player:join is still the sole source of
// truth (this is a best-effort UI hint, not a reservation).
export interface RoomPeekPayload {
  code: RoomCode;
}

export interface RoomPeekResultPayload {
  code: RoomCode;
  found: boolean;
  takenAvatarIds: string[];
}

export interface PlayerJoinPayload {
  code: RoomCode;
  name: string;
  playerId: string;
  avatarId: string;
}

export interface PlayerJoinedPayload {
  playerId: string;
  name: string;
  code: RoomCode;
  avatarId: string;
  isPresetName: boolean;
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
  /** One of AVATAR_CATALOGUE's ids - unique per room, kept across reconnects. */
  avatarId: string;
  /** True iff `name` came verbatim from PRESET_NAMES - computed server-side
   *  at join time, never trusted from the client. Task 25 (TTS) will use
   *  this to pick pre-generated audio vs. live synthesis for spoken names. */
  isPresetName: boolean;
}

/** Player as seen by clients - never includes socketId, which is server-internal only. */
export interface LobbyPlayer {
  playerId: string;
  name: string;
  connected: boolean;
  isVip: boolean;
  avatarId: string;
}

export interface LobbyUpdatePayload {
  code: RoomCode;
  players: LobbyPlayer[];
  canStart: boolean;
  settings: RoomSettings;
}

export type GamePhase = 'LOBBY' | 'QUESTION' | 'REVEAL' | 'SCOREBOARD' | 'GAME_OVER';

// Each player may cast ONE of these per game, at a target of their choosing;
// the SERVER (never the client) picks which effect they get, weighted by the
// caster's current rank (see server/src/sabotage.ts) so a leader casting is
// deliberately the weakest version of the weapon - a comeback mechanic.
export type SabotageEffect = 'ice' | 'ink' | 'shuffle';

export interface SabotageCastPayload {
  targetPlayerId: string;
}

// Just an ack that the cast was accepted and consumed the caster's one use -
// deliberately carries no effect info, since even the CASTER doesn't learn
// what they got until the announcement below fires on REVEAL.
export interface SabotageCastAcceptedPayload {}

// Cast in round N stays completely hidden through round N's QUESTION phase,
// then is announced to everyone the moment N's REVEAL fires - this is that
// announcement. The same shape is then left sitting in room state (server
// side, see pendingSabotageByTarget) keyed by targetPlayerId as the pending
// effect for round N+1, so a reconnecting victim is always caught up from
// server state, never from something only the client remembered.
export interface SabotageAnnouncement {
  casterPlayerId: string;
  casterName: string;
  targetPlayerId: string;
  targetName: string;
  effect: SabotageEffect;
}

// How long each effect lasts once it LANDS, measured from the start of the
// victim's next question. These are the nominal figures only: the server
// always clamps the applied duration down to the room's question time, so a
// 10s round can never be stretched by an effect that nominally outlives it.
// 'shuffle' is deliberately 0 - the effect itself is not implemented (28c),
// so a shuffle cast is consumed at the victim's next question and does
// nothing, rather than sitting pending forever.
export const SABOTAGE_EFFECT_DURATION_MS: Record<SabotageEffect, number> = {
  ice: 5000,
  ink: 8000,
  shuffle: 0,
};

// The effect currently RUNNING against a player, sent only to that player,
// on question:show and on a mid-question state:sync. `remainingMs` is always
// the time still left this instant - never the full duration - so a phone
// that reconnects halfway through an ice picks the freeze up where it was
// rather than restarting it. `durationMs` is the already-clamped total, sent
// alongside so the ink fade can be drawn against the right curve.
export interface ActiveSabotage {
  effect: SabotageEffect;
  durationMs: number;
  remainingMs: number;
}

export interface AnswerIdentity {
  letter: string; // Greek option letter - Α, Β, Γ, Δ
  shape: string; // colour-blind-safe glyph, paired with the colour below
  color: string; // accent hex - fixed per slot, never varies between questions
}

// FIXED colour+shape+letter identity for each of the 4 answer slots
// (indexed 0-3), defined ONCE here so the TV and every phone read the exact
// same mapping and can never visually drift apart. Colour is never the only
// signal - it's always paired with a distinct shape, so this stays usable
// for colour-blind players.
export const ANSWER_IDENTITIES: readonly AnswerIdentity[] = [
  { letter: 'Α', shape: '▲', color: '#ef4444' }, // red triangle
  { letter: 'Β', shape: '◆', color: '#3b82f6' }, // blue diamond
  { letter: 'Γ', shape: '●', color: '#eab308' }, // yellow circle
  { letter: 'Δ', shape: '■', color: '#22c55e' }, // green square
] as const;

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
  // Always false/null on a fresh question:show (a phase can't already be
  // paused the instant it begins) - meaningful on the state:sync variant,
  // which reuses this same shape, for a player/TV reconnecting mid-pause.
  paused: boolean;
  pausedByName: string | null;
  // Game Master (Task 24) - HOST ONLY, the phones never show commentary.
  // A short, one-off line shown briefly as the question appears, then
  // fades - never delays the question/answer buttons. null on rare games
  // where every applicable line pool happened to already be exhausted.
  gmIntro: string | null;
}

export interface QuestionShowPlayerPayload {
  questionIndex: number;
  totalQuestions: number;
  options: string[];
  category: string;
  questionTimeMs: number;
  paused: boolean;
  pausedByName: string | null;
  // Sabotage (Task 28b) - the effect landing on THIS player for THIS
  // question, or null for everyone else. Per-player by construction: the
  // host payload has no equivalent field, and no phone is ever told about
  // another phone's sabotage.
  yourSabotage: ActiveSabotage | null;
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
  avatarId: string;
  choice: number | null; // null = did not answer
  correct: boolean;
  pointsAwarded: number;
  totalScore: number;
  timeMs: number | null; // their actual answer time - null if they didn't answer
  answerRank: number | null; // 1-based position among CORRECT answers only, fastest first - null if wrong or no answer
}

// 'reveal:show' is asymmetric, like 'question:show': the host sees every
// player's result, players only ever see their own.
export interface RevealHostPayload {
  correctIndex: number; // now safe to send - the question has ended
  correctOption: string;
  results: RevealPlayerResult[];
  answerCounts: number[]; // how many picked each option
  autoAdvanceMs: number; // so clients can render a progress bar
  paused: boolean;
  pausedByName: string | null;
  // Game Master (Task 24) - HOST ONLY, the phones never show commentary.
  // The single highest-priority "moment" line for this round, already
  // rendered (placeholders substituted, player names sanitised/truncated
  // server-side). null on rare games where every applicable line pool
  // happened to already be exhausted.
  gmLine: string | null;
  // Sabotage (Task 28a) - every cast made DURING this just-finished question,
  // now safe to announce publicly (host TV, shared by everyone) now that the
  // question is over. Empty when nobody cast this round.
  sabotageAnnouncements: SabotageAnnouncement[];
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
  paused: boolean;
  pausedByName: string | null;
  yourTimeMs: number | null;
  yourAnswerRank: number | null; // 1-based among correct answers only - null if wrong or no answer
  // Sabotage (Task 28a) - the effect now pending against THIS player for the
  // NEXT question (server-computed at cast time, revealed only now), or null
  // if nobody targeted them this round. Read fresh from room state on every
  // REVEAL broadcast/state:sync, so a reconnecting victim always gets the
  // correct answer straight from the server, never a client-side cache.
  yourPendingSabotage: SabotageEffect | null;
}

export type RevealShowPayload = RevealHostPayload | RevealPlayerPayload;

export function isRevealHostPayload(payload: RevealShowPayload): payload is RevealHostPayload {
  return 'results' in payload;
}

export interface VipNextPayload {}

export interface ScoreboardStanding {
  playerId: string;
  name: string;
  avatarId: string;
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
  paused: boolean;
  pausedByName: string | null;
}

export interface VipPlayAgainPayload {}

// Pause is a boolean flag on the room, NOT a new GamePhase - the phase
// stays QUESTION/REVEAL/SCOREBOARD throughout a pause, so every existing
// phase guard keeps working unchanged; only `paused` changes.
export interface GamePausePayload {}
export interface GameResumePayload {}

export interface PausedPayload {
  byName: string;
}

export interface ResumedPayload {
  remainingMs: number; // the frozen time, now ticking again - never a full reset
}

// Sends everyone back to LOBBY mid-game (or from GAME_OVER) - reuses the
// exact same reset as vip:play_again (scores to 0, fresh question set,
// every timer and the pause state cleared), just triggerable earlier.
export interface VipResetToLobbyPayload {}

// Broadcast to the whole room whenever VIP moves - either the first player
// claiming a vacant VIP slot, or a migration away from a disconnecting VIP.
export interface VipChangedPayload {
  playerId: string;
  name: string;
}

export interface GameOverStanding {
  playerId: string;
  name: string;
  avatarId: string;
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
  [ClientEvents.GAME_PAUSE]: (payload: GamePausePayload) => void;
  [ClientEvents.GAME_RESUME]: (payload: GameResumePayload) => void;
  [ClientEvents.VIP_RESET_TO_LOBBY]: (payload: VipResetToLobbyPayload) => void;
  [ClientEvents.ROOM_PEEK]: (payload: RoomPeekPayload) => void;
  [ClientEvents.SABOTAGE_CAST]: (payload: SabotageCastPayload) => void;
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
  [ServerEvents.GAME_PAUSED]: (payload: PausedPayload) => void;
  [ServerEvents.GAME_RESUMED]: (payload: ResumedPayload) => void;
  [ServerEvents.ROOM_PEEK_RESULT]: (payload: RoomPeekResultPayload) => void;
  [ServerEvents.SABOTAGE_CAST_ACCEPTED]: (payload: SabotageCastAcceptedPayload) => void;
};
