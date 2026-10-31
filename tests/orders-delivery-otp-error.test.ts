/**
 * Branch callers now get 409 DELIVERY_OTP_REQUIRED when they try to complete a
 * delivery order through POST /orders/bumpStatus. Staff must be told to use the
 * delivery OTP or the courier flow — a raw code is unactionable.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/firebase', () => ({
  auth: { currentUser: null },
  getAppCheckToken: async () => null,
}));

import { partnerFunctionsApi } from '@/services/partnerFunctionsApi';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bumpOrderStatus — DELIVERY_OTP_REQUIRED', () => {
  it('surfaces the staff action instead of the raw server code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({ error: 'DELIVERY_OTP_REQUIRED' }),
      }))
    );

    await expect(
      partnerFunctionsApi.bumpOrderStatus({ orderId: 'ord_dl_1', status: 'delivered' })
    ).rejects.toThrow(/4-digit OTP/);
  });

  it('leaves unrelated failures with their own message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: 'STALE_ORDER_STATUS' }),
      }))
    );

    await expect(
      partnerFunctionsApi.bumpOrderStatus({ orderId: 'ord_dl_2', status: 'ready' })
    ).rejects.toThrow(/STALE_ORDER_STATUS/);
  });
});
