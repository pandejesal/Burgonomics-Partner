// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ORDER PROVENANCE — `useOrders` ownership contract (order-read R1).
 *
 * Scoped roles no longer read through a react-query `getDocs` entry: they open
 * authoritative per-branch `onSnapshot` subscriptions (<=10-value `in` chunks)
 * and stamp the rows they deliver. The provenance questions are unchanged:
 *
 *   - the feed is keyed by EVERY authorisation dimension the query function
 *     clamps by (uid, role, resolved branch set, selection), so a narrowing is
 *     a different feed, not a filtered view of someone else's rows;
 *   - an additive `ordersDataScope` descriptor is returned ONLY once a real
 *     server-confirmed snapshot has delivered the complete chunk set. No
 *     snapshot (pending switch, denial, error) means no ownership.
 *
 * R1 contract changes pinned below: every assigned branch is served (not just
 * `branchIds[0]`), assignments past the Firestore `in` cap are read in
 * complete chunks (never silently truncated), and malformed assignment ids
 * fail closed. The legacy store-only alias read was never granted to these
 * roles (`canReadAliasedStoreOrders` admits brand_owner/developer only), so
 * the scoped feed issuing no alias read is not a compatibility loss.
 *
 * They use the REAL hook and a REAL QueryClient; only Firestore and the alias
 * fetch are stubbed. No IO.
 */
