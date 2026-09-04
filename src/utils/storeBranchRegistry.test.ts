import { describe, it, expect } from 'vitest';
import {
  branchIdForDeliveryStore,
  deliveryStoreIdsForBranch,
  deliveryStoreIdsForBranches,
  isMappedDeliveryStore,
} from './storeBranchRegistry';

describe('storeBranchRegistry', () => {
  it('returns null for unmapped delivery stores (never false-attributes)', () => {
    expect(branchIdForDeliveryStore('str_001')).toBeNull();
    expect(branchIdForDeliveryStore('str_012')).toBeNull();
    expect(branchIdForDeliveryStore('unknown')).toBeNull();
    expect(isMappedDeliveryStore('str_001')).toBe(false);
  });

  it('returns empty alias lists so scoped queries skip extra reads', () => {
    expect(deliveryStoreIdsForBranch('branch_surat_01')).toEqual([]);
    expect(deliveryStoreIdsForBranches(['branch_surat_01', 'branch_ahmedabad_01'])).toEqual([]);
  });
});
