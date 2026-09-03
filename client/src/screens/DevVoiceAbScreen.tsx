import type { CSSProperties } from 'react';

// Task 147 - dev-only, listening-only A/B page for Argyrios's new ElevenLabs
// voice ID, tried against exactly the 43 lines he rated GENIUS on /dev/voice.
// Static list (no socket round-trip): these 43 {moment, line, hash} rows are
// the GENIUS lines matched by exact text against LINE_TAGS
// (server/src/socrates.ts) - lineHash(text, tag) doesn't include a voice ID,
// so the existing clip and the new-voice clip share the SAME hash, just in
// different directories. "Original" always resolves under
// client/public/voice (read-only for agents, untouched by this page).
// "New voice" resolves under client/public/voice-ab (gitignored - see
// dev/generate-voice-lines.ts's ALT_OUTPUT_DIR/ALT_VOICE_ID/ONLY_HASHES) -
// Argyrios runs that generation himself, so this directory may be empty or
// missing entirely; a plain <audio src> with no file just shows a broken
// player, nothing crashes.
const NEW_VOICE_DIR = '/voice-ab';

interface GeniusLine {
  moment: string;
  line: string;
  hash: string;
}

const GENIUS_LINES: GeniusLine[] = [
  { moment: 'EVERYONE_WRONG', line: 'Κοιτάξτε γύρω σας. Αυτοί είναι οι συνυποψήφιοί σας. Παρηγορηθείτε.', hash: '16733ab743e895ff' },
  { moment: 'ONLY_ONE_CORRECT', line: 'Ένας μόνο. Οι υπόλοιποι μόλις έχασαν λίγη αξιοπρέπεια.', hash: '6ae5354eb3a335d9' },
  { moment: 'BIG_COMEBACK', line: 'Κάποιος ανέβηκε από το πουθενά. Κοιτάτε, έτσι γίνεται.', hash: '4fae99ff1757f1ba' },
  {
    moment: 'BIG_COMEBACK',
    line: 'Κάποιος γύρισε από εκεί που δεν γυρίζει κανείς. Ομολογώ ότι δεν τον είχα υπολογίσει.',
    hash: '7df8e72b24601c40',
  },
  {
    moment: 'BIG_COMEBACK',
    line: 'Και ξαφνικά κάποιος θυμήθηκε πώς να σκέφτεται. Λίγο αργά, αλλά το δέχομαι.',
    hash: '754358bb082d003c',
  },
  {
    moment: 'LEAD_CHANGE',
    line: 'Η κορυφή άλλαξε χέρια για μία ακόμη φορά. Μη συνηθίσετε κανέναν εκεί πάνω.',
    hash: '34581b3897cb1dde',
  },
  {
    moment: 'LEAD_CHANGE',
    line: 'Κάποιος πέρασε μπροστά, και μαζί πέρασε και ο στόχος στην πλάτη του. Θα το καταλάβει σύντομα.',
    hash: '14e053df27b48679',
  },
  {
    moment: 'HOT_STREAK_5',
    line: 'Πέντε στη σειρά από τον έναν, και οι υπόλοιποι κάθεστε και βλέπετε. Ντρέπομαι λίγο για λογαριασμό σας.',
    hash: '25270db827e68a63',
  },
  { moment: 'HOT_STREAK_5', line: 'Σταματήστε να με εντυπωσιάζετε. Δεν το αντέχω.', hash: 'c9abd3f7650d9558' },
  { moment: 'HOT_STREAK_5', line: 'Πέντε συνεχόμενες. Οι υπόλοιποι, τι ακριβώς κάνετε;', hash: '652084db950d3e31' },
  { moment: 'HOT_STREAK_3', line: 'Τρεις σωστές. Κάποιος εδώ ξέρει τι κάνει.', hash: '95a151cd0585460c' },
  {
    moment: 'SPEED_DEMON',
    line: 'Απάντησες πριν τελειώσω. Είτε το ήξερες, είτε δεν με άκουγες.',
    hash: 'd3fa7d4b823f0489',
  },
  { moment: 'HARD_HIT', line: 'Δύσκολη, και κάποιος την πέτυχε. Τύχη ή γνώση;', hash: '8f049904f4ac336e' },
  { moment: 'HARD_HIT', line: 'Λίγοι θα το ήξεραν. Σημείωσα ποιος.', hash: '199cdd02bdf1ebda' },
  {
    moment: 'HARD_HIT',
    line: 'Αυτό δεν το περίμενα από κανέναν σας, και το λέω χωρίς ειρωνεία. Συνεχίστε έτσι και θα το θυμάμαι.',
    hash: '9ccba1d29d8e84ce',
  },
  {
    moment: 'COLD_STREAK_3',
    line: 'Τρεις συνεχόμενες αστοχίες. Δοκιμάστε να σκεφτείτε πρώτα.',
    hash: '195970871b620871',
  },
  {
    moment: 'COLD_STREAK_3',
    line: 'Τρεις σερί αποτυχίες. Η σταθερότητα σου είναι αξιοθαύμαστη.',
    hash: 'ab9b337fec2b4cdd',
  },
  { moment: 'NO_ANSWER', line: 'Καμία απάντηση. Τουλάχιστον δεν ειπώθηκε βλακεία.', hash: '38f08bf2a850d004' },
  { moment: 'NO_ANSWER', line: 'Καμία απάντηση. Η σιωπή τουλάχιστον δεν λέει βλακείες.', hash: 'c04967d6b19523b8' },
  { moment: 'STUCK_IN_LAST', line: 'Μη φεύγει κανείς. Κάποιος ορίζει τον πάτο.', hash: 'ed01c6a9c4bef9d4' },
  {
    moment: 'STUCK_IN_LAST',
    line: 'Ο δρόμος προς τη σοφία ξεκινά εκεί που στέκεστε. Κάποιος στέκεται πολύ πίσω.',
    hash: '45975a5b6f86f7ed',
  },
  { moment: 'RUNAWAY_LEAD', line: 'Κάποιος έχει ξεφύγει και κανείς σας δεν κάνει τίποτα.', hash: '5983dff0a537a058' },
  { moment: 'RUNAWAY_LEAD', line: 'Τόσο μπροστά που άρχισε να βαριέται.', hash: '4e691e35c8a24215' },
  { moment: 'RUNAWAY_LEAD', line: 'Η διαφορά μεγαλώνει. Αυτό δεν είναι αγώνας πια.', hash: 'c37a8cec79bc4597' },
  {
    moment: 'HALFWAY_POINT',
    line: 'Οι μισές ερωτήσεις πέρασαν και είστε ακόμη όρθιοι. Οι δύσκολες όμως μένουν, και δεν συγχωρούν.',
    hash: '29a883d04a0c80da',
  },
  {
    moment: 'GENERIC_INTRO',
    line: 'Η Αθήνα ολόκληρη ακούει αυτή τη συζήτηση. Μιλήστε προσεκτικά, γιατί δεν ξεχνάει τίποτα.',
    hash: '8405bac8b8bbb493',
  },
  {
    moment: 'GAME_INTRO',
    line: 'Η μισή Αθήνα μαζεύτηκε εδώ για να σας δει. Ελπίζω να μην τους απογοητεύσετε όσο φοβάμαι.',
    hash: '78edb931b9ee806d',
  },
  { moment: 'GAME_INTRO', line: 'Ας αρχίσει η διαμάχη. Και ας κερδίσει ο λιγότερο ανόητος.', hash: 'eea57583f00f45f1' },
  { moment: 'WINNER', line: 'Ο νικητής κέρδισε τη θέση δίπλα μου. Ας δούμε αν την αντέχει.', hash: 'f48aa56c89af2880' },
  { moment: 'WINNER', line: 'Η διαμάχη έληξε. Πήρα την απόφασή μου.', hash: 'c812828687774257' },
  {
    moment: 'TRIAL_INTRO',
    line: 'Η Δίκη. Εδώ δεν υπερασπίζεστε γνώση, υπερασπίζεστε τον εαυτό σας.',
    hash: 'd295dac7a65e30d9',
  },
  {
    moment: 'TRIAL_INTRO',
    line: 'Φτάσαμε στον τελευταίο γύρο, στη Δίκη. Ξέρω καλά πώς τελειώνουν οι δίκες σε αυτή την πόλη.',
    hash: '3ddebe8b10733d14',
  },
  {
    moment: 'DRAW_INTRO',
    line: "Τελείωσαν οι λέξεις, μένουν οι γραμμές. Αναρωτιέμαι αν σχεδιάζετε καλύτερα απ' όσο μιλάτε.",
    hash: '200bb79823926232',
  },
  {
    moment: 'NOBODY_GUESSED',
    line: 'Κοίταξαν όλοι το έργο και κανείς δεν κατάλαβε τίποτα. Με ανησυχεί που δεν φταίει μόνο ένας.',
    hash: '062d6d25f616866d',
  },
  {
    moment: 'NOBODY_GUESSED',
    line: 'Ούτε ένας δεν βρήκε τι έβλεπε. Ή το χέρι πρόδωσε τη σκέψη, ή η σκέψη δεν ήρθε ποτέ.',
    hash: '1e0db4a0951d4f4f',
  },
  {
    moment: 'NOBODY_GUESSED',
    line: 'Το έργο έμεινε αίνιγμα για όλους. Θαυμάζω τον καλλιτέχνη — έκρυψε το θέμα του εντελώς.',
    hash: '2467ac4d0b0f94a4',
  },
  {
    moment: 'EVERYBODY_GUESSED',
    line: 'Κάθε ματιά έπεσε στο σωστό. Ο ζωγράφος μίλησε πιο καθαρά από κάθε ρήτορα σήμερα.',
    hash: '619861ad07941a99',
  },
  {
    moment: 'SPLIT_GUESS',
    line: 'Ένα σχέδιο και τόσες ερμηνείες. Κάπως έτσι χάθηκε και η δημοκρατία μας.',
    hash: 'cd4d921843879703',
  },
  {
    moment: 'EXACT_HIT',
    line: 'Το νούμερο βρέθηκε στο ακέραιο. Ομολογώ ότι τόση σιγουριά δεν την περίμενα από κανέναν σας.',
    hash: 'fdeab1a002e73e91',
  },
  {
    moment: 'EXACT_HIT',
    line: 'Μια βολή έπεσε στο κέντρο. Οι υπόλοιποι μετρήστε πόσο μακριά πέσατε, και ντραπείτε ανάλογα.',
    hash: 'dbca5c501889ff7f',
  },
  {
    moment: 'WILDLY_OFF',
    line: 'Κάποια εκτίμηση εδώ ξέφυγε από κάθε λογική. Αναρωτιέμαι σε ποιον κόσμο μετράνε έτσι.',
    hash: '895a1ed8de583379',
  },
  {
    moment: 'WILDLY_OFF',
    line: 'Είδα ένα νούμερο τόσο μακριά από την αλήθεια, που σχεδόν το θαύμασα. Σχεδόν.',
    hash: 'e35d1191f467a92d',
  },
  {
    moment: 'WILDLY_OFF',
    line: 'Η απόσταση από τη σωστή απάντηση μετριέται εδώ με πλοίο. Κάποιος να του δείξει τον χάρτη.',
    hash: '5310c18a5e28b2af',
  },
];

