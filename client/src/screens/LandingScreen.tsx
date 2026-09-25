import { type CSSProperties } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { getStoredHostRoomCode } from '../hostRoomCode';
import { greekUpper } from '../greekUpper';

export default function LandingScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const showDev = searchParams.has('dev');

  // A TV that already has a live/recoverable room (Task 14 auto-rejoin)
  // never sees the landing page at all - it goes straight back to its game.
  if (getStoredHostRoomCode()) {
    return <Navigate to="/host" replace />;
  }

  return (
    <div style={styles.container}>
      <div style={styles.brand}>
        <div style={styles.title}>Αιγαίον</div>
        <div style={styles.subtitle}>{greekUpper('Ο Σωκράτης εναντίον των Σοφιστών')}</div>
      </div>
      <div style={styles.choices}>
        <button
          style={styles.choiceButtonPrimary}
          type="button"
          data-testid="landing-join"
          onClick={() => navigate('/play')}
        >
          Σύνδεση σε δωμάτιο
        </button>
        <button
          style={styles.choiceButtonSecondary}
          type="button"
          data-testid="landing-create"
          onClick={() => navigate('/host')}
        >
          Δημιουργία δωματίου
        </button>
        <div style={styles.hint}>Για την οθόνη της τηλεόρασης</div>
      </div>
      {/* Task 72 - friends use the dev/test pages, so they must be findable.
          Task 316 - now only when the URL carries ?dev; the /dev route
          itself is unchanged. Plain text link, no button styling. */}
      {showDev && (
        <Link to="/dev" style={styles.devLink} data-testid="landing-dev">
          Δοκιμές
        </Link>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'clamp(1.5rem, 5vh, 3rem)',
    minHeight: '100vh',
    padding: '2rem 1.5rem',
    boxSizing: 'border-box',
    background: 'var(--night-0)',
    color: 'var(--marble)',
  },
  // Task 316 - the host lobby's own brand block (LobbyView's STYLE_TAG
  // .brand / .brand small): same serif stack, marble title, ember tagline.
  brand: {
    textAlign: 'center',
  },
  title: {
    fontFamily: '"Gentium Book Plus", Georgia, "Times New Roman", serif',
    fontSize: 'clamp(3rem, 14vw, 4.5rem)',
    fontWeight: 700,
    lineHeight: 0.95,
    color: 'var(--marble)',
    textShadow: '0 0.3rem 1.5rem rgba(0,0,0,.8)',
  },
  subtitle: {
    fontFamily: '-apple-system, sans-serif',
    fontSize: 'clamp(0.75rem, 3.2vw, 1.1rem)',
    fontWeight: 600,
    letterSpacing: '0.22em',
    color: 'var(--ember)',
    marginTop: '0.9rem',
  },
  choices: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
    width: '100%',
    maxWidth: '520px',
  },
  choiceButtonPrimary: {
    width: '100%',
    fontSize: 'clamp(1.15rem, 3vw, 1.75rem)',
    padding: 'clamp(1.1rem, 3vh, 1.75rem) 1.5rem',
    borderRadius: '1rem',
    border: 'none',
    background: 'var(--wine-2)',
    color: 'var(--marble)',
    fontWeight: 700,
    cursor: 'pointer',
  },
  choiceButtonSecondary: {
    width: '100%',
    fontSize: 'clamp(1.15rem, 3vw, 1.75rem)',
    padding: 'clamp(1.1rem, 3vh, 1.75rem) 1.5rem',
    borderRadius: '1rem',
    border: '2px solid var(--wine-2)',
    background: 'var(--marble)',
    color: 'var(--wine-2)',
    fontWeight: 700,
    cursor: 'pointer',
  },
  hint: {
    textAlign: 'center',
    fontSize: '0.95rem',
    color: 'var(--marble-3)',
    marginTop: '-0.5rem',
  },
  devLink: {
    fontSize: '1rem',
    color: 'var(--marble)',
    opacity: 0.65,
    textDecoration: 'underline',
  },
};
