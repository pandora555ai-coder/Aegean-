// Task 189 built this view to carry AnavasisChrome (room-code/pause), the
// one thing it needed. Task 192 moved that chrome up to HostScreen (a single
// render for all four climb/duel phases, keeping it OUTSIDE the scene
// container the text-node audit scopes to) - the weapons, winner and
// verdict line are AnavasisDuel's own job (mounted at the HostScreen level,
// reading duelReveal directly), so this phase has nothing left to render.
// Kept as its own file per the "one file per TV phase" convention.
export function DuelRevealView() {
  return null;
}
