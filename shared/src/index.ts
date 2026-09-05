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
  // Task 67 - dev-only content-review harness (/dev/numeric). Same spirit as
  // DEV_SUBMIT_DRAWING above: no room, no phase, just a request for the raw
  // question pool so it can be judged before it ships.
  DEV_GET_NUMERIC_QUESTIONS: 'dev:get_numeric_questions',
  // Task 142 - dev-only voice-line review harness (/dev/voice). Same spirit
  // as DEV_GET_NUMERIC_QUESTIONS above: no room, no phase, just a request
  // for every Socrates line so it can be rated before an ElevenLabs batch.
  DEV_GET_VOICE_LINES: 'dev:get_voice_lines',
  // Task 56a - the real drawing mode. DRAW_SUBMIT carries the finished
  // picture, DRAW_GUESS carries one guesser's pick among that round's 4
  // options. Both are phase-gated server-side exactly like SUBMIT_ANSWER.
  DRAW_SUBMIT: 'draw:submit',
  DRAW_GUESS: 'draw:guess',
  // Task 65 - the numeric-estimate mode. One event: the player's guess,
  // clamped server-side to 0..max - never rejected for being out of range.
  NUMERIC_SUBMIT: 'player:numeric_submit',
  // Task 127 - Η Δίκη, the quiz finale. Its own event rather than a second
  // meaning for SUBMIT_ANSWER: the trial has no sabotage, no shuffled option
  // order and no per-question `answers` map, and what the server records is
  // an elapsed-at-lock-in figure the quiz's own handler has no use for.
  TRIAL_SUBMIT: 'player:trial_submit',
  // Task 156 - the blitz mode. One swipe per statement, in order: the phone
  // sends the statement's index and which way it went; the server stamps
  // it, checks it is the NEXT expected index (no going back, no skipping)
  // and never acks - the phone advances on its own, the truth stays here.
  BLITZ_SWIPE: 'player:blitz_swipe',
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
  STAGE_ANNOUNCE: 'stage:announce',
  SOCRATES_SHOW: 'socrates:show',
  STEAL_SHOW: 'steal:show',
  STEAL_RESOLVED: 'steal:resolved',
  CROWD_MOOD: 'crowd:mood',
  // Task 36b - the ramp that drives the host's crowd-loop crossfade. A
  // SECOND event alongside crowd:mood (which stays untouched): mood picks
  // which one-shots/loops are in play, this is the single 0..1 number that
  // crossfades between them. Host-only, exactly like crowd:mood.
  CROWD_INTENSITY: 'crowd:intensity',
  DEV_DRAWING_RECEIVED: 'dev:drawing_received',
  // Task 67 - the response half of DEV_GET_NUMERIC_QUESTIONS above.
  DEV_NUMERIC_QUESTIONS: 'dev:numeric_questions',
  // Task 142 - the response half of DEV_GET_VOICE_LINES above.
  DEV_VOICE_LINES: 'dev:voice_lines',
  // Task 56a - the drawing mode's own phases. DRAW/GUESS are asymmetric like
  // question:show/steal:show; GUESS_REVEAL is symmetric (the correct index
  // is finally safe to send), like reveal:show.
  DRAW_SHOW: 'draw:show',
  GUESS_SHOW: 'guess:show',
  GUESS_REVEAL_SHOW: 'guess_reveal:show',
  // Task 65 - the numeric-estimate mode's own phases, symmetric like
  // draw:show/guess_reveal:show: NUMERIC_QUESTION never carries the answer,
  // NUMERIC_REVEAL is the one place it becomes safe to send.
  NUMERIC_QUESTION_SHOW: 'numeric_question:show',
  NUMERIC_REVEAL_SHOW: 'numeric_reveal:show',
  // Task 127 - Η Δίκη. TRIAL_QUESTION is asymmetric like question:show (the
  // host gets the question text and WHO has locked in; a phone gets its own
  // life and nothing about anyone else's); TRIAL_REVEAL is symmetric like
  // reveal:show - that is the first moment the correct answer, every
  // lock-in and every drain are safe to send.
  TRIAL_QUESTION_SHOW: 'trial_question:show',
  TRIAL_REVEAL_SHOW: 'trial_reveal:show',
  // Task 66 - host-only progress ticker, same contract as draw:progress: WHO
  // has locked in, never what they guessed.
  // Task 156 - the blitz mode. BLITZ_SHOW is asymmetric like question:show
  // (phones get the K statement TEXTS, never their truth; the host gets
  // per-player progress and no texts at all); BLITZ_PROGRESS is host-only
  // (how far each player is, never what they swiped); BLITZ_REVEAL_SHOW is
  // asymmetric too - a phone gets ITS OWN counts, the host every player's.
  BLITZ_SHOW: 'blitz:show',
  BLITZ_PROGRESS: 'blitz:progress',
  BLITZ_REVEAL_SHOW: 'blitz_reveal:show',
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
// Task 134 - 'full' is THE game: one show that runs the quiz, one drawing
// round, a numeric segment, a stealing quiz stage and the trial back to back.
// The other three stay registered and VIP-selectable as the dev harness for
// their own mechanics; 'full' composes them rather than copying any of it.
// Task 156 - 'blitz' is a standalone true/false swipe mode (BLITZ ->
// BLITZ_REVEAL), registry-selectable like the other three; not yet composed
// into 'full'.
export type GameModeId = 'quiz' | 'draw' | 'numeric' | 'full' | 'blitz';
export const GAME_MODE_IDS: readonly GameModeId[] = ['quiz', 'draw', 'numeric', 'full', 'blitz'];
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
  // Task 127 - Η Δίκη, the quiz mode's FINALE (not a mode of its own): the
  // same four-option questions, but a score is now LIFE and it drains while
  // the question is open. Reached after the last question of the last quiz
  // stage, and left only for GAME_OVER.
  | 'TRIAL_QUESTION'
  | 'TRIAL_REVEAL'
  // Task 156 - the 'blitz' mode's own phases: everyone swipes through the
  // same K true/false statements at their own pace, then one reveal.
  | 'BLITZ'
  | 'BLITZ_REVEAL'
  | 'GAME_OVER';

// Crowd mood (Task 35, extended to draw/numeric in Task 151) - server-derived,
// HOST ONLY (audio, once it lands, is host-only too). Never computed by any
// client. 'calm' is the default - LOBBY, STAGE_ANNOUNCE, and the early part
// of every mode's own timed round (quiz QUESTION, draw DRAW, numeric
// NUMERIC_QUESTION); 'tension' covers the last third of that same timer plus
// the whole POWER_UP/STEAL/GUESS phases; 'cheer'/'boo' fire at every mode's
// reveal (REVEAL, GUESS_REVEAL, NUMERIC_REVEAL, TRIAL_REVEAL) depending on
// whether most players/guessers answered correctly (or, for numeric, whether
// anyone landed within half the answer), and 'boo' fires again whenever a
// STEAL resolves.
export type CrowdMood = 'calm' | 'tension' | 'cheer' | 'boo';

export interface CrowdMoodPayload {
  mood: CrowdMood;
}

// Crowd INTENSITY (Task 36b) - a second, independent signal from crowd:mood.
// Mood picks WHICH one-shots/loops are in play; intensity is the single
// 0..1 number that crossfades the host's three ambient crowd loops. Always a
// RAMP, never a snap: `from` (or, if omitted, whatever the host is currently
// at) moves to `value` over `rampMs`. HOST ONLY, exactly like crowd:mood.
export interface CrowdIntensityPayload {
  value: number;
  from?: number;
  rampMs: number;
}

// What a phase needs from its caller to compute its own intensity -
// deliberately NOT the whole Room (this stays a pure function, callable from
// a dev tool with no room at all). `timerDurationMs` is the phase's own
// timed-round length, for the phases that ramp across it (QUESTION/GUESS/
// NUMERIC_QUESTION); `round` is the 1-based trial round number, for
// TRIAL_QUESTION/TRIAL_REVEAL's escalating formula. The two booleans are
// modifiers applied on top of whichever phase reads them.
export interface CrowdIntensityContext {
  timerDurationMs?: number;
  round?: number;
  isLastQuestionOfStage?: boolean;
  closeScoresPending?: boolean;
  // Task 165 - the drawer's remaining time crossed DRAW_WARNING_MS.
  drawWarningCrossed?: boolean;
}

// Caps a modifier stack at .95 - GAME_OVER's own .8 base is deliberately
// left room to still read as a step down from a maxed-out trial round.
const CROWD_INTENSITY_MODIFIER_CAP = 0.95;

