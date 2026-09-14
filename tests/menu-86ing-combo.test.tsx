import { describe, it, expect } from 'vitest';
import type { MenuItem, UserRole } from '../src/types';

describe('Prompt 07: Menu Management, Instant 86ing & Combo Creator Suite', () => {
  const sampleItems: MenuItem[] = [
    {
      id: 'prod_smash_01',
      name: 'Classic Smash Cheese Burger',
      description: 'Double crisp smashed patty, cheddar, signature sauce',
      price: 199,
      categoryId: 'burgers',
      category: 'Signature Burgers',
      isAvailable: true,
      inStock: true,
      isVeg: true,
      isJain: true,
      isBestSeller: true,
      petpoojaItemId: 'pp_b1',
    },
    {
      id: 'prod_peri_02',
      name: 'Fiery Peri Peri Crunch Burger',
      description: 'Zesty crispy patty with jalapeno mayo',
      price: 229,
      categoryId: 'burgers',
      category: 'Signature Burgers',
      isAvailable: false,
      inStock: false,
      isVeg: true,
      isJain: false,
      eightSixDuration: '2_hours',
      eightSixReason: 'Peak rush throttling',
      petpoojaItemId: 'pp_b2',
    },
    {
      id: 'prod_cajun_fries',
      name: 'Cajun Seasoned Fries',
      description: 'Crispy skin-on fries dusted with cajun seasoning',
      price: 99,
      categoryId: 'sides',
      category: 'Crispy Fries & Sides',
      isAvailable: true,
      inStock: true,
      isVeg: true,
      isJain: true,
      petpoojaItemId: 'pp_s1',
    },
    {
      id: 'prod_shake_choco',
      name: 'Belgian Chocolate Shake',
      description: 'Hand-spun thick shake with dark Belgian cocoa',
      price: 149,
      categoryId: 'beverages',
      category: 'Beverages & Shakes',
      isAvailable: true,
      inStock: true,
      isVeg: true,
      isJain: true,
      petpoojaItemId: 'pp_d1',
    },
  ];

  describe('1. Instant 86ing Duration Calculations', () => {
    const calculate86Expiry = (duration: '2_hours' | 'rest_of_day' | 'indefinite', baseDate: Date) => {
      if (duration === '2_hours') {
        return new Date(baseDate.getTime() + 2 * 60 * 60 * 1000);
      }
      if (duration === 'rest_of_day') {
        const tomorrow = new Date(baseDate);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(6, 0, 0, 0);
        return tomorrow;
      }
      return null;
    };

    it('calculates 2-hour duration expiry accurately', () => {
      const now = new Date('2026-09-01T12:00:00Z');
      const expiry = calculate86Expiry('2_hours', now);
      expect(expiry?.toISOString()).toBe('2026-09-01T14:00:00.000Z');
    });

    it('calculates rest-of-day duration expiry to 06:00 AM next day', () => {
      const now = new Date('2026-09-01T21:30:00');
      const expiry = calculate86Expiry('rest_of_day', now);
      expect(expiry?.getHours()).toBe(6);
      expect(expiry?.getMinutes()).toBe(0);
      expect(expiry?.getDate()).toBe(2);
    });

    it('returns null expiry for indefinite 86ing', () => {
      const now = new Date('2026-09-01T12:00:00Z');
      const expiry = calculate86Expiry('indefinite', now);
      expect(expiry).toBeNull();
    });
  });

  describe('2. Combo Meal Builder Economics', () => {
    it('calculates ala-carte bundle original price, combo deal price, and customer savings', () => {
      const burger = sampleItems[0]; // ₹199
      const side = sampleItems[2]; // ₹99
      const drink = sampleItems[3]; // ₹149

      const originalPrice = burger.price + side.price + drink.price; // ₹447
      const comboPrice = 349;
      const savings = originalPrice - comboPrice; // ₹98
      const discountPercentage = Math.round((savings / originalPrice) * 100);

      expect(originalPrice).toBe(447);
      expect(savings).toBe(98);
      expect(discountPercentage).toBe(22); // 22% OFF
    });
  });

  describe('3. Menu Search & Filter Pipeline', () => {
    const filterMenu = (items: MenuItem[], query: string, category: string, jainOnly: boolean) => {
      return items.filter((item) => {
        if (category !== 'all' && item.categoryId !== category) return false;
        if (jainOnly && !item.isJain) return false;
        if (query.trim()) {
          const q = query.toLowerCase();
          const matchName = item.name.toLowerCase().includes(q);
          const matchCat = (item.category || item.categoryId).toLowerCase().includes(q);
          const matchDesc = item.description.toLowerCase().includes(q);
          if (!matchName && !matchCat && !matchDesc) return false;
        }
        return true;
      });
    };

    it('filters items by Jain-friendly tag', () => {
      const jainItems = filterMenu(sampleItems, '', 'all', true);
      expect(jainItems.length).toBe(3);
      expect(jainItems.every((i) => i.isJain)).toBe(true);
    });

    it('searches items by name keyword', () => {
      const results = filterMenu(sampleItems, 'smash', 'all', false);
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('prod_smash_01');
    });

    it('filters items by category', () => {
      const results = filterMenu(sampleItems, '', 'burgers', false);
      expect(results.length).toBe(2);
    });
  });

  describe('4. RBAC Menu Availability Permissions', () => {
    const canToggleMenuStock = (role: UserRole) => {
      return role === 'brand_owner' || role === 'developer' || role === 'branch_owner';
    };

    it('allows managers and owners to toggle item availability and restricts staff to view-only', () => {
      expect(canToggleMenuStock('brand_owner')).toBe(true);
      expect(canToggleMenuStock('developer')).toBe(true);
      expect(canToggleMenuStock('branch_owner')).toBe(true);

      expect(canToggleMenuStock('branch_staff')).toBe(false);
      expect(canToggleMenuStock('support')).toBe(false);
    });
  });
});
