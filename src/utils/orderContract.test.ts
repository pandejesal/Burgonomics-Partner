import { describe, it, expect } from 'vitest';
import {
  normalizeOrderDoc,
  orderDocTimeMs,
  toDeliveryStatusMeta,
  toPartnerStatus,
} from './orderContract';

describe('orderContract — Partner ↔ Delivery interop', () => {
  it('normalizes a delivery-shaped doc to Partner Order', () => {
    const order = normalizeOrderDoc('ord_1', {
      store: { id: 'str_001', name: 'Burgonomics Navrangpura', city: 'Ahmedabad' },
      status: { code: 'PREPARING', label: 'Preparing your order', kind: 'in_progress', terminal: false },
      fulfillment: 'delivery',
      items: [{ productId: 'prd_hero', name: 'Hero Burger', quantity: 2, unitPrice: 99 }],
      totals: { subtotal: 198, taxes: 10, deliveryFee: 29, grandTotal: 237 },
      address: { contactName: 'Aarav', contactPhone: '+919999999999' },
      payment: { method: 'upi', status: 'paid' },
      placedAt: '2026-09-04T10:00:00.000Z',
    });

    expect(order.branchId).toBe('str_001');
    expect(order.status).toBe('preparing');
    expect(order.orderType).toBe('delivery');
    expect(order.total).toBe(237);
    expect(order.subtotal).toBe(198);
    expect(order.customerName).toBe('Aarav');
    expect(order.paymentStatus).toBe('completed');
    expect(order.items[0]).toMatchObject({ itemId: 'prd_hero', quantity: 2, price: 99 });
  });

  it('is idempotent for partner-shaped docs', () => {
    const order = normalizeOrderDoc('ord_901', {
      customerName: 'Aarav Mehta',
      branchId: 'branch_surat_01',
      status: 'ready',
      orderType: 'takeaway',
      subtotal: 249,
      total: 261,
      items: [],
    });

    expect(order.status).toBe('ready');
    expect(order.total).toBe(261);
    expect(order.branchId).toBe('branch_surat_01');
  });

  it('maps every delivery code to a partner bucket', () => {
    expect(toPartnerStatus({ code: 'PLACED' })).toBe('pending');
    expect(toPartnerStatus({ code: 'CONFIRMED' })).toBe('accepted');
    expect(toPartnerStatus({ code: 'READY_FOR_PICKUP' })).toBe('ready');
    expect(toPartnerStatus({ code: 'OUT_FOR_DELIVERY' })).toBe('out_for_delivery');
    expect(toPartnerStatus({ code: 'DELIVERED' })).toBe('delivered');
    expect(toPartnerStatus({ code: 'CANCELLED' })).toBe('cancelled');
    expect(toPartnerStatus('preparing')).toBe('preparing');
  });

  it('keeps raw store id for unmapped stores (all-outlets only, no false branch)', () => {
    const order = normalizeOrderDoc('ord_2', {
      store: { id: 'str_012', name: 'Burgonomics Pal Road', city: 'Surat' },
      status: { code: 'PLACED' },
      totals: { grandTotal: 100 },
      items: [],
    });

    expect(order.branchId).toBe('str_012');
    expect(order.branchName).toBe('Burgonomics Pal Road');
  });

  it('reads timestamps from either app shape', () => {
    expect(orderDocTimeMs({ placedAt: '2026-09-04T10:00:00.000Z' })).toBe(
      new Date('2026-09-04T10:00:00.000Z').getTime()
    );
    expect(orderDocTimeMs({})).toBe(0);
  });

  it('quarantines unknown statuses instead of fail-open pending', () => {
    expect(toPartnerStatus('SOME_FUTURE_STATE')).toBe('quarantine');
    expect(toPartnerStatus({ code: 'WEIRD' })).toBe('quarantine');
    expect(toPartnerStatus(null)).toBe('quarantine');
    expect(toPartnerStatus('quarantine')).toBe('quarantine');

    const order = normalizeOrderDoc('ord_q', {
      store: { id: 'str_001' },
      status: { code: 'WEIRD' },
      totals: { grandTotal: 100 },
      items: [],
    });
    expect(order.status).toBe('quarantine');
    expect(order.quarantineReason).toMatch(/WEIRD/);
  });

  it('quarantines corrupt docs with a reason instead of fresh work', () => {
    const order = normalizeOrderDoc('ord_corrupt', {
      store: { id: 'str_001' },
      status: { code: 'PLACED' },
      totals: { grandTotal: 100 },
      items: 'not-a-list',
    });
    expect(order.status).toBe('quarantine');
    expect(order.quarantineReason).toMatch(/malformed items/);
    expect(order.items).toEqual([]);
  });

  it('emits delivery meta the customer app resolves', () => {    expect(toDeliveryStatusMeta('preparing')).toMatchObject({
      code: 'PREPARING',
      kind: 'in_progress',
      terminal: false,
    });
    expect(toDeliveryStatusMeta('delivered').terminal).toBe(true);
  });
});

