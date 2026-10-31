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

function lineStartingWith(text: string, prefix: string): string {
  const line = text.split('\n').find((l) => l.startsWith(prefix));
  expect(line, `missing ${prefix} line`).toBeTruthy();
  return line as string;
}

/** Amount after the first ₹ on the receipt line. */
function amountOn(line: string): number {
  return Number(line.split('₹')[1]);
}

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
