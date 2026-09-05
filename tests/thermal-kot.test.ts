import { describe, it, expect } from 'vitest';

// These tests import the REAL receipt formatter. The previous file defined a
// local format80mmThermalKot with different headers/totals layout — a GST or
// total regression in production could never fail it.
import {
  formatOrderForKOT,
  generateASCIIReceipt,
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
});
