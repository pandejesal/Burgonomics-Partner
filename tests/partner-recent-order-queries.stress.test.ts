import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  user: { id: 'staff_fixture', role: 'branch_owner', branchIds: ['branch_recent'] },
  selectedBranchId: 'branch_recent' as string | null,
  docs: [] as Array<{ id: string; data: Record<string, any> }>,
  effects: [] as Array<() => any>,
  stateWrites: [] as any[],
  queryOptions: null as any,
  rejectOrdered: false,
  stalePlacedAtRow: null as { id: string; data: Record<string, any> } | null,
  queries: [] as any[],
  snapshots: [] as Array<{ emit: () => void }>,
}));

vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: any) => [
    typeof initial === 'function' ? initial() : initial,
    (value: any) => h.stateWrites.push(value),
  ],
  useRef: (current: any) => ({ current }),
  useCallback: (fn: any) => fn,
  // Run only the listener effect below; do not start alarms/outbox work.
  useEffect: (effect: () => any) => { h.effects.push(effect); },
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: any) => {
    h.queryOptions = options;
    return { data: [], isLoading: false, error: null, refetch: vi.fn(), dataUpdatedAt: 1 };
  },
  useMutation: () => ({ mutateAsync: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: Object.assign(() => ({ user: h.user }), {
    getState: () => ({ user: h.user }),
  }),
}));
vi.mock('@/stores/appStore', () => ({
  useAppStore: Object.assign(() => ({ selectedCity: null, selectedBranchId: h.selectedBranchId }), {
    getState: () => ({ selectedCity: null, selectedBranchId: h.selectedBranchId }),
  }),
}));
vi.mock('@/config/firebase', () => ({ db: {}, auth: {}, app: {}, messaging: null }));
vi.mock('@/core/config/firebase', () => ({ db: {} }));
vi.mock('@/utils/orderContract', async (original) => ({
  ...await original<typeof import('../src/utils/orderContract')>(),
  // Alias documents are a separate schema/query contract, outside this direct-feed regression.
  fetchAliasedStoreOrders: vi.fn(async () => []),
}));
vi.mock('firebase/firestore', async (original) => {
  const actual = await original<typeof import('firebase/firestore')>();
  const time = (v: any) => typeof v?.toMillis === 'function' ? v.toMillis() : Date.parse(v);
  const evaluate = (q: any) => {
    h.queries.push(q);
    const ordering = q.constraints.find((c: any) => c.kind === 'orderBy');
    if (ordering && h.rejectOrdered) throw new Error('fixture ordered query unavailable');
    const records = ordering?.field === 'placedAt' && h.stalePlacedAtRow
      ? h.docs.map((d) => d.id === h.stalePlacedAtRow!.id ? h.stalePlacedAtRow! : d)
      : h.docs;
    let result = records.filter((d) => q.constraints.every((c: any) =>
      c.kind !== 'where' || (c.op === 'in' ? c.value.includes(d.data[c.field]) : d.data[c.field] === c.value)
    ));
    // An orderBy also excludes documents without that field in Firestore.
    if (ordering) result = result.filter((d) => d.data[ordering.field] !== undefined);
    // Firestore's implicit order is document name, not insertion time.
    result = [...result].sort((a, b) => ordering
      ? (time(a.data[ordering.field]) - time(b.data[ordering.field])) * (ordering.direction === 'desc' ? -1 : 1)
      : a.id.localeCompare(b.id));
    const cap = q.constraints.find((c: any) => c.kind === 'limit')?.count ?? Infinity;
    const docs = result.slice(0, cap).map((d) => ({ id: d.id, data: () => d.data }));
    return { docs, empty: docs.length === 0, size: docs.length, forEach: (fn: any) => docs.forEach(fn) };
  };
  return {
    ...actual,
    collection: (_db: unknown, path: string) => ({ path }),
    where: (field: string, op: string, value: unknown) => ({ kind: 'where', field, op, value }),
    orderBy: (field: string, direction: string) => ({ kind: 'orderBy', field, direction }),
    limit: (count: number) => ({ kind: 'limit', count }),
    query: (ref: any, ...constraints: any[]) => ({ ref, constraints }),
    getDocs: vi.fn(async (q: any) => evaluate(q)),
    onSnapshot: vi.fn((q: any, next: any, error: any) => {
      const emit = () => {
        try { next(evaluate(q)); } catch (e) { error(e); }
      };
      h.snapshots.push({ emit });
      emit();
      return vi.fn();
    }),
  };
});

