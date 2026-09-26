# Task 322 — post-game buttons (TV + phones), room-closed styling

UI and event wiring only; no server change.
- PodiumView (TV, shown after the coronation): `tv-play-again` "Ξανά, ίδια παρέα" -> host:play_again, `tv-new-game`
  "Νέο παιχνίδι" -> host:new_game, `tv-decider` "Αποφασίζει: <VIP>". First button autofocused, ArrowLeft/Right/Up/Down
  and Tab move focus, Enter presses (native button). Both disable after one press. HostScreen now tracks vipName
  (lobby update + vip:changed).
- Phone: VIP gets `play-again-button` "Ξανά, ίδια παρέα" (vip:play_again) and `new-game-button` "Νέο παιχνίδι"
  (vip:new_game); both disable after a press. Others: `waiting-for-play-again` "Αποφασίζει: <VIP>".
- `room-closed` screen: Αιγαίον title (landing's serif/marble/shadow) + marble text on --night-0.
- Check: `npx tsx dev/322-end-buttons-check.ts` (24/24; real TV + 2 real phones, standalone duel).