const h = vi.hoisted(() => {
  const userHolder: { user: any } = {
    user: { id: 'userA', role: 'branch_owner', branchIds: ['branch_y', 'branch_z'], cityIds: [] },
  };
  const appHolder = { selectedCity: null as string | null, selectedBranchId: null as string | null };
  return {
    userHolder,
    appHolder,
    // Rows handed to a listener, so a test can choose what each scope delivers.
    rows: [] as any[],
    // Boundary inspection: every subscription target and whether it was retired.
    listeners: [] as Array<{
      target: any;
      next: (snapshot: any) => void;
      error: (error: Error) => void;
      stopped: boolean;
    }>,
    // The scoped feed must never fall back to an unbounded read.
    getDocsCalls: 0,
    aliasCalls: 0,
  };
});

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ kind: 'collection', name }),
  doc: (_db: unknown, name: string, id: string) => ({ kind: 'doc', name, id }),
  query: (...parts: any[]) => ({ kind: 'query', parts }),
  orderBy: (field: string) => ({ kind: 'orderBy', field }),
  limit: (value: number) => ({ kind: 'limit', value }),
  // Records the operands of every `in` filter so a test can prove which
  // branches were actually subscribed — not just that "a read happened".
  where: (field: string, op: string, value: unknown) => ({ kind: 'where', field, op, value }),
  getDocs: async () => {
    h.getDocsCalls += 1;
    throw new Error('scoped order reads must subscribe per branch, not run an unbounded getDocs');
  },
  onSnapshot: (target: any, optionsOrNext: any, nextOrError: any, errorCallback?: any) => {
    const next = typeof optionsOrNext === 'function' ? optionsOrNext : nextOrError;
    const error = typeof optionsOrNext === 'function' ? nextOrError : errorCallback;
    const listener = { target, next, error, stopped: false };
    h.listeners.push(listener);
    return () => {
      listener.stopped = true;
    };
  },
  Timestamp: { now: () => ({}) },
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: Object.assign(() => ({ user: h.userHolder.user }), {
    getState: () => ({ user: h.userHolder.user }),
  }),
}));
vi.mock('@/stores/appStore', () => ({
  useAppStore: Object.assign(
    () => ({
      selectedCity: h.appHolder.selectedCity,
      selectedBranchId: h.appHolder.selectedBranchId,
    }),
    {
      getState: () => ({
        selectedCity: h.appHolder.selectedCity,
        selectedBranchId: h.appHolder.selectedBranchId,
      }),
    },
  ),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/utils/orderContract', async (original) => ({
  ...(await original<typeof import('@/utils/orderContract')>()),
  fetchAliasedStoreOrders: vi.fn(async () => {
    h.aliasCalls += 1;
    return [];
  }),
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useOrders } from '@/hooks/useOrders';

type OrdersResult = ReturnType<typeof useOrders>;
let latest: OrdersResult | null = null;

function Harness(): React.ReactElement {
  latest = useOrders();
  return <div data-testid="count">{latest.orders.length}</div>;
}

const order = (id: string, branchId: string) => ({
  id,
  branchId,
  status: 'pending',
  paymentMethod: 'cod',
  items: [],
  total: 100,
  createdAt: { toMillis: () => 1 },
});

describe('useOrders — authorisation-scoped cache ownership', () => {
  let root: Root | null = null;
  let container: HTMLDivElement;
  let client: QueryClient;
  // Captured once so an earlier act-environment state is restored, not destroyed.
  const actFlagBefore = Object.getOwnPropertyDescriptor(
    globalThis,
    'IS_REACT_ACT_ENVIRONMENT',
  );

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    h.userHolder.user = {
      id: 'userA',
      role: 'branch_owner',
      branchIds: ['branch_y', 'branch_z'],
      cityIds: [],
    };
    h.appHolder.selectedCity = null;
    h.appHolder.selectedBranchId = null;
    h.rows = [order('Y1', 'branch_y'), order('Z1', 'branch_z')];
    h.listeners = [];
    h.getDocsCalls = 0;
    h.aliasCalls = 0;
    latest = null;
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = null;
    container?.remove();
    client.clear();
    latest = null;
  });

  afterAll(() => {
    // Restore any pre-existing act-environment state instead of destroying it.
    if (actFlagBefore) {
      Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', actFlagBefore);
    } else {
      Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    }
  });

  async function mount() {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={client}>
          <Harness />
        </QueryClientProvider>,
      );
    });
    await settle();
  }

  async function settle() {
    await act(async () => {
      for (let i = 0; i < 12; i += 1) await Promise.resolve();
    });
  }

  async function rerender() {
    await act(async () => {
      root!.render(
        <QueryClientProvider client={client}>
          <Harness />
        </QueryClientProvider>,
      );
    });
    await settle();
  }

  const scope = () => latest!.ordersDataScope;

  /** Order subscriptions that are still live (retired ones stay in the log). */
  const activeOrderListeners = () =>
    h.listeners.filter((listener) => listener.target.kind === 'query' && !listener.stopped);

  /** The actual `in` operand of a subscription. */
  const inOperand = (listener: { target: any }) =>
    listener.target.parts.find((part: any) => part?.op === 'in')?.value;

  /** Deliver one real snapshot to one listener. */
  async function emit(listener: { next: (snapshot: any) => void }, rows: any[]) {
    await act(async () => {
      listener.next({ docs: rows.map((row) => ({ id: row.id, data: () => row })) });
    });
  }

  /** Complete every live chunk so the feed stops being partial. */
  async function emitAll(rows: any[] = h.rows) {
    for (const listener of activeOrderListeners()) {
      await emit(listener, rows);
    }
    await settle();
  }

  it('ORD1: an assigned-branch narrowing must start a fresh subscription for Z and drop Y', async () => {
    await mount();
    // The scoped path never issues the old unbounded read or an alias read.
    expect(h.getDocsCalls).toBe(0);
    expect(h.aliasCalls).toBe(0);
    expect(activeOrderListeners()).toHaveLength(1);
    expect(inOperand(activeOrderListeners()[0])).toEqual(['branch_y', 'branch_z']);
    // No ownership before a real server snapshot.
    expect(latest!.orders).toEqual([]);
    expect(scope()).toBeNull();

    await emitAll();
    // R1: every assigned branch is served, not just branchIds[0].
    expect(latest!.orders.map((o) => o.id).sort()).toEqual(['Y1', 'Z1']);
    expect(scope()).toEqual({
      userId: 'userA',
      role: 'branch_owner',
      resolvedBranchIds: ['branch_y', 'branch_z'],
      selectedBranchId: null,
    });

    const wide = activeOrderListeners();
    h.userHolder.user = { id: 'userA', role: 'branch_owner', branchIds: ['branch_z'], cityIds: [] };
    h.rows = [order('Z1', 'branch_z')];
    await rerender();

    // The wider listeners are retired, and the narrower scope is a NEW feed.
    expect(wide.every((listener) => listener.stopped)).toBe(true);
    const narrowed = activeOrderListeners();
    expect(narrowed).toHaveLength(1);
    expect(inOperand(narrowed[0])).toEqual(['branch_z']);
    // A's wider rows cannot linger in the narrower entry.
    expect(latest!.orders).toEqual([]);
    expect(scope()).toBeNull();

    await emitAll();
    expect(latest!.orders.map((o) => o.id)).toEqual(['Z1']);
    expect(scope()).toEqual({
      userId: 'userA',
      role: 'branch_owner',
      resolvedBranchIds: ['branch_z'],
      selectedBranchId: null,
    });
  });

  it('ORD2: a pending switch to a new identity exposes NO ownership', async () => {
    await mount();
    await emitAll();
    // Explicitly A's descriptor on A's server-confirmed data before any switch.
    expect(scope()).toEqual({
      userId: 'userA',
      role: 'branch_owner',
      resolvedBranchIds: ['branch_y', 'branch_z'],
      selectedBranchId: null,
    });

    const aListeners = activeOrderListeners();
    // Switch to B and leave B's subscription unfulfilled (no snapshot).
    h.rows = [];
    h.userHolder.user = { id: 'userB', role: 'branch_owner', branchIds: ['branch_y'], cityIds: [] };
    await rerender();

    // A's listeners are retired and A's result must never be described as B's.
    expect(aListeners.every((listener) => listener.stopped)).toBe(true);
    expect(activeOrderListeners()).toHaveLength(1);
    expect(latest!.orders).toEqual([]);
    expect(scope()).toBeNull();
  });

  it('ORD3: a late previous-identity result cannot claim the new identity', async () => {
    // A and B are BOTH branch_owner on branch_y, so RBAC cannot hide the
    // ownership bug by filtering the stale row out.
    h.userHolder.user = { id: 'userA', role: 'branch_owner', branchIds: ['branch_y'], cityIds: [] };
    h.rows = [order('A_Y1', 'branch_y')];
    await mount();
    await emitAll();
    expect(latest!.orders.map((o) => o.id)).toEqual(['A_Y1']);
    const aListener = activeOrderListeners()[0];

    // Switch to B while A's listener is retired but still callable.
    h.userHolder.user = { id: 'userB', role: 'branch_owner', branchIds: ['branch_y'], cityIds: [] };
    h.rows = [order('B_Y1', 'branch_y')];
    await rerender();
    expect(aListener.stopped).toBe(true);
    const bListener = activeOrderListeners()[0];
    expect(bListener).not.toBe(aListener);

    await emit(bListener, h.rows);
    await settle();
    const bScope = {
      userId: 'userB',
      role: 'branch_owner',
      resolvedBranchIds: ['branch_y'],
      selectedBranchId: null,
    };
    expect(latest!.orders.map((o) => o.id)).toEqual(['B_Y1']);
    expect(scope()).toEqual(bScope);

    // Now A's late payload lands — same branch, so no RBAC filter can hide it.
    await emit(aListener, [order('A_LATE', 'branch_y')]);
    await settle();

    // A retired generation must never be attributed to B or shown for B.
    expect(latest!.orders.map((o) => o.id)).not.toContain('A_LATE');
    expect(scope()).toEqual(bScope);
  });

  it('ORD4 (CONTROL): an equal effective authorisation scope reuses one subscription set', async () => {
    // [y,z,x] → [y,x,z] keeps the same uid, role and assigned SET; only the
    // order of the assignment array changes, which grants nothing new.
    h.userHolder.user = {
      id: 'userA',
      role: 'branch_owner',
      branchIds: ['branch_y', 'branch_z', 'branch_x'],
      cityIds: [],
    };
    h.rows = [order('Y1', 'branch_y')];
    await mount();
    await emitAll();
    expect(latest!.orders.map((o) => o.id)).toEqual(['Y1']);
    const listenersAfterMount = activeOrderListeners();
    const registeredAfterMount = h.listeners.length;
    // The descriptor names the operand the rows were actually fetched with.
    expect(scope()).toEqual({
      userId: 'userA',
      role: 'branch_owner',
      resolvedBranchIds: ['branch_y', 'branch_z', 'branch_x'],
      selectedBranchId: null,
    });

    h.userHolder.user = {
      id: 'userA',
      role: 'branch_owner',
      branchIds: ['branch_y', 'branch_x', 'branch_z'],
      cityIds: [],
    };
    await rerender();

    // CONTROL, not a current defect: an equivalent set must not refetch.
    expect(h.listeners.length).toBe(registeredAfterMount);
    expect(activeOrderListeners()).toEqual(listenersAfterMount);
    expect(scope()).toEqual({
      userId: 'userA',
      role: 'branch_owner',
      resolvedBranchIds: ['branch_y', 'branch_z', 'branch_x'],
      selectedBranchId: null,
    });
    expect(latest!.orders.map((o) => o.id)).toEqual(['Y1']);
  });

  it('ORD6: swapping the assignment order neither refetches nor hides an outlet', async () => {
    // R1 removed the branchIds[0] projection: both assigned outlets are served,
    // so the old "primary swap hides Z1" defect cannot exist.
    h.userHolder.user = {
      id: 'userA',
      role: 'branch_owner',
      branchIds: ['branch_y', 'branch_z'],
      cityIds: [],
    };
    h.rows = [order('Y1', 'branch_y'), order('Z1', 'branch_z')];
    await mount();
    await emitAll();
    expect(latest!.orders.map((o) => o.id)).toEqual(['Y1', 'Z1']);
    const registeredAfterMount = h.listeners.length;

    h.userHolder.user = {
      id: 'userA',
      role: 'branch_owner',
      branchIds: ['branch_z', 'branch_y'],
      cityIds: [],
    };
    await rerender();

    // Same set → same authorisation scope; no teardown, and Z1 stays visible.
    expect(h.listeners.length).toBe(registeredAfterMount);
    expect(latest!.orders.map((o) => o.id)).toEqual(['Y1', 'Z1']);
    expect(latest!.orders.every((o) => ['branch_y', 'branch_z'].includes(o.branchId))).toBe(true);
  });

  it('ORD7: assignments past the Firestore in-cap are read in complete chunks', async () => {
    // 12 assigned branches: the old first-ten read silently dropped the tail.
    const twelve = Array.from({ length: 12 }, (_, index) => `branch_${index + 1}`);
    h.userHolder.user = {
      id: 'userA',
      role: 'branch_owner',
      branchIds: twelve,
      cityIds: [],
    };
    h.rows = [
      order('B1', 'branch_1'),
      order('B10', 'branch_10'),
      order('B11', 'branch_11'),
    ];
    await mount();

    const listeners = activeOrderListeners();
    // Every assigned branch is covered: 10 + 2, never a silent truncation.
    expect(listeners).toHaveLength(2);
    expect(listeners.map(inOperand)).toEqual([twelve.slice(0, 10), twelve.slice(10)]);
    // An incomplete chunk set exposes nothing (no partial board).
    expect(latest!.orders).toEqual([]);
    await emitAll();
    expect(latest!.orders.map((o) => o.id).sort()).toEqual(['B1', 'B10', 'B11']);
    expect(scope()?.resolvedBranchIds).toEqual(twelve);

    // Swap the raw positions 9 and 10 (branch_10 ↔ branch_11). The SET is
    // unchanged, so the existing two chunks already cover it.
    const registeredAfterMount = h.listeners.length;
    const swapped = [...twelve];
    [swapped[9], swapped[10]] = [swapped[10], swapped[9]];
    h.userHolder.user = { id: 'userA', role: 'branch_owner', branchIds: swapped, cityIds: [] };
    await rerender();

    expect(h.listeners.length).toBe(registeredAfterMount);
    expect(activeOrderListeners()).toHaveLength(2);
    expect(latest!.orders.map((o) => o.id).sort()).toEqual(['B1', 'B10', 'B11']);
  });

  it('ORD8: a reorder inside the capped first ten must not refetch', async () => {
    const twelve = Array.from({ length: 12 }, (_, index) => `branch_${index + 1}`);
    h.userHolder.user = {
      id: 'userA',
      role: 'branch_owner',
      branchIds: twelve,
      cityIds: [],
    };
    h.rows = [order('B1', 'branch_1'), order('B2', 'branch_2'), order('B3', 'branch_3')];
    await mount();
    await emitAll();
    expect(latest!.orders.map((o) => o.id)).toEqual(['B1', 'B2', 'B3']);
    // Public query-success facts only: `dataVerified` belongs to the KDS hook's
    // derived stream state, not to `useOrders`.
    expect(latest!.isLoading).toBe(false);
    expect(latest!.error).toBeNull();
    expect(latest!.dataUpdatedAt).toBeGreaterThan(0);
    const descriptorBefore = scope();
    expect(descriptorBefore).toEqual({
      userId: 'userA',
      role: 'branch_owner',
      resolvedBranchIds: twelve,
      selectedBranchId: null,
    });
    const registeredAfterMount = h.listeners.length;

    // Reorder WITHIN the first ten: same assigned set, same chunks.
    const reordered = [...twelve];
    [reordered[1], reordered[2]] = [reordered[2], reordered[1]];
    h.userHolder.user = { id: 'userA', role: 'branch_owner', branchIds: reordered, cityIds: [] };
    await rerender();

    // CONTROL: same effective scope → no extra subscription, same rows.
    expect(h.listeners.length).toBe(registeredAfterMount);
    expect(scope()).toEqual(descriptorBefore);
    expect(latest!.orders.map((o) => o.id)).toEqual(['B1', 'B2', 'B3']);
  });

  /**
   * ORD9 — malformed assignment ids fail closed.
   *
   * `resolveOrderReadScope` rejects any assignment that is not a non-empty,
   * untrimmed string, so `' branch_y '` denies the WHOLE scope instead of
   * quietly querying a different operand than the session claims. This is the
   * same fail-closed rule R1 applies to a malformed regional registry.
   */
  it('ORD9: a whitespace-padded assignment denies the scope', async () => {
    h.userHolder.user = {
      id: 'userA',
      role: 'branch_owner',
      branchIds: ['branch_1', 'branch_y'],
      cityIds: [],
    };
    h.rows = [order('B1', 'branch_1')];
    await mount();
    await emitAll();

    // Baseline facts: projected row, descriptor, query success.
    expect(latest!.orders.map((o) => o.id)).toEqual(['B1']);
    expect(latest!.isLoading).toBe(false);
    expect(latest!.error).toBeNull();
    expect(latest!.dataUpdatedAt).toBeGreaterThan(0);
    expect(scope()).not.toBeNull();
    const valid = activeOrderListeners();

    h.userHolder.user = {
      id: 'userA',
      role: 'branch_owner',
      branchIds: ['branch_1', ' branch_y '],
      cityIds: [],
    };
    await rerender();

    // Malformed scope: no subscription, no fallback read, no ownership, no rows.
    expect(valid.every((listener) => listener.stopped)).toBe(true);
    expect(activeOrderListeners()).toHaveLength(0);
    expect(h.getDocsCalls).toBe(0);
    expect(latest!.orders).toEqual([]);
    expect(scope()).toBeNull();
  });

  it('ORD10: a listener error clears ownership, and refetch starts a clean subscription', async () => {
    await mount();
    await emitAll();
    expect(scope()).not.toBeNull();
    const failing = activeOrderListeners()[0];

    await act(async () => {
      failing.error(new Error('permission denied'));
    });
    await settle();
    expect(latest!.error?.message).toBe('permission denied');
    expect(latest!.orders).toEqual([]);
    expect(scope()).toBeNull();

    // A retry must be a NEW subscription, not a revived failed generation.
    h.rows = [order('Y1', 'branch_y')];
    await act(async () => {
      latest!.refetch();
    });
    await settle();
    const retry = activeOrderListeners();
    expect(retry).toHaveLength(1);
    await emit(retry[0], h.rows);
    await settle();
    expect(latest!.error).toBeNull();
    expect(latest!.orders.map((o) => o.id)).toEqual(['Y1']);
  });

  it('ORD5: a genuinely current owner exposes a usable ownership descriptor', async () => {
    await mount();
    // No snapshot yet: the empty board is not ownership proof.
    expect(scope()).toBeNull();

    await emitAll();
    // The happy path the KDS seeding/fallback will depend on.
    expect(scope()).not.toBeNull();
    expect(scope()!.userId).toBe('userA');
    expect(scope()!.resolvedBranchIds).toEqual(['branch_y', 'branch_z']);
  });
});
