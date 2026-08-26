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
  // Task 57 - separate from VIP_UPDATE_SETTINGS: mode isn't a RoomSettings
  // field (it's Room's own, read by modeForRoom everywhere), so it gets its
  // own tiny event rather than being smuggled into the settings partial.
  VIP_SET_MODE: 'vip:set_mode',
  GAME_PAUSE: 'game:pause',
  GAME_RESUME: 'game:resume',
  VIP_RESET_TO_LOBBY: 'vip:reset_to_lobby',
  ROOM_PEEK: 'room:peek',
  POWER_UP_CHOOSE: 'player:power_up_choose',
  STEAL_CHOOSE: 'player:steal_choose',
  // Task 42c - the host reports that a Socrates line's audio has genuinely
  // finished playing (or was never going to play at all - see
  // useGameAudio.playSocratesLine), so the server can end the beat exactly
  // then instead of guessing a duration up front.
  SOCRATES_AUDIO_ENDED: 'socrates:audio_ended',
  // Task 53 - dev-only drawing harness (/dev/draw). Not part of any game
  // phase yet: the real draw phase will get its own player:* event with a
  // room/phase check. This one exists so the surface can be tried on a
  // real phone and the wire size measured.
  DEV_SUBMIT_DRAWING: 'dev:submit_drawing',
  // Task 56a - the real drawing mode. DRAW_SUBMIT carries the finished
  // picture, DRAW_GUESS carries one guesser's pick among that round's 4
  // options. Both are phase-gated server-side exactly like SUBMIT_ANSWER.
  DRAW_SUBMIT: 'draw:submit',
  DRAW_GUESS: 'draw:guess',
  // Task 65 - the numeric-estimate mode. One event: the player's guess,
  // clamped server-side to 0..max - never rejected for being out of range.
  NUMERIC_SUBMIT: 'player:numeric_submit',
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
  GAME_OVER: 'game:over',
  STATE_SYNC: 'state:sync',
  VIP_CHANGED: 'vip:changed',
  SETTINGS_UPDATED: 'settings:updated',
  GAME_PAUSED: 'game:paused',
  GAME_RESUMED: 'game:resumed',
  ROOM_PEEK_RESULT: 'room:peek_result',
  POWER_UP_SHOW: 'power_up:show',
  POWER_UP_CHOICE_ACCEPTED: 'power_up:choice_accepted',
  POWER_UP_PROGRESS: 'power_up:progress',
  STAGE_ANNOUNCE: 'stage:announce',
  SOCRATES_SHOW: 'socrates:show',
  STEAL_SHOW: 'steal:show',
  STEAL_RESOLVED: 'steal:resolved',
  CROWD_MOOD: 'crowd:mood',
  DEV_DRAWING_RECEIVED: 'dev:drawing_received',
  // Task 56a - the drawing mode's own phases. DRAW/GUESS are asymmetric like
  // question:show/steal:show; GUESS_REVEAL is symmetric (the correct index
  // is finally safe to send), like reveal:show.
  DRAW_SHOW: 'draw:show',
  DRAW_PROGRESS: 'draw:progress',
  GUESS_SHOW: 'guess:show',
  GUESS_PROGRESS: 'guess:progress',
  GUESS_REVEAL_SHOW: 'guess_reveal:show',
  // Task 65 - the numeric-estimate mode's own phases, symmetric like
  // draw:show/guess_reveal:show: NUMERIC_QUESTION never carries the answer,
  // NUMERIC_REVEAL is the one place it becomes safe to send.
  NUMERIC_QUESTION_SHOW: 'numeric_question:show',
  NUMERIC_REVEAL_SHOW: 'numeric_reveal:show',
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
  // Task 57 - already mode-aware server-side (each mode's own minPlayers,
  // not a flat MIN_PLAYERS floor) - see buildLobbyUpdate.
  canStart: boolean;
  settings: RoomSettings;
  // The room's currently selected game - never changes once the game
  // leaves LOBBY (see vip:set_mode's phase guard).
  mode: GameModeId;
  // Task 57 - every mode actually REGISTERED server-side, in registration
  // order, with just enough to render a picker and explain a blocked start.
  // Never a hardcoded array on the client: adding a mode module (which
  // calls registerGameMode) is what makes it appear here, with no lobby
  // code to edit.
  availableModes: GameModeOption[];
}

// ---------------------------------------------------------------------------
// Game modes (Task 52)
// ---------------------------------------------------------------------------

// Which GAME a room is running. The mode owns its own phase sequence, what
// follows each of its phases, and its own STAGES table (see
// server/src/modes/) - the room only holds the id. 'quiz' is the original
// game and, for now, the only one. Adding a mode means adding an id HERE
// (and its phases to GamePhase below), then a module under server/src/modes/
// that registers itself - nothing in state.ts/timers.ts/realtime.ts moves.
export type GameModeId = 'quiz' | 'draw' | 'numeric';
export const GAME_MODE_IDS: readonly GameModeId[] = ['quiz', 'draw', 'numeric'];
export const DEFAULT_GAME_MODE: GameModeId = 'quiz';

// Task 57 - one mode as the LOBBY needs to know it: its own display label
// and its own minimum CONNECTED player count (draw's is 3, quiz's is
// MIN_PLAYERS) - both authored once, on the mode itself
// (server/src/modes/<mode>.ts), and read here off whatever the registry
// actually has rather than a second, hand-kept list.
export interface GameModeOption {
  id: GameModeId;
  label: string; // Greek, shown on the mode picker
  minPlayers: number;
}

export interface VipSetModePayload {
  mode: GameModeId;
}

// POWER_UP (Task 30a) is a real phase, not a flag, so every existing phase
// guard keeps rejecting answers/casts while it's up. WHEN it runs is decided
// by the stage table below (Task 31a), not by this type.
// Task 52: this is the UNION of every mode's phases - the wire vocabulary a
// client may be told about. Which of them a given room can actually enter is
// its mode's own `phases` list. LOBBY and GAME_OVER are common to all modes;
// everything between STAGE_ANNOUNCE and SOCRATES belongs to 'quiz'.
export type GamePhase =
  | 'LOBBY'
  | 'STAGE_ANNOUNCE'
  | 'POWER_UP'
  | 'QUESTION'
  | 'REVEAL'
  | 'STEAL'
  // Task 39 - the host's own beat after a REVEAL (and after any STEAL that
  // followed it): Socrates alone on screen with the line for that round.
  // SKIPPED entirely when no moment fired, so it is never an empty screen.
  | 'SOCRATES'
  // Task 56a - the 'draw' mode's own phases. DRAW is every player drawing
  // their assigned word at once; GUESS/GUESS_REVEAL then run once per
  // submitted drawing, in a fixed queue.
  | 'DRAW'
  | 'GUESS'
  | 'GUESS_REVEAL'
  // Task 65 - the 'numeric' mode's own phases: everyone submits one number
  // (clamped server-side to 0..max), then a reveal shows the real answer and
  // everyone's distance-ranked score. Standalone for now (Task 66 folds it
  // into the quiz as a stage).
  | 'NUMERIC_QUESTION'
  | 'NUMERIC_REVEAL'
  | 'GAME_OVER';

