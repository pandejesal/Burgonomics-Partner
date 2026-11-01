/**
 * Walk-in packaging must come from the server (`POST /checkout/fees`), never a
 * hard-coded 15. This app reaches Cloud Functions through the same base as
 * `partnerFunctionsApi`; a placeholder host (api.dev.burgonomics.example) was
 * the CUS-13 bug. Auth mirrors the customer app: Firebase ID token (exactly ONE
 * authorization header) + App Check.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/firebase', () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn(async () => 'id-token-1'),
    },
  },
  getAppCheckToken: vi.fn(async () => 'appcheck-token-1'),
}));

import {
  checkoutFeesUrl,
  fetchCheckoutFees,
  packagingQuoteOrderType,
} from '@/services/checkoutFees';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('packagingQuoteOrderType', () => {
  it('asks for takeaway packaging on a walk-in delivery (order-level, no courier fee)', () => {
    expect(packagingQuoteOrderType('delivery')).toBe('takeaway');
    expect(packagingQuoteOrderType('takeaway')).toBe('takeaway');
    expect(packagingQuoteOrderType('dinein')).toBe('dinein');
  });
});

describe('checkoutFeesUrl', () => {
  it('resolves to the real Cloud Functions base, never a placeholder host', () => {
    const url = checkoutFeesUrl();
    expect(url).toMatch(
      /^https:\/\/asia-south1-[a-z0-9-]+\.cloudfunctions\.net\/api\/checkout\/fees$/
    );
    expect(url).not.toContain('example');
    expect(url).not.toContain('localhost');
    expect(url).not.toContain('undefined');
  });
});

describe('fetchCheckoutFees', () => {
  it('posts branch + order type only, with exactly one authorization header', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ packagingFee: 15, deliveryFee: 0 }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const fees = await fetchCheckoutFees({
      branchId: 'branch_surat_01',
      orderType: 'takeaway',
    });

    expect(fees).toEqual({ packagingFee: 15, deliveryFee: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(checkoutFeesUrl());
    const headers = init.headers as Record<string, string>;
    const authHeaders = Object.keys(headers).filter(
      (key) => key.toLowerCase() === 'authorization'
    );
    expect(authHeaders).toHaveLength(1);
    expect(headers[authHeaders[0]]).toBe('Bearer id-token-1');
    expect(headers['X-Firebase-AppCheck']).toBe('appcheck-token-1');
    // Order-level packaging: no items field is sent.
    expect(JSON.parse(String(init.body))).toEqual({
      branchId: 'branch_surat_01',
      orderType: 'takeaway',
    });
  });

  it('rejects with a clear error instead of guessing a fee', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: 'INTERNAL' }),
      }))
    );

    await expect(
      fetchCheckoutFees({ branchId: 'branch_surat_01', orderType: 'dinein' })
    ).rejects.toThrow(/packaging fee/i);
  });
});
