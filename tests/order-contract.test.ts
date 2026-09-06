import { describe, it, expect } from 'vitest';

// Pins the cross-app status round-trip against the REAL contract helpers:
// partner writes go out in Delivery object form; every reader normalizes.
// If either side drifts, orders vanish from dispatch — this must go red.
import {
  toDeliveryStatusMeta,
  toPartnerStatus,
  normalizeOrderDoc,
} from '../src/utils/orderContract';

describe('Order status contract (real orderContract)', () => {
  it('maps the written Delivery object form back to partner pending', () => {
    const written = toDeliveryStatusMeta('pending');
    expect(written.code).toBe('PLACED');
    expect(toPartnerStatus(written)).toBe('pending');
  });

  it('normalizes a partner-written doc (object status) to a dispatchable order', () => {
    const order = normalizeOrderDoc('ord_x', {
      customerId: 'c1',
      branchId: 'branch_surat_01',
      status: toDeliveryStatusMeta('pending'),
      items: [],
    });
    expect(order.status).toBe('pending');
    expect(order.branchId).toBe('branch_surat_01');
  });

  it('normalizes legacy lowercase string statuses', () => {
    expect(toPartnerStatus('out_for_delivery')).toBe('out_for_delivery');
    expect(toPartnerStatus({ code: 'RIDER_CANCELLED' })).toBe('out_for_delivery');
    expect(toPartnerStatus(undefined)).toBe('pending');
  });
});
