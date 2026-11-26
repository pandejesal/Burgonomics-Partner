import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * SEC-11 / F6 r2 — Partner reads and writes the POS identifiers from
 * `branch_secrets`, not from `branches`.
 *
 * The backend security package moved `petpooja`, `petpoojaStoreId` and `restIDs`
 * into the brand-only `branch_secrets/{branchId}` collection; `branches/*` no
 * longer carries them. Any screen still reading `branch.petpoojaStoreId` shows a
 * BLANK id after deploy, and any save that still writes it to `branches` is
 * rejected by the hardened update arm (those keys are in the deny-list).
 *
 * `razorpayAccountId` is retired with no reader anywhere — it must not be
 * migrated, read or written.
 */

const state = vi.hoisted(() => ({
  role: 'brand_owner' as string,
  userId: 'uid_brand',
  branchWrites: [] as Array<{ id: string; data: Record<string, any> }>,
  secretWrites: [] as Array<{ id: string; data: Record<string, any>; options?: any }>,
  secrets: {} as Record<string, Record<string, any>>,
  addedBranches: [] as Array<Record<string, any>>,
}));

vi.mock('@/config/firebase', () => ({ db: {} }));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { id: state.userId, role: state.role } }),
}));

vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  getDocs: async () => ({
    docs: Object.entries(state.secrets).map(([id, data]) => ({ id, data: () => data })),
    empty: Object.keys(state.secrets).length === 0,
  }),
  doc: (_db: unknown, name: string, id: string) => ({ name, id }),
  getDoc: async (ref: { name: string; id: string }) => ({
    exists: () => ref.name === 'branch_secrets' && ref.id in state.secrets,
    id: ref.id,
    data: () => state.secrets[ref.id] ?? {},
  }),
  addDoc: async (_ref: unknown, data: Record<string, any>) => {
    state.addedBranches.push(data);
    return { id: 'branch_new_01' };
  },
  setDoc: async (ref: { name: string; id: string }, data: Record<string, any>, options?: any) => {
    expect(ref.name).toBe('branch_secrets');
    state.secretWrites.push({ id: ref.id, data, options });
  },
  updateDoc: async (ref: { name: string; id: string }, data: Record<string, any>) => {
    expect(ref.name).toBe('branches');
    state.branchWrites.push({ id: ref.id, data });
  },
  runTransaction: vi.fn(),
  Timestamp: { now: () => ({ __ts: 'now' }) },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [], isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: (options: any) => ({
    mutateAsync: (vars: any) => options.mutationFn(vars),
    mutate: vi.fn(),
    isPending: false,
  }),
}));

import { useBranches } from '@/hooks/useBranches';
import {
  BRANCH_SECRETS_COLLECTION,
  branchSecretsPatch,
  canReadBranchSecrets,
  readAllBranchSecrets,
  readBranchSecrets,
  restIDsForStoreId,
} from '@/utils/branchSecrets';

const SECRET_KEYS = ['petpoojaStoreId', 'petpooja', 'restIDs'];
const RETIRED_KEY = 'razorpayAccountId';

beforeEach(() => {
  state.role = 'brand_owner';
  state.branchWrites.length = 0;
  state.secretWrites.length = 0;
  state.secrets = {};
  state.addedBranches.length = 0;
});

