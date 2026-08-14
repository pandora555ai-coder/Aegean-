# Design

## Concept

A Greek-language gameshow party game, Jackbox-style: no app install required.
A TV or shared screen runs the **host** view; players join from their own
phones as **controllers** by entering a 4-digit numeric room code.

Core interaction model: **simultaneous hidden answers**. Every player
submits their answer privately and at the same time — no buzzer races, no
dead time waiting for one player to act before the next can.

## Feature layers (planned)

Built incrementally, each layer playable on its own before the next is added:

- **v0.1 — Basic quiz**: questions, simultaneous hidden answers, scoring, reveal.
- **v0.2 — Betting**: players wager points on their confidence.
- **v0.3 — Sabotage power-ups**: players can spend points/power-ups to
  disrupt opponents.
- **v0.4 — Multiple round formats**: beyond single-question rounds
  (e.g. ordering, matching, image rounds).

## Content

Pure Greek content: mythology, history, geography, and language. Every
question requires a verified source before it ships — no invented trivia.

## Architecture

- **Stack**: Node.js + Socket.IO, server-authoritative state.
- **Room store**: in-memory (no database) — rooms live only as long as the
  server process and the host connection.
- **Player identity**: a `playerId` (UUID, persisted in the browser's
  `localStorage`) is the stable identity for a player across the game.
  `socket.id` is a transport-layer identifier that changes on reconnect and
  must **never** be used as player identity — only `playerId` is.
