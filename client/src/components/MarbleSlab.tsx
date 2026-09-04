import type { CSSProperties, ReactNode } from 'react';

// Task 160 - replaces the previous host/ scroll panel component (deleted).
// Same component API (className/style/data-testid/children merge onto the
// returned element exactly like that component did) so every phase view
// needed only its import changed. Visual source: design/theatre-reference.html's
// .slab rules - chamfer clip-path, a veined texture layer, a diagonal "lit"
// sheen, and a drop-shadow that hugs the chamfer (not a box-shadow, which
// would draw a rectangle regardless of the clip).
//
// The reference puts `filter:drop-shadow(...)` directly on .slab, the SAME
// element it also transitions (opacity/transform). That's fine for a static
// mockup but expensive for real animated UI - a filter on a transitioning
// element forces the browser to regenerate its raster every frame. Here the
// filter lives on `overlayStyle`, an absolutely-positioned STATIC child that
// never animates; the returned outer element (which DOES receive the
// caller's `className`, e.g. "enter-pop") carries only transform/opacity.
// `isolation:'isolate'` on the outer gives that static child's negative
// z-index a stacking context to stay contained in, without needing a filter/
// transform of its own to manufacture one.
const SLAB_CLIP = 'polygon(1.5% 0, 98.5% 0.6%, 100% 3%, 99.4% 97%, 98% 100%, 2% 99.4%, 0 96%, 0.6% 3%)';

// One shared <filter id="marble"> (MarbleFilterDefs below, mounted once in
// HostScreen) - every slab's vein layer references it by url(#marble)
// rather than each carrying its own feTurbulence, so N slabs on screen at
// once still cost one filter definition, not N.
const MARBLE_FILTER_URL = 'url(#marble)';

const outerStyle: CSSProperties = {
  position: 'relative',
  isolation: 'isolate',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'stretch',
  flex: '0 0 auto',
  minHeight: 0,
  width: '100%',
  padding: '1.6rem 1.9rem',
  color: 'var(--carve)',
};

// Static (never transitions) - holds the filter, per the comment above.
const overlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: -1,
  pointerEvents: 'none',
  filter: 'drop-shadow(0 0.5rem 1rem rgba(0, 0, 0, 0.65))',
};

const baseLayerStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  clipPath: SLAB_CLIP,
  background: 'var(--marble)',
};

const veinLayerStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  clipPath: SLAB_CLIP,
  opacity: 0.9,
};

const veinSvgStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'block',
};

// rgba, not hex - the palette has no token for a directional light sheen,
// and this is exactly the "raw hex" rule's exemption for the filter/gradient
// literals the reference itself uses (see CLAUDE.md's colour section).
const litLayerStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  clipPath: SLAB_CLIP,
  pointerEvents: 'none',
  background:
    'linear-gradient(120deg, rgba(255, 255, 255, 0.35), transparent 40%, transparent 70%, rgba(60, 50, 30, 0.28))',
};

interface MarbleSlabProps {
  className?: string;
  style?: CSSProperties;
  'data-testid'?: string;
  children: ReactNode;
}

export function MarbleSlab({ className, style, children, ...rest }: MarbleSlabProps) {
  return (
    <div className={className} style={style ? { ...outerStyle, ...style } : outerStyle} {...rest}>
      <div style={overlayStyle} aria-hidden="true">
        <div style={baseLayerStyle} />
        <div style={veinLayerStyle}>
          <svg viewBox="0 0 800 400" preserveAspectRatio="none" style={veinSvgStyle}>
            <rect width={800} height={400} style={{ fill: 'var(--marble)' }} filter={MARBLE_FILTER_URL} />
          </svg>
        </div>
        <div style={litLayerStyle} />
      </div>
      {children}
    </div>
  );
}

// Mounted ONCE (HostScreen) - a visually hidden <svg> whose only job is to
// hold the shared #marble filter definition every MarbleSlab's vein layer
// references. Same feTurbulence/feColorMatrix/feGaussianBlur/feComposite
// chain as design/theatre-reference.html and TheatreScene's own
// #theatre-marble (a separate, unrelated id inside TheatreScene's own SVG -
// this component is never touched by that one).
export function MarbleFilterDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <filter id="marble" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency=".012 .03" numOctaves={4} seed={3} result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 .55  0 0 0 0 .5  0 0 0 0 .42  0 0 0 -1.4 1.1" result="v" />
          <feGaussianBlur in="v" stdDeviation=".6" result="vb" />
          <feComposite in="vb" in2="SourceGraphic" operator="in" />
        </filter>
      </defs>
    </svg>
  );
}