describe('orderContract — kitchen customizations survive normalization', () => {
  it('carries modifiers onto the OrderItem so KDS cards and KOT slips can show them', () => {
    const order = normalizeOrderDoc('ord_mod_1', {
      branchId: 'branch_surat_01',
      status: 'preparing',
      items: [
        {
          itemId: 'prd_burger',
          name: 'Cheese Burst Burger',
          quantity: 1,
          price: 249,
          modifiers: ['Extra Cheese Slice', 'No Onion'],
          specialInstructions: 'Well done',
        },
      ],
    });

    expect(order.items[0].modifiers).toEqual(['Extra Cheese Slice', 'No Onion']);
    expect(order.items[0].specialInstructions).toBe('Well done');
  });

  it('reads add-ons from every key spelling either app writes', () => {
    const order = normalizeOrderDoc('ord_mod_2', {
      branchId: 'branch_surat_01',
      status: 'preparing',
      items: [
        { itemId: 'a', name: 'Fries', quantity: 1, price: 99, addons: ['Peri Peri'] },
        { itemId: 'b', name: 'Shake', quantity: 1, price: 149, customizations: ['Extra Scoop'] },
        { itemId: 'c', name: 'Momos', quantity: 1, price: 129, selectedModifiers: [{ name: 'Chilli Oil' }] },
      ],
    });

    expect(order.items[0].modifiers).toEqual(['Peri Peri']);
    expect(order.items[1].modifiers).toEqual(['Extra Scoop']);
    expect(order.items[2].modifiers).toEqual(['Chilli Oil']);
  });

  it('coerces object-shaped modifiers to labels and drops unlabelled entries', () => {
    const order = normalizeOrderDoc('ord_mod_3', {
      branchId: 'branch_surat_01',
      status: 'preparing',
      items: [
        {
          itemId: 'a',
          name: 'Burger',
          quantity: 1,
          price: 199,
          customizations: [
            { name: 'Cheese Burst', price: 30 },
            { label: 'Extra Sauce' },
            { price: 10 },
            'Grilled',
            '   ',
            42,
            null,
          ],
        },
      ],
    });

    // Every entry must be a renderable string — an object reaching JSX
    // white-screens the kitchen wall mid-rush.
    expect(order.items[0].modifiers).toEqual(['Cheese Burst', 'Extra Sauce', 'Grilled']);
    order.items[0].modifiers!.forEach((m) => expect(typeof m).toBe('string'));
  });

  it('reads the real customer-app cart shapes (optionName / CartModifier)', () => {
    const order = normalizeOrderDoc('ord_mod_real', {
      branchId: 'branch_surat_01',
      status: 'preparing',
      items: [
        {
          itemId: 'a',
          name: 'Cheese Burst Burger',
          quantity: 1,
          price: 279,
          modifiers: [
            {
              groupId: 'grp_extras',
              groupName: 'Extras',
              optionId: 'opt_cheese',
              name: 'Extra Cheese Slice',
              priceDelta: 30,
            },
          ],
          customizations: [{ groupName: 'Bun', optionName: 'Brioche Bun', price: 20 }],
        },
      ],
    });

    expect(order.items[0].modifiers).toEqual(['Extra Cheese Slice', 'Brioche Bun']);
  });

  it('omits the modifiers key entirely when a line has no customizations', () => {
    const order = normalizeOrderDoc('ord_mod_4', {
      branchId: 'branch_surat_01',
      status: 'preparing',
      items: [{ itemId: 'a', name: 'Fries', quantity: 1, price: 99 }],
    });

    expect(order.items[0].modifiers).toBeUndefined();
  });

  it('deduplicates a modifier repeated across keys', () => {
    const order = normalizeOrderDoc('ord_mod_5', {
      branchId: 'branch_surat_01',
      status: 'preparing',
      items: [
        {
          itemId: 'a',
          name: 'Burger',
          quantity: 1,
          price: 199,
          modifiers: ['Extra Cheese'],
          addons: ['Extra Cheese'],
        },
      ],
    });

    expect(order.items[0].modifiers).toEqual(['Extra Cheese']);
  });
});
