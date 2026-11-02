import { describe, expect, it, vi } from 'vitest';

/**
 * KOT ambiguity resolution (backend 3985a2b + 1d228fc).
 *
 * POST /petpooja/resolveKot, body { orderId, resolution: 'printed' | 'retry' }
 * (functions/src/index.ts:742-759, resolveKotAmbiguitySchema,
 * validation.ts:147-156), requireRole brand_owner/developer/branch_owner/
 * branch_staff, 200 else staffErrorStatus(err, 409).
 *
 * Server response (orderPush.ts:1234-1241 `ResolveKotResult`):
 *   { resolved: 'printed' | 'retry', orderId, pushed?: boolean, reused?: boolean }
 *
 * - printed: keeps the acceptance dedupe, records the human-confirmed print.
 * - retry: records who/when said NOT printed, clears the dedupe, sends exactly
 *   one fresh push (`pushed: true` only for the caller who sent it).
 * - a replay of the same resolution is idempotent (`reused: true`); a
 *   conflicting resolution, or an order that is not parked, is refused.
 *
 * The partner app had no method and no button, so a paid order whose KOT never
 * printed was invisible to staff.
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

describe('resolvePetpoojaKot wire contract', () => {
  it('posts { orderId, resolution: "printed" } and returns the real body', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(jsonResponse(200, { resolved: 'printed', orderId: 'ord_k1' }));

    const res = await partnerFunctionsApi.resolvePetpoojaKot({
      orderId: 'ord_k1',
      resolution: 'printed',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/petpooja/resolveKot');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ orderId: 'ord_k1', resolution: 'printed' });
    expect(res).toEqual({ resolved: 'printed', orderId: 'ord_k1' });
  });

  it('posts a retry and reports whether THIS caller sent the fresh push', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(
      jsonResponse(200, { resolved: 'retry', orderId: 'ord_k2', pushed: true })
    );

    const res = await partnerFunctionsApi.resolvePetpoojaKot({
      orderId: 'ord_k2',
      resolution: 'retry',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ orderId: 'ord_k2', resolution: 'retry' });
    expect(res).toEqual({ resolved: 'retry', orderId: 'ord_k2', pushed: true });
  });

  it('surfaces a double press as reused, not as a second push', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(
      jsonResponse(200, { resolved: 'retry', orderId: 'ord_k3', pushed: false, reused: true })
    );

    const res = await partnerFunctionsApi.resolvePetpoojaKot({
      orderId: 'ord_k3',
      resolution: 'retry',
    });

    expect(res.pushed).toBe(false);
    expect(res.reused).toBe(true);
  });

  it('reports a server refusal with its message', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        error:
          'Order ord_k4 carries a POS order id (pp_kot_1) — the ticket is already registered; confirm it as printed instead of retrying',
      })
    );

    await expect(
      partnerFunctionsApi.resolvePetpoojaKot({ orderId: 'ord_k4', resolution: 'retry' })
    ).rejects.toThrow(/already registered; confirm it as printed/);
  });

  it('does not retry the write on a transient status (one deliberate push only)', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(jsonResponse(503, { error: 'busy' }));

    await expect(
      partnerFunctionsApi.resolvePetpoojaKot({ orderId: 'ord_k5', resolution: 'retry' })
    ).rejects.toThrow(/busy/);
    // A retried write could become a second KOT: exactly one POST is allowed.
    // (503 is apiRequest's retryable class; `retries: 0` is what stops it.)
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
