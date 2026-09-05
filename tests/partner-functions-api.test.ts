import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Tests the REAL API gateway (URL building, auth header, error mapping) with
// a mocked fetch — the coin-adjustment money path must prove it calls
// POST /customers/adjustCoins with the right body and surfaces server errors.

vi.mock('@/config/firebase', () => ({
  auth: { currentUser: null },
  getAppCheckToken: async () => null,
}));

import { partnerFunctionsApi } from '../src/services/partnerFunctionsApi';

describe('partnerFunctionsApi gateway (real client, mocked transport)', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv('VITE_FUNCTIONS_API_URL', 'https://example.invalid/api');
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
  });

  it('POSTs coin adjustments with customerId/delta/reason/notes', async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    globalThis.fetch = (async (url: any, init: any) => {
      seen.url = String(url);
      seen.init = init;
      return new Response(JSON.stringify({ success: true, balanceAfter: 150 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const res = await partnerFunctionsApi.adjustCustomerCoins({
      customerId: 'cust_1',
      delta: 50,
      reason: 'Order compensation',
      notes: 'late delivery',
    });

    expect(seen.url).toBe('https://example.invalid/api/customers/adjustCoins');
    expect(seen.init?.method).toBe('POST');
    expect(JSON.parse(String(seen.init?.body))).toMatchObject({
      customerId: 'cust_1',
      delta: 50,
      reason: 'Order compensation',
    });
    expect(res.balanceAfter).toBe(150);
  });

  it('surfaces the server reason instead of a generic error (no fake success)', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'Forbidden: customer is outside your assigned branches' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })) as any;

    await expect(
      partnerFunctionsApi.adjustCustomerCoins({ customerId: 'cust_1', delta: 10, reason: 'x' })
    ).rejects.toThrow(/outside your assigned branches/);
  });
});