export default function DevVoiceAbScreen() {
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Νέα φωνή — Α/Β (dev only)</h1>
      <p style={styles.status}>
        The {GENIUS_LINES.length} lines rated GENIUS on /dev/voice, original voice vs. the new voice. No ratings
        here - listening only.
      </p>

      <div style={styles.rows}>
        {GENIUS_LINES.map((entry) => (
          <div key={entry.hash} style={styles.row}>
            <div style={styles.rowHeader}>
              <span style={styles.moment}>{entry.moment}</span>
              <span style={styles.hash}>{entry.hash}</span>
            </div>
            <div style={styles.lineText}>{entry.line}</div>
            <div style={styles.versionGrid}>
              <div style={styles.versionCell}>
                <span style={styles.versionHeading}>Original</span>
                <audio controls preload="none" src={`/voice/${entry.hash}.mp3`} style={styles.audio} />
              </div>
              <div style={styles.versionCell}>
                <span style={styles.versionHeading}>New voice</span>
                <audio controls preload="none" src={`${NEW_VOICE_DIR}/${entry.hash}.mp3`} style={styles.audio} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    padding: '1.5rem',
    maxWidth: '900px',
    margin: '0 auto',
    minHeight: '100dvh',
    background: 'var(--night-0)',
    color: 'var(--marble)',
    boxSizing: 'border-box',
  },
  title: { fontSize: '1.5rem', fontWeight: 700, margin: 0 },
  status: { fontSize: '0.9rem', color: 'var(--marble-3)', margin: 0 },
  rows: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.9rem 1rem',
    borderRadius: '0.6rem',
    background: 'var(--marble)',
    border: '1px solid var(--marble-3)',
  },
  rowHeader: { display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' },
  moment: {
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--marble-3)',
  },
  hash: { fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--marble-3)' },
  lineText: { fontSize: '1.05rem', fontWeight: 600 },
  versionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '0.75rem',
  },
  versionCell: { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  versionHeading: { fontSize: '0.75rem', fontWeight: 700, color: 'var(--wine-2)' },
  audio: { width: '100%', height: '32px' },
};
