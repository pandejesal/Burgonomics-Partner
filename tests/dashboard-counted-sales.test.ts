/**
 * Partner dashboard revenue — the live bug (30 Oct 2026): one paid ₹10 Razorpay
 * order, one completed ₹10 cash order and three unpaid online orders rendered
 * "Revenue ₹10 · Orders 5 · AOV ₹2". `paidOrders` matched only
 * paymentStatus 'completed'/'PAID' (so the completed cash order was skipped)
 * and AOV divided by every fetched order, including the three unpaid ones.
 *
 * The rule both Dashboard and Analytics now share (analyticsMath):
 *   - only the server `paymentChannel === "razorpay"` proves an online payment,
 *   - cash counts once the order is completed (delivered / picked up),
 *   - an unpaid online order is not an order yet,
 *   - cancelled / refunded orders never count.
 *
 * Order docs below use the shapes Firestore really holds: `payment.method` +
 * `payment.status` (PAY_AT_STORE / CASH_PENDING / pending) and a nested
 * `status` object, all normalized through the real normalizeOrderDoc.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeOrderDoc } from '../src/utils/orderContract';
import {
  isCountedSaleOrder,
  summarizeCountedSales,
  summarizeIstDaySales,
} from '../src/utils/analyticsMath';

const TODAY = '2026-11-01T09:30:00Z';

const doc = (id: string, over: Record<string, unknown>) =>
  normalizeOrderDoc(id, {
    branchId: 'branch_surat_01',
    items: [],
    createdAt: TODAY,
    ...over,
  });

// ₹10 paid online (Razorpay capture stamped by the server).
const onlinePaid = doc('ord_online_paid', {
  status: 'completed',
  paymentChannel: 'razorpay',
  payment: { method: 'razorpay', status: 'paid' },
  totals: { grandTotal: 10 },
});

// ₹10 cash collected at the counter: Firestore keeps PAY_AT_STORE even after
// the kitchen marks the order picked up.
const counterPickup = doc('ord_counter_pickup', {
  status: { code: 'PICKED_UP', kind: 'completed', terminal: true },
  payment: { method: 'cod', status: 'PAY_AT_STORE' },
  totals: { grandTotal: 10 },
});

// Three online orders nobody ever paid: no server channel marker.
const onlinePending = (n: number) =>
  doc(`ord_online_pending_${n}`, {
    status: 'pending',
    payment: { method: 'razorpay', status: 'pending' },
    totals: { grandTotal: 250 },
  });

const refunded = doc('ord_refunded', {
  status: 'delivered',
  paymentChannel: 'razorpay',
  payment: { method: 'razorpay', status: 'paid' },
  totals: { grandTotal: 10 },
  refundStatus: 'refunded',
  refundAmount: 10,
  refundedTotalPaise: 1000,
});

const liveOrders = [
  onlinePaid,
  counterPickup,
  onlinePending(1),
  onlinePending(2),
  onlinePending(3),
  refunded,
];

describe('Dashboard today figures — the live ₹10 / 5 / ₹2 case', () => {
  it('counts the paid online and the completed cash order only', () => {
    const sales = summarizeIstDaySales(liveOrders, new Date(TODAY));

    expect(sales.revenue).toBe(20);
    expect(sales.orderCount).toBe(2);
    expect(sales.averageOrderValue).toBe(10);
  });

  it('never counts an unpaid online order as an order', () => {
    for (const order of [onlinePending(1), onlinePending(2), onlinePending(3)]) {
      expect(isCountedSaleOrder(order)).toBe(false);
    }
    expect(isCountedSaleOrder(onlinePaid)).toBe(true);
    expect(isCountedSaleOrder(counterPickup)).toBe(true);
  });

  it('excludes a refunded order from revenue and volume', () => {
    expect(isCountedSaleOrder(refunded)).toBe(false);
    const sales = summarizeCountedSales([onlinePaid, counterPickup, refunded]);
    expect(sales.revenue).toBe(20);
    expect(sales.orderCount).toBe(2);
  });

  it('a cash order still in progress is a receivable, not revenue', () => {
    const inProgress = doc('ord_counter_preparing', {
      status: 'preparing',
      payment: { method: 'cod', status: 'CASH_PENDING' },
      totals: { grandTotal: 400 },
    });
    expect(isCountedSaleOrder(inProgress)).toBe(false);
    expect(summarizeIstDaySales([...liveOrders, inProgress], new Date(TODAY))).toMatchObject({
      revenue: 20,
      orderCount: 2,
    });
  });

  it('scopes to the Asia/Kolkata day, not the device day', () => {
    // 19:00Z on 31 Oct is already 00:30 IST on 1 Nov — today.
    const afterMidnightIst = doc('ord_ist_morning', {
      status: 'completed',
      paymentChannel: 'razorpay',
      payment: { method: 'razorpay', status: 'paid' },
      totals: { grandTotal: 30 },
      createdAt: '2026-10-31T19:00:00Z',
    });
    const yesterday = doc('ord_yesterday', {
      status: 'completed',
      paymentChannel: 'razorpay',
      payment: { method: 'razorpay', status: 'paid' },
      totals: { grandTotal: 99 },
      createdAt: '2026-10-25T09:00:00Z',
    });
    const sales = summarizeIstDaySales([...liveOrders, afterMidnightIst, yesterday], new Date(TODAY));
    expect(sales.revenue).toBe(50);
    expect(sales.orderCount).toBe(3);
  });

  it('the Dashboard page uses the shared rule instead of dividing by every order', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../src/pages/DashboardPage.tsx', import.meta.url)),
      'utf8'
    );
    expect(source).toContain('summarizeIstDaySales');
    // The old bug: paidOrders matched the client-written paymentStatus only.
    expect(source).not.toContain("paymentStatus === 'completed'");
    expect(source).not.toContain('revenue / ordersCount');
  });
});
