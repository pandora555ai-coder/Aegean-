import type { Difficulty } from '@game/shared';

// Socrates: the host persona (Task 37a - renamed from "Game Master", text
// only, same module) - a teasing text commentator that reacts to what
// actually happened in the round (never anything not derivable from game
// state). Two kinds of line:
//   - a REVEAL line (socratesLine) - picked once per question, right after
//     scoring, from whichever MOMENT is the most interesting thing that
//     just happened (a streak, a comeback, a total wipeout...).
//   - a QUESTION-START line (socratesIntro) - a much lighter touch shown
//     briefly as the next question appears (final question, halfway
//     point, the category, or just a generic "let's go").
// Both are plain synchronous string computation - no I/O, no timers - so
// neither can ever delay a phase transition or the answer buttons becoming
// tappable, which is the hard constraint this whole module exists under.

export type Moment =
  // HIGH - rare, dramatic. Bypasses the per-player cooldown.
  | 'EVERYONE_WRONG'
  | 'ONLY_ONE_CORRECT'
  | 'EVERYONE_CORRECT'
  | 'BIG_COMEBACK'
  | 'LEAD_CHANGE'
  | 'HOT_STREAK_5'
  | 'PERFECT_GAME_PACE'
  // MEDIUM
  | 'HOT_STREAK_3'
  | 'STREAK_BROKEN'
  | 'SPEED_DEMON'
  | 'EASY_MISS'
  | 'HARD_HIT'
  | 'COLD_STREAK_3'
  | 'NO_ANSWER'
  | 'STUCK_IN_LAST'
  // LOW - fallback tier, so there is usually something to say.
  | 'FASTEST_THIS_ROUND'
  | 'CLOSE_SCORES'
  | 'RUNAWAY_LEAD'
  | 'GENERIC_TRANSITION';

export type IntroMoment = 'FINAL_QUESTION' | 'HALFWAY_POINT' | 'CATEGORY_CALLOUT' | 'GENERIC_INTRO';

// 0 = HIGH (bypasses cooldown), 1 = MEDIUM, 2 = LOW.
type Priority = 0 | 1 | 2;

export interface SocratesPlayerRoundInput {
  playerId: string;
  name: string;
  answered: boolean;
  correct: boolean;
  answerRank: number | null; // 1-based among correct answers only, fastest first - null if wrong/no-answer
  scoreBefore: number;
  scoreAfter: number;
}

export interface SocratesRoundContext {
  questionIndex: number; // 0-based
  totalQuestions: number;
  difficulty: Difficulty;
}

export interface SocratesQuestionIntroContext {
  questionIndex: number; // 0-based
  totalQuestions: number;
  category: string;
}

interface SocratesPlayerState {
  correctStreak: number;
  wrongStreak: number;
  fastestAnswerCount: number;
  previousRank: number | null;
  timesInLast: number;
  noAnswerCount: number;
  totalCorrect: number;
  totalRounds: number;
  // -1 = "never targeted" - the cooldown check (questionIndex - this < 3)
  // then always passes for a player who's never been called out.
  lastTargetedAtQuestionIndex: number;
}

export interface SocratesState {
  players: Map<string, SocratesPlayerState>;
  // Every line TEMPLATE (pre-substitution) already used this game, across
  // BOTH socratesLine and socratesIntro - "never repeat the exact same
  // line twice" is a whole-game invariant, not scoped per moment or per
  // surface.
  usedLines: Set<string>;
}

export function createSocratesState(): SocratesState {
  return { players: new Map(), usedLines: new Set() };
}

export function resetSocratesState(state: SocratesState): void {
  state.players.clear();
  state.usedLines.clear();
}

const MAX_NAME_DISPLAY_LENGTH = 12;

// Defense in depth: socratesLine/socratesIntro are rendered client-side
// as plain JSX text (React already escapes text-node content, so this
// isn't patching a real injection hole), but a player name is still
// arbitrary user input - HTML-tag-like characters are stripped and the
// length is capped before it is ever spliced into a line, independent of
// how any future consumer might render it.
function safeNameForLine(name: string): string {
  const stripped = name.replace(/[<>&]/g, '');
  const truncated =
    stripped.length > MAX_NAME_DISPLAY_LENGTH ? `${stripped.slice(0, MAX_NAME_DISPLAY_LENGTH)}…` : stripped;
  return truncated.length > 0 ? truncated : 'Παίκτης';
}

function safeCategoryForLine(category: string): string {
  return category.replace(/[<>&]/g, '');
}

function substitute(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => vars[key] ?? '');
}

