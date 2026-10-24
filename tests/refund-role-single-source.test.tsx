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
  total: 499,
} as any;

function renderModal(): string {
  return renderToStaticMarkup(
    <OrderCancelRefundModal order={order} isOpen onClose={() => {}} onConfirmCancel={() => {}} />
  );
}

describe('OrderCancelRefundModal refund capability', () => {
  beforeEach(() => {
    shared.canReleaseRefund.mockReset();
  });

  it('derives instant-refund capability from the shared refund role matrix', () => {
    shared.canReleaseRefund.mockReturnValue(true);
    const allowed = renderModal();
    expect(shared.canReleaseRefund).toHaveBeenCalledWith('branch_owner');
    expect(allowed).toContain('Issue 100% Instant Refund');
    expect(allowed).toContain('type="checkbox"');

    shared.canReleaseRefund.mockReturnValue(false);
    const denied = renderModal();
    expect(shared.canReleaseRefund).toHaveBeenCalledWith('branch_owner');
    expect(denied).not.toContain('Issue 100% Instant Refund');
    expect(denied).not.toContain('Request 100% Refund');
    expect(denied).not.toContain('type="checkbox"');
    expect(denied).toContain('no refund is requested');
    expect(denied).toContain('A brand admin must');
  });
});
