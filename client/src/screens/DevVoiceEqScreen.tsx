import type { CSSProperties } from 'react';

// Task 145 - dev-only, listening-only A/B page for the EQ/dynamics-only
// "older, deeper Socrates" experiment (no pitch shift - Task 144's
// pitch-shifted matrix, at /dev/voice-matrix, sounded artificial and is
// left untouched). Static files only (no socket round-trip): the 4 source
// clips and 5 filename suffixes here MUST match
// dev/generate-voice-eq-matrix.ts's CLIPS/VARIANTS exactly, since that
// script is what actually wrote client/public/voice-matrix-eq/
// (gitignored, a real directory - NOT client/public/voice, read-only, and
// NOT Task 144's client/public/voice-matrix/). No rating controls on
// purpose - this page is for listening, not judging text.

interface Clip {
  hash: string;
  label: string;
  moment: string;
}

// Same 4 clips/hashes as Task 144, so the two matrices are directly
// comparable clip-for-clip.
const CLIPS: Clip[] = [
  { hash: 'f8fd43b55abb4ded', label: 'long-old', moment: 'GENERIC_INTRO' },
  { hash: '70a4306f0a9a8091', label: 'short-old', moment: 'FINAL_QUESTION' },
  { hash: '0b70f382e31dbd39', label: 'new49', moment: 'ALL_CLUSTERED' },
  { hash: '74d727dd9e68ce2c', label: 'old186', moment: 'STUCK_IN_LAST' },
];

// tag -> a short human label for the column header. Order is subtle ->
// pronounced, same order generate-voice-eq-matrix.ts wrote them in. v1 is
// EQ-only (no compression), so its effect can be judged in isolation.
const VERSIONS: { tag: string; heading: string }[] = [
  { tag: 'orig', heading: 'Original' },
  { tag: 'eq1_low+2_treb-1_pres-1_nocomp', heading: 'EQ only (subtle)' },
  { tag: 'eq2_low+4_treb-2_pres-2_comp2x', heading: 'EQ + comp 2:1' },
  { tag: 'eq3_low+6_treb-3_pres-3_comp3x', heading: 'EQ + comp 3:1' },
  { tag: 'eq4_low+8_treb-4_pres-4_comp4x', heading: 'EQ + comp 4:1 (pronounced)' },
];

export default function DevVoiceEqScreen() {
  const fileCount = CLIPS.length * VERSIONS.length;

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Βαθύτερος Σωκράτης — EQ matrix (dev only)</h1>
      <p style={styles.status}>
        EQ and dynamics ONLY - no pitch shift, duration-locked. {CLIPS.length} source clips × {VERSIONS.length}{' '}
        versions = {fileCount} files. Listening only - no ratings here.
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
                    src={`/voice-matrix-eq/${clip.hash}__${clip.label}__${version.tag}.mp3`}
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
    background: 'var(--night-0)',
    color: 'var(--marble)',
    boxSizing: 'border-box',
  },
  title: { fontSize: '1.5rem', fontWeight: 700, margin: 0 },
  status: { fontSize: '0.9rem', color: 'var(--marble-3)', margin: 0 },
  rows: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
    padding: '1rem',
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
  tag: { fontSize: '0.75rem', fontStyle: 'italic', color: 'var(--wine-2)' },
  hash: { fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--marble-3)' },
  versionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '0.75rem',
  },
  versionCell: { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  versionHeading: { fontSize: '0.75rem', fontWeight: 700, color: 'var(--marble)' },
  audio: { width: '100%', height: '32px' },
};
