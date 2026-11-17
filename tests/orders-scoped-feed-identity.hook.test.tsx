// @vitest-environment jsdom
import React, { act, useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

/**
 * Regression: the scoped live feed must hand consumers STABLE identities.
 *
 * `useKDSRealtimeStream` seeds its makeline with
 * `useEffect(() => setLiveOrders(orders), [orders, ...])` until its own stream
 * hydrates. React Query's `data` keeps one array instance between renders, so
 * that effect ran once. The scoped registry feed rebuilt `orders` with
 * `.filter()` (and `refetch` with a fresh arrow) on EVERY render, so the effect
 * set state on every render, which rendered again: an unbounded loop that ran
 * the KDS suite's worker out of heap (partner-scoped-order-surfaces, 2 GB OOM).
 *
 * The oracle is consumer-visible: same rows => same array and same refetch
 * across renders, and a seeding consumer settles in a handful of renders.
 */

const boundary = vi.hoisted(() => ({
  user: { id: 'staff', role: 'branch_staff', branchIds: ['a'] } as any,
  listeners: [] as Array<{ target: any; next: (value: any) => void; error: (error: Error) => void; stopped: boolean }>,
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ user: boundary.user }) }));
vi.mock('@/stores/appStore', () => ({ useAppStore: () => ({ selectedCity: null, selectedBranchId: null }) }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collection: string, id: string) => ({ kind: 'doc', collection, id }),
  collection: (_db: unknown, name: string) => ({ kind: 'collection', name }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: (field: string) => ({ orderBy: field }),
  limit: (value: number) => ({ limit: value }),
  query: (...parts: unknown[]) => ({ kind: 'query', parts }),
  getDocs: vi.fn(async () => ({ docs: [] })),
  onSnapshot: (target: any, options: any, next: any, error: any) => {
    const listener = { target, next: typeof options === 'function' ? options : next, error: typeof options === 'function' ? next : error, stopped: false };
    boundary.listeners.push(listener);
    return () => { listener.stopped = true; };
  },
  Timestamp: { now: () => ({}) },
}));
vi.mock('@/utils/orderContract', () => ({
  fetchAliasedStoreOrders: vi.fn(async () => []),
  normalizeOrderDoc: (id: string, data: any) => ({ id, ...data }),
  orderDocTimeMs: (data: any) => data.createdAt ?? 0,
}));
import { useOrders } from '@/hooks/useOrders';

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
const orderListeners = () => boundary.listeners.filter((listener) => listener.target.kind === 'query' && !listener.stopped);
const emitRow = async () => act(async () => orderListeners()[0].next({
  docs: [{ id: 'o1', data: () => ({ branchId: 'a', createdAt: 1, status: 'pending' }) }],
}));

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  boundary.user = { id: 'staff', role: 'branch_staff', branchIds: ['a'] };
  boundary.listeners = [];
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); });

it('keeps orders and refetch identities stable across renders with unchanged rows', async () => {
  const seen: Array<ReturnType<typeof useOrders>> = [];
  function Harness({ tick }: { tick: number }) {
    seen.push(useOrders());
    return <span>{tick}</span>;
  }
  const render = (tick: number) => act(async () => {
    root.render(<QueryClientProvider client={client}><Harness tick={tick} /></QueryClientProvider>);
  });
  await render(0);
  await emitRow();
  const settled = seen.at(-1)!;
  expect(settled.orders.map((order) => order.id)).toEqual(['o1']);

  await render(1); // unrelated parent re-render, no new snapshot
  const after = seen.at(-1)!;
  expect(after).not.toBe(settled);
  expect(after.orders).toBe(settled.orders);
  expect(after.refetch).toBe(settled.refetch);
});

it('lets a KDS-style seeding consumer settle instead of re-rendering forever', async () => {
  let renders = 0;
  function Consumer() {
    renders += 1;
    const { orders } = useOrders();
    const [, setSeeded] = useState<unknown[]>([]);
    const guard = useRef(0);
    // Same shape as useKDSRealtimeStream's one-shot seeding effect. The guard
    // only stops a regression from exhausting the worker; it never hides one.
    useEffect(() => {
      if (orders.length === 0 || guard.current >= 40) return;
      guard.current += 1;
      setSeeded(orders);
    }, [orders]);
    return null;
  }
  await act(async () => {
    root.render(<QueryClientProvider client={client}><Consumer /></QueryClientProvider>);
  });
  const before = renders;
  await emitRow();
  expect(renders - before).toBeLessThan(8);
});
