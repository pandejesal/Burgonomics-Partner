// @vitest-environment jsdom
/**
 * P1-A client side, useOrders hop — bumpStatus contract emission.
 *
 * Scope note: tests/kds-bump-outbox.test.ts F3 already pins the wire level
 * (partnerFunctionsApi.bumpOrderStatus). Nothing pins the useOrders mutation
 * itself: the hop where a caller-supplied expectedStatus could be silently
 * dropped before it ever reaches the API.
 *
 * The behavior pinned: updateOrderStatus's mutationFn forwards the caller's
 * expectedStatus verbatim when provided, sends NO precondition key when the
 * caller cannot prove the shown status (loud bump per the doc comment), does
 * not swallow bump rejections, and its onSuccess invalidates ['orders'].
 *
 * Harness: the hook now calls React hooks (`useMemo`), so it MUST run inside a
 * real render — invoking it as a plain function throws "invalid hook call".
 * This mounts a minimal component with `createRoot` + `act` and captures the
 * real `useMutation` options. Query I/O, stores and the bump API remain mocked
 * at their existing boundaries; React itself is NOT mocked.
 */
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, describe, expect, it, vi, beforeEach, type Mock } from 'vitest';

const rq = vi.hoisted(() => ({
  mutation: null as { mutationFn?: (...a: any[]) => any; onSuccess?: (...a: any[]) => any } | null,
  invalidateQueries: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  // Mirrors the real hook's destructuring; nothing is cached, so no ownership
  // descriptor is claimed (isPlaceholderData stays true / dataUpdatedAt 0).
  useQuery: () => ({
    data: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    dataUpdatedAt: 0,
    isPlaceholderData: false,
  }),
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

/** Renders the real hook and returns the live mutation contract. */
let root: Root | null = null;
let container: HTMLDivElement | null = null;
const actFlagBefore = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');

function Harness(): ReactElement | null {
  useOrders();
  return null;
}

function mountOrders(): { mutationFn: (...a: any[]) => any; onSuccess: (...a: any[]) => any } {
  rq.mutation = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  // Synchronous from the caller's perspective: the test bodies stay unchanged.
  act(() => {
    root!.render(createElement(Harness));
  });
  expect(rq.mutation).toBeTruthy();
  return rq.mutation as any;
}

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
});

afterAll(() => {
  // Restore any pre-existing act-environment state instead of destroying it.
  if (actFlagBefore) {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', actFlagBefore);
  } else {
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  }
});

function payload(): Record<string, unknown> {
  const [arg] = bumpOrderStatus.mock.calls[0] as [Record<string, unknown>];
  return arg;
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
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
