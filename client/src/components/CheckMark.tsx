import type { CSSProperties } from 'react';

// design/theatre-reference.html's .opt.ok::before - a checkmark drawn from
// two borders of a rotated box, not a glyph or an icon font. Rendered here
// as a real element (not a ::before) since inline React styles can't create
// pseudo-elements; ALWAYS present (opacity toggles), so a wrong option's
// text still starts flush with a correct option's, in the same column.
// Task 163d - colour never encodes correctness on its own (a shape does);
// --wine-2 is simply the one accent colour this whole read column uses for
// anything that needs to stand out (deltas are ember, this is wine - the
// two never appear on the same element).
// Sized 2x the reference's literal cqh figures throughout this task: the
// read column's own container (hostStyles.gameLayout) measures roughly half
// the reference's full-viewport .tv box (READ_AREA_HEIGHT reserves the
// bottom ~38vh for the sophists row), so a literal copy of the reference's
// numbers rendered at roughly half its intended, legible-from-a-couch size
// (measured: 4cqh option text at ~12.5px, smaller than the rem-based text it
// replaced). Doubling restores a comparable absolute size within this
// smaller container instead of re-anchoring every touched view to a new
// full-viewport root.
const wrapStyle: CSSProperties = {
  display: 'inline-block',
  width: '3.2cqh',
  height: '6cqh',
  flex: '0 0 auto',
};

const shapeStyle = (visible: boolean): CSSProperties => ({
  display: 'block',
  width: '100%',
  height: '100%',
  borderRight: '1.2cqh solid var(--wine-2)',
  borderBottom: '1.2cqh solid var(--wine-2)',
  transform: 'rotate(45deg) translate(-15%, -25%)',
  opacity: visible ? 1 : 0,
  transition: 'opacity 300ms',
});

export function CheckMark({ visible }: { visible: boolean }) {
  return (
    <span style={wrapStyle} aria-hidden="true">
      <span style={shapeStyle(visible)} />
    </span>
  );
}
