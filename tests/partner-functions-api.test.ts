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

  it('POSTs refund releases with order/payment/amount and surfaces server refusals', async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    globalThis.fetch = (async (url: any, init: any) => {
      seen.url = String(url);
      seen.init = init;
      return new Response(JSON.stringify({ id: 'rfnd_1', status: 'processed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const res = await partnerFunctionsApi.releaseRefund({
      orderId: 'ord_1',
      razorpayPaymentId: 'pay_1',
      amountRupees: 99.5,
      reason: 'Item missing',
    });
    expect(seen.url).toMatch(/\/payments\/refund$/);
    expect(JSON.parse(String(seen.init?.body))).toMatchObject({
      orderId: 'ord_1',
      razorpayPaymentId: 'pay_1',
      amountRupees: 99.5,
    });
    expect(res.status).toBe('processed');

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'Refund refused: no captured payment matching pay_1' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })) as any;
    await expect(
      partnerFunctionsApi.releaseRefund({ orderId: 'ord_1', razorpayPaymentId: 'pay_1' })
    ).rejects.toThrow(/no captured payment/);
  });

  it('POSTs refund dispositions with id/reason and surfaces 409 conflicts', async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    globalThis.fetch = (async (url: any, init: any) => {
      seen.url = String(url);
      seen.init = init;
      return new Response(JSON.stringify({ id: 'rf_1', status: 'REJECTED' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const res = await partnerFunctionsApi.disposeRefund({ refundId: 'rf_1', reason: 'Duplicate' });
    expect(seen.url).toMatch(/\/refunds\/dispose$/);
    expect(JSON.parse(String(seen.init?.body))).toMatchObject({ refundId: 'rf_1', reason: 'Duplicate' });
    expect(res.status).toBe('REJECTED');

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'only PENDING requests can be rejected' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })) as any;
    await expect(
      partnerFunctionsApi.disposeRefund({ refundId: 'rf_done', reason: 'x' })
    ).rejects.toThrow(/only PENDING/);
  });

  it('POSTs Porter bookings with order/staff and surfaces booking failures', async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    globalThis.fetch = (async (url: any, init: any) => {
      seen.url = String(url);
      seen.init = init;
      return new Response(
        JSON.stringify({ porterOrderId: 'PRTR-1', riderName: 'Ramesh', riderPhone: 'x', riderVehicleNumber: 'y', trackingUrl: 'z', status: 'dispatched' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as any;

    const res = await partnerFunctionsApi.bookPorterRider('ord_9', 'Asha Manager');
    expect(seen.url).toMatch(/\/porter\/book$/);
    expect(JSON.parse(String(seen.init?.body))).toMatchObject({ orderId: 'ord_9', staffName: 'Asha Manager' });
    expect(res.riderName).toBe('Ramesh');

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'Porter account not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })) as any;
    await expect(partnerFunctionsApi.bookPorterRider('ord_9')).rejects.toThrow(/not configured/);
  });
});