// ============================= the line library =============================
// Greek, teasing/playful tone. Every line stays well under the ~90 char
// hard limit even after substitution (checked live in server/test tooling,
// not just eyeballed here). Gender-neutrality: Greek marks gender on
// articles ("ο/η"), predicate adjectives ("γρήγορος/η"), possessives
// ("του/της") and object pronouns ("τον/την") - since a player's name
// gives no reliable gender, every line below avoids these slots entirely
// rather than papering over them with a slash: {name} is used bare, as a
// grammatical subject or in apposition to a gender-fixed noun ("απάντηση"
// = answer, feminine; "σερί" = streak, neuter) wherever a 3rd-person
// article/adjective/pronoun would otherwise be needed, and several lines
// switch to direct 2nd-person address ("εσύ"/"σε"/"σου"), which Greek
// simply has no grammatical gender for. Zero "/" characters in any line.
// Mocks the ANSWER/PERFORMANCE only - never appearance, never intelligence
// as a trait, never anything not derivable from game state. Exported
// (only) so test tooling can inspect line counts/content directly -
// nothing else in this file needs it to be public.
export const LINES: Record<Moment, readonly string[]> = {
  EVERYONE_WRONG: [
    'Κανείς. Ούτε ένας. Επιτέλους μια στιγμή ειλικρινούς άγνοιας.',
    'Όλοι λάθος. Αυτό δεν είναι ερώτηση πια, είναι διάγνωση.',
    'Ώστε συμφωνείτε όλοι. Κρίμα που συμφωνείτε στο λάθος.',
    'Κοιτάξτε γύρω σας. Αυτοί είναι οι συνυποψήφιοί σας. Παρηγορηθείτε.',
    'Τέτοια ομοφωνία την είχαμε μόνο όταν καταδικάζαμε κάποιον.',
    'Μηδέν. Θα το θυμάμαι όταν διαλέγω μαθητή.',
  ],
  ONLY_ONE_CORRECT: [
    'Ένας. Μόνο {name} ανάμεσά σας. Κοιτάξτε καλά.',
    'Όλοι λάθος εκτός από {name}. Αυτό λέγεται διαφορά.',
    '{name} μόνο. Οι υπόλοιποι μόλις έχασαν λίγη αξιοπρέπεια.',
    'Ένας σωστός: {name}. Σημειώνω.',
    'Μόνο {name}. Το πλήθος το πρόσεξε αυτό.',
    'Ένας ανάμεσα σε τόσους. Έτσι ξεχωρίζει κάποιος.',
    // Task 45 - name-free additions.
    'Ένας μόνο. Ένας ανάμεσα σε τόσους.',
    'Κοιτάξτε ποιος σήκωσε το βάρος. Οι υπόλοιποι κοιτάγατε.',
    'Μία σωστή απάντηση σε όλη την Αγορά. Μία.',
  ],
  EVERYONE_CORRECT: [
    'Όλοι σωστά. Άρα η ερώτηση ήταν εύκολη. Μη μπερδεύεστε.',
    'Ομοφωνία. Ύποπτο πράγμα σε αίθουσα με τόσους φιλόδοξους.',
    'Μπράβο σε όλους. Τώρα κανείς δεν ξεχώρισε.',
    'Κανένα λάθος. Θα κάνω την επόμενη δυσκολότερη.',
    'Το ήξεραν όλοι. Δεν μαθαίνω τίποτα για εσάς έτσι.',
    'Ομόφωνα σωστό. Βαρετό, αλλά σωστό.',
  ],
  BIG_COMEBACK: [
    'Γύρισε το παιχνίδι. Πού ήσουν τόση ώρα, {name};',
    'Ώστε μπορούσες. Και το κράτησες κρυφό.',
    '{name} ανέβηκε από το πουθενά. Κοιτάτε, έτσι γίνεται.',
    'Επιστροφή. Δεν σε είχα υπολογίσει, {name}.',
    'Από πίσω μπροστά. Αυτό αξίζει περισσότερο από σταθερότητα.',
    '{name}, με έκανες να αλλάξω γνώμη. Δύσκολο πράγμα.',
    // Task 45 - name-free additions.
    'Γύρισε το παιχνίδι. Πού ήταν τόση ώρα αυτό;',
    'Επιστροφή από το πουθενά. Έτσι γίνεται.',
    'Κάποιος θυμήθηκε γιατί ήρθε.',
  ],
  LEAD_CHANGE: [
    'Άλλαξε η κορυφή. Ο θρόνος στην Αθήνα ποτέ δεν κράτησε πολύ.',
    'Νέο πρώτο όνομα: {name}. Οι υπόλοιποι θυμηθείτε πώς είναι να κυνηγάτε.',
    'Ώστε αλλάζουν τα πράγματα. Η βεβαιότητα με κουράζει.',
    '{name} πέρασε μπροστά. Για πόσο;',
    'Η κορυφή άλλαξε χέρια. Θα ξανααλλάξει.',
    '{name}, μόλις έγινες στόχος.',
  ],
  HOT_STREAK_5: [
    'Πέντε συνεχόμενες, {name}. Αυτό δεν το έχω ξαναδεί σήμερα.',
    '{name}, πέντε στη σειρά. Αρχίζω να πιστεύω ότι σε υποτίμησα.',
    'Πέντε. Οι υπόλοιποι, τι ακριβώς κάνετε;',
    '{name} τις παίρνει όλες. Η Αθήνα βρήκε το θέμα της.',
    'Πέντε συνεχόμενες. Αν πέσεις τώρα, θα πονέσει.',
    '{name}, σταμάτα να με εντυπωσιάζεις. Δεν το αντέχω.',
    // Task 45 - name-free additions. Second supplied line for this group,
    // "Πέντε συνεχόμενες. Οι υπόλοιποι, τι ακριβώς κάνετε;", is a straight
    // merge of two lines already in this pool ("Πέντε συνεχόμενες, {name}...
    // " and "Πέντε. Οι υπόλοιποι, τι ακριβώς κάνετε;") - distinct text,
    // kept. The third supplied line is shared with HOT_STREAK_3 above.
    'Πέντε συνεχόμενες. Οι υπόλοιποι, τι ακριβώς κάνετε;',
    'Κανείς δεν σταματάει αυτό το σερί. Περίεργο πλήθος σήμερα.',
  ],
  PERFECT_GAME_PACE: [
    'Ρυθμός χωρίς λάθος. Μήπως κάνω τις ερωτήσεις πολύ εύκολες;',
    'Κανένα λάθος ως τώρα. Αυτό δεν είναι σοφία, είναι υπόσχεση.',
    '{name}, τέλεια πορεία. Το ένα λάθος θα το θυμάσαι για πάντα.',
    'Χωρίς λάθος μέχρι στιγμής. Με ανησυχεί.',
    'Άψογα ως εδώ. Και το ως εδώ μετράει.',
    'Καθαρή πορεία. Οι καθαρές πορείες λερώνονται.',
  ],
  HOT_STREAK_3: [
    'Τρεις στη σειρά, {name}. Άρχισα να σε προσέχω.',
    '{name}, τρία συνεχόμενα. Αυτό δεν είναι τύχη πια.',
    'Τρεις σωστές. Κάποιος εδώ ξέρει τι κάνει.',
    '{name} δεν σταματάει. Κάποιος να κάνει κάτι.',
    'Τρία στη σειρά. Από εδώ και πέρα κάθε λάθος θα το θυμούνται.',
    '{name}, τρεις. Το πλήθος μέτρησε κι αυτό.',
    // Task 45 - name-free additions.
    'Τρεις στη σειρά. Άρχισα να προσέχω.',
    'Κανείς δεν σταματάει αυτό το σερί. Περίεργο πλήθος σήμερα.',
  ],
  STREAK_BROKEN: [
    'Τελείωσε το σερί. Όλα τελειώνουν, {name}, απλώς το δικό σου δημόσια.',
    'Και να που έπεσες. Η πτώση από ψηλά ακούγεται περισσότερο.',
    '{name}, σταμάτησες. Ήταν ωραία όσο κράτησε.',
    '{n} στη σειρά και μετά τίποτα.',
    'Το σερί έσπασε. Το πλήθος το πρόσεξε πριν από εσένα.',
    'Τέλος. Τώρα ξαναρχίζεις από την αρχή.',
  ],
  SPEED_DEMON: [
    'Απάντησες πριν τελειώσω. Είτε το ήξερες, είτε δεν με άκουγες.',
    'Ταχύτητα. Στην Αγορά ο πρώτος που μιλάει σπάνια έχει δίκιο.',
    '{name}, γρήγορα. Ελπίζω και σωστά.',
    'Τόση βιάση. Η γνώση δεν φεύγει, {name}.',
    'Πρόλαβες τους πάντες. Πρόλαβες να σκεφτείς;',
    'Αστραπή. Ας δούμε αν κρατάει.',
  ],
  EASY_MISS: [
    'Αυτό το ήξερε το πλήθος. Το πλήθος, {name}.',
    'Εύκολη ερώτηση. Την έκανες δύσκολη χωρίς λόγο.',
    'Θα προσποιηθώ ότι δεν το είδα. Οι υπόλοιποι όμως το είδαν.',
    '{name}, αυτό ήταν από τα εύκολα. Ήταν.',
    'Εύκολο ερώτημα, βαριά απάντηση.',
    'Δεν χρειαζόταν γνώση εδώ. Χρειαζόταν προσοχή.',
    // Task 45 - name-free additions. (a third supplied line, "Δεν χρειαζόταν
    // γνώση εδώ. Χρειαζόταν προσοχή.", was dropped: identical to the
    // existing line directly above - adding it again would be a dead
    // duplicate, permanently unselectable once the original is used.)
    'Αυτό το ήξερε το πλήθος. Το πλήθος.',
    'Εύκολη ερώτηση, βαριά αστοχία.',
  ],
  HARD_HIT: [
    'Δύσκολη, και {name} την πέτυχε. Τύχη ή γνώση;',
    'Λίγοι θα το ήξεραν. Σημείωσα το όνομά σου, {name}.',
    'Ώστε διαβάζεις. Επιτέλους κάποιος.',
    'Αυτό ήταν δύσκολο. Το πλήθος δεν το κατάλαβε καν.',
    '{name}, αυτό δεν το περίμενα. Συνέχισε.',
    'Σωστό σε δύσκολο ερώτημα. Αυτά μετράνε.',
  ],
  COLD_STREAK_3: [
    'Τρία λάθη στη σειρά, {name}. Υπάρχει μέθοδος εδώ.',
    '{name}, τρεις συνεχόμενες αστοχίες. Δοκίμασε να σκεφτείς πρώτα.',
    'Τρία στη σειρά. Λάθος, εννοώ.',
    '{name}, το πλήθος σταμάτησε να ελπίζει.',
    'Τρεις σερί αποτυχίες. Η σταθερότητα σου είναι αξιοθαύμαστη.',
    '{name}, κάτι δεν πάει καλά. Και το βλέπουν όλοι.',
  ],
  NO_ANSWER: [
    'Σιωπή από {name}. Θα την εκτιμούσα αν ήταν επιλογή.',
    '{name}, δεν απάντησες καθόλου. Τουλάχιστον δεν είπες βλακεία.',
    'Ο χρόνος πέρασε και {name} μαζί του.',
    'Καμία απάντηση. Η άγνοια τουλάχιστον ήταν σιωπηλή.',
    '{name}, σε περίμενα. Δεν ήρθες.',
    'Τίποτα. Κάποιες φορές αυτό λέει περισσότερα.',
    // Task 45 - name-free additions.
    'Καμία απάντηση. Η σιωπή τουλάχιστον δεν λέει βλακείες.',
    'Ο χρόνος πέρασε. Κάποιος τον άφησε να περάσει.',
    'Τίποτα. Και το τίποτα κι αυτό απάντηση είναι.',
  ],
  STUCK_IN_LAST: [
    '{name} ακόμα στην τελευταία θέση. Υπάρχει μια σταθερότητα εδώ.',
    'Τελευταία θέση από την αρχή. Τουλάχιστον υπάρχει συνέπεια.',
    'Μη φεύγεις, {name}. Κάποιος ορίζει τον πάτο.',
    '{name}, ο δρόμος προς τη σοφία ξεκινά εκεί που στέκεσαι. Στέκεσαι πολύ πίσω.',
    'Ακόμα εκεί. Αυτό λέει κάτι για την επιμονή σου.',
    '{name}, σε βλέπω. Δυστυχώς για σένα.',
    // Task 45 - name-free additions.
    'Ακόμα τελευταίος. Υπάρχει μια σταθερότητα εδώ που άλλοι θα ζήλευαν.',
    'Ο πάτος έχει κι αυτός τον φύλακά του.',
    'Κάποιος πρέπει να ορίζει το κάτω όριο. Ευχαριστούμε.',
  ],
  FASTEST_THIS_ROUND: [
    'Γρηγορότερα απ\' όλους: {name}. Το πλήθος εντυπωσιάστηκε. Εγώ όχι ακόμα.',
    'Πρώτο χέρι: {name}. Αυτό δίνει το βήμα, όχι το δίκιο.',
    'Τους πρόλαβες όλους, {name}. Κράτα το.',
    'Κανείς πιο γρήγορα από {name} αυτόν τον γύρο.',
    '{name}, πρώτο όνομα στη λίστα μου σήμερα.',
    'Ταχύτερη απάντηση: {name}. Σημειώθηκε.',
  ],
  CLOSE_SCORES: [
    'Κολλητά. Κανείς σας δεν έχει κερδίσει τίποτα ακόμα.',
    'Τόσο κοντά που η επόμενη κρίνει χαρακτήρες, όχι πόντους.',
    'Ισορροπία. Κάποιος πρέπει να τη χαλάσει.',
    'Λίγοι πόντοι σας χωρίζουν. Λίγοι πόντοι, μεγάλη διαφορά.',
    'Κανένας δεν ξεχωρίζει. Ακόμα.',
    'Στενό. Μου αρέσει όταν δεν ξέρω το τέλος.',
  ],
  RUNAWAY_LEAD: [
    '{name} ξέφυγε. Στην Αθήνα τον πρώτο τον εξοστρακίζαμε.',
    'Κάποιος έχει ξεφύγει και κανείς σας δεν κάνει τίποτα.',
    '{name}, τόσο μπροστά που άρχισες να βαριέσαι.',
    'Η διαφορά μεγαλώνει. Αυτό δεν είναι αγώνας πια.',
    '{name} μόνο εναντίον όλων. Και κερδίζει.',
    'Κάποιος να σταματήσει {name}. Παρακαλώ.',
    // Task 45 - name-free additions.
    'Κάποιος ξέφυγε. Και κανείς σας δεν κάνει τίποτα.',
    'Η διαφορά μεγάλωσε. Αυτό δεν είναι αγώνας πια.',
    'Στην Αθήνα τον πρώτο τον εξοστρακίζαμε. Απλή υπενθύμιση.',
  ],
  GENERIC_TRANSITION: [
    'Συνεχίζουμε. Η άγνοια δεν ξεκουράζεται.',
    'Επόμενη. Σας παρακολουθώ πιο στενά τώρα.',
    'Πάμε. Το πλήθος βαριέται πιο γρήγορα από μένα.',
    'Άλλη μία. Μη χαλαρώνετε.',
    'Προχωράμε. Κάποιος πρέπει να ξεχωρίσει.',
    'Επόμενο ερώτημα. Ελπίζω σε καλύτερα.',
  ],
};

