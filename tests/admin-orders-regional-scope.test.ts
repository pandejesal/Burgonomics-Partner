import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Control Room (adminOrdersService) orders-read policy — R1 §B.
 *
 * The board is an ORDERS-ONLY reader: it may narrow what a caller can already
 * see, never widen it.
 *
 * - brand_owner / developer / support: brand-wide (support only through the new
 *   orders read grant). A selected outlet narrows the read.
 * - regional_manager: the ONLY authority is the server-confirmed
 *   `admins/{uid}` registry (`role` + non-empty `branchIds`). Session claims,
 *   token fallbacks, the local selection and city names grant nothing.
 * - branch_owner / branch_staff: the session assignment.
 *
 * The old live constraint unioned the selected store into the caller's branch
 * scope (`where branchId in [...scopeIds, storeId]`), so a forged localStorage
 * selection ADDED a branch instead of intersecting. These assertions are made
 * at the Firestore boundary — which predicates were actually sent, and which
 * rows actually reached the board — not on the source text.
 */

const h = vi.hoisted(() => ({
  user: { id: 'reg_1', role: 'regional_manager', branchIds: ['forged'] } as any,
  docs: [] as Array<{ id: string; data: Record<string, any> }>,
  registry: null as Record<string, any> | null,
  registryFromCache: false,
  registryPendingWrites: false,
  registryError: null as Error | null,
  authListeners: new Set<(state: any) => void>(),
  queryWait: null as Promise<void> | null,
  listeners: [] as Array<{
    kind: 'doc' | 'query';
    target: any;
    next: (value: any) => void;
    error: (error: Error) => void;
    stopped: boolean;
  }>,
  branchIdWheres: [] as Array<{ field: string; op: string; value: unknown }>,
  storeIdWheres: [] as Array<{ field: string; op: string; value: unknown }>,
}));

vi.mock('@/core/config/firebase', () => ({ db: {} }));
vi.mock('@/config/firebase', () => ({ app: {}, auth: {}, db: {}, messaging: null }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: () => ({ user: h.user }),
    subscribe: (listener: (state: any) => void) => {
      h.authListeners.add(listener);
      return () => h.authListeners.delete(listener);
    },
  },
}));

vi.mock('firebase/firestore', () => {
  const time = (value: any) => {
    if (value && typeof value.toMillis === 'function') return value.toMillis();
    if (value && typeof value.toDate === 'function') return value.toDate().getTime();
    return Date.parse(String(value));
  };
  const valueAtPath = (data: Record<string, any>, path: string): unknown =>
    path.split('.').reduce<any>((acc, key) => acc?.[key], data);

  const evaluate = (target: any) => {
    const constraints: any[] = target?.constraints ?? [];
    const wheres = constraints.filter((c) => c.kind === 'where');
    const ordering = constraints.find((c) => c.kind === 'orderBy');
    let rows = h.docs.filter((row) =>
      wheres.every((c) => {
        const value = valueAtPath(row.data, String(c.field));
        if (c.op === 'in') return (c.value as unknown[]).includes(value);
        return value === c.value;
      }),
    );
    if (ordering) {
      rows = rows
        .filter((row) => row.data[ordering.field] !== undefined)
        .sort((a, b) => {
          const delta = time(a.data[ordering.field]) - time(b.data[ordering.field]);
          return ordering.direction === 'desc' ? -delta : delta;
        });
    }
    const cap = constraints.find((c) => c.kind === 'limit')?.value ?? Infinity;
    const docs = rows.slice(0, cap).map((row) => ({ id: row.id, data: () => row.data }));
    return {
      docs,
      size: docs.length,
      empty: docs.length === 0,
      forEach: (fn: (doc: { id: string; data: () => Record<string, any> }) => void) =>
        docs.forEach(fn),
    };
  };

  return {
    collection: (_db: unknown, path: string) => ({ kind: 'collection', path }),
    doc: (_db: unknown, path: string, id: string) => ({ kind: 'doc', collection: path, id }),
    where: (field: string, op: string, value: unknown) => {
      const predicate = { kind: 'where', field, op, value };
      if (field === 'branchId') h.branchIdWheres.push(predicate);
      if (field === 'store.id') h.storeIdWheres.push(predicate);
      return predicate;
    },
    orderBy: (field: string, direction: string) => ({ kind: 'orderBy', field, direction }),
    limit: (value: number) => ({ kind: 'limit', value }),
    query: (ref: unknown, ...constraints: unknown[]) => ({ kind: 'query', ref, constraints }),
    getDoc: vi.fn(async () => {
      if (h.registryError) throw h.registryError;
      return {
        exists: () => h.registry !== null,
        data: () => h.registry,
        metadata: { fromCache: h.registryFromCache, hasPendingWrites: h.registryPendingWrites },
      };
    }),
    getDocs: vi.fn(async (target: any) => {
      if (h.queryWait) await h.queryWait;
      return evaluate(target);
    }),
    onSnapshot: (target: any, optionsOrNext: any, nextOrError: any, maybeError: any) => {
      const isDoc = target?.kind === 'doc';
      const next = typeof optionsOrNext === 'function' ? optionsOrNext : nextOrError;
      const error = typeof optionsOrNext === 'function' ? nextOrError : maybeError;
      const listener = { kind: isDoc ? 'doc' : 'query', target, next, error, stopped: false } as any;
      h.listeners.push(listener);
      // The registry is emitted explicitly by each test; order pages emit the
      // way a live Firestore listener would, on subscribe.
      if (!isDoc) {
        try {
          next(evaluate(target));
        } catch (err) {
          error(err);
        }
      }
      return () => {
        listener.stopped = true;
      };
    },
  };
});

