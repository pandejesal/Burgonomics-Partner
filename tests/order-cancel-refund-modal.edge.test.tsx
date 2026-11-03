/**
 * Cancel/refund modal edges that the existing role-matrix suite does not pin:
 *  - a gateway capture identified ONLY by `razorpayPaymentId`,
 *  - a capture identified by NEITHER field (the honest "no captured online
 *    payment" path) and a whitespace-only id that must not count,
 *  - an order that is already refunded: no second refund offer, and no false
 *    "no captured online payment" claim,
 *  - the two independent role gates: support can release a refund but cannot
 *    cancel an order, branch_staff can cancel but cannot release.
 *
 * Uses the REAL role matrices (not mocked oracles) so a drift in either list
 * shows up here as a behavioural change.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'branch_owner' as string | null }));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { role: auth.role } }),
}));

import { OrderCancelRefundModal } from '../src/features/orders/components/OrderCancelRefundModal';

const order = {
  id: 'ord_refund_edge_1',
  status: 'pending',
  paymentStatus: 'completed',
  total: 499,
} as any;

function renderModal(target: Record<string, unknown> = order): string {
  return renderToStaticMarkup(
    <OrderCancelRefundModal order={target as any} isOpen onClose={() => {}} onConfirmCancel={() => {}} />
  );
}

beforeEach(() => {
  // brand_owner holds BOTH gates (cancel + release), so the capture-detection
  // assertions below are not masked by a role restriction.
  auth.role = 'brand_owner';
});

describe('OrderCancelRefundModal gateway-capture detection', () => {
  it('offers the refund when only razorpayPaymentId identifies the capture', () => {
    const html = renderModal({
      ...order,
      paymentChannel: undefined,
      razorpayPaymentId: 'pay_edge_1',
    });

    expect(html).toContain('Initiate full refund');
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('no captured online payment');
  });

  it('does not treat a whitespace-only payment id as a gateway capture', () => {
    const html = renderModal({
      ...order,
      paymentChannel: undefined,
      razorpayPaymentId: '   ',
    });

    expect(html).not.toContain('Initiate full refund');
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain('no captured online payment');
  });

  it('offers no refund and no false capture claim when neither field is present', () => {
    const html = renderModal({ ...order, paymentChannel: undefined, razorpayPaymentId: undefined });

    expect(html).not.toContain('Initiate full refund');
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain('no captured online payment');
    expect(html).not.toContain('A brand admin must');
  });

  it('never offers a second refund on an already-refunded order and never calls it "no captured payment"', () => {
    const html = renderModal({
      ...order,
      paymentStatus: 'refunded',
      paymentChannel: 'razorpay',
      razorpayPaymentId: 'pay_already_refunded',
    });

    expect(html).not.toContain('Initiate full refund');
    expect(html).not.toContain('type="checkbox"');
    // "This order has no captured online payment" would be false here.
    expect(html).not.toContain('no captured online payment');
    // And there is no captured-payment-without-permission copy either.
    expect(html).not.toContain('A brand admin must');
  });
});

describe('OrderCancelRefundModal independent cancel vs release gates', () => {
  it('refuses to cancel for a role that may release refunds but not cancel orders (support)', () => {
    auth.role = 'support';
    const html = renderModal({ ...order, paymentChannel: 'razorpay', razorpayPaymentId: 'pay_support' });

    expect(html).toContain('Manager Authorization Required');
    // The refund form (and its checkbox) must not render behind the wall.
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain('Initiate full refund');
    expect(html).not.toContain('Confirm Cancellation');
  });

  it('lets branch_staff cancel but never offer them the refund release', () => {
    auth.role = 'branch_staff';
    const html = renderModal({ ...order, paymentChannel: 'razorpay', razorpayPaymentId: 'pay_staff' });

    expect(html).toContain('Confirm Cancellation');
    expect(html).not.toContain('Manager Authorization Required');
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain('Initiate full refund');
    expect(html).toContain('no refund is requested');
    expect(html).toContain('A brand admin must');
  });
});
