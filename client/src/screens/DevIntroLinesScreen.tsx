import { useCallback, useMemo, useRef, useState, type CSSProperties } from 'react';

// Task 229/230 - dev-only audition page for the game-intro and stage-intro
// lines. Listening only: no socket, no room, nothing wired into any phase,
// pool or registry. None of these lines are registered anywhere in
// socrates.ts yet, so this page hardcodes the text/hash pairs rather than
// reading them from any pool - same approach Task 229 used for the original
// ten (Task 228's untagged intro lines, replaced in Task 230 by the tagged
// ones below, group "Εισαγωγή").
interface IntroLine {
  n: number;
  text: string;
  hash: string;
  tag: string;
}

interface Group {
  key: string;
  title: string;
  // Sequence groups play their lines back-to-back as one narrated block.
  // Alternative groups are options for the same beat - auditioned one at a
  // time, never as a sequence.
  sequence: boolean;
  lines: IntroLine[];
}

const GROUPS: Group[] = [
  {
    key: 'intro',
    title: 'Εισαγωγή (plays as a sequence)',
    sequence: true,
    lines: [
      { n: 1, tag: '[warm]', text: 'Καλώς ήρθατε στην Αθήνα.', hash: '35e4fb8b4163c1f6' },
      {
        n: 2,
        tag: '[amused]',
        text: 'Το θέατρο γέμισε από νωρίς. Ο δήμος αφήνει τη δουλειά του για δύο πράγματα: για τραγωδία, και για να δει κάποιον να πέφτει.',
        hash: '6dff7bac5460652f',
      },
      { n: 3, tag: '[dry]', text: 'Απόψε ήρθαν για το δεύτερο.', hash: '842169f9a829faaa' },
      {
        n: 4,
        tag: '[sarcastic]',
        text: 'Και ήρθατε κι εσείς. Σοφιστές, λένε. Άνθρωποι που πουλούν τη σοφία τους σε όποιον πληρώνει.',
        hash: 'a88a4ce657479a66',
      },
      {
        n: 5,
        tag: '[warm]',
        text: "Εγώ δεν έχω να πουλήσω τίποτα. Δεν ξέρω τίποτα. Γι' αυτό ρωτάω.",
        hash: 'c47dc43c584f58b2',
      },
      {
        n: 6,
        tag: '[thoughtful]',
        text: 'Και απόψε θα ρωτήσω εσάς. Πολλά. Σε γνώση, σε ταχύτητα, σε μνήμη — και σε πράγματα που δεν περιμένετε.',
        hash: '5ba8c95a8c49416b',
      },
      {
        n: 7,
        tag: '[warm]',
        text: "Κάποιοι από εσάς θα λάμψετε νωρίς. Το πλήθος θ' αγαπήσει το όνομά σας.",
        hash: '931e1a38950f65cf',
      },
      { n: 8, tag: '[dry]', text: 'Και θα δείτε πόσο γρήγορα το ξεχνάει.', hash: '3e92ccdd463e2f28' },
      {
        n: 9,
        tag: '[thoughtful]',
        text: "Ένας από εσάς θ' αντέξει ως το τέλος. Κάτι τον περιμένει εκεί. Δεν θα σας πω τι… δεν το λέω ποτέ σε όσους δεν έφτασαν.",
        hash: '16c6ea1676ae1cd9',
      },
      {
        n: 10,
        tag: '[serious]',
        text: 'Το πλήθος θα κρίνει — και το πλήθος δεν είναι ευγενικό. Ας αρχίσουμε.',
        hash: '837d1d6393c61fb2',
      },
    ],
  },
  {
    key: 'palaistra',
    title: 'Παλαίστρα (alternatives)',
    sequence: false,
    lines: [
      {
        n: 11,
        tag: '[serious]',
        text: 'Στην Παλαίστρα δεν συζητούσαν. Πάλευαν. Θα σας πω κάτι, κι εσείς θα το δεχτείτε ή θα το ρίξετε. Όποιος διστάσει, έχασε.',
        hash: '4171b462473d2c7c',
      },
      {
        n: 12,
        tag: '[serious]',
        text: 'Θα ακούσετε ισχυρισμούς. Άλλοι αληθεύουν, άλλοι όχι. Δεν έχετε χρόνο να ξεχωρίσετε — μόνο να διαλέξετε.',
        hash: 'b55bbb406348b3b9',
      },
      {
        n: 13,
        tag: '[amused]',
        text: 'Θα σας πω δώδεκα πράγματα. Δεν είναι όλα αληθινά. Ούτε έχετε χρόνο να καταλάβετε ποια.',
        hash: '15a41b1acf3b1073',
      },
    ],
  },
  {
    key: 'zografiki',
    title: 'Ζωγραφική (alternatives)',
    sequence: false,
    lines: [
      {
        n: 14,
        tag: '[curious]',
        text: 'Οι λέξεις σάς βοήθησαν ως τώρα. Ας δούμε τι κάνετε χωρίς αυτές.',
        hash: '4b9a56cfe96d3269',
      },
      {
        n: 15,
        tag: '[dry]',
        text: 'Ο ζωγράφος ξέρει. Δεν επιτρέπεται να μιλήσει. Ίσως είναι η μόνη φορά απόψε που κάποιος θα σωπάσει… ενώ ξέρει.',
        hash: '3dfea3c22bfefa6a',
      },
    ],
  },
  {
    key: 'ektimisi',
    title: 'Εκτίμηση (alternatives)',
    sequence: false,
    lines: [
      {
        n: 16,
        tag: '[curious]',
        text: 'Πόσα; Αυτή είναι όλη η ερώτηση. Δεν χρειάζεται να ξέρετε — χρειάζεται να μαντέψετε καλύτερα από τους άλλους.',
        hash: 'e4529417379f1c98',
      },
      {
        n: 17,
        tag: '[amused]',
        text: 'Οι σοφοί μετρούσαν τον κόσμο. Εσείς θα τον μαντέψετε. Είναι σχεδόν το ίδιο, και πολύ πιο γρήγορο.',
        hash: 'e827ecccaf3484e5',
      },
    ],
  },
  {
    key: 'lithi',
    title: 'Η Λήθη (alternatives)',
    sequence: false,
    lines: [
      {
        n: 18,
        tag: '[serious]',
        text: 'Η Λήθη δεν παίρνει όσα ξεχνάτε. Παίρνει όσα δεν προσέξατε ποτέ.',
        hash: '9e4102d2b03800ba',
      },
      {
        n: 19,
        tag: '[thoughtful]',
        text: 'Θα σας δείξω, και μετά θα σας ρωτήσω. Ανάμεσα στα δύο, η Λήθη θα κάνει τη δουλειά της.',
        hash: 'd5fa0083a1e96354',
      },
    ],
  },
  {
    key: 'anavasis',
    title: 'Η Ανάβασις (plays as a sequence)',
    sequence: true,
    lines: [
      {
        n: 20,
        tag: '[serious]',
        text: 'Το θέατρο τελείωσε. Κοιτάξτε πού στέκεστε.',
        hash: '36ae9a28048b61c5',
      },
      {
        n: 21,
        tag: '[serious]',
        text: 'Δεν είστε όλοι στο ίδιο ύψος. Ό,τι κερδίσατε απόψε, εκεί πήγε — όχι σε νίκη, σε σκαλιά.',
        hash: 'a8ec509e4513305d',
      },
      {
        n: 22,
        tag: '[serious]',
        text: 'Από δω και πέρα δεν μετράει τι ξέρετε. Μόνο πόσο ψηλά φτάνετε. Ο ναός είναι εκεί πάνω, και χωράει έναν.',
        hash: 'b8399492286a98e1',
      },
    ],
  },
];