// Crowd mood (Task 35) - server-derived, HOST ONLY (audio, once it lands, is
// host-only too). Never computed by any client. 'calm' is the default -
// LOBBY, STAGE_ANNOUNCE, and the early part of QUESTION; 'tension' covers the
// last third of the QUESTION timer plus the whole POWER_UP and STEAL phases;
// 'cheer'/'boo' fire at REVEAL depending on whether most connected players
// answered correctly, and 'boo' fires again whenever a STEAL resolves.
export type CrowdMood = 'calm' | 'tension' | 'cheer' | 'boo';

export interface CrowdMoodPayload {
  mood: CrowdMood;
}

// ---------------------------------------------------------------------------
// Stages (Task 31a)
// ---------------------------------------------------------------------------

// A game is a SEQUENCE OF STAGES, each a run of consecutive questions with its
// own rules. This table is the whole definition: the question count of a game
// is the sum of its INCLUDED stages' counts (totalQuestionsForLength, Task
// 33 - which stages are included is the VIP's gameLength setting), and which
// questions get a POWER_UP phase in front of them is a per-stage flag rather
// than a special case anywhere in the phase machine. Adding stage 4 means
// adding a row here.
export interface StageDefinition {
  stage: number; // 1-based - matches Room.stage server-side
  questionCount: number;
  // When true, EVERY question of this stage is preceded by its own POWER_UP
  // phase in which every connected player picks one power-up. There is no
  // economy and nothing is held over: a power-up is chosen and spent inside
  // the same stage-question boundary.
  powerUpBeforeEveryQuestion: boolean;
  // When true, EVERY question of this stage is FOLLOWED (right after its
  // REVEAL) by a STEAL phase in which the fastest correct
  // answerer takes points off one other player. Skipped entirely on a
  // question nobody got right - see startStealIfEligible in phases.ts.
  stealAfterEveryQuestion: boolean;
  title: string; // Greek, announced on the TV as the stage begins
  tagline: string; // Greek, one line under the title
}

// Task 37a - each stage is framed as a round of a public dispute in
// Athens (Socrates now hosts, see server/src/socrates.ts): an open
// rebuttal in the Agora, the sophists' rhetorical tricks, and finally a
// trial. Renaming only - questionCount/powerUpBeforeEveryQuestion/
// stealAfterEveryQuestion (the actual mechanics) are untouched.
// Task 52: this is the QUIZ mode's stage table. Every helper below takes the
// table it should read as an optional last argument, defaulting to this one,
// so a mode with a different shape passes its own (server/src/modes/) and
// every existing quiz-side call site stays exactly as it was.
export const QUIZ_STAGES: readonly StageDefinition[] = [
  {
    stage: 1,
    questionCount: 3,
    powerUpBeforeEveryQuestion: false,
    stealAfterEveryQuestion: false,
    title: 'Γύρος 1 — Η Αγορά',
    tagline: 'Ανοιχτή αντιπαράθεση. Χωρίς κόλπα, μόνο ταχύτητα και γνώση.',
  },
  {
    stage: 2,
    questionCount: 5,
    powerUpBeforeEveryQuestion: true,
    stealAfterEveryQuestion: false,
    title: 'Γύρος 2 — Οι Σοφιστές',
    tagline: 'Πριν από ΚΑΘΕ ερώτηση επιλέγετε σοφιστικό τέχνασμα. Και τα τεχνάσματα στοιβάζονται.',
  },
  {
    stage: 3,
    questionCount: 4,
    powerUpBeforeEveryQuestion: false,
    stealAfterEveryQuestion: true,
    title: 'Γύρος 3 — Η Δίκη',
    tagline: 'Ο πιο γρήγορος σωστός κλέβει πόντους από όποιον κρίνει ένοχο.',
  },
] as const;

// The pre-Task-52 name, kept as the default stage table for every helper
// below and for the client's lobby estimates - all of which are quiz-only.
export const STAGES: readonly StageDefinition[] = QUIZ_STAGES;

// How many stages of the game the VIP wants (Task 33). `short`/`medium` are
// fixed slices of the table (stages 1-2 / 1-3) so they stay put when a new
// stage is appended; `long` is "however many the table has", so it grows with
// a new stage and is right for ANY mode's table, not just the quiz's.
export type GameLength = 'short' | 'medium' | 'long';
export const GAME_LENGTH_OPTIONS: readonly GameLength[] = ['short', 'medium', 'long'];

const GAME_LENGTH_STAGE_COUNT: Record<GameLength, number> = {
  short: 2,
  medium: 3,
  long: Number.POSITIVE_INFINITY, // the whole table, whatever mode it belongs to
};

export function stagesForLength(
  length: GameLength,
  stages: readonly StageDefinition[] = STAGES,
): readonly StageDefinition[] {
  return stages.slice(0, GAME_LENGTH_STAGE_COUNT[length]);
}

export function totalQuestionsForLength(
  length: GameLength,
  stages: readonly StageDefinition[] = STAGES,
): number {
  return stagesForLength(length, stages).reduce((total, stage) => total + stage.questionCount, 0);
}

// Which stage a 0-based question index falls in. Out-of-range indices clamp to
// the first/last stage rather than returning null, so no caller has to handle
// an impossible "question that belongs to no stage".
export function stageForQuestionIndex(
  questionIndex: number,
  stages: readonly StageDefinition[] = STAGES,
): StageDefinition {
  let firstIndex = 0;
  for (const stage of stages) {
    if (questionIndex < firstIndex + stage.questionCount) {
      return stage;
    }
    firstIndex += stage.questionCount;
  }
  return stages[stages.length - 1];
}

// The 0-based index of a stage's FIRST question - what the TV announcement
// reports, and what makes "question 2 of 5 in this stage" computable.
export function firstQuestionIndexOfStage(
  stage: number,
  stages: readonly StageDefinition[] = STAGES,
): number {
  let firstIndex = 0;
  for (const definition of stages) {
    if (definition.stage === stage) {
      return firstIndex;
    }
    firstIndex += definition.questionCount;
  }
  return 0;
}

// Fired at the room the moment a game ENTERS a stage - exactly once per stage
// per game, since the server only emits it when Room.stage actually changes.
// The TV shows it as a brief overlay; phones ignore it (they're controllers,
// and the phone is already busy with a POWER_UP choice half the time).
export interface StageAnnouncePayload {
  stage: number;
  totalStages: number;
  title: string;
  tagline: string;
  questionCount: number;
  firstQuestionIndex: number; // 0-based, into the whole game's question list
  totalQuestions: number;
}

// How long the STAGE_ANNOUNCE phase lasts. A real beat, not a cosmetic
// overlay: the server holds here on the shared timer (so a pause freezes it)
// and only then enters the question/POWER_UP, which is what keeps the
// announcement and the question from ever being on screen at once.
export const STAGE_ANNOUNCE_DURATION_MS = 3500;

// An effect that can be applied against a player. 'shuffle' can currently
// only land via the option-permutation machinery in server/src/sabotage.ts;
// 'ice'/'ink' land via the POWER_UP phase (see PowerUpEffect below).
export type SabotageEffect = 'ice' | 'ink' | 'shuffle';

