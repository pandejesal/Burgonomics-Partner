import { describe, expect, it, vi } from 'vitest';

/**
 * Item 10, API half: the partner API layer must expose
 * POST /dispatch/cancel/confirm with the REAL response shape.
 *
 * Server contract (functions/src/index.ts:1006-1027 +
 * dispatch.router.ts:2165-2249):
 *
 *   POST /dispatch/cancel/confirm  { orderId, staffName?, note? }
 *     body: dispatchCancelConfirmSchema (validation.ts:254-262)
 *     200  { success: true, orderId, provider, providerOrderId,
 *            pendingCancel, reused }
 *     409  { error, code: "DISPATCH_CANCEL_NOT_PENDING" }
 *
 * and the 409 replacement-dispatch refusal must reach callers with its code,
 * pendingCancel record and staffActionRequired text
 * (dispatch.cancelPending.ts:118-155, sendDispatchError index.ts:902-917).
 */
const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock('@/config/firebase', () => ({
  auth: { currentUser: null },
  getAppCheckToken: async () => null,
}));

import { partnerFunctionsApi } from '../src/services/partnerFunctionsApi';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('POST /dispatch/cancel/confirm wire contract', () => {
  it('posts orderId/staffName/note to the confirm route and returns the real body', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        orderId: 'ord_1',
        provider: 'borzo',
        providerOrderId: 'BZ-7788',
        pendingCancel: {
          provider: 'borzo',
          providerOrderId: 'BZ-7788',
          reason: 'staff_cancelled',
          state: 'confirmed',
          requestedBy: 'Ops Asha',
          attempts: 0,
          lastError: null,
          staffActionRequired: null,
        },
        reused: false,
      })
    );

    const res = await partnerFunctionsApi.dispatchConfirmCancel({
      orderId: 'ord_1',
      staffName: 'Ops Asha',
      note: 'Cancelled in Borzo dashboard, ref 99881',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/dispatch/cancel/confirm');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toMatchObject({
      orderId: 'ord_1',
      staffName: 'Ops Asha',
      note: 'Cancelled in Borzo dashboard, ref 99881',
    });

    expect(res).toMatchObject({
      success: true,
      provider: 'borzo',
      providerOrderId: 'BZ-7788',
      reused: false,
    });
    expect(res.pendingCancel?.state).toBe('confirmed');
    expect(res.pendingCancel?.staffActionRequired).toBeNull();
  });

  it('reports DISPATCH_CANCEL_NOT_PENDING with the server message', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        error: 'This order has no unconfirmed courier cancellation to confirm.',
        code: 'DISPATCH_CANCEL_NOT_PENDING',
      })
    );

    await expect(
      partnerFunctionsApi.dispatchConfirmCancel({ orderId: 'ord_none' })
    ).rejects.toMatchObject({
      code: 'DISPATCH_CANCEL_NOT_PENDING',
      message: 'This order has no unconfirmed courier cancellation to confirm.',
    });
  });

  it('carries staffActionRequired and the pending record off a 409 rebook refusal', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        error:
          'Booking BZ-7788 was released locally but was never confirmed cancelled with Borzo',
        code: 'DISPATCH_CANCEL_UNCONFIRMED',
        staffActionRequired:
          'Cancel booking BZ-7788 in the Borzo dashboard, then confirm the cancellation (POST /dispatch/cancel/confirm). Booking another rider before that would put two riders on this order.',
        pendingCancel: {
          provider: 'borzo',
          providerOrderId: 'BZ-7788',
          reason: 'staff_cancelled',
          state: 'manual_required',
          requestedBy: 'Ops Asha',
          attempts: 0,
          lastError: null,
          staffActionRequired:
            'Cancel booking BZ-7788 in the Borzo dashboard, then confirm the cancellation (POST /dispatch/cancel/confirm). Booking another rider before that would put two riders on this order.',
        },
      })
    );

    await expect(
      partnerFunctionsApi.dispatchRebook({ orderId: 'ord_1', staffName: 'Ops Asha' })
    ).rejects.toMatchObject({
      code: 'DISPATCH_CANCEL_UNCONFIRMED',
      staffActionRequired: expect.stringContaining('Borzo dashboard'),
      pendingCancel: expect.objectContaining({
        state: 'manual_required',
        provider: 'borzo',
        providerOrderId: 'BZ-7788',
      }),
    });
  });
});
