# 168 — 50 more drawing word sets

Append these 50 rows to WORD_SETS in shared, same shape as the existing
rows { words: [4], rotatable }. Format: TARGET | d | d | d. Also save
the rows verbatim as design/drawing-word-sets-2.md for the record.

Rules: the first word is the target, the other three are distractors.
Do not touch the dealing logic (usedWords, assignTargets, backtracking)
or the server. Do not call ElevenLabs.

Χέρι | Γάντι | Φύλλο | Χτένα
Μάτι | Ψάρι | Πλανήτης | Αυγό
Πόδι | Παπούτσι | Κάλτσα | Σίδερο
Καρδιά | Φράουλα | Μήλο | Φύλλο
Δόντι | Βουνό | Κόκαλο | Διαμάντι
Σανδάλι | Παντόφλα | Σκι | Ρακέτα
Γραβάτα | Βέλος | Φύλλο | Παγωτό
Παντελόνι | Ψαλίδι | Πιρούνι | Πύλη
Γυαλιά | Ποδήλατο | Κυάλια | Μάσκα
Μουστάκι | Πεταλούδα | Φρύδι | Παπιγιόν
Καρέκλα | Σκάλα | Κρεμάστρα | Τραπέζι
Κρεβάτι | Καναπές | Τραπέζι | Παγκάκι
Πόρτα | Παράθυρο | Πίνακας | Ντουλάπα
Τηγάνι | Ρακέτα | Καθρέφτης | Μεγεθυντικός φακός
Λάμπα | Μανιτάρι | Παγωτό | Ομπρέλα
Βρύση | Κύκνος | Άγκυρα | Σφυρί
Σκούπα | Πινέλο | Τσουγκράνα | Κουπί
Κουρτίνα | Καταρράκτης | Σημαία | Πετσέτα
Χαλί | Σοκολάτα | Πόρτα | Πίνακας
Τηλεόραση | Παράθυρο | Πίνακας | Κουτί
Τύμπανο | Βαρέλι | Καζάνι | Τούρτα
Τρομπέτα | Χωνί | Λουλούδι | Κλάξον
Πιάνο | Πληκτρολόγιο | Ζέβρα | Σκάλα
Μπάλα | Πορτοκάλι | Πλανήτης | Ρόδα
Ζάρι | Κύβος | Κουτί | Ντόμινο
Σκάκι | Καρό | Πάτωμα | Σταυρόλεξο
Χαρταετός | Διαμάντι | Σημαία | Πανί
Κούκλα | Παιδί | Άγαλμα | Φάντασμα
Σβούρα | Κώνος | Παγωτό | Καμπάνα
Καμπάνα | Κύπελλο | Σβούρα | Φούστα
Κένταυρος | Άλογο | Ιππέας | Ελάφι
Πήγασος | Άλογο | Άγγελος | Αετός
Κύκλωπας | Γίγαντας | Φακός | Ψάρι
Γοργόνα | Ψάρι | Κολυμβήτρια | Δελφίνι
Μινώταυρος | Ταύρος | Αγελάδα | Άνθρωπος
Δούρειος Ίππος | Άλογο | Κάστρο | Καρότσα
Λαβύρινθος | Σπείρα | Δίχτυ | Χάρτης
Άρπα | Λύρα | Τόξο | Χτένα
Δράκος | Φίδι | Σαύρα | Κροκόδειλος
Φοίνικας | Αετός | Φωτιά | Κόκορας
Φανάρι | Ρομπότ | Πύργος | Φάρος
Παγκάκι | Κρεβάτι | Τραπέζι | Σκάλα
Σιντριβάνι | Καταρράκτης | Λουλούδι | Δέντρο
Σκουπιδοτενεκές | Βαρέλι | Κουβάς | Πηγάδι
Άγαλμα | Άνθρωπος | Κούκλα | Άγγελος
Πινακίδα | Πινέλο | Σημαία | Καθρέφτης
Τούνελ | Σπηλιά | Στόμα | Πύλη
Καρότσι | Κλουβί | Καρότσα | Κρεβάτι
Ρόδα λούνα παρκ | Ρολόι | Ρόδα | Ήλιος
Κάμερα | Κουτί | Ρομπότ | Τηλεόραση

1. WORD_SETS row count before and after (expected +50) and the number
   of distinct target words across ALL rows (must equal the row count —
   no target appears twice as a target; if one does, report it and
   drop the NEW row).
2. Any row with fewer or more than 4 words, or a duplicate word inside
   a row: report the list (must be empty).
3. npm run typecheck clean; one 5-bot draw game with drawRounds 3:
   report 15/15 distinct targets dealt and how many came from the new
   rows. Commit as task 168 and push.