// How long each effect lasts once it LANDS, measured from the start of the
// victim's next question. These are the nominal figures only: the server
// always clamps the applied duration down to the room's question time, so a
// 10s round can never be stretched by an effect that nominally outlives it.
// 'shuffle' (Task 28c) reorders the victim's options for the WHOLE round -
// there's no half-shuffled state to fade back out of - so its nominal figure
// is deliberately longer than any question-time option and the clamp turns it
// into exactly "this question".
export const SABOTAGE_EFFECT_DURATION_MS: Record<SabotageEffect, number> = {
  ice: 5000,
  ink: 8000,
  shuffle: 60000,
};

// Stacking (Task 31a). In stage 2 every connected player gets a power-up
// before every question, so several of them landing on the same victim in the
// same round is the NORMAL case, not an edge one. Each effect stacks along its
// own axis, and each axis has a hard ceiling:
//   ice - stacks in DURATION, capped at MAX_ICE_STACK_MS total. Ice past the
//         cap is discarded (a whole round of being frozen is already the
//         worst thing the game can do to someone).
//   ink - stacks in INTENSITY, never in duration: a second ink makes the
//         blur worse for the same window, it does not extend the window.
//   shuffle - stacks as neither; there is one option order per question, so a
//         second shuffle is simply absorbed.
// Both ceilings are ALSO clamped to the room's question time by the server, so
// no amount of stacking can make an effect outlive the round it landed in.
export const MAX_ICE_STACK_MS = 10000;
export const MAX_INK_INTENSITY = 3;

// The effect currently RUNNING against a player, sent only to that player,
// on question:show and on a mid-question state:sync. `remainingMs` is always
// the time still left this instant - never the full duration - so a phone
// that reconnects halfway through an ice picks the freeze up where it was
// rather than restarting it. `durationMs` is the already-clamped total, sent
// alongside so the ink fade can be drawn against the right curve.
//
// One of these per EFFECT, never per cast: several ices landing on one player
// arrive as a single entry with a longer `durationMs`, several inks as a
// single entry with a higher `intensity`. A player can, however, be under an
// ice AND an ink at once - hence the list, `yourSabotages`.
export interface ActiveSabotage {
  effect: SabotageEffect;
  durationMs: number;
  remainingMs: number;
  // How many instances have been folded into this entry along its INTENSITY
  // axis: >1 only for ink (capped at MAX_INK_INTENSITY). Always 1 for ice and
  // shuffle, whose stacking shows up in `durationMs` or nowhere at all.
  intensity: number;
}

// ---------------------------------------------------------------------------
// POWER_UP phase (Task 30a)
// ---------------------------------------------------------------------------

// The phase's own countdown, run through the SHARED timer helper exactly like
// the question/reveal/scoreboard ones, so a pause freezes it identically.
export const POWER_UP_DURATION_MS = 10000;

// What a player may pick during POWER_UP. Deliberately a SUBSET of
// SabotageEffect - 'shuffle' has no place here, and reusing the same effect
// names means the landing machinery (durations, ice enforcement, the victim's
// `yourSabotage`) is shared rather than duplicated. The PLAYER picks this
// directly: the server never chooses on their behalf.
export type PowerUpEffect = Extract<SabotageEffect, 'ice' | 'ink'>;
export const POWER_UP_EFFECTS: readonly PowerUpEffect[] = ['ice', 'ink'];

// A player the caster may aim at - every OTHER connected player. Sent per
// phone (each list omits its own reader), so self-targeting isn't even
// offered; the server rejects it regardless.
export interface PowerUpTarget {
  playerId: string;
  name: string;
  avatarId: string;
}

export interface PowerUpChoosePayload {
  effect: PowerUpEffect;
  targetPlayerId: string;
}

// Just an ack that this phone's one choice was recorded - carries nothing
// about anyone else's, which stays hidden until it lands.
export interface PowerUpChoiceAcceptedPayload {
  effect: PowerUpEffect;
  targetPlayerId: string;
}

// 'power_up:show' is asymmetric like question:show / reveal:show. The TV is a
// display: it learns how many phones have committed, never what they picked
// or at whom. Only the phones get an effect list and a target list.
export interface PowerUpShowHostPayload {
  questionIndex: number; // the question this phase precedes, 0-based
  totalQuestions: number;
  durationMs: number;
  chosenCount: number;
  totalPlayers: number;
  chosenPlayerIds: string[]; // WHO has committed - never what they chose
  paused: boolean;
  pausedByName: string | null;
  // Task 38 - every player's current score, for the TV's persistent right
  // column. See PlayerStanding.
  standings: PlayerStanding[];
}

export interface PowerUpShowPlayerPayload {
  questionIndex: number;
  totalQuestions: number;
  durationMs: number;
  effects: readonly PowerUpEffect[];
  targets: PowerUpTarget[];
  // Always null on a fresh power_up:show; only the state:sync variant can
  // carry a real value, for a phone reconnecting after already choosing.
  yourChoice: PowerUpChoosePayload | null;
  paused: boolean;
  pausedByName: string | null;
}

export type PowerUpShowPayload = PowerUpShowHostPayload | PowerUpShowPlayerPayload;

export function isPowerUpHostPayload(payload: PowerUpShowPayload): payload is PowerUpShowHostPayload {
  return 'chosenPlayerIds' in payload;
}

// Host-only progress ticker, same contract as answer:progress - who has
// committed, never what they committed to.
export interface PowerUpProgressPayload {
  chosenCount: number;
  totalPlayers: number;
  chosenPlayerIds: string[];
}

// ---------------------------------------------------------------------------
// STEAL phase (Task 32)
// ---------------------------------------------------------------------------

// The thief's own countdown, run through the SHARED timer helper exactly like
// every other phase's, so a pause freezes it identically. Once the theft
// RESOLVES (a pick, or this running out), the phase stays up for a second,
// shorter beat so the TV can actually announce what happened before the game
// moves on.
export const STEAL_DURATION_MS = 8000;
export const STEAL_ANNOUNCE_DURATION_MS = 4000;

// How much the fastest correct answerer may take, scaled by how fast they
// were: an instant answer steals STEAL_MAX_AMOUNT, one landing right on the
// buzzer steals STEAL_MIN_AMOUNT. Always CLAMPED to the victim's current
// score at resolution time, so nobody is ever pushed below zero and the thief
// gains exactly what was actually removed.
export const STEAL_MIN_AMOUNT = 200;
export const STEAL_MAX_AMOUNT = 400;

// A player the thief may rob - every OTHER connected player. `score` is
// included because the amount is clamped to it: the picker shows what is
// really on the table for each target rather than a flat promise.
export interface StealTarget {
  playerId: string;
  name: string;
  avatarId: string;
  score: number;
}

export interface StealChoosePayload {
  targetPlayerId: string;
}

// Every player's current score + rank (see PlayerStanding), for the TV's
// "what's at stake" strip AND its persistent score column (Task 38) - built
// fresh on each send just like StealTarget, so it carries the PRE-theft
// scores while the thief is choosing and the POST-theft scores once
// buildStealHostPayload is re-run after applySteal has moved the points.
// Order is room.players' insertion (join) order, NEVER re-sorted by score -
// rows must stay in the same slot while a score animates, or the transfer
// would read as a swap instead of a transfer.
export type StealStanding = PlayerStanding;

