import { describe, expect, it } from 'vitest';
import { normalizeOrderDoc } from '../src/utils/orderContract';
import { toRichOrderForTest } from '../src/admin/services/adminOrdersService';

/**
 * Item 3/4 on the admin surface: the order row must mark an ambiguous KOT as
 * "Unconfirmed", never "Pending", and expose the marker the drawer prompt uses.
 * `toRichPetpooja` used to fall through to "Pending" for every unknown value, so
 * a paid order whose KOT may never have printed looked like an unpushed one.
 */
function rawOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ord_admin_kot',
    customerId: 'cust_1',
    customerName: 'Aarav',
    branchId: 'branch_surat_01',
    items: [{ id: 'p1', name: 'Burger', price: 200, quantity: 1 }],
    totals: { subtotal: 200, taxes: 10, grandTotal: 210 },
    orderType: 'delivery',
    status: 'preparing',
    paymentMethod: 'razorpay',
    paymentStatus: 'completed',
    createdAt: { seconds: 1762099000, toMillis: () => 1762099000_000 },
    updatedAt: { seconds: 1762100000, toMillis: () => 1762100000_000 },
    ...overrides,
  } as any;
}

describe('admin order row — ambiguous KOT', () => {
  it('maps the accepted-unconfirmed state to Unconfirmed and flags it', () => {
    const normalized = normalizeOrderDoc(
      'ord_admin_kot',
      rawOrder({
        petpoojaStatus: 'accepted_unconfirmed',
        petpoojaSyncStatus: 'accepted_unconfirmed',
        petpoojaAcceptedNoId: true,
      })
    );
    const rich = toRichOrderForTest('ord_admin_kot', rawOrder({
      petpoojaStatus: 'accepted_unconfirmed',
      petpoojaSyncStatus: 'accepted_unconfirmed',
      petpoojaAcceptedNoId: true,
    }));

    expect(normalized.petpoojaSyncStatus).toBe('accepted_unconfirmed');
    expect(rich.petpoojaStatus).toBe('Unconfirmed');
    expect(rich.petpoojaKotUnconfirmed).toBe(true);
  });

  it('keeps a genuinely synced order Synced with no prompt', () => {
    const rich = toRichOrderForTest(
      'ord_admin_synced',
      rawOrder({ petpoojaStatus: 'synced', petpoojaSyncStatus: 'synced', petpoojaOrderId: 'pp_1' })
    );
    expect(rich.petpoojaStatus).toBe('Synced');
    expect(rich.petpoojaKotUnconfirmed).toBe(false);
  });

  it('stops prompting once staff answered or the ticket really printed', () => {
    for (const settled of [
      { petpoojaResolution: 'printed' },
      { petpoojaResolution: 'retry' },
      { kotPrinted: true },
    ]) {
      const rich = toRichOrderForTest(
        'ord_admin_settled',
        rawOrder({
          petpoojaStatus: 'accepted_unconfirmed',
          petpoojaSyncStatus: 'accepted_unconfirmed',
          petpoojaAcceptedNoId: true,
          ...settled,
        })
      );
      expect(rich.petpoojaKotUnconfirmed).toBe(false);
    }
  });

  it('treats a registered POS id as settled even with the ack flag', () => {
    const rich = toRichOrderForTest(
      'ord_admin_registered',
      rawOrder({ petpoojaAcceptedNoId: true, petpoojaOrderId: 'pp_kot_7' })
    );
    expect(rich.petpoojaKotUnconfirmed).toBe(false);
  });
});