const ALL_LINES = GROUPS.flatMap((g) => g.lines);

const DEFAULT_GAP_SEC = 0.8;

function formatSeconds(sec: number | null): string {
  if (sec === null) {
    return '…';
  }
  return `${sec.toFixed(1)}s`;
}

export default function DevIntroLinesScreen() {
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [gapSec, setGapSec] = useState(DEFAULT_GAP_SEC);
  const [playingGroupKey, setPlayingGroupKey] = useState<string | null>(null);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [runElapsedSec, setRunElapsedSec] = useState<Record<string, number>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const stopRequestedRef = useRef(false);

  const handleLoadedMetadata = useCallback((hash: string, duration: number) => {
    setDurations((prev) => (prev[hash] === duration ? prev : { ...prev, [hash]: duration }));
  }, []);

  const knownCount = Object.keys(durations).length;
  const totalDurationSec = useMemo(
    () => ALL_LINES.reduce((sum, line) => sum + (durations[line.hash] ?? 0), 0),
    [durations],
  );

  const playSequence = useCallback(
    async (group: Group) => {
      stopRequestedRef.current = false;
      setPlayingGroupKey(group.key);
      const startedAt = performance.now();
      for (const line of group.lines) {
        if (stopRequestedRef.current) {
          break;
        }
        const el = audioRefs.current[line.hash];
        if (!el) {
          continue;
        }
        setPlayingIndex(line.n);
        el.currentTime = 0;
        await new Promise<void>((resolve) => {
          const onEnded = () => {
            el.removeEventListener('ended', onEnded);
            resolve();
          };
          el.addEventListener('ended', onEnded);
          void el.play();
        });
        if (stopRequestedRef.current) {
          break;
        }
        if (gapSec > 0) {
          await new Promise((resolve) => setTimeout(resolve, gapSec * 1000));
        }
      }
      setPlayingIndex(null);
      setPlayingGroupKey(null);
      setRunElapsedSec((prev) => ({ ...prev, [group.key]: (performance.now() - startedAt) / 1000 }));
    },
    [gapSec],
  );

  const handlePlayAll = useCallback(
    (group: Group) => {
      void playSequence(group);
    },
    [playSequence],
  );

  const handleStop = useCallback(() => {
    stopRequestedRef.current = true;
    for (const line of ALL_LINES) {
      const el = audioRefs.current[line.hash];
      if (el) {
        el.pause();
      }
    }
    setPlayingIndex(null);
    setPlayingGroupKey(null);
  }, []);

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Γραμμές εισαγωγής &amp; σκηνών (dev only)</h1>
      <p style={styles.status}>
        Listening only - game-intro and stage-intro lines, not wired into any phase, pool or registry. Total duration
        ({knownCount}/{ALL_LINES.length} clips loaded): <strong>{formatSeconds(totalDurationSec)}</strong>
      </p>

      <div style={styles.controls}>
        <label style={styles.gapLabel}>
          Gap between lines (s)
          <input
            type="number"
            min={0}
            step={0.1}
            value={gapSec}
            onChange={(e) => setGapSec(Math.max(0, Number(e.target.value) || 0))}
            style={styles.gapInput}
            data-testid="intro-lines-gap-input"
          />
        </label>
        <button type="button" style={styles.stopButton} onClick={handleStop} data-testid="intro-lines-stop">
          Σταμάτα
        </button>
        {playingIndex !== null && (
          <span style={styles.nowPlaying} data-testid="intro-lines-now-playing">
            Παίζει: #{playingIndex}
          </span>
        )}
      </div>

      {GROUPS.map((group) => (
        <section key={group.key} style={styles.group} data-testid={`intro-line-group-${group.key}`}>
          <div style={styles.groupHeader}>
            <h2 style={styles.groupTitle}>{group.title}</h2>
            {group.sequence && (
              <div style={styles.groupControls}>
                <button
                  type="button"
                  style={styles.playButton}
                  onClick={() => handlePlayAll(group)}
                  data-testid={`intro-lines-play-all-${group.key}`}
                >
                  Παίξε όλες στη σειρά
                </button>
                {playingGroupKey === null && runElapsedSec[group.key] !== undefined && (
                  <span style={styles.nowPlaying} data-testid={`intro-lines-run-elapsed-${group.key}`}>
                    Τελευταίο πέρασμα: {formatSeconds(runElapsedSec[group.key])}
                  </span>
                )}
              </div>
            )}
          </div>

          <div style={styles.rows}>
            {group.lines.map((line) => (
              <div
                key={line.hash}
                style={{
                  ...styles.row,
                  ...(playingIndex === line.n ? styles.rowActive : null),
                }}
                data-testid={`intro-line-row-${line.n}`}
              >
                <div style={styles.rowHeader}>
                  <span style={styles.number}>#{line.n}</span>
                  <span style={styles.tag}>{line.tag}</span>
                  <span style={styles.hash}>{line.hash}.mp3</span>
                  <span style={styles.duration} data-testid={`intro-line-duration-${line.n}`}>
                    {formatSeconds(durations[line.hash] ?? null)}
                  </span>
                </div>
                <div style={styles.lineText}>{line.text}</div>
                <audio
                  ref={(el) => {
                    audioRefs.current[line.hash] = el;
                  }}
                  controls
                  preload="metadata"
                  src={`/voice/${line.hash}.mp3`}
                  style={styles.audio}
                  data-testid={`intro-line-audio-${line.n}`}
                  onLoadedMetadata={(e) => handleLoadedMetadata(line.hash, e.currentTarget.duration)}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
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
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    flexWrap: 'wrap',
    padding: '0.75rem 1rem',
    borderRadius: '0.6rem',
    background: 'var(--marble)',
    border: '1px solid var(--marble-3)',
  },
  gapLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    fontSize: '0.85rem',
    color: 'var(--carve)',
  },
  gapInput: { width: '4.5rem', fontSize: '0.9rem', padding: '0.2rem 0.4rem' },
  playButton: {
    fontSize: '0.9rem',
    fontWeight: 700,
    padding: '0.5rem 1rem',
    borderRadius: '0.5rem',
    border: 'none',
    background: 'var(--wine-2)',
    color: 'var(--marble)',
    cursor: 'pointer',
  },
  stopButton: {
    fontSize: '0.9rem',
    fontWeight: 700,
    padding: '0.5rem 1rem',
    borderRadius: '0.5rem',
    border: '1px solid var(--wine-2)',
    background: 'transparent',
    color: 'var(--wine-2)',
    cursor: 'pointer',
  },
  nowPlaying: { fontSize: '0.85rem', fontWeight: 700, color: 'var(--ember)' },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
    paddingTop: '0.5rem',
    borderTop: '1px solid var(--marble-3)',
  },
  groupHeader: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' },
  groupTitle: { fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--marble)' },
  groupControls: { display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' },
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
  rowActive: { border: '1px solid var(--ember)' },
  rowHeader: { display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' },
  number: { fontSize: '0.85rem', fontWeight: 700, color: 'var(--wine-2)' },
  tag: { fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--ember)' },
  hash: { fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--marble-3)' },
  duration: { fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--carve)' },
  lineText: { fontSize: '1.05rem', fontWeight: 600, color: 'var(--carve)' },
  audio: { width: '100%', height: '32px' },
};
