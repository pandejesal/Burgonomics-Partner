import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pins the fail-closed login contract against the REAL resolveUserProfile:
// unknown/missing roles deny login instead of escalating to superadmin.

const { docSnapshots } = vi.hoisted(() => {
  const docSnapshots: Record<string, any> = {};
  return { docSnapshots };
});

vi.mock('@/config/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ col, id })),
  getDoc: vi.fn(async (ref: { col: string; id: string }) => {
    const data = docSnapshots[`${ref.col}/${ref.id}`];
    return { exists: () => data !== undefined, data: () => data };
  }),
  Timestamp: { now: () => 'MOCK_NOW' },
}));

import { resolveUserProfile } from '../src/stores/authStore';

const firebaseUser = (uid: string) =>
  ({
    uid,
    email: `${uid}@example.com`,
    getIdTokenResult: async () => ({ claims: {} }),
  }) as any;

describe('Partner login fail-closed contract (real resolveUserProfile)', () => {
  beforeEach(() => {
    for (const key of Object.keys(docSnapshots)) delete docSnapshots[key];
  });

  it("denies an admins doc with role 'customer' (no escalation to developer)", async () => {
    docSnapshots['admins/uid_customer'] = { role: 'customer', branchIds: [] };
    await expect(resolveUserProfile(firebaseUser('uid_customer'))).resolves.toBeNull();
  });

  it("denies a typo'd role like 'Branch_Owner' instead of granting superadmin", async () => {
    docSnapshots['admins/uid_typo'] = { role: 'Branch_Owner', branchIds: ['branch_surat_01'] };
    await expect(resolveUserProfile(firebaseUser('uid_typo'))).resolves.toBeNull();
  });

  it('denies a missing role on an admins doc', async () => {
    docSnapshots['admins/uid_norole'] = { branchIds: ['branch_surat_01'] };
    await expect(resolveUserProfile(firebaseUser('uid_norole'))).resolves.toBeNull();
  });

  it('denies a user with no admins doc, no users doc, and no token role', async () => {
    await expect(resolveUserProfile(firebaseUser('uid_nobody'))).resolves.toBeNull();
  });

  it('still admits a valid branch_staff profile with scoped branches', async () => {
    docSnapshots['admins/uid_staff'] = { role: 'branch_staff', branchIds: ['branch_surat_01'] };
    const profile = await resolveUserProfile(firebaseUser('uid_staff'));
    expect(profile?.role).toBe('branch_staff');
    expect(profile?.branchIds).toEqual(['branch_surat_01']);
  });
});
