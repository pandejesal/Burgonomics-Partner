/**
 * A7 #5: which outlet the KDS 86 drawer may write to.
 *
 * These live in their own module with no component/hook imports so the page can
 * resolve the outlet without pulling the drawer's menu hook (and, in tests, the
 * whole Firestore graph behind it).
 */

/**
 * The makeline can show every outlet a scoped user owns. A write needs EXACTLY
 * one branch, so:
 *   - an explicit outlet selection wins;
 *   - a user assigned to a single outlet is unambiguous;
 *   - anything else (two or more outlets, or a brand role with none) returns
 *     `null` — callers must refuse instead of writing to branchIds[0].
 */
export function resolveKds86BranchId(
  selectedBranchId: string | null | undefined,
  assignedBranchIds: readonly string[] | null | undefined,
): string | null {
  if (selectedBranchId) return selectedBranchId;
  const assigned = Array.isArray(assignedBranchIds) ? assignedBranchIds.filter(Boolean) : [];
  return assigned.length === 1 ? assigned[0] : null;
}

/** The outlet name to stamp on the drawer, if the board knows it. */
export function kds86BranchName(
  branchId: string | null,
  orders: ReadonlyArray<{ branchId?: string; branchName?: string }> | null | undefined,
): string | null {
  if (!branchId) return null;
  const hit = (orders ?? []).find((o) => o.branchId === branchId && o.branchName);
  return hit?.branchName ? String(hit.branchName) : null;
}