describe('branch_secrets — brand-only access contract', () => {
  it('is readable by brand roles only (rules: isBrandOwner)', () => {
    expect(canReadBranchSecrets('brand_owner')).toBe(true);
    expect(canReadBranchSecrets('developer')).toBe(true);
    for (const role of ['branch_owner', 'branch_staff', 'support', 'regional_manager'] as const) {
      expect(canReadBranchSecrets(role)).toBe(false);
    }
  });

  it('maps a POS store id to its restIDs and never invents one', () => {
    expect(restIDsForStoreId('PP_SURAT_01')).toEqual(['PP_SURAT_01']);
    expect(restIDsForStoreId('  PP_AMD_01  ')).toEqual(['PP_AMD_01']);
    expect(restIDsForStoreId('')).toEqual([]);
    expect(restIDsForStoreId(null)).toEqual([]);
    expect(restIDsForStoreId(undefined)).toEqual([]);
  });

  it('reads one outlet and every outlet out of branch_secrets', async () => {
    state.secrets = {
      branch_surat_01: { branchId: 'branch_surat_01', petpoojaStoreId: 'PP_SURAT_01', restIDs: ['PP_SURAT_01'] },
      branch_amd_01: { branchId: 'branch_amd_01', petpoojaStoreId: 'PP_AMD_01' },
    };
    expect(await readBranchSecrets('branch_surat_01')).toMatchObject({
      branchId: 'branch_surat_01',
      petpoojaStoreId: 'PP_SURAT_01',
    });
    expect(await readBranchSecrets('missing')).toBeNull();
    expect(await readBranchSecrets('')).toBeNull();

    const all = await readAllBranchSecrets();
    expect(Object.keys(all).sort()).toEqual(['branch_amd_01', 'branch_surat_01']);
  });
});

describe('useBranches — createBranch writes secrets separately', () => {
  it('adds the branch doc WITHOUT the POS/payment keys, then writes branch_secrets', async () => {
    const { createBranch } = useBranches();
    await createBranch.mutateAsync({
      name: 'Burgonomics Surat Adajan',
      city: 'Surat',
      address: 'Adajan',
      phone: '+91 98765 43210',
      status: 'active',
      petpoojaStoreId: 'PP_SURAT_01',
      coordinates: { lat: 21.19, lng: 72.79 },
    } as any);

    expect(state.addedBranches).toHaveLength(1);
    const branchDoc = state.addedBranches[0];
    for (const key of [...SECRET_KEYS, RETIRED_KEY]) {
      expect(key in branchDoc, `branches doc must not carry ${key}`).toBe(false);
    }
    expect(branchDoc.name).toBe('Burgonomics Surat Adajan');

    expect(state.secretWrites).toHaveLength(1);
    expect(state.secretWrites[0].data).toMatchObject({
      branchId: 'branch_new_01',
      petpoojaStoreId: 'PP_SURAT_01',
      restIDs: ['PP_SURAT_01'],
    });
    expect(state.secretWrites[0].options).toEqual({ merge: true });
  });

  it('writes no secrets document at all when the form carried no POS id', async () => {
    const { createBranch } = useBranches();
    await createBranch.mutateAsync({
      name: 'Burgonomics Vadodara',
      city: 'Vadodara',
      address: 'Alkapuri',
      phone: '+91 98765 43212',
      status: 'coming_soon',
      coordinates: { lat: 22.31, lng: 73.17 },
    } as any);

    expect(state.addedBranches).toHaveLength(1);
    expect(state.secretWrites).toHaveLength(0);
  });
});

describe('useBranches — activateStore splits the lifecycle from the secrets', () => {
  it('activates the branch and writes the POS id to branch_secrets only', async () => {
    const { activateStore } = useBranches();
    await activateStore.mutateAsync({ branchId: 'branch_x', petpoojaStoreId: 'PP_NEW' });

    expect(state.branchWrites).toHaveLength(1);
    expect(state.branchWrites[0].data).toMatchObject({ active: true, status: 'active' });
    for (const key of [...SECRET_KEYS, RETIRED_KEY]) {
      expect(key in state.branchWrites[0].data, `branches write must not carry ${key}`).toBe(false);
    }

    expect(state.secretWrites).toHaveLength(1);
    expect(state.secretWrites[0].id).toBe('branch_x');
    expect(state.secretWrites[0].data).toMatchObject({ petpoojaStoreId: 'PP_NEW' });
  });

  it('drops the retired razorpayAccountId input entirely', async () => {
    const { activateStore } = useBranches();
    // A caller still sending the retired key must not have it routed anywhere.
    await activateStore.mutateAsync({
      branchId: 'branch_x',
      razorpayAccountId: 'acc_Rzp_FAKE_01',
    } as any);

    const serialized = JSON.stringify([state.branchWrites, state.secretWrites]);
    expect(serialized).not.toContain('acc_Rzp_FAKE_01');
    expect(serialized).not.toContain(RETIRED_KEY);
  });
});

