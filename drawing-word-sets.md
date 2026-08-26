# Drawing word sets (Task 58)

Source of truth for the drawing mode's word bank. Each row is one **word
set**: four words that get confused with EACH OTHER in a quick sketch.
`prepareGame` in `server/src/modes/draw.ts` deals each player one DISTINCT
row per game, then picks that player's TARGET word:

- **Rotatable = yes** (every row below) — the target is a random one of
  the four words. The server shuffles which one instead of always taking
  the first.
- **Rotatable = no** — the target would always be Word 1. No row
  currently needs this, but the field stays in the type for a future set
  that does.

50 rows × rotation ≈ 190 distinct words to draw from the same content.

Several words repeat across rows (e.g. `Ρόδα` appears in three), so
distinct ROWS dealt to players is not enough to guarantee distinct
TARGET words — `prepareGame`'s `dealAssignment` explicitly checks that no
two players in the same game land on the same target word (backtracks
and re-deals if it can't find a clash-free assignment).

Five rows were fixed for having a genuine two-correct-answers bug
(synonyms or a category word among its own members) — each is noted
where it applies.

Edit here first; `WORD_SETS` in `shared/src/index.ts` is a hand-converted
mirror of this table (`{ words: [w1, w2, w3, w4], rotatable }`) — keep
the two in sync.

## Sky and nature

| Word 1 | Word 2 | Word 3 | Word 4 |
|---|---|---|---|
| Φεγγάρι | Ήλιος | Αστέρι | Έκλειψη |
| Σύννεφο | Ομίχλη | Καπνός | Χιονοστιβάδα |
| Κεραυνός | Φωτιά | Βέλος | Πριόνι |
| Ηφαίστειο | Βουνό | Πυραμίδα | Σκηνή |
| Καταρράκτης | Ποτάμι | Σιντριβάνι | Βροχή |
| Δέντρο | Θάμνος | Λουλούδι | Φοίνικας |
| Κύμα | Θάλασσα | Λόφος | Αμμόλοφος |

Fixed: "Κεραυνός" row replaced `Ουράνιο τόξο` (unmistakably a curved
line, nothing else) with `Πριόνι` — now all four are jagged or pointed.
"Κύμα" row replaced `Δίχτυ` (a mesh, stands out instantly) with
`Αμμόλοφος` — now all four are curved lines.

## Buildings and structures

| Word 1 | Word 2 | Word 3 | Word 4 |
|---|---|---|---|
| Φάρος | Πύργος | Καμινάδα | Κολόνα |
| Ναός | Παλάτι | Εκκλησία | Θέατρο |
| Γέφυρα | Υδραγωγείο | Τείχος | Σκάλα |
| Ανεμόμυλος | Ανεμογεννήτρια | Μύλος | Έλικας |
| Κάστρο | Πύλη | Επάλξεις | Ταράτσα |
| Πηγάδι | Βαρέλι | Καζάνι | Κουβάς |

Fixed: "Κάστρο" row dropped `Φρούριο` — castle and fortress are the same
thing, so two answers were correct for the same sketch. Replaced by
`Επάλξεις` (already present) staying, `Πύλη`/`Ταράτσα` staying, and no
duplicate meaning remains among the four.

## Transport

| Word 1 | Word 2 | Word 3 | Word 4 |
|---|---|---|---|
| Βάρκα | Άγκυρα | Φεγγάρι | Χαμόγελο |
| Αεροπλάνο | Ελικόπτερο | Πύραυλος | Χαρταετός |
| Ποδήλατο | Μοτοσικλέτα | Πατίνι | Καρότσι |
| Τρένο | Λεωφορείο | Φορτηγό | Τραμ |
| Άρμα | Καρότσα | Τρακτέρ | Αλέτρι |

Fixed: "Βάρκα" row dropped `Καράβι` and `Ψαροκάικο` — a sailboat sketch
is equally "καράβι" and "ψαροκάικο", three words for one sketch. Now all
four are the same hollow-arc shape.

## Animals

| Word 1 | Word 2 | Word 3 | Word 4 |
|---|---|---|---|
| Λιοντάρι | Γάτα | Σκύλος | Λύκος |
| Ελέφαντας | Ρινόκερως | Ιπποπόταμος | Ταύρος |
| Καμηλοπάρδαλη | Καμήλα | Άλογο | Ελάφι |
| Δελφίνι | Φάλαινα | Καρχαρίας | Φώκια |
| Χταπόδι | Μέδουσα | Αστερίας | Καλαμάρι |
| Αετός | Κουκουβάγια | Γεράκι | Περιστέρι |
| Πεταλούδα | Μέλισσα | Λιβελούλα | Μύγα |
| Φίδι | Σκουλήκι | Χέλι | Σχοινί |
| Χελώνα | Σαλιγκάρι | Καβούρι | Ασπίδα |
| Σκαντζόχοιρος | Ποντίκι | Σκίουρος | Κάστανο |

Fixed: "Δελφίνι" row dropped `Ψάρι` — "fish" is a category that contains
the other three, so a dolphin sketch legitimately answers "ψάρι" too.
Replaced by `Φώκια`, the same silhouette without the ambiguity.

## Food

| Word 1 | Word 2 | Word 3 | Word 4 |
|---|---|---|---|
| Καρπούζι | Πεπόνι | Μήλο | Ντομάτα |
| Μπανάνα | Πιπεριά | Αγγούρι | Κρουασάν |
| Παγωτό | Τούρτα | Κύπελλο | Χωνί |
| Πίτσα | Ρόδα | Ήλιος | Τιμόνι |
| Σταφύλι | Κεράσια | Μούρα | Μπαλόνια |
| Αυγό | Ελιά | Πέτρα | Πατάτα |

Fixed: "Πίτσα" row dropped `Πίτα` — pizza and pita are the same circle
with wedges, not even the drawer can tell them apart.

## Objects

| Word 1 | Word 2 | Word 3 | Word 4 |
|---|---|---|---|
| Ρολόι | Πυξίδα | Τιμόνι | Ρόδα |
| Κλειδί | Κουτάλι | Πιρούνι | Σφυρί |
| Ομπρέλα | Μανιτάρι | Καπέλο | Αλεξίπτωτο |
| Κιθάρα | Βιολί | Λύρα | Κουτάλα |
| Ψαλίδι | Πένσα | Τσιμπίδα | Σταυρός |
| Κερί | Φακός | Πυρσός | Μολύβι |
| Ζυγαριά | Κούνια | Κρεμάστρα | Άγκυρα |
| Κλεψύδρα | Ποτήρι | Παπιγιόν | Χωνί |
| Καθρέφτης | Πίνακας | Παράθυρο | Πόρτα |
| Σκάλα | Φράχτης | Ράγες | Πληκτρολόγιο |

Fixed: "Κλεψύδρα" row dropped `Δαχτυλίδι` — a ring is a plain circle,
unrelated to the narrow-waisted shape of the other three. Replaced by
`Παπιγιόν`.

## Ancient Athens

| Word 1 | Word 2 | Word 3 | Word 4 |
|---|---|---|---|
| Τρίαινα | Πιρούνι | Δόρυ | Τσουγκράνα |
| Ασπίδα | Χελώνα | Πιάτο | Ρόδα |
| Περικεφαλαία | Καπέλο | Μάσκα | Κρανίο |
| Αμφορέας | Βάζο | Μπουκάλι | Κύπελλο |
| Πάπυρος | Χάρτης | Πετσέτα | Σημαία |
| Στέμμα | Πριόνι | Φράχτης | Χτένα |

Fixed: "Στέμμα" row dropped `Κορώνα` — crown and "κορώνα" are synonyms,
the worst duplicate in the old bank. Replaced by `Πριόνι`, now all four
are jagged-edged.
