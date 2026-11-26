/**
 * The "open ticket window" — what a kitchen/board read is allowed to ask
 * Firestore for, and what it must admit when it hits the bound.
 *
 * Defect being fixed (A7 #2): the KDS and the Control Room board asked for
 * `orderBy(createdAt, desc) + limit(100)` with NO status predicate. On a busy
 * evening the newest 100 documents are mostly finished work, so the oldest
 * still-`pending`/`preparing` tickets drop out of the snapshot — no chime,
 * nobody re-notices them, the customer waits. `scopeTruncationNotice` only
 * covered the 10-branch `in` cap.
 *
 * WHY THIS IS A BIGGER HONEST PAGE AND NOT A `status.terminal == false` FILTER:
 * the filtered query is the correct long-term shape, but it needs NEW composite
 * indexes (`branchId + status.terminal + createdAt`, and
 * `status.terminal + placedAt` for the global Delivery feed) that do not exist
 * in the deployed index set. Partner cannot deploy the root repo's indexes from
 * this package, and a filtered read without them fails `failed-precondition`,
 * which the KDS treats as a dead listener — every outlet's makeline would go
 * dark until the indexes were deployed. Trading "some old tickets can hide
 * behind a disclosed bound" for "the makeline can be entirely unavailable" is
 * not an acceptable fix for a kitchen. The index definitions were published on
 * the fix-wave bus (`c11-indexes`) so the filtered read can follow once they
 * are live; until then the bound is larger AND stated on screen.
 *
 * The page size is generous (a full trading day of a 250-order outlet fits),
 * and HONEST: when a feed returns a full page, `orderWindowTruncationNotice`
 * tells staff that older open tickets may be outside the window instead of
 * letting the makeline look complete.
 */

/**
 * One query page of the board/makeline feed. The audited smallest-safe size:
 * 500 documents covers a full day of a 250-order outlet including its finished
 * tickets, so the still-open tickets of a normal evening stay inside the
 * window. One page = one `in` listener, so this is 500 reads per snapshot,
 * not per branch.
 */
export const OPEN_ORDER_PAGE_SIZE = 500;

/**
 * Firestore's fixed ceiling for disjunctions in a query's disjunctive normal
 * form. Kept here so the branch-chunk arithmetic can be proven by a test when a
 * status predicate is added later.
 */
export const FIRESTORE_MAX_DISJUNCTIONS = 30;

/**
 * Branches allowed in one `in` chunk next to `statusDisjunctions` status terms.
 * Today's queries add none (0), so the whole 10-id branch budget is intact; the
 * helper keeps the arithmetic explicit for the indexed future.
 */
export function orderWindowBranchChunkSize(branchChunk: number, statusDisjunctions = 0): number {
  const max = Math.floor(FIRESTORE_MAX_DISJUNCTIONS / Math.max(1, statusDisjunctions));
  const requested = Number.isFinite(branchChunk) && branchChunk > 0 ? branchChunk : max;
  return Math.min(requested, max);
}

/** True when the snapshot filled its page, i.e. the window may be truncated. */
export function pageWasCapped(size: number, pageSize: number = OPEN_ORDER_PAGE_SIZE): boolean {
  const limit = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : OPEN_ORDER_PAGE_SIZE;
  return size >= limit;
}

/**
 * Honest on-screen copy when a window was capped, or `null` when the window is
 * known to be complete. Never says "all tickets" while a feed is truncated.
 */
export function orderWindowTruncationNotice(
  capped: boolean,
  pageSize: number = OPEN_ORDER_PAGE_SIZE,
): string | null {
  if (!capped) return null;
  const limit = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : OPEN_ORDER_PAGE_SIZE;
  // r2 finding 4: the first copy said "Close finished tickets, then refresh".
  // The window is `orderBy(createdAt, desc) + limit(500)` — closing a ticket
  // does not pull an older document into an already-full page, so that advice
  // could not shrink anything. The real remedy is the status-filtered read this
  // wave deferred until the composite indexes are live; say that plainly.
  return (
    `Showing the newest ${limit} orders — older still-open tickets may be outside this ` +
    `window. The status filter that keeps open tickets in view is coming once the new ` +
    `indexes are deployed; until then narrow the outlet filter to see older work.`
  );
}
