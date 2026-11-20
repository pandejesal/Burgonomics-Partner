/**
 * Which outlet a counter (walk-in) sale is booked to, for display at the till.
 *
 * The old modal printed a name from a two-value ternary on the branch id, so 15
 * of 17 outlets filed counter revenue under the wrong store. The authoritative
 * name is written by the server from `branches/{id}`; this helper only mirrors
 * that for the cashier's confirmation, and returns null rather than guessing
 * when the registry has not loaded.
 */
export interface WalkInBranchLike {
  id: string;
  name?: string | null;
}

export function resolveWalkInBranchName(
  branches: readonly WalkInBranchLike[],
  branchId: string | null | undefined
): string | null {
  if (!branchId) return null;
  const match = branches.find((branch) => branch.id === branchId);
  const name = typeof match?.name === 'string' ? match.name.trim() : '';
  return name.length > 0 ? name : null;
}