// Exported for the same reason as LINES above.
export const INTRO_LINES: Record<IntroMoment, readonly string[]> = {
  FINAL_QUESTION: [
    'Τελευταία ερώτηση. Ό,τι μάθατε ως τώρα κρίνεται εδώ.',
    'Η τελευταία. Μετά διαλέγω μαθητή και δεν αλλάζω γνώμη.',
    'Ένα ερώτημα ακόμα. Και σας κρίνουν.',
    'Τέλος. Μία ερώτηση σας χωρίζει από την απάντηση.',
    'Η τελευταία ευκαιρία να με πείσετε.',
    'Μετά από αυτήν, σιωπή. Και μια απόφαση.',
  ],
  HALFWAY_POINT: [
    'Μισός δρόμος. Οι μισοί το κατάλαβαν ήδη ότι δεν θα τα καταφέρουν.',
    'Φτάσαμε στη μέση. Ό,τι χτίσατε μπορεί να καταρρεύσει.',
    'Μέση. Καλή στιγμή να αναρωτηθείτε γιατί ήρθατε.',
    'Οι μισές ερωτήσεις πέρασαν. Οι δύσκολες μένουν.',
    'Μέχρι εδώ καλά. Από εδώ και πέρα, δεν ξέρω.',
    'Μισό. Κανείς δεν έχει κερδίσει ακόμα.',
  ],
  CATEGORY_CALLOUT: [
    '{category}. Εδώ χωρίζονται όσοι ξέρουν από όσους νομίζουν.',
    'Ώστε φτάσαμε στο θέμα {category}. Ας δούμε ποιος διάβασε.',
    '{category}. Αυτό το θέμα δεν συγχωρεί το μπλόφαρισμα.',
    'Προσοχή τώρα: {category}.',
    '{category}. Κάποιοι από εσάς μόλις χλωμιάσατε.',
    'Θέμα: {category}. Δείξτε μου κάτι.',
  ],
  GENERIC_INTRO: [
    'Καλώς ήρθατε στην Αγορά. Για τη γνώση ήρθατε ή για το κοινό;',
    'Ένας από εσάς θα γίνει μαθητής μου. Οι υπόλοιποι θα φύγετε πιο ταπεινοί.',
    'Μαζευτήκατε. Τώρα δείξτε μου ότι αξίζατε τον δρόμο.',
    'Ξεκινάμε. Δεν ξέρω τίποτα, αλλά εσείς ξέρετε ακόμα λιγότερα.',
    'Η Αθήνα ακούει. Μιλήστε προσεκτικά.',
    'Καθίστε. Οι ερωτήσεις μου δεν είναι ευγενικές.',
  ],
};

