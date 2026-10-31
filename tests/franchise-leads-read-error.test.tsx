/**
 * A denied franchise-lead read used to be caught and replaced by the DEV seed
 * (or an empty list in prod), so an allowed role saw "no leads" instead of a
 * permission failure. The query must reject and the pipeline surface it.
 */
import { describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({ options: null as any }));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: any) => {
    captured.options = options;
    return { data: undefined, isLoading: false, error: null };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/config/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ __collection: name }),
  query: (ref: any, ...constraints: any[]) => ({ __collection: ref?.__collection, constraints }),
  orderBy: (field: string, dir: string) => ({ __orderBy: { field, dir } }),
  getDocs: vi.fn(async () => {
    throw new Error('Missing or insufficient permissions.');
  }),
  doc: (_db: unknown, name: string, id: string) => ({ __doc: `${name}/${id}` }),
  addDoc: vi.fn(async () => undefined),
  updateDoc: vi.fn(async () => undefined),
  Timestamp: {
    now: () => ({ toMillis: () => Date.now() }),
    fromMillis: (ms: number) => ({ toMillis: () => ms }),
  },
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { id: 'uid_brand', role: 'brand_owner', branchIds: [] } }),
}));

import { useFranchiseLeads } from '@/hooks/useFranchiseLeads';

describe('useFranchiseLeads read failures', () => {
  it('rejects a denied read instead of returning an empty/seed list', async () => {
    useFranchiseLeads();
    expect(captured.options?.queryFn).toBeTypeOf('function');

    await expect(captured.options.queryFn()).rejects.toThrow(/insufficient permissions/i);
  });
});
