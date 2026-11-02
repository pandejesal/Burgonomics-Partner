import { describe, expect, it } from 'vitest';
import type { UserRole } from '../src/types';

/**
 * Item 7 (api-contract-audit): POST /petpooja/syncMenu requires
 *   requireRole(["brand_owner", "developer", "regional_manager", "branch_owner"])
 * (functions/src/index.ts:573-576). branch_staff therefore gets 403 on every
 * tap, and support has no menu-management role either.
 *
 * The server gate is NOT widened. The client hides/disables the control for
 * roles the server refuses, using the shared role helpers — the same
 * mirrored-list pattern as @/admin/pages/refundRoles and
 * @/features/orders/orderCancelRoles.
 */
import {
  PETPOOJA_MENU_SYNC_ROLES,
  canSyncPetpoojaMenu,
} from '../src/services/petpoojaMenuSyncRoles';

describe('petpooja menu-sync role matrix mirrors the server gate', () => {
  it('grants exactly the four server-accepted roles', () => {
    expect([...PETPOOJA_MENU_SYNC_ROLES].sort()).toEqual([
      'branch_owner',
      'brand_owner',
      'developer',
      'regional_manager',
    ]);
  });

  it.each<[UserRole, boolean]>([
    ['brand_owner', true],
    ['developer', true],
    ['regional_manager', true],
    ['branch_owner', true],
    ['branch_staff', false],
    ['support', false],
    ['customer', false],
  ])('%s -> %s', (role, expected) => {
    expect(canSyncPetpoojaMenu(role)).toBe(expected);
  });

  it('fails closed for an absent or unknown role', () => {
    expect(canSyncPetpoojaMenu(undefined)).toBe(false);
    expect(canSyncPetpoojaMenu(null)).toBe(false);
    expect(canSyncPetpoojaMenu('')).toBe(false);
    expect(canSyncPetpoojaMenu('franchise_partner')).toBe(false);
  });
});
