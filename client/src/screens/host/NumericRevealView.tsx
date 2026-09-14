import { useMemo, useRef, type CSSProperties } from 'react';
import { NUMERIC_REVEAL_DURATION_MS, type NumericRevealShowPayload, type RoomCode } from '@game/shared';
import { useFitFontSize } from '../../hooks/useFitFontSize';
import { greekUpper } from '../../greekUpper';
import { GameLayout } from './GameLayout';
import { MarbleSlab } from '../../components/MarbleSlab';
import { styles } from './hostStyles';

// progressBarTrack is shared with GuessRevealView (hostStyles.ts) and still
// carries an old pre-Θέατρο token there - this phase's content is
// ported on its own, so it gets a local override instead of touching that
// shared entry.
const progressBarTrackStyle: CSSProperties = {
  width: '100%',
  maxWidth: '500px',
  height: '0.5rem',
  borderRadius: '999px',
  background: 'var(--marble)',
  overflow: 'hidden',
};

// Task 163d - design/theatre-reference.html's .numline, rebuilt with REAL
// positions (the reference's own markup is five hand-placed example ticks,
// not a layout algorithm). One tick per player who actually submitted
// (a null value - never answered - has nothing to plot), plus the truth,
// positioned proportionally across [min, max] of ALL of those values
// (submissions AND the truth) with 6% padding on each side so an extreme
// value's label never clips the slab's edge. This is the one place a
// player's name is read directly off the slab - a standing exception, the
// same as GUESS's drawer line.
const NUMLINE_PADDING_PCT = 6;
const NUMLINE_USABLE_PCT = 100 - NUMLINE_PADDING_PCT * 2;
// A label's real rendered width varies with the name/value text, but this
// component has no DOM measurement pass (server-driven content, no fit
// hook) - a fixed, generous horizontal budget per label is the simplest
// heuristic that keeps two labels sharing a lane from overlapping across
// the range an 8-player round actually produces. Sized in cqh off #root
// (palette-theatro.css) like everything else in this task - see
// CheckMark.tsx's comment for why these figures are the literal reference
// numbers, not doubled.
const NUMLINE_OVERLAP_THRESHOLD_PCT = 15;
// How far apart (in cqh, off the label's own font-size band) each stacked
// depth level sits - see the placement loop below. Two labels can share a
// side (above/below) only at DIFFERENT depths, which are far enough apart
// vertically that they never overlap each other regardless of horizontal
// position - so only same-(side,depth) pairs ever need the horizontal
// threshold at all.
const NUMLINE_DEPTH_STEP_CQH = 4;
// Task 242 - the fixed clearance every label keeps from the tick baseline,
// on TOP of the padding labelStyle already carries. Depth 0 above and depth
// 0 below used to both anchor at the SAME `calc(100% + 0)` line (the
// wrapper's own 0-height point, since it has no in-flow content to give
// "100%" a real basis) - fine when the two halves land at DIFFERENT X, but
// an exact guess (leftPct identical to the truth's) puts a guesser's label
// directly above the truth's, touching it with a measured 0px gap: an
// "ΑΒΓ 23" label's own bottom edge exactly equal to the truth "23" label's
// top edge (dev/242-numeric-check.ts). This constant pushes BOTH sides off
// that shared line so they never meet at zero, regardless of depth or X.
const NUMLINE_LABEL_GAP_CQH = 1.2;

interface NumlineMarker {
  key: string;
  leftPct: number;
  label: string;
  isTruth: boolean;
  side: 'above' | 'below';
  depth: number;
}

function buildNumlineMarkers(reveal: NumericRevealShowPayload): NumlineMarker[] {
  const submitted = reveal.results.filter(
    (result): result is typeof result & { value: number } => result.value !== null,
  );
  const allValues = [...submitted.map((result) => result.value), reveal.answer];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const span = max - min;
  const toLeftPct = (value: number): number =>
    span === 0 ? 50 : NUMLINE_PADDING_PCT + ((value - min) / span) * NUMLINE_USABLE_PCT;

  const unpositioned = [
    ...submitted.map((result) => ({
      key: result.playerId,
      leftPct: toLeftPct(result.value),
      label: `${result.name} ${result.value}`,
      isTruth: false,
    })),
    { key: 'truth', leftPct: toLeftPct(reveal.answer), label: `${reveal.answer}`, isTruth: true },
  ].sort((a, b) => a.leftPct - b.leftPct);

  // Depth-stacking placement: a marker tries above-depth-0, then
  // below-depth-0, then above-depth-1, below-depth-1, and so on, taking the
  // first slot whose last occupant (if any) is far enough away. Unlike a
  // fixed two-lane scheme, this can never run out of room - it only grows
  // as deep as the data genuinely clusters, and two labels at the same
  // depth are, by construction, always at least the threshold apart.
  const lastAtDepth: { above: number[]; below: number[] } = { above: [], below: [] };
  return unpositioned.map((marker) => {
    for (let depth = 0; ; depth++) {
      for (const side of ['above', 'below'] as const) {
        const last = lastAtDepth[side][depth];
        if (last === undefined || marker.leftPct - last >= NUMLINE_OVERLAP_THRESHOLD_PCT) {
          lastAtDepth[side][depth] = marker.leftPct;
          return { ...marker, side, depth };
        }
      }
    }
  });
}

