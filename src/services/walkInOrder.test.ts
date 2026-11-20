/**
 * CASH-FLOWS: counter (walk-in) orders are created by the SERVER.
 *
 * This file calls the REAL `partnerFunctionsApi.createWalkInOrder` and only
 * fakes the Firebase boundary (auth token + App Check) and `fetch`. It proves
 * the two facts the cash-flow package is about:
 *
 *   1. the till records the tender as CASH (`tender: 'cash'`, which the server
 *      stores as `paymentMethod: 'cod'` and counts in the cash stream), and
 *   2. the order is booked to the operator's OWN branch id — the server is what
 *      validates membership and stamps the real outlet name.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const firebase = vi.hoisted(() => ({
  auth: { currentUser: null as null | { getIdToken: () => Promise<string> } },
  getAppCheckToken: vi.fn(async () => 'appcheck-token'),
}));

vi.mock('@/config/firebase', () => ({
  auth: firebase.auth,
  db: {},
  getAppCheckToken: firebase.getAppCheckToken,
}));

import { partnerFunctionsApi, ApiRequestError } from '@/services/partnerFunctionsApi';

const request = {
  requestId: 'req-123',
  branchId: 'branch_rajkot_yagnik',
  orderType: 'takeaway' as const,
  items: [{ productId: 'prod_1', quantity: 2 }],
  expectedTotalPaise: 11500,
  customerName: 'Walk-in Customer',
};

const okResponse = (body: Record<string, unknown>) =>
  ({ ok: true, status: 201, json: async () => body }) as unknown as Response;

describe('createWalkInOrder — counter cash on the wire', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    firebase.auth.currentUser = { getIdToken: async () => 'id-token' };
    firebase.getAppCheckToken.mockResolvedValue('appcheck-token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    firebase.auth.currentUser = null;
  });

  it("sends the CASH tender and the operator's own branch", async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        orderId: 'walkin_1',
        replayed: false,
        status: { code: 'PLACED', label: 'Order placed', kind: 'upcoming', terminal: false },
        paymentStatus: 'pending',
        totals: { grandTotal: 115 },
        settlementAvailable: false,
        branchId: 'branch_rajkot_yagnik',
        branchName: 'Rajkot Yagnik Road',
      }),
    );

    const receipt = await partnerFunctionsApi.createWalkInOrder(request);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/orders/createWalkIn');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toMatchObject({
      requestId: 'req-123',
      branchId: 'branch_rajkot_yagnik',
      orderType: 'takeaway',
      tender: 'cash',
      items: [{ productId: 'prod_1', quantity: 2 }],
      expectedTotalPaise: 11500,
    });
    // The server's real outlet comes back to the till.
    expect(receipt).toMatchObject({
      orderId: 'walkin_1',
      branchId: 'branch_rajkot_yagnik',
      branchName: 'Rajkot Yagnik Road',
      paymentStatus: 'pending',
    });
    // Auth + attestation are on the request.
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer id-token');
    expect(headers['X-Firebase-AppCheck']).toBe('appcheck-token');
  });

  it('surfaces the server price change with its totals (no silent re-price)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        code: 'PRICE_CHANGED',
        error: 'The order price changed; please reconfirm.',
        totals: { grandTotal: 120, split: { totalAmountPaise: 12000 } },
      }),
    } as unknown as Response);

    const failure = partnerFunctionsApi.createWalkInOrder(request);
    await expect(failure).rejects.toBeInstanceOf(ApiRequestError);
    await expect(failure).rejects.toMatchObject({
      code: 'PRICE_CHANGED',
      totals: { grandTotal: 120 },
    });
  });
});
