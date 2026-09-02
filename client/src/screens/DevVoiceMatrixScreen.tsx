import type { CSSProperties } from 'react';

// Task 144 - dev-only, listening-only A/B page for the "older, deeper
// Socrates" DSP experiment. Static files only (no socket round-trip): the
// 4 source clips and 5 filename suffixes here MUST match
// dev/generate-voice-matrix.ts's CLIPS/VARIANTS exactly, since that script
// is what actually wrote client/public/voice-matrix/ (gitignored, a real
// directory - NOT client/public/voice, which stays read-only). No rating
// controls on purpose - this page is for listening, not judging text.

interface Clip {
  hash: string;
  label: string;
  moment: string;
}

const CLIPS: Clip[] = [
  { hash: 'f8fd43b55abb4ded', label: 'long-old', moment: 'GENERIC_INTRO' },
  { hash: '70a4306f0a9a8091', label: 'short-old', moment: 'FINAL_QUESTION' },
  { hash: '0b70f382e31dbd39', label: 'new49', moment: 'ALL_CLUSTERED' },
  { hash: '74d727dd9e68ce2c', label: 'old186', moment: 'STUCK_IN_LAST' },
];

// tag -> a short human label for the column header. Order is subtle ->
// clearly deeper, same order generate-voice-matrix.ts wrote them in.
const VERSIONS: { tag: string; heading: string }[] = [
  { tag: 'orig', heading: 'Original' },
  { tag: 'v1_p-1st_b+3', heading: '-1 semitone' },
  { tag: 'v2_p-2st_b+5', heading: '-2 semitones' },
  { tag: 'v3_p-3st_b+7', heading: '-3 semitones' },
  { tag: 'v4_p-4st_b+9', heading: '-4 semitones' },
];

export default function DevVoiceMatrixScreen() {
  const fileCount = CLIPS.length * VERSIONS.length;

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Βαθύτερος Σωκράτης — depth matrix (dev only)</h1>
      <p style={styles.status}>
        DSP over existing clips only, duration-locked (rubberband tempo=1.0). {CLIPS.length} source clips ×{' '}
        {VERSIONS.length} versions = {fileCount} files. Listening only - no ratings here.
      </p>

      <div style={styles.rows}>
        {CLIPS.map((clip) => (
          <div key={clip.hash} style={styles.row}>
            <div style={styles.rowHeader}>
              <span style={styles.moment}>{clip.moment}</span>
              <span style={styles.tag}>{clip.label}</span>
              <span style={styles.hash}>{clip.hash}</span>
            </div>
            <div style={styles.versionGrid}>
              {VERSIONS.map((version) => (
                <div key={version.tag} style={styles.versionCell}>
                  <span style={styles.versionHeading}>{version.heading}</span>
                  <audio
                    controls
                    preload="none"
                    src={`/voice-matrix/${clip.hash}__${clip.label}__${version.tag}.mp3`}
                    style={styles.audio}
                  />
                </div>
              ))}
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
    maxWidth: '1100px',
    margin: '0 auto',
    minHeight: '100dvh',
    background: 'var(--deep)',
    color: 'var(--cream)',
    boxSizing: 'border-box',
  },
  title: { fontSize: '1.5rem', fontWeight: 700, margin: 0 },
  status: { fontSize: '0.9rem', color: 'var(--dim)', margin: 0 },
  rows: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
    padding: '1rem',
    borderRadius: '0.6rem',
    background: 'var(--panel)',
    border: '1px solid var(--wood)',
  },
  rowHeader: { display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' },
  moment: {
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--dim)',
  },
  tag: { fontSize: '0.75rem', fontStyle: 'italic', color: 'var(--gold)' },
  hash: { fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--dim)' },
  versionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '0.75rem',
  },
  versionCell: { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  versionHeading: { fontSize: '0.75rem', fontWeight: 700, color: 'var(--cream)' },
  audio: { width: '100%', height: '32px' },
};
