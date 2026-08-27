import { useLayoutEffect, type RefObject } from 'react';

interface FitFontSizeOptions {
  maxRem: number;
  minRem: number;
  stepRem?: number;
}

// Shrinks textRef's font-size (in rem) until its natural (unclamped)
// height fits inside containerRef's own box. containerRef must have a
// determinate height (e.g. flex: 1 in a column) for this to mean anything -
// measuring against a shrink-wrapped container just measures itself.
// Driven by the actual rendered overflow, not by character count, so a
// question can be edited to any length without this drifting out of date.
export function useFitFontSize(
  containerRef: RefObject<HTMLElement | null>,
  textRef: RefObject<HTMLElement | null>,
  deps: unknown[],
  { maxRem, minRem, stepRem = 0.1 }: FitFontSizeOptions,
): void {
  useLayoutEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) {
      return;
    }

    let size = maxRem;
    text.style.fontSize = `${size}rem`;
    while (text.scrollHeight > container.clientHeight && size > minRem) {
      size = Math.max(minRem, size - stepRem);
      text.style.fontSize = `${size}rem`;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