// ============================= selection logic =============================

// Task 43: optional eleven_v3 emotion/non-verbal tags ("[sarcastic]",
// "[sighs]"...), keyed by the exact line TEMPLATE text they belong to - a
// side table rather than inline fields on LINES/INTRO_LINES so the pools
// above stay plain `readonly string[]`, and every existing selection/
// cooldown/dedup check (all of which key on template text) is untouched.
// A template with no entry here plays with no tag, exactly as before this
// map existed. Spoken only - prepended to the text sent to the TTS API by
// dev/generate-voice-lines.ts, never to what's shown on screen or to
// `text` below.
export const LINE_TAGS: Partial<Record<string, string>> = {
  'Κανείς. Ούτε ένας. Επιτέλους μια στιγμή ειλικρινούς άγνοιας.': '[sarcastic]',
  'Όλοι λάθος. Αυτό δεν είναι ερώτηση πια, είναι διάγνωση.': '[deadpan]',
  'Τελείωσε το σερί. Όλα τελειώνουν, {name}, απλώς το δικό σου δημόσια.': '[sighs]',
  'Πέντε συνεχόμενες, {name}. Αυτό δεν το έχω ξαναδεί σήμερα.': '[impressed]',
  '{name}, με έκανες να αλλάξω γνώμη. Δύσκολο πράγμα.': '[laughs]',
};