import { adminOrdersService } from '../src/admin/services/adminOrdersService';

const queryListeners = () => h.listeners.filter((l) => l.kind === 'query' && !l.stopped);
const registryListener = () =>
  [...h.listeners].reverse().find((l) => l.kind === 'doc' && !l.stopped);
const lastIds = (spy: { mock: { calls: any[][] } }): string[] =>
  (spy.mock.calls.at(-1)?.[0] ?? []).map((order: any) => order.id);
const branchPredicate = (listener: { target: any }) =>
  (listener.target.constraints ?? []).find((c: any) => c.kind === 'where' && c.field === 'branchId');

const flush = async () => {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
};

const snapshotOf = (rows: Array<{ id: string; data: Record<string, any> }>) => {
  // Scope fixtures are valid orders, not malformed-item quarantine fixtures.
  // Explicit row fields still override the defaults, including corrupt items.
  const docs = rows.map((row) => ({ id: row.id, data: () => ({ items: [], total: 100, ...row.data }) }));
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach: (fn: (doc: { id: string; data: () => Record<string, any> }) => void) => docs.forEach(fn),
  };
};

const emitRegistry = (
  data: Record<string, any> | null,
  options: { fromCache?: boolean; hasPendingWrites?: boolean } = {},
) => {
  const listener = registryListener();
  if (!listener) throw new Error('no registry listener registered');
  listener.next({
    exists: () => data !== null,
    data: () => data,
    metadata: {
      fromCache: options.fromCache ?? false,
      hasPendingWrites: options.hasPendingWrites ?? false,
    },
  });
};

const setUser = (user: typeof h.user) => {
  h.user = user;
  for (const listener of h.authListeners) listener({ user });
};

const historyRow = (id: string, branchId: string | null, status = 'delivered') => ({
  id,
  data: {
    ...(branchId ? { branchId } : {}),
    status,
    items: [],
    total: 100,
    paymentStatus: 'completed',
    createdAt: '2026-11-14T06:00:00.000Z',
  },
});

beforeEach(() => {
  h.user = { id: 'reg_1', role: 'regional_manager', branchIds: ['forged'] };
  h.docs = [];
  h.registry = null;
  h.registryFromCache = false;
  h.registryPendingWrites = false;
  h.registryError = null;
  h.authListeners.clear();
  h.queryWait = null;
  h.listeners = [];
  h.branchIdWheres = [];
  h.storeIdWheres = [];
});

