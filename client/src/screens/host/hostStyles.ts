import type { CSSProperties } from 'react';

export const QR_SIZE_PX = 240; // comfortably above the "at least 200px" floor

// React's CSSProperties doesn't model CSS custom properties - this lets the
// `--glow-color` variable the .glow/.glow-pulse classes read (see theme.css)
// be set inline per-element, since each glow needs a different colour.
export type CSSVars = CSSProperties & Record<`--${string}`, string>;

// "Slightly lighter panels with a subtle inner glow, so cards feel lit
// rather than painted on." Applied to every plain surface panel EXCEPT ones
// that also use the .glow/.glow-pulse classes - an inline boxShadow always
// wins over a CSS class's boxShadow, so combining the two would silently
// clobber the glow ring.
export const SURFACE_GLOW = 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 22px rgba(122,92,210,0.12)';

// TV overflow fix: every list whose height grows with player count (up to
// MAX_PLAYERS = 8) has to still fit inside the fixed 100vh container above.
// A TV audience only ever sees one of a handful of counts, so a few
// hand-picked steps read cleanly at each one instead of an unpredictable
// continuous shrink via clamp(). Index = densityStep(count).
const DENSITY_SCALE = [1, 0.82, 0.68, 0.56];

function densityStep(count: number): number {
  if (count <= 3) return 0;
  if (count <= 5) return 1;
  if (count <= 6) return 2;
  return 3; // 7-8
}

export function densityScale(count: number): number {
  return DENSITY_SCALE[densityStep(count)];
}

// The left column's own gap between phase sections - REVEAL in particular
// stacks several sections above its results list, so this shrinks too at
// high counts to give the list the room it needs.
export function containerGap(count: number): string {
  return `${(1.5 * densityScale(count)).toFixed(2)}rem`;
}

// LOBBY's player list - the one place "columns" (not just size) helps: past
// 4 players a single column runs too tall, so it switches to two.
export function lobbyPlayerListStyle(count: number): CSSProperties {
  const twoColumn = count > 4;
  const scale = count <= 4 ? 1 : count <= 6 ? 0.78 : 0.62;
  return {
    display: 'grid',
    gridTemplateColumns: twoColumn ? 'repeat(2, minmax(0, 1fr))' : '1fr',
    columnGap: '2rem',
    rowGap: `${(0.5 * scale).toFixed(2)}rem`,
    fontSize: `${(2.5 * scale).toFixed(2)}rem`,
    width: '100%',
    maxWidth: twoColumn ? '900px' : '640px',
  };
}

export function lobbyAvatarSize(count: number): number {
  return count <= 4 ? 2.75 : count <= 6 ? 2.15 : 1.7;
}

// GAME_OVER's final standings rows.
export function standingRowSizeStyle(count: number): CSSProperties {
  const s = densityScale(count);
  return {
    gap: `${(1.5 * s).toFixed(2)}rem`,
    fontSize: `${(2.25 * s).toFixed(2)}rem`,
    padding: `${(1 * s).toFixed(2)}rem ${(1.5 * s).toFixed(2)}rem`,
  };
}

export function standingAvatarSize(count: number): number {
  return 2.25 * densityScale(count);
}

export function standingsListGap(count: number): string {
  return `${(0.75 * densityScale(count)).toFixed(2)}rem`;
}

// REVEAL's per-player results list - the tallest, most player-count-sensitive
// section on that screen (up to 8 rows + a divider), so it gets the most
// aggressive shrink.
export function resultRowSizeStyle(count: number, fastest: boolean): CSSProperties {
  const s = densityScale(count);
  const baseFont = fastest ? 1.9 : 1.75;
  const padY = fastest ? 0.6 : 0.5;
  const padX = fastest ? 1.25 : 1;
  return {
    fontSize: `${(baseFont * s).toFixed(2)}rem`,
    padding: `${(padY * s).toFixed(2)}rem ${(padX * s).toFixed(2)}rem`,
    gap: `${(0.75 * s).toFixed(2)}rem`,
  };
}

