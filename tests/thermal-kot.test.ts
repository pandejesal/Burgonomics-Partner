import { describe, it, expect } from 'vitest';

// These tests import the REAL receipt formatter. The previous file defined a
// local format80mmThermalKot with different headers/totals layout — a GST or
// total regression in production could never fail it.
import {
  formatOrderForKOT,
  generateASCIIReceipt,
  generateESCPOSBuffer,
  generateQRCodeBlock,
} from '../src/features/orders/services/thermalPrinterService';
import type { Order } from '../src/types';

const sampleOrder = {
  id: 'ord_detail_8841',
  orderType: 'delivery',
  branchName: 'Surat Adajan',
  customerName: 'Aarav Patel',
  customerPhone: '+919876543210',
  items: [
    {
      itemId: 'item_1',
      name: 'Double Truffle Melt',
      quantity: 2,
      price: 299,
      modifiers: ['Extra Cheese Slice'],
      specialInstructions: 'Extra crispy patties',
    },
    { itemId: 'item_2', name: 'Peri Peri Loaded Fries', quantity: 1, price: 149 },
  ],
  subtotal: 747,
  tax: 37,
  total: 784,
  createdAt: { toDate: () => new Date('2026-09-05T12:00:00+05:30') },
} as unknown as Order;

describe('Partner POS — 80mm Thermal KOT Printing Suite (real formatter)', () => {
  it('derives the short code, items, modifiers, and notes from the order', () => {
    const kot = formatOrderForKOT(sampleOrder);
    expect(kot.shortCode).toBe('#8841');
    expect(kot.items).toHaveLength(2);
    expect(kot.items[0].modifiers).toContain('Extra Cheese Slice');
    expect(kot.items[0].specialInstructions).toBe('Extra crispy patties');
    expect(kot.total).toBe(784);
  });

  it('renders an ASCII slip with header, lines, and grand total', () => {
    const slip = generateASCIIReceipt(formatOrderForKOT(sampleOrder));
    expect(slip).toContain('BURGONOMICS KOT');
    expect(slip).toContain('#8841');
    expect(slip).toContain('Double Truffle Melt');
    expect(slip).toContain('2x');
    expect(slip).toContain('598'); // 2 × 299 line total
    expect(slip).toContain('Extra Cheese Slice');
  });

  it('prints the grand total and the special-instructions note', () => {
    const slip = generateASCIIReceipt(formatOrderForKOT(sampleOrder));
    expect(slip).toContain('Total Amount: ₹784');
    expect(slip).toContain('* Note: Extra crispy patties');
    expect(slip).toContain('*** KITCHEN COPY ***');
  });

  it('formats the default 80mm slip on a 48-column grid', () => {
    const slip = generateASCIIReceipt(formatOrderForKOT(sampleOrder));
    const lines = slip.split('\n');

    const dividers = lines.filter((line) => /^=+$/.test(line));
    const subDividers = lines.filter((line) => /^-+$/.test(line));

    expect(lines).toContain('='.repeat(48));
    expect(lines).toContain('-'.repeat(48));
    expect(dividers.length).toBeGreaterThan(0);
    expect(subDividers.length).toBeGreaterThan(0);
    dividers.forEach((line) => expect(line).toHaveLength(48));
    subDividers.forEach((line) => expect(line).toHaveLength(48));

    // Item, modifier and note lines survive the 48-column reflow.
    expect(slip).toContain('2x   Double Truffle Melt');
    expect(slip).toContain('₹598');
    expect(slip).toContain('- Extra Cheese Slice');
  });

  it('narrows the slip to a 32-column grid for 58mm paper', () => {
    const slip = generateASCIIReceipt(formatOrderForKOT(sampleOrder), 32);
    const lines = slip.split('\n');

    expect(lines).toContain('='.repeat(32));
    expect(lines).toContain('-'.repeat(32));
    lines
      .filter((line) => /^=+$/.test(line))
      .forEach((line) => expect(line).toHaveLength(32));
    lines
      .filter((line) => /^-+$/.test(line))
      .forEach((line) => expect(line).toHaveLength(32));

    // Content is still complete at the narrower width.
    expect(slip).toContain('BURGONOMICS KOT');
    expect(slip).toContain('Total Amount: ₹784');
    expect(slip).toContain('*** KITCHEN COPY ***');
  });

  it('builds a non-empty ESC/POS buffer with the standard command bytes', () => {
    const buffer = generateESCPOSBuffer(formatOrderForKOT(sampleOrder));

    expect(buffer).toBeInstanceOf(Uint8Array);
    expect(buffer.length).toBeGreaterThan(0);

    expect(Array.from(buffer.slice(0, 2))).toEqual([0x1b, 0x40]); // ESC @
    expect(Array.from(buffer.slice(2, 5))).toEqual([0x1b, 0x61, 0x01]); // ESC a 1
    expect(Array.from(buffer.slice(-4))).toEqual([0x1d, 0x56, 0x41, 0x00]); // GS V 65 0

    const payload = new TextDecoder().decode(buffer);
    expect(payload).toContain('BURGONOMICS KOT');
    expect(payload).toContain('Total Amount: ₹784');
    expect(payload).toContain('*** KITCHEN COPY ***');
  });

  it('formats 48 columns by default and 32 columns for 58mm', () => {
    const slip48 = generateASCIIReceipt(formatOrderForKOT(sampleOrder), 48);
    expect(slip48.split('\n')[0]).toBe('='.repeat(48));

    const slip32 = generateASCIIReceipt(formatOrderForKOT(sampleOrder), 32);
    expect(slip32.split('\n')[0]).toBe('='.repeat(32));
  });

  it('generates binary ESC/POS command buffer', () => {
    const buf = generateESCPOSBuffer(formatOrderForKOT(sampleOrder));

    expect(buf).toBeInstanceOf(Uint8Array);
    expect(buf.length).toBeGreaterThan(50);
    expect(buf[0]).toBe(0x1b); // ESC
    expect(buf[1]).toBe(0x40); // @
  });
});

