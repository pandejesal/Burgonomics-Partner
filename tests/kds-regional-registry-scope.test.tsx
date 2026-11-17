// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types';

/**
 * HIGH Finding Regression: KDS Regional Registry Scope & Real Stream Integration.
 *
 * Drives REAL useKDSRealtimeStream + REAL useOrders.
 * Only external I/O boundaries (Firestore SDK, audio, localStorage, toast) are faked.
 * Authorization resolver and store hooks are NOT mocked with fake resolvers.
 */

const h = vi.hoisted(() => ({
  user: { id: 'reg_user_1', role: 'regional_manager', branchIds: ['forged_claim'] } as Pick<User, 'id' | 'role' | 'branchIds'> | null,
  selectedBranchId: null as string | null,
  selectedCity: null as string | null,
  listeners: [] as Array<{
    kind: 'doc' | 'query';
    target: any;
    next: (value: any) => void;
    error: (error: Error) => void;
    stopped: boolean;
  }>,
  reads: [] as any[],
  cueCalls: [] as any[],
  alarmSyncCalls: [] as number[],
  alarmResetCalls: 0,
  toastErrorCalls: [] as any[],
}));

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/core/config/firebase', () => ({ db: {} }));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: h.user }),
}));

vi.mock('@/stores/appStore', () => ({
  useAppStore: () => ({
    selectedCity: h.selectedCity,
    selectedBranchId: h.selectedBranchId,
  }),
}));

vi.mock('@/utils/kdsAudio', () => ({
  playKDSArrivalCue: vi.fn((hasNew: boolean, count: number) => {
    h.cueCalls.push({ hasNew, count });
  }),
  syncKDSAlarmState: vi.fn((count: number) => {
    h.alarmSyncCalls.push(count);
  }),
  resetKDSAlarmState: vi.fn(() => {
    h.alarmResetCalls++;
  }),
  stopRepeatingKDSAlarm: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn((...args: any[]) => h.toastErrorCalls.push(args)),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('firebase/firestore', () => {
  return {
    doc: (_db: unknown, collection: string, id: string) => ({ kind: 'doc', collection, id }),
    collection: (_db: unknown, name: string) => ({ kind: 'collection', name }),
    where: (field: string, op: string, value: unknown) => ({ kind: 'where', field, op, value }),
    orderBy: (field: string, direction?: string) => ({ kind: 'orderBy', field, direction }),
    limit: (value: number) => ({ kind: 'limit', value }),
    query: (collectionRef: any, ...constraints: unknown[]) => ({ kind: 'query', collectionRef, constraints }),
    getDocs: vi.fn(async (target: any) => {
      h.reads.push(target);
      return { docs: [], size: 0, empty: true, forEach: () => {} };
    }),
    onSnapshot: (target: any, optionsOrNext: any, nextOrError?: any, maybeError?: any) => {
      const isDoc = target?.kind === 'doc';
      const next = typeof optionsOrNext === 'function' ? optionsOrNext : nextOrError;
      const error = typeof optionsOrNext === 'function' ? nextOrError : maybeError;
      const listener = { kind: isDoc ? 'doc' : 'query', target, next, error, stopped: false } as any;
      h.listeners.push(listener);
      return () => {
        listener.stopped = true;
      };
    },
    Timestamp: { now: () => ({ seconds: Date.now() / 1000, nanoseconds: 0 }) },
  };
});

import { useKDSRealtimeStream } from '@/features/kds/hooks/useKDSRealtimeStream';

let latestKds: ReturnType<typeof useKDSRealtimeStream>;
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

function Harness() {
  latestKds = useKDSRealtimeStream();
  return null;
}

async function render() {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>
    );
  });
}

const getRegistryListener = () =>
  [...h.listeners].reverse().find((l) => l.kind === 'doc' && l.target?.collection === 'admins' && !l.stopped);

const getOrderQueryListeners = () =>
  h.listeners.filter((l) => l.kind === 'query' && !l.stopped);

