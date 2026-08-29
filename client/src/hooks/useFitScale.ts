import { useLayoutEffect, type RefObject } from 'react';

// Scales contentRef down (never up) until its natural height fits the
// height containerRef has left after its own padding. Same idea as
// useFitFontSize, one level up: that one shrinks a single run of text, this
// one shrinks a whole stack whose parts are already sized by player count -
// GAME_OVER's celebration header plus up to MAX_PLAYERS standing rows.
//
// A transform, not a font-size loop, because the stack is avatars, papyrus
// and rows as well as text: one factor keeps every proportion inside it and
// costs one reflow instead of a search. The transform is measured from the
// centre, and the host container centres its children, so the scaled block
// stays centred - and getBoundingClientRect (what the TV-overflow checks
// read) reports the transformed box, so the result is verifiable the same
// way everything else on this screen is.
export function useFitScale(
  containerRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  deps: unknown[],
): void {
  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) {
      return;
    }

    // Measure unscaled - a transform left over from the previous pass would
    // otherwise be measured as if it were the natural size.
    content.style.transform = 'none';
    const style = getComputedStyle(container);
    const available =
      container.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const needed = content.scrollHeight;
    if (available <= 0 || needed <= 0) {
      return;
    }
    const scale = Math.min(1, available / needed);
    content.style.transform = scale < 1 ? `scale(${scale.toFixed(4)})` : 'none';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
