/**
 * PAR-02 — a role or branch edit is an AUTHORIZATION change.
 *
 * useUsers used to write `users/{uid}` directly and never touch the Firebase
 * Auth custom claims the server enforces, so the UI reported a change that
 * authorization ignored. The fix routes role/branch/city edits through the
 * server route that exists for exactly this: POST /auth/assignRole
 * (backend functions/src/index.ts → claimsManager.setUserCustomClaims, which
 * sets custom claims, revokes refresh tokens, mirrors users/{uid} and the
 * admins/{uid} registry).
 *
 * Non-privileged profile fields (name, phone, PIN) keep the direct write.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assignUserRole: vi.fn(),
  updateDoc: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({ db: { name: 'test-db' } }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ user: null }) }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn((_db: unknown, _collection: string, id: string) => ({
    id,
    path: `users/${id}`,
  })),
  setDoc: mocks.setDoc,
  updateDoc: mocks.updateDoc,
  Timestamp: { now: () => ({ seconds: 1 }) },
}));
vi.mock('@/services/partnerFunctionsApi', () => ({
  partnerFunctionsApi: {
    assignUserRole: mocks.assignUserRole,
    inviteStaff: vi.fn(),
    revokeUserRole: vi.fn(),
  },
}));
vi.mock('@/core/auth/pinHelpers', () => ({
  hashPinSimple: (pin: string) => `hash:${pin}`,
}));

import { persistUserUpdate } from '../src/hooks/useUsers';

const current = {
  id: 'uid_1',
  name: 'Ramesh Patel',
  email: 'ramesh@burgonomics.in',
  role: 'branch_staff' as const,
  branchIds: ['branch_surat_01'],
  cityIds: ['Surat'],
};

beforeEach(() => {
  mocks.assignUserRole.mockReset();
  mocks.updateDoc.mockReset();
  mocks.setDoc.mockReset();
  mocks.assignUserRole.mockResolvedValue({
    success: true,
    targetUid: 'uid_1',
    role: 'branch_owner',
  });
  mocks.updateDoc.mockResolvedValue(undefined);
  mocks.setDoc.mockResolvedValue(undefined);
});

describe('PAR-02 — role and branch edits go through the claims-authoritative server', () => {
  it('calls POST /auth/assignRole with targetUid/role/branchIds/cityIds, not a bare users/ write', async () => {
    await persistUserUpdate({
      userId: 'uid_1',
      updates: { role: 'branch_owner', branchIds: ['branch_surat_01', 'branch_surat_02'] },
      current,
    });

    expect(mocks.assignUserRole).toHaveBeenCalledTimes(1);
    expect(mocks.assignUserRole).toHaveBeenCalledWith({
      targetUid: 'uid_1',
      role: 'branch_owner',
      branchIds: ['branch_surat_01', 'branch_surat_02'],
      cityIds: ['Surat'],
    });

    // The server mirrors users/{uid}; the role must never be written directly.
    expect(mocks.updateDoc).not.toHaveBeenCalled();
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('keeps the current branch/city scope when only the role changes (never wipes claims)', async () => {
    await persistUserUpdate({ userId: 'uid_1', updates: { role: 'branch_owner' }, current });

    expect(mocks.assignUserRole).toHaveBeenCalledWith({
      targetUid: 'uid_1',
      role: 'branch_owner',
      branchIds: ['branch_surat_01'],
      cityIds: ['Surat'],
    });
  });

  it('still writes non-privileged profile fields directly, without a claims call', async () => {
    await persistUserUpdate({
      userId: 'uid_1',
      updates: { name: 'Ramesh P.', phone: '+91 90000 00000' },
      current,
    });

    expect(mocks.assignUserRole).not.toHaveBeenCalled();
    expect(mocks.updateDoc).toHaveBeenCalledTimes(1);
    const written = mocks.updateDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(written.name).toBe('Ramesh P.');
    expect(written).not.toHaveProperty('role');
    expect(written).not.toHaveProperty('branchIds');
  });

  it('surfaces the server failure and never reports success', async () => {
    mocks.assignUserRole.mockRejectedValue(
      new Error('Permission denied: Only Superadmins / Brand Owners can assign RBAC roles.')
    );

    await expect(
      persistUserUpdate({ userId: 'uid_1', updates: { role: 'developer' }, current })
    ).rejects.toThrow(/Permission denied/);
    // No profile write after a refused claims change: nothing may look saved.
    expect(mocks.updateDoc).not.toHaveBeenCalled();
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('fails closed when a role edit arrives without any known role', async () => {
    await expect(
      persistUserUpdate({ userId: 'uid_unknown', updates: { branchIds: ['branch_surat_02'] } })
    ).rejects.toThrow(/role is unknown/);
    expect(mocks.assignUserRole).not.toHaveBeenCalled();
  });
});