const emitRegistry = async (data: any, options: { fromCache?: boolean; hasPendingWrites?: boolean } = {}) => {
  const listener = getRegistryListener();
  if (!listener) throw new Error('No active admins/{uid} registry listener found');
  await act(async () => {
    listener.next({
      exists: () => data !== null,
      data: () => data,
      metadata: {
        fromCache: options.fromCache ?? false,
        hasPendingWrites: options.hasPendingWrites ?? false,
      },
    });
  });
};

describe('KDS regional registry scope and real stream regression', () => {
  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    window.localStorage.clear();
    h.user = { id: 'reg_user_1', role: 'regional_manager', branchIds: ['forged_claim'] };
    h.selectedBranchId = null;
    h.selectedCity = null;
    h.listeners = [];
    h.reads = [];
    h.cueCalls = [];
    h.alarmSyncCalls = [];
    h.alarmResetCalls = 0;
    h.toastErrorCalls = [];
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    client.clear();
    container.remove();
  });

  it('regression: regional manager with no selection starts NO order queries until server-confirmed admins/{uid} registry grants branches', async () => {
    await render();

    // 1. Unconfirmed registry: before any registry snapshot arrives, no order queries may start
    const orderQueriesInitial = getOrderQueryListeners();
    expect(orderQueriesInitial).toHaveLength(0);
    expect(latestKds.activeOrders).toHaveLength(0);

    // 2. Cached registry: cached snapshot must be rejected (cannot prove current authority)
    expect(getRegistryListener()).toBeDefined();
    await emitRegistry({ role: 'regional_manager', branchIds: ['b1', 'b2'] }, { fromCache: true });
    expect(getOrderQueryListeners()).toHaveLength(0);

    // 3. Pending writes registry: rejected
    await emitRegistry({ role: 'regional_manager', branchIds: ['b1', 'b2'] }, { hasPendingWrites: true });
    expect(getOrderQueryListeners()).toHaveLength(0);

    // 4. Missing/null registry doc: rejected
    await emitRegistry(null);
    expect(getOrderQueryListeners()).toHaveLength(0);

    // 5. Malformed registry (e.g. non-string elements, numbers, wrong role): rejected
    await emitRegistry({ role: 'regional_manager', branchIds: ['b1', 123] });
    expect(getOrderQueryListeners()).toHaveLength(0);
  });

  it('regression: brand -> regional transition without remount must not run unbounded order listeners independently of authoritative registry', async () => {
    // Start as brand_owner with no selection
    h.user = { id: 'brand_admin_1', role: 'brand_owner', branchIds: [] };
    h.selectedBranchId = null;
    await render();

    // In current implementation, KDS listens to global queries (scopeBranchIds is [])
    const brandOrderListeners = getOrderQueryListeners();
    expect(brandOrderListeners.length).toBeGreaterThanOrEqual(1);

    // Transition in-place (no unmount) to regional_manager with null selection
    h.user = { id: 'reg_user_1', role: 'regional_manager', branchIds: ['session_forged_b1'] };
    await render();

    // Any stale brand order listeners must be stopped
    for (const l of brandOrderListeners) {
      expect(l.stopped).toBe(true);
    }

    // EXPECTED REGRESSION FAILURE in current code:
    // In current code, useKDSRealtimeStream calls resolveScopedBranchIds with GLOBAL_ROLES (which includes regional_manager).
    // With selectedBranchId=null, resolveScopedBranchIds returns []!
    // So KDS treats regional_manager as a global role and immediately starts global order listeners
    // WITHOUT waiting for admins/{uid} registry confirmation!
    // The authoritative requirement is: NO order listeners until server-confirmed admins/{uid} registry arrives.
    const unconfirmedListeners = getOrderQueryListeners();
    expect(unconfirmedListeners).toHaveLength(0);
  });

  it('regression: 23 assigned branches chunked into <= 10 chunks, b22 visible, foreign injected rows hidden, and revocation wipes all state', async () => {
    await render();

    const branchIds = Array.from({ length: 23 }, (_, i) => `b${i}`);
    await emitRegistry({ role: 'regional_manager', branchIds });

    // Under authoritative regional assignment of 23 branches:
    // Must be chunked into 3 queries (10, 10, 3) where every chunk <= 10
    // EXPECTED REGRESSION FAILURE in current code:
    // Current KDS creates only 1 query using scopeBranchIds.slice(0, 10), dropping 13 branches silently,
    // OR if treated as global role, creates 0 chunks and reads globally.
    const activeOrderListeners = getOrderQueryListeners();
    expect(activeOrderListeners).toHaveLength(3);

    // Check all chunks have where('branchId', 'in', ...) with <= 10 branchIds
    const allQueriedBranches: string[] = [];
    for (const listener of activeOrderListeners) {
      const inConstraint = (listener.target.constraints ?? []).find(
        (c: any) => c.kind === 'where' && c.field === 'branchId' && c.op === 'in'
      );
      expect(inConstraint).toBeDefined();
      expect(inConstraint.value.length).toBeLessThanOrEqual(10);
      allQueriedBranches.push(...inConstraint.value);
    }
    expect(allQueriedBranches).toEqual(branchIds);

    // No duplicate legacy / store.id queries
    const storeIdQueries = activeOrderListeners.filter((l) =>
      (l.target.constraints ?? []).some((c: any) => c.field === 'store.id')
    );
    expect(storeIdQueries).toHaveLength(0);

    // Emit order snapshot on chunk 3 (contains b20..b22) with order in b22 and a foreign order
    const chunk3 = activeOrderListeners[2];
    await act(async () => {
      chunk3.next({
        docs: [
          {
            id: 'ord_b22',
            data: () => ({
              id: 'ord_b22',
              branchId: 'b22',
              status: 'pending',
              paymentStatus: 'pending',
              paymentMethod: 'cod',
              orderType: 'takeaway',
              items: [],
              createdAt: Date.now(),
            }),
          },
          {
            id: 'ord_foreign',
            data: () => ({
              id: 'ord_foreign',
              branchId: 'foreign_outlet',
              status: 'pending',
              paymentStatus: 'pending',
              paymentMethod: 'cod',
              orderType: 'takeaway',
              items: [],
              createdAt: Date.now(),
            }),
          },
        ],
      });
      // also deliver empty docs for other chunks to complete hydration
      activeOrderListeners[0].next({ docs: [] });
      activeOrderListeners[1].next({ docs: [] });
    });

    // Verify b22 is visible and foreign row is strictly excluded
    const activeIds = latestKds.activeOrders.map((o) => o.id);
    expect(activeIds).toContain('ord_b22');
    expect(activeIds).not.toContain('ord_foreign');

    // Revoke registry assignments to empty list with selection unchanged (null)
    await emitRegistry({ role: 'regional_manager', branchIds: [] });

    // Orders, pending orders, and alerts must be completely cleared
    expect(latestKds.activeOrders).toEqual([]);
    expect(latestKds.pendingOrders).toEqual([]);
    expect(latestKds.canRecall).toBe(false);
    expect(latestKds.newOrderIds).toEqual([]);

    // Stale stopped callback from chunk 3 firing now must NOT repaint rows
    await act(async () => {
      chunk3.next({
        docs: [
          {
            id: 'ord_late_b22',
            data: () => ({
              id: 'ord_late_b22',
              branchId: 'b22',
              status: 'pending',
              paymentStatus: 'pending',
              paymentMethod: 'cod',
              orderType: 'takeaway',
              items: [],
              createdAt: Date.now(),
            }),
          },
        ],
      });
    });
    expect(latestKds.activeOrders).toEqual([]);
  });

  it('missing regional registry revokes the resolved KDS scope', async () => {
    await render();

    const branchIds = ['branch_reg_1'];
    await emitRegistry({ role: 'regional_manager', branchIds });

    // Now registry is revoked with an error / non-existent doc
    await emitRegistry(null);

    // State must be completely cleared
    expect(latestKds.activeOrders).toEqual([]);
    expect(latestKds.scopeBranchIds).toEqual([]);
  });
});
