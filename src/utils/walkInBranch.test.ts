/**
 * CASH-FLOWS: the walk-in till names the outlet it is booking to.
 *
 * The old modal derived the name from a two-value ternary on the branch id, so
 * 15 of 17 outlets filed counter revenue under "Surat Adajan" or "Ahmedabad SG
 * Highway". The fix resolves the name from the branch registry and NEVER
 * invents one: an unknown id returns null and the UI shows the id instead.
 */
import { describe, expect, it } from 'vitest';
import { resolveWalkInBranchName } from './walkInBranch';

const branches = [
  { id: 'branch_surat_adajan', name: 'Surat Adajan' },
  { id: 'branch_rajkot_yagnik', name: 'Rajkot Yagnik Road' },
  { id: 'branch_ayodhya', name: 'Ayodhya' },
  { id: 'branch_indore_vijaynagar', name: 'Indore Vijay Nagar' },
];

describe('resolveWalkInBranchName', () => {
  it("returns each outlet's own name", () => {
    for (const branch of branches) {
      expect(resolveWalkInBranchName(branches, branch.id)).toBe(branch.name);
    }
    // Four outlets, four distinct names — the ternary produced two.
    expect(new Set(branches.map((b) => resolveWalkInBranchName(branches, b.id))).size).toBe(4);
  });

  it('never guesses for an unknown or missing branch', () => {
    expect(resolveWalkInBranchName(branches, 'branch_not_loaded')).toBeNull();
    expect(resolveWalkInBranchName(branches, null)).toBeNull();
    expect(resolveWalkInBranchName(branches, undefined)).toBeNull();
    expect(resolveWalkInBranchName([], 'branch_surat_adajan')).toBeNull();
  });

  it('ignores a blank name rather than showing whitespace', () => {
    expect(resolveWalkInBranchName([{ id: 'branch_x', name: '   ' }], 'branch_x')).toBeNull();
  });
});