// A picked line, in three forms: `text` is what's shown on screen
// (placeholders substituted), `template` is the raw, un-substituted pool
// entry - kept around so the REVEAL beat can hand it to the client for
// Task 42b's audio lookup (client/public/voice/<lineHash(template, tag)>.mp3)
// - and `tag` is that same template's optional voice tag (Task 43), looked
// up from LINE_TAGS purely so callers don't have to import that map too.
export interface PickedLine {
  template: string;
  text: string;
  tag: string | null;
}

function pickLine(state: SocratesState, pool: readonly string[], vars: Record<string, string>): PickedLine | null {
  for (const template of pool) {
    if (!state.usedLines.has(template)) {
      state.usedLines.add(template);
      return { template, text: substitute(template, vars), tag: LINE_TAGS[template] ?? null };
    }
  }
  return null; // this moment's whole pool is exhausted this game
}

// Tied scores share the same rank (1,1,3 - not 1,2,3), same convention used
// everywhere else in this codebase.
function computeRanks(scores: Array<{ id: string; score: number }>): Map<string, number> {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const ranks = new Map<string, number>();
  let previousScore: number | null = null;
  let previousRank = 0;
  sorted.forEach((item, index) => {
    const rank = item.score === previousScore ? previousRank : index + 1;
    ranks.set(item.id, rank);
    previousScore = item.score;
    previousRank = rank;
  });
  return ranks;
}

