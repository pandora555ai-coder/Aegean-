import { type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { DEV_ROUTES } from '../devRoutes';

// Task 72 - the index of every dev/test page, linked from the landing page
// as "Δοκιμές" so friends can find them. Phone-first: full-width rows, each
// at least 44px tall, one line of description. The list is DEV_ROUTES from
// devRoutes.tsx - the same array App.tsx builds its <Route>s from.
export default function DevIndexScreen() {
  return (
    <div style={styles.container}>
      <div style={styles.title}>Δοκιμές</div>
      <div style={styles.list}>
        {DEV_ROUTES.map((r) => (
          <Link key={r.path} to={r.path} style={styles.row} data-testid={`dev-link-${r.path}`}>
            <span style={styles.rowHead}>
              <span style={styles.rowTitle}>{r.title}</span>
              <span style={styles.rowPath}>{r.path}</span>
            </span>
            <span style={styles.rowDesc}>{r.description}</span>
          </Link>
        ))}
      </div>
      <Link to="/" style={styles.back} data-testid="dev-back">
        ← Αρχική
      </Link>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    minHeight: '100vh',
    padding: '1.5rem 1rem',
    boxSizing: 'border-box',
    background: 'var(--bg)',
    color: 'var(--text)',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: 800,
    marginBottom: '0.25rem',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
  },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
    width: '100%',
    minHeight: '44px',
    boxSizing: 'border-box',
    padding: '0.7rem 0.9rem',
    borderRadius: '0.7rem',
    border: '2px solid var(--gold)',
    background: 'var(--surface)',
    color: 'var(--text)',
    textDecoration: 'none',
  },
  rowHead: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.6rem',
  },
  rowTitle: {
    fontSize: '1.15rem',
    fontWeight: 700,
    color: 'var(--gold)',
  },
  rowPath: {
    fontSize: '0.85rem',
    fontFamily: 'monospace',
    opacity: 0.6,
  },
  rowDesc: {
    fontSize: '0.9rem',
    opacity: 0.8,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  back: {
    marginTop: '0.5rem',
    fontSize: '1rem',
    color: 'var(--gold)',
  },
};
