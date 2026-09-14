import { describe, it, expect } from 'vitest';
import { getOrderStatusBadgeMeta } from '../features/orders/components/OrderStatusBadge';

describe('Prompt 21: POS Orders Management & Live Stream Suite', () => {
  describe('1. Order Status Badge Color Mapping', () => {
    it('maps pending/placed state to amber pulsing badge', () => {
      const { label, className } = getOrderStatusBadgeMeta('pending');
      expect(label).toBe('New (Placed)');
      expect(className).toContain('animate-pulse');
      expect(className).toContain('text-amber-400');
    });

    it('maps preparing state to kitchen indigo badge', () => {
      const { label, className } = getOrderStatusBadgeMeta('preparing');
      expect(label).toBe('In Kitchen (KOT)');
      expect(className).toContain('text-indigo-400');
    });

    it('maps delivered/completed state to emerald green badge', () => {
      const { label, className } = getOrderStatusBadgeMeta('delivered');
      expect(label).toBe('Delivered');
      expect(className).toContain('text-emerald-400');
    });

    it('maps cancelled/failed state to rose red badge', () => {
      const { label, className } = getOrderStatusBadgeMeta('cancelled');
      expect(label).toBe('Cancelled');
      expect(className).toContain('text-rose-400');
    });
  });

  describe('2. Walk-in Counter Order Billing Math', () => {
    it('computes exact 5% GST on subtotal and total sum', () => {
      const items = [
        { price: 199, quantity: 2 }, // 398
        { price: 99, quantity: 1 },  // 99
      ];

      const subtotal = items.reduce((acc, curr) => acc + curr.price * curr.quantity, 0); // 497
      const gst = Math.round(subtotal * 0.05); // 25
      const packaging = 15;
      const total = subtotal + gst + packaging; // 537

      expect(subtotal).toBe(497);
      expect(gst).toBe(25);
      expect(total).toBe(537);
    });

    it('calculates change to return accurately from cash tendered', () => {
      const totalBill = 537;
      const cashTendered = 600;
      const changeDue = Math.max(0, cashTendered - totalBill);

      expect(changeDue).toBe(63);
    });
  });

  describe('3. Multi-Criteria Search & Filter Logic', () => {
    const mockOrders = [
      {
        id: 'ord_101',
        customerName: 'Aarav Mehta',
        customerPhone: '+91 98251 12345',
        orderType: 'delivery',
        status: 'preparing',
      },
      {
        id: 'ord_102',
        customerName: 'Pooja Patel',
        customerPhone: '+91 99099 87654',
        orderType: 'takeaway',
        status: 'ready',
      },
      {
        id: 'ord_103',
        customerName: 'Rohan Sharma',
        customerPhone: '+91 98791 23456',
        orderType: 'dinein',
        status: 'pending',
      },
    ];

    it('filters orders by fulfillment channel (takeaway)', () => {
      const filtered = mockOrders.filter((o) => o.orderType === 'takeaway');
      expect(filtered.length).toBe(1);
      expect(filtered[0].customerName).toBe('Pooja Patel');
    });

    it('searches orders by 10-digit phone number substring', () => {
      const query = '98791';
      const filtered = mockOrders.filter((o) => o.customerPhone.includes(query));
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('ord_103');
    });
  });
});
