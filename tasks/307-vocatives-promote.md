# Task 307 — 200 vocatives generated, 243 clips promoted to the bank

## 1. Vocatives (real spend, staging, voice NOpBlnGInO9m6vDvFkFC)
- Pre-flight: 201 PRESET_NAMES, 201 distinct vocative hashes, 1 already on disk (Νίκο) -> **200 missing**.
- Dry run: 200 lines, **1252 chars** planned. Real run `--max-chars 2500`: **1372 chars billed**
  (+120), 17 tail-check retries (each recovered on attempt 2), 0 aborts, 0 budget refusals.
- **200/200 landed**, none missing. Re-run of checkTail on all 200: 0 fail.
  Duration 480–2320 ms (mean 1226); tail (trailing 20 ms windows < RMS 500) max 1780 ms, 34 clips 0 ms.
- Committed to audition-drop/2026-09-24/vocatives/ (200 mp3 + README: name, file, duration, tail, hash).

## 2. Promote
- `aegean-ops stage-clips`: prod staging 308 -> 508.
- `aegean-ops promote-to-bank` <43 task-306 hashes + 200 vocative hashes>: **243 PROMOTED, 0 refused**.
- Bank 137 -> **380** files; voice dir mtime 2026-09-19 21:39:12 -> 2026-09-24 17:38:30 UTC.
- collectVoiceLineEntries: 521 entries, onDisk **125 -> 368** (= 125 + 243).

## 3. Live proof — full v2 game, `?bot=4&mode=full&policy=v2` (log: "created with speechPolicy=v2")
Run on the dev server (4001, HEAD) reading the promoted bank through the client/public/voice symlink,
NOT on 3001/demboyz11 (CLAUDE.md forbids touching either). The socket host acked each beat after
`totalDurationMs`, the way wireHostSocratesAck does — a real clip duration, no browser audio.
826 s to GAME_OVER; 0 "holding ... absorbed" lines in the whole log; 9 SPEECH_SLOT beats, all clip-paced:
- beat 12 QUIZ_MID: "Η Αγορά δεν σε αγάπησε ακόμα…" dur 6458 ms (clip 6.400 s) -> ended (socrates:audio_ended) at +6.4 s.
- beat 16 BLITZ_CLOSE: "Έχασες κάθε πάλη, μα σηκώθηκες κάθε φορά…" dur 9906 (clip 9.840 s) -> ack +9.9 s.
- beat 24 LETHE_CLOSE: "Πέρασες από την Αγορά μία φορά…" dur 8312 (clip 8.240 s) -> ack +8.4 s.
- Also SPEAR_OUT (beat 31) now splices the vocative: `prefix="Ξανθίππη"`, ack at +5.6 s.
- Coronation: **Set C** drawn (beats 32–34, no name line) — so no vocative in play this game.
  Set B was not drawn; checked directly: all 201 preset names now resolve coronationVocative -> clip on disk (201/201).

## 4. Inverse
Only audition-drop/…/vocatives/ + this report. voice-line-review.json sha256 ffa7c913…8c430 (unchanged),
prod voice-deleted 155 files (unchanged). No code change, no deploy.
