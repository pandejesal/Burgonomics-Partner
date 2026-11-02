import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Item 5 (api-contract-audit): `/petpooja/stores` does not exist on the
 * backend (the only /petpooja routes are syncMenu, pushOrder, pushStock,
 * testRunner, stockWebhook, menu-sync, webhook). The partner gateway POSTed to
 * it, the catch block returned [], and PetpoojaStoresPage rendered a
 * permanently blank table that looked like "no outlets connected".
 *
 * The fix reads the Firestore `stores` collection — the same source the rest
 * of the console uses (public read; firestore.rules:550-553) — and a FAILED
 * load surfaces as a rejection rather than an empty list.
 *
 * Real document shape (partner src/features/stores/models/Store.ts and the
 * server's stores/{id}.petpoojaRestId / partnerBranchId lookups in
 * functions/src/modules/petpooja/testRunner.ts and menuSyncWebhook.ts).
 */

const { getDocs, collectionRef } = vi.hoisted(() => ({
  getDocs: vi.fn(),
  collectionRef: vi.fn((...args: unknown[]) => args),
}));

vi.mock('@/config/firebase', () => ({ db: {}, auth: { currentUser: null } }));
vi.mock('firebase/firestore', () => ({
  collection: collectionRef,
  getDocs,
  limit: vi.fn((n: unknown) => n),
  query: vi.fn((...args: unknown[]) => args),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(),
}));

import { HttpPetpoojaGateway } from '../src/core/integrations/petpooja/httpGateway';

function snapOf(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    empty: docs.length === 0,
    docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('petpooja store list reads Firestore, never the missing route', () => {
  it('maps real stores docs into GatewayStore rows', async () => {
    getDocs.mockResolvedValue(
      snapOf([
        {
          id: 'store_surat_01',
          data: {
            name: 'Burgonomics Surat Adajan',
            address: 'Shop 4, Prime Arcade',
            addressLine1: 'Shop 4, Prime Arcade',
            city: 'Surat',
            area: 'Adajan',
            lat: 21.1959,
            lng: 72.7933,
            phone: '+91 98765 43210',
            isOpen: true,
            petpoojaRestId: 'PP-SURAT-01',
            partnerBranchId: 'branch_surat_01',
          },
        },
        {
          id: 'store_ahd_01',
          data: {
            name: 'Burgonomics Ahmedabad',
            city: 'Ahmedabad',
            lat: 23.0525,
            lng: 72.512,
          },
        },
      ])
    );

    const gw = new HttpPetpoojaGateway({
      functionsBaseUrl: 'https://proxy.test/api',
      fetchImpl: (async () => {
        throw new Error('no HTTP call expected');
      }) as unknown as typeof fetch,
    });

    const stores = await gw.getStores();

    expect(stores).toHaveLength(2);
    expect(stores[0]).toMatchObject({
      id: 'store_surat_01',
      name: 'Burgonomics Surat Adajan',
      city: 'Surat',
      lat: 21.1959,
      lng: 72.7933,
      petpoojaRestId: 'PP-SURAT-01',
    });
    // Second doc has no petpoojaRestId: honest empty string, never invented.
    expect(stores[1].petpoojaRestId).toBe('');
    // The Firestore collection is the source of truth.
    expect(collectionRef).toHaveBeenCalledWith({}, 'stores');
  });

  it('rejects on a failed read so the page can show an error instead of an empty table', async () => {
    getDocs.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));

    const gw = new HttpPetpoojaGateway({
      functionsBaseUrl: 'https://proxy.test/api',
      fetchImpl: (async () => {
        throw new Error('no HTTP call expected');
      }) as unknown as typeof fetch,
    });

    await expect(gw.getStores()).rejects.toThrow(/denied/);
  });
});