// Public, symmetric, and only ever sent AFTER the theft has been applied -
// the whole room (TV included) sees the same figures. `victimPlayerId` is
// null when nothing was stolen at all, which happens when the thief let the
// clock run out. `stolenAmount` is the amount that ACTUALLY moved (clamped to
// what the victim had); `attemptedAmount` is what the thief's speed had
// earned them, kept so the TV can show "wanted 400, got 150".
export interface StealResolvedPayload {
  thiefPlayerId: string;
  thiefName: string;
  thiefAvatarId: string;
  victimPlayerId: string | null;
  victimName: string | null;
  victimAvatarId: string | null;
  attemptedAmount: number;
  stolenAmount: number;
  thiefScore: number;
  victimScore: number | null;
}

// 'steal:show' is asymmetric like question:show / power_up:show, and doubly
// so: only ONE phone - the thief's - gets a target list at all. Everyone
// else, and the TV, gets a watching view naming the thief.
export interface StealShowHostPayload {
  questionIndex: number; // the question this steal follows, 0-based
  totalQuestions: number;
  durationMs: number;
  thiefPlayerId: string;
  thiefName: string;
  thiefAvatarId: string;
  amount: number; // what their speed earned them, before the victim clamp
  // Every player's current score - see StealStanding. Lets the TV show what
  // is at stake throughout the phase, and animate the transfer once resolved.
  standings: StealStanding[];
  // null while the thief is still choosing; set once the theft has resolved,
  // which is what the TV announces.
  resolved: StealResolvedPayload | null;
  paused: boolean;
  pausedByName: string | null;
}

export interface StealShowPlayerPayload {
  questionIndex: number;
  totalQuestions: number;
  durationMs: number;
  thiefName: string;
  thiefAvatarId: string;
  // The ONE bit that makes this phone the picker rather than a spectator.
  youAreThief: boolean;
  amount: number;
  // Non-empty ONLY for the thief - no other phone is even offered a list.
  targets: StealTarget[];
  // Always null on a fresh steal:show; only the state:sync variant can carry
  // a real value, for a thief reconnecting after already picking.
  yourChoice: StealChoosePayload | null;
  resolved: StealResolvedPayload | null;
  paused: boolean;
  pausedByName: string | null;
}

export type StealShowPayload = StealShowHostPayload | StealShowPlayerPayload;

export function isStealHostPayload(payload: StealShowPayload): payload is StealShowHostPayload {
  return 'thiefPlayerId' in payload;
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

// Question COUNT is not a setting of its own (Task 31a): the stage table
// owns it, a game being exactly totalQuestionsForLength(gameLength)
// questions long. Time, difficulty and how many stages to play are the
// VIP's to choose.
export const QUESTION_TIME_OPTIONS_MS = [10000, 20000, 30000] as const;

// Task 57 - the draw mode's own game-shape setting, parallel to gameLength:
// how many full draw-then-guess cycles a game runs (fresh words dealt each
// cycle). Quiz ignores this field entirely, exactly the way draw ignores
// questionTimeMs/difficultyMix/gameLength - RoomSettings is a flat bag of
// every mode's own knobs, and each mode reads only the ones it owns.
export const DRAW_ROUNDS_OPTIONS = [1, 2] as const;

export type RoomSettings = {
  questionTimeMs: number;
  difficultyMix: DifficultyMix;
  gameLength: GameLength;
  drawRounds: number;
};

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  questionTimeMs: 20000,
  difficultyMix: 'normal',
  gameLength: 'long',
  drawRounds: 1,
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
  // Socrates (Task 24, renamed Task 37a) - HOST ONLY, the phones never show
  // commentary. A short, one-off line shown briefly as the question
  // appears, then fades - never delays the question/answer buttons. null
  // on rare games where every applicable line pool happened to already be
  // exhausted.
  socratesIntro: string | null;
  // Task 38 - every player's current score, for the TV's persistent right
  // column. See PlayerStanding.
  standings: PlayerStanding[];
}

export interface QuestionShowPlayerPayload {
  questionIndex: number;
  totalQuestions: number;
  options: string[];
  category: string;
  questionTimeMs: number;
  paused: boolean;
  pausedByName: string | null;
  // Sabotage (Task 28b) - the effects landing on THIS player for THIS
  // question, empty for everyone else. Per-player by construction: the host
  // payload has no equivalent field, and no phone is ever told about another
  // phone's sabotage. A LIST since Task 31a: at most one entry per effect
  // (already stacked, see ActiveSabotage), but a player can be under several
  // different effects at once.
  yourSabotages: ActiveSabotage[];
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
  // Task 38 - every player's current score, for the TV's persistent right
  // column. See PlayerStanding.
  standings: PlayerStanding[];
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
}

export type RevealShowPayload = RevealHostPayload | RevealPlayerPayload;

export function isRevealHostPayload(payload: RevealShowPayload): payload is RevealHostPayload {
  return 'results' in payload;
}

// Socrates (Task 39) - HOST ONLY, the phones never show commentary; they
// stay on their own reveal result while this beat plays. The round's single
// highest-priority "moment" line, already rendered server-side (placeholders
// substituted, player names sanitised/truncated) by the same selection that
// used to ride along on the REVEAL payload. Never null: the server simply
// doesn't enter the phase when no line fired, so the TV can never be handed
// an empty screen.
export interface SocratesShowPayload {
  line: string;
  // The line's UN-substituted template ({name}/{n}/{category} left as
  // literal placeholders) - not shown anywhere, only hashed client-side
  // (lineHash below) to find this line's pre-generated audio file, since
  // that's exactly what the generator hashed to name it (Task 42b).
  lineTemplate: string;
  // Task 43: the line's optional eleven_v3 tag ("[sarcastic]", "[sighs]"...),
  // carried alongside the template purely so the client hashes the SAME
  // (template, tag) pair the generator did - never rendered, never spoken
  // client-side (it's already baked into the pre-generated audio file).
  lineTag: string | null;
  questionIndex: number;
  totalQuestions: number;
  durationMs: number; // time STILL LEFT, so a reconnect picks up mid-beat
  // The full duration this beat was armed for (audio length, clamped - see
  // resolveSocratesDurationMs on the server), so the client can render an
  // accurate progress bar instead of assuming a fixed span.
  totalDurationMs: number;
  paused: boolean;
  pausedByName: string | null;
  // Task 38 - the TV's persistent right column stays populated here too.
  standings: PlayerStanding[];
}

// How long Socrates holds the screen when a line has no matching audio (or
// its file is missing/unreadable) - the floor of the audio-driven range
// otherwise, so a very short clip still holds long enough to read (Task 42b).
export const SOCRATES_DURATION_MS = 4000;

// ----------------------- Socrates voice lines (Task 42b) -----------------
// Pre-generated audio for each line TEMPLATE lives in client/public/voice/,
// named `${lineHash(template)}.mp3` by dev/generate-voice-lines.ts. The
// client hashes the same template text to find the same file - this is the
// one hashing rule both sides share, so they can never drift apart.
export const SOCRATES_VOICE_DIR = 'voice';

