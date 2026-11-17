import { describe, expect, it } from 'vitest';
import {
  FIRESTORE_IN_LIMIT,
  isScopeTruncated,
  resolveBoardStoreFilter,
  scopeTruncationNotice,
  resolveOrderReadScope,
  chunkOrderBranchIds,
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

describe('order read scope', () => {
  it('treats support as global, but never regional', () => {
    expect(resolveOrderReadScope('support', [], null, null)).toEqual({ global: true, branchIds: [] });
    expect(resolveOrderReadScope('regional_manager', ['forged'], null, null)).toEqual({ global: false, branchIds: [] });
  });

  it('requires a valid authoritative regional registry and intersects selection', () => {
    const registry = { role: 'regional_manager', branchIds: ['a', 'b'] };
    expect(resolveOrderReadScope('regional_manager', ['forged'], 'b', registry)).toEqual({ global: false, branchIds: ['b'] });
    expect(resolveOrderReadScope('regional_manager', ['forged'], 'foreign', registry)).toEqual({ global: false, branchIds: [] });
    expect(resolveOrderReadScope('regional_manager', ['a'], null, { role: 'regional_manager', branchIds: ['a', 3] })).toEqual({ global: false, branchIds: [] });
    expect(resolveOrderReadScope('regional_manager', ['a'], null, { role: 'support', branchIds: ['a'] })).toEqual({ global: false, branchIds: [] });
  });

  it('keeps every assigned branch in bounded query chunks', () => {
    const ids = Array.from({ length: 23 }, (_, i) => `branch-${i}`);
    const chunks = chunkOrderBranchIds(ids);
    expect(chunks.map((chunk) => chunk.length)).toEqual([10, 10, 3]);
    expect(chunks.flat()).toEqual(ids);
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
