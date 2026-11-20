/**
 * CASH-FLOWS (owner decision 2026-11-20): the server now creates cash orders and
 * stamps `paymentChannel: "cash"` — the mirror of the `"razorpay"` marker. The
 * Partner money reports must read that marker directly, not infer cash from a
 * tender field the client or the till can type.
 *
 * A walk-in still counts as cash by its sentinel customer id, and a legacy
 * client-typed `paymentMethod: "cod"` stays cash so no historical COD order
 * disappears from the cash stream when this ships.
 */
import { describe, expect, it } from 'vitest';
import { orderPaymentChannel, summarizeOrderRevenue } from './analyticsMath';
import { normalizeOrderDoc } from './orderContract';

const order = (over: Record<string, unknown> = {}) =>
  normalizeOrderDoc('ord_cash_1', {
    branchId: 'branch_surat_01',
    status: 'delivered',
    items: [],
    total: 115,
    createdAt: '2026-11-20T10:00:00Z',
    ...over,
  });

describe('the server cash marker is authoritative', () => {
  it('a server COD order is cash even if its tender field is missing', () => {
    const cod = order({ paymentChannel: 'cash', paymentStatus: 'paid' });
    expect(orderPaymentChannel(cod)).toBe('cash');
  });

  it('a server cash marker is never read as an online payment', () => {
    const cod = order({ paymentChannel: 'cash', paymentMethod: 'razorpay' });
    expect(orderPaymentChannel(cod)).toBe('cash');
  });

  it('still treats a legacy client-typed cod order as cash', () => {
    expect(orderPaymentChannel(order({ paymentMethod: 'cod' }))).toBe('cash');
  });

  it('counts a delivered COD order in the cash stream, not as unpaid', () => {
    const summary = summarizeOrderRevenue([
      order({ paymentChannel: 'cash', paymentStatus: 'paid' }),
    ]);
    expect(summary.cashOrders).toBe(1);
    expect(summary.razorpayOrders).toBe(0);
    expect(summary.cashPendingOrders).toBe(0);
  });
});
