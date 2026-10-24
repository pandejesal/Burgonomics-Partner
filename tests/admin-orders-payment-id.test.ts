import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Control Room refund action reads the gateway payment id from the mapped
 * RichOrder (`payment.transactionId`). Raw docs store it in several documented
 * shapes; the mapper must carry every one of them so a paid order never
 * reaches the refund API with an empty payment id.
 */

const h = vi.hoisted(() => ({
  docs: [] as Array<{ id: string; data: Record<string, any> }>,
}));

vi.mock('@/core/config/firebase', () => ({ db: {} }));
vi.mock('@/config/firebase', () => ({ app: {}, auth: {}, db: {}, messaging: null }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  query: (ref: any, ...constraints: any[]) => ({ ref, constraints }),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn(async () => {
    const docs = h.docs.map((d) => ({ id: d.id, data: () => d.data }));
    return {
      docs,
      empty: docs.length === 0,
      size: docs.length,
      forEach: (fn: (d: { id: string; data: () => Record<string, any> }) => void) =>
        docs.forEach(fn),
    };
  }),
  onSnapshot: vi.fn(),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: { getState: () => ({ user: { role: 'brand_owner' } }) },
}));
vi.mock('@/stores/appStore', () => ({
  useAppStore: { getState: () => ({ selectedBranchId: null }) },
}));
vi.mock('@/utils/orderContract', async (original) => ({
  ...(await original<typeof import('../src/utils/orderContract')>()),
  fetchAliasedStoreOrders: vi.fn(async () => []),
}));

import { adminOrdersService } from '../src/admin/services/adminOrdersService';

function historyDoc(id: string, payment: Record<string, any>): { id: string; data: Record<string, any> } {
  return {
    id,
    data: {
      branchId: 'branch_1',
      status: 'delivered',
      items: [],
      total: 480,
      paymentStatus: 'completed',
      payment,
      createdAt: '2026-10-24T00:00:00.000Z',
    },
  };
}

describe('Control Room order payment id mapping', () => {
  beforeEach(() => {
    h.docs = [];
  });

  it.each([
    ['payment.razorpayPaymentId', { method: 'razorpay', razorpayPaymentId: 'pay_DOC' }],
    ['payment.transactionId', { method: 'razorpay', transactionId: 'pay_DOC' }],
  ])('maps %s into RichOrder payment.transactionId', async (_label, payment) => {
    h.docs = [historyDoc('ord_board_1', payment)];

    const [order] = await adminOrdersService.getHistory(null, 10);

    expect(order.payment.transactionId).toBe('pay_DOC');
  });

  it('leaves transactionId unset when the doc recorded no gateway payment id', async () => {
    h.docs = [historyDoc('ord_board_2', { method: 'cod' })];

    const [order] = await adminOrdersService.getHistory(null, 10);

    expect(order.payment.transactionId).toBeUndefined();
  });
});
