/**
 * The admin control-room KPI board (KpiSection) reads its money from
 * DashboardService.getDashboardSnapshot. It had the same defect as the partner
 * dashboard: it summed every doc in the window and divided by every doc, so an
 * unpaid online order lifted the order count and sank the Average Order Value,
 * and it never used the server payment marker.
 *
 * Rows below are the shapes Firestore really holds (nested `status` object,
 * `payment.method` + `payment.status`, `totals.grandTotal`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));

vi.mock('@/core/config/firebase', () => ({ db: {} }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: { getState: () => ({ user: { role: 'brand_owner' } }) },
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  collectionGroup: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  doc: vi.fn(() => ({})),
  Timestamp: class {},
  getDocs: vi.fn(async () => ({
    size: state.rows.length,
    forEach: (cb: (doc: { id: string; data: () => Record<string, unknown> }) => void) =>
      state.rows.forEach((row, index) => cb({ id: `d${index}`, data: () => row })),
  })),
}));

import { DashboardService } from '../src/admin/dashboard/services/dashboardService';

const range = { from: '2026-11-01T00:00:00Z', to: '2026-11-01T23:59:59Z' };
const at = '2026-11-01T09:30:00Z';

const row = (over: Record<string, unknown>) => ({ createdAt: at, ...over });

const onlinePaid = row({
  status: { code: 'COMPLETED' },
  paymentChannel: 'razorpay',
  payment: { method: 'razorpay', status: 'paid' },
  totals: { grandTotal: 10 },
});
const counterPickup = row({
  status: { code: 'PICKED_UP' },
  payment: { method: 'cod', status: 'PAY_AT_STORE' },
  totals: { grandTotal: 10 },
});
const onlinePending = (n: number) =>
  row({
    status: { code: 'PLACED' },
    payment: { method: 'razorpay', status: 'pending' },
    totals: { grandTotal: 250 },
    // Real docs carry an order id only in the doc id; keep the rows distinct.
    orderRef: `pending_${n}`,
  });
const refunded = row({
  status: { code: 'DELIVERED' },
  paymentChannel: 'razorpay',
  payment: { method: 'razorpay', status: 'paid' },
  totals: { grandTotal: 10 },
  refundStatus: 'refunded',
  refundedTotalPaise: 1000,
});

class TestDashboard extends DashboardService {
  protected async fetchOrders() {
    return state.rows;
  }
  protected async fetchPayments() {
    return [];
  }
  protected async fetchRefunds() {
    return [];
  }
  protected async scopedOrderIds() {
    return null;
  }
  async getLiveCounts() {
    return {
      ordersLast24h: 0,
      ordersActive: 0,
      paymentsCapturedLast24h: 0,
      refundsPendingCount: 0,
      petpoojaWebhooksPending: 0,
      paymentWebhooksPending: 0,
      realtimeSessionsActive: 0,
      storesActive: 0,
    };
  }
}

const service = new TestDashboard();

beforeEach(() => {
  state.rows = [];
});

describe('admin KPI snapshot — same counted-sale rule as the partner dashboard', () => {
  it('counts the paid online + completed cash order, drops the unpaid and refunded ones', async () => {
    state.rows = [
      onlinePaid,
      counterPickup,
      onlinePending(1),
      onlinePending(2),
      onlinePending(3),
      refunded,
    ];

    const { revenue } = await service.getDashboardSnapshot(range);

    expect(revenue.orderCount).toBe(2);
    expect(revenue.totalRevenuePaise).toBe(2000);
    expect(revenue.aov).toBe(1000); // ₹10, not ₹2
  });

  it('an order with no payment evidence at all still counts (legacy completed sale)', async () => {
    state.rows = [row({ status: { code: 'COMPLETED' }, totalAmount: 25 })];

    const { revenue } = await service.getDashboardSnapshot(range);

    expect(revenue.orderCount).toBe(1);
    expect(revenue.totalRevenuePaise).toBe(2500);
  });

  it('a cancelled order still contributes nothing', async () => {
    state.rows = [onlinePaid, row({ status: { code: 'CANCELLED' }, totalAmount: 500 })];

    const { revenue } = await service.getDashboardSnapshot(range);

    expect(revenue.orderCount).toBe(1);
    expect(revenue.totalRevenuePaise).toBe(1000);
  });
});
