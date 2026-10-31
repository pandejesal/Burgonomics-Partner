/**
 * P1-A client side, useOrders hop — bumpStatus contract emission
 * (committed HEAD e69f211; src/hooks/useOrders.ts is CLEAN in the working
 * tree — verified via git status/diff).
 *
 * Scope note: tests/kds-bump-outbox.test.ts F3 already pins the wire level
 * (partnerFunctionsApi.bumpOrderStatus). Nothing pins the useOrders mutation
 * itself (useOrders.ts:474-499): the hop where a caller-supplied
 * expectedStatus could be silently dropped before it ever reaches the API.
 *
 * The behavior pinned: updateOrderStatus's mutationFn forwards the caller's
 * expectedStatus verbatim when provided, sends NO precondition key when the
 * caller cannot prove the shown status (loud bump per the doc comment), does
 * not swallow bump rejections, and its onSuccess invalidates ['orders'].
 *
 * Harness: useOrders declares no local React state, so with all hook
 * providers (@tanstack/react-query, stores) mocked the hook can be invoked
 * as a plain function and the real useMutation options are captured
 * (same mock-based convention as tests/partnerops-walkin-payment-truth.test.tsx).
 */
import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';

const rq = vi.hoisted(() => ({
  mutation: null as { mutationFn?: (...a: any[]) => any; onSuccess?: (...a: any[]) => any } | null,
  invalidateQueries: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn(), dataUpdatedAt: 0 }),
  useMutation: (opts: any) => {
    rq.mutation = opts;
    return { mutate: vi.fn(), mutateAsync: vi.fn() };
  },
  useQueryClient: () => ({ invalidateQueries: rq.invalidateQueries }),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 'uid_counter_1', role: 'branch_staff', branchIds: ['branch_surat_01'] },
  }),
}));

vi.mock('@/stores/appStore', () => ({
  useAppStore: () => ({ selectedCity: 'all', selectedBranchId: 'branch_surat_01' }),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  auth: { currentUser: null },
}));

vi.mock('@/services/partnerFunctionsApi', () => ({
  partnerFunctionsApi: { bumpOrderStatus: vi.fn(async () => ({ ok: true })) },
}));

import { useOrders } from '@/hooks/useOrders';
import { partnerFunctionsApi } from '@/services/partnerFunctionsApi';

const bumpOrderStatus = partnerFunctionsApi.bumpOrderStatus as unknown as Mock;

/** Simulates the hook mount and returns the live mutation contract. */
function mountOrders(): { mutationFn: (...a: any[]) => any; onSuccess: (...a: any[]) => any } {
  rq.mutation = null;
  useOrders();
  expect(rq.mutation).toBeTruthy();
  return rq.mutation as any;
}

function payload(): Record<string, unknown> {
  const [arg] = bumpOrderStatus.mock.calls[0] as [Record<string, unknown>];
  return arg;
}

beforeEach(() => {
  bumpOrderStatus.mockClear().mockResolvedValue({ ok: true });
  rq.invalidateQueries.mockClear();
});

describe('useOrders.updateOrderStatus — expectedStatus forwarding (useOrders.ts:474-499)', () => {
  it('forwards the caller-supplied expectedStatus verbatim to the bump API', async () => {
    const { mutationFn } = mountOrders();

    await mutationFn({
      orderId: 'ord_ready_1',
      status: 'out_for_delivery',
      expectedStatus: 'ready',
    });

    expect(bumpOrderStatus).toHaveBeenCalledTimes(1);
    // Exact-shape equality: no keys added, none mutated, precondition intact.
    expect(payload()).toEqual({
      orderId: 'ord_ready_1',
      status: 'out_for_delivery',
      expectedStatus: 'ready',
    });
  });

  it('sends NO expectedStatus key when the caller cannot prove the shown status', async () => {
    const { mutationFn } = mountOrders();

    await mutationFn({ orderId: 'ord_loud_1', status: 'ready' });

    expect(bumpOrderStatus).toHaveBeenCalledTimes(1);
    const sent = payload();
    // The lost-update precondition must be absent — not present-but-undefined
    // (downstream consumers read the wire object before any serialization).
    expect(Object.prototype.hasOwnProperty.call(sent, 'expectedStatus')).toBe(false);
    expect(sent).toEqual({ orderId: 'ord_loud_1', status: 'ready' });
  });

  it('treats an explicitly undefined expectedStatus the same as absent (loud bump)', async () => {
    // Matches the in-source contract comment: a replayed offline queue entry
    // written before this contract existed must still bump, loudly.
    const { mutationFn } = mountOrders();

    await mutationFn({
      orderId: 'ord_replay_1',
      status: 'delivered',
      expectedStatus: undefined,
    });

    expect(bumpOrderStatus).toHaveBeenCalledTimes(1);
    const sent = payload();
    expect(Object.prototype.hasOwnProperty.call(sent, 'expectedStatus')).toBe(false);
    expect(sent).toEqual({ orderId: 'ord_replay_1', status: 'delivered' });
  });

  it('propagates bump rejections instead of swallowing them', async () => {
    const { mutationFn } = mountOrders();
    bumpOrderStatus.mockRejectedValue(new Error('STALE_ORDER_STATUS'));

    await expect(
      mutationFn({ orderId: 'ord_stale_1', status: 'ready', expectedStatus: 'preparing' })
    ).rejects.toThrow('STALE_ORDER_STATUS');
    expect(bumpOrderStatus).toHaveBeenCalledTimes(1);
  });

  it('invalidates the ["orders"] cache after a successful bump', () => {
    const { onSuccess } = mountOrders();

    onSuccess();

    expect(rq.invalidateQueries).toHaveBeenCalledTimes(1);
    expect(rq.invalidateQueries.mock.calls[0][0]).toEqual({ queryKey: ['orders'] });
  });
});