import { Timestamp } from 'firebase/firestore';
import { adminOrdersService } from '../src/admin/services/adminOrdersService';
import { useOrders } from '../src/hooks/useOrders';
import { useKDSRealtimeStream } from '../src/features/kds/hooks/useKDSRealtimeStream';
import { fetchAliasedStoreOrders } from '../src/utils/orderContract';

const newestId = 'order_479';

function seed(status: string, shape: 'iso' | 'timestamp') {
  h.docs = Array.from({ length: 480 }, (_, i) => {
    const ms = Date.UTC(2026, 9, 1) + i * 60_000;
    return {
      id: `order_${String(i).padStart(3, '0')}`,
      data: {
        branchId: 'branch_recent',
        status,
        items: [],
        total: 100,
        paymentStatus: 'completed',
        createdAt: shape === 'iso' ? new Date(ms).toISOString() : Timestamp.fromMillis(ms),
      },
    };
  });
  // A forbidden branch must not leak through scoped query repair.
  h.docs.push({ id: 'foreign_newest', data: {
    branchId: 'branch_foreign', status, items: [], total: 100,
    createdAt: shape === 'iso' ? '2026-10-24T00:00:00.000Z' : Timestamp.fromMillis(Date.UTC(2026, 9, 24)),
  } });
}