// Must match the bitrate baked into dev/voice/provider.ts's ElevenLabs
// output_format (mp3_44100_64) - used server-side to estimate a clip's
// duration from its file size (constant bitrate: seconds = bytes*8/bps)
// without decoding it or adding an audio-parsing dependency.
export const AUDIO_BITRATE_KBPS = 64;

// The audio-driven SOCRATES duration (totalDurationMs, an ESTIMATE used only
// for the progress bar) never goes below the fallback (a very short clip
// still needs a moment to read) or above this cap. Task 42c: this is ALSO
// what the server actually arms the phase's real advance timer at - a
// backstop for "the client's audio_ended ack never arrives" (host muted, the
// file's missing, or the ack itself got lost), not the normal path, which
// ends the phase exactly when the client reports the clip truly finished
// (see SOCRATES_AUDIO_ENDED). Must comfortably exceed the longest actually
// generated clip - `npm run voice:generate` reports that length after every
// run (last measured: ~9436ms, Task 51's HOT_STREAK_5 line) - with real
// headroom for normal network/decode latency before playback even starts.
export const SOCRATES_MAX_DURATION_MS = 11000;

// sha256(template [+ tag]), hex, first 16 chars - deliberately synchronous
// and dependency-free (no node:crypto, which the browser build can't
// bundle; no Web Crypto, which is async) so it works identically, with no
// await, wherever a line needs to be turned into a filename: the generator
// script, and the client resolving audio for a line it was just handed.
// Task 43: `tag` (an eleven_v3 emotion/non-verbal cue like "[sarcastic]",
// spoken but never shown) is folded into the hash so that changing a
// line's tag changes its filename - the old file is simply orphaned rather
// than silently overwritten, and a tagless line hashes EXACTLY as it did
// before this parameter existed (omitting `tag` reproduces the old
// single-argument hash byte-for-byte), so every already-generated file
// stays valid.
export function lineHash(template: string, tag?: string | null): string {
  const key = tag ? `${tag} ${template}` : template;
  return sha256Hex(key).slice(0, 16);
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

// A standard, from-spec (FIPS 180-4) SHA-256 over a UTF-8 string, returning
// lowercase hex - byte-for-byte identical output to
// `createHash('sha256').update(s, 'utf8').digest('hex')`. Written out in
// full (rather than pulled in as a dependency) purely so this file has zero
// runtime dependencies and can be imported by the browser bundle as-is.
function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  const paddedLen = (((bytes.length + 8) >> 6) + 1) << 6; // next multiple of 64 with room for the 1-bit + 64-bit length
  const msg = new Uint8Array(paddedLen);
  msg.set(bytes);
  msg[bytes.length] = 0x80;
  const view = new DataView(msg.buffer);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let chunk = 0; chunk < paddedLen; chunk += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(chunk + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
      const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => x.toString(16).padStart(8, '0')).join('');
}

export interface VipNextPayload {}

// Task 42c - empty like VipNextPayload above; the event itself (host-only,
// current SOCRATES beat only - see the server handler) is the whole signal.
export interface SocratesAudioEndedPayload {}

// Every player's current score + rank, in room.players' insertion (join)
// order - NEVER re-sorted by score, so the TV's persistent score column
// (Task 38) never reshuffles rows as a total changes. Included on every
// host payload (QUESTION/POWER_UP/REVEAL) so the column always has
// something to render, whatever phase a reconnect lands the host on.
export interface PlayerStanding {
  playerId: string;
  name: string;
  avatarId: string;
  score: number;
  rank: number; // tied scores share the same rank (1,1,3 - not 1,2,3)
  connected: boolean;
}

export interface VipPlayAgainPayload {}

// Pause is a boolean flag on the room, NOT a new GamePhase - the phase
// stays QUESTION/REVEAL/STEAL throughout a pause, so every existing
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
// Task 57 - widened to LobbyUpdatePayload's own shape (mode + availableModes
// included) rather than a hand-kept subset, so a TV reattaching mid-LOBBY
// sees the same mode picker state a live lobby:update would have sent.
export type StateSyncLobbyPayload = LobbyUpdatePayload & { phase: 'LOBBY' };

// The announcement beat is a phase of its own now, so a TV reattaching
// mid-beat gets the same card the live event carried, plus what's left of
// the hold (frozen if the room is paused, like every other remainingMs).
export type StateSyncStageAnnouncePayload = StageAnnouncePayload & {
  phase: 'STAGE_ANNOUNCE';
  remainingMs: number;
};

export type StateSyncPowerUpHostPayload = PowerUpShowHostPayload & {
  phase: 'POWER_UP';
  remainingMs: number;
};

export type StateSyncPowerUpPlayerPayload = PowerUpShowPlayerPayload & {
  phase: 'POWER_UP';
  remainingMs: number;
};

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

// Socrates (Task 39). The TV gets the card back plus what's left of the hold
// (frozen if the room is paused); a phone gets the same reveal view it was
// already showing - the phase is the host's, but a phone reconnecting into it
// still needs its own result, not a blank screen.
export type StateSyncSocratesHostPayload = SocratesShowPayload & {
  phase: 'SOCRATES';
  remainingMs: number;
};

export type StateSyncSocratesPlayerPayload = RevealPlayerPayload & { phase: 'SOCRATES' };

export type StateSyncStealHostPayload = StealShowHostPayload & {
  phase: 'STEAL';
  remainingMs: number;
};

export type StateSyncStealPlayerPayload = StealShowPlayerPayload & {
  phase: 'STEAL';
  remainingMs: number;
};

export interface StateSyncGameOverPayload extends GameOverPayload {
  phase: 'GAME_OVER';
}

// Task 56b - the drawing mode's own state:sync shapes, same `remainingMs`
// convention as every other held phase above (the payload's own durationMs
// is already live too - remainingMs is kept alongside it purely so the
// client can destructure the same field name it does for every other phase).
export type StateSyncDrawHostPayload = DrawShowHostPayload & { phase: 'DRAW'; remainingMs: number };
export type StateSyncDrawPlayerPayload = DrawShowPlayerPayload & { phase: 'DRAW'; remainingMs: number };
export type StateSyncGuessHostPayload = GuessShowHostPayload & { phase: 'GUESS'; remainingMs: number };
export type StateSyncGuessGuesserPayload = GuessShowGuesserPayload & { phase: 'GUESS'; remainingMs: number };
export type StateSyncGuessDrawerPayload = GuessShowDrawerPayload & { phase: 'GUESS'; remainingMs: number };
// No remainingMs here, same reasoning as StateSyncRevealHostPayload above -
// GuessRevealShowPayload already carries its own live autoAdvanceMs.
export type StateSyncGuessRevealPayload = GuessRevealShowPayload & { phase: 'GUESS_REVEAL' };

// Task 65 - the numeric mode's own state:sync shapes, same conventions as
// draw's above: remainingMs alongside the live durationMs for the held
// question, no remainingMs on the reveal (NumericRevealShowPayload already
// carries its own live autoAdvanceMs).
export type StateSyncNumericQuestionHostPayload = NumericQuestionShowHostPayload & {
  phase: 'NUMERIC_QUESTION';
  remainingMs: number;
};
export type StateSyncNumericQuestionPlayerPayload = NumericQuestionShowPlayerPayload & {
  phase: 'NUMERIC_QUESTION';
  remainingMs: number;
};
export type StateSyncNumericRevealPayload = NumericRevealShowPayload & { phase: 'NUMERIC_REVEAL' };

