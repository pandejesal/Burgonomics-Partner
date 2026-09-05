import { describe, it, expect } from 'vitest';

// Imports the REAL pin helpers — the previous file duplicated both functions
// line-for-line, so production hash/threshold changes stayed green here.
import {
  hashPinSimple,
  verifyStaffPin,
  type StaffPinSession,
} from '../src/core/auth/pinHelpers';

describe('Partner POS — Staff Quick PIN & Security Lockout Suite', () => {
  const initialSession: StaffPinSession = {
    staffId: 'staff_101',
    name: 'Karan Cashier',
    role: 'branch_staff',
    branchId: 'branch_ahmedabad_1',
    hashedPin: hashPinSimple('1234'),
    failedAttempts: 0,
    lockedUntilTimestamp: null,
  };

  it('authenticates staff successfully with correct 4-digit PIN', () => {
    const now = 1700000000000;
    const res = verifyStaffPin(initialSession, '1234', now);

    expect(res.success).toBe(true);
    expect(res.isLocked).toBe(false);
    expect(res.remainingAttempts).toBe(5);
    expect(res.session.failedAttempts).toBe(0);
  });

  it('decrements remaining attempts on incorrect PIN', () => {
    const now = 1700000000000;
    const res = verifyStaffPin(initialSession, '9999', now);

    expect(res.success).toBe(false);
    expect(res.isLocked).toBe(false);
    expect(res.remainingAttempts).toBe(4);
    expect(res.error).toContain('4 attempt(s) remaining');
  });

  it('locks staff account for 15 minutes after 5 consecutive failures', () => {
    const now = 1700000000000;
    let session = { ...initialSession };

    // 4 failed attempts
    for (let i = 0; i < 4; i++) {
      const res = verifyStaffPin(session, '0000', now);
      session = res.session;
      expect(res.isLocked).toBe(false);
    }

    // 5th failed attempt -> locks account
    const finalRes = verifyStaffPin(session, '0000', now);
    expect(finalRes.success).toBe(false);
    expect(finalRes.isLocked).toBe(true);
    expect(finalRes.remainingAttempts).toBe(0);
    expect(finalRes.error).toContain('locked for 15 minutes');
    expect(finalRes.session.lockedUntilTimestamp).toBe(now + 15 * 60 * 1000);

    // Attempting during lockout should be rejected immediately
    const duringLockout = verifyStaffPin(finalRes.session, '1234', now + 60 * 1000);
    expect(duringLockout.success).toBe(false);
    expect(duringLockout.isLocked).toBe(true);
  });

  it('unlocks and allows successful PIN entry once 15-minute lockout period expires', () => {
    const now = 1700000000000;
    const lockedSession: StaffPinSession = {
      ...initialSession,
      failedAttempts: 5,
      lockedUntilTimestamp: now + 15 * 60 * 1000,
    };

    // Attempt after 16 minutes
    const afterLockout = verifyStaffPin(lockedSession, '1234', now + 16 * 60 * 1000);
    expect(afterLockout.success).toBe(true);
    expect(afterLockout.isLocked).toBe(false);
    expect(afterLockout.session.failedAttempts).toBe(0);
    expect(afterLockout.session.lockedUntilTimestamp).toBeNull();
  });
});