describe('useBranches — updateBranchSettings routes secret keys to branch_secrets', () => {
  it('a branch-role save omits the secret keys and writes NO secrets document', async () => {
    state.role = 'branch_owner';
    const { updateBranchSettings } = useBranches();
    await updateBranchSettings.mutateAsync({
      branchId: 'branch_surat_01',
      settings: {
        announcementBanner: 'Weekend special',
        prepTimeMinutes: 25,
        petpoojaStoreId: 'PP_HACK',
        petpooja: { restId: 'x' },
        restIDs: ['PP_HACK'],
        razorpayAccountId: 'acc_FAKE',
      } as any,
    });

    expect(state.branchWrites).toHaveLength(1);
    expect(state.branchWrites[0].data.announcementBanner).toBe('Weekend special');
    for (const key of [...SECRET_KEYS, RETIRED_KEY]) {
      expect(key in state.branchWrites[0].data, `branch-role write must not carry ${key}`).toBe(false);
    }
    // A branch role is denied `branch_secrets`; writing one would only fail.
    expect(state.secretWrites).toHaveLength(0);
  });

  it('a brand-role save sends the secret keys to branch_secrets, not branches', async () => {
    state.role = 'brand_owner';
    const { updateBranchSettings } = useBranches();
    await updateBranchSettings.mutateAsync({
      branchId: 'branch_surat_01',
      settings: {
        prepTimeMinutes: 25,
        petpoojaStoreId: 'PP_SURAT_01',
        petpooja: { restId: 'rest_surat' },
        restIDs: ['PP_SURAT_01'],
      } as any,
    });

    expect(state.branchWrites).toHaveLength(1);
    expect(state.branchWrites[0].data.prepTimeMinutes).toBe(25);
    for (const key of SECRET_KEYS) {
      expect(key in state.branchWrites[0].data, `branches write must not carry ${key}`).toBe(false);
    }

    expect(state.secretWrites).toHaveLength(1);
    expect(state.secretWrites[0].data).toMatchObject({
      branchId: 'branch_surat_01',
      petpoojaStoreId: 'PP_SURAT_01',
      restIDs: ['PP_SURAT_01'],
    });
  });

  it('a brand-role save never migrates the retired razorpayAccountId', async () => {
    state.role = 'brand_owner';
    const { updateBranchSettings } = useBranches();
    await updateBranchSettings.mutateAsync({
      branchId: 'branch_surat_01',
      settings: { monthlyFee: 2500, razorpayAccountId: 'acc_Rzp_Surat_01' } as any,
    });

    const serialized = JSON.stringify([state.branchWrites, state.secretWrites]);
    expect(serialized).not.toContain('acc_Rzp_Surat_01');
    expect(state.secretWrites).toHaveLength(0);
    expect(state.branchWrites[0].data.monthlyFee).toBe(2500);
  });

  it('the shared patch helper is null for an ordinary (secret-free) save', () => {
    expect(branchSecretsPatch('branch_x', { prepTimeMinutes: 25 })).toBeNull();
    expect(branchSecretsPatch('branch_x', { petpoojaStoreId: 'PP_X' })).toMatchObject({
      branchId: 'branch_x',
      petpoojaStoreId: 'PP_X',
    });
  });
});

describe('the collection name matches the backend contract', () => {
  it('is branch_secrets (security-c11)', () => {
    expect(BRANCH_SECRETS_COLLECTION).toBe('branch_secrets');
  });
});
