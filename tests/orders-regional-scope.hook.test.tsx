// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({
  user: { id: 'one', role: 'regional_manager', branchIds: ['forged'] },
  selection: null as string | null,
  listeners: [] as Array<{ target: any; next: (value: any) => void; error: (error: Error) => void; stopped: boolean }>,
  reads: 0,
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ user: boundary.user }) }));
vi.mock('@/stores/appStore', () => ({ useAppStore: () => ({ selectedCity: null, selectedBranchId: boundary.selection }) }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collection: string, id: string) => ({ kind: 'doc', collection, id }),
  collection: (_db: unknown, name: string) => ({ kind: 'collection', name }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: (field: string) => ({ orderBy: field }),
  limit: (value: number) => ({ limit: value }),
  query: (...parts: unknown[]) => ({ kind: 'query', parts }),
  getDocs: vi.fn(async () => { boundary.reads++; return { docs: [] }; }),
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

let latest: ReturnType<typeof useOrders>;
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
function Harness() { latest = useOrders(); return null; }
async function render() {
  await act(async () => { root.render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>); });
}
const registry = () => [...boundary.listeners].reverse().find((listener) => listener.target.kind === 'doc' && !listener.stopped)!;
const orderListeners = () => boundary.listeners.filter((listener) => listener.target.kind === 'query' && !listener.stopped);
const emitRegistry = async (data: unknown) => act(async () => registry().next({ exists: () => data !== null, data: () => data, metadata: { fromCache: false } }));

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  boundary.user = { id: 'one', role: 'regional_manager', branchIds: ['forged'] };
  boundary.selection = null; boundary.listeners = []; boundary.reads = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await render();
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); });

it('denies missing registry and forged selection before any order query', async () => {
  await emitRegistry(null);
  expect(orderListeners()).toHaveLength(0);
  expect(boundary.reads).toBe(0);
  boundary.selection = 'foreign'; await render();
  await emitRegistry({ role: 'regional_manager', branchIds: ['allowed'] });
  expect(orderListeners()).toHaveLength(0);
  expect(latest.orders).toEqual([]);
});

it('subscribes to every assigned branch in chunks and fences old session callbacks', async () => {
  const ids = Array.from({ length: 23 }, (_, i) => `b${i}`);
  await emitRegistry({ role: 'regional_manager', branchIds: ids });
  const listeners = orderListeners();
  expect(listeners).toHaveLength(3);
  expect(listeners.map((listener) => listener.target.parts.find((part: any) => part.op === 'in').value)).toEqual([ids.slice(0, 10), ids.slice(10, 20), ids.slice(20)]);
  await act(async () => listeners[2].next({ docs: [{ id: 'order', data: () => ({ branchId: 'b22', createdAt: 10 }) }] }));
  expect(latest.orders).toEqual([]);
  await act(async () => { listeners[0].next({ docs: [] }); listeners[1].next({ docs: [] }); });
  expect(latest.orders.map((order) => order.id)).toContain('order');
  boundary.user = { id: 'two', role: 'regional_manager', branchIds: ['forged'] }; await render();
  expect(latest.orders).toEqual([]);
  expect(listeners.every((listener) => listener.stopped)).toBe(true);
  await act(async () => listeners[2].next({ docs: [{ id: 'late', data: () => ({ branchId: 'b22', createdAt: 20 }) }] }));
  expect(latest.orders).toEqual([]);
});

it('rejects cached or malformed registry data and clears rows on revocation', async () => {
  await act(async () => registry().next({ exists: () => true, data: () => ({ role: 'regional_manager', branchIds: ['a'] }), metadata: { fromCache: true } }));
  expect(orderListeners()).toHaveLength(0);
  await emitRegistry({ role: 'regional_manager', branchIds: ['a', 1] });
  expect(orderListeners()).toHaveLength(0);
  await emitRegistry({ role: 'regional_manager', branchIds: ['a'] });
  const old = orderListeners()[0];
  await act(async () => old.next({ docs: [{ id: 'visible', data: () => ({ branchId: 'a', createdAt: 1 }) }] }));
  expect(latest.orders.map((order) => order.id)).toEqual(['visible']);
  await emitRegistry({ role: 'regional_manager', branchIds: [] });
  expect(old.stopped).toBe(true);
  expect(latest.orders).toEqual([]);
  await act(async () => old.next({ docs: [{ id: 'late', data: () => ({ branchId: 'a', createdAt: 2 }) }] }));
  expect(latest.orders).toEqual([]);
});

it('surfaces listener errors and unsubscribes all chunks', async () => {
  await emitRegistry({ role: 'regional_manager', branchIds: Array.from({ length: 11 }, (_, i) => `b${i}`) });
  const listeners = orderListeners();
  await act(async () => listeners[0].error(new Error('permission denied')));
  expect(latest.error?.message).toBe('permission denied');
  expect(latest.orders).toEqual([]);
  expect(listeners.every((listener) => listener.stopped)).toBe(true);
});

it('narrows an authorised selection before starting its query', async () => {
  boundary.selection = 'b'; await render();
  await emitRegistry({ role: 'regional_manager', branchIds: ['a', 'b'] });
  expect(orderListeners()).toHaveLength(1);
  expect(orderListeners()[0].target.parts.find((part: any) => part.op === 'in').value).toEqual(['b']);
});

it('merges and orders all chunks without accepting a foreign branch row', async () => {
  await emitRegistry({ role: 'regional_manager', branchIds: Array.from({ length: 11 }, (_, i) => `b${i}`) });
  const listeners = orderListeners();
  await act(async () => {
    listeners[0].next({ docs: [
      { id: 'older', data: () => ({ branchId: 'b0', createdAt: 1 }) },
      { id: 'foreign', data: () => ({ branchId: 'not-assigned', createdAt: 99 }) },
    ] });
    listeners[1].next({ docs: [{ id: 'newer', data: () => ({ branchId: 'b10', createdAt: 2 }) }] });
  });
  expect(latest.orders.map((order) => order.id)).toEqual(['newer', 'older']);
});

it('also chunks assigned branch staff reads without a global query', async () => {
  const ids = Array.from({ length: 11 }, (_, i) => `b${i}`);
  boundary.user = { id: 'staff', role: 'branch_staff', branchIds: ids }; await render();
  expect(orderListeners()).toHaveLength(2);
  expect(orderListeners().map((listener) => listener.target.parts.find((part: any) => part.op === 'in').value)).toEqual([ids.slice(0, 10), ids.slice(10)]);
  expect(boundary.reads).toBe(0);
});
