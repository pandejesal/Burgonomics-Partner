/**
 * R1: the GST share contained in a GST-inclusive amount splits into CGST and
 * SGST that always add back to the tax line exactly. Odd paise used to print
 * CGST 2.38 + SGST 2.38 for a 4.77 tax, disagreeing with the tax line and the
 * server's 2.39 + 2.38.
 */
import { describe, expect, it } from 'vitest';
import {
  INITIAL_RICH_ORDERS,
  getThermalReceiptText,
  type RichOrder,
} from '../src/admin/pages/ordersData';
import { toRichOrderForTest } from '../src/admin/services/adminOrdersService';

function lineStartingWith(text: string, prefix: string): string {
  const line = text.split('\n').find((l) => l.startsWith(prefix));
  expect(line, `missing ${prefix} line`).toBeTruthy();
  return line as string;
}

/** Amount after the first ₹ on the receipt line. */
function amountOn(line: string): number {
  return Number(line.split('₹')[1]);
}

describe('Thermal receipt coupon line (c9)', () => {
  const base = INITIAL_RICH_ORDERS[0];

  function amountFor(text: string, prefix: RegExp): number {
    const line = text.split('\n').find((l) => prefix.test(l));
    expect(line, `missing ${prefix} line`).toBeTruthy();
    return Number(line!.split('₹')[1]);
  }

  /** Sum EVERY printed totals row, including CGST/SGST, without item rows. */
  function printedTotalsSum(text: string): number {
    const lines = text.split('\n');
    const start = lines.findIndex((l) => /^SUBTOTAL/.test(l));
    const end = lines.findIndex((l) => /^GRAND TOTAL/.test(l));
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return lines
      .slice(start, end)
      .filter((l) => l.includes('₹'))
      .reduce((sum, l) => sum + Number(l.split('₹')[1]), 0);
  }

  function rawCouponOrder(overrides: Record<string, unknown> = {}) {
    return {
      id: 'ord_receipt_coupon',
      customerId: 'cust_1',
      customerName: 'Aarav',
      branchId: 'branch_surat_01',
      items: [{ id: 'p1', name: 'Burger', price: 1000, quantity: 1 }],
      totals: {
        subtotal: 1000,
        itemDiscount: 0,
        promoDiscount: 100,
        discount: 100,
        taxes: 0,
        tax: 0,
        deliveryFee: 50,
        deliveryCharge: 50,
        packingFee: 25,
        packagingCharge: 25,
        grandTotal: 975,
      },
      promo: { code: 'SAVE10', discount: 100 },
      orderType: 'delivery',
      status: 'preparing',
      paymentMethod: 'razorpay',
      paymentStatus: 'completed',
      createdAt: { seconds: 1762099000, toMillis: () => 1762099000_000 },
      ...overrides,
    } as any;
  }

  it('maps the live server promo and prints its code; every totals row reconciles', () => {
    const order = toRichOrderForTest('ord_receipt_coupon', rawCouponOrder());
    const text = getThermalReceiptText(order, 'INVOICE');
    expect(order.promo).toMatchObject({ code: 'SAVE10', discount: 100 });
    expect(text).toMatch(/COUPON DISCOUNT \(SAVE10\)/i);
    expect(amountFor(text, /COUPON DISCOUNT/i)).toBe(-100);
    expect(printedTotalsSum(text)).toBe(amountFor(text, /^GRAND TOTAL/));
  });

  it('uses the server promo.discount fallback when totals.promoDiscount is absent', () => {
    const raw = rawCouponOrder({
      totals: {
        ...rawCouponOrder().totals,
        promoDiscount: 0,
        discount: 0,
        deliveryFee: 0,
        deliveryCharge: 0,
        packingFee: 0,
        packagingCharge: 0,
        grandTotal: 900,
      },
    });
    const order = toRichOrderForTest('ord_receipt_coupon', raw);
    const text = getThermalReceiptText(order, 'INVOICE');
    expect(text).toMatch(/COUPON DISCOUNT \(SAVE10\)/i);
    expect(amountFor(text, /COUPON DISCOUNT/i)).toBe(-100);
    expect(printedTotalsSum(text)).toBe(amountFor(text, /^GRAND TOTAL/));
  });

  it('hides the coupon line when there is no coupon and still reconciles an item discount', () => {
    const order: RichOrder = {
      ...base,
      promo: null,
      totals: {
        ...base.totals,
        subtotal: 1000,
        itemDiscount: 100,
        promoDiscount: 0,
        discount: 100,
        tax: 0,
        taxes: 0,
        deliveryFee: 0,
        deliveryCharge: 0,
        packingFee: 0,
        packagingCharge: 0,
        grandTotal: 900,
      },
    };
    const text = getThermalReceiptText(order, 'INVOICE');
    expect(text).not.toMatch(/COUPON DISCOUNT/i);
    expect(amountFor(text, /^ITEM DISCOUNT/)).toBe(-100);
    expect(printedTotalsSum(text)).toBe(amountFor(text, /^GRAND TOTAL/));
  });
});

describe('Thermal receipt GST split (R1)', () => {
  it('splits an odd-paise tax exactly: 4.77 -> CGST 2.39 + SGST 2.38', () => {
    const base = INITIAL_RICH_ORDERS[0];
    const order: RichOrder = {
      ...base,
      totals: { ...base.totals, tax: 4.77, taxes: 4.77 },
    };

    const text = getThermalReceiptText(order, 'TAX_RECEIPT');
    const cgst = amountOn(lineStartingWith(text, 'CGST'));
    const sgst = amountOn(lineStartingWith(text, 'SGST'));

    expect(cgst).toBe(2.39);
    expect(sgst).toBe(2.38);
    // The halves re-add to the tax line exactly (never 2.38 + 2.38 = 4.76).
    expect(Math.round((cgst + sgst) * 100)).toBe(477);
  });
});
