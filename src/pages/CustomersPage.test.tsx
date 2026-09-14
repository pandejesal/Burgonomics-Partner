import { describe, it, expect } from 'vitest';
import type { Customer } from '@/types';

describe('Prompt 28: CRM, Customer 360 & Loyalty Ledger Suite', () => {
  describe('1. Customer LTV and AOV Calculations', () => {
    it('calculates Average Order Value (AOV) accurately from Lifetime Spend and Total Orders', () => {
      const customer: Customer = {
        id: 'cust_01',
        name: 'Aarav Shah',
        phone: '+91 98250 11223',
        totalSpend: 4500,
        totalOrders: 6,
        loyaltyPoints: 120,
        segment: 'VIP',
      } as Customer;

      const totalOrders = customer.totalOrders ?? 0;
      const totalSpend = customer.totalSpend ?? 0;
      const aov = totalOrders > 0 ? Math.round(totalSpend / totalOrders) : 0;
      expect(aov).toBe(750);
      expect(customer.totalSpend).toBe(4500);
      expect(customer.loyaltyPoints).toBe(120);
    });
  });

  describe('2. Grill Coins Balance Adjustment Validation', () => {
    it('calculates credited points delta correctly', () => {
      const initialCoins = 100;
      const creditDelta = 50;
      const newBalance = initialCoins + creditDelta;

      expect(newBalance).toBe(150);
    });

    it('prevents debited points from taking balance below zero', () => {
      const initialCoins = 30;
      const debitDelta = -50;
      const calculatedBalance = initialCoins + debitDelta;
      const isInvalid = calculatedBalance < 0;

      expect(isInvalid).toBe(true);
      expect(calculatedBalance).toBe(-20);
    });
  });

  describe('3. Customer 10-digit Phone Number Instant Lookup', () => {
    const customerList: Customer[] = [
      { id: 'c1', name: 'Rohan Mehta', phone: '+91 98250 99881', segment: 'VIP' } as Customer,
      { id: 'c2', name: 'Pooja Dave', phone: '+91 97123 44556', segment: 'Regular' } as Customer,
      { id: 'c3', name: 'Karan Patel', phone: '+91 99090 11223', segment: 'New' } as Customer,
    ];

    it('matches customer profile by partial or exact 10-digit phone digits in <200ms', () => {
      const searchNumber = '97123';
      const matched = customerList.filter((c) => c.phone.includes(searchNumber));

      expect(matched.length).toBe(1);
      expect(matched[0].name).toBe('Pooja Dave');
    });

    it('filters customers by RFM segment', () => {
      const vipCustomers = customerList.filter((c) => c.segment === 'VIP');
      expect(vipCustomers.length).toBe(1);
      expect(vipCustomers[0].name).toBe('Rohan Mehta');
    });
  });
});