describe.each(['iso', 'timestamp'] as const)('bounded recent-order queries (%s)', (shape) => {
  beforeEach(() => {
    h.user = { id: 'staff_fixture', role: 'branch_owner', branchIds: ['branch_recent'] };
    h.selectedBranchId = 'branch_recent';
    h.effects.length = 0;
    h.stateWrites.length = 0;
    h.queries.length = 0;
    h.snapshots.length = 0;
    h.queryOptions = null;
    h.rejectOrdered = false;
    h.stalePlacedAtRow = null;
    vi.mocked(fetchAliasedStoreOrders).mockReset();
    vi.mocked(fetchAliasedStoreOrders).mockImplementation(async () => []);
  });

  it.each(['scoped', 'global'])('useOrders includes newest from 480 documents (%s)', async (scope) => {
    if (scope === 'global') { h.user.role = 'brand_owner'; h.selectedBranchId = null; }
    seed('pending', shape);
    useOrders({ dateRange: 'all' });
    const orders = await h.queryOptions.queryFn();
    expect(orders.map((o: any) => o.id)).toContain(newestId);
    if (scope === 'scoped') expect(orders.map((o: any) => o.id)).not.toContain('foreign_newest');
    expect(h.queries[0].constraints).toContainEqual({ kind: 'limit', count: 100 });
  });

  it.each(['scoped', 'global'])('Control Room history includes newest (%s)', async (scope) => {
    if (scope === 'global') { h.user.role = 'brand_owner'; h.selectedBranchId = null; }
    seed('delivered', shape);
    const orders = await adminOrdersService.getHistory(scope === 'global' ? null : 'branch_recent', 100);
    expect(orders.map((o) => o.id)).toContain(newestId);
    if (scope === 'scoped') expect(orders.map((o) => o.id)).not.toContain('foreign_newest');
  });

  it.each(['scoped', 'global'])('Control Room live listener includes newest (%s)', async (scope) => {
    if (scope === 'global') { h.user.role = 'brand_owner'; h.selectedBranchId = null; }
    seed('pending', shape);
    const next = vi.fn();
    const error = vi.fn();
    const unsubscribe = adminOrdersService.listenLiveOrders(scope === 'global' ? null : 'branch_recent', next, error);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());
    expect(next.mock.calls.at(-1)![0].map((o: any) => o.id)).toContain(newestId);
    if (scope === 'scoped') expect(next.mock.calls.at(-1)![0].map((o: any) => o.id)).not.toContain('foreign_newest');
    expect(error).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('Control Room live board: a late alias merge cannot repaint a completed order', async () => {
    seed('pending', shape);
    const dateMs = Date.UTC(2026, 9, 24, 12);
    const date = shape === 'iso' ? new Date(dateMs).toISOString() : Timestamp.fromMillis(dateMs);
    const aliasedOrder = { id: 'aliased_order', data: {
      store: { id: 'store_fixture' },
      branchId: 'branch_recent',
      status: 'pending',
      items: [],
      total: 100,
      createdAt: date,
    } };

    let releaseFirstAlias!: () => void;
    const firstAliasBlocked = new Promise<void>((resolve) => { releaseFirstAlias = resolve; });
    vi.mocked(fetchAliasedStoreOrders)
      // Snapshot A read the linked-store order as still pending …
      .mockImplementationOnce(async () => {
        await firstAliasBlocked;
        return [aliasedOrder];
      })
      // … snapshot B reads it after the kitchen completed it.
      .mockImplementation(async () => [
        { id: aliasedOrder.id, data: { ...aliasedOrder.data, status: 'delivered' } },
      ]);

    const next = vi.fn();
    const error = vi.fn();
    const cleanup = adminOrdersService.listenLiveOrders('branch_recent', next, error);
    // Snapshot A is waiting on its slower alias read.
    expect(next).not.toHaveBeenCalled();

    // Snapshot B resolves first and paints the board without the completed order.
    h.snapshots.at(-1)!.emit();
    await vi.waitFor(() => expect(next).toHaveBeenCalled());
    expect(next.mock.calls.at(-1)![0].map((o: any) => o.id)).not.toContain(aliasedOrder.id);

    // Snapshot A's stale alias read finally resolves — it must not resurrect it.
    releaseFirstAlias();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(next.mock.calls.at(-1)![0].map((o: any) => o.id)).not.toContain(aliasedOrder.id);
    expect(error).not.toHaveBeenCalled();
    cleanup();
  });

  it('KDS branch listener receives the newest ticket, not the smallest 100 document names', async () => {
    seed('pending', shape);
    useKDSRealtimeStream();
    const cleanup = h.effects.at(-1)!();
    await vi.waitFor(() => expect(h.stateWrites.some((v) =>
      Array.isArray(v) && v.some((o: any) => o.id === newestId)
    )).toBe(true));
    const lastOrders = h.stateWrites.filter(Array.isArray).at(-1)!;
    expect(lastOrders.map((o: any) => o.id)).not.toContain('foreign_newest');
    cleanup();
  });

  it.each(['scoped', 'global'])('a failed %s read rejects instead of returning demo orders or an unordered success', async (scope) => {
    if (scope === 'global') { h.user.role = 'brand_owner'; h.selectedBranchId = null; }
    seed('pending', shape);
    h.rejectOrdered = true;
    useOrders({ dateRange: 'all' });
    await expect(h.queryOptions.queryFn()).rejects.toThrow('fixture ordered query unavailable');
    expect(h.queries).toHaveLength(scope === 'global' ? 2 : 1);
    expect(h.queries.every((q) => q.constraints.some((c: any) => c.kind === 'orderBy'))).toBe(true);
  });

  it.each(['orders', 'history', 'board', 'kds'])(
    'the global %s feed retains Delivery-shaped orders without createdAt',
    async (surface) => {
      h.user.role = 'brand_owner'; h.selectedBranchId = null;
      const historical = surface === 'history';
      seed(historical ? 'delivered' : 'pending', shape);
      h.docs.push({ id: 'delivery_newest', data: {
        store: { id: 'store_fixture' },
        status: { code: historical ? 'DELIVERED' : 'PLACED' },
        items: [],
        total: 100,
        placedAt: shape === 'iso' ? '2026-10-25T00:00:00.000Z' : Timestamp.fromMillis(Date.UTC(2026, 9, 25)),
      } });

      let orders: any[];
      if (surface === 'orders') {
        useOrders({ dateRange: 'all' });
        orders = await h.queryOptions.queryFn();
      } else if (surface === 'history') {
        orders = await adminOrdersService.getHistory(null, 100);
      } else if (surface === 'board') {
        const next = vi.fn();
        const error = vi.fn();
        const cleanup = adminOrdersService.listenLiveOrders(null, next, error);
        await vi.waitFor(() => expect(next).toHaveBeenCalled());
        orders = next.mock.calls.at(-1)![0];
        expect(error).not.toHaveBeenCalled();
        cleanup();
      } else {
        useKDSRealtimeStream();
        const cleanup = h.effects.at(-1)!();
        await vi.waitFor(() => expect(h.stateWrites.some(Array.isArray)).toBe(true));
        orders = h.stateWrites.filter(Array.isArray).at(-1)!;
        cleanup();
      }
      expect(orders.map((o) => o.id)).toContain('delivery_newest');
      // The live board intentionally presents oldest work first after selecting
      // the newest server page; keep that scheduling policy unchanged.
      expect((surface === 'board' ? orders.at(-1) : orders[0]).id).toBe('delivery_newest');
      expect(orders.map((o) => o.id)).toContain(newestId);
      expect(new Set(orders.map((o) => o.id)).size).toBe(orders.length);
    }
  );

  it.each(['orders', 'history', 'board', 'kds'])(
    'the %s fallback date feed cannot overwrite a primary-schema delivered record',
    async (surface) => {
      h.user.role = 'brand_owner'; h.selectedBranchId = null;
      seed('pending', shape);
      const record = h.docs.find((d) => d.id === newestId)!;
      const date = record.data.createdAt;
      const old = { ...record.data, placedAt: date, status: 'pending' };
      record.data = { ...record.data, placedAt: date, status: 'delivered' };
      h.stalePlacedAtRow = { id: newestId, data: old };
      let orders: any[];
      if (surface === 'orders') {
        useOrders({ dateRange: 'all' });
        orders = await h.queryOptions.queryFn();
      } else if (surface === 'history') {
        orders = await adminOrdersService.getHistory(null, 100);
      } else if (surface === 'board') {
        const next = vi.fn();
        const cleanup = adminOrdersService.listenLiveOrders(null, next, vi.fn());
        await vi.waitFor(() => expect(next).toHaveBeenCalled());
        orders = next.mock.calls.at(-1)![0];
        cleanup();
      } else {
        useKDSRealtimeStream();
        const cleanup = h.effects.at(-1)!();
        await vi.waitFor(() => expect(h.stateWrites.some(Array.isArray)).toBe(true));
        orders = h.stateWrites.filter(Array.isArray).at(-1)!;
        cleanup();
      }
      if (surface === 'board') {
        expect(orders.map((o) => o.id)).not.toContain(newestId);
      } else if (surface === 'history') {
        expect(orders.find((o) => o.id === newestId)?.orderStatus).toBe('Completed');
      } else {
        expect(orders.find((o) => o.id === newestId)?.status).toBe('delivered');
      }
    }
  );

  it.each(['all', 'null'])(
    'a scoped user with no assigned branches cannot read brand-wide via storeId %s',
    (kind) => {
      h.user = { id: 'staff_no_branch', role: 'branch_owner', branchIds: [] };
      h.selectedBranchId = null;
      seed('pending', shape);
      const next = vi.fn();
      const error = vi.fn();
      const storeId = kind === 'all' ? 'all' : null;
      const cleanup = adminOrdersService.listenLiveOrders(storeId as any, next, error);

      expect(next).toHaveBeenCalledWith([]);
      expect(h.queries).toHaveLength(0);
      expect(error).not.toHaveBeenCalled();
      cleanup();
    }
  );

  it('the all sentinel still clamps a scoped user to assigned branches', async () => {
    seed('pending', shape);
    const next = vi.fn();
    const cleanup = adminOrdersService.listenLiveOrders('all', next, vi.fn());

    await vi.waitFor(() => expect(next).toHaveBeenCalled());
    // Only the scoped createdAt feed: no brand-wide placedAt listener.
    expect(h.queries).toHaveLength(1);
    expect(h.queries[0].constraints).toContainEqual({
      kind: 'where', field: 'branchId', op: 'in', value: ['branch_recent'],
    });
    expect(next.mock.calls.at(-1)![0].map((o: any) => o.id)).not.toContain('foreign_newest');
    cleanup();
  });
});