// Pure - the ONE place the ramp table lives, so a dev tool (or a future
// intensity-rating harness, same spirit as socrates.ts's rating page) can
// import this without a Room. Every GamePhase is an explicit case: a new
// phase that forgets to extend this switch is a compile error via the
// `never` check below, never a silent fallback value.
export function crowdIntensityFor(phase: GamePhase, ctx: CrowdIntensityContext = {}): CrowdIntensityPayload {
  let result: CrowdIntensityPayload;
  switch (phase) {
    case 'LOBBY':
      result = { value: 0.1, rampMs: 800 };
      break;
    case 'STAGE_ANNOUNCE':
      result = { value: 0.3, rampMs: 800 };
      break;
    case 'POWER_UP':
      result = { value: 0.35, rampMs: 800 };
      break;
    case 'QUESTION':
      result = { value: 0.7, from: 0.25, rampMs: ctx.timerDurationMs ?? DEFAULT_ROOM_SETTINGS.questionTimeMs };
      break;
    case 'REVEAL':
      result = { value: 0.3, rampMs: 800 };
      break;
    case 'STEAL':
      result = { value: 0.12, rampMs: 300 };
      break;
    case 'SOCRATES':
      result = { value: 0.12, rampMs: 300 };
      break;
    case 'DRAW':
      result = { value: 0.3, rampMs: 800 };
      break;
    case 'GUESS':
      result = { value: 0.6, from: 0.25, rampMs: ctx.timerDurationMs ?? GUESS_DURATION_MS };
      break;
    case 'GUESS_REVEAL':
      result = { value: 0.3, rampMs: 800 };
      break;
    case 'NUMERIC_QUESTION':
      result = { value: 0.6, from: 0.25, rampMs: ctx.timerDurationMs ?? NUMERIC_QUESTION_DURATION_MS };
      break;
    case 'NUMERIC_REVEAL':
      result = { value: 0.3, rampMs: 800 };
      break;
    case 'TRIAL_QUESTION':
    case 'TRIAL_REVEAL':
      result = { value: Math.min(0.9, 0.4 + 0.5 * ((ctx.round ?? 1) / 16)), rampMs: 800 };
      break;
    case 'BLITZ':
      result = { value: 0.6, from: 0.25, rampMs: ctx.timerDurationMs ?? BLITZ_DURATION_MS };
      break;
    case 'BLITZ_REVEAL':
      result = { value: 0.3, rampMs: 800 };
      break;
    case 'GAME_OVER':
      result = { value: 0.8, rampMs: 600 };
      break;
    default: {
      const _exhaustive: never = phase;
      throw new Error(`crowdIntensityFor: unhandled phase ${String(_exhaustive)}`);
    }
  }

  let { value } = result;
  if (ctx.isLastQuestionOfStage) {
    value = Math.min(CROWD_INTENSITY_MODIFIER_CAP, value + 0.15);
  }
  if (ctx.closeScoresPending) {
    value = Math.min(CROWD_INTENSITY_MODIFIER_CAP, value + 0.15);
  }
  if (ctx.drawWarningCrossed) {
    value = Math.min(CROWD_INTENSITY_MODIFIER_CAP, value + 0.15);
  }
  return { ...result, value };
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
// Task 134 - WHICH mechanic a stage runs. Absent means 'quiz' (see
// stageSegment below), so the quiz's own table needed no edit: only the full
// mode's table has stages that are a drawing round, a numeric segment or the
// trial. questionCount is 0 for all three - they draw no quiz questions - and
// that is exactly what makes stageForQuestionIndex skip straight over them
// when it maps a quiz question index onto the table.
export type StageSegment = 'quiz' | 'draw' | 'numeric' | 'trial';

export interface StageDefinition {
  stage: number; // 1-based - matches Room.stage server-side
  questionCount: number;
  segment?: StageSegment;
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
  // Multiplies this stage's per-question points before rounding (Task 135).
  // Undefined means 1 - every quiz-mode row, unchanged.
  scoreScale?: number;
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
    title: 'Γύρος 3 — Η Συκοφαντία',
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

// The one place a stage's mechanic is read, so 'quiz' stays the default for
// every row that predates Task 134 rather than being spelled out 3 times.
export function stageSegment(definition: StageDefinition): StageSegment {
  return definition.segment ?? 'quiz';
}

// Η Δίκη as a STAGE ROW. The trial has always been announced through the
// STAGE_ANNOUNCE phase (Task 127) but was never IN a stage table - its number
// was computed as "one past the quiz stages" at two separate call sites. It is
// a row now, appended to whatever table a mode hands out, so "the trial is the
// last card of the night" is one fact in one place and totalStages is simply
// the table's length in every mode. `stage` is a parameter because the number
// depends on how many stages precede it (4 for a medium quiz, 5 for the full
// show).
export function trialStageRow(stage: number): StageDefinition {
  return {
    stage,
    // Not a fixed run of questions: the trial lasts until one player is left
    // standing, so it draws nothing from room.questions and every quiz index
    // maps straight past it.
    questionCount: 0,
    segment: 'trial',
    powerUpBeforeEveryQuestion: false,
    stealAfterEveryQuestion: false,
    title: TRIAL_STAGE_TITLE,
    tagline: TRIAL_STAGE_TAGLINE,
  };
}

// ---------------------------------------------------------------------------
// The full show (Task 134)
// ---------------------------------------------------------------------------

// How many quiz questions EACH of the full mode's two quiz stages asks. The
// VIP's gameLength maps to this and nothing else: the drawing round and the
// numeric segment are fixed, and every stage always runs (unlike the quiz
// mode, where gameLength picks a SLICE of the table).
export const FULL_QUIZ_QUESTION_COUNTS: Record<GameLength, number> = {
  short: 2,
  medium: 3,
  long: 5,
};

// Task 150 - how many draw-then-guess-everything cycles the full show's
// drawing stage runs, by the VIP's gameLength. Same shape as
// FULL_QUIZ_QUESTION_COUNTS: short/medium keep the original single round,
// long gets three. Not a setting - the VIP never picks this directly, only
// gameLength.
export const FULL_DRAW_ROUNDS_BY_LENGTH: Record<GameLength, number> = {
  short: 1,
  medium: 1,
  long: 3,
};

// Fixed, not gameLength-dependent - the show's shape is the show's shape.
export const FULL_NUMERIC_QUESTION_COUNT = 3;

// Task 135 - the full show's quiz stages pay on the same ~400-point scale the
// draw and numeric stages already do, instead of the standalone quiz's
// up-to-1500. BASE_POINTS + SPEED_BONUS_MAX is a max-speed correct answer's
// raw total, so this is exactly the factor that lands that total at 400.
export const FULL_QUIZ_SCORE_SCALE = 400 / (BASE_POINTS + SPEED_BONUS_MAX);

// Task 136 - the draw stage's GUESS scoring reuses calculatePoints too (same
// BASE_POINTS/SPEED_BONUS_MAX formula, see server/src/modes/draw.ts's
// endGuessRound), so a fast correct guess was landing at up to 1500 while the
// drawer's own reward is capped at DRAWER_MAX_POINTS (400). Same derivation,
// same target, kept as its own constant since it scales a different call site.
export const FULL_GUESS_SCORE_SCALE = 400 / (BASE_POINTS + SPEED_BONUS_MAX);

// The show, in order. questionCount on the two quiz rows is the MEDIUM figure;
// fullStagesForLength substitutes the real one, which is why every consumer
// must go through that function rather than reading this table directly.
export const FULL_STAGES: readonly StageDefinition[] = [
  {
    stage: 1,
    questionCount: FULL_QUIZ_QUESTION_COUNTS.medium,
    segment: 'quiz',
    powerUpBeforeEveryQuestion: true,
    stealAfterEveryQuestion: false,
    scoreScale: FULL_QUIZ_SCORE_SCALE,
    title: 'Γύρος 1 — Η Αγορά',
    tagline: 'Ανοιχτή αντιπαράθεση. Πριν από κάθε ερώτηση διαλέγετε σοφιστικό τέχνασμα.',
  },
  {
    stage: 2,
    questionCount: 0,
    segment: 'draw',
    powerUpBeforeEveryQuestion: false,
    stealAfterEveryQuestion: false,
    title: 'Γύρος 2 — Ζωγραφική',
    tagline: 'Σχεδιάζετε όλοι μαζί. Μετά κρίνεται ένα ένα το έργο σας.',
  },
  {
    stage: 3,
    questionCount: 0,
    segment: 'numeric',
    powerUpBeforeEveryQuestion: false,
    stealAfterEveryQuestion: false,
    title: 'Γύρος 3 — Εκτίμηση',
    tagline: 'Κανείς δεν ξέρει τον αριθμό. Πλησιάστε τον περισσότερο από τους άλλους.',
  },
  {
    stage: 4,
    questionCount: FULL_QUIZ_QUESTION_COUNTS.medium,
    segment: 'quiz',
    powerUpBeforeEveryQuestion: false,
    stealAfterEveryQuestion: true,
    scoreScale: FULL_QUIZ_SCORE_SCALE,
    title: 'Γύρος 4 — Η Συκοφαντία',
    tagline: 'Ο πιο γρήγορος σωστός κλέβει πόντους από όποιον κρίνει ένοχο.',
  },
  // Stage 5 is the trial row, built by fullStagesForLength - one definition of
  // that card, shared with the quiz mode.
] as const;

// The full mode's table for a given length: every stage, always, with the two
// quiz rows' counts substituted and Η Δίκη appended as the last card.
export function fullStagesForLength(length: GameLength): readonly StageDefinition[] {
  const questionCount = FULL_QUIZ_QUESTION_COUNTS[length];
  const stages = FULL_STAGES.map((definition) =>
    stageSegment(definition) === 'quiz' ? { ...definition, questionCount } : definition,
  );
  return [...stages, trialStageRow(FULL_STAGES.length + 1)];
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

// Task 163c - the HOST's own view of a single target's currently-landed
// effects, on QuestionShowHostPayload only (see below). Shaped differently
// from ActiveSabotage/`yourSabotages` on purpose: the TV never needs a
// player's remaining-vs-total split (no fade-out countdown is drawn from
// this), just "is this figure iced/inked right now, and how hard" - a
// resolved snapshot, not the timer data a phone's own effect view needs.
// `shuffle` has no entry here - it has no visual FX (see SabotageEffect).
export interface PlayerSabotageState {
  iceMs?: number; // remaining, not total - a figure's crystal doesn't need a duration
  inkLevel?: number; // 1..MAX_INK_INTENSITY
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
  // Task 163c - who is currently iced/inked, so the sophists row can show
  // it - the row has no other way to learn this, since a player's own
  // `yourSabotages` (below) is per-player-private and never broadcast.
  // Sparse: a playerId with nothing landed on them is simply absent, never
  // an empty object. HOST ONLY - QuestionShowPlayerPayload does not gain
  // this field; see server/src/payloads.ts's buildQuestionHostSabotage.
  sabotage: Record<string, PlayerSabotageState>;
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
  // Task 137 - true whenever the trial decided this game (buildGameOver's
  // declaredWinner branch): the TV shows no numbers at all in that case
  // (score is life there and can finish negative, so there is nothing worth
  // printing), and `standings` is already in SURVIVAL order (winner, then
  // reverse elimination order) rather than sorted by score.
  isTrialResult: boolean;
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

// Task 127 - the trial's own state:sync shapes, same conventions as every
// held phase above: remainingMs alongside the question's live durationMs, and
// none on the reveal (TrialRevealShowPayload carries its own autoAdvanceMs).
export type StateSyncTrialQuestionHostPayload = TrialQuestionShowHostPayload & {
  phase: 'TRIAL_QUESTION';
  remainingMs: number;
};
export type StateSyncTrialQuestionPlayerPayload = TrialQuestionShowPlayerPayload & {
  phase: 'TRIAL_QUESTION';
  remainingMs: number;
};
export type StateSyncTrialRevealPayload = TrialRevealShowPayload & { phase: 'TRIAL_REVEAL' };
// Task 156 - the blitz mode, same builder-plus-remainingMs shape. durationMs
// in both BLITZ payloads is already "time STILL LEFT" (see BlitzShowHostPayload).
export type StateSyncBlitzHostPayload = BlitzShowHostPayload & { phase: 'BLITZ'; remainingMs: number };
export type StateSyncBlitzPlayerPayload = BlitzShowPlayerPayload & { phase: 'BLITZ'; remainingMs: number };
export type StateSyncBlitzRevealHostPayload = BlitzRevealHostPayload & { phase: 'BLITZ_REVEAL' };
export type StateSyncBlitzRevealPlayerPayload = BlitzRevealPlayerPayload & { phase: 'BLITZ_REVEAL' };

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
  | StateSyncTrialQuestionHostPayload
  | StateSyncTrialQuestionPlayerPayload
  | StateSyncTrialRevealPayload
  | StateSyncBlitzHostPayload
  | StateSyncBlitzPlayerPayload
  | StateSyncBlitzRevealHostPayload
  | StateSyncBlitzRevealPlayerPayload
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

// Task 67 - the /dev/numeric review tool's own request/response pair. The
// raw pool as authored, nothing computed - max/sliderStep/validity are all
// re-derived client-side (see NUMERIC_ROUND_VALUES's own comment) so the
// tool is checking the SAME formula production runs, not trusting a value
// the server already computed for it.
export interface DevNumericQuestionsPayload {
  questions: { text: string; category: string; answer: number }[];
}

// Task 142 - the /dev/voice review tool's own request/response pair. One
// entry per line across every Socrates pool (server/src/socrates.ts's
// collectVoiceLineEntries) - moment, raw template, optional voice tag, and
// the hash its mp3 is named after (client/public/voice/<hash>.mp3).
export interface DevVoiceLinesPayload {
  lines: { moment: string; line: string; tag: string | null; hash: string }[];
}

// ----------------------- Drawing mode (Task 56a) --------------------------
// A room needs at least this many CONNECTED players before the mode will
// prepare/start a game - below it there's no meaningful "guess someone
// else's drawing" round to run.
export const DRAW_MIN_PLAYERS = 2;

export const DRAW_DURATION_MS = 75_000;
// Task 165 - the remaining-time threshold (not elapsed) that flips the
// drawer's phone into urgency and bumps crowd:intensity.
export const DRAW_WARNING_MS = 13_000;
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
  // Batch 2 (Task 168) - fixed targets, see design/drawing-word-sets-2.md
  { words: ['Χέρι', 'Γάντι', 'Φύλλο', 'Χτένα'], rotatable: false },
  { words: ['Μάτι', 'Ψάρι', 'Πλανήτης', 'Αυγό'], rotatable: false },
  { words: ['Πόδι', 'Παπούτσι', 'Κάλτσα', 'Σίδερο'], rotatable: false },
  { words: ['Καρδιά', 'Φράουλα', 'Μήλο', 'Φύλλο'], rotatable: false },
  { words: ['Δόντι', 'Βουνό', 'Κόκαλο', 'Διαμάντι'], rotatable: false },
  { words: ['Σανδάλι', 'Παντόφλα', 'Σκι', 'Ρακέτα'], rotatable: false },
  { words: ['Γραβάτα', 'Βέλος', 'Φύλλο', 'Παγωτό'], rotatable: false },
  { words: ['Παντελόνι', 'Ψαλίδι', 'Πιρούνι', 'Πύλη'], rotatable: false },
  { words: ['Γυαλιά', 'Ποδήλατο', 'Κυάλια', 'Μάσκα'], rotatable: false },
  { words: ['Μουστάκι', 'Πεταλούδα', 'Φρύδι', 'Παπιγιόν'], rotatable: false },
  { words: ['Καρέκλα', 'Σκάλα', 'Κρεμάστρα', 'Τραπέζι'], rotatable: false },
  { words: ['Κρεβάτι', 'Καναπές', 'Τραπέζι', 'Παγκάκι'], rotatable: false },
  { words: ['Πόρτα', 'Παράθυρο', 'Πίνακας', 'Ντουλάπα'], rotatable: false },
  { words: ['Τηγάνι', 'Ρακέτα', 'Καθρέφτης', 'Μεγεθυντικός φακός'], rotatable: false },
  { words: ['Λάμπα', 'Μανιτάρι', 'Παγωτό', 'Ομπρέλα'], rotatable: false },
  { words: ['Βρύση', 'Κύκνος', 'Άγκυρα', 'Σφυρί'], rotatable: false },
  { words: ['Σκούπα', 'Πινέλο', 'Τσουγκράνα', 'Κουπί'], rotatable: false },
  { words: ['Κουρτίνα', 'Καταρράκτης', 'Σημαία', 'Πετσέτα'], rotatable: false },
  { words: ['Χαλί', 'Σοκολάτα', 'Πόρτα', 'Πίνακας'], rotatable: false },
  { words: ['Τηλεόραση', 'Παράθυρο', 'Πίνακας', 'Κουτί'], rotatable: false },
  { words: ['Τύμπανο', 'Βαρέλι', 'Καζάνι', 'Τούρτα'], rotatable: false },
  { words: ['Τρομπέτα', 'Χωνί', 'Λουλούδι', 'Κλάξον'], rotatable: false },
  { words: ['Πιάνο', 'Πληκτρολόγιο', 'Ζέβρα', 'Σκάλα'], rotatable: false },
  { words: ['Μπάλα', 'Πορτοκάλι', 'Πλανήτης', 'Ρόδα'], rotatable: false },
  { words: ['Ζάρι', 'Κύβος', 'Κουτί', 'Ντόμινο'], rotatable: false },
  { words: ['Σκάκι', 'Καρό', 'Πάτωμα', 'Σταυρόλεξο'], rotatable: false },
  { words: ['Χαρταετός', 'Διαμάντι', 'Σημαία', 'Πανί'], rotatable: false },
  { words: ['Κούκλα', 'Παιδί', 'Άγαλμα', 'Φάντασμα'], rotatable: false },
  { words: ['Σβούρα', 'Κώνος', 'Παγωτό', 'Καμπάνα'], rotatable: false },
  { words: ['Καμπάνα', 'Κύπελλο', 'Σβούρα', 'Φούστα'], rotatable: false },
  { words: ['Κένταυρος', 'Άλογο', 'Ιππέας', 'Ελάφι'], rotatable: false },
  { words: ['Πήγασος', 'Άλογο', 'Άγγελος', 'Αετός'], rotatable: false },
  { words: ['Κύκλωπας', 'Γίγαντας', 'Φακός', 'Ψάρι'], rotatable: false },
  { words: ['Γοργόνα', 'Ψάρι', 'Κολυμβήτρια', 'Δελφίνι'], rotatable: false },
  { words: ['Μινώταυρος', 'Ταύρος', 'Αγελάδα', 'Άνθρωπος'], rotatable: false },
  { words: ['Δούρειος Ίππος', 'Άλογο', 'Κάστρο', 'Καρότσα'], rotatable: false },
  { words: ['Λαβύρινθος', 'Σπείρα', 'Δίχτυ', 'Χάρτης'], rotatable: false },
  { words: ['Άρπα', 'Λύρα', 'Τόξο', 'Χτένα'], rotatable: false },
  { words: ['Δράκος', 'Φίδι', 'Σαύρα', 'Κροκόδειλος'], rotatable: false },
  { words: ['Φοίνικας', 'Αετός', 'Φωτιά', 'Κόκορας'], rotatable: false },
  { words: ['Φανάρι', 'Ρομπότ', 'Πύργος', 'Φάρος'], rotatable: false },
  { words: ['Παγκάκι', 'Κρεβάτι', 'Τραπέζι', 'Σκάλα'], rotatable: false },
  { words: ['Σιντριβάνι', 'Καταρράκτης', 'Λουλούδι', 'Δέντρο'], rotatable: false },
  { words: ['Σκουπιδοτενεκές', 'Βαρέλι', 'Κουβάς', 'Πηγάδι'], rotatable: false },
  { words: ['Άγαλμα', 'Άνθρωπος', 'Κούκλα', 'Άγγελος'], rotatable: false },
  { words: ['Πινακίδα', 'Πινέλο', 'Σημαία', 'Καθρέφτης'], rotatable: false },
  { words: ['Τούνελ', 'Σπηλιά', 'Στόμα', 'Πύλη'], rotatable: false },
  { words: ['Καρότσι', 'Κλουβί', 'Καρότσα', 'Κρεβάτι'], rotatable: false },
  { words: ['Ρόδα λούνα παρκ', 'Ρολόι', 'Ρόδα', 'Ήλιος'], rotatable: false },
  { words: ['Κάμερα', 'Κουτί', 'Ρομπότ', 'Τηλεόραση'], rotatable: false },
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
export const NUMERIC_QUESTION_COUNT = 5;
export const NUMERIC_QUESTION_DURATION_MS = 20_000;
// The round-value table maxForAnswer (server/src/numeric.ts) climbs to find
// the smallest value at least 2.5x the answer - kept HERE, not there, so the
// /dev/numeric review tool (client) can run the exact same "does a valid
// round value even exist for this answer" check the server does, instead of
// a second copy of these numbers that could drift. An answer over 2000
// (2.5x > 5000, the table's own ceiling) has no valid entry - maxForAnswer
// falls back to 5000 anyway rather than crashing, but that silently breaks
// the "answer sits at 20-40% of the slider" design invariant, which is
// exactly what the review tool's warning count is for.
export const NUMERIC_ROUND_VALUES = [20, 50, 100, 200, 500, 1000, 2000, 5000] as const;
export const NUMERIC_REVEAL_DURATION_MS = 8_000;
// Task 68 - moved here for the SAME reason NUMERIC_ROUND_VALUES was: the
// /dev/numeric review tool used to keep its own copy of this formula
// (max / 200, no floor) and silently went stale the moment this one grew a
// Math.max/Math.round - the tool kept showing fractional steps (0.25, 2.5)
// after the mechanic itself was fixed. One function now, imported by both.
// Must never return a fractional step: max/200 alone is only an integer
// when max is itself a multiple of 200 (200, 1000, 2000, 5000) - max=500,
// a real table entry, divides to 2.5. Rounding (not flooring) keeps ~200
// steps across the range for every max, never landing on a fraction.
export function sliderStepForMax(max: number): number {
  return Math.max(1, Math.round(max / 200));
}

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
  submittedPlayerIds: string[]; // WHO has locked in - never their value
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

// ----------------------- Η Δίκη, the trial (Task 127) ---------------------
// The quiz's FINALE, not a mode: after the last question of the last quiz
// stage every player carries their accumulated score in as LIFE, and life
// drains for as long as a trial question sits unanswered. Eliminations are
// checked at TRIAL_REVEAL and nowhere else.

// How much life a living player loses per SECOND that a trial question
// stays open against them - stopped the instant they lock an answer in.
// Placeholder for the deferred balance pass (Task 127), like WRONG_HIT.
export const DRAIN_PER_SEC = 10;
// The extra bite taken at TRIAL_REVEAL from anyone whose lock-in was wrong,
// and from anyone who never locked in at all (who also pays the FULL
// timer's drain). Placeholder, same pass.
export const WRONG_HIT = 150;

// How many questions the trial draws out of the UNUSED quiz pool when it
// begins. A bound, not an expectation: the trial normally ends when one
// player is left standing, and running this many rounds without that
// happening is what "question pool exhausted -> highest score wins" is for.
export const TRIAL_MAX_QUESTIONS = 16;

// The stage card the TV shows as the trial begins - announced through the
// EXISTING STAGE_ANNOUNCE phase (see buildStageAnnounce, server/src/
// payloads.ts), so the trial gets the held beat, the pause-aware timer and
// the state:sync catch-up every other stage already has. The stage NUMBER
// is computed at announce time (one past however many quiz stages this
// game's length includes), which is why only the text lives here.
export const TRIAL_STAGE_TITLE = 'Η Δίκη';
export const TRIAL_STAGE_TAGLINE =
  'Η βαθμολογία σας είναι πλέον ζωή, και κυλάει όσο σωπαίνετε. Ένας θα μείνει όρθιος.';

export interface TrialSubmitPayload {
  choice: number; // 0-3, validated server-side
}

// One player's standing in the trial. `alive` goes false at the REVEAL that
// takes them to zero or below and never comes back.
export interface TrialLife {
  playerId: string;
  name: string;
  avatarId: string;
  life: number;
  alive: boolean;
  // Whether this player is in the question currently on screen. Always
  // `alive` outside sudden death; during sudden death only the players the
  // tie is between.
  onTrial: boolean;
}

// The TV's view of a trial question. Carries WHO has locked in, never what
// they picked and never the correct index - exactly the answer:progress
// contract, and for the same reason: the host is a display.
export interface TrialQuestionShowHostPayload {
  roundIndex: number; // 0-based, within the trial
  question: string;
  options: string[];
  category: string;
  questionTimeMs: number;
  durationMs: number; // time STILL LEFT, frozen while paused
  // Both echoed so the TV can animate the drain locally against the same
  // figures the server will use at reveal, rather than a second copy.
  drainPerSec: number;
  wrongHit: number;
  suddenDeath: boolean;
  lives: TrialLife[];
  lockedInPlayerIds: string[];
  paused: boolean;
  pausedByName: string | null;
  standings: PlayerStanding[];
}

// One phone's view. No question text (it reads it off the TV), no correct
// index, and nothing at all about anyone else's lock-in.
export interface TrialQuestionShowPlayerPayload {
  roundIndex: number;
  options: string[];
  category: string;
  questionTimeMs: number;
  durationMs: number;
  drainPerSec: number;
  wrongHit: number;
  suddenDeath: boolean;
  // False for an eliminated player, and for anyone sitting a sudden-death
  // round out - their phone shows a spectator view, and the server rejects
  // a submit from them regardless.
  onTrial: boolean;
  yourLife: number;
  lockedIn: boolean; // true on a state:sync catch-up after already locking in
  paused: boolean;
  pausedByName: string | null;
}

export type TrialQuestionShowPayload = TrialQuestionShowHostPayload | TrialQuestionShowPlayerPayload;

export function isTrialQuestionHostPayload(
  payload: TrialQuestionShowPayload,
): payload is TrialQuestionShowHostPayload {
  return 'question' in payload;
}

// One player's round, as the reveal reports it. The three figures are kept
// separate rather than pre-summed so the TV can show the arithmetic:
// lifeAfter === lifeBefore - drain - hit, always.
export interface TrialRevealResult {
  playerId: string;
  name: string;
  avatarId: string;
  choice: number | null; // null = never locked in
  correct: boolean;
  timeMs: number | null; // elapsed at lock-in, from the pause-aware clock
  answerRank: number | null; // 1-based among CORRECT lock-ins, by speed
  lifeBefore: number;
  drain: number; // round(elapsed_s * DRAIN_PER_SEC), full timer if no answer
  hit: number; // WRONG_HIT or 0
  lifeAfter: number; // NOT clamped at 0 - the arithmetic is what it is
  eliminated: boolean; // crossed to <= 0 in THIS reveal
}

// Public and symmetric, like reveal:show - the round is over, so the correct
// answer and every player's lock-in and drain are finally safe to send to
// everyone.
export interface TrialRevealShowPayload {
  roundIndex: number;
  correctIndex: number;
  correctOption: string;
  suddenDeath: boolean; // whether the round being revealed WAS a decider
  results: TrialRevealResult[];
  survivorCount: number; // still above 0 after this reveal
  // Set only on the reveal that ends the trial.
  winnerPlayerId: string | null;
  winnerName: string | null;
  // True when this reveal sent everyone left to zero at once and the next
  // question is the sudden-death decider between them.
  nextSuddenDeath: boolean;
  autoAdvanceMs: number;
  paused: boolean;
  pausedByName: string | null;
  standings: PlayerStanding[];
}

// ----------------------- Blitz mode (Task 69) --------------------------
// Solo swipe minigame: one statement at a time, swipe RIGHT for ΣΩΣΤΟ
// (true) or LEFT for ΛΑΘΟΣ (false), time-bound round. Standalone dev route
// (/dev/blitz) for now - no server, no room, all state local - but the pool
// lives HERE, not in the client, because the real mode will draw from the
// same one.
export interface BlitzStatement {
  readonly text: string;
  readonly isTrue: boolean; // true => the correct swipe is RIGHT (ΣΩΣΤΟ)
}

// The four round lengths the start screen offers, in seconds. A blitz round
// is TIME-BOUND ONLY - there is no target number of statements.
export const BLITZ_DURATIONS_SEC = [30, 45, 60, 90] as const;

// Task 70 - the blitz round-upload endpoint. localStorage stays the source
// of truth; at the end of every round the client also fire-and-forgets the
// round here and the server appends ONE JSON line to a .jsonl on disk. The
// random path segment is the ONLY gate (unguessable, no other auth) and is
// defined HERE so client and server can never drift. No GET - the log is
// read over ssh. Bodies over 32KB are rejected; the server stops appending
// past 50MB (507).
export const BLITZ_LOG_PATH = '/api/blitz-log/378857bcc8436b3a395a8033062b12cb';

// ----------------------- Blitz as a room mode (Task 156) -------------------
// The real mode the prototype above was waiting for: every player gets the
// SAME K statements in the SAME order (drawn server-side per game, balanced
// true/false, shuffled), swipes through at their own pace - right = ΣΩΣΤΟ,
// left = ΛΑΘΟΣ, no going back - inside one BLITZ_DURATION_MS window that
// ends early once everyone has swiped all K. Correct +BLITZ_CORRECT_POINTS,
// wrong -BLITZ_WRONG_POINTS, unanswered 0: the penalty is what makes
// spam-swiping score about zero. Every one of these is a call-site
// parameter of the pure mechanic (server/src/blitz.ts), never read inside it.
export const BLITZ_MIN_PLAYERS = 2;
export const BLITZ_STATEMENT_COUNT = 12; // K
export const BLITZ_DURATION_MS = 30_000;
export const BLITZ_REVEAL_DURATION_MS = 8_000;
export const BLITZ_CORRECT_POINTS = 50;
export const BLITZ_WRONG_POINTS = 25;

export interface BlitzSwipePayload {
  index: number; // which statement (0-based, in the dealt order) - must be the next one
  answeredTrue: boolean; // right swipe = true
}

// 'blitz:show' is asymmetric like question:show. Phones get the statement
// TEXTS (all K up front, so a swipe never waits on the network) and never a
// truth value; the host gets per-player progress and no texts at all - the TV
// only carries the title and the instruction (players read on their phones).
// durationMs is the time STILL LEFT, so a state:sync catch-up and a fresh
// phase entry share one shape.
export interface BlitzShowHostPayload {
  total: number; // K
  durationMs: number;
  progressByPlayerId: Record<string, number>; // playerId -> statements swiped so far
  paused: boolean;
  pausedByName: string | null;
  standings: PlayerStanding[];
}

export interface BlitzShowPlayerPayload {
  statements: string[]; // texts only - truth never leaves the server before BLITZ_REVEAL
  total: number; // K (= statements.length)
  durationMs: number;
  answeredCount: number; // how many THIS phone already swiped - non-zero only on a state:sync catch-up
  paused: boolean;
  pausedByName: string | null;
}

export type BlitzShowPayload = BlitzShowHostPayload | BlitzShowPlayerPayload;

export function isBlitzShowHostPayload(payload: BlitzShowPayload): payload is BlitzShowHostPayload {
  return 'progressByPlayerId' in payload;
}

// Host-only, after every accepted swipe: the whole progress map again (K is
// small and so is the room), never which way anyone swiped.
export interface BlitzProgressPayload {
  progressByPlayerId: Record<string, number>;
}

export interface BlitzRevealResult {
  playerId: string;
  name: string;
  avatarId: string;
  correct: number;
  wrong: number;
  unanswered: number;
  pointsAwarded: number; // can be negative
  totalScore: number;
}

// The one statement the room got wrong most, with its truth - the first time
// a truth value is sent anywhere. null when nobody got anything wrong.
export interface BlitzMostMissed {
  text: string;
  isTrue: boolean;
  missedCount: number;
}

// 'blitz_reveal:show' is asymmetric, unlike numeric_reveal:show: a phone gets
// only ITS OWN counts (never another player's swipes or breakdown), the host
// gets everyone's for the score column plus the most-missed statement.
export interface BlitzRevealHostPayload {
  total: number;
  results: BlitzRevealResult[];
  mostMissed: BlitzMostMissed | null;
  autoAdvanceMs: number;
  paused: boolean;
  pausedByName: string | null;
  standings: PlayerStanding[];
}

export interface BlitzRevealPlayerPayload {
  total: number;
  correct: number;
  wrong: number;
  unanswered: number;
  autoAdvanceMs: number;
  paused: boolean;
  pausedByName: string | null;
}

export type BlitzRevealPayload = BlitzRevealHostPayload | BlitzRevealPlayerPayload;

export function isBlitzRevealHostPayload(payload: BlitzRevealPayload): payload is BlitzRevealHostPayload {
  return 'results' in payload;
}

// BLITZ_STATEMENTS is GENERATED from blitz-statements.md at the repo root by
// `npm run blitz:generate` (dev/generate-blitz-statements.ts), which parses
// it line-by-line with /^([ΣΛ])\s\s(\S.+)$/ - Σ => isTrue:true, Λ =>
// isTrue:false. Edit the .md and re-run; never hand-edit the block below.
// <BLITZ_STATEMENTS:GENERATED>
export const BLITZ_STATEMENTS: readonly BlitzStatement[] = [
  { text: "Ένα τρίγωνο έχει τρεις πλευρές.", isTrue: true },
  { text: "Ένας κύκλος έχει τέσσερις γωνίες.", isTrue: false },
  { text: "Όλα τα τετράγωνα είναι ορθογώνια.", isTrue: true },
  { text: "Όλα τα ορθογώνια είναι τετράγωνα.", isTrue: false },
  { text: "Μια ώρα έχει εξήντα λεπτά.", isTrue: true },
  { text: "Το μισό του πενήντα είναι είκοσι.", isTrue: false },
  { text: "Το επτά είναι πρώτος αριθμός.", isTrue: true },
  { text: "Το εννιά είναι πρώτος αριθμός.", isTrue: false },
  { text: "Το ελληνικό αλφάβητο έχει είκοσι τέσσερα γράμματα.", isTrue: true },
  { text: "Ο Φεβρουάριος έχει πάντα είκοσι οκτώ μέρες.", isTrue: false },
  { text: "Ένα λεπτό σιωπής διαρκεί εξήντα δευτερόλεπτα.", isTrue: true },
  { text: "Μια δωδεκάδα έχει δεκατρία.", isTrue: false },
  { text: "Το μηδέν είναι άρτιος αριθμός.", isTrue: true },
  { text: "Το ένα είναι πρώτος αριθμός.", isTrue: false },
  { text: "Ένα εξάγωνο έχει έξι πλευρές.", isTrue: true },
  { text: "Ένα δωδεκάγωνο έχει δέκα πλευρές.", isTrue: false },
  { text: "Οι γωνίες ενός τριγώνου κάνουν εκατόν ογδόντα μοίρες.", isTrue: true },
  { text: "Οι γωνίες ενός τετραγώνου κάνουν εκατόν ογδόντα μοίρες.", isTrue: false },
  { text: "Ένα εικοσιτετράωρο έχει χίλια τετρακόσια σαράντα λεπτά.", isTrue: true },
  { text: "Μια εβδομάδα έχει διακόσιες ώρες.", isTrue: false },
  { text: "Το δέκα τοις εκατό του χιλίου είναι εκατό.", isTrue: true },
  { text: "Το τετράγωνο του επτά είναι σαράντα οκτώ.", isTrue: false },
  { text: "Ένας δίσεκτος χρόνος έχει τριακόσιες εξήντα έξι μέρες.", isTrue: true },
  { text: "Ο αριθμός π είναι ακριβώς τρία κόμμα δεκατέσσερα.", isTrue: false },
  { text: "Δύο στην πέμπτη κάνει τριάντα δύο.", isTrue: true },
  { text: "Όλοι οι άρτιοι αριθμοί διαιρούνται με το τέσσερα.", isTrue: false },
  { text: "Ένα κυβικό μέτρο νερού ζυγίζει χίλια κιλά.", isTrue: true },
  { text: "Ένα χιλιόμετρο έχει εκατό μέτρα.", isTrue: false },
  { text: "Το χταπόδι έχει τρεις καρδιές.", isTrue: true },
  { text: "Οι νυχτερίδες είναι τυφλές.", isTrue: false },
  { text: "Οι σαλίγκαροι έχουν δόντια.", isTrue: true },
  { text: "Η καμήλα αποθηκεύει νερό στην καμπούρα της.", isTrue: false },
  { text: "Οι πεταλούδες γεύονται με τα πόδια τους.", isTrue: true },
  { text: "Ο ελέφαντας μπορεί να πηδήξει.", isTrue: false },
  { text: "Το κουνούπι που τσιμπάει είναι πάντα θηλυκό.", isTrue: true },
  { text: "Το δελφίνι είναι ψάρι.", isTrue: false },
  { text: "Η μέλισσα πεθαίνει αφού τσιμπήσει.", isTrue: true },
  { text: "Οι στρουθοκάμηλοι κρύβουν το κεφάλι στην άμμο.", isTrue: false },
  { text: "Οι γαρίδες έχουν την καρδιά στο κεφάλι.", isTrue: true },
  { text: "Το φλαμίνγκο γεννιέται ροζ.", isTrue: false },
  { text: "Η αγελάδα έχει τέσσερα στομάχια.", isTrue: true },
  { text: "Ο καρχαρίας έχει κόκαλα.", isTrue: false },
  { text: "Ο σκύλος ιδρώνει από τις πατούσες του.", isTrue: true },
  { text: "Το κόκκινο χρώμα εξοργίζει τους ταύρους.", isTrue: false },
  { text: "Το ζώο με το μεγαλύτερο μάτι είναι το καλαμάρι.", isTrue: true },
  { text: "Η καμηλοπάρδαλη έχει περισσότερους σπονδύλους στον λαιμό από τον άνθρωπο.", isTrue: false },
  { text: "Η μέδουσα ζει χωρίς εγκέφαλο.", isTrue: true },
  { text: "Ο σκύλος βλέπει τον κόσμο ασπρόμαυρο.", isTrue: false },
  { text: "Ο αστερίας μπορεί να αναγεννήσει χαμένο πόδι.", isTrue: true },
  { text: "Τα χρυσόψαρα έχουν μνήμη τριών δευτερολέπτων.", isTrue: false },
  { text: "Το κολιμπρί μπορεί να πετάξει προς τα πίσω.", isTrue: true },
  { text: "Η νυχτερίδα είναι πουλί.", isTrue: false },
  { text: "Η γλώσσα του κροκόδειλου είναι κολλημένη στο στόμα του.", isTrue: true },
  { text: "Το χέλι είναι φίδι.", isTrue: false },
  { text: "Η αράχνη έχει οκτώ πόδια.", isTrue: true },
  { text: "Το έντομο έχει οκτώ πόδια.", isTrue: false },
  { text: "Ο ελέφαντας είναι το μεγαλύτερο χερσαίο ζώο.", isTrue: true },
  { text: "Η φάλαινα είναι ψάρι.", isTrue: false },
  { text: "Το κοάλα κοιμάται πάνω από δεκαοκτώ ώρες τη μέρα.", isTrue: true },
  { text: "Η πάπια είναι θηλαστικό.", isTrue: false },
  { text: "Ο παπαγάλος μπορεί να ζήσει πάνω από πενήντα χρόνια.", isTrue: true },
  { text: "Οι μύγες ζουν μόνο μία μέρα.", isTrue: false },
  { text: "Η μέλισσα έχει πέντε μάτια.", isTrue: true },
  { text: "Ο δεινόσαυρος και ο άνθρωπος έζησαν μαζί.", isTrue: false },
  { text: "Το μυρμήγκι σηκώνει πολλαπλάσιο του βάρους του.", isTrue: true },
  { text: "Ο σκορπιός είναι έντομο.", isTrue: false },
  { text: "Ο ενήλικας άνθρωπος έχει διακόσια έξι κόκαλα.", isTrue: true },
  { text: "Χρησιμοποιούμε μόνο το δέκα τοις εκατό του εγκεφάλου μας.", isTrue: false },
  { text: "Όταν γεννιέσαι έχεις περισσότερα κόκαλα από ό,τι τώρα.", isTrue: true },
  { text: "Τα νύχια συνεχίζουν να μεγαλώνουν μετά τον θάνατο.", isTrue: false },
  { text: "Πάνω από τα μισά του σώματός σου είναι νερό.", isTrue: true },
  { text: "Η γλώσσα είναι ο πιο δυνατός μυς του σώματος.", isTrue: false },
  { text: "Οι ενήλικες έχουν λιγότερες γευστικές θηλές από τα παιδιά.", isTrue: true },
  { text: "Είναι αδύνατο να φτερνιστείς με ανοιχτά μάτια.", isTrue: false },
  { text: "Η καρδιά χτυπάει περίπου εκατό χιλιάδες φορές τη μέρα.", isTrue: true },
  { text: "Ο εγκέφαλος αισθάνεται πόνο.", isTrue: false },
  { text: "Τα δάχτυλα ζαρώνουν στο νερό λόγω του νευρικού συστήματος.", isTrue: true },
  { text: "Ο άνθρωπος έχει πέντε αισθήσεις μόνο.", isTrue: false },
  { text: "Το κόκαλο είναι πιο δυνατό από το ατσάλι στο ίδιο βάρος.", isTrue: true },
  { text: "Τα μαλλιά μεγαλώνουν πιο γρήγορα αν τα κόβεις.", isTrue: false },
  { text: "Ο άνθρωπος χάνει δέρμα κάθε μέρα.", isTrue: true },
  { text: "Το κρύο προκαλεί κρυολόγημα.", isTrue: false },
  { text: "Το ανθρώπινο μάτι διακρίνει εκατομμύρια αποχρώσεις.", isTrue: true },
  { text: "Κάθε άνθρωπος έχει τον ίδιο αριθμό τριχών στο κεφάλι.", isTrue: false },
  { text: "Το στομάχι παράγει νέο βλεννογόνο συνεχώς.", isTrue: true },
  { text: "Ο ανθρώπινος εγκέφαλος σταματάει να αλλάζει στα δεκαοκτώ.", isTrue: false },
  { text: "Η Ανταρκτική είναι έρημος.", isTrue: true },
  { text: "Το Σινικό Τείχος φαίνεται από το διάστημα με γυμνό μάτι.", isTrue: false },
  { text: "Ο ήλιος είναι αστέρι.", isTrue: true },
  { text: "Το Λος Άντζελες είναι η πρωτεύουσα των ΗΠΑ.", isTrue: false },
  { text: "Η Αυστραλία είναι ταυτόχρονα χώρα και ήπειρος.", isTrue: true },
  { text: "Ο κεραυνός δεν χτυπάει ποτέ δύο φορές στο ίδιο σημείο.", isTrue: false },
  { text: "Ο Έβερεστ είναι το ψηλότερο βουνό του κόσμου.", isTrue: true },
  { text: "Το νερό βράζει στους εκατό βαθμούς σε κάθε υψόμετρο.", isTrue: false },
  { text: "Η Λέσβος είναι το τρίτο μεγαλύτερο νησί της Ελλάδας.", isTrue: true },
  { text: "Το γυαλί είναι υγρό που ρέει πολύ αργά.", isTrue: false },
  { text: "Ο Άρης λέγεται και Κόκκινος Πλανήτης.", isTrue: true },
  { text: "Το φεγγάρι έχει ατμόσφαιρα σαν της Γης.", isTrue: false },
  { text: "Ο Πύργος του Άιφελ ψηλώνει το καλοκαίρι.", isTrue: true },
  { text: "Η Σαχάρα είναι η μεγαλύτερη έρημος του πλανήτη.", isTrue: false },
  { text: "Οι αστροναύτες ψηλώνουν στο διάστημα.", isTrue: true },
  { text: "Η Ελλάδα έχει λιγότερα από εκατό νησιά.", isTrue: false },
  { text: "Η Ρωσία συνορεύει με περισσότερες από δέκα χώρες.", isTrue: true },
  { text: "Η Αφρική είναι μία χώρα.", isTrue: false },
  { text: "Η Ισλανδία έχει ηφαίστεια σε δράση.", isTrue: true },
  { text: "Η Ιαπωνία βρίσκεται στην Ευρώπη.", isTrue: false },
  { text: "Η Κίνα και η Ινδία ξεπερνούν το ένα δισεκατομμύριο η καθεμία.", isTrue: true },
  { text: "Η Αυστρία και η Αυστραλία είναι η ίδια χώρα.", isTrue: false },
  { text: "Το Βατικανό είναι η μικρότερη χώρα του κόσμου.", isTrue: true },
  { text: "Ο Καναδάς είναι μικρότερος από την Ελλάδα.", isTrue: false },
  { text: "Η Ελλάδα συνορεύει με την Τουρκία.", isTrue: true },
  { text: "Η Μεσόγειος είναι ωκεανός.", isTrue: false },
  { text: "Η Αθήνα βρίσκεται νοτιότερα από τη Ρώμη.", isTrue: true },
  { text: "Η Κρήτη είναι μεγαλύτερη από την Κύπρο.", isTrue: false },
  { text: "Η Σιβηρία ανήκει στη Ρωσία.", isTrue: true },
  { text: "Ο Ισημερινός περνάει από την Ελλάδα.", isTrue: false },
  { text: "Το Αιγαίο βρίσκεται ανάμεσα σε Ελλάδα και Τουρκία.", isTrue: true },
  { text: "Η Γροιλανδία είναι ήπειρος.", isTrue: false },
  { text: "Ο Δίας είναι ο μεγαλύτερος πλανήτης του ηλιακού συστήματος.", isTrue: true },
  { text: "Ο ήλιος γυρίζει γύρω από τη Γη.", isTrue: false },
  { text: "Η Αφροδίτη είναι πιο ζεστή από τον Ερμή.", isTrue: true },
  { text: "Ο Πλούτωνας θεωρείται πλανήτης σήμερα.", isTrue: false },
  { text: "Στη Σελήνη η βαρύτητα είναι μικρότερη από της Γης.", isTrue: true },
  { text: "Στο διάστημα ακούγονται οι εκρήξεις.", isTrue: false },
  { text: "Ο Κρόνος έχει δακτυλίους.", isTrue: true },
  { text: "Ο Άρης έχει έναν δορυφόρο.", isTrue: false },
  { text: "Το φως του ήλιου κάνει λεπτά να φτάσει στη Γη.", isTrue: true },
  { text: "Το φεγγάρι εκπέμπει δικό του φως.", isTrue: false },
  { text: "Ένα έτος στον Άρη διαρκεί περισσότερο από ένα γήινο.", isTrue: true },
  { text: "Όλοι οι πλανήτες έχουν φεγγάρια.", isTrue: false },
  { text: "Ο Δεύτερος Παγκόσμιος Πόλεμος τελείωσε το χίλια εννιακόσια σαράντα πέντε.", isTrue: true },
  { text: "Ο Ναπολέων ήταν Ισπανός.", isTrue: false },
  { text: "Η Ελληνική Επανάσταση ξεκίνησε το χίλια οκτακόσια είκοσι ένα.", isTrue: true },
  { text: "Οι πυραμίδες χτίστηκαν από σκλάβους.", isTrue: false },
  { text: "Η Ρωμαϊκή Αυτοκρατορία μιλούσε λατινικά.", isTrue: true },
  { text: "Ο Κολόμβος έφτασε πρώτος στην Αμερική.", isTrue: false },
  { text: "Ο Μέγας Αλέξανδρος πέθανε πριν τα σαράντα του.", isTrue: true },
  { text: "Ο Πύργος της Πίζας χτίστηκε επίτηδες γερτός.", isTrue: false },
  { text: "Η Κωνσταντινούπολη λεγόταν κάποτε Βυζάντιο.", isTrue: true },
  { text: "Ο Πρώτος Παγκόσμιος Πόλεμος έγινε μετά τον Δεύτερο.", isTrue: false },
  { text: "Ο άνθρωπος πάτησε στη Σελήνη το χίλια εννιακόσια εξήντα εννιά.", isTrue: true },
  { text: "Οι Βίκινγκς φορούσαν κράνη με κέρατα.", isTrue: false },
  { text: "Το Κολοσσαίο βρίσκεται στη Ρώμη.", isTrue: true },
  { text: "Η Γαλλική Επανάσταση έγινε τον εικοστό αιώνα.", isTrue: false },
  { text: "Η λέξη δημοκρατία είναι ελληνική.", isTrue: true },
  { text: "Το λατινικό αλφάβητο έχει τριάντα γράμματα.", isTrue: false },
  { text: "Πολλές αγγλικές λέξεις έχουν ελληνική ρίζα.", isTrue: true },
  { text: "Τα ελληνικά γράφονται από δεξιά προς αριστερά.", isTrue: false },
  { text: "Η λέξη μαθηματικά προέρχεται από τα ελληνικά.", isTrue: true },
  { text: "Τα ισπανικά και τα ιταλικά είναι η ίδια γλώσσα.", isTrue: false },
  { text: "Τα κινέζικα γράφονται με χαρακτήρες αντί για αλφάβητο.", isTrue: true },
  { text: "Η ελληνική γλώσσα έχει τέσσερα γένη.", isTrue: false },
  { text: "Το ωμέγα είναι το τελευταίο γράμμα του ελληνικού αλφαβήτου.", isTrue: true },
  { text: "Το βήτα είναι το τρίτο γράμμα του ελληνικού αλφαβήτου.", isTrue: false },
  { text: "Το μέλι δεν χαλάει ποτέ.", isTrue: true },
  { text: "Ο ανανάς φυτρώνει πάνω σε δέντρο.", isTrue: false },
  { text: "Η ντομάτα είναι φρούτο.", isTrue: true },
  { text: "Το κόκκινο κρασί σερβίρεται πιο κρύο από το λευκό.", isTrue: false },
  { text: "Το διαμάντι είναι το σκληρότερο φυσικό υλικό.", isTrue: true },
  { text: "Το ζεστό νερό είναι πιο βαρύ από το κρύο.", isTrue: false },
  { text: "Ο πιο σύντομος πόλεμος στην ιστορία κράτησε λιγότερο από μία ώρα.", isTrue: true },
  { text: "Το αλάτι λιώνει τον πάγο επειδή τον ζεσταίνει.", isTrue: false },
  { text: "Το ξίδι με τη σόδα κάνουν αφρό.", isTrue: true },
  { text: "Το γάλα είναι λευκό επειδή η αγελάδα τρώει χορτάρι.", isTrue: false },
  { text: "Το αβοκάντο είναι φρούτο.", isTrue: true },
  { text: "Η φέτα φτιάχνεται από αγελαδινό γάλα.", isTrue: false },
  { text: "Το τυρί φτιάχνεται από γάλα.", isTrue: true },
  { text: "Το τσάι και ο καφές βγαίνουν από το ίδιο φυτό.", isTrue: false },
  { text: "Ο καφές περιέχει καφεΐνη.", isTrue: true },
  { text: "Το ψωμί φουσκώνει χωρίς μαγιά.", isTrue: false },
  { text: "Το ξίδι είναι όξινο.", isTrue: true },
  { text: "Η ζάχαρη βγαίνει μόνο από ζαχαροκάλαμο.", isTrue: false },
  { text: "Η μελιτζάνα είναι βοτανικά φρούτο.", isTrue: true },
  { text: "Η πατάτα ήρθε στην Ευρώπη από την Ασία.", isTrue: false },
  { text: "Το ρύζι μαγειρεύεται σε νερό που βράζει.", isTrue: true },
  { text: "Το μοσχαρίσιο κρέας προέρχεται από πρόβατο.", isTrue: false },
  { text: "Ο Σωκράτης πέθανε πίνοντας κώνειο.", isTrue: true },
  { text: "Ο Σωκράτης έγραψε ο ίδιος τα βιβλία του.", isTrue: false },
  { text: "Ο Πλάτωνας ήταν μαθητής του Σωκράτη.", isTrue: true },
  { text: "Ο Δίας ήταν θεός της θάλασσας.", isTrue: false },
  { text: "Η Αθηνά ήταν θεά της σοφίας.", isTrue: true },
  { text: "Στην αρχαία Αθήνα ψήφιζαν όλοι οι κάτοικοι.", isTrue: false },
  { text: "Ο Παρθενώνας χτίστηκε για την Αθηνά.", isTrue: true },
  { text: "Τα αρχαία ελληνικά αγάλματα ήταν πάντα λευκά.", isTrue: false },
  { text: "Ο Αριστοτέλης ήταν δάσκαλος του Μεγάλου Αλεξάνδρου.", isTrue: true },
  { text: "Οι Ολυμπιακοί Αγώνες ξεκίνησαν στη Ρώμη.", isTrue: false },
  { text: "Ο Μαραθώνας πήρε το όνομά του από μια μάχη.", isTrue: true },
  { text: "Ο Όμηρος έγραψε την Αινειάδα.", isTrue: false },
  { text: "Οι αρχαίοι Ολυμπιακοί γίνονταν κάθε τέσσερα χρόνια.", isTrue: true },
  { text: "Ο Σωκράτης ήταν βασιλιάς της Αθήνας.", isTrue: false },
  { text: "Η Σπάρτη και η Αθήνα πολέμησαν μεταξύ τους.", isTrue: true },
  { text: "Ο Σωκράτης έζησε στην Αίγυπτο.", isTrue: false },
  { text: "Ο Ηρόδοτος θεωρείται πατέρας της ιστορίας.", isTrue: true },
  { text: "Οι αρχαίοι Έλληνες πίστευαν σε έναν θεό.", isTrue: false },
  { text: "Η Ακρόπολη βρίσκεται στην Αθήνα.", isTrue: true },
  { text: "Ο Μέγας Αλέξανδρος ήταν Αθηναίος.", isTrue: false },
  { text: "Ο Ιπποκράτης ήταν γιατρός.", isTrue: true },
  { text: "Το θέατρο γεννήθηκε στη Ρώμη.", isTrue: false },
  { text: "Οι αρχαίοι Έλληνες έγραφαν σε παπύρους.", isTrue: true },
  { text: "Οι αρχαίοι Ολυμπιακοί γίνονταν κάθε χρόνο.", isTrue: false },
  { text: "Η Πυθία έδινε χρησμούς στους Δελφούς.", isTrue: true },
  { text: "Ο Παρθενώνας είναι χτισμένος από ξύλο.", isTrue: false },
  { text: "Ο Αριστοφάνης έγραφε κωμωδίες.", isTrue: true },
  { text: "Ο Πυθαγόρας ήταν Ρωμαίος.", isTrue: false },
  { text: "Ο ήχος ταξιδεύει πιο αργά από το φως.", isTrue: true },
  { text: "Ο μαγνήτης έλκει το αλουμίνιο.", isTrue: false },
  { text: "Το νερό επεκτείνεται όταν παγώνει.", isTrue: true },
  { text: "Ο χρυσός σκουριάζει.", isTrue: false },
  { text: "Ο κεραυνός φαίνεται πριν ακουστεί η βροντή.", isTrue: true },
  { text: "Το γυαλί είναι αγωγός του ηλεκτρισμού.", isTrue: false },
  { text: "Ο υδράργυρος είναι υγρός σε θερμοκρασία δωματίου.", isTrue: true },
  { text: "Ο ήχος ταξιδεύει στο κενό.", isTrue: false },
  { text: "Το σίδερο είναι βαρύτερο από το αλουμίνιο στον ίδιο όγκο.", isTrue: true },
  { text: "Το πρώτο κινητό τηλέφωνο βγήκε το δύο χιλιάδες.", isTrue: false },
  { text: "Το ίντερνετ υπήρχε πριν το χίλια εννιακόσια ενενήντα.", isTrue: true },
  { text: "Ο υπολογιστής δουλεύει με δεκαδικό σύστημα.", isTrue: false },
  { text: "Η φωτιά χρειάζεται οξυγόνο.", isTrue: true },
  { text: "Το ξύλο βυθίζεται στο νερό.", isTrue: false },
];
// </BLITZ_STATEMENTS:GENERATED>

export interface BlitzDraw {
  picks: BlitzStatement[];
  seen: string[]; // updated seen-set (statement texts), to persist and pass back in
}

// Pure, seeded-if-you-want statement selection. `seen` is the cross-round
// memory (localStorage on the client): a statement is not shown again while
// any UNSEEN statement remains. When the unseen pool runs dry mid-draw the
// seen-set silently resets and a fresh shuffle begins - picks already made
// in THIS call stay excluded so a single draw never repeats itself. Same
// function the client and dev/blitz-draw-check.ts both call.
export function drawBlitzStatements(
  seen: readonly string[],
  count: number,
  rng: () => number = Math.random,
  pool: readonly BlitzStatement[] = BLITZ_STATEMENTS,
): BlitzDraw {
  const shuffle = (list: BlitzStatement[]): BlitzStatement[] => {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };

  const seenSet = new Set(seen);
  const picks: BlitzStatement[] = [];
  let bag = shuffle(pool.filter((s) => !seenSet.has(s.text)));

  for (let i = 0; i < count; i += 1) {
    if (bag.length === 0) {
      // Unseen pool exhausted - reshuffle silently. The seen-set resets to
      // just what this draw has already handed out, so the next cycle can
      // use every statement again without repeating one still on screen.
      seenSet.clear();
      for (const p of picks) seenSet.add(p.text);
      bag = shuffle(pool.filter((s) => !seenSet.has(s.text)));
      if (bag.length === 0) break; // pool itself is empty - nothing to do
    }
    const next = bag.pop() as BlitzStatement;
    picks.push(next);
    seenSet.add(next.text);
  }

  return { picks, seen: Array.from(seenSet) };
}

// --- Task 71: the solo-blitz two-slot feed -------------------------------
// The screen shows ONE statement and keeps the NEXT already mounted behind
// it (a Tinder-style stack). A statement counts as SEEN only when it is
// promoted to `current` and shown - NEVER while it merely sits in `buffer`
// - so a round that ends mid-stack does not silently burn the buffered one.
// Same drawBlitzStatements underneath; the client holds one BlitzFeedState
// in a ref and dev/blitz-feed-check.ts exercises this exact pair.
export interface BlitzFeedState {
  current: BlitzStatement | null;
  buffer: BlitzStatement | null;
  seen: string[]; // texts of statements that have been DISPLAYED (current), only
}

// Grow the seen-set by one DISPLAYED statement. Once it covers the whole
// pool it resets to just that statement, so the no-repeat-until-all-seen
// cycle restarts without the on-screen statement immediately repeating.
function appendDisplayed(seen: readonly string[], text: string, poolSize: number): string[] {
  const next = seen.includes(text) ? [...seen] : [...seen, text];
  return next.length >= poolSize ? [text] : next;
}

// Round start: TWO draws. `current` is displayed, so it enters `seen`;
// `buffer` is drawn from a pool with `current` removed and is NOT seen yet.
export function startBlitzFeed(
  seen: readonly string[],
  rng: () => number = Math.random,
  pool: readonly BlitzStatement[] = BLITZ_STATEMENTS,
): BlitzFeedState {
  const current = drawBlitzStatements(seen, 1, rng, pool).picks[0] ?? null;
  if (!current) return { current: null, buffer: null, seen: [...seen] };
  const nextSeen = appendDisplayed(seen, current.text, pool.length);
  const buffer =
    drawBlitzStatements(nextSeen, 1, rng, pool.filter((s) => s.text !== current.text)).picks[0] ?? null;
  return { current, buffer, seen: nextSeen };
}

// Advance: promote `buffer` -> `current` (NOW it is seen) and refill
// `buffer` from a pool with the new `current` removed, so the reshuffle on
// pool exhaustion can never hand back the statement still on screen.
export function advanceBlitzFeed(
  state: BlitzFeedState,
  rng: () => number = Math.random,
  pool: readonly BlitzStatement[] = BLITZ_STATEMENTS,
): BlitzFeedState {
  const current = state.buffer;
  if (!current) return { current: null, buffer: null, seen: [...state.seen] };
  const seen = appendDisplayed(state.seen, current.text, pool.length);
  const buffer =
    drawBlitzStatements(seen, 1, rng, pool.filter((s) => s.text !== current.text)).picks[0] ?? null;
  return { current, buffer, seen };
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
  [ClientEvents.DEV_GET_NUMERIC_QUESTIONS]: () => void;
  [ClientEvents.DEV_GET_VOICE_LINES]: () => void;
  [ClientEvents.DRAW_SUBMIT]: (payload: DrawSubmitPayload) => void;
  [ClientEvents.DRAW_GUESS]: (payload: DrawGuessPayload) => void;
  [ClientEvents.NUMERIC_SUBMIT]: (payload: NumericSubmitPayload) => void;
  [ClientEvents.TRIAL_SUBMIT]: (payload: TrialSubmitPayload) => void;
  [ClientEvents.BLITZ_SWIPE]: (payload: BlitzSwipePayload) => void;
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
  [ServerEvents.STAGE_ANNOUNCE]: (payload: StageAnnouncePayload) => void;
  [ServerEvents.SOCRATES_SHOW]: (payload: SocratesShowPayload) => void;
  [ServerEvents.STEAL_SHOW]: (payload: StealShowPayload) => void;
  [ServerEvents.STEAL_RESOLVED]: (payload: StealResolvedPayload) => void;
  [ServerEvents.CROWD_MOOD]: (payload: CrowdMoodPayload) => void;
  [ServerEvents.CROWD_INTENSITY]: (payload: CrowdIntensityPayload) => void;
  [ServerEvents.DEV_DRAWING_RECEIVED]: (payload: DevDrawingReceivedPayload) => void;
  [ServerEvents.DEV_NUMERIC_QUESTIONS]: (payload: DevNumericQuestionsPayload) => void;
  [ServerEvents.DEV_VOICE_LINES]: (payload: DevVoiceLinesPayload) => void;
  [ServerEvents.DRAW_SHOW]: (payload: DrawShowPayload) => void;
  [ServerEvents.GUESS_SHOW]: (payload: GuessShowPayload) => void;
  [ServerEvents.GUESS_REVEAL_SHOW]: (payload: GuessRevealShowPayload) => void;
  [ServerEvents.NUMERIC_QUESTION_SHOW]: (payload: NumericQuestionShowPayload) => void;
  [ServerEvents.NUMERIC_REVEAL_SHOW]: (payload: NumericRevealShowPayload) => void;
  [ServerEvents.TRIAL_QUESTION_SHOW]: (payload: TrialQuestionShowPayload) => void;
  [ServerEvents.TRIAL_REVEAL_SHOW]: (payload: TrialRevealShowPayload) => void;
  [ServerEvents.BLITZ_SHOW]: (payload: BlitzShowPayload) => void;
  [ServerEvents.BLITZ_PROGRESS]: (payload: BlitzProgressPayload) => void;
  [ServerEvents.BLITZ_REVEAL_SHOW]: (payload: BlitzRevealPayload) => void;
};
