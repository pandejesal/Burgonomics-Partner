import { describe, it, expect, vi } from 'vitest';

// Loop 15/120: Live Operations gauges must report real backlog counts (never
// stuck zeros), and the orders directory read must stay bounded.

vi.mock('@/core/config/firebase', () => ({ db: {} }));

const seen = vi.hoisted(() => ({ limits: [] as unknown[] }));

const docs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `d${i}`, data: () => ({}) }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ __col: name })),
  collectionGroup: vi.fn((_db: unknown, name: string) => ({ __col: name })),
  where: vi.fn(() => ({ _where: true })),
  orderBy: vi.fn(() => ({ _orderBy: true })),
  query: vi.fn((ref: any, ...rest: unknown[]) => ({ __col: ref?.__col, rest })),
  limit: vi.fn((n: unknown) => {
    seen.limits.push(n);
    return { _limit: n };
  }),
  getDocs: vi.fn(async (ref: any) => {
    if (ref?.__col === 'unmatched_payments') return { size: 3, empty: false, forEach: (cb: any) => docs(3).forEach(cb) };
    if (ref?.__col === 'unmatched_petpooja_orders') return { size: 2, empty: false, forEach: (cb: any) => docs(2).forEach(cb) };
    return { size: 0, empty: true, forEach: (_cb: any) => {} };
  }),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(async () => ({ exists: false })),
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

import { dashboardService } from '../src/admin/dashboard/services/dashboardService';

describe('getLiveCounts honesty (Loop 15/120)', () => {
  it('reports real unmatched webhook backlogs', async () => {
    const counts = await dashboardService.getLiveCounts();
    expect(counts.paymentWebhooksPending).toBe(3);
    expect(counts.petpoojaWebhooksPending).toBe(2);
  });

  it('bounds the orders directory read at 1000', async () => {
    await dashboardService.getLiveCounts();
    expect(seen.limits).toContain(1000);
  });
});