export type StateSyncPayload =
  | StateSyncLobbyPayload
  | StateSyncStageAnnouncePayload
  | StateSyncPowerUpHostPayload
  | StateSyncPowerUpPlayerPayload
  | StateSyncQuestionHostPayload
  | StateSyncQuestionPlayerPayload
  | StateSyncRevealHostPayload
  | StateSyncRevealPlayerPayload
  | StateSyncStealHostPayload
  | StateSyncStealPlayerPayload
  | StateSyncSocratesHostPayload
  | StateSyncSocratesPlayerPayload
  | StateSyncDrawHostPayload
  | StateSyncDrawPlayerPayload
  | StateSyncGuessHostPayload
  | StateSyncGuessGuesserPayload
  | StateSyncGuessDrawerPayload
  | StateSyncGuessRevealPayload
  | StateSyncNumericQuestionHostPayload
  | StateSyncNumericQuestionPlayerPayload
  | StateSyncNumericRevealPayload
  | StateSyncGameOverPayload;

// Both SOCRATES state:sync shapes carry `phase: 'SOCRATES'`, so the usual
// `phase` discriminant isn't enough - `line` is what only the TV's ever has.
export function isSocratesHostPayload(
  payload: StateSyncSocratesHostPayload | StateSyncSocratesPlayerPayload,
): payload is StateSyncSocratesHostPayload {
  return 'line' in payload;
}

// ----------------------- Drawing (Task 53) -------------------------------
// A drawing leaves the phone as ONE lossy data URL, never as strokes: the
// TV only ever needs the finished picture, and a data URL is the cheapest
// thing a socket can carry that an <img> can show with no decoding step.
// Exported at a fixed square size so what the phone drew is what the TV
// gets, whatever the handset's screen size or pixel ratio.
export const DRAWING_EXPORT_SIZE = 512;
export const DRAWING_EXPORT_QUALITY = 0.7;
// Generous next to a real drawing (a full-page doodle measures ~12 KB as a
// data URL) but small enough that a hostile client can't push a photo
// through the socket.
export const DRAWING_MAX_BYTES = 120_000;

export interface DevSubmitDrawingPayload {
  // 'data:image/webp;base64,...' (or image/jpeg where WebP export is
  // unsupported) - always opaque, white background, black strokes.
  imageDataUrl: string;
}

export interface DevDrawingReceivedPayload {
  bytes: number; // length of the data URL as the server received it
  format: string; // 'image/webp' | 'image/jpeg' | 'image/png'
}

// ----------------------- Drawing mode (Task 56a) --------------------------
// A room needs at least this many CONNECTED players before the mode will
// prepare/start a game - below it there's no meaningful "guess someone
// else's drawing" round to run.
export const DRAW_MIN_PLAYERS = 2;

export const DRAW_DURATION_MS = 75_000;
export const GUESS_DURATION_MS = 20_000;
export const GUESS_REVEAL_DURATION_MS = 8_000;

// The drawer's reward for a round is a PROPORTION of eligible guessers who
// got it right, not a flat count - so the max attainable per drawing is the
// same regardless of how many players are in the room (Task 60). This is
// the ceiling at 100% correct; tune after playtest.
// drawerPointsAwarded = round(DRAWER_MAX_POINTS * correctGuessers / eligibleGuessers)
export const DRAWER_MAX_POINTS = 400;

// { words: [w1, w2, w3, w4], rotatable }. Converted from
// drawing-word-sets.md at the repo root, which is the source of truth -
// edit that file first, then mirror the change here. `rotatable: false`
// means the target is always words[0]; `rotatable: true` means
// prepareGame may pick ANY of the four as the target (Task 58) - every
// row currently qualifies, but the field stays for a future set that
// doesn't. Several words below appear in more than one set, so distinct
// SETS no longer implies distinct TARGET words - see prepareGame's
// dealAssignment.
export interface WordSet {
  readonly words: readonly [w1: string, w2: string, w3: string, w4: string];
  readonly rotatable: boolean;
}

