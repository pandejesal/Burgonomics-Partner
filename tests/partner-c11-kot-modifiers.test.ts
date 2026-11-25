import { describe, expect, it, vi } from 'vitest';

/**
 * F6 / A7 #6 — the Control Room printed KOT must not drop per-item add-ons or
 * line notes.
 *
 * The audited defect: `getThermalReceiptText`'s KOT branch read only
 * `item.customizations`, and `toCartLines` always wrote `modifiers: []` while
 * keeping the line note on a field the formatter never printed. So an order
 * line carrying `modifiers: ["No onion"]` (the shape the customer app writes)
 * or `notes: "No mayo"` printed as a bare item name, the kitchen made it with
 * onion and mayo, and the remake was a write-off.
 */

vi.mock('@/features/orders/models', async (importOriginal) => await importOriginal<any>());

import { getThermalReceiptText } from '../src/admin/pages/ordersData';

type AnyOrder = Parameters<typeof getThermalReceiptText>[0];

function order(overrides: Record<string, unknown> = {}): AnyOrder {
  return {
    id: 'ord_8841',
    shortCode: 'BG-8841',
    fulfillment: 'delivery',
    placedAt: new Date('2026-11-25T19:10:00+05:30').toISOString(),
    orderStatus: 'Accepted',
    paymentStatus: 'Paid',
    petpoojaStatus: 'Pending',
    store: { id: 'branch_a', name: 'Surat Adajan', address: '', phone: '' },
    address: {},
    items: [],
    totals: { subtotal: 0, grandTotal: 100, tax: 0, deliveryCharge: 0, packagingCharge: 0, discount: 0 },
    payment: { method: 'online', label: 'Online' },
    timeline: [],
    ...overrides,
  } as unknown as AnyOrder;
}

describe('A7 #6 — a printed KOT carries add-ons and line notes', () => {
  it('prints modifiers written as plain strings (the customer-app shape)', () => {
    const text = getThermalReceiptText(
      order({
        items: [
          { name: 'Chicken Burger', quantity: 2, price: 249, modifiers: ['No onion', 'Extra cheese'] },
        ],
      }),
      'KOT',
    );

    expect(text).toContain('2     CHICKEN BURGER');
    expect(text).toContain('>> NO ONION');
    expect(text).toContain('>> EXTRA CHEESE');
  });

  it('prints add-ons written as `{ name }` objects without printing [object Object]', () => {
    const text = getThermalReceiptText(
      order({
        items: [
          {
            name: 'Paneer Tikka',
            quantity: 1,
            price: 259,
            modifiers: [{ name: 'Extra Raita', price: 30 }, { optionName: 'Less Spice' }],
          },
        ],
      }),
      'KOT',
    );

    expect(text).toContain('>> EXTRA RAITA');
    expect(text).toContain('>> LESS SPICE');
    expect(text).not.toContain('[object Object]');
  });

  it('still prints legacy `customizations` (the shape the old code read)', () => {
    const text = getThermalReceiptText(
      order({
        items: [
          { name: 'Shake', quantity: 1, price: 149, customizations: [{ name: 'Extra Scoop', price: 40 }] },
        ],
      }),
      'KOT',
    );

    expect(text).toContain('>> EXTRA SCOOP');
  });

  it('prints the per-line kitchen note under its own item', () => {
    const text = getThermalReceiptText(
      order({
        items: [
          { name: 'Chicken Burger', quantity: 1, price: 249, notes: 'No mayo' },
        ],
      }),
      'KOT',
    );

    expect(text).toContain('* NO MAYO');
  });

  it('reads `specialInstructions` when a line uses that spelling', () => {
    const text = getThermalReceiptText(
      order({
        items: [
          { name: 'Fries', quantity: 1, price: 99, specialInstructions: 'Extra salty' },
        ],
      }),
      'KOT',
    );

    expect(text).toContain('* EXTRA SALTY');
  });

  it('prints nothing extra for a line with no add-ons or notes', () => {
    const text = getThermalReceiptText(
      order({ items: [{ name: 'Fries', quantity: 1, price: 99 }] }),
      'KOT',
    );

    expect(text).toContain('1     FRIES');
    expect(text).not.toContain('>>');
    expect(text).not.toContain('* ');
  });

  it('does not let a blank or missing note print an empty marker line', () => {
    const text = getThermalReceiptText(
      order({ items: [{ name: 'Fries', quantity: 1, price: 99, notes: '   ', specialInstructions: undefined }] }),
      'KOT',
    );

    expect(text).not.toMatch(/\*\s*\n/);
  });

  it('carries line notes into an invoice line too (staff read the same slip)', () => {
    const text = getThermalReceiptText(
      order({ items: [{ name: 'Chicken Burger', quantity: 1, price: 249, notes: 'No mayo' }] }),
      'INVOICE',
    );

    // The invoice is a money document: the note must not invent a charge line.
    expect(text).toContain('PAYMENT METHOD');
    expect(text).not.toContain('* NO MAYO');
  });
});
