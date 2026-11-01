import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ queryFn: null as any }));
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: any) => { state.queryFn = options.queryFn; return {}; } }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ user: { id: 'owner', role: 'brand_owner' } }) }));
vi.mock('@/stores/appStore', () => ({ useAppStore: () => ({ selectedBranchId: 'demo', selectedCity: null }) }));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_: unknown, name: string) => ({ name }), doc: (_: unknown, name: string, id: string) => ({ name, id }),
  getDoc: async () => ({ exists: () => false }), getDocs: async () => ({ docs: [] }),
  query: (ref: unknown) => ref, where: () => ({}), limit: () => ({}), orderBy: () => ({}),
  Timestamp: { fromDate: (date: Date) => date },
}));
vi.mock('@/utils/orderContract', async (original) => ({
  ...(await original<typeof import('@/utils/orderContract')>()),
  fetchAliasedStoreOrders: async () => [{ id: 'cash', data: {
    branchId: 'demo', items: [], status: { code: 'PICKED_UP', kind: 'completed', terminal: true },
    payment: { method: 'cod', status: 'PAY_AT_STORE' }, totals: { grandTotal: 10 },
    fulfillment: 'takeaway', createdAt: '2026-11-01T09:11:08.034Z',
  } }],
}));
import { useAnalytics } from '@/hooks/useAnalytics';

describe('monthly statement order parity', () => {
  it('includes the same picked-up aliased cash order as monthly analytics', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T10:00:00Z'));
    try {
      useAnalytics('month');
      const result = await state.queryFn();
      expect(result.cashRevenue).toBe(10);
      expect(result.monthlyStatements.current.monthKey).toBe('2026-11');
      expect(result.monthlyStatements.current.summary.cashRevenue).toBe(10);
      expect(result.monthlyStatements.current.rows.find((row: any) => row.branchId === 'demo').cashEarnings).toBe(10);
    } finally {
      vi.useRealTimers();
    }
  });
});
