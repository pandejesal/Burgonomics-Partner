import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], denied: false, scopeDenied: false, allowed: null as Set<string> | null }));
vi.mock('@/core/config/firebase', () => ({ db: {} }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: { getState: () => ({ user: { role: 'brand_owner' } }) } }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), collectionGroup: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(),
  Timestamp: class {},
  getDocs: vi.fn(async () => {
    if (state.denied) throw new Error('permission-denied');
    return { size: state.rows.length, forEach: (callback: (doc: { id: string; data: () => Record<string, unknown> }) => void) => state.rows.forEach((row, index) => callback({ id: `d${index}`, data: () => row })) };
  }),
}));
import { DashboardService } from '../src/admin/dashboard/services/dashboardService';

const dateRange = { from: '2026-10-01', to: '2026-10-31' };
class TestDashboard extends DashboardService {
  protected async fetchOrders() { return state.rows; }
  protected async fetchPayments() { return []; }
  protected async fetchRefunds() { return []; }
  protected async scopedOrderIds() {
    if (state.scopeDenied) throw new Error('scope unavailable');
    return state.allowed;
  }
  async getLiveCounts() { return { ordersLast24h: 0, ordersActive: 0, paymentsCapturedLast24h: 0, refundsPendingCount: 0, petpoojaWebhooksPending: 0, paymentWebhooksPending: 0, realtimeSessionsActive: 0, storesActive: 0 }; }
}
const service = new TestDashboard();
beforeEach(() => { state.rows = []; state.denied = false; state.scopeDenied = false; state.allowed = null; });
describe('H1 revenue excludes terminal statuses', () => {
  it.each(['CANCELLED', 'REFUNDED', 'Cancelled', 'Refunded', 'cancelled', 'refunded'])('%s contributes no revenue', async (status) => {
    state.rows = [{ status: { code: status }, createdAt: '2026-10-15', totalAmount: 20 }, { status, createdAt: '2026-10-15', totalAmount: 30 }, { status: 'COMPLETED', createdAt: '2026-10-15', totalAmount: 10 }];
    expect((await service.getDashboardSnapshot(dateRange)).revenue.totalRevenuePaise).toBe(1000);
  });
});
describe('H2 actual reconciliation queue', () => {
  it('returns unresolved scoped, dated evidence, excluding resolved and out-of-range rows', async () => {
    state.allowed = new Set(['order1']);
    const row = { orderId: 'order1', status: 'needs_review', reason: 'AMOUNT_MISMATCH', razorpayPaymentId: 'pay1', createdAt: '2026-10-15' };
    state.rows = [row, { ...row, status: 'resolved' }, { ...row, createdAt: '2026-09-01' }, { ...row, orderId: 'other' }];
    expect((await service.getPaymentReconciliation(dateRange.from, dateRange.to)).discrepancies).toEqual([{ paymentId: 'pay1', reason: 'AMOUNT_MISMATCH' }]);
  });
  it.each(['denied', 'scopeDenied'] as const)('%s means unavailable, not clean', async (failure) => {
    state[failure] = true;
    expect(await service.getPaymentReconciliation(dateRange.from, dateRange.to)).toMatchObject({ reconciliationStatus: 'unavailable' });
  });
  it('a complete empty queue is clear, not a bank balance assertion', async () => {
    expect(await service.getPaymentReconciliation(dateRange.from, dateRange.to)).toMatchObject({ reconciliationStatus: 'clear', discrepancies: [] });
  });
  it('a truncated queue cannot assert clear', async () => {
    state.rows = Array.from({ length: 201 }, () => ({}));
    expect(await service.getPaymentReconciliation(dateRange.from, dateRange.to)).toMatchObject({ reconciliationStatus: 'unavailable' });
  });
});
