import { describe, expect, it } from 'vitest';

/**
 * Item 2: an ambiguous KOT state must be DISTINGUISHABLE from a plain pending
 * push. orderContract previously collapsed every unknown value to 'pending', so
 * `accepted_unconfirmed` / `reconciliation_required` / an accepted-but-
 * unrecorded order looked exactly like "we have not pushed yet" — a paid order
 * whose ticket never printed was invisible to staff.
 *
 * Real stored shapes (backend orderPush.ts:1885-1886 and the resolvable list at
 * 1256-1264):
 *   petpoojaStatus/petpoojaSyncStatus: 'accepted_unconfirmed'
 *                                      'reconciliation_required'
 *   petpoojaAmbiguousProcessing: true
 *   petpoojaAcceptedUnrecorded: true
 *   petpoojaAcceptedNoId: true with no petpoojaOrderId
 */
import {
  normalizeOrderDoc,
  petpoojaKotNeedsResolution,
  PETPOOJA_KOT_UNCONFIRMED_LABEL,
} from '../src/utils/orderContract';

function doc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ord_kot_1',
    customerId: 'cust_1',
    customerName: 'Aarav',
    branchId: 'branch_surat_01',
    items: [{ id: 'p1', name: 'Burger', price: 200, quantity: 1 }],
    subtotal: 200,
    tax: 10,
    deliveryFee: 30,
    total: 240,
    orderType: 'delivery',
    status: 'preparing',
    paymentMethod: 'razorpay',
    paymentStatus: 'completed',
    deliveryAddress: { label: 'Home', full: '12 Vesu Rd, Surat', lat: 21.15, lng: 72.77 },
    createdAt: { seconds: 1762099000, toDate: () => new Date(1762099000_000) },
    updatedAt: { seconds: 1762100000, toDate: () => new Date(1762100000_000) },
    ...overrides,
  } as any;
}

describe('ambiguous KOT states are not plain pending', () => {
  it.each([
    ['petpoojaStatus accepted_unconfirmed', { petpoojaStatus: 'accepted_unconfirmed' }],
    ['petpoojaSyncStatus reconciliation_required', { petpoojaSyncStatus: 'reconciliation_required' }],
    ['ambiguous processing flag', { petpoojaAmbiguousProcessing: true }],
    ['accepted but unrecorded', { petpoojaAcceptedUnrecorded: true }],
    ['accepted with no POS id', { petpoojaAcceptedNoId: true }],
  ])('%s is unconfirmed, never pending', (_label, shape) => {
    const order = normalizeOrderDoc('ord_kot_1', doc(shape));

    expect(order.petpoojaSyncStatus).toBe('accepted_unconfirmed');
    expect(petpoojaKotNeedsResolution(order)).toBe(true);
  });

  it('keeps the already-known states unchanged', () => {
    expect(normalizeOrderDoc('o', doc({ petpoojaSyncStatus: 'synced' })).petpoojaSyncStatus).toBe(
      'synced'
    );
    expect(normalizeOrderDoc('o', doc({ petpoojaSyncStatus: 'failed' })).petpoojaSyncStatus).toBe(
      'failed'
    );
    expect(
      normalizeOrderDoc('o', doc({ petpoojaSyncStatus: 'not_applicable' })).petpoojaSyncStatus
    ).toBe('not_applicable');
    // A genuinely-unknown/absent value stays "not pushed yet".
    expect(normalizeOrderDoc('o', doc()).petpoojaSyncStatus).toBe('pending');
  });

  it('treats a registered POS id as resolved even with a stale ack marker', () => {
    // The server refuses `retry` for a registered ticket, so the UI must not
    // offer a reconciliation prompt for it.
    const order = normalizeOrderDoc(
      'o',
      doc({ petpoojaAcceptedNoId: true, petpoojaOrderId: 'pp_kot_9' })
    );
    expect(petpoojaKotNeedsResolution(order)).toBe(false);
  });

  it('does not ask for resolution once staff printed or retried it', () => {
    expect(
      petpoojaKotNeedsResolution(
        normalizeOrderDoc(
          'o',
          doc({ petpoojaStatus: 'accepted_unconfirmed', petpoojaResolution: 'printed' })
        )
      )
    ).toBe(false);
    expect(
      petpoojaKotNeedsResolution(
        normalizeOrderDoc(
          'o',
          doc({ petpoojaStatus: 'accepted_unconfirmed', kotPrinted: true })
        )
      )
    ).toBe(false);
  });

  it('says what the state means, not "pending"', () => {
    expect(PETPOOJA_KOT_UNCONFIRMED_LABEL).toMatch(/POS unconfirmed/i);
    expect(PETPOOJA_KOT_UNCONFIRMED_LABEL).toMatch(/printer/i);
    // The badge must never read as a plain sync queue.
    expect(PETPOOJA_KOT_UNCONFIRMED_LABEL.toLowerCase()).not.toBe('pending');
  });
});