describe('80mm Thermal KOT — hardening (footer, reflow, crash-proofing, QR)', () => {
  const deliveryOrder = {
    ...sampleOrder,
    customerName: 'Aarav Patel',
    customerPhone: '+919876543210',
    deliveryAddress: { full: 'B-402 Silver Heights, Adajan Gam, Surat 395009' },
  } as unknown as Order;

  it('prints customer contact and delivery address in the footer', () => {
    const kot = formatOrderForKOT(deliveryOrder);
    const slip = generateASCIIReceipt(kot);
    expect(kot.customerName).toBe('Aarav Patel');
    expect(kot.customerPhone).toBe('+919876543210');
    expect(kot.deliveryAddress).toContain('B-402 Silver Heights');
    expect(slip).toContain('Customer: Aarav Patel');
    expect(slip).toContain('+919876543210');
    expect(slip).toContain('Address:  B-402 Silver Heights,');
  });

  it('prints the table number for dine-in orders', () => {
    const dineIn = { ...sampleOrder, orderType: 'dinein', tableNumber: 'T-07' } as unknown as Order;
    const slip = generateASCIIReceipt(formatOrderForKOT(dineIn));
    expect(slip).toContain('Table:    T-07');
    expect(slip).toContain('(Table: T-07)');
  });

  it('reflows every line inside the 32-column 58mm grid (no overflow)', () => {
    const longOrder = {
      ...sampleOrder,
      deliveryAddress: {
        full: 'B-402 Silver Heights Apartment Complex, Adajan Gam, Near Hanuman Temple, Surat 395009',
      },
      items: [
        {
          itemId: 'item_1',
          name: 'Double Truffle Melt with an Extraordinarily Long Descriptive Burger Name',
          quantity: 2,
          price: 299,
          modifiers: ['No Onion With A Very Long Modifier Description That Would Overflow 58mm Paper'],
          specialInstructions: 'Extra crispy patties and absolutely no tomato — allergy alert for this customer',
        },
      ],
    } as unknown as Order;

    const kot = formatOrderForKOT(longOrder);
    for (const slip of [generateASCIIReceipt(kot, 48), generateASCIIReceipt(kot, 32)]) {
      // First line is the divider — its length IS the paper width (a 48-char
      // divider also *starts with* 32 '=' chars, so startsWith can't detect it).
      const width = slip.split('\n')[0].length;
      expect([32, 48]).toContain(width);
      for (const line of slip.split('\n')) {
        expect(line.length).toBeLessThanOrEqual(width);
      }
    }
  });

  it('never throws on a malformed order doc (missing orderType/createdAt/items)', () => {
    const malformed = { id: 'ord_broken_77' } as unknown as Order;
    const kot = formatOrderForKOT(malformed);
    expect(kot.shortCode).toBe('#77');
    expect(kot.orderType).toBe('PICKUP');
    expect(kot.items).toEqual([]);
    expect(() => generateASCIIReceipt(kot)).not.toThrow();
    expect(() => generateESCPOSBuffer(kot)).not.toThrow();
  });

  it('falls back to `fulfillment` when orderType is absent (Delivery docs)', () => {
    const aliased = { id: 'ord_alias_1', fulfillment: 'delivery' } as unknown as Order;
    expect(formatOrderForKOT(aliased).orderType).toBe('DELIVERY');
  });

  it('appends a scannable QR block before the cut, and honours includeQR=false', () => {
    const kot = formatOrderForKOT(sampleOrder);
    const withQR = generateESCPOSBuffer(kot);
    const payload = new TextDecoder().decode(withQR);
    expect(payload).toContain('BURGONOMICS KOT');
    // GS ( k QR preamble (function 165: model 2) present, cut still last
    expect(Array.from(withQR.slice(-4))).toEqual([0x1d, 0x56, 0x41, 0x00]);
    const qrIdx = Array.from(withQR).findIndex(
      (_b, i) =>
        withQR[i] === 0x1d && withQR[i + 1] === 0x28 && withQR[i + 2] === 0x6b && withQR[i + 5] === 0x31
    );
    expect(qrIdx).toBeGreaterThan(-1);

    const noQR = generateESCPOSBuffer(kot, 48, false);
    expect(Array.from(noQR.slice(-4))).toEqual([0x1d, 0x56, 0x41, 0x00]);
    expect(noQR.length).toBeLessThan(withQR.length);
  });

  it('builds a standalone QR block for an order id and degrades safely on junk', () => {
    const block = generateQRCodeBlock('ord_detail_8841');
    expect(block).toBeInstanceOf(Uint8Array);
    expect(block.length).toBeGreaterThan(0);
    // Empty/oversized payloads produce NO block instead of a malformed one
    expect(generateQRCodeBlock('').length).toBe(0);
    expect(generateQRCodeBlock('x'.repeat(8000)).length).toBe(0);
  });

  it('keeps the 58mm ESC/POS buffer printable at 32 columns', () => {
    const kot = formatOrderForKOT(sampleOrder);
    const buf58 = generateESCPOSBuffer(kot, 32);
    expect(Array.from(buf58.slice(0, 2))).toEqual([0x1b, 0x40]);
    expect(Array.from(buf58.slice(-4))).toEqual([0x1d, 0x56, 0x41, 0x00]);
    const text = new TextDecoder().decode(buf58);
    expect(text).toContain('='.repeat(32));
  });
});