// Task 248 - marginTop 6cqh -> 4cqh and marginBottom 4cqh -> 2.5cqh, which
// hands ~25px back to the question block above.
//
// Measured cause: on this screen the question block gets only 57px (the
// SLIDER screen's identical block gets 198px), because this slab carries the
// numline as well as the question. The bank's longest question needs two
// lines at useFitFontSize's 2rem FLOOR - scrollHeight 80 against clientHeight
// 57, i.e. 23px clipped by styles.questionBlock's `overflow: hidden`.
// Shrinking further is not an option worth having: two lines inside 57px
// needs ~1.4rem, which is not TV-at-couch-distance text. Width is not the
// lever either (questionTextTv caps at maxWidth 85%, and this string wraps to
// two lines at full width too), so the 23px has to come from height.
//
// It comes from HERE because every tick label is absolutely positioned: these
// margins are pure clearance, not flow, so trimming them costs no label any
// room of its own. What it does reduce is the gap an 'above' label has before
// it reaches the question text, which is exactly why the check for this task
// measures label-vs-label AND label-vs-question-text boxes rather than
// trusting the arithmetic (Task 242's own invariant, re-verified).
const numlineRootStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '6cqh',
  marginTop: '4cqh',
  marginBottom: '2.5cqh',
  borderBottom: '0.4cqh solid var(--marble-3)',
};

const tickStyle = (isTruth: boolean): CSSProperties => ({
  position: 'absolute',
  bottom: 0,
  left: 0,
  width: isTruth ? '0.7cqh' : '0.5cqh',
  height: isTruth ? '5.4cqh' : '3cqh',
  background: isTruth ? 'var(--wine-2)' : 'var(--marble-3)',
  transform: 'translateX(-50%)',
});

const labelStyle = (isTruth: boolean, side: 'above' | 'below', depth: number): CSSProperties => ({
  position: 'absolute',
  left: 0,
  [side === 'above' ? 'bottom' : 'top']: `calc(100% + ${NUMLINE_LABEL_GAP_CQH + depth * NUMLINE_DEPTH_STEP_CQH}cqh)`,
  transform: 'translateX(-50%)',
  fontSize: isTruth ? '2.8cqh' : '2.2cqh',
  fontWeight: 700,
  whiteSpace: 'nowrap',
  color: isTruth ? 'var(--wine-2)' : 'var(--carve)',
  padding: side === 'above' ? '0 0 0.4cqh' : '0.4cqh 0 0',
});

function Numline({ reveal }: { reveal: NumericRevealShowPayload }) {
  const markers = useMemo(() => buildNumlineMarkers(reveal), [reveal]);
  return (
    <div style={numlineRootStyle} data-testid="numeric-reveal-numline">
      {markers.map((marker) => (
        <div key={marker.key} style={{ position: 'absolute', left: `${marker.leftPct}%` }}>
          <div style={tickStyle(marker.isTruth)} />
          <div
            style={labelStyle(marker.isTruth, marker.side, marker.depth)}
            data-testid="numeric-reveal-tick-label"
            data-truth={marker.isTruth}
            data-side={marker.side}
            data-depth={marker.depth}
          >
            {marker.label}
          </div>
        </div>
      ))}
    </div>
  );
}

interface NumericRevealViewProps {
  reveal: NumericRevealShowPayload;
  roomCode: RoomCode | null;
  paused: boolean;
  pausedByName: string | null;
  secondsLeft: number;
}

// Task 66/163d - the TV during NUMERIC_REVEAL: the question, the number
// line (every submitted guess plus the truth, proportionally placed - see
// Numline above), and each player's own +N in the sophists row.
export function NumericRevealView({ reveal, roomCode, paused, pausedByName, secondsLeft }: NumericRevealViewProps) {
  const count = reveal.standings.length;
  const questionBlockRef = useRef<HTMLDivElement | null>(null);
  const questionTextRef = useRef<HTMLDivElement | null>(null);
  useFitFontSize(questionBlockRef, questionTextRef, [reveal.text, reveal.questionIndex, count], {
    maxRem: 6,
    minRem: 2,
  });

  return (
    <GameLayout
      roomCode={roomCode}
      paused={paused}
      pausedByName={pausedByName}
      standings={reveal.standings}
      contentKey={reveal.questionIndex}
    >
      <div className="enter-pop" style={styles.category}>
        {greekUpper(reveal.category)}
      </div>
      {/* flex:1 1 0 opts back into filling available height - useFitFontSize
          below needs a determinate, flexed container to shrink text against. */}
      <MarbleSlab className="enter-pop" style={{ flex: '1 1 0', flexDirection: 'column' }}>
        <div style={styles.questionBlock} ref={questionBlockRef}>
          <div
            style={{ ...styles.questionTextTv, color: 'var(--carve)' }}
            data-testid="numeric-reveal-text"
            ref={questionTextRef}
          >
            {reveal.text}
          </div>
        </div>
        <Numline reveal={reveal} />
      </MarbleSlab>
      <div style={styles.numericAnswerBanner} data-testid="numeric-reveal-answer">
        Σωστή απάντηση: {reveal.answer}
      </div>
      <div style={progressBarTrackStyle} data-testid="numeric-reveal-progress">
        <div
          style={{
            ...styles.progressBarFill,
            width: `${(secondsLeft / Math.ceil(NUMERIC_REVEAL_DURATION_MS / 1000)) * 100}%`,
          }}
        />
      </div>
    </GameLayout>
  );
}
