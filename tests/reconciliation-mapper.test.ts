import { describe, it, expect } from 'vitest';
import { mapServerDiscrepancy } from '../src/admin/pages/AdminReconciliationPage';

describe('mapServerDiscrepancy (Loop 25/120)', () => {
  it('maps a server needs_review row onto the review contract', () => {
    const out = mapServerDiscrepancy('dis_1', {
      orderId: 'ord_1',
      razorpayPaymentId: 'pay_1',
      reason: 'AMOUNT_MISMATCH',
      expectedPaise: 5000,
      actualPaise: 4990,
      status: 'needs_review',
    });
    expect(out).toMatchObject({
      id: 'dis_1',
      orderId: 'ord_1',
      paymentId: 'pay_1',
      type: 'AMOUNT_MISMATCH',
      internalAmountPaise: 5000,
      gatewayAmountPaise: 4990,
      status: 'UNRESOLVED',
    });
  });

  it('routes unknown reasons to VERIFICATION_FAILURE and settled rows to RESOLVED', () => {
    const out = mapServerDiscrepancy('dis_2', { reason: 'SOMETHING_NEW', status: 'resolved' });
    expect(out.type).toBe('VERIFICATION_FAILURE');
    expect(out.status).toBe('RESOLVED');
  });
});
