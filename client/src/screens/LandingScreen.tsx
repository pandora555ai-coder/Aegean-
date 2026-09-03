import { type CSSProperties } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { getStoredHostRoomCode } from '../hostRoomCode';

export default function LandingScreen() {
  const navigate = useNavigate();

  // A TV that already has a live/recoverable room (Task 14 auto-rejoin)
  // never sees the landing page at all - it goes straight back to its game.
  if (getStoredHostRoomCode()) {
    return <Navigate to="/host" replace />;
  }

  return (
    <div style={styles.container}>
      <div style={styles.title}>Trivia Party</div>
      <div style={styles.choices}>
        <button
          style={styles.choiceButtonPrimary}
          type="button"
          data-testid="landing-create"
          onClick={() => navigate('/host')}
        >
          Δημιουργία δωματίου
        </button>
        <button
          style={styles.choiceButtonSecondary}
          type="button"
          data-testid="landing-join"
          onClick={() => navigate('/play')}
        >
          Σύνδεση σε δωμάτιο
        </button>
      </div>
      {/* Task 72 - friends use the dev/test pages, so they must be findable.
          Plain text link, no button styling. */}
      <Link to="/dev" style={styles.devLink} data-testid="landing-dev">
        Δοκιμές
      </Link>
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
  title: {
    fontSize: 'clamp(2rem, 6vw, 4.5rem)',
    fontWeight: 800,
    textAlign: 'center',
    color: 'var(--marble)',
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
    color: 'var(--carve)',
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
  devLink: {
    fontSize: '1rem',
    color: 'var(--marble)',
    opacity: 0.65,
    textDecoration: 'underline',
  },
};
