// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ORDER PROVENANCE — `useOrders` ownership contract.
 *
 * The KDS hook adopted `useOrders` rows whenever its own scope stamp matched,
 * but a stamp proves nothing about which identity the CACHED rows belong to.
 * These tests pin the bounded provenance API that makes ownership provable:
 *
 *   - the cache key carries EVERY authorisation dimension the query function
 *     actually clamps by (uid, role, RESOLVED branch ids, selection), so a
 *     branch-assignment narrowing is a different cache entry, not a filtered
 *     view of someone else's;
 *   - an additive `ordersDataScope` descriptor is returned ONLY when the cached
 *     data is real (`dataUpdatedAt > 0` and not placeholder), otherwise null.
 *
 * The DOM environment comes from the documented `@vitest-environment jsdom`
 * directive, so no untyped `jsdom` import or manual global installation is
 * needed. They use the REAL `QueryClient` and the real hook; only Firestore and
 * the alias fetch are stubbed. No IO.
 */
const h = vi.hoisted(() => {
  const userHolder: { user: any } = {
    user: { id: 'userA', role: 'branch_owner', branchIds: ['branch_y', 'branch_z'], cityIds: [] },
  };
  const appHolder = { selectedCity: null as string | null, selectedBranchId: null as string | null };
  return {
    userHolder,
    appHolder,
    // Rows handed back by the stubbed reads, so a test can make A's data linger.
    rows: [] as any[],
    // Boundary inspection: which `in` operand each read actually used.
    whereCalls: [] as Array<{ field: string; op: string; value: unknown }>,
    inArrayCalls: [] as unknown[][],
    getDocsCalls: 0,
    aliasCalls: 0,
    aliasImpl: null as null | (() => Promise<any[]>),
  };
});

vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  query: (...parts: any[]) => ({ parts }),
  orderBy: (field: string) => ({ field }),
  limit: () => ({}),
  // Records the operands of every `in` filter so a test can prove which
  // first-ten subset was actually queried — not just that "a read happened".
  where: (field: string, op: string, value: unknown) => {
    h.whereCalls.push({ field, op, value: Array.isArray(value) ? [...value] : value });
    return { field, op, value };
  },
  getDocs: vi.fn(async (q?: any) => {
    h.getDocsCalls += 1;
    const inFilter = (q?.parts ?? []).find((part: any) => part?.op === 'in');
    if (inFilter) h.inArrayCalls.push([...(inFilter.value as unknown[])]);
    return { docs: h.rows.map((row) => ({ id: row.id, data: () => row })) };
  }),
  onSnapshot: vi.fn(() => () => undefined),
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
    return h.aliasImpl ? h.aliasImpl() : [];
  }),
}));

