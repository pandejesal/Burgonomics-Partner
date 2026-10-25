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
      refundRequestId: 'refundreq_fixture_valid',
      orderId: 'ord_1',
      razorpayPaymentId: 'pay_1',
      amountRupees: 99.5,
      reason: 'Item missing',
    });
    expect(seen.url).toMatch(/\/payments\/refund$/);
    expect(JSON.parse(String(seen.init?.body))).toMatchObject({
      refundRequestId: 'refundreq_fixture_valid',
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
      partnerFunctionsApi.releaseRefund({
        refundRequestId: 'refundreq_fixture_valid',
        orderId: 'ord_1',
        razorpayPaymentId: 'pay_1',
      })
    ).rejects.toThrow(/no captured payment/);
  });

  it('binds exact refundRequestId to fetch body and X-Idempotency-Key header across separate calls', async () => {
    const calls: Array<{ url: string; headers: Record<string, string>; body: any }> = [];
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({
        url: String(url),
        headers: init.headers,
        body: JSON.parse(String(init.body)),
      });
      return new Response(JSON.stringify({ id: 'rfnd_call', status: 'processed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    // Call 1
    const key1 = 'refundreq_doc_alpha_123';
    await partnerFunctionsApi.releaseRefund({
      refundRequestId: key1,
      orderId: 'ord_101',
      razorpayPaymentId: 'pay_101',
      amountRupees: 250,
    });

    // Call 2
    const key2 = 'refundreq_doc_beta_456';
    await partnerFunctionsApi.releaseRefund({
      refundRequestId: key2,
      orderId: 'ord_102',
      razorpayPaymentId: 'pay_102',
      amountRupees: 250,
    });

    expect(calls).toHaveLength(2);

    // Call 1 verification
    expect(calls[0].headers['X-Idempotency-Key']).toBe(key1);
    expect(calls[0].body.refundRequestId).toBe(key1);

    // Call 2 verification
    expect(calls[1].headers['X-Idempotency-Key']).toBe(key2);
    expect(calls[1].body.refundRequestId).toBe(key2);

    // Distinct keys across calls
    expect(calls[0].headers['X-Idempotency-Key']).not.toBe(calls[1].headers['X-Idempotency-Key']);
    expect(calls[0].body.refundRequestId).not.toBe(calls[1].body.refundRequestId);
  });

  it('preserves the exact same idempotency key across transient retries without rotation', async () => {
    const calls: Array<{ headers: Record<string, string>; body: any }> = [];
    let attempt = 0;
    globalThis.fetch = (async (_url: any, init: any) => {
      attempt++;
      calls.push({
        headers: init.headers,
        body: JSON.parse(String(init.body)),
      });
      if (attempt === 1) {
        // Transient 503 failure
        return new Response(JSON.stringify({ error: 'Service Unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ id: 'rfnd_retry_ok', status: 'processed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const key = 'refundreq_transient_retry_789';
    const res = await partnerFunctionsApi.releaseRefund({
      refundRequestId: key,
      orderId: 'ord_retry',
      razorpayPaymentId: 'pay_retry',
      amountRupees: 500,
    });

    expect(res.status).toBe('processed');
    expect(calls).toHaveLength(2);
    // Both attempts must use the EXACT same key (no rotation, no uuid/timestamp fallback)
    expect(calls[0].headers['X-Idempotency-Key']).toBe(key);
    expect(calls[1].headers['X-Idempotency-Key']).toBe(key);
    expect(calls[0].body.refundRequestId).toBe(key);
    expect(calls[1].body.refundRequestId).toBe(key);
  });

  it('blocks network fetch locally when refundRequestId is invalid or missing', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as any;

    // Missing / undefined
    await expect(
      partnerFunctionsApi.releaseRefund({
        orderId: 'ord_inv',
        razorpayPaymentId: 'pay_inv',
      } as any)
    ).rejects.toThrow(/refundRequestId/);

    // Too short (< 8 chars)
    await expect(
      partnerFunctionsApi.releaseRefund({
        refundRequestId: 'short7',
        orderId: 'ord_inv',
        razorpayPaymentId: 'pay_inv',
      })
    ).rejects.toThrow(/refundRequestId/);

    // Too long (> 128 chars)
    await expect(
      partnerFunctionsApi.releaseRefund({
        refundRequestId: 'a'.repeat(129),
        orderId: 'ord_inv',
        razorpayPaymentId: 'pay_inv',
      })
    ).rejects.toThrow(/refundRequestId/);

    // Invalid characters (spaces, special characters)
    await expect(
      partnerFunctionsApi.releaseRefund({
        refundRequestId: 'refundreq with spaces!',
        orderId: 'ord_inv',
        razorpayPaymentId: 'pay_inv',
      })
    ).rejects.toThrow(/refundRequestId/);

    // Unpopulated / collision token
    await expect(
      partnerFunctionsApi.releaseRefund({
        refundRequestId: 'refundreq_undefined',
        orderId: 'ord_inv',
        razorpayPaymentId: 'pay_inv',
      })
    ).rejects.toThrow(/refundRequestId/);

    // Network must NOT have been called for any of these
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks network fetch locally when no gateway payment id is recorded', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as any;

    await expect(
      partnerFunctionsApi.releaseRefund({
        refundRequestId: 'refundreq_fixture_valid',
        orderId: 'ord_inv',
        razorpayPaymentId: '   ',
      })
    ).rejects.toThrow(/payment id/i);

    await expect(
      partnerFunctionsApi.releaseRefund({
        refundRequestId: 'refundreq_fixture_valid',
        orderId: 'ord_inv',
        razorpayPaymentId: undefined as any,
      })
    ).rejects.toThrow(/payment id/i);

    expect(fetchSpy).not.toHaveBeenCalled();
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
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })) as any;
    await expect(partnerFunctionsApi.bookPorterRider('ord_9')).rejects.toThrow(/not configured/);
  });

  it('POSTs Porter rebooks (delivery_porter.md §4) with order/staff and surfaces NOT_REBOOKABLE refusals', async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    globalThis.fetch = (async (url: any, init: any) => {
      seen.url = String(url);
      seen.init = init;
      return new Response(
        JSON.stringify({ porterOrderId: 'PRTR-2', riderName: 'Suresh', riderPhone: 'x', riderVehicleNumber: 'y', trackingUrl: 'z', status: 'dispatched' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as any;

    const res = await partnerFunctionsApi.rebookPorterRider('ord_9', 'Asha Manager');
    expect(seen.url).toMatch(/\/porter\/rebook$/);
    expect(JSON.parse(String(seen.init?.body))).toMatchObject({ orderId: 'ord_9', staffName: 'Asha Manager' });
    expect(res.riderName).toBe('Suresh');
    expect(res.porterOrderId).toBe('PRTR-2');

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'NOT_REBOOKABLE: order is not in a rebookable state' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })) as any;
    await expect(partnerFunctionsApi.rebookPorterRider('ord_9')).rejects.toThrow(/NOT_REBOOKABLE/);
  });

  it('POSTs Porter cancellations with orderId and surfaces server cancel failures', async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    globalThis.fetch = (async (url: any, init: any) => {
      seen.url = String(url);
      seen.init = init;
      return new Response(JSON.stringify({ success: true, message: 'Porter booking cancelled' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const res = await partnerFunctionsApi.cancelPorterRider('ord_9');
    expect(seen.url).toMatch(/\/porter\/cancel$/);
    expect(JSON.parse(String(seen.init?.body))).toMatchObject({ orderId: 'ord_9' });
    expect(res.success).toBe(true);

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'Porter API rejected the cancellation' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })) as any;
    await expect(partnerFunctionsApi.cancelPorterRider('ord_9')).rejects.toThrow(/rejected the cancellation/);
  });

  it('POSTs the KDS 86 toggle to the Petpooja stock route with branch/item/state', async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    globalThis.fetch = (async (url: any, init: any) => {
      seen.url = String(url);
      seen.init = init;
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const res = await partnerFunctionsApi.toggle86Item({
      branchId: 'branch_surat_01',
      itemId: 'pp_b1',
      inStock: false,
    });
    expect(seen.url).toBe('https://example.invalid/api/petpooja/pushStock');
    expect(JSON.parse(String(seen.init?.body))).toEqual({
      branchId: 'branch_surat_01',
      itemId: 'pp_b1',
      inStock: false,
    });
    expect(res.success).toBe(true);

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'Petpooja POS rejected the stock push' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })) as any;
    await expect(
      partnerFunctionsApi.toggle86Item({ branchId: 'b1', itemId: 'pp_b1', inStock: true })
    ).rejects.toThrow(/rejected the stock push/);
  });

  it('measures API health instead of fabricating latency', async () => {
    globalThis.fetch = (async (url: any) => {
      expect(String(url)).toMatch(/\/health$/);
      return new Response(JSON.stringify({ status: 'healthy', service: 'burgonomics-api' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const res = await partnerFunctionsApi.checkApiHealth();
    expect(res.ok).toBe(true);
    expect(res.service).toBe('burgonomics-api');
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);

    globalThis.fetch = (async () => new Response('down', { status: 503 })) as any;
    await expect(partnerFunctionsApi.checkApiHealth()).rejects.toThrow(/503/);
  });

  it('POSTs discrepancy resolutions with id/decision and surfaces 409 conflicts', async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    globalThis.fetch = (async (url: any, init: any) => {
      seen.url = String(url);
      seen.init = init;
      return new Response(JSON.stringify({ id: 'dis_1', status: 'RESOLVED' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const res = await partnerFunctionsApi.resolveDiscrepancy({ discrepancyId: 'dis_1', resolution: 'refunded' });
    expect(seen.url).toMatch(/\/discrepancies\/resolve$/);
    expect(JSON.parse(String(seen.init?.body))).toMatchObject({ discrepancyId: 'dis_1', resolution: 'refunded' });
    expect(res.status).toBe('RESOLVED');

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'only needs_review rows can be resolved' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })) as any;
    await expect(
      partnerFunctionsApi.resolveDiscrepancy({ discrepancyId: 'dis_done', resolution: 'resolved' })
    ).rejects.toThrow(/needs_review/);
  });

  it('detaches device tokens via the unregister endpoint', async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    globalThis.fetch = (async (url: any, init: any) => {
      seen.url = String(url);
      seen.init = init;
      return new Response(JSON.stringify({ success: true, removedFromUsers: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const res = await partnerFunctionsApi.unregisterDeviceToken('tok_abc');
    expect(seen.url).toMatch(/\/notifications\/unregisterToken$/);
    expect(JSON.parse(String(seen.init?.body))).toMatchObject({ token: 'tok_abc' });
    expect(res.success).toBe(true);
  });
});
