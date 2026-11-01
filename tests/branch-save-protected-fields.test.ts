/**
 * Rules deny a branch owner/staff member any change to `monthlyFee`,
 * `packaging`, `packagingFee`, `royaltyPercentage`, `brandRoyaltyPercent`.
 * A default-filled value counts as a change, so the save payload must OMIT
 * those keys for non-brand roles or an unrelated save is rejected.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  role: 'branch_owner' as string,
  updates: [] as Array<{ id: string; data: Record<string, any> }>,
}));

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { id: 'uid_branch', role: state.role } }),
}));

vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  getDocs: vi.fn(async () => ({ docs: [] })),
  doc: (_db: unknown, _name: string, id: string) => ({ id }),
  addDoc: vi.fn(async () => undefined),
  setDoc: vi.fn(async () => undefined),
  updateDoc: vi.fn(async (ref: { id: string }, data: Record<string, any>) => {
    state.updates.push({ id: ref.id, data });
  }),
  query: vi.fn(),
  where: vi.fn(),
  Timestamp: { now: () => ({}) },
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

const PROTECTED = [
  'monthlyFee',
  'packaging',
  'packagingFee',
  'royaltyPercentage',
  'brandRoyaltyPercent',
  'petpoojaStoreId',
  'petpooja',
  'razorpayAccountId',
  'servicedRadiusKm',
];

const protectedPayload = () => ({
  announcementBanner: 'Weekend special',
  monthlyFee: 999,
  packaging: { source: 'petpooja' },
  packagingFee: 15,
  royaltyPercentage: 5,
  brandRoyaltyPercent: 5,
  petpoojaStoreId: 'PP_SURAT_01',
  petpooja: { restId: 'x' },
  razorpayAccountId: 'acc_A1B2C3D4E5F6G7',
  servicedRadiusKm: 12,
});

beforeEach(() => {
  state.role = 'branch_owner';
  state.updates.length = 0;
});

describe('useBranches.updateBranchSettings — protected fields', () => {
  it('omits every protected key for a branch role while saving unrelated fields', async () => {
    const { updateBranchSettings } = useBranches();
    await updateBranchSettings.mutateAsync({
      branchId: 'branch_surat_01',
      settings: protectedPayload() as any,
    });

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].data.announcementBanner).toBe('Weekend special');
    for (const key of PROTECTED) {
      expect(key in state.updates[0].data).toBe(false);
    }
  });

  it('keeps the monthly fee for a brand role', async () => {
    state.role = 'brand_owner';
    const { updateBranchSettings } = useBranches();
    await updateBranchSettings.mutateAsync({
      branchId: 'branch_surat_01',
      settings: protectedPayload() as any,
    });

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].data.monthlyFee).toBe(999);
    expect(state.updates[0].data.petpoojaStoreId).toBe('PP_SURAT_01');
  });
});