describe('Control Room live board — orders read policy', () => {
  it('intersects a forged outlet selection instead of unioning it into the branch scope', async () => {
    h.user = { id: 'staff_1', role: 'branch_owner', branchIds: ['branch_a'] };
    const next = vi.fn();
    const error = vi.fn();

    const cleanup = adminOrdersService.listenLiveOrders('branch_b', next, error);
    await flush();

    // The forged selection adds nothing: intersection is empty, so no read is
    // issued at all. The old code sent `in ['branch_a', 'branch_b']`.
    expect(h.branchIdWheres).toEqual([]);
    expect(queryListeners()).toHaveLength(0);
    expect(next).toHaveBeenCalledWith([]);
    expect(error).not.toHaveBeenCalled();
    cleanup();
  });

  it('narrows an authorised selection to exactly that assigned branch', async () => {
    h.user = { id: 'staff_1', role: 'branch_owner', branchIds: ['branch_a', 'branch_b'] };
    h.docs = [historyRow('live_a', 'branch_a', 'pending'), historyRow('live_b', 'branch_b', 'pending')];
    const next = vi.fn();

    const cleanup = adminOrdersService.listenLiveOrders('branch_a', next, vi.fn());
    await flush();

    const listeners = queryListeners();
    expect(listeners).toHaveLength(1);
    expect(branchPredicate(listeners[0])?.value).toEqual(['branch_a']);
    expect(lastIds(next)).toEqual(['live_a']);
    cleanup();
  });

  it('never reads brand-wide for a regional manager whose registry is missing', async () => {
    const next = vi.fn();
    const error = vi.fn();

    const cleanup = adminOrdersService.listenLiveOrders(null, next, error);

    // The board waits for the authoritative registry; nothing is read before it.
    expect(registryListener()).toBeTruthy();
    expect(queryListeners()).toHaveLength(0);
    expect(h.branchIdWheres).toEqual([]);

    emitRegistry(null);
    await flush();

    expect(queryListeners()).toHaveLength(0);
    expect(h.branchIdWheres).toEqual([]);
    expect(next).toHaveBeenLastCalledWith([]);
    expect(error).not.toHaveBeenCalled();
    cleanup();
  });

  it('chunks every assigned branch, merges all pages and rejects a foreign row', async () => {
    const ids = Array.from({ length: 23 }, (_, index) => `b${index}`);
    h.registry = { role: 'regional_manager', branchIds: ids };
    const next = vi.fn();
    const error = vi.fn();

    const cleanup = adminOrdersService.listenLiveOrders(null, next, error);
    emitRegistry(h.registry);
    await flush();

    const listeners = queryListeners();
    expect(listeners).toHaveLength(3);
    expect(listeners.map((listener) => branchPredicate(listener)?.value)).toEqual([
      ids.slice(0, 10),
      ids.slice(10, 20),
      ids.slice(20),
    ]);
    // Never global-first: every order read is branch-scoped.
    expect(listeners.every((listener) => branchPredicate(listener) !== undefined)).toBe(true);
    // Regional reads get no branchId-less store alias query.
    expect(h.storeIdWheres).toEqual([]);

    listeners[0].next(
      snapshotOf([
        { id: 'dup', data: { branchId: 'b0', status: 'pending', createdAt: 1000 } },
        { id: 'older', data: { branchId: 'b1', status: 'pending', createdAt: 500 } },
        { id: 'foreign', data: { branchId: 'b99', status: 'pending', createdAt: 9999 } },
      ]),
    );
    listeners[2].next(
      snapshotOf([{ id: 'newer', data: { branchId: 'b22', status: 'pending', createdAt: 2000 } }]),
    );
    await flush();
    expect(lastIds(next)).toEqual(['older', 'dup', 'newer']);
    listeners[0].next(
      snapshotOf([{ id: 'dup', data: { branchId: 'b0', status: 'pending', createdAt: 1000 } }]),
    );
    await flush();

    // A replacement snapshot removes 'older'; accumulating old pages would
    // resurrect completed tickets. Keep deduping and oldest-work-first order.
    expect(lastIds(next)).toEqual(['dup', 'newer']);
    expect(error).not.toHaveBeenCalled();
    cleanup();
  });

  it('denies a cached, malformed or non-regional registry', async () => {
    const next = vi.fn();
    const cleanup = adminOrdersService.listenLiveOrders(null, next, vi.fn());

    emitRegistry({ role: 'regional_manager', branchIds: ['a'] }, { fromCache: true });
    await flush();
    expect(queryListeners()).toHaveLength(0);

    emitRegistry({ role: 'regional_manager', branchIds: ['a'] }, { hasPendingWrites: true });
    await flush();
    expect(queryListeners()).toHaveLength(0);

    emitRegistry({ role: 'regional_manager', branchIds: ['a', 1] });
    await flush();
    expect(queryListeners()).toHaveLength(0);

    emitRegistry({ role: 'branch_owner', branchIds: ['a'] });
    await flush();
    expect(queryListeners()).toHaveLength(0);

    emitRegistry({ role: 'regional_manager', branchIds: ['  padded  '] });
    await flush();
    expect(queryListeners()).toHaveLength(0);

    emitRegistry({ role: 'regional_manager', branchIds: [] });
    await flush();
    expect(queryListeners()).toHaveLength(0);
    expect(next).toHaveBeenLastCalledWith([]);
    cleanup();
  });

  it('clears visible rows and retires the old listeners when the assignment is revoked', async () => {
    h.registry = { role: 'regional_manager', branchIds: ['a'] };
    const next = vi.fn();
    const cleanup = adminOrdersService.listenLiveOrders(null, next, vi.fn());

    emitRegistry(h.registry);
    await flush();
    const listeners = queryListeners();
    expect(listeners).toHaveLength(1);

    listeners[0].next(
      snapshotOf([{ id: 'visible', data: { branchId: 'a', status: 'pending', createdAt: 1 } }]),
    );
    await flush();
    expect(lastIds(next)).toEqual(['visible']);

    emitRegistry({ role: 'regional_manager', branchIds: [] });
    await flush();

    expect(listeners.every((listener) => listener.stopped)).toBe(true);
    expect(next).toHaveBeenLastCalledWith([]);

    // A late snapshot from the revoked listener cannot repaint the board.
    listeners[0].next(
      snapshotOf([{ id: 'late', data: { branchId: 'a', status: 'pending', createdAt: 2 } }]),
    );
    await flush();
    expect(lastIds(next)).toEqual([]);
    cleanup();
  });

  it('clears on registry failure and ignores every retired query callback', async () => {
    const next = vi.fn();
    const error = vi.fn();
    h.docs = [historyRow('visible', 'a', 'pending')];
    const cleanup = adminOrdersService.listenLiveOrders(null, next, error);
    emitRegistry({ role: 'regional_manager', branchIds: ['a'] });
    await flush();
    const listeners = queryListeners();
    expect(lastIds(next)).toEqual(['visible']);

    registryListener()!.error(new Error('registry unavailable'));
    expect(next).toHaveBeenLastCalledWith([]);
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'registry unavailable' }));
    expect(listeners.every((listener) => listener.stopped)).toBe(true);
    listeners[0].next(snapshotOf([historyRow('late', 'a', 'pending')]));
    await flush();
    expect(lastIds(next)).toEqual([]);
    cleanup();
  });

  it('retires immediately on logout and cannot revive after an identical login', async () => {
    h.user = { id: 'owner_1', role: 'brand_owner', branchIds: [] };
    h.docs = [historyRow('visible', 'a', 'pending')];
    const next = vi.fn();
    const cleanup = adminOrdersService.listenLiveOrders(null, next, vi.fn());
    await flush();
    const listeners = queryListeners();
    expect(lastIds(next)).toEqual(['visible']);

    const original = h.user;
    setUser(null);
    expect(next).toHaveBeenLastCalledWith([]);
    setUser(original);
    listeners[0].next(snapshotOf([historyRow('late', 'a', 'pending')]));
    await flush();
    expect(lastIds(next)).toEqual([]);
    expect(listeners.every((listener) => listener.stopped)).toBe(true);
    cleanup();
    expect(h.authListeners.size).toBe(0);
  });

  it('keeps the global orders read grant for support without any branch predicate', async () => {
    h.user = { id: 'support_1', role: 'support', branchIds: [] };
    h.docs = [historyRow('any_branch', 'branch_any', 'pending')];
    const next = vi.fn();
    const error = vi.fn();

    const cleanup = adminOrdersService.listenLiveOrders(null, next, error);
    await flush();

    const listeners = queryListeners();
    expect(listeners).toHaveLength(2); // createdAt + placedAt schema pages
    expect(listeners.some((listener) => branchPredicate(listener) !== undefined)).toBe(false);
    expect(lastIds(next)).toEqual(['any_branch']);
    expect(error).not.toHaveBeenCalled();
    cleanup();
  });

  it('preserves the verified Delivery alias read for a brand reader', async () => {
    h.user = { id: 'owner_1', role: 'brand_owner', branchIds: [] };
    const next = vi.fn();

    const cleanup = adminOrdersService.listenLiveOrders('demo', next, vi.fn());
    await flush();

    expect(h.branchIdWheres).toHaveLength(1);
    expect(h.branchIdWheres[0].value).toEqual(['demo']);
    expect(h.storeIdWheres).toHaveLength(1);
    expect(h.storeIdWheres[0].value).toEqual(['demo']);
    cleanup();
  });
});

