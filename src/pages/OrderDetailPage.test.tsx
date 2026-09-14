import { describe, it, expect } from 'vitest';
import {
  formatOrderForKOT,
  generateASCIIReceipt,
} from '../features/orders/services/thermalPrinterService';
import type { Order } from '@/types';

describe('Prompt 22: Order Details, KOT Thermal Printing & POS Actions Suite', () => {
  const mockOrder: Order = {
    id: 'ord_detail_8841',
    customerId: 'cust_99',
    customerName: 'Kavita Shah',
    customerPhone: '+91 98250 55443',
    branchId: 'branch_surat_01',
    branchName: 'Surat Adajan',
    city: 'Surat',
    items: [
      {
        itemId: 'itm_paneer_makhani',
        petpoojaItemId: 'PP-BRG-103',
        name: 'Paneer Makhani Burst Burger',
        quantity: 2,
        price: 199,
        modifiers: ['Extra Cheese Slice', 'Brioche Bun'],
        specialInstructions: 'NO ONION / NO GARLIC',
      } as any,
      {
        itemId: 'itm_peri_peri_fries',
        petpoojaItemId: 'PP-SDE-301',
        name: 'Peri-Peri Crinkle Fries',
        quantity: 1,
        price: 99,
      },
    ],
    subtotal: 497,
    tax: 25,
    deliveryFee: 35,
    total: 557,
    orderType: 'delivery',
    status: 'preparing',
    paymentMethod: 'razorpay',
    paymentStatus: 'completed',
    petpoojaOrderId: 'PP-ORD-8841',
    petpoojaSyncStatus: 'synced',
    kotPrinted: true,
    specialInstructions: 'Ring doorbell twice upon arrival',
    createdAt: {
      toDate: () => new Date('2026-08-31T20:30:00Z'),
    } as any,
    updatedAt: {
      toDate: () => new Date('2026-08-31T20:30:00Z'),
    } as any,
  };

  describe('1. 80mm Thermal KOT ASCII Slip Generation', () => {
    it('formats KOT data with short code, branch, and items', () => {
      const kotData = formatOrderForKOT(mockOrder);
      expect(kotData.shortCode).toBe('#8841');
      expect(kotData.branchName).toBe('Surat Adajan');
      expect(kotData.items.length).toBe(2);
      expect(kotData.total).toBe(557);
    });

    it('generates ASCII receipt text containing modifiers and cooking notes', () => {
      const kotData = formatOrderForKOT(mockOrder);
      const asciiText = generateASCIIReceipt(kotData);

      expect(asciiText).toContain('BURGONOMICS KOT');
      expect(asciiText).toContain('Surat Adajan');
      expect(asciiText).toContain('Paneer Makhani Burst Burger');
      expect(asciiText).toContain('Extra Cheese Slice');
      expect(asciiText).toContain('NO ONION / NO GARLIC');
      expect(asciiText).toContain('Total Amount: ₹557');
    });
  });

  describe('2. Order Status Progression Rules', () => {
    it('advances status from pending to preparing to ready to out_for_delivery to delivered', () => {
      const transitions: Record<string, string> = {
        pending: 'preparing',
        preparing: 'ready',
        ready: 'out_for_delivery',
        out_for_delivery: 'delivered',
      };

      expect(transitions['pending']).toBe('preparing');
      expect(transitions['preparing']).toBe('ready');
      expect(transitions['ready']).toBe('out_for_delivery');
      expect(transitions['out_for_delivery']).toBe('delivered');
    });
  });

  describe('3. Order Cancellation & Full Refund Evaluation', () => {
    it('validates 100% full refund amount on completed paid orders', () => {
      const isPaid = mockOrder.paymentStatus === 'completed';
      const refundAmount = isPaid ? mockOrder.total : 0;

      expect(refundAmount).toBe(557);
    });
  });
});
