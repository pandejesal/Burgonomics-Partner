import { describe, it, expect, vi, beforeEach } from 'vitest';

// Loop 3/120: dashboard getStores must never present fixture stores as live,
// and must bound the directory read.
vi.mock('@/core/config/firebase', () => ({ db: {} }));

const mocks = vi.hoisted(() => ({
  getDocsImpl: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  collectionGroup: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  getDocs: (...args: unknown[]) => mocks.getDocsImpl(...args),
  Timestamp: { now: () => ({ toMillis: () => 0 }) },
}));

import { query as qFn, limit as limitFn } from 'firebase/firestore';
import { dashboardService } from '../src/admin/dashboard/services/dashboardService';

describe('dashboard getStores honesty (Loop 3/120)', () => {
  beforeEach(() => {
    mocks.getDocsImpl.mockReset();
  });

  it('marks fixture fallback stores when admin_stores is empty', async () => {
    mocks.getDocsImpl.mockResolvedValue({ empty: true, forEach: () => {} });
    const stores = await dashboardService.getStores();
    expect(stores.length).toBeGreaterThan(0);
    for (const s of stores) expect(s.isDemoFallback).toBe(true);
  });

  it('marks fixture fallback stores when the read throws', async () => {
    mocks.getDocsImpl.mockRejectedValue(new Error('permission-denied'));
    const stores = await dashboardService.getStores();
    expect(stores.length).toBeGreaterThan(0);
    for (const s of stores) expect(s.isDemoFallback).toBe(true);
  });

  it('live docs are NOT flagged and the read is bounded', async () => {
    const live = {
      id: 'store_live_1',
      data: () => ({
        name: 'Real Outlet',
        address: '1 Main St',
        city: 'Surat',
        state: 'GJ',
        pincode: '395001',
        country: 'India',
        phone: '+911234567890',
        latitude: 21.1,
        longitude: 72.8,
        status: 'OPEN',
        turnOnAt: null,
        minPrepMinutes: 15,
        distanceKm: 0,
      }),
    };
    mocks.getDocsImpl.mockResolvedValue({
      empty: false,
      forEach: (cb: (d: unknown) => void) => cb(live),
    });
    const stores = await dashboardService.getStores();
    expect(stores).toHaveLength(1);
    expect(stores[0].isDemoFallback).not.toBe(true);
    expect(qFn).toHaveBeenCalled();
    expect(limitFn).toHaveBeenCalledWith(100);
  });
});
