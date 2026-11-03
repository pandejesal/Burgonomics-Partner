import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The refund-capability matrix has ONE owner (`@/admin/pages/refundRoles`,
 * mirrored from the server's requireRole list). The cancel/refund modal must
 * consume it rather than re-declaring a local role list, so a server gate
 * change cannot leave the screen offering a refund the server refuses.
 * The oracle is the injected shared helper: flipping its answer must flip the
 * copy the operator sees.
 */
const shared = vi.hoisted(() => ({ canReleaseRefund: vi.fn() }));

vi.mock('@/admin/pages/refundRoles', () => ({
  canReleaseRefund: shared.canReleaseRefund,
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { role: 'branch_owner' } }),
}));

import { OrderCancelRefundModal } from '../src/features/orders/components/OrderCancelRefundModal';

const order = {
  id: 'ord_refund_42',
  status: 'pending',
  paymentStatus: 'completed',
  // A REAL gateway capture. The previous fixture was a "completed" order with
  // no gateway id — exactly the cash/walk-in shape that must NOT offer a
  // refund, so it could not prove the role-matrix behaviour it claimed to.
  paymentChannel: 'razorpay',
  razorpayPaymentId: 'pay_test_refund_42',
  total: 499,
} as any;

/** Same order, but no captured online payment (cash / pay-at-store). */
const cashOrder = {
  id: 'ord_cash_42',
  status: 'pending',
  paymentStatus: 'completed',
  paymentMethod: 'cod',
  total: 499,
} as any;

function renderModal(target: any = order): string {
  return renderToStaticMarkup(
    <OrderCancelRefundModal order={target} isOpen onClose={() => {}} onConfirmCancel={() => {}} />
  );
}

describe('OrderCancelRefundModal refund capability', () => {
  beforeEach(() => {
    shared.canReleaseRefund.mockReset();
  });

  it('derives full-refund capability from the shared refund role matrix with honest processing copy', () => {
    shared.canReleaseRefund.mockReturnValue(true);
    const allowed = renderModal();
    expect(shared.canReleaseRefund).toHaveBeenCalledWith('branch_owner');
    expect(allowed).toContain('Initiate full refund');
    expect(allowed).not.toContain('Instant Refund');
    expect(allowed).toContain('type="checkbox"');
    expect(allowed).toContain('POST /payments/refund');

    shared.canReleaseRefund.mockReturnValue(false);
    const denied = renderModal();
    expect(shared.canReleaseRefund).toHaveBeenCalledWith('branch_owner');
    expect(denied).not.toContain('Initiate full refund');
    expect(denied).not.toContain('Issue 100% Instant Refund');
    expect(denied).not.toContain('Instant Refund');
    expect(denied).not.toContain('Request 100% Refund');
    expect(denied).not.toContain('type="checkbox"');
    expect(denied).toContain('no refund is requested');
    expect(denied).toContain('A brand admin must');
  });

  // A completed cash/walk-in order has nothing to reverse at the gateway. It
  // previously defaulted the refund checkbox ON, promising a POST /payments/refund
  // that buildCancelRefundRequest returns null for.
  it('never offers a gateway refund for a completed cash/pay-at-store order', () => {
    shared.canReleaseRefund.mockReturnValue(true);
    const cash = renderModal(cashOrder);
    expect(cash).not.toContain('Initiate full refund');
    expect(cash).not.toContain('type="checkbox"');
    expect(cash).toContain('no captured online payment');
    expect(cash).not.toContain('A brand admin must');
  });

  it('still offers the refund for a gateway capture identified only by paymentChannel', () => {
    shared.canReleaseRefund.mockReturnValue(true);
    const channelOnly = renderModal({
      ...order,
      razorpayPaymentId: undefined,
      paymentChannel: 'razorpay',
    });
    expect(channelOnly).toContain('Initiate full refund');
    expect(channelOnly).toContain('type="checkbox"');
  });
});