export const WORD_SETS: readonly WordSet[] = [
  // Sky and nature
  { words: ['Φεγγάρι', 'Ήλιος', 'Αστέρι', 'Έκλειψη'], rotatable: true },
  { words: ['Σύννεφο', 'Ομίχλη', 'Καπνός', 'Χιονοστιβάδα'], rotatable: true },
  { words: ['Κεραυνός', 'Φωτιά', 'Βέλος', 'Πριόνι'], rotatable: true },
  { words: ['Ηφαίστειο', 'Βουνό', 'Πυραμίδα', 'Σκηνή'], rotatable: true },
  { words: ['Καταρράκτης', 'Ποτάμι', 'Σιντριβάνι', 'Βροχή'], rotatable: true },
  { words: ['Δέντρο', 'Θάμνος', 'Λουλούδι', 'Φοίνικας'], rotatable: true },
  { words: ['Κύμα', 'Θάλασσα', 'Λόφος', 'Αμμόλοφος'], rotatable: true },
  // Buildings and structures
  { words: ['Φάρος', 'Πύργος', 'Καμινάδα', 'Κολόνα'], rotatable: true },
  { words: ['Ναός', 'Παλάτι', 'Εκκλησία', 'Θέατρο'], rotatable: true },
  { words: ['Γέφυρα', 'Υδραγωγείο', 'Τείχος', 'Σκάλα'], rotatable: true },
  { words: ['Ανεμόμυλος', 'Ανεμογεννήτρια', 'Μύλος', 'Έλικας'], rotatable: true },
  { words: ['Κάστρο', 'Πύλη', 'Επάλξεις', 'Ταράτσα'], rotatable: true },
  { words: ['Πηγάδι', 'Βαρέλι', 'Καζάνι', 'Κουβάς'], rotatable: true },
  // Transport
  { words: ['Βάρκα', 'Άγκυρα', 'Φεγγάρι', 'Χαμόγελο'], rotatable: true },
  { words: ['Αεροπλάνο', 'Ελικόπτερο', 'Πύραυλος', 'Χαρταετός'], rotatable: true },
  { words: ['Ποδήλατο', 'Μοτοσικλέτα', 'Πατίνι', 'Καρότσι'], rotatable: true },
  { words: ['Τρένο', 'Λεωφορείο', 'Φορτηγό', 'Τραμ'], rotatable: true },
  { words: ['Άρμα', 'Καρότσα', 'Τρακτέρ', 'Αλέτρι'], rotatable: true },
  // Animals
  { words: ['Λιοντάρι', 'Γάτα', 'Σκύλος', 'Λύκος'], rotatable: true },
  { words: ['Ελέφαντας', 'Ρινόκερως', 'Ιπποπόταμος', 'Ταύρος'], rotatable: true },
  { words: ['Καμηλοπάρδαλη', 'Καμήλα', 'Άλογο', 'Ελάφι'], rotatable: true },
  { words: ['Δελφίνι', 'Φάλαινα', 'Καρχαρίας', 'Φώκια'], rotatable: true },
  { words: ['Χταπόδι', 'Μέδουσα', 'Αστερίας', 'Καλαμάρι'], rotatable: true },
  { words: ['Αετός', 'Κουκουβάγια', 'Γεράκι', 'Περιστέρι'], rotatable: true },
  { words: ['Πεταλούδα', 'Μέλισσα', 'Λιβελούλα', 'Μύγα'], rotatable: true },
  { words: ['Φίδι', 'Σκουλήκι', 'Χέλι', 'Σχοινί'], rotatable: true },
  { words: ['Χελώνα', 'Σαλιγκάρι', 'Καβούρι', 'Ασπίδα'], rotatable: true },
  { words: ['Σκαντζόχοιρος', 'Ποντίκι', 'Σκίουρος', 'Κάστανο'], rotatable: true },
  // Food
  { words: ['Καρπούζι', 'Πεπόνι', 'Μήλο', 'Ντομάτα'], rotatable: true },
  { words: ['Μπανάνα', 'Πιπεριά', 'Αγγούρι', 'Κρουασάν'], rotatable: true },
  { words: ['Παγωτό', 'Τούρτα', 'Κύπελλο', 'Χωνί'], rotatable: true },
  { words: ['Πίτσα', 'Ρόδα', 'Ήλιος', 'Τιμόνι'], rotatable: true },
  { words: ['Σταφύλι', 'Κεράσια', 'Μούρα', 'Μπαλόνια'], rotatable: true },
  { words: ['Αυγό', 'Ελιά', 'Πέτρα', 'Πατάτα'], rotatable: true },
  // Objects
  { words: ['Ρολόι', 'Πυξίδα', 'Τιμόνι', 'Ρόδα'], rotatable: true },
  { words: ['Κλειδί', 'Κουτάλι', 'Πιρούνι', 'Σφυρί'], rotatable: true },
  { words: ['Ομπρέλα', 'Μανιτάρι', 'Καπέλο', 'Αλεξίπτωτο'], rotatable: true },
  { words: ['Κιθάρα', 'Βιολί', 'Λύρα', 'Κουτάλα'], rotatable: true },
  { words: ['Ψαλίδι', 'Πένσα', 'Τσιμπίδα', 'Σταυρός'], rotatable: true },
  { words: ['Κερί', 'Φακός', 'Πυρσός', 'Μολύβι'], rotatable: true },
  { words: ['Ζυγαριά', 'Κούνια', 'Κρεμάστρα', 'Άγκυρα'], rotatable: true },
  { words: ['Κλεψύδρα', 'Ποτήρι', 'Παπιγιόν', 'Χωνί'], rotatable: true },
  { words: ['Καθρέφτης', 'Πίνακας', 'Παράθυρο', 'Πόρτα'], rotatable: true },
  { words: ['Σκάλα', 'Φράχτης', 'Ράγες', 'Πληκτρολόγιο'], rotatable: true },
  // Ancient Athens
  { words: ['Τρίαινα', 'Πιρούνι', 'Δόρυ', 'Τσουγκράνα'], rotatable: true },
  { words: ['Ασπίδα', 'Χελώνα', 'Πιάτο', 'Ρόδα'], rotatable: true },
  { words: ['Περικεφαλαία', 'Καπέλο', 'Μάσκα', 'Κρανίο'], rotatable: true },
  { words: ['Αμφορέας', 'Βάζο', 'Μπουκάλι', 'Κύπελλο'], rotatable: true },
  { words: ['Πάπυρος', 'Χάρτης', 'Πετσέτα', 'Σημαία'], rotatable: true },
  { words: ['Στέμμα', 'Πριόνι', 'Φράχτης', 'Χτένα'], rotatable: true },
] as const;

export interface DrawSubmitPayload {
  // 'data:image/webp;base64,...' - see DRAWING_MAX_BYTES for the size cap
  // enforced server-side (rejected outright, not truncated).
  image: string;
}

export interface DrawGuessPayload {
  choice: number; // 0-3, into that round's shuffled 4 options
}

// 'draw:show' is asymmetric like question:show: the host is a display (no
// word to draw), each player gets only their OWN assigned word - no player
// ever learns another's word before it comes up in the GUESS phase.
export interface DrawShowHostPayload {
  durationMs: number;
  submittedCount: number;
  totalPlayers: number;
  submittedPlayerIds: string[]; // WHO has submitted - never the drawing itself
  paused: boolean;
  pausedByName: string | null;
  standings: PlayerStanding[];
}

export interface DrawShowPlayerPayload {
  wordToDraw: string;
  durationMs: number;
  submitted: boolean; // true on a state:sync catch-up after already submitting
  paused: boolean;
  pausedByName: string | null;
}

export type DrawShowPayload = DrawShowHostPayload | DrawShowPlayerPayload;

export function isDrawHostPayload(payload: DrawShowPayload): payload is DrawShowHostPayload {
  return 'submittedCount' in payload;
}

// Host-only progress ticker, same contract as answer:progress - who has
// submitted, never the drawing itself.
export interface DrawProgressPayload {
  submittedCount: number;
  totalPlayers: number;
  submittedPlayerIds: string[];
}

// 'guess:show' is asymmetric in THREE ways, not two: the host gets the
// drawing plus the 4 shuffled options; a guessing player gets the options
// only (no image); the drawer themselves gets neither - just a spectator
// view, and their own draw:guess is rejected server-side. The correct index
// never appears in ANY of these - only guess_reveal:show carries it, once
// the round is over.
export interface GuessShowHostPayload {
  drawerPlayerId: string;
  drawerName: string;
  drawerAvatarId: string;
  image: string;
  options: string[]; // 4, shuffled - correct index withheld
  roundIndex: number; // 0-based, into the queue of submitted drawings
  totalRounds: number;
  durationMs: number;
  guessedCount: number;
  totalGuessers: number; // connected players minus the drawer
  paused: boolean;
  pausedByName: string | null;
  standings: PlayerStanding[];
}

export interface GuessShowGuesserPayload {
  isDrawer: false;
  drawerName: string;
  drawerAvatarId: string;
  options: string[]; // 4, shuffled - correct index withheld
  roundIndex: number;
  totalRounds: number;
  durationMs: number;
  yourGuess: number | null; // set only on a state:sync catch-up
  paused: boolean;
  pausedByName: string | null;
}

// The drawer's own view of their round - no options at all, so there is
// nothing here for a client to even mistakenly submit a guess against.
export interface GuessShowDrawerPayload {
  isDrawer: true;
  roundIndex: number;
  totalRounds: number;
  durationMs: number;
  guessedCount: number;
  totalGuessers: number;
  paused: boolean;
  pausedByName: string | null;
}

export type GuessShowPayload = GuessShowHostPayload | GuessShowGuesserPayload | GuessShowDrawerPayload;

export function isGuessHostPayload(payload: GuessShowPayload): payload is GuessShowHostPayload {
  return 'image' in payload;
}

export function isGuessDrawerPayload(
  payload: GuessShowGuesserPayload | GuessShowDrawerPayload,
): payload is GuessShowDrawerPayload {
  return payload.isDrawer;
}

// Host-only progress ticker for the GUESS phase - who has guessed, never
// what they picked.
export interface GuessProgressPayload {
  guessedCount: number;
  totalGuessers: number;
  guessedPlayerIds: string[];
}