describe('Control Room history — orders read policy', () => {
  it('reads only the registry-assigned branches for a regional manager', async () => {
    h.user = { id: 'reg_1', role: 'regional_manager', branchIds: ['forged'] };
    h.docs = [historyRow('assigned', 'a'), historyRow('foreign', 'b')];
    h.registry = { role: 'regional_manager', branchIds: ['a'] };

    const result = await adminOrdersService.getHistory(null, 50);

    expect(result.map((order) => order.id)).toEqual(['assigned']);
    expect(h.storeIdWheres).toEqual([]);
  });

  it('fails closed for a missing, stale or unreadable registry', async () => {
    h.user = { id: 'reg_1', role: 'regional_manager', branchIds: ['forged'] };
    h.docs = [historyRow('assigned', 'a')];

    h.registry = null;
    expect(await adminOrdersService.getHistory(null, 50)).toEqual([]);
    expect(h.branchIdWheres).toEqual([]);

    h.registry = { role: 'regional_manager', branchIds: ['a'] };
    h.registryFromCache = true;
    expect(await adminOrdersService.getHistory(null, 50)).toEqual([]);
    expect(h.branchIdWheres).toEqual([]);

    h.registryFromCache = false;
    h.registryPendingWrites = true;
    expect(await adminOrdersService.getHistory(null, 50)).toEqual([]);
    expect(h.branchIdWheres).toEqual([]);

    h.registryPendingWrites = false;
    h.registryError = new Error('registry unavailable');
    await expect(adminOrdersService.getHistory(null, 50)).rejects.toThrow(/registry unavailable/);
  });

  it('cannot widen a branch scope with a forged history outlet', async () => {
    h.user = { id: 'staff_1', role: 'branch_owner', branchIds: ['a'] };
    h.docs = [historyRow('assigned', 'a'), historyRow('forged', 'b')];

    expect(await adminOrdersService.getHistory('b', 50)).toEqual([]);
    expect(h.branchIdWheres).toEqual([]);
  });

  it('reads the complete regional assignment in bounded chunks', async () => {
    const ids = Array.from({ length: 23 }, (_, index) => `b${index}`);
    h.registry = { role: 'regional_manager', branchIds: ids };
    h.docs = ids.map((id) => historyRow(`order_${id}`, id));
    const result = await adminOrdersService.getHistory(null, 50);
    expect(result).toHaveLength(23);
    expect(h.branchIdWheres.map((predicate) => predicate.value)).toEqual([
      ids.slice(0, 10), ids.slice(10, 20), ids.slice(20),
    ]);
  });

  it.each(['revoked assignment', 'logout/login'])('discards an in-flight history result after %s', async (change) => {
    h.registry = { role: 'regional_manager', branchIds: ['a'] };
    h.docs = [historyRow('visible', 'a')];
    let release!: () => void;
    h.queryWait = new Promise<void>((resolve) => { release = resolve; });
    const result = adminOrdersService.getHistory(null, 50);
    await flush();
    expect(h.branchIdWheres).toHaveLength(1);
    if (change === 'revoked assignment') h.registry = { role: 'regional_manager', branchIds: [] };
    else {
      const original = h.user;
      setUser(null);
      setUser(original);
    }
    release();
    expect(await result).toEqual([]);
    expect(h.authListeners.size).toBe(0);
  });

  it('keeps the support global read grant for history', async () => {
    h.user = { id: 'support_1', role: 'support', branchIds: [] };
    h.docs = [historyRow('any_branch', 'branch_any')];

    const result = await adminOrdersService.getHistory(null, 50);

    expect(result.map((order) => order.id)).toEqual(['any_branch']);
    expect(h.branchIdWheres).toEqual([]);
  });
});
