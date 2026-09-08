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

  // ── Idempotency: X-Idempotency-Key is sent and stable across retries ────

  it('sends X-Idempotency-Key header that is stable across a retry (503 then success)', async () => {
    let callCount = 0;
    const keysSeen: string[] = [];

    globalThis.fetch = (async (_url: any, init: any) => {
      const key = (init?.headers as Record<string, string>)['X-Idempotency-Key'];
      keysSeen.push(key);
      callCount++;
      if (callCount === 1) {
        return new Response(null, { status: 503 });
      }
      return new Response(JSON.stringify({ success: true, balanceAfter: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const res = await partnerFunctionsApi.adjustCustomerCoins({
      customerId: 'cust_2',
      delta: 0,
      reason: 'idempotency test',
    });

    expect(res.success).toBe(true);
    // Two fetch calls happened (first 503, then 200)
    expect(keysSeen).toHaveLength(2);
    // Both carried the same key
    expect(keysSeen[0]).toBe(keysSeen[1]);
    // Key is a non-empty string (uuid or fallback)
    expect(keysSeen[0]).toBeTruthy();
  });

  it('caller-supplied idempotency key is forwarded and reused on retry', async () => {
    let callCount = 0;
    const keysSeen: string[] = [];
    const fixedKey = 'my-stable-key-123';

    globalThis.fetch = (async (_url: any, init: any) => {
      const key = (init?.headers as Record<string, string>)['X-Idempotency-Key'];
      keysSeen.push(key);
      callCount++;
      if (callCount === 1) {
        return new Response(null, { status: 502 });
      }
      return new Response(
        JSON.stringify({
          porterOrderId: 'porter_1',
          riderName: 'Rider',
          riderPhone: '999',
          riderVehicleNumber: 'KA-01',
          trackingUrl: 'https://track.example/1',
          status: 'BOOKED',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }) as any;

    const res = await partnerFunctionsApi.bookPorterRider('order_99', 'Staff A', {
      idempotencyKey: fixedKey,
    });

    expect(res.status).toBe('BOOKED');
    expect(keysSeen).toHaveLength(2);
    expect(keysSeen[0]).toBe(fixedKey);
    expect(keysSeen[1]).toBe(fixedKey);
  });

  // ── Offline: throws without calling fetch ───────────────────────────────

  it('throws immediately when navigator.onLine is false without calling fetch', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as any;

    // Node defines onLine on the navigator object itself; jsdom on
    // Navigator.prototype. Save whichever exists and restore it after.
    const target: any = (navigator as any).onLine !== undefined ? navigator : Navigator.prototype;
    const originalOnLine = Object.getOwnPropertyDescriptor(target, 'onLine');

    Object.defineProperty(target, 'onLine', {
      get: () => false,
      configurable: true,
    });

    try {
      await expect(
        partnerFunctionsApi.adjustCustomerCoins({
          customerId: 'cust_3',
          delta: 5,
          reason: 'offline test',
        }),
      ).rejects.toThrow(/offline.*request not sent/i);

      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      if (originalOnLine) {
        Object.defineProperty(target, 'onLine', originalOnLine);
      } else {
        delete target.onLine;
      }
    }
  });

  // ── Timeout: AbortController fires and throws meaningful error ───────────

  it('times out with the prescribed error message when fetch hangs', async () => {
    // Mock fetch that never resolves but honors the abort signal like a
    // real fetch would (rejects with AbortError when the controller fires).
    globalThis.fetch = ((_url: any, init: any) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      })) as any;

    await expect(
      partnerFunctionsApi.bookPorterRider('order_slow', 'Staff A', { timeoutMs: 100 }),
    ).rejects.toThrow(/Request timed out/);
  });

  // ── Porter book does NOT retry on 4xx ────────────────────────────────────

  it('does not retry on 4xx (400) for bookPorterRider', async () => {
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount++;
      return new Response(JSON.stringify({ error: 'Invalid order' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    await expect(
      partnerFunctionsApi.bookPorterRider('bad_order'),
    ).rejects.toThrow(/Invalid order/);

    // Only 1 attempt — no retry on 4xx
    expect(callCount).toBe(1);
  });
});