export interface GuessRevealResult {
  playerId: string;
  name: string;
  avatarId: string;
  choice: number | null; // null = did not guess
  correct: boolean;
  pointsAwarded: number;
  totalScore: number;
  timeMs: number | null;
}

// Public and symmetric, like reveal:show - the round is over, so the
// drawing, the correct index and every guesser's result are all safe to
// send to everyone, including the drawer.
export interface GuessRevealShowPayload {
  drawerPlayerId: string;
  drawerName: string;
  drawerAvatarId: string;
  image: string;
  correctIndex: number;
  correctWord: string;
  options: string[];
  results: GuessRevealResult[]; // guessers only - the drawer isn't one
  drawerPointsAwarded: number;
  drawerTotalScore: number;
  roundIndex: number;
  totalRounds: number;
  autoAdvanceMs: number;
  paused: boolean;
  pausedByName: string | null;
  standings: PlayerStanding[];
}

// ----------------------- Numeric estimate mode (Task 65) -------------------
// Standalone for now (Task 66 folds it into the quiz as a stage) - the wire
// contract and the pure mechanic (maxForAnswer, scoring, payload builders;
// server/src/numeric.ts) are kept mode-agnostic on purpose, so that later
// merge only ever has to rewrite server/src/modes/numeric.ts, the shell.
export const NUMERIC_MIN_PLAYERS = 2;
export const NUMERIC_QUESTION_DURATION_MS = 20_000;
export const NUMERIC_REVEAL_DURATION_MS = 8_000;

export interface NumericSubmitPayload {
  value: number; // clamped server-side to 0..max - never rejected out of range
}

// 'numeric_question:show' is asymmetric like question:show: the host and
// every player get the same slider bounds (max, sliderStep), never the
// answer - that stays server-only until NUMERIC_REVEAL.
export interface NumericQuestionShowHostPayload {
  questionIndex: number;
  totalQuestions: number;
  text: string;
  category: string;
  max: number;
  sliderStep: number;
  durationMs: number;
  submittedCount: number;
  totalPlayers: number;
  paused: boolean;
  pausedByName: string | null;
  standings: PlayerStanding[];
}

export interface NumericQuestionShowPlayerPayload {
  questionIndex: number;
  totalQuestions: number;
  text: string;
  category: string;
  max: number;
  sliderStep: number;
  durationMs: number;
  submitted: boolean; // true on a state:sync catch-up after already submitting
  paused: boolean;
  pausedByName: string | null;
}

export type NumericQuestionShowPayload = NumericQuestionShowHostPayload | NumericQuestionShowPlayerPayload;

export function isNumericQuestionHostPayload(
  payload: NumericQuestionShowPayload,
): payload is NumericQuestionShowHostPayload {
  return 'submittedCount' in payload;
}

// Public and symmetric, like reveal:show - the round is over, so the real
// answer and everyone's distance/rank/score are all safe to send to everyone.
export interface NumericRevealResult {
  playerId: string;
  name: string;
  avatarId: string;
  value: number | null; // null - never submitted
  distance: number;
  rank: number; // tied distances share the better rank (1,1,3 - not 1,2,3)
  exact: boolean;
  pointsAwarded: number;
  totalScore: number;
}

export interface NumericRevealShowPayload {
  questionIndex: number;
  totalQuestions: number;
  text: string;
  category: string;
  answer: number;
  max: number;
  results: NumericRevealResult[];
  autoAdvanceMs: number;
  paused: boolean;
  pausedByName: string | null;
  standings: PlayerStanding[];
}

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
  [ClientEvents.VIP_SET_MODE]: (payload: VipSetModePayload) => void;
  [ClientEvents.GAME_PAUSE]: (payload: GamePausePayload) => void;
  [ClientEvents.GAME_RESUME]: (payload: GameResumePayload) => void;
  [ClientEvents.VIP_RESET_TO_LOBBY]: (payload: VipResetToLobbyPayload) => void;
  [ClientEvents.ROOM_PEEK]: (payload: RoomPeekPayload) => void;
  [ClientEvents.POWER_UP_CHOOSE]: (payload: PowerUpChoosePayload) => void;
  [ClientEvents.STEAL_CHOOSE]: (payload: StealChoosePayload) => void;
  [ClientEvents.SOCRATES_AUDIO_ENDED]: (payload: SocratesAudioEndedPayload) => void;
  [ClientEvents.DEV_SUBMIT_DRAWING]: (payload: DevSubmitDrawingPayload) => void;
  [ClientEvents.DRAW_SUBMIT]: (payload: DrawSubmitPayload) => void;
  [ClientEvents.DRAW_GUESS]: (payload: DrawGuessPayload) => void;
  [ClientEvents.NUMERIC_SUBMIT]: (payload: NumericSubmitPayload) => void;
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
  [ServerEvents.GAME_OVER]: (payload: GameOverPayload) => void;
  [ServerEvents.STATE_SYNC]: (payload: StateSyncPayload) => void;
  [ServerEvents.VIP_CHANGED]: (payload: VipChangedPayload) => void;
  [ServerEvents.SETTINGS_UPDATED]: (payload: SettingsUpdatedPayload) => void;
  [ServerEvents.GAME_PAUSED]: (payload: PausedPayload) => void;
  [ServerEvents.GAME_RESUMED]: (payload: ResumedPayload) => void;
  [ServerEvents.ROOM_PEEK_RESULT]: (payload: RoomPeekResultPayload) => void;
  [ServerEvents.POWER_UP_SHOW]: (payload: PowerUpShowPayload) => void;
  [ServerEvents.POWER_UP_CHOICE_ACCEPTED]: (payload: PowerUpChoiceAcceptedPayload) => void;
  [ServerEvents.POWER_UP_PROGRESS]: (payload: PowerUpProgressPayload) => void;
  [ServerEvents.STAGE_ANNOUNCE]: (payload: StageAnnouncePayload) => void;
  [ServerEvents.SOCRATES_SHOW]: (payload: SocratesShowPayload) => void;
  [ServerEvents.STEAL_SHOW]: (payload: StealShowPayload) => void;
  [ServerEvents.STEAL_RESOLVED]: (payload: StealResolvedPayload) => void;
  [ServerEvents.CROWD_MOOD]: (payload: CrowdMoodPayload) => void;
  [ServerEvents.DEV_DRAWING_RECEIVED]: (payload: DevDrawingReceivedPayload) => void;
  [ServerEvents.DRAW_SHOW]: (payload: DrawShowPayload) => void;
  [ServerEvents.DRAW_PROGRESS]: (payload: DrawProgressPayload) => void;
  [ServerEvents.GUESS_SHOW]: (payload: GuessShowPayload) => void;
  [ServerEvents.GUESS_PROGRESS]: (payload: GuessProgressPayload) => void;
  [ServerEvents.GUESS_REVEAL_SHOW]: (payload: GuessRevealShowPayload) => void;
  [ServerEvents.NUMERIC_QUESTION_SHOW]: (payload: NumericQuestionShowPayload) => void;
  [ServerEvents.NUMERIC_REVEAL_SHOW]: (payload: NumericRevealShowPayload) => void;
};
