// Tests for the demo-seed honesty contract in useOrders (vitest env is
// 'node': the hook's fetch path cannot run without a DOM/react provider, so
// this file pins the extracted seed contract; source-level wiring guards for
// the same fix live in tests/partner-orders-seed-honesty-guard.test.ts).

import { describe, it, expect } from 'vitest';
import { demoSeedOrders } from './useOrders';

describe('demoSeedOrders (dev-only empty-store seeds) honor Runbook §8 honesty markers', () => {
  const seeds = demoSeedOrders();

  it('plural non-empty array used for the dev empty-store demo flow', () => {
    expect(Array.isArray(seeds)).toBe(true);
    expect(seeds.length).toBeGreaterThan(0);
  });

  it('every fabricated order is visibly marked [DEMO] — never priest-style real-looking names', () => {
    for (const order of seeds) {
      expect(order.customerName.startsWith('[DEMO]')).toBe(true);
    }
  });

  it('no invented backend-state claims: POS sync is "pending", nothing is kotPrinted, payments not completed', () => {
    for (const order of seeds) {
      expect(order.petpoojaSyncStatus).toBe('pending');
      expect(order.kotPrinted).toBe(false);
      expect(order.paymentStatus).toBe('pending');
    }
  });
});

