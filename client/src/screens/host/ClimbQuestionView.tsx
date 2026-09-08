import { useRef } from 'react';
import type { ClimbQuestionShowHostPayload } from '@game/shared';
import { useFitFontSize } from '../../hooks/useFitFontSize';
import { greekUpper } from '../../greekUpper';
import { MarbleSlab } from '../../components/MarbleSlab';
import { styles } from './hostStyles';

interface ClimbQuestionViewProps {
  climbQuestion: ClimbQuestionShowHostPayload;
}

// Task 189 - Η Ανάβασις's own question beat. Same "just the question, no
// options grid" shape as TrialQuestionView (the ladder is the score, shown
// by the climbers on the stair, not a slab) - but positioned like
// design/anavasis-reference.html's #qslab rather than inside GameLayout's
// read column: the climb bypasses that column entirely (HostScreen's
// showShell is false for all four climb/duel phases).
// Task 192 - Frame A of the climb's own alternation (CLAUDE.md's "no
// on-screen text while any body is moving"): this is the ONLY climb/duel
// view still carrying real text, because it's the only one where nothing on
// the stair is moving. Room-code/pause chrome moved up to HostScreen
// (AnavasisChrome, rendered once) so it lives OUTSIDE the scene container
// this view sits inside of.
// Task 198 - zIndex 3 (not 1): SocratesFigure (z-index 1, absolute, standing
// at the temple threshold behind this slab in the terrace's own left:57%)
// and AnavasisClimbers (z-index 2, fixed, a climber can stand at any step
// including ones behind this slab) both sat at or above this wrapper's old
// z-index 1, so on a z-index tie the LATER element in the DOM (Socrates)
// painted over the slab's text. 3 matches the "always-on-top chrome" tier
// HostScreen already uses for Krater/SpeechSlab, putting the read slab above
// every scene actor regardless of DOM order - the rule for Frame A (CLAUDE.md/
// task 198: "the slab is the topmost readable element, nothing overlaps its
// text, ever").
// Task 199 - `height: '42vh'` (new) is the determinate ceiling `useFitFontSize`
// needs: without it, this wrapper (and MarbleSlab/questionBlock inside it)
// simply grew to fit content - useFitFontSize compares text.scrollHeight
// against container.clientHeight, and an auto-height container's
// clientHeight always equals the text's own height, so the shrink loop
// never triggered and the longest question in the bank (100 chars) pushed
// the slab's bottom edge to 1148px, well past the 720px canvas
// (client/src/screens/host/ClimbQuestionView.tsx pre-199). 42vh keeps the
// bottom edge at top(9%) + 42vh = ~51% of the viewport - comfortably above
// where AnavasisClimbers render at climb entry (~55%, measured) and nowhere
// near the 720px canvas edge - the same "give the slab a real height so its
// flex children have something to shrink against" fix TrialQuestionView
// already uses via GameLayout's READ_AREA_HEIGHT + MarbleSlab's own
// `flex: '1 1 0'`.
const SLAB_WRAP_STYLE = {
  position: 'fixed',
  left: '16%',
  top: '9%',
  width: '52%',
  height: '42vh',
  zIndex: 3,
  display: 'flex',
  flexDirection: 'column',
} as const;

export function ClimbQuestionView({ climbQuestion }: ClimbQuestionViewProps) {
  const questionBlockRef = useRef<HTMLDivElement | null>(null);
  const questionTextRef = useRef<HTMLDivElement | null>(null);
  useFitFontSize(questionBlockRef, questionTextRef, [climbQuestion.question, climbQuestion.roundIndex], {
    maxRem: 5,
    minRem: 2,
  });
  return (
    <div style={SLAB_WRAP_STYLE} key={climbQuestion.roundIndex} className="screen-fade-in">
      <div className="enter-pop" style={styles.category}>
        {greekUpper(climbQuestion.category)}
      </div>
      <MarbleSlab className="enter-pop" style={{ flex: '1 1 0' }} data-testid="climb-question-slab">
        <div style={styles.questionBlock} ref={questionBlockRef}>
          <div style={{ ...styles.questionTextTv, fontSize: '3.5rem', color: 'var(--carve)' }} data-testid="question-text" ref={questionTextRef}>
            {climbQuestion.question}
          </div>
        </div>
      </MarbleSlab>
    </div>
  );
}
