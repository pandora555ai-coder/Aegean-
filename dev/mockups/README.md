## What this folder is

`aegean-olive-phases.html` is a design mockup of the Ελαιογραφία
direction across all eleven /host phases. Open it in a browser; the
tabs across the top switch phases.

It exists so a visual task has something concrete to match. It is
**reference material, not a source to copy from.**

## READ THIS BEFORE USING IT

**Take from it:** colours, spacing, hierarchy, which element is
largest, where the papyrus sits, when the scene is lit and when it is
dimmed, and which phases have a score column.

**Do NOT take from it:**

- **The crowd and Socrates are hand-written SVG cartoons.** They are
  placeholders standing in for a painted backdrop and an animated
  character layer. Never copy those shapes into the app.
- **The papyrus unroll uses `clip-path`.** Forbidden in production —
  it is a paint-heavy property on a TV browser. Use transforms only:
  panels that translate outward, or a scaleX wrapper with a
  counter-scaled inner.
- **All data is fake.** Player names, scores, question text, the
  drawing, the number line positions. None of it reflects real state.
- **Its CSS is standalone.** It uses raw hex and its own class names.
  The app reads from `client/src/palette-elaiografia.css` and no
  screen may contain a raw hex value.
- **It has no accessibility, no reconnect, no responsive behaviour.**

## The one structural idea worth taking

The scene **lights and dims**:

| Lit, Socrates centre | Dimmed, papyrus speaking |
|---|---|
| LOBBY, STAGE_ANNOUNCE, SOCRATES, GAME_OVER, STEAL | QUESTION, REVEAL, POWER_UP, DRAW, GUESS, GUESS_REVEAL, NUMERIC_* |

That rhythm is how a player knows whether to watch or to play, and it
is the half of the mockup that is code rather than artwork.

SOCRATES has **no score column**. When he speaks, he speaks alone.

## Assets this mockup is standing in for

- `client/public/scene/backdrop.webp` — painted crowd, temples, golden
  sky. **Empty centre.** Light from the LEFT.
- A Socrates layer — WebM/VP9 with alpha, or a Rive file. Not decided.
- `client/public/crowd/{calm,tension,cheer,boo}.ogg`.

Until those exist, the backdrop layer is a flat `--ground` rectangle
and the Socrates layer is empty. That is correct, not unfinished.
