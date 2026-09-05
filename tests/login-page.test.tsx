import { describe, it, expect, beforeEach } from 'vitest';
import {
  verifyStaffPin,
  hashPinSimple,
  type StaffPinSession,
} from '../src/core/auth/pinHelpers';
import { canAccessRoute } from '../src/core/auth/routePolicy';
import { isGlobalRole, resolveScopedBranchIds } from '../src/utils/branchScope';

describe('Prompt 03: Partner Auth, Staff PIN & RBAC Custom Claims Suite', () => {
  let initialStaffSession: StaffPinSession;

  beforeEach(() => {
    initialStaffSession = {
      staffId: 'staff_101',
      name: 'Ramesh Patel',
      role: 'branch_staff',
      branchId: 'branch_surat_01',
      hashedPin: hashPinSimple('1234'),
      failedAttempts: 0,
      lockedUntilTimestamp: null,
    };
  });

  describe('1. 4-Digit Fast Staff PIN Hashing & Touch Verification', () => {
    it('verifies valid 4-digit PIN for instant counter / kitchen shift switch', () => {
      const now = Date.now();
      const result = verifyStaffPin(initialStaffSession, '1234', now);

      expect(result.success).toBe(true);
      expect(result.isLocked).toBe(false);
      expect(result.remainingAttempts).toBe(5);
      expect(result.session.failedAttempts).toBe(0);
    });

    it('decrements remaining attempts on incorrect PIN and provides informative error', () => {
      const now = Date.now();
      const result = verifyStaffPin(initialStaffSession, '9876', now);

      expect(result.success).toBe(false);
      expect(result.isLocked).toBe(false);
      expect(result.remainingAttempts).toBe(4);
      expect(result.error).toContain('4 attempt(s) remaining');
    });

    it('enforces 15-minute terminal lockout after 5 consecutive failed attempts', () => {
      const now = Date.now();
      let session = { ...initialStaffSession };

      for (let i = 0; i < 4; i++) {
        const res = verifyStaffPin(session, '0000', now);
        session = res.session;
        expect(res.isLocked).toBe(false);
      }

      // 5th failed attempt -> locks terminal
      const lockedResult = verifyStaffPin(session, '0000', now);
      expect(lockedResult.success).toBe(false);
      expect(lockedResult.isLocked).toBe(true);
      expect(lockedResult.remainingAttempts).toBe(0);
      expect(lockedResult.error).toContain('locked for 15 minutes');
      expect(lockedResult.session.lockedUntilTimestamp).toBe(now + 15 * 60 * 1000);
    });

    it('rejects all entry attempts during the 15-minute lockout period', () => {
      const now = Date.now();
      const lockedSession: StaffPinSession = {
        ...initialStaffSession,
        failedAttempts: 5,
        lockedUntilTimestamp: now + 15 * 60 * 1000,
      };

      // Attempt during lockout
      const duringLockout = verifyStaffPin(lockedSession, '1234', now + 2 * 60 * 1000);
      expect(duringLockout.success).toBe(false);
      expect(duringLockout.isLocked).toBe(true);
      expect(duringLockout.error).toMatch(/PIN entry is locked due to multiple failed attempts/);
    });

    it('automatically clears lockout state and restores access after 15 minutes', () => {
      const now = Date.now();
      const lockedSession: StaffPinSession = {
        ...initialStaffSession,
        failedAttempts: 5,
        lockedUntilTimestamp: now + 15 * 60 * 1000,
      };

      // Attempt 16 minutes later
      const afterLockout = verifyStaffPin(lockedSession, '1234', now + 16 * 60 * 1000);
      expect(afterLockout.success).toBe(true);
      expect(afterLockout.isLocked).toBe(false);
      expect(afterLockout.session.failedAttempts).toBe(0);
      expect(afterLockout.session.lockedUntilTimestamp).toBeNull();
    });
  });

  describe('2. RBAC Custom Claims & Operator Permissions (real policy)', () => {
    it('grants every operator role its documented home surface', () => {
      expect(canAccessRoute('brand_owner', '/branches')).toBe(true);
      expect(canAccessRoute('developer', '/users')).toBe(true);
      expect(canAccessRoute('regional_manager', '/branches')).toBe(true);
      expect(canAccessRoute('support', '/tickets')).toBe(true);
      expect(canAccessRoute('branch_owner', '/dashboard')).toBe(true);
      expect(canAccessRoute('branch_staff', '/kds')).toBe(true);
    });

    it('withholds privileged surfaces per role (fail-closed reads)', () => {
      expect(canAccessRoute('branch_staff', '/customers')).toBe(false);
      expect(canAccessRoute('branch_staff', '/admin')).toBe(false);
      expect(canAccessRoute('branch_owner', '/admin')).toBe(false);
      expect(canAccessRoute('support', '/settings')).toBe(false);
      expect(canAccessRoute(undefined, '/dashboard')).toBe(false);
    });

    it('enforces branch isolation boundaries for branch staff and owners', () => {
      const staff = { role: 'branch_staff' as const, branchIds: ['branch_surat_01'] };
      const owner = { role: 'branch_owner' as const, branchIds: ['branch_surat_01'] };

      expect(resolveScopedBranchIds(staff, 'branch_surat_01')).toEqual(['branch_surat_01']);
      expect(resolveScopedBranchIds(owner, 'branch_surat_01')).toEqual(['branch_surat_01']);

      // Forged cross-branch selection clamps back to assigned branches
      expect(resolveScopedBranchIds(staff, 'branch_ahmedabad_01')).toEqual(['branch_surat_01']);
      expect(resolveScopedBranchIds(owner, 'branch_mumbai_01')).toEqual(['branch_surat_01']);

      // Global roles keep multi-branch access
      expect(isGlobalRole('brand_owner')).toBe(true);
      expect(isGlobalRole('developer')).toBe(true);
      expect(isGlobalRole('regional_manager')).toBe(true);
    });
  });
});
