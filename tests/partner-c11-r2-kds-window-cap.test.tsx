// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F6 r2 / HIGH — `useOrders` caps every read at `OPEN_ORDER_PAGE_SIZE` (500 per
 * chunk, then a 500-row slice of the merged chunks) and used to say nothing.
 *
 * The regional KDS path reads through THIS hook, so the makeline showed a
 * "complete" board while a 501st still-open ticket vanished with no notice. The
 * fix surfaces the cap as DATA (`windowCapped`) instead of leaving each
 * surface to remember it. Big Pickle r2 finding 1.
 *
 * Uses the REAL hook and a REAL QueryClient; only Firestore is stubbed.
 */
const h = vi.hoisted(() => ({
  user: { id: 'userA', role: 'branch_owner', branchIds: ['branch_y', 'branch_z'], cityIds: [] } as any,
  docs: [] as any[],
  listeners: [] as Array<{
    target: any;
    next: (snapshot: any) => void;
    error: (error: Error) => void;
    stopped: boolean;
  }>,
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ kind: 'collection', name }),
  doc: (_db: unknown, name: string, id: string) => ({ kind: 'doc', name, id }),
  query: (...parts: any[]) => ({ kind: 'query', parts }),
  orderBy: (field: string, direction?: string) => ({ kind: 'orderBy', field, direction }),
  limit: (value: number) => ({ kind: 'limit', value }),
  where: (field: string, op: string, value: unknown) => ({ kind: 'where', field, op, value }),
  getDocs: async () => ({
    docs: h.docs.map((row) => ({ id: row.id, data: () => row })),
    size: h.docs.length,
  }),
  onSnapshot: (target: any, next: any, error: any) => {
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
  useAuthStore: Object.assign(() => ({ user: h.user }), {
    getState: () => ({ user: h.user }),
  }),
}));
vi.mock('@/stores/appStore', () => ({
  useAppStore: Object.assign(
    () => ({ selectedCity: null, selectedBranchId: null }),
    { getState: () => ({ selectedCity: null, selectedBranchId: null }) },
  ),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/utils/orderContract', async (original) => ({
  ...(await original<typeof import('@/utils/orderContract')>()),
  fetchAliasedStoreOrders: vi.fn(async () => []),
}));

import { useEffect } from 'react';
import { useOrders } from '@/hooks/useOrders';

type OrdersResult = ReturnType<typeof useOrders>;
/**
 * The last committed hook result. Written from an EFFECT, not during render:
 * a render-phase write into module state is a side effect (React's compiler
 * rules flag it), while an effect is exactly "synchronise with something
 * outside React". `act()` flushes effects on exit, so every assertion below
 * still reads the value from the render it just awaited.
 */
const captured: { value: OrdersResult | null } = { value: null };

function Harness(): React.ReactElement {
  const result = useOrders();
  useEffect(() => {
    captured.value = result;
  });
  return <div>{result.orders.length}</div>;
}

const orderRow = (id: string, branchId: string, ms: number) => ({
  id,
  branchId,
  status: 'pending',
  paymentMethod: 'cod',
  items: [],
  total: 100,
  createdAt: { toMillis: () => ms },
});

describe('useOrders — the page cap is surfaced as data (r2 finding 1)', () => {
  let root: Root | null = null;
  let container: HTMLDivElement;
  let client: QueryClient;
  const actFlagBefore = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    h.user = { id: 'userA', role: 'branch_owner', branchIds: ['branch_y', 'branch_z'], cityIds: [] };
    h.docs = [];
    h.listeners = [];
    captured.value = null;
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = null;
    container?.remove();
    client.clear();
    captured.value = null;
  });

  afterAll(() => {
    if (actFlagBefore) {
      Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', actFlagBefore);
    } else {
      Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    }
  });

  async function unmount() {
    if (root) await act(async () => root!.unmount());
    root = null;
    container?.remove();
  }

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
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  const activeListeners = () =>
    h.listeners.filter((listener) => listener.target.kind === 'query' && !listener.stopped);

  /** Deliver one snapshot to one specific chunk listener. */
  async function emitTo(listener: { next: (snapshot: any) => void }, rows: any[]) {
    await act(async () => {
      listener.next({ docs: rows.map((row) => ({ id: row.id, data: () => row })) });
    });
    await settle();
  }

  it('reports a full chunk as capped and a short page as complete', async () => {
    await mount();
    // Nothing is claimed before a real snapshot.
    expect(captured.value!.windowCapped).toBe(false);

    const listener = activeListeners()[0];
    await emitTo(listener, Array.from({ length: 500 }, (_, i) => orderRow(`y_${i}`, 'branch_y', i)));
    expect(captured.value!.orders.length).toBe(500);
    expect(captured.value!.windowCapped).toBe(true);

    // A short page proves the window is complete — the flag must clear.
    await emitTo(listener, [orderRow('y_1', 'branch_y', 1), orderRow('y_2', 'branch_y', 2)]);
    expect(captured.value!.windowCapped).toBe(false);
  });

  it('reports a merged multi-chunk window sliced down to the page size as capped', async () => {
    // 11 assigned outlets split into chunks of 10 + 1, so two pages can each be
    // SHORT while the merged board still hits the 500-row cap.
    h.user = {
      id: 'userA',
      role: 'branch_owner',
      branchIds: Array.from({ length: 11 }, (_, i) => `b${i}`),
      cityIds: [],
    };
    await mount();
    const chunks = activeListeners();
    expect(chunks.length).toBe(2);

    await emitTo(chunks[0], Array.from({ length: 250 }, (_, i) => orderRow(`b0_${i}`, 'b0', i)));
    await emitTo(chunks[1], Array.from({ length: 250 }, (_, i) => orderRow(`b10_${i}`, 'b10', 1000 + i)));

    expect(captured.value!.orders.length).toBe(500);
    // Neither page was full, so only the merged slice reveals the truncation.
    expect(captured.value!.windowCapped).toBe(true);
  });

  it('reports the unscoped (brand) page bound too — the same 500 cap', async () => {
    h.user = { id: 'brandA', role: 'brand_owner', branchIds: [], cityIds: [] };
    h.docs = Array.from({ length: 500 }, (_, i) => orderRow(`g_${i}`, 'branch_y', i));
    await mount();
    await settle();

    expect(captured.value!.windowCapped).toBe(true);

    await unmount();
    h.user = { id: 'brandB', role: 'brand_owner', branchIds: [], cityIds: [] };
    h.docs = Array.from({ length: 3 }, (_, i) => orderRow(`h_${i}`, 'branch_y', i));
    await mount();
    await settle();
    expect(captured.value!.windowCapped).toBe(false);
  });
});