import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';
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

  // Default QueryClient notification is `setTimeout(cb, 0)`; a fixed number of
  // microtask turns is not an authoritative flush. Query documents a microtask
  // scheduler for tests, and we route notifications through `act`.
  // `notifyManager` exports SETTERS only — there is no getter — so the default
  // notify function is restored to the documented identity `fn => fn()`.
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    notifyManager.setScheduler(queueMicrotask);
    notifyManager.setNotifyFunction((fn) => act(fn));
    h.userHolder.user = {
      id: 'userA',
      role: 'branch_owner',
      branchIds: ['branch_y', 'branch_z'],
      cityIds: [],
    };
    h.appHolder.selectedCity = null;
    h.appHolder.selectedBranchId = null;
    h.rows = [order('Y1', 'branch_y'), order('Z1', 'branch_z')];
    h.getDocsCalls = 0;
    h.whereCalls = [];
    h.inArrayCalls = [];
    h.aliasCalls = 0;
    h.aliasImpl = null;
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
    // Restore the documented defaults so this file cannot change timing for a
    // later suite in the same worker. `notifyManager` exposes setters only, so
    // the default notify function is the documented identity `fn => fn()`.
    notifyManager.setNotifyFunction((fn) => fn());
    notifyManager.setScheduler((cb) => setTimeout(cb, 0));
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
    await act(async () => {
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    });
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

  it('ORD1: an assigned-branch narrowing must query a fresh cache entry for Z', async () => {
    await mount();
    // Existing product behaviour (unchanged, not a defect): a branch_owner's
    // rows are filtered to `branchIds[0]`, so only Y1 is on the board even
    // though the QUERY scope covers Y and Z.
    expect(latest!.orders.map((o) => o.id)).toEqual(['Y1']);
    expect(scope()).toEqual({
      userId: 'userA',
      role: 'branch_owner',
      resolvedBranchIds: ['branch_y', 'branch_z'],
      selectedBranchId: null,
    });

    // Same uid and role; only the ASSIGNED set narrows Y,Z → Z. The query scope
    // changes, so this must be a FRESH read — not the wider cached entry.
    const callsBefore = h.getDocsCalls;
    h.userHolder.user = { id: 'userA', role: 'branch_owner', branchIds: ['branch_z'], cityIds: [] };
    h.rows = [order('Z1', 'branch_z')];
    await rerender();

    // ~(red) the query key omits assigned branch ids, so the Y,Z entry is reused
    // and no new read happens for a genuinely narrower scope.
    expect(h.getDocsCalls).toBeGreaterThan(callsBefore);
    expect(scope()).toEqual({
      userId: 'userA',
      role: 'branch_owner',
      resolvedBranchIds: ['branch_z'],
      selectedBranchId: null,
    });
  });

  it('ORD2: a pending switch to a new identity exposes NO ownership', async () => {
    await mount();
    // Explicitly A's descriptor on A's cached data before any switch.
    expect(scope()).toEqual({
      userId: 'userA',
      role: 'branch_owner',
      resolvedBranchIds: ['branch_y', 'branch_z'],
      selectedBranchId: null,
    });

    // Switch to B and hold the fetch open by never resolving the read.
    h.rows = [];
    h.aliasImpl = () => new Promise<any[]>(() => undefined);
    h.userHolder.user = { id: 'userB', role: 'branch_owner', branchIds: ['branch_y'], cityIds: [] };
    await rerender();

    // ~(red) A's cached/placeholder result must never be described as B's.
    expect(scope()).toBeNull();
  });

  it('ORD3: a late previous-identity result cannot claim the new identity', async () => {
    // A and B are BOTH branch_owner on branch_y, so RBAC cannot hide the
    // ownership bug by filtering the stale row out.
    h.userHolder.user = { id: 'userA', role: 'branch_owner', branchIds: ['branch_y'], cityIds: [] };
    h.rows = [order('A_Y1', 'branch_y')];
    await mount();

    // Hold A's OWN refetch open. This is a real in-flight A query, not B's.
    let releaseA: (rows: any[]) => void = () => undefined;
    let aliasDeferred = false;
    h.aliasImpl = () => {
      aliasDeferred = true;
      return new Promise<any[]>((resolve) => {
        releaseA = resolve;
      });
    };

    await act(async () => {
      void latest!.refetch();
      await settle();
    });
    expect(aliasDeferred).toBe(true);

    // Switch to B while A's refetch is still outstanding.
    h.userHolder.user = { id: 'userB', role: 'branch_owner', branchIds: ['branch_y'], cityIds: [] };
    h.rows = [order('B_Y1', 'branch_y')];
    // B's own query must not be blocked by A's deferred alias.
    h.aliasImpl = null;
    await rerender();
    await settle();

    // B's current result is in place; ownership must name B, unconditionally.
    expect(scope()).toEqual({
      userId: 'userB',
      role: 'branch_owner',
      resolvedBranchIds: ['branch_y'],
      selectedBranchId: null,
    });
    const afterB = latest!.orders.map((o) => o.id);
    expect(afterB).toContain('B_Y1');

    // Now A's late payload lands — same branch, so no RBAC filter can hide it.
    await act(async () => {
      releaseA([order('A_LATE', 'branch_y')]);
      await settle();
    });

    // ~(red) a late A result must never be attributed to B or shown for B.
    expect(latest!.orders.map((o) => o.id)).not.toContain('A_LATE');
    expect(scope()).toEqual({
      userId: 'userB',
      role: 'branch_owner',
      resolvedBranchIds: ['branch_y'],
      selectedBranchId: null,
    });
  });

  it('ORD4 (CONTROL): an equal effective authorisation scope should reuse one cache entry', async () => {
    // The cache key must be stable for scopes the PRODUCT treats as equivalent.
    // Equivalence here means all three query dimensions are unchanged: the
    // RAW primary (branchIds[0], which drives the branch_owner projection), the
    // actual first-ten direct-read subset, and the full alias scope.
    // [y,z,x] → [y,x,z] keeps primary=y, keeps the same first ten, and keeps the
    // same full set — only the tail order differs.
    h.userHolder.user = {
      id: 'userA',
      role: 'branch_owner',
      branchIds: ['branch_y', 'branch_z', 'branch_x'],
      cityIds: [],
    };
    h.rows = [order('Y1', 'branch_y')];
    await mount();
    const callsAfterMount = h.getDocsCalls;
    expect(latest!.orders.map((o) => o.id)).toEqual(['Y1']);

    // Same uid/role/full set, brand-new user object, tail reordered.
    h.userHolder.user = {
      id: 'userA',
      role: 'branch_owner',
      branchIds: ['branch_y', 'branch_x', 'branch_z'],
      cityIds: [],
    };
    await rerender();

    // CONTROL, not a current defect: equivalent dimensions must not refetch.
    expect(h.getDocsCalls).toBe(callsAfterMount);
    expect(scope()).toEqual({
      userId: 'userA',
      role: 'branch_owner',
      resolvedBranchIds: ['branch_x', 'branch_y', 'branch_z'],
      selectedBranchId: null,
    });
    // The displayed projection is unchanged too (primary y).
    expect(latest!.orders.map((o) => o.id)).toEqual(['Y1']);
  });

  /**
   * ORD6 — the RAW PRIMARY is a query dimension.
   *
   * `queryFn` projects branch_owner/staff rows to `user.branchIds[0]`. Swapping
   * [y,z] → [z,y] keeps the same full set (so the current sorted key is
   * unchanged) but changes which branch the board can show: the stale entry
   * would keep displaying Y1 forever.
   */
  it('ORD6: swapping the primary branch must select a new cache entry and show Z1', async () => {
    h.userHolder.user = {
      id: 'userA',
      role: 'branch_owner',
      branchIds: ['branch_y', 'branch_z'],
      cityIds: [],
    };
    h.rows = [order('Y1', 'branch_y'), order('Z1', 'branch_z')];
    await mount();
    expect(latest!.orders.map((o) => o.id)).toEqual(['Y1']);
    const callsAfterMount = h.getDocsCalls;

    // Primary moves y → z. Same sorted full set ['branch_y','branch_z'].
    h.userHolder.user = {
      id: 'userA',
      role: 'branch_owner',
      branchIds: ['branch_z', 'branch_y'],
      cityIds: [],
    };
    h.rows = [order('Y1', 'branch_y'), order('Z1', 'branch_z')];
    await rerender();

    // ~(red) the key omits the primary, so the stale entry keeps showing Y1.
    expect(h.getDocsCalls).toBeGreaterThan(callsAfterMount);
    expect(latest!.orders.map((o) => o.id)).toEqual(['Z1']);
    // Product projection semantics are untouched: still the first assigned id.
    expect(latest!.orders.every((o) => o.branchId === 'branch_z')).toBe(true);
  });

  /**
   * ORD7 — the DIRECT READ's first-ten subset is a query dimension.
   *
   * `queryFn` calls `where('branchId','in', scopeBranchIds.slice(0,10))` on the
   * RAW resolved ids while the alias read uses the FULL scope. With >10 assigned
   * branches, moving a tail branch into the raw first ten changes which tickets
   * can be fetched even though the full set is identical.
   */
  it('ORD7: a branch moving into the raw first-ten subset must use a new cache entry', async () => {
    // 12 assigned branches. `branchIds[0]` is branch_1, so the branch_owner
    // projection keeps branch_1 rows only — the fixture must therefore contain a
    // branch_1 ticket, otherwise an empty primary filter could masquerade as a
    // successful outcome.
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

    // The direct read really used the unsorted first ten.
    expect(h.inArrayCalls.at(-1)).toEqual(twelve.slice(0, 10));
    expect(latest!.orders.map((o) => o.id)).toEqual(['B1']);
    expect(scope()?.resolvedBranchIds).toEqual([...twelve].sort());
    const callsAfterMount = h.getDocsCalls;

    // Swap the RAW positions 9 and 10 (branch_10 ↔ branch_11). That brings
    // branch_11 INTO the raw first ten and drops branch_10 out of it — a genuine
    // cross-cap move, while the full assigned set stays identical.
    const swapped = [...twelve];
    [swapped[9], swapped[10]] = [swapped[10], swapped[9]];
    h.userHolder.user = { id: 'userA', role: 'branch_owner', branchIds: swapped, cityIds: [] };
    await rerender();

    // ~(red) the key omits the first-ten subset, so the stale entry is reused.
    expect(h.getDocsCalls).toBeGreaterThan(callsAfterMount);
    // The NEW read must actually ask for the shifted subset (not sorted).
    expect(h.inArrayCalls.at(-1)).toEqual(swapped.slice(0, 10));
    expect(h.inArrayCalls.at(-1)).not.toEqual(twelve.slice(0, 10));
    // Primary unchanged, so the projected row is still B1 — never empty.
    expect(latest!.orders.map((o) => o.id)).toEqual(['B1']);
  });

  /**
   * ORD8 (POSITIVE CONTROL) — a reorder wholly inside the capped first ten,
   * with the primary and the full alias scope unchanged, is the SAME scope.
   */
  it('ORD8: a reorder inside the capped first ten must not refetch', async () => {
    const twelve = Array.from({ length: 12 }, (_, index) => `branch_${index + 1}`);
    h.userHolder.user = {
      id: 'userA',
      role: 'branch_owner',
      branchIds: twelve,
      cityIds: [],
    };
    // `branchIds[0]` is branch_1, so the primary projection keeps branch_1 rows.
    // Without a branch_1 ticket the board would be empty for reasons unrelated to
    // the cache key, and "no refetch" could pass vacuously.
    h.rows = [order('B1', 'branch_1'), order('B2', 'branch_2'), order('B3', 'branch_3')];
    await mount();
    expect(latest!.orders.map((o) => o.id)).toEqual(['B1']);
    // Public query-success facts only: `dataVerified` belongs to the KDS hook's
    // derived stream state, not to `useOrders`. Asserting it here was a
    // wrong-API oracle, not a product defect.
    expect(latest!.isLoading).toBe(false);
    expect(latest!.error).toBeNull();
    expect(latest!.dataUpdatedAt).toBeGreaterThan(0);
    const descriptorBefore = scope();
    expect(descriptorBefore).toEqual({
      userId: 'userA',
      role: 'branch_owner',
      resolvedBranchIds: [...twelve].sort(),
      selectedBranchId: null,
    });
    const callsAfterMount = h.getDocsCalls;

    // Reorder WITHIN the first ten (keep index 0 fixed so the primary is
    // unchanged; the effective `in` subset is identical as a set).
    const reordered = [...twelve];
    [reordered[1], reordered[2]] = [reordered[2], reordered[1]];
    h.userHolder.user = { id: 'userA', role: 'branch_owner', branchIds: reordered, cityIds: [] };
    await rerender();

    // CONTROL: same effective scope → no extra read, same descriptor and row.
    expect(h.getDocsCalls).toBe(callsAfterMount);
    expect(scope()).toEqual(descriptorBefore);
    expect(latest!.orders.map((o) => o.id)).toEqual(['B1']);
  });

  /**
   * ORD9 — the DIRECT READ's in-operand is compared on RAW values.
   *
   * `queryFn` passes the resolver output straight into
   * `where('branchId','in', …)`; whitespace and empty entries are NOT removed.
   * The key component currently trims/filters that subset before using it, so
   * `'branch_y'` and `' branch_y '` collapse to the same key while the actual
   * Firestore operand differs. That is the exact-query key contract, not a
   * permission or query rewrite: production must keep sending the raw values.
   *
   * No network/provider is involved — the Firestore stub only records operands.
   */
  it('ORD9: whitespace in the raw in-operand must use a new cache entry', async () => {
    h.userHolder.user = {
      id: 'userA',
      role: 'branch_owner',
      branchIds: ['branch_1', 'branch_y'],
      cityIds: [],
    };
    h.rows = [order('B1', 'branch_1')];
    await mount();

    // Baseline facts: projected row, descriptor, query success, raw operand.
    expect(latest!.orders.map((o) => o.id)).toEqual(['B1']);
    expect(latest!.isLoading).toBe(false);
    expect(latest!.error).toBeNull();
    expect(latest!.dataUpdatedAt).toBeGreaterThan(0);
    const descriptorBefore = scope();
    expect(descriptorBefore).toEqual({
      userId: 'userA',
      role: 'branch_owner',
      resolvedBranchIds: ['branch_1', 'branch_y'],
      selectedBranchId: null,
    });
    expect(h.inArrayCalls.at(-1)).toEqual(['branch_1', 'branch_y']);
    const callsAfterMount = h.getDocsCalls;

    // Only WHITESPACE changes in the second assigned branch. Normalised full
    // set is identical, and the trimmed capped key is identical too — but the
    // RAW in-operand is a different value.
    h.userHolder.user = {
      id: 'userA',
      role: 'branch_owner',
      branchIds: ['branch_1', ' branch_y '],
      cityIds: [],
    };
    await rerender();

    // ~(red) current key trims/filters the subset, so the stale entry is reused
    // and no new read is issued for a genuinely different operand.
    expect(h.getDocsCalls).toBeGreaterThan(callsAfterMount);
    // The new read must carry the untrimmed raw value.
    expect(h.inArrayCalls.at(-1)).toEqual(['branch_1', ' branch_y ']);
    expect(h.inArrayCalls.at(-1)).not.toEqual(['branch_1', 'branch_y']);
    // Primary unchanged: the projected row stays B1 (never an empty board).
    expect(latest!.orders.map((o) => o.id)).toEqual(['B1']);
  });

  it('ORD5: a genuinely current owner exposes a usable ownership descriptor', async () => {
    await mount();

    // The happy path the KDS seeding/fallback will depend on.
    expect(scope()).not.toBeNull();
    expect(scope()!.userId).toBe('userA');
    expect(scope()!.resolvedBranchIds).toEqual(['branch_y', 'branch_z']);
  });
});