export function resultAvatarSize(count: number): number {
  return 1.75 * densityScale(count);
}

export function resultsListGap(count: number): string {
  return `${(0.5 * densityScale(count)).toFixed(2)}rem`;
}

// Drawing mode (Task 56b) - GUESS_REVEAL stacks the picture ABOVE a
// player-count-sensitive results list (up to 7 guesser rows), unlike plain
// GUESS which has vertical room to spare for a big square image. Verified
// against a real 8-player render: without this shrink, the picture alone
// (drawingImageWrap's fixed min(52vh,46vw)) pushed total column height past
// 1080px, and centered-flex overflow clips symmetrically top+bottom rather
// than growing a scrollbar - silent, and NOT caught by a scrollHeight check
// (browsers don't count a centered overflow's "before" side toward it).
export function guessRevealImageWrapStyle(count: number): CSSProperties {
  const vh = 30 * densityScale(count);
  return {
    width: `min(${vh}vh, ${(vh * 0.88).toFixed(1)}vw)`,
    aspectRatio: '1 / 1',
    borderRadius: '1rem',
    overflow: 'hidden',
    border: '3px solid var(--border-strong)',
    boxShadow: SURFACE_GLOW,
    flexShrink: 0,
  };
}

// Task 38 - the persistent right-hand score column's rows. A narrower,
// shorter row than GAME_OVER's standingRow* (that column is only ~30% of
// the screen), but the same density-step philosophy: a few hand-picked
// sizes so up to MAX_PLAYERS (8) rows always fit with no scroll.
export function sidebarRowSizeStyle(count: number): CSSProperties {
  const s = densityScale(count);
  return {
    gap: `${(0.65 * s).toFixed(2)}rem`,
    fontSize: `${(1.3 * s).toFixed(2)}rem`,
    padding: `${(0.55 * s).toFixed(2)}rem ${(0.75 * s).toFixed(2)}rem`,
  };
}

export function sidebarAvatarSize(count: number): number {
  return 1.85 * densityScale(count);
}

export function sidebarListGap(count: number): string {
  return `${(0.5 * densityScale(count)).toFixed(2)}rem`;
}

// QUESTION/POWER_UP's per-player "who's answered" strip.
export function answeredNamesSizeStyle(count: number): CSSProperties {
  const s = densityScale(count);
  return {
    fontSize: `${(1.5 * s).toFixed(2)}rem`,
    gap: `${(0.75 * s).toFixed(2)}rem`,
  };
}

export function answeredAvatarSize(count: number): number {
  return 1.5 * densityScale(count);
}