describe('KOT — modifier shapes from either app never break the slip', () => {
  it('collapses object-shaped add-ons to labels instead of printing [object Object]', () => {
    const order = {
      id: 'ord_shape_1',
      orderType: 'delivery',
      branchName: 'Surat Adajan',
      items: [
        {
          itemId: 'item_1',
          name: 'Cheese Burst Burger',
          quantity: 1,
          price: 249,
          customizations: [
            { name: 'Extra Cheese Slice', price: 30 },
            { label: 'Extra Sauce' },
            'Grilled',
          ],
        },
      ],
      total: 249,
      createdAt: { toDate: () => new Date('2026-09-05T12:00:00+05:30') },
    } as unknown as Order;

    const kot = formatOrderForKOT(order);
    expect(kot.items[0].modifiers).toEqual(['Extra Cheese Slice', 'Extra Sauce', 'Grilled']);

    const slip = generateASCIIReceipt(kot);
    expect(slip).toContain('- Extra Cheese Slice');
    expect(slip).not.toContain('[object Object]');
    expect(() => generateESCPOSBuffer(kot)).not.toThrow();
  });

  it('skips unlabelled add-on entries rather than printing junk lines', () => {
    const order = {
      id: 'ord_shape_2',
      orderType: 'takeaway',
      branchName: 'Surat Adajan',
      items: [
        {
          itemId: 'item_1',
          name: 'Fries',
          quantity: 1,
          price: 99,
          modifiers: ['', '   ', { price: 10 }, null, 'Peri Peri'],
        },
      ],
      total: 99,
    } as unknown as Order;

    const kot = formatOrderForKOT(order);
    expect(kot.items[0].modifiers).toEqual(['Peri Peri']);
    expect(generateASCIIReceipt(kot)).toContain('- Peri Peri');
  });
});
