import { describe, expect, it, vi } from 'vitest';

/**
 * F6 r2 / MEDIUM finding 3 — 58 mm paper is 32 columns.
 *
 * The receipt formatter wrote fixed 42-character separators and 22/24-character
 * label columns, so on a 32-column roll every separator wrapped onto a second
 * line, item names split mid-token, and the totals rows wrapped the amount away
 * from its label. Setting `@page { size: 58mm }` only sizes the PAGE — it does
 * not reflow the text. The formatter now takes the paper width and every line it
 * emits fits that width.
 *
 * The strict assertion is "every line <= 32 columns", which is what a thermal
 * roll does: anything longer hard-wraps at the printer's own column, not ours.
 */

vi.mock('@/features/orders/models', async (importOriginal) => await importOriginal<any>());

import {
  INITIAL_RICH_ORDERS,
  getThermalReceiptText,
  type RichOrder,
} from '../src/admin/pages/ordersData';
import { SLIP_COLUMNS } from '../src/utils/printDocument';

const WIDTH_58 = SLIP_COLUMNS['58mm'];
const WIDTH_80 = SLIP_COLUMNS['80mm'];
const RUPEE = String.fromCharCode(8377);

/** A receipt with the worst realistic content: long names, long notes, GPay. */
function worstCaseOrder(): RichOrder {
  const base = INITIAL_RICH_ORDERS[0];
  return {
    ...base,
    id: 'ord_r2_very_long_identifier_0001',
    store: {
      ...base.store,
      name: 'Burgonomics Ahmedabad SG Highway Flagship Outlet',
      address: 'Ground Floor, Titanium Square, Thaltej, Ahmedabad, Gujarat 380054',
      phone: '+91 98765 43211',
    },
    notes: 'Please make it extra spicy and avoid onions if possible, ring the bell twice.',
    address: {
      ...(base.address as any),
      contactName: 'Aarav Mehta (4th floor, dial 402 on the intercom)',
      contactPhone: '+91 98112 00392',
    },
    items: [
      {
        name: 'Double Cheese Chicken Burger with Extra Jalapenos',
        quantity: 2,
        price: 249.5,
        modifiers: ['No onion', 'Extra cheese', 'Less spice please'],
        notes: 'No mayo at all, the customer is allergic',
        customizations: [{ name: 'Extra Scoop of Vanilla', price: 40 }],
      },
    ],
    totals: {
      ...base.totals,
      subtotal: 499,
      itemDiscount: 20,
      promoDiscount: 100,
      tax: 4.77,
      deliveryCharge: 45,
      packagingCharge: 25,
      grandTotal: 451.77,
    },
    promo: { code: 'SAVE10LONGCODE' },
    payment: {
      method: 'online',
      label: 'UPI - Google Pay (GPay)',
      transactionId: 'pay_r2_1234567890abcdef',
    } as any,
  } as RichOrder;
}

function longestLine(text: string): { line: string; length: number } {
  let worst = { line: '', length: 0 };
  for (const line of text.split('\n')) {
    if (line.length > worst.length) worst = { line, length: line.length };
  }
  return worst;
}

describe('58 mm receipts fit a 32-column roll (r2 finding 3)', () => {
  const order = worstCaseOrder();

  it.each(['KOT', 'INVOICE', 'TAX_RECEIPT'] as const)(
    '%s: every printed line is at most 32 columns',
    (type) => {
      const text = getThermalReceiptText(order, type, WIDTH_58);
      const worst = longestLine(text);
      expect(
        worst.length,
        `line overflows a 58mm roll (${worst.length} > ${WIDTH_58}): ${JSON.stringify(worst.line)}`,
      ).toBeLessThanOrEqual(WIDTH_58);
    },
  );

  it('separators are exactly the paper width, not a fixed 42 characters', () => {
    const text = getThermalReceiptText(order, 'INVOICE', WIDTH_58);
    expect(text).not.toContain('-'.repeat(42));
    const separators = text.split('\n').filter((line) => /^-+$/.test(line));
    expect(separators.length).toBeGreaterThan(0);
    for (const separator of separators) expect(separator).toHaveLength(WIDTH_58);
  });

  it('the money rows still reconcile on a narrow roll', () => {
    const text = getThermalReceiptText(order, 'TAX_RECEIPT', WIDTH_58);
    const amountFor = (prefix: RegExp): number => {
      const lines = text.split('\n');
      const index = lines.findIndex((line) => prefix.test(line));
      expect(index, `missing ${prefix}`).toBeGreaterThan(-1);
      // The amount may sit on the line after a long label; join the pair and
      // take the FIRST rupee amount only — the joined neighbour is another
      // money row with its own ₹, so a bare `split(RUPEE)[1]` reads a label.
      const joined = lines.slice(index, index + 2).join(' ');
      const match = joined.match(
        new RegExp(`${RUPEE}\\s*(?:-)?[0-9]+(?:\\.[0-9]+)?`),
      );
      expect(match, `no ₹ amount after ${prefix}`).toBeTruthy();
      return Number(match![0].replace(RUPEE, '').trim());
    };

    expect(amountFor(/^SUBTOTAL/)).toBe(499);
    expect(amountFor(/^GRAND TOTAL/)).toBe(451.77);
    expect(amountFor(/^CGST/)).toBe(2.39);
    expect(amountFor(/^SGST/)).toBe(2.38);
  });

  it('keeps the coupon code visible instead of clipping the label', () => {
    const text = getThermalReceiptText(order, 'TAX_RECEIPT', WIDTH_58);
    expect(text).toContain('COUPON DISCOUNT (SAVE10LONGCODE)');
  });

  it('a wide roll gets the wider layout back (no regression for 80 mm)', () => {
    const text = getThermalReceiptText(order, 'INVOICE', WIDTH_80);
    const separators = text.split('\n').filter((line) => /^-+$/.test(line));
    expect(separators.length).toBeGreaterThan(0);
    for (const separator of separators) expect(separator).toHaveLength(WIDTH_80);
    expect(longestLine(text).length).toBeLessThanOrEqual(WIDTH_80);
  });

  it('defaults to the 80 mm document width so the on-screen slip is unchanged', () => {
    // r2: the on-screen <pre> passes the configured paper width explicitly; the
    // default stays the 48-column 80 mm layout, so no screen changes shape.
    const text = getThermalReceiptText(order, 'INVOICE');
    const separators = text.split('\n').filter((line) => /^-+$/.test(line));
    expect(separators.length).toBeGreaterThan(0);
    for (const separator of separators) expect(separator).toHaveLength(WIDTH_80);
    expect(longestLine(text).length).toBeLessThanOrEqual(WIDTH_80);
  });
});
