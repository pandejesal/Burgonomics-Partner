import { describe, it, expect, vi } from 'vitest';

vi.mock('@/config/firebase', () => ({ db: {}, auth: {}, app: {}, messaging: null }));

import { demoSeedOrders } from '../src/hooks/useOrders';

describe('useOrders demo-seed honesty guard', () => {
  const seeds = demoSeedOrders();

  it('exposes each fabricated seed exactly once', () => {
    const ids = seeds.map((order) => order.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id === 'ord_901')).toHaveLength(1);
  });

  it('seeds carry honesty markers and no invented backend-state claims', () => {
    for (const order of seeds) {
      expect(order.customerName.startsWith('[DEMO]')).toBe(true);
      expect(order.paymentStatus).toBe('pending');
      expect(order.petpoojaSyncStatus).toBe('pending');
      expect(order.kotPrinted).toBe(false);
    }
  });
});
