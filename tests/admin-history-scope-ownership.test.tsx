// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RichOrder } from '@/admin/pages/ordersData';
import type { UserRole } from '@/types';

/**
 * HIGH Finding Regression: Admin History Scope & Cross-Scope Ownership / Revocation.
 *
 * Focuses on AdminOrdersPage history mode and adminOrdersService:
 * 1. Delayed A -> B history promise resolving after switch must not repaint owner A's data under B.
 * 2. Settled rows & selected drawer on logout / role change must not persist.
 * 3. Authoritative regional registry revocation with unchanged UI selection clears history rows and drawer.
 *
 * Drives real components and stores with controlled Firestore boundary / deferred I/O promises.
 */

const h = vi.hoisted(() => ({
  user: {
    id: 'user_a',
    role: 'branch_owner' as UserRole,
    branchIds: ['branch_a'],
    name: 'Owner A',
    email: 'a@example.com',
  } as any,
  assignedStoreIds: ['branch_a'] as string[],
  selectedBranchId: null as string | null,
  docs: [] as Array<{ id: string; data: Record<string, any> }>,
  registry: null as Record<string, any> | null,
  registryFromCache: false,
  registryPendingWrites: false,
  registryListeners: [] as Array<{
    next: (snap: any) => void;
    error: (err: any) => void;
    stopped: boolean;
  }>,
  queryWait: null as Promise<void> | null,
  deferredHistoryResolvers: [] as Array<{
    resolve: (orders: RichOrder[]) => void;
    reject: (err: Error) => void;
  }>,
}));

vi.mock('@/config/firebase', () => ({ app: {}, auth: {}, db: {}, messaging: null }));
vi.mock('@/core/config/firebase', () => ({ app: {}, auth: {}, db: {}, messaging: null }));

