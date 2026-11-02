import { describe, expect, it, vi } from 'vitest';

/**
 * Item 6 (api-contract-audit): POST /petpooja/pushOrder answers
 * `{ success: boolean }` only.
 *
 *   functions/src/index.ts:715-729
 *     const success = await pushOrderToPetpooja(orderId, req.user);
 *     res.status(200).json({ success });
 *
 * The partner gateway read `res.kotNumber || res.petpoojaOrderId`, so the KOT
 * number was always undefined — or, with the old tests' stub bodies, whatever
 * the stub happened to invent. This pins the REAL response shape: the client
 * reports success and never a KOT id it did not receive.
 */
const { post } = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock('@/config/firebase', () => ({
  db: {},
  auth: { currentUser: { getIdToken: async () => 'id-token' } },
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
}));

import { HttpPetpoojaGateway } from '../src/core/integrations/petpooja/httpGateway';

const okFetch = (body: unknown) =>
  (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;

describe('pushOrder parses the server body it really returns', () => {
  it('reports success from { success: true } and invents no KOT number', async () => {
    const gw = new HttpPetpoojaGateway({
      functionsBaseUrl: 'https://proxy.test/api',
      fetchImpl: okFetch({ success: true }),
      outboxKey: 'test.outbox.real',
    });

    const res = await gw.pushOrder('ord_1', { id: 'ord_1', items: [] } as any);

    expect(res.acknowledged).toBe(true);
    // The server sends NO kotNumber and NO petpoojaOrderId. The client must
    // not carry the field at all — a `kotNumber: undefined` placeholder is how
    // the old code pretended the contract had one.
    expect('kotNumber' in res).toBe(false);
    expect(res.petpoojaOrderId).toBeUndefined();
    expect(post).not.toHaveBeenCalled();
  });

  it('an explicit { success: false } is a refusal, not an acknowledgement', async () => {
    const gw = new HttpPetpoojaGateway({
      functionsBaseUrl: 'https://proxy.test/api',
      fetchImpl: okFetch({ success: false }),
      outboxKey: 'test.outbox.refused',
    });

    const res = await gw.pushOrder('ord_2', { id: 'ord_2', items: [] } as any);

    expect(res.acknowledged).toBe(false);
    expect('kotNumber' in res).toBe(false);
  });
});
