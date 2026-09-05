import { describe, it, expect } from 'vitest';
import type { UserRole } from '@/types';

// These tests import the REAL enforcement modules. The previous file defined
// local isAuthorizedOperator/canAccessBranch/getAccessibleNavigation clones
// (and login-page.test.ts imported them from here — a test importing a test),
// so the suite stayed green while production drifted.
import { canAccessRoute } from '@/core/auth/routePolicy';
import { isGlobalRole, resolveScopedBranchIds } from '@/utils/branchScope';

describe('Partner RBAC & Operator Authorization Suite (real policy)', () => {
  it('kitchen staff is confined to KDS + base order views', () => {
    for (const p of ['/kds', '/orders', '/orders/1', '/dashboard', '/menu', '/delivery-queue']) {
      expect(canAccessRoute('branch_staff', p)).toBe(true);
    }
    for (const p of ['/customers', '/chat', '/tickets', '/settings', '/branches', '/admin']) {
      expect(canAccessRoute('branch_staff', p)).toBe(false);
    }
  });

  it('branch owners are fenced out of brand management and the admin portal', () => {
    expect(canAccessRoute('branch_owner', '/dashboard')).toBe(true);
    expect(canAccessRoute('branch_owner', '/branches')).toBe(false);
    expect(canAccessRoute('branch_owner', '/users')).toBe(false);
    expect(canAccessRoute('branch_owner', '/admin/x')).toBe(false);
  });

  it('support keeps tickets + CRM but loses admin and app settings', () => {
    expect(canAccessRoute('support', '/tickets')).toBe(true);
    expect(canAccessRoute('support', '/customers')).toBe(true);
    expect(canAccessRoute('support', '/admin')).toBe(false);
    expect(canAccessRoute('support', '/settings')).toBe(false);
  });

  it('denies everything without a role', () => {
    expect(canAccessRoute(undefined, '/dashboard')).toBe(false);
  });

  it('restricts branch staff and branch owners strictly to assigned branches', () => {
    const staff = { role: 'branch_staff' as UserRole, branchIds: ['branch_surat_01', 'branch_surat_02'] };
    expect(resolveScopedBranchIds(staff, 'branch_surat_01')).toEqual(['branch_surat_01']);
    expect(resolveScopedBranchIds(staff, 'branch_ahmedabad_01')).toEqual([
      'branch_surat_01',
      'branch_surat_02',
    ]);
    expect(isGlobalRole('branch_staff')).toBe(false);
    expect(isGlobalRole('brand_owner')).toBe(true);
  });
});
