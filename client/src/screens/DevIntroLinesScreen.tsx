import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

// Task 229 - dev-only audition page for the ten Task 228 game-intro lines.
// Listening only: no socket, no room, nothing wired into any phase, pool or
// registry. These ten lines aren't registered anywhere in socrates.ts yet
// (Task 228 only generated their audio, via a one-off scratch script, into
// the existing voice bank under the standard lineHash(text, null).mp3
// convention - same file naming DevVoiceAbScreen already relies on) so this
// page hardcodes the text/hash pairs rather than reading them from any pool.
interface IntroLine {
  n: number;
  text: string;
  hash: string;
}

const INTRO_LINES: IntroLine[] = [
  { n: 1, text: 'Καλώς ήρθατε στην Αθήνα.', hash: '7f2d66d6d53d0eb4' },
  {
    n: 2,
    text: 'Το θέατρο γέμισε από νωρίς. Ο δήμος αφήνει τη δουλειά του για δύο πράγματα: για τραγωδία, και για να δει κάποιον να πέφτει.',
    hash: '54aca0e610a5db0a',
  },
  { n: 3, text: 'Απόψε ήρθαν για το δεύτερο.', hash: '09e84ca59912d519' },
  {
    n: 4,
    text: 'Και ήρθατε κι εσείς. Σοφιστές, λένε. Άνθρωποι που πουλούν τη σοφία τους σε όποιον πληρώνει.',
    hash: 'f594a4de76f93812',
  },
  { n: 5, text: "Εγώ δεν έχω να πουλήσω τίποτα. Δεν ξέρω τίποτα. Γι' αυτό ρωτάω.", hash: '96bc93a35558e23e' },
  {
    n: 6,
    text: 'Και απόψε θα ρωτήσω εσάς. Πολλά. Σε γνώση, σε ταχύτητα, σε μνήμη — και σε πράγματα που δεν περιμένετε.',
    hash: 'af1fd7d81ed79ab7',
  },
  {
    n: 7,
    text: "Κάποιοι από εσάς θα λάμψετε νωρίς. Το πλήθος θ' αγαπήσει το όνομά σας.",
    hash: 'f3b0211b4bf3ef87',
  },
  { n: 8, text: 'Και θα δείτε πόσο γρήγορα το ξεχνάει.', hash: '99e69811562adf30' },
  {
    n: 9,
    text: "Ένας από εσάς θ' αντέξει ως το τέλος. Κάτι τον περιμένει εκεί. Δεν θα σας πω τι. Δεν το λέω ποτέ σε όσους δεν έφτασαν.",
    hash: '4eaa8d95482377db',
  },
  {
    n: 10,
    text: 'Το πλήθος θα κρίνει — και το πλήθος δεν είναι ευγενικό. Ας αρχίσουμε.',
    hash: 'd0e47e114b87ee92',
  },
];

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
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [runElapsedSec, setRunElapsedSec] = useState<number | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const stopRequestedRef = useRef(false);

  const handleLoadedMetadata = useCallback((hash: string, duration: number) => {
    setDurations((prev) => (prev[hash] === duration ? prev : { ...prev, [hash]: duration }));
  }, []);

  const knownCount = Object.keys(durations).length;
  const totalDurationSec = useMemo(
    () => INTRO_LINES.reduce((sum, line) => sum + (durations[line.hash] ?? 0), 0),
    [durations],
  );

  const playSequence = useCallback(async () => {
    stopRequestedRef.current = false;
    setRunStartedAt(performance.now());
    setRunElapsedSec(null);
    for (const line of INTRO_LINES) {
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
  }, [gapSec]);

  const handlePlayAll = useCallback(() => {
    void playSequence();
  }, [playSequence]);

  const handleStop = useCallback(() => {
    stopRequestedRef.current = true;
    for (const line of INTRO_LINES) {
      const el = audioRefs.current[line.hash];
      if (el) {
        el.pause();
      }
    }
    setPlayingIndex(null);
  }, []);

  useEffect(() => {
    if (playingIndex !== null || runStartedAt === null) {
      return;
    }
    setRunElapsedSec((performance.now() - runStartedAt) / 1000);
  }, [playingIndex, runStartedAt]);

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Δέκα νέες γραμμές εισαγωγής (dev only)</h1>
      <p style={styles.status}>
        Listening only - Task 228's ten new game-intro lines, not wired into any phase, pool or registry. Total
        duration ({knownCount}/{INTRO_LINES.length} clips loaded): <strong>{formatSeconds(totalDurationSec)}</strong>
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
        <button type="button" style={styles.playButton} onClick={handlePlayAll} data-testid="intro-lines-play-all">
          Παίξε όλες στη σειρά
        </button>
        <button type="button" style={styles.stopButton} onClick={handleStop} data-testid="intro-lines-stop">
          Σταμάτα
        </button>
        {playingIndex !== null && (
          <span style={styles.nowPlaying} data-testid="intro-lines-now-playing">
            Παίζει: #{playingIndex}
          </span>
        )}
        {playingIndex === null && runElapsedSec !== null && (
          <span style={styles.nowPlaying} data-testid="intro-lines-run-elapsed">
            Τελευταίο πέρασμα: {formatSeconds(runElapsedSec)}
          </span>
        )}
      </div>

      <div style={styles.rows}>
        {INTRO_LINES.map((line) => (
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
  hash: { fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--marble-3)' },
  duration: { fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--carve)' },
  lineText: { fontSize: '1.05rem', fontWeight: 600, color: 'var(--carve)' },
  audio: { width: '100%', height: '32px' },
};
