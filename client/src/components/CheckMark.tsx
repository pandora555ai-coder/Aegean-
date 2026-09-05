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
// Sized to the reference's literal cqh figures - resolved against #root
// (palette-theatro.css's container-type:size, ~100vh), the same basis every
// other cqh usage on this TV uses. An earlier version doubled these numbers
// to compensate for a container bug (hostStyles.gameLayout was wrongly the
// nearest container, at half #root's height) - fixed at the root cause
// instead, so the literal reference figures are correct again.
const wrapStyle: CSSProperties = {
  display: 'inline-block',
  width: '1.6cqh',
  height: '3cqh',
  flex: '0 0 auto',
};

const shapeStyle = (visible: boolean): CSSProperties => ({
  display: 'block',
  width: '100%',
  height: '100%',
  borderRight: '0.6cqh solid var(--wine-2)',
  borderBottom: '0.6cqh solid var(--wine-2)',
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
