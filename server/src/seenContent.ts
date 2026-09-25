// Task 319 - the room's record of content an EARLIER game in it already put in
// front of the players, so "Ξανά, ίδια παρέα" does not deal game 1's questions
// again in game 2. One Set on the Room (Room.seenQuestionKeys, a survivor of
// rebuildRoomForNewGame), keyed by kind so a quiz id, a numeric question's text
// and a blitz statement's text can never collide.
//
// The draws never REFUSE seen content, they only put it LAST: an already-
// shuffled list is split into unseen-then-seen, keeping each half's shuffled
// order, and the caller slices its count off the front. So a pool with enough
// unseen items deals only unseen ones, and a pool that has run out RECYCLES -
// the shortfall is filled from what earlier games saw, never a short deal.
// A leaf module: imports nothing.

export type SeenKind = 'quiz' | 'numeric' | 'blitz';

export function seenKey(kind: SeenKind, id: string): string {
  return `${kind}:${id}`;
}

export function unseenFirst<T>(items: readonly T[], keyOf: (item: T) => string, seen: ReadonlySet<string>): T[] {
  const unseen = items.filter((item) => !seen.has(keyOf(item)));
  if (unseen.length === items.length) {
    return [...items];
  }
  return [...unseen, ...items.filter((item) => seen.has(keyOf(item)))];
}

export function markSeen<T>(items: readonly T[], keyOf: (item: T) => string, seen: Set<string>): void {
  for (const item of items) {
    seen.add(keyOf(item));
  }
}
