# Task 316 — landing pages (phone root + host lobby)

UI and copy only. No server/phase/protocol/lobby-flow change.

- Phone root (client/src/screens/LandingScreen.tsx): "Αιγαίον" + greekUpper subtitle in the host lobby's own
  fonts/colours; "Σύνδεση σε δωμάτιο" first + filled; "Δημιουργία δωματίου" secondary + hint
  "Για την οθόνη της τηλεόρασης"; "Δοκιμές" only with ?dev (route unchanged).
- Host lobby (screens/host/LobbyView.tsx, hostStyles.ts): "Create Room" -> "Νέο παιχνίδι" under the subtitle in the
  left column, smaller; focused once enabled AND the Task 259 gate is gone (`focusCreate`, from HostScreen's
  audioGatePassed). The audio gate button got autoFocus so Enter/OK on a fresh TV hits the gate (audio unlock)
  first, never the button under it. "connected" label removed; "Επανασύνδεση…" only while disconnected.
- Filled wine buttons use var(--marble) text (was --carve).

Known, not fixed (out of scope): ~20 dev/ harnesses click the text "Create Room" and now need
`getByTestId('create-room')` (added) — repair one at a time when next needed (Task 241/245/259 precedent).
