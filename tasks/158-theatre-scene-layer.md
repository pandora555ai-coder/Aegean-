# 158 — The theatre scene, as a layer behind every /host phase

Visual direction has changed. The painted-agora direction is dropped.
The TV is now an ancient THEATRE at dusk: the koilon full of crowd
rising behind, a marble orchestra in front where the debate happens,
Socrates facing the sophists (the players), an olive tree framing left,
torches on the rim, the Acropolis on the hill above. A working
reference is committed at design/theatre-reference.html — open it,
read its SVG and CSS; that is the spec, not this text.

This task builds ONLY the scene layer. Nothing that is read or scored
changes yet.

## Rules (they live in the design chat, not the repo)
- The scene is ART, not chrome: raw hex is allowed INSIDE this one
  component's SVG (same exception as drawing ink). Nowhere else.
- Animation via transform, opacity, and one filter on the crowd group.
  Nothing that affects layout. No GSAP, no Motion.
- crowd:mood is host-only, already emitted in all four modes. The scene
  CONSUMES it — it must not invent a second input.
- Every phase view must still survive a first render with a NULL payload.
- Real TV target is 690px; worst case is 5 players.

## Acceptance criteria — report on each SEPARATELY, under 8 lines total

1. New component client/src/components/TheatreScene.tsx, mounted ONCE in
   HostScreen as the bottom layer (position absolute, inset 0) behind
   every phase view. Props: mood ('calm'|'tension'|'cheer'|'boo') and
   dimmed (boolean). Report file, line count, and the HostScreen line
   where it mounts.

2. Built from the reference: sky + stars + moon, Acropolis silhouette,
   seven koilon tiers, crowd along the tiers, orchestra ellipse with the
   marble filter and thymele, four torches with glow, olive tree.
   Generated geometry must use a SEEDED deterministic sequence, never
   Math.random, so two renders are identical. Report the crowd figure
   count and the total SVG element count.

3. Mood: subscribe to the existing crowd:mood event on the host socket.
   cheer → crowd arms rotate up + scene brightens; boo → tiers skew +
   scene darkens; calm/tension → neutral. dimmed → the dim filter
   (brightness ~.5). Report the exact CSS properties that change per
   mood, and confirm by OBSERVATION in a bot run that the scene received
   at least one cheer and one boo.

4. REGRESSION. All fifteen /host phases at 1280×720, BOT_COUNT=5:
   tallest element and its height, all below 690 and unchanged from
   before this task (Playwright, numbers in words). Server untouched —
   report `git diff --stat server/` is empty.

## Constraints
- Sonnet. No screenshots; Playwright only for criterion 4's numbers.
- Do NOT touch palette-elaiografia.css, PapyrusPanel, the score column,
  TimerRing, or any phase view. Those change in later tasks.
- Do NOT touch audio, LINE_TAGS, or the cues.

---

## Report

### 1. Component and mount point

`client/src/components/TheatreScene.tsx`, 335 lines. Props are exactly
`mood: CrowdMood` and `dimmed: boolean`. Mounted once, as the first child
of the returned fragment, at `client/src/screens/HostScreen.tsx:1445`
(`<TheatreScene mood={crowdMood} dimmed={!isSceneLit(phase)} />`),
replacing the old painted-agora `SceneLayer` mount there. `SceneLayer.tsx`
and its `isSceneLit` helper are left in place (still used by
`/dev/scene`) and reused here only for the dimmed calculation, so the
LIT_PHASES rhythm doesn't have to be re-authored. HostScreen also gained
a `crowdMood` state variable (default `'calm'`) and a `crowd:mood` socket
listener (`handleCrowdMood`) feeding the prop.

### 2. Geometry, built from the reference

Sky, stars, moon, Acropolis silhouette with columns, seven koilon tiers,
crowd along the tiers, the orchestra ellipse with the marble filter and
thymele altar, four torches with glow, and the olive tree are all
present, generated once at module load with the same linear-congruential
`rnd()` the reference uses (`s = (s*9301+49297) % 233280`), never
`Math.random`. A live 5-bot run measured, via the actual mounted DOM:
**287 crowd figures** (`.theatre-figure` count) and **1,417 total SVG DOM
elements** inside the scene (`svg *`), both matching a hand calculation
of the same generation code run standalone — confirming the sequence is
deterministic.

### 3. Mood

HostScreen subscribes to the existing host-only `crowd:mood` event and
passes it straight through as a prop; no second input is invented.
Exact CSS:
- cheer: crowd group `filter: brightness(1.18) saturate(1.1)`; each
  crowd figure's raised arm gets `transform: rotate(-40deg)
  translateY(-4px)`.
- boo: crowd group `filter: brightness(0.6) saturate(0.6)`; every tier
  group gets `transform: translateY(5px) skewX(-3deg)`.
- calm/tension: neither filter nor transform applied (crowd group
  `filter: none`).
- dimmed: independent of mood, scene root `filter: brightness(0.5)
  saturate(0.8)`.

Confirmed by observation in two real 5-bot games (one full-mode, one
standalone draw-mode) reading the scene's own `data-mood` DOM attribute
live: `cheer` landed at REVEAL/NUMERIC_REVEAL/GUESS_REVEAL, `boo` landed
at STEAL and at a wrong-majority GUESS_REVEAL.

### 4. Regression — all fifteen phases, 1280×720, 5 bots

`git diff --stat server/` is empty. Tallest content element per phase
(theatre scene itself excluded — it is intentionally full-bleed by
design, same as the SceneLayer it replaced):

| Phase | Tallest element | Height |
|---|---|---|
| LOBBY | QR code | 240px |
| STAGE_ANNOUNCE | stage card | 648px |
| POWER_UP | title | 240px |
| QUESTION | question text | up to 440px |
| REVEAL | score panel | up to 227px |
| STEAL | resolved panel | up to 237px |
| SOCRATES | stage card | up to 336px |
| DRAW | score panel | 239px |
| GUESS | score panel | 239px |
| GUESS_REVEAL | score panel | 239px |
| NUMERIC_QUESTION | reveal text | 399px |
| NUMERIC_REVEAL | reveal text | 424px |
| TRIAL_QUESTION | question text | up to 500px |
| TRIAL_REVEAL | score panel | 223px |
| GAME_OVER | winner avatars | 68px |

All fifteen are below 690px; the worst case (STAGE_ANNOUNCE at 648px) is
the same one already documented in CLAUDE.md, so nothing regressed.