interface Candidate {
  moment: Moment;
  priority: Priority;
  targetId: string | null;
  vars: Record<string, string>;
}

function ensurePlayerState(state: SocratesState, playerId: string): SocratesPlayerState {
  let p = state.players.get(playerId);
  if (!p) {
    p = {
      correctStreak: 0,
      wrongStreak: 0,
      fastestAnswerCount: 0,
      previousRank: null,
      timesInLast: 0,
      noAnswerCount: 0,
      totalCorrect: 0,
      totalRounds: 0,
      // Never-targeted-yet sentinel. Must be far enough in the past that
      // `questionIndex - lastTargetedAtQuestionIndex < 3` is false even at
      // questionIndex 0/1 - otherwise a player's very first appearance
      // looks like a false cooldown and silently suppresses every
      // MEDIUM/LOW moment for the first 2 questions of the game.
      lastTargetedAtQuestionIndex: -Infinity,
    };
    state.players.set(playerId, p);
  }
  return p;
}

// Called once per question, right after scoring - updates every connected
// player's tracked state, detects which MOMENTS fired, and returns the
// single highest-priority one whose target (if any) isn't on cooldown, as
// a ready-to-display line. Pure/synchronous - safe to call inline from
// endQuestion without risking any delay.
export function recordRoundAndPickLine(
  state: SocratesState,
  results: SocratesPlayerRoundInput[],
  context: SocratesRoundContext,
): PickedLine | null {
  if (results.length === 0) {
    return null;
  }

  for (const r of results) {
    ensurePlayerState(state, r.playerId);
  }

  const ranksAfter = computeRanks(results.map((r) => ({ id: r.playerId, score: r.scoreAfter })));
  const maxRankAfter = Math.max(...results.map((r) => ranksAfter.get(r.playerId) ?? 1));

  // Snapshots of state BEFORE this round's update - needed to detect
  // TRANSITIONS (a streak that just broke, a lead that just changed) as
  // opposed to a persistent state that was already true last round too.
  const preCorrectStreak = new Map<string, number>();
  const preRank = new Map<string, number | null>();
  for (const r of results) {
    const p = state.players.get(r.playerId)!;
    preCorrectStreak.set(r.playerId, p.correctStreak);
    preRank.set(r.playerId, p.previousRank);
  }

  for (const r of results) {
    const p = state.players.get(r.playerId)!;
    if (r.correct) {
      p.correctStreak += 1;
      p.wrongStreak = 0;
      p.totalCorrect += 1;
    } else {
      p.wrongStreak += 1;
      p.correctStreak = 0;
    }
    if (r.answerRank === 1) {
      p.fastestAnswerCount += 1;
    }
    if (!r.answered) {
      p.noAnswerCount += 1;
    }
    p.totalRounds += 1;
    const rankAfter = ranksAfter.get(r.playerId) ?? results.length;
    p.timesInLast = rankAfter === maxRankAfter ? p.timesInLast + 1 : 0;
    p.previousRank = rankAfter;
  }

  const candidates: Candidate[] = [];
  const correctCount = results.filter((r) => r.correct).length;

  // ---- HIGH ----
  if (correctCount === 0) {
    candidates.push({ moment: 'EVERYONE_WRONG', priority: 0, targetId: null, vars: {} });
  }
  if (correctCount === results.length) {
    candidates.push({ moment: 'EVERYONE_CORRECT', priority: 0, targetId: null, vars: {} });
  }
  if (correctCount === 1) {
    const only = results.find((r) => r.correct)!;
    candidates.push({
      moment: 'ONLY_ONE_CORRECT',
      priority: 0,
      targetId: only.playerId,
      vars: { name: safeNameForLine(only.name) },
    });
  }

  // BIG_COMEBACK / LEAD_CHANGE need a genuine "before" to compare against -
  // meaningless on the very first question, where every previousRank is null.
  if (context.questionIndex > 0) {
    let bestClimb = 0;
    let climber: SocratesPlayerRoundInput | null = null;
    for (const r of results) {
      const before = preRank.get(r.playerId);
      if (before === null || before === undefined) {
        continue;
      }
      const after = ranksAfter.get(r.playerId) ?? results.length;
      const climb = before - after;
      if (climb >= 2 && climb > bestClimb) {
        bestClimb = climb;
        climber = r;
      }
    }
    if (climber) {
      candidates.push({
        moment: 'BIG_COMEBACK',
        priority: 0,
        targetId: climber.playerId,
        vars: { name: safeNameForLine(climber.name), n: String(bestClimb) },
      });
    }

    const oldLeaderIds = new Set(results.filter((r) => preRank.get(r.playerId) === 1).map((r) => r.playerId));
    const newLeaders = results.filter((r) => ranksAfter.get(r.playerId) === 1);
    const sameLeadership =
      oldLeaderIds.size === newLeaders.length && newLeaders.every((r) => oldLeaderIds.has(r.playerId));
    if (!sameLeadership && newLeaders.length > 0 && oldLeaderIds.size > 0) {
      const newLeader = newLeaders[0];
      candidates.push({
        moment: 'LEAD_CHANGE',
        priority: 0,
        targetId: newLeader.playerId,
        vars: { name: safeNameForLine(newLeader.name) },
      });
    }
  }

  for (const r of results) {
    const p = state.players.get(r.playerId)!;
    if (p.correctStreak === 5) {
      candidates.push({
        moment: 'HOT_STREAK_5',
        priority: 0,
        targetId: r.playerId,
        vars: { name: safeNameForLine(r.name), n: '5' },
      });
    }
    if (p.totalRounds >= 5 && p.totalCorrect === p.totalRounds) {
      candidates.push({
        moment: 'PERFECT_GAME_PACE',
        priority: 0,
        targetId: r.playerId,
        vars: { name: safeNameForLine(r.name), n: String(p.totalRounds) },
      });
    }
  }

  // ---- MEDIUM ----
  for (const r of results) {
    const p = state.players.get(r.playerId)!;
    if (p.correctStreak === 3) {
      candidates.push({
        moment: 'HOT_STREAK_3',
        priority: 1,
        targetId: r.playerId,
        vars: { name: safeNameForLine(r.name), n: '3' },
      });
    }
    if (!r.correct && (preCorrectStreak.get(r.playerId) ?? 0) >= 3) {
      candidates.push({
        moment: 'STREAK_BROKEN',
        priority: 1,
        targetId: r.playerId,
        vars: { name: safeNameForLine(r.name) },
      });
    }
    if (r.answerRank === 1 && p.fastestAnswerCount >= 3) {
      candidates.push({
        moment: 'SPEED_DEMON',
        priority: 1,
        targetId: r.playerId,
        vars: { name: safeNameForLine(r.name), n: String(p.fastestAnswerCount) },
      });
    }
    if (context.difficulty === 'easy' && r.answered && !r.correct) {
      candidates.push({
        moment: 'EASY_MISS',
        priority: 1,
        targetId: r.playerId,
        vars: { name: safeNameForLine(r.name) },
      });
    }
    if (context.difficulty === 'hard' && r.correct) {
      candidates.push({
        moment: 'HARD_HIT',
        priority: 1,
        targetId: r.playerId,
        vars: { name: safeNameForLine(r.name) },
      });
    }
    if (p.wrongStreak === 3) {
      candidates.push({
        moment: 'COLD_STREAK_3',
        priority: 1,
        targetId: r.playerId,
        vars: { name: safeNameForLine(r.name), n: '3' },
      });
    }
    if (!r.answered) {
      candidates.push({
        moment: 'NO_ANSWER',
        priority: 1,
        targetId: r.playerId,
        vars: { name: safeNameForLine(r.name) },
      });
    }
    if (p.timesInLast >= 3) {
      candidates.push({
        moment: 'STUCK_IN_LAST',
        priority: 1,
        targetId: r.playerId,
        vars: { name: safeNameForLine(r.name), n: String(p.timesInLast) },
      });
    }
  }

  // ---- LOW ----
  const fastest = results.find((r) => r.answerRank === 1);
  if (fastest) {
    candidates.push({
      moment: 'FASTEST_THIS_ROUND',
      priority: 2,
      targetId: fastest.playerId,
      vars: { name: safeNameForLine(fastest.name) },
    });
  }
  const byScoreDesc = [...results].sort((a, b) => b.scoreAfter - a.scoreAfter);
  if (byScoreDesc.length >= 2) {
    const [top, second] = byScoreDesc;
    const margin = top.scoreAfter - second.scoreAfter;
    if (margin <= 150) {
      candidates.push({
        moment: 'CLOSE_SCORES',
        priority: 2,
        targetId: top.playerId,
        vars: { name: safeNameForLine(top.name), name2: safeNameForLine(second.name), n: String(margin) },
      });
    } else if (margin >= 1000) {
      candidates.push({
        moment: 'RUNAWAY_LEAD',
        priority: 2,
        targetId: top.playerId,
        vars: { name: safeNameForLine(top.name), score: String(top.scoreAfter) },
      });
    }
  }
  // The floor - always a candidate, never targets anyone, so it's never on
  // cooldown. "Always produce something."
  candidates.push({ moment: 'GENERIC_TRANSITION', priority: 2, targetId: null, vars: {} });

  candidates.sort((a, b) => a.priority - b.priority);

  for (const candidate of candidates) {
    if (candidate.targetId) {
      const p = state.players.get(candidate.targetId)!;
      const onCooldown = context.questionIndex - p.lastTargetedAtQuestionIndex < 3;
      // HIGH priority (0) bypasses the cooldown - a dramatic moment is
      // worth mentioning even if that player was just roasted last round.
      if (onCooldown && candidate.priority !== 0) {
        continue;
      }
    }
    const line = pickLine(state, LINES[candidate.moment], candidate.vars);
    if (line === null) {
      continue; // this moment's line pool is exhausted - try the next candidate
    }
    if (candidate.targetId) {
      state.players.get(candidate.targetId)!.lastTargetedAtQuestionIndex = context.questionIndex;
    }
    return line;
  }

  // Every candidate (including GENERIC_TRANSITION) was exhausted - only
  // reachable in a game far longer than this line library was sized for.
  return null;
}

// Called once per question, right before question:show - a much lighter
// touch than the REVEAL line, never targets a player, and must never delay
// the question/answer buttons appearing (also pure/synchronous).
export function pickQuestionIntro(state: SocratesState, context: SocratesQuestionIntroContext): string | null {
  const questionNumber = context.questionIndex + 1;
  const isFinal = questionNumber === context.totalQuestions;
  const isHalfway = !isFinal && context.totalQuestions >= 4 && questionNumber === Math.ceil(context.totalQuestions / 2);

  if (isFinal) {
    const line = pickLine(state, INTRO_LINES.FINAL_QUESTION, {});
    if (line) {
      return line.text;
    }
  }
  if (isHalfway) {
    const line = pickLine(state, INTRO_LINES.HALFWAY_POINT, {});
    if (line) {
      return line.text;
    }
  }
  const categoryLine = pickLine(state, INTRO_LINES.CATEGORY_CALLOUT, { category: safeCategoryForLine(context.category) });
  if (categoryLine) {
    return categoryLine.text;
  }
  return pickLine(state, INTRO_LINES.GENERIC_INTRO, {})?.text ?? null;
}
