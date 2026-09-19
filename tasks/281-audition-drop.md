# Task 281 — ship the 7 new clips through git for phone listening

Copied the 7 clips from Task 279's staging run into `audition-drop/2026-09-19/`
with self-describing names, and a README. No sudo, no deploy, nothing touched
under `/opt/party-game`.

## 1 — per file: source hash → new name, md5

| source hash | new name | md5 (both) |
|---|---|---|
| `bd12930f9369aa78` | `B1-thoughtful-bd12930f.mp3` | `56e0ec0ea3d03a39fe1252bbaa2fed6d` |
| `908d6d37b36aa4e9` | `B2-serious-908d6d37.mp3` | `d382931236bf398bcfb357fb550227e8` |
| `8a1a964d20b629b2` | `B3-warm-8a1a964d.mp3` | `ce43ab203050c4a63b707843f36cd64d` |
| `2edec02cc8a0cd0a` | `C1-sarcastic-2edec02c.mp3` | `ebd7691e33cb237ec2c481e12e04902d` |
| `9b482d51db0ca0d7` | `C2-sighs-9b482d51.mp3` | `ec9a9ba40a9480a9cb1e8961b3aa4a96` |
| `029e4cb422893a1d` | `C3-serious-029e4cb4.mp3` | `4e493d8f0298981e1b43efe3e735d113` |
| `069ef3480d9af33f` | `vocative-Niko-069ef348.mp3` | `36f58b2aa51357f4d0377b04ed686f09` |

All 7 verified: `md5sum` of the copy equals `md5sum` of its staging source,
file for file (a `diff` of the two sorted hash lists reported identical).

## 2 — README quoted in full

```
# Audition drop — 2026-09-19

Seven clips from Task 279's real-spend run (`client/public/voice-staging`),
copied here read-only for phone listening. Not deployed; not in the bank.
Text, tag, duration and tail-silence are all as measured in
`tasks/279-coronation-clips-and-vocative.md`.

- **B1-thoughtful-bd12930f.mp3** — "Το πλήθος ξεχνάει. Ονόματα, νίκες, ήττες
  — όλα σβήνουν πριν σβήσουν οι δάδες." — tag `thoughtful` — 8.751 s —
  tail silence 40 ms
- **B2-serious-908d6d37.mp3** — "Απόψε είδα κάτι σπάνιο. Το θέατρο έμαθε ένα
  όνομα απέξω." — tag `serious` — 6.531 s — tail silence 240 ms
- **B3-warm-8a1a964d.mp3** — "Το δικό σου." — tag `warm` — 2.273 s — tail
  silence 1160 ms
- **C1-sarcastic-2edec02c.mp3** — "Ήρθα απόψε να κοροϊδέψω σοφιστές. Εύκολη
  δουλειά, συνήθως." — tag `sarcastic` — 5.878 s — tail silence 20 ms
- **C2-sighs-9b482d51.mp3** — "Κοιτάζω το σκορ σου και δεν βρίσκω τίποτα να
  κοροϊδέψω. Πρώτη φορά." — tag `sighs` — 5.878 s — tail silence 0 ms
- **C3-serious-029e4cb4.mp3** — "Η ειρωνεία μου σωπαίνει μπροστά σου.
  Μεγαλύτερο έπαθλο δεν έχω δώσει ποτέ." — tag `serious` — 6.426 s — tail
  silence 40 ms
- **vocative-Niko-069ef348.mp3** — "Νίκο" — tag none (vocative, tagless by
  design) — 0.679 s — tail silence 220 ms
```

## 3 — inverse

- Staging dir (`client/public/voice-staging`): **265 files**, mtime
  `2026-09-19 18:20:25` — both unchanged before/after the copy (copy reads,
  never writes, its source).
- Bank (`client/public/voice`): **130 files**, mtime `2026-08-26 05:15:25` —
  unchanged; nothing touched it.
- `git diff --stat` (HEAD before this commit vs. the staged tree): **8 new
  files** — the 7 renamed mp3s + `README.md` under `audition-drop/2026-09-19/`
  — plus this task report. Both mp3 dirs stayed gitignored the whole time
  (`.gitignore:6/11`); the new files needed `git add -f` since they live
  outside those ignored paths but are still `*.mp3`, which no rule actually
  ignores globally — `git status` showed them as untracked (`??`), not
  ignored, so `-f` was a no-op safety net here, not a bypass.

## 4 — GitHub URL path after push

`https://github.com/pandora555ai-coder/Aegean-/tree/main/audition-drop/2026-09-19`
(individual file: same path + `/<filename>`, or `blob/main/...` to view one;
remote is `Aegean-`, trailing dash, per `git remote -v`).