export const styles: Record<string, CSSProperties> = {
  // Task 38 - the fixed two-column layout every in-game phase (QUESTION,
  // POWER_UP, REVEAL, STEAL) renders through: LEFT ~70% for the phase's own
  // content, RIGHT a FIXED ~30% for the always-visible score column, so it
  // never shifts or resizes as the phase content around it changes. Grid's
  // `fr` split (not percentages) means the gap is subtracted from the
  // tracks automatically, so 7fr/3fr + the gap below never overflows 100%.
  // The padding IS the ~3% safe-area margin real TVs crop at the edges.
  gameLayout: {
    display: 'grid',
    gridTemplateColumns: '7fr 3fr',
    gap: '2.5%',
    width: '100%',
    height: '100vh',
    boxSizing: 'border-box',
    padding: '3vh 3vw',
    overflow: 'hidden',
    background: 'var(--bg)',
    color: 'var(--text)',
    position: 'relative',
    zIndex: 1,
  },
  gameLayoutLeft: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    minHeight: 0,
    height: '100%',
    overflow: 'hidden',
  },
  gameLayoutRight: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    minWidth: 0,
    minHeight: 0,
    height: '100%',
    overflow: 'hidden',
  },
  scorePanelTitle: {
    fontSize: '1rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    textAlign: 'center',
    marginBottom: '0.75rem',
  },
  scorePanelList: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
  },
  scorePanelRow: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    borderRadius: '0.75rem',
    background: 'var(--surface)',
    color: 'var(--text)',
    boxSizing: 'border-box',
  },
  scorePanelRowLeader: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    borderRadius: '0.75rem',
    background: 'rgba(212, 175, 55, 0.1)',
    border: '2px solid var(--gold)',
    color: 'var(--text)',
    boxSizing: 'border-box',
  },
  scorePanelRowDisconnected: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    borderRadius: '0.75rem',
    background: 'var(--surface)',
    color: 'var(--text-faint)',
    opacity: 0.5,
    boxSizing: 'border-box',
  },
  scorePanelRank: {
    color: 'var(--text-dim)',
    minWidth: '1.6rem',
    flexShrink: 0,
    fontWeight: 700,
  },
  scorePanelName: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: 600,
  },
  scorePanelScore: {
    flexShrink: 0,
    fontFamily: 'monospace',
    fontWeight: 700,
  },
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.5rem',
    padding: '3rem 2rem',
    // Fixed to the viewport, not just a floor - every host view must fit
    // within 100vh at up to MAX_PLAYERS (8) players with no scrollbar,
    // since nobody can scroll a TV. The 3rem/2rem padding IS the overscan
    // safe margin (content never sits flush to a real TV's clipped edge).
    height: '100vh',
    overflow: 'hidden',
    width: '100%',
    background: 'var(--bg)',
    color: 'var(--text)',
    // Stacks above the fixed .confetti-piece / .firework-particle layers
    // (both z-index: 0) regardless of DOM order. The background light
    // sweep this originally also stacked above (Task 21) was removed in
    // Task 22; the GAME_OVER light rays (Task 21) were removed in Task 23.
    position: 'relative',
    zIndex: 1,
  },
  status: { fontSize: '1.25rem', color: 'var(--text-faint)' },
  createButton: {
    fontSize: '2rem',
    padding: '1.5rem 3rem',
    borderRadius: '0.75rem',
    border: 'none',
    background: 'var(--gold)',
    color: '#14161c',
    fontWeight: 700,
  },
  createButtonDisabled: {
    fontSize: '2rem',
    padding: '1.5rem 3rem',
    borderRadius: '0.75rem',
    border: 'none',
    background: 'var(--border)',
    color: 'var(--text-faint)',
    fontWeight: 700,
  },
  code: {
    fontSize: '8rem',
    fontWeight: 700,
    fontFamily: 'monospace',
    letterSpacing: '0.5em',
    color: 'var(--gold)',
  },
  qrWrapper: {
    // Explicit white background regardless of theme - QR scanning fails on
    // dark/inverted codes on many phone cameras, so this can't just inherit
    // whatever the page background happens to be.
    background: '#ffffff',
    padding: '1rem',
    borderRadius: '1rem',
    lineHeight: 0,
  },
  muteToggle: {
    position: 'fixed',
    top: '1rem',
    left: '1rem',
    fontSize: '1.5rem',
    lineHeight: 1,
    background: 'var(--surface)',
    border: '1px solid var(--border-strong)',
    borderRadius: '999px',
    padding: '0.5rem 0.7rem',
    boxShadow: SURFACE_GLOW,
    cursor: 'pointer',
    zIndex: 50,
  },
  fullscreenToggle: {
    position: 'fixed',
    top: '1rem',
    right: '1rem',
    fontSize: '1.5rem',
    lineHeight: 1,
    background: 'var(--surface)',
    border: '1px solid var(--border-strong)',
    borderRadius: '999px',
    padding: '0.5rem 0.7rem',
    boxShadow: SURFACE_GLOW,
    cursor: 'pointer',
    zIndex: 50,
  },
  cornerRoomCode: {
    position: 'fixed',
    top: '1rem',
    // Cleared of fullscreenToggle's own top-right corner (same fixed
    // position) so the two badges never overlap/clip each other.
    right: '4.75rem',
    fontSize: '1rem',
    fontWeight: 700,
    fontFamily: 'monospace',
    letterSpacing: '0.15em',
    color: 'var(--text)',
    background: 'var(--surface)',
    border: '1px solid var(--border-strong)',
    padding: '0.35rem 0.75rem',
    borderRadius: '0.5rem',
    boxShadow: SURFACE_GLOW,
    // Above the pause overlay - players may still need the room code while
    // paused (e.g. someone new scanning the QR mid-break isn't possible,
    // but the code itself must never be hidden).
    zIndex: 50,
  },
  pauseOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(10, 7, 22, 0.92)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem',
    zIndex: 40,
  },
  // Stage announcement (Task 31a). Sits ABOVE the pause overlay's z-index so
  // a stage entered while paused still reads, but below the corner room code
  // (50), which must never be covered.
  stageOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(10, 7, 22, 0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    zIndex: 45,
  },
  stageCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
    textAlign: 'center',
    maxWidth: '80%',
  },
  stageKicker: {
    fontSize: '2rem',
    fontWeight: 700,
    letterSpacing: '0.3em',
    color: 'var(--gold)',
  },
  stageTitle: {
    fontSize: 'clamp(3.5rem, 6vw, 6rem)',
    fontWeight: 900,
    lineHeight: 1.15,
    color: 'var(--text)',
  },
  stageTagline: {
    fontSize: '2rem',
    fontWeight: 600,
    color: 'var(--text-dim)',
  },
  stageRange: {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: 'var(--text-faint)',
  },
  pauseTitle: {
    fontSize: '5rem',
    fontWeight: 900,
    color: 'var(--text)',
    letterSpacing: '0.15em',
  },
  pauseSubtitle: {
    fontSize: '1.75rem',
    fontWeight: 600,
    color: 'var(--text-dim)',
  },
  counter: {
    fontSize: '2.5rem',
    fontWeight: 700,
    color: 'var(--text)',
  },
  playerList: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '0.5rem',
    fontSize: '2.5rem',
    minHeight: '3rem',
    width: '100%',
    maxWidth: '640px',
  },
  playerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
  },
  playerName: {
    fontWeight: 600,
    color: 'var(--text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  playerNameDisconnected: {
    fontWeight: 600,
    color: 'var(--text-faint)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
    opacity: 0.6,
  },
  waitingMessage: {
    fontSize: '2.5rem',
    fontWeight: 600,
    color: 'var(--text-dim)',
  },
  settingsSummary: {
    fontSize: '1.25rem',
    fontWeight: 600,
    color: 'var(--text-faint)',
  },
  category: {
    fontSize: '1.75rem',
    fontWeight: 600,
    color: 'var(--text-dim)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  progress: {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: 'var(--text-faint)',
  },
  questionText: {
    fontSize: '4rem',
    fontWeight: 700,
    textAlign: 'center',
    lineHeight: 1.3,
    maxWidth: '90%',
    color: 'var(--text)',
  },
  // QUESTION only. With the options gone (Task 29) the question is the
  // one thing to read on the TV, so it takes the space they used to.
  // clamp keeps the longest questions on screen at 1080p.
  questionTextTv: {
    fontSize: 'clamp(4rem, 6vw, 6rem)',
    fontWeight: 700,
    textAlign: 'center',
    lineHeight: 1.25,
    maxWidth: '85%',
    color: 'var(--text)',
  },
  optionsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1.5rem',
    width: '100%',
    maxWidth: '1100px',
  },
  optionCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    fontSize: '2.25rem',
    fontWeight: 600,
    padding: '1.5rem 2rem',
    borderRadius: '1rem',
    background: 'var(--surface)',
    border: '3px solid var(--border)',
    color: 'var(--text)',
  },
  optionLabel: {
    fontWeight: 800,
    minWidth: '2rem',
  },
  timerRingWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '7rem',
    height: '7rem',
    borderRadius: '50%',
    background: 'var(--surface)',
  },
  timer: {
    fontSize: '3rem',
    fontWeight: 800,
    fontFamily: 'monospace',
    color: 'var(--gold)',
  },
  answerCounter: {
    fontSize: '2rem',
    fontWeight: 700,
    color: 'var(--text-dim)',
  },
  answeredNames: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: '0.75rem',
    fontSize: '1.5rem',
    fontWeight: 600,
  },
  nameAnswered: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    color: 'var(--text)',
  },
  nameNotAnswered: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    color: 'var(--text-faint)',
  },
  optionCardCorrect: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    fontSize: '2.25rem',
    fontWeight: 700,
    padding: '1.5rem 2rem',
    borderRadius: '1rem',
    border: '3px solid',
    color: 'var(--text)',
  },
  optionCardWrong: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    fontSize: '2.25rem',
    fontWeight: 600,
    padding: '1.5rem 2rem',
    borderRadius: '1rem',
    background: 'var(--surface)',
    border: '3px solid',
    color: 'var(--text-faint)',
    opacity: 0.45,
    filter: 'grayscale(0.6)',
  },
  optionTextWrong: {
    color: 'var(--text-faint)',
  },
  answerCount: {
    marginLeft: 'auto',
    fontWeight: 800,
    color: 'var(--text-dim)',
  },
  // Socrates (Task 39) - his OWN phase, so nothing here is a banner squeezed
  // above other content: the card fills the left column on its own, and the
  // line is set at question-sized type because it IS the screen.
  socratesStageCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2rem',
    textAlign: 'center',
    width: '100%',
    maxWidth: '1000px',
    padding: '2.5rem',
  },
  socratesStageKicker: {
    fontSize: '1.75rem',
    fontWeight: 700,
    letterSpacing: '0.3em',
    color: 'var(--gold)',
  },
  socratesStageQuote: {
    fontSize: 'clamp(2.5rem, 4vw, 4rem)',
    fontWeight: 800,
    lineHeight: 1.25,
    color: 'var(--text)',
    fontStyle: 'italic',
  },
  socratesIntroBanner: {
    padding: '0.5rem 1.25rem',
    borderRadius: '0.75rem',
    background: 'rgba(212, 175, 55, 0.12)',
    border: '2px solid var(--gold)',
    color: 'var(--gold)',
    fontSize: '1.15rem',
    fontWeight: 700,
    textAlign: 'center',
    maxWidth: '700px',
  },
  resultsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    width: '100%',
    maxWidth: '700px',
  },
  resultRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    fontSize: '1.75rem',
    fontWeight: 600,
    padding: '0.5rem 1rem',
  },
  resultRowFastest: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    fontSize: '1.9rem',
    fontWeight: 800,
    padding: '0.6rem 1.25rem',
    borderRadius: '0.75rem',
    background: 'rgba(212, 175, 55, 0.12)',
    border: '2px solid var(--gold)',
  },
  resultsDivider: {
    height: '1px',
    background: 'var(--border)',
    margin: '0.4rem 0',
  },
  resultNameCorrect: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    flex: 1,
    minWidth: 0,
    color: 'var(--success)',
  },
  resultNameWrong: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    flex: 1,
    minWidth: 0,
    // --danger-text, not --danger - the raw answer-A red hex drops under
    // 4.5:1 as small text on the new, lighter stage background.
    color: 'var(--danger-text)',
  },
  resultNameText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  resultPoints: {
    flexShrink: 0,
    fontFamily: 'monospace',
    fontWeight: 700,
    color: 'var(--text)',
  },
  standingsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    width: '100%',
    maxWidth: '800px',
  },
  standingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    fontSize: '2.25rem',
    fontWeight: 700,
    padding: '1rem 1.5rem',
    borderRadius: '0.75rem',
    background: 'var(--surface)',
    color: 'var(--text)',
  },
  standingRowDisconnected: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    fontSize: '2.25rem',
    fontWeight: 700,
    padding: '1rem 1.5rem',
    borderRadius: '0.75rem',
    background: 'var(--surface)',
    color: 'var(--text-faint)',
    opacity: 0.5,
  },
  standingRowLeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    fontSize: '2.25rem',
    fontWeight: 700,
    padding: '1rem 1.5rem',
    borderRadius: '0.75rem',
    background: 'rgba(212, 175, 55, 0.1)',
    border: '2px solid var(--gold)',
    color: 'var(--text)',
  },
  standingRank: {
    color: 'var(--text-dim)',
    minWidth: '3rem',
  },
  standingName: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  standingScore: {
    flexShrink: 0,
    fontFamily: 'monospace',
  },
  gameOverTitleWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
    padding: '1.5rem 0',
    // Own stacking context, above the confetti/firework layers (both
    // z-index: 0) as direct siblings within .container - the winner name
    // must never be obscured by a piece crossing through the center.
    position: 'relative',
    zIndex: 2,
  },
  winnerAvatarRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: '1.5rem',
  },
  gameOverTitle: {
    position: 'relative',
    zIndex: 1,
    fontSize: '2.5rem',
    fontWeight: 700,
    color: 'var(--text-dim)',
  },
  winnerBanner: {
    position: 'relative',
    zIndex: 1,
    fontSize: '3.5rem',
    fontWeight: 800,
    color: 'var(--gold)',
    textAlign: 'center',
  },
  standingRowWinner: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    fontSize: '2.25rem',
    fontWeight: 700,
    padding: '1rem 1.5rem',
    borderRadius: '0.75rem',
    background: 'rgba(212, 175, 55, 0.14)',
    border: '3px solid var(--gold)',
    color: 'var(--text)',
  },
  wakeLockHint: {
    fontSize: '0.9rem',
    color: 'var(--text-faint)',
  },
  powerHint: {
    fontSize: '0.85rem',
    color: 'var(--text-faint)',
    textAlign: 'center',
    cursor: 'pointer',
    maxWidth: '32rem',
  },
  powerHintDismiss: {
    fontWeight: 700,
  },
  progressBarTrack: {
    width: '100%',
    maxWidth: '500px',
    height: '0.5rem',
    borderRadius: '999px',
    background: 'var(--border)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    background: 'var(--gold)',
    borderRadius: '999px',
    transition: 'width 1s linear',
  },
  // Drawing mode (Task 56b) - GUESS/GUESS_REVEAL's picture. Fixed square
  // (drawings export at 512x512 - see DRAWING_EXPORT_SIZE), sized off the
  // viewport's smaller dimension so it never pushes the options grid or
  // timer off a 100vh screen at any player count (criterion 4).
  drawingImageWrap: {
    width: 'min(52vh, 46vw)',
    aspectRatio: '1 / 1',
    borderRadius: '1rem',
    overflow: 'hidden',
    border: '3px solid var(--border-strong)',
    boxShadow: SURFACE_GLOW,
    flexShrink: 0,
  },
  drawingImage: {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    background: '#ffffff',
  },
  // Steal (Task 32) - the TV during and after a theft.
  stealThiefRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.25rem',
    fontSize: '3rem',
    fontWeight: 800,
    color: 'var(--gold)',
  },
  stealAmount: {
    fontSize: '2.25rem',
    fontWeight: 700,
    color: 'var(--text-dim)',
  },
  stealVictimRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.25rem',
    fontSize: '2.5rem',
    fontWeight: 700,
    color: 'var(--text)',
  },
  stealMovedAmount: {
    fontSize: 'clamp(4rem, 7vw, 7rem)',
    fontWeight: 800,
    color: 'var(--gold)',
  },
  stealNothing: {
    fontSize: '3rem',
    fontWeight: 700,
    color: 'var(--text-faint)',
  },
  stealClampNote: {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: 'var(--text-faint)',
  },
  stealScoreLine: {
    fontSize: '1.75rem',
    fontWeight: 600,
    color: 'var(--text-dim)',
  },
};