vi.mock('@/stores/authStore', () => {
  const listeners = new Set<(state: any) => void>();
  return {
    useAuthStore: Object.assign(
      () => ({
        user: h.user,
        firebaseUser: h.user ? { uid: h.user.id } : null,
        loading: false,
      }),
      {
        getState: () => ({ user: h.user }),
        subscribe: (listener: (state: any) => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        _emitChange: () => {
          listeners.forEach((l) => l({ user: h.user }));
        },
      }
    ),
  };
});

vi.mock('@/admin/hooks/useAdmin', () => ({
  useAdmin: () => ({
    admin: h.user
      ? {
          id: h.user.id,
          email: h.user.email,
          fullName: h.user.name,
          avatar: null,
          role: { name: h.user.role, permissions: ['admin.orders.view', 'admin.developer'] },
          assignedStoreId: h.user.branchIds?.[0],
        }
      : null,
    assignedStoreIds: h.assignedStoreIds,
    role: h.user?.role ?? '',
    roleName: h.user?.role ?? '',
    isDeveloper: h.user?.role === 'brand_owner' || h.user?.role === 'developer',
    permissions: ['admin.orders.view', 'admin.developer'],
    hasPermission: () => true,
  }),
}));

vi.mock('@/admin/dashboard/hooks/useDashboardData', () => ({
  useStores: () => ({ data: [] }),
}));

// Presentation only: jsdom cannot complete exit animations deterministically,
// so AnimatePresence would keep a closed drawer mounted indefinitely. Render
// motion elements as plain elements and let exits unmount immediately; the
// oracle is the page's owned state, not animation timing.
vi.mock('motion/react', async () => {
  const ReactModule = await import('react');
  const motionOnly = new Set(['initial', 'animate', 'exit', 'transition', 'layout', 'whileHover', 'whileTap', 'variants']);
  const element = (tag: string) =>
    ReactModule.forwardRef<unknown, Record<string, unknown>>((props, ref) =>
      ReactModule.createElement(tag, {
        ...Object.fromEntries(Object.entries(props).filter(([key]) => !motionOnly.has(key))),
        ref,
      }));
  // One stable component per tag, so re-renders do not remount the subtree.
  const components = new Map<string, ReturnType<typeof element>>();
  return {
    motion: new Proxy({}, {
      get: (_target, tag: string) => {
        if (!components.has(tag)) components.set(tag, element(tag));
        return components.get(tag);
      },
    }),
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
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
    const wheres = constraints.filter((c: any) => c.kind === 'where');
    const ordering = constraints.find((c: any) => c.kind === 'orderBy');
    let rows = h.docs.filter((row) =>
      wheres.every((c: any) => {
        const value = valueAtPath(row.data, String(c.field));
        if (c.op === 'in') return (c.value as unknown[]).includes(value);
        return value === c.value;
      })
    );
    if (ordering) {
      rows = rows
        .filter((row) => row.data[ordering.field] !== undefined)
        .sort((a, b) => {
          const delta = time(a.data[ordering.field]) - time(b.data[ordering.field]);
          return ordering.direction === 'desc' ? -delta : delta;
        });
    }
    const cap = constraints.find((c: any) => c.kind === 'limit')?.value ?? Infinity;
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
    where: (field: string, op: string, value: unknown) => ({ kind: 'where', field, op, value }),
    orderBy: (field: string, direction?: string) => ({ kind: 'orderBy', field, direction }),
    limit: (value: number) => ({ kind: 'limit', value }),
    query: (collectionRef: any, ...constraints: unknown[]) => ({ kind: 'query', collectionRef, constraints }),
    getDoc: vi.fn(async () => ({
      exists: () => h.registry !== null,
      data: () => h.registry,
      metadata: { fromCache: h.registryFromCache, hasPendingWrites: h.registryPendingWrites },
    })),
    getDocs: vi.fn(async (target: any) => {
      if (h.queryWait) await h.queryWait;
      return evaluate(target);
    }),
    onSnapshot: (target: any, optionsOrNext: any, nextOrError?: any, maybeError?: any) => {
      const isDoc = target?.kind === 'doc';
      const next = typeof optionsOrNext === 'function' ? optionsOrNext : nextOrError;
      const error = typeof optionsOrNext === 'function' ? nextOrError : maybeError;
      const listener = { next, error, stopped: false };
      if (isDoc) {
        h.registryListeners.push(listener);
      }
      return () => {
        listener.stopped = true;
      };
    },
    Timestamp: { now: () => ({ seconds: Date.now() / 1000, nanoseconds: 0 }) },
  };
});

import { AdminOrdersPage } from '@/admin/pages/AdminOrdersPage';
import { adminOrdersService, toRichOrderForTest } from '@/admin/services/adminOrdersService';
import { useAuthStore } from '@/stores/authStore';

let root: Root;
let container: HTMLDivElement;

function createDummyRichOrder(id: string, branchId: string, status: RichOrder['orderStatus'] = 'Completed'): RichOrder {
  return toRichOrderForTest(id, {
    shortCode: id, branchId, store: { id: branchId, name: `Branch ${branchId}` },
    status: status === 'Completed' ? 'delivered' : 'pending',
    paymentStatus: 'completed', paymentMethod: 'cod', orderType: 'takeaway',
    items: [], subtotal: 100, tax: 5, total: 105, createdAt: Date.now(),
  });
}

describe('Admin history scope and cross-scope ownership regression', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    h.user = {
      id: 'user_a',
      role: 'branch_owner' as UserRole,
      branchIds: ['branch_a'],
      name: 'Owner A',
      email: 'a@example.com',
    };
    h.assignedStoreIds = ['branch_a'];
    h.selectedBranchId = null;
    h.docs = [];
    h.registry = null;
    h.registryFromCache = false;
    h.registryPendingWrites = false;
    h.registryListeners = [];
    h.queryWait = null;
    h.deferredHistoryResolvers = [];

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('regression: delayed history promise from Operator A resolving after switch to Operator B must NOT repaint A data under B', async () => {
    // Intercept adminOrdersService.getHistory to return deferred promises
    let deferredA: { resolve: (val: RichOrder[]) => void; reject: (err: any) => void } | null = null;
    let deferredB: { resolve: (val: RichOrder[]) => void; reject: (err: any) => void } | null = null;
    let callCount = 0;

    vi.spyOn(adminOrdersService, 'getHistory').mockImplementation(() => {
      callCount++;
      return new Promise<RichOrder[]>((resolve, reject) => {
        if (callCount === 1) {
          deferredA = { resolve, reject };
        } else {
          deferredB = { resolve, reject };
        }
      });
    });

    // Mount AdminOrdersPage in history mode for Operator A (branch_owner for branch_a)
    await act(async () => {
      root.render(<MemoryRouter><AdminOrdersPage defaultTab="history" /></MemoryRouter>);
    });

    expect(callCount).toBe(1);
    expect(deferredA).not.toBeNull();

    // Now switch auth to Operator B (branch_owner for branch_b) with unchanged UI filter ("all"/null)
    h.user = {
      id: 'user_b',
      role: 'branch_owner' as UserRole,
      branchIds: ['branch_b'],
      name: 'Owner B',
      email: 'b@example.com',
    };
    h.assignedStoreIds = ['branch_b'];
    (useAuthStore as any)._emitChange();

    await act(async () => {
      root.render(<MemoryRouter><AdminOrdersPage defaultTab="history" /></MemoryRouter>);
    });

    // A's request resolves only after B owns the page: it must not repaint.
    await act(async () => {
      deferredA!.resolve([createDummyRichOrder('ord_a_1', 'branch_a')]);
    });
    expect(container.textContent).not.toContain('ord_a_1');
    expect(container.textContent).not.toContain('Branch branch_a');

    // When Operator B's deferred promise resolves, only Operator B's orders appear
    expect(deferredB).not.toBeNull();
    await act(async () => {
      deferredB!.resolve([createDummyRichOrder('ord_b_1', 'branch_b')]);
    });
    expect(container.textContent).toContain('ord_b_1');
  });

  it('regression: settled history rows and open selected order drawer must be cleared immediately on logout or role change', async () => {
    const orderA = createDummyRichOrder('ord_settled_a', 'branch_a');
    // I/O model only: the service returns the signed-in operator's own history.
    vi.spyOn(adminOrdersService, 'getHistory').mockImplementation(async () =>
      h.user?.id === 'user_a' ? [orderA] : []);

    await act(async () => {
      root.render(<MemoryRouter><AdminOrdersPage defaultTab="history" defaultOrderId="ord_settled_a" /></MemoryRouter>);
    });

    // Verify order is rendered and selected drawer/modal details are active
    expect(container.textContent).toContain('ord_settled_a');

    // Operator logs out (user = null)
    h.user = null;
    h.assignedStoreIds = [];
    (useAuthStore as any)._emitChange();

    await act(async () => {
      root.render(<MemoryRouter><AdminOrdersPage defaultTab="history" /></MemoryRouter>);
    });

    // Neither the settled row nor its open drawer may survive the session.
    expect(container.textContent).not.toContain('ord_settled_a');
  });

  it('a regional registry revocation clears settled history and its drawer without any UI change', async () => {
    h.user = {
      id: 'reg_user_1',
      role: 'regional_manager' as UserRole,
      branchIds: ['session_forged_claim'],
      name: 'Reg Manager',
      email: 'reg@example.com',
    };
    h.assignedStoreIds = [];
    h.registry = { role: 'regional_manager', branchIds: ['branch_reg_1'] };
    h.docs = [{
      id: 'ord_reg_1',
      data: {
        shortCode: 'ord_reg_1', branchId: 'branch_reg_1', store: { id: 'branch_reg_1', name: 'Branch 1' },
        status: 'delivered', paymentStatus: 'completed', paymentMethod: 'cod', orderType: 'takeaway',
        items: [], subtotal: 100, tax: 5, total: 105, createdAt: Date.now(),
      },
    }];
    const settle = () => act(async () => {
      for (let i = 0; i < 50; i += 1) await Promise.resolve();
    });
    // Server-confirmed registry snapshots, delivered to whatever listener the
    // page holds. An implementation without a listener receives nothing.
    const emitRegistry = () => act(async () => {
      for (const listener of h.registryListeners.filter((entry) => !entry.stopped)) {
        listener.next({
          exists: () => h.registry !== null,
          data: () => h.registry,
          metadata: { fromCache: false, hasPendingWrites: false },
        });
      }
    });

    await act(async () => {
      root.render(<MemoryRouter><AdminOrdersPage defaultTab="history" defaultOrderId="ord_reg_1" /></MemoryRouter>);
    });
    await emitRegistry();
    await settle();
    expect(container.textContent).toContain('ord_reg_1');

    // Revoked on the server; the operator's session and outlet filter are unchanged.
    h.registry = { role: 'regional_manager', branchIds: [] };
    await emitRegistry();
    await settle();
    expect(container.textContent).not.toContain('ord_reg_1');
  });

  it('regression: authoritative regional registry revocation clears settled history rows and selection with unchanged UI filter', async () => {
    // Regional manager with server-confirmed assignment to branch_reg_1
    h.user = {
      id: 'reg_user_1',
      role: 'regional_manager' as UserRole,
      branchIds: ['session_forged_claim'],
      name: 'Reg Manager',
      email: 'reg@example.com',
    };
    h.assignedStoreIds = [];
    h.registry = {
      role: 'regional_manager',
      branchIds: ['branch_reg_1'],
    };

    h.docs = [
      {
        id: 'ord_reg_1',
        data: {
          id: 'ord_reg_1',
          branchId: 'branch_reg_1',
          shortCode: 'ord_reg_1',
          status: 'delivered',
          paymentStatus: 'completed',
          paymentMethod: 'upi',
          store: { id: 'branch_reg_1', name: 'Branch 1' },
          createdAt: Date.now(),
        },
      },
    ];

    // Real adminOrdersService.getHistory call with controlled Firestore docs
    const historyOrders = await adminOrdersService.getHistory(null);
    expect(historyOrders.map((o) => o.id)).toContain('ord_reg_1');

    // Now registry is revoked on server (empty branchIds or null)
    h.registry = {
      role: 'regional_manager',
      branchIds: [],
    };

    // Immediate re-fetch under revoked registry must return empty (fail closed)
    const revokedHistory = await adminOrdersService.getHistory(null);
    expect(revokedHistory).toEqual([]);

    // Stale cached registry snapshot must also be refused
    h.registry = {
      role: 'regional_manager',
      branchIds: ['branch_reg_1'],
    };
    h.registryFromCache = true;
    const cachedHistory = await adminOrdersService.getHistory(null);
    expect(cachedHistory).toEqual([]);
  });
});
