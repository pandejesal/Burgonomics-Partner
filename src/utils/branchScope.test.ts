import { describe, expect, it } from 'vitest';
import {
  FIRESTORE_IN_LIMIT,
  isScopeTruncated,
  resolveBoardStoreFilter,
  scopeTruncationNotice,
} from './branchScope';

describe('scopeTruncationNotice (F6)', () => {
  it('is silent when the whole scope fits the Firestore `in` cap', () => {
    expect(scopeTruncationNotice([])).toBeNull();
    expect(scopeTruncationNotice(['a', 'b'])).toBeNull();
    expect(isScopeTruncated(Array.from({ length: FIRESTORE_IN_LIMIT }, (_, i) => `b${i}`))).toBe(
      false,
    );
  });

  it('states how many outlets are read when the scope is truncated', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `branch_${i}`);
    const notice = scopeTruncationNotice(ids);
    expect(notice).toContain(`first ${FIRESTORE_IN_LIMIT} of 12`);
    expect(notice).toMatch(/narrow the outlet filter/i);
  });
});

describe('resolveBoardStoreFilter (F8)', () => {
  it('reads the full assigned scope for a multi-outlet branch_owner', () => {
    expect(resolveBoardStoreFilter('branch_owner', ['branch_a', 'branch_b'], 'all')).toBeNull();
  });

  it('lets the outlet filter narrow within the assigned scope', () => {
    expect(resolveBoardStoreFilter('branch_owner', ['branch_a', 'branch_b'], 'branch_b')).toBe(
      'branch_b',
    );
  });

  it('never widens a scoped role to an outlet it does not own', () => {
    // localStorage is user-writable; a forged selection must fall back to the
    // real scope (null = all assigned branches, still server-clamped).
    expect(resolveBoardStoreFilter('branch_owner', ['branch_a', 'branch_b'], 'branch_z')).toBeNull();
  });

  it('keeps the UI selection for global roles', () => {
    expect(resolveBoardStoreFilter('brand_owner', ['branch_a'], 'branch_z')).toBe('branch_z');
    expect(resolveBoardStoreFilter('brand_owner', ['branch_a'], 'all')).toBeNull();
  });
});
