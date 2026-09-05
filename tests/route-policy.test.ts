import { describe, it, expect } from 'vitest';
import { canAccessRoute } from '../src/core/auth/routePolicy';
import { isGlobalRole, resolveScopedBranchIds } from '../src/utils/branchScope';

describe('Enforced route policy (routePolicy — the guard reads this, not a copy)', () => {
  it('denies kitchen staff everything outside KDS + base order views', () => {
    for (const p of ['/kds', '/orders', '/orders/123', '/dashboard', '/menu', '/delivery-queue']) {
      expect(canAccessRoute('branch_staff', p)).toBe(true);
    }
    for (const p of ['/customers', '/customers/x', '/chat', '/tickets', '/settings', '/notifications', '/branches', '/users', '/analytics', '/admin']) {
      expect(canAccessRoute('branch_staff', p)).toBe(false);
    }
  });

  it('denies branch_owner brand management and admin portal', () => {
    expect(canAccessRoute('branch_owner', '/dashboard')).toBe(true);
    expect(canAccessRoute('branch_owner', '/branches')).toBe(false);
    expect(canAccessRoute('branch_owner', '/users')).toBe(false);
    expect(canAccessRoute('branch_owner', '/admin/x')).toBe(false);
  });

  it('denies support the admin portal and app settings', () => {
    expect(canAccessRoute('support', '/tickets')).toBe(true);
    expect(canAccessRoute('support', '/admin')).toBe(false);
    expect(canAccessRoute('support', '/settings')).toBe(false);
  });

  it('denies everything when role is missing', () => {
    expect(canAccessRoute(undefined, '/dashboard')).toBe(false);
  });
});

describe('Branch scope resolution (branchScope — localStorage is untrusted)', () => {
  const staff = { role: 'branch_staff' as const, branchIds: ['branch_surat_01'] };

  it('clamps a forged cross-branch selection back to assigned branches', () => {
    expect(resolveScopedBranchIds(staff, 'branch_ahmedabad_01')).toEqual(['branch_surat_01']);
  });

  it('honours an assigned selection and defaults to assigned branches', () => {
    expect(resolveScopedBranchIds(staff, 'branch_surat_01')).toEqual(['branch_surat_01']);
    expect(resolveScopedBranchIds(staff, null)).toEqual(['branch_surat_01']);
  });

  it('never returns global scope for scoped roles with no branches', () => {
    expect(
      resolveScopedBranchIds({ role: 'branch_staff', branchIds: [] }, null)
    ).toEqual([]);
  });

  it('gives global roles the selection, or brand-wide on empty', () => {
    const owner = { role: 'brand_owner' as const, branchIds: [] as string[] };
    expect(resolveScopedBranchIds(owner, 'branch_x')).toEqual(['branch_x']);
    expect(resolveScopedBranchIds(owner, null)).toEqual([]);
    expect(isGlobalRole('support')).toBe(true);
    expect(isGlobalRole('branch_staff')).toBe(false);
  });
});
