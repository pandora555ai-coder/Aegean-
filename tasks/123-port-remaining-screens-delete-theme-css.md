# Task 123 — Port the remaining screens; theme.css must die

Ported LandingScreen, DevIndexScreen, DevDrawScreen, DevNumericScreen to the
Ελαιογραφία palette, then deleted client/src/theme.css and its import in
main.tsx.

theme.css held two things: dying colour vars (--bg, --surface, --text,
--danger, --success, etc.) and still-live structural CSS (box-sizing reset,
html/body/#root sizing, every entrance/glow/timer/confetti/firework
animation keyframe) used across already-ported host and controller screens.
Deleting the file outright would have broken those. Moved the structural CSS
into palette-elaiografia.css, converting its colour literals to the new
palette (old gold/cream rgba values recomputed from the new hex) and
replacing the one place true red carried meaning — the last-5-seconds timer
urgency pulse in TimerRing.tsx, out of this port's scope — with a literal
hex rather than inventing a red palette token nothing else would use.

DevNumericScreen's keep/cut/warning verdict UI had no --success/--danger
equivalent in the 10-token palette; mapped keep → gold (matches the
established primary-button pattern), cut → wood (matches the established
secondary/inactive pattern), warning badge → gold-outlined chip. This is
UI selection-state feedback, not the "correctness never uses hue" rule
(quiz answers), so reusing the existing gold/wood convention was correct.

Also cleaned up five stray `theme.css` string references in comments across
files this task didn't otherwise touch (Avatar.tsx, hostStyles.ts,
ControllerScreen.tsx, QuestionView.tsx, palette-elaiografia.css) so the
"theme.css" grep genuinely returns zero.

## Acceptance criteria

1. Whole-tree inverse palette check (var(--x) not in palette-elaiografia.css,
   excluding the 11 exempt local animation vars): 0 lines.
2. `grep -rn "theme.css" client/src`: 0 hits. `grep -rn -- "--gold:"
   client/src`: 1 hit, palette-elaiografia.css.
3. All four screens render on localhost:5173 with real content and non-zero
   bounding boxes (Playwright, 390x844 viewport):
   - LandingScreen "Δημιουργία δωματίου" button: 342x72.6 at (24, 347)
   - DevIndexScreen "← Αρχική" link: 358x18 at (16, 391)
   - DevDrawScreen "Ζωγραφική (dev)" h1: 371x21 at (10, 10)
   - DevNumericScreen summary row: 342x82 at (24, 128), text shows live
     counts ("Σύνολο: 42Keep: 0Cut: 0...")
4. `.screen-fade-in` (moved into palette-elaiografia.css) still computes
   animation-name: screen-fade-in, animation-duration: 0.28s on /host after
   the deletion — matches the original theme.css value, confirming the
   var(--x, default) fallback pattern the 11 local vars use wasn't broken.

Typecheck (`npx tsc --noEmit`) is clean. Both dev servers (vite on 5173)
were started fresh for verification and killed by PID afterward; the
pre-existing process on 4001 was left untouched.
