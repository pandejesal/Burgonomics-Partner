import { describe, expect, it } from 'vitest';

/**
 * Item 12: the rider-call card showed a dead `tel:` link because
 * normalizeOrderDoc mapped
 *   customerPhone: str(data.customerPhone ?? address.contactPhone)
 * — `??` only skips null/undefined, so an EMPTY STRING on the order won and
 * the deliveryAddress.contactPhone fallback was never consulted. The backend
 * only writes customerPhone at booking (a54c206), so before an order is booked
 * the field is present-but-empty and the card offered a call to "".
 *
 * The fix: treat blank (empty/whitespace) strings as missing, fall back to the
 * deliveryAddress contactPhone, and expose "no number known" as the absence of
 * a phone so the card hides the call action instead of rendering a dead link.
 */
import { normalizeOrderDoc } from '../src/utils/orderContract';

/** The real stored shape of an un-booked delivery order. */
function rawOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ord_12_unbooked',
    customerId: 'cust_1',
    customerName: 'Aarav',
    // Present but blank: the field the backend fills at booking time.
    customerPhone: '',
    branchId: 'branch_surat_01',
    items: [{ id: 'p1', name: 'Burger', price: 200, quantity: 1 }],
    subtotal: 200,
    tax: 10,
    deliveryFee: 30,
    total: 240,
    orderType: 'delivery',
    status: 'ready',
    paymentMethod: 'razorpay',
    paymentStatus: 'completed',
    deliveryAddress: {
      label: 'Home',
      full: '12 Vesu Rd, Surat',
      lat: 21.15,
      lng: 72.77,
      contactName: 'Aarav',
      contactPhone: '',
    },
    createdAt: { seconds: 1762099000, toDate: () => new Date(1762099000_000) },
    updatedAt: { seconds: 1762100000, toDate: () => new Date(1762100000_000) },
    ...overrides,
  } as any;
}

describe('customerPhone normalization treats blanks as missing', () => {
  it('falls back to deliveryAddress.contactPhone when customerPhone is an empty string', () => {
    const order = normalizeOrderDoc(
      'ord_12_unbooked',
      rawOrder({
        deliveryAddress: {
          label: 'Home',
          full: '12 Vesu Rd, Surat',
          lat: 21.15,
          lng: 72.77,
          contactName: 'Aarav',
          contactPhone: '+919876543210',
        },
      })
    );
    expect(order.customerPhone).toBe('+919876543210');
  });

  it('falls back through the `address` key too (Delivery writes data.address)', () => {
    const order = normalizeOrderDoc(
      'ord_12_unbooked',
      rawOrder({
        deliveryAddress: undefined,
        address: {
          label: 'Home',
          full: '12 Vesu Rd, Surat',
          lat: 21.15,
          lng: 72.77,
          contactName: 'Aarav',
          contactPhone: '+919876543211',
        },
      })
    );
    expect(order.customerPhone).toBe('+919876543211');
  });

  it('returns no phone at all when every source is blank', () => {
    for (const blank of ['', '   ', '\t']) {
      const order = normalizeOrderDoc(
        'ord_12_unbooked',
        rawOrder({
          customerPhone: blank,
          deliveryAddress: {
            label: 'Home',
            full: '12 Vesu Rd, Surat',
            lat: 21.15,
            lng: 72.77,
            contactName: 'Aarav',
            contactPhone: blank,
          },
        })
      );
      // Empty means UNKNOWN. The card must be able to tell that apart from a
      // number, and must not render `tel:` for it.
      expect(order.customerPhone).toBe('');
    }
  });

  it('prefers the order-level number when it really exists', () => {
    const order = normalizeOrderDoc(
      'ord_12_unbooked',
      rawOrder({
        customerPhone: '+919999999999',
        deliveryAddress: {
          label: 'Home',
          full: '12 Vesu Rd, Surat',
          lat: 21.15,
          lng: 72.77,
          contactName: 'Aarav',
          contactPhone: '+918888888888',
        },
      })
    );
    expect(order.customerPhone).toBe('+919999999999');
  });
});
