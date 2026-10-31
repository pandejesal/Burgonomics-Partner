/**
 * Owner decision 1 Nov 2026: cash and Razorpay are separate earnings streams,
 * and only the server-stamped top-level `paymentChannel === "razorpay"` proves
 * a gateway payment. `paymentMethod`, `paymentStatus` and `payment.*` are
 * client/staff-written and prove nothing.
 */
import { describe, expect, it } from 'vitest';
import {
  orderNetEarnings,
  orderPaymentChannel,
  summarizeOrderRevenue,
} from '../src/utils/analyticsMath';
import { normalizeOrderDoc } from '../src/utils/orderContract';

const online = (over: Record<string, unknown> = {}) =>
  normalizeOrderDoc('ord_online', {
    branchId: 'branch_surat_01',
    status: 'delivered',
    items: [],
    total: 1000,
    createdAt: '2026-11-01T10:00:00Z',
    ...over,
  });

describe('orderPaymentChannel — only the server marker proves Razorpay', () => {
  it('an online order with the server marker is razorpay', () => {
    const order = online({ paymentChannel: 'razorpay', paymentMethod: 'razorpay' });
    expect(orderPaymentChannel(order)).toBe('razorpay');
  });

  it('an online order without the marker is unpaid, even if it claims paid', () => {
    const order = online({ paymentMethod: 'razorpay', paymentStatus: 'completed' });
    expect(orderPaymentChannel(order)).toBe('unpaid');
    expect(orderNetEarnings(order)).toBe(0);
  });

  it('a walk-in order is cash & counter, whatever tender staff selected', () => {
    for (const paymentMethod of ['cod', 'upi', 'razorpay']) {
      const walkIn = online({
        customerId: 'cust_walkin',
        paymentMethod,
        paymentStatus: 'completed',
      });
      expect(orderPaymentChannel(walkIn)).toBe('cash');
    }
  });

  it('a COD delivery order is cash & counter', () => {
    expect(orderPaymentChannel(online({ paymentMethod: 'cod' }))).toBe('cash');
  });

  it('earnings exclude the courier fee the brand pays (D6)', () => {
    const order = online({ paymentChannel: 'razorpay', total: 1045, deliveryFee: 45 });
    expect(orderNetEarnings(order)).toBe(1000);
  });

  it('a refund comes out of the courier fee first, never counted twice', () => {
    // ₹45 courier fee, ₹45 refunded → the fee was refunded, earnings unchanged.
    const feeRefunded = online({
      paymentChannel: 'razorpay',
      total: 1045,
      deliveryFee: 45,
      refundedTotalPaise: 4500,
    });
    expect(orderNetEarnings(feeRefunded)).toBe(1000);

    // ₹200 refunded → ₹45 restores the courier fee, ₹155 reduces branch share.
    const partial = online({
      paymentChannel: 'razorpay',
      total: 1045,
      deliveryFee: 45,
      refundedTotalPaise: 20000,
    });
    expect(orderNetEarnings(partial)).toBe(845);

    // A refund below the courier fee cannot make earnings negative.
    const tiny = online({
      paymentChannel: 'razorpay',
      total: 1045,
      deliveryFee: 45,
      refundedTotalPaise: 2000,
    });
    expect(orderNetEarnings(tiny)).toBe(1000);
  });

  it('cash counts only when the order is completed — in progress is a receivable', () => {
    const inProgress = online({
      customerId: 'cust_walkin',
      status: 'preparing',
      total: 500,
    });
    expect(orderPaymentChannel(inProgress)).toBe('cash');
    expect(orderNetEarnings(inProgress)).toBe(0);

    const summary = summarizeOrderRevenue([inProgress]);
    expect(summary.cashRevenue).toBe(0);
    expect(summary.cashOrders).toBe(0);
    expect(summary.cashPendingOrders).toBe(1);
    expect(summary.totalRevenue).toBe(0);
  });
});

describe('summarizeOrderRevenue — separate streams, no royalty', () => {
  it('splits Razorpay and cash and counts unpaid orders at zero', () => {
    const summary = summarizeOrderRevenue([
      online({ paymentChannel: 'razorpay', total: 1045, deliveryFee: 45 }),
      online({ paymentChannel: 'razorpay', total: 500 }),
      online({ customerId: 'cust_walkin', paymentMethod: 'razorpay', total: 313 }),
      online({ paymentMethod: 'cod', total: 400 }),
      online({ paymentMethod: 'razorpay', total: 900 }), // no marker → unpaid
    ]);

    expect(summary.totalRevenue).toBe(1000 + 500 + 313 + 400);
    expect(summary.totalOrders).toBe(5);
    expect(summary.razorpayRevenue).toBe(1500);
    expect(summary.razorpayOrders).toBe(2);
    expect(summary.cashRevenue).toBe(713);
    expect(summary.cashOrders).toBe(2);
    expect(summary.cashPendingOrders).toBe(0);
    expect('brandRoyaltyEarned' in summary).toBe(false);
    expect('netBranchPayoutTotal' in summary).toBe(false);
  });
});
