import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createRequire } from 'node:module';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F1 — board data age must be owned by the makeline snapshot only.
 *
 * `lastRefreshAt` used to be reset by an effect watching useOrders' HTTP
 * polling (30s refetch), so a silently stalled onSnapshot still rendered a
 * "seconds old" board while the three columns were frozen. The oracle here is
 * the real hook's returned `lastRefreshAt`:
 *  - a poll that changes `orders` but delivers no snapshot must NOT move it,
 *  - an actual snapshot ingest MUST move it,
 *  - a Refresh tap alone must NOT move it.
 */
const h = vi.hoisted(() => {
  const user = { id: 'u1', name: 'Op', role: 'branch_owner', branchIds: ['branch_1'], cityIds: [] };
  return {
    user,
    snapshots: [] as Array<{ next: (snap: unknown) => void; error: (err: unknown) => void }>,
    ordersHolder: { orders: [] as any[], isLoading: false, error: null as unknown },
  };
});

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ name })),
  query: vi.fn((...parts: unknown[]) => ({ parts })),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  onSnapshot: vi.fn((_q: unknown, next: (snap: unknown) => void, error: (err: unknown) => void) => {
    h.snapshots.push({ next, error });
    return () => {};
  }),
  getDocs: vi.fn(async () => ({ docs: [] })),
}));
vi.mock('@/config/firebase', () => ({ app: {}, auth: {}, db: {}, messaging: null }));
vi.mock('@/core/config/firebase', () => ({ db: {} }));
vi.mock('@/hooks/useOrders', () => ({
  useOrders: () => ({
    orders: h.ordersHolder.orders,
    isLoading: h.ordersHolder.isLoading,
    error: h.ordersHolder.error,
    updateOrderStatus: { mutateAsync: vi.fn() },
  }),
}));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ user: h.user }) }));
vi.mock('@/stores/appStore', () => ({
  useAppStore: () => ({ selectedBranchId: 'branch_1', setSelectedBranchId: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/utils/kdsAudio', () => ({
  playKDSArrivalCue: vi.fn(),
  resetKDSAlarmState: vi.fn(),
  syncKDSAlarmState: vi.fn(),
  isKDSAudioMuted: vi.fn(() => true),
  setKDSAudioMuted: vi.fn(),
  unlockKDSAudio: vi.fn(async () => true),
  isKDSAudioUnlocked: vi.fn(() => true),
  acknowledgeKDSAlarm: vi.fn(),
  playKDSChime: vi.fn(),
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useKDSRealtimeStream } from '@/features/kds/hooks/useKDSRealtimeStream';

// Reuse the workspace's existing DOM install; no new package dependency.
const require = createRequire(import.meta.url);
const { JSDOM } = require('../../burgonomics-foundation-core/node_modules/jsdom/lib/api.js') as {
  JSDOM: new (html: string, options?: { url?: string }) => { window: Window & typeof globalThis };
};

type Stream = ReturnType<typeof useKDSRealtimeStream>;
let latest: Stream | null = null;

function Harness(): React.ReactElement {
  const stream = useKDSRealtimeStream();
  latest = stream;
  return <div data-testid="age">{stream.lastRefreshAt}</div>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('KDS board data age is owned by the makeline snapshot', () => {
  let root: Root;
  let container: HTMLDivElement;
  let client: QueryClient;
  const originalGlobals = new Map<string, PropertyDescriptor | undefined>();

  beforeAll(() => {
    const { window } = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
    const globals: Record<string, unknown> = {
      window,
      document: window.document,
      HTMLElement: window.HTMLElement,
      navigator: window.navigator,
      localStorage: window.localStorage,
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    for (const [key, value] of Object.entries(globals)) {
      originalGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    }
  });

  beforeEach(() => {
    h.snapshots.length = 0;
    h.ordersHolder.orders = [];
    h.ordersHolder.isLoading = false;
    h.ordersHolder.error = null;
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    container?.remove();
    latest = null;
  });

  afterAll(() => {
    for (const [key, descriptor] of originalGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });

  async function mount() {
    client = new QueryClient();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <Harness />
        </QueryClientProvider>
      );
    });
  }

  async function rerender() {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <Harness />
        </QueryClientProvider>
      );
    });
  }

  it('stamps the age when the makeline stream ingests a snapshot', async () => {
    await mount();
    const mountedAt = latest!.lastRefreshAt;
    await sleep(20);
    await act(async () => {
      h.snapshots[0].next({ docs: [] });
    });
    expect(latest!.lastRefreshAt).toBeGreaterThan(mountedAt);
  });

  it('does NOT stamp the age when the 30s HTTP poll returns rows but the stream delivered nothing new', async () => {
    await mount();
    await sleep(20);
    await act(async () => {
      h.snapshots[0].next({ docs: [] });
    });
    const streamStamp = latest!.lastRefreshAt;
    expect(h.snapshots).toHaveLength(1);

    // Simulate useOrders' background refetch succeeding while the onSnapshot
    // listener stays quiet: new `orders` identity, no snapshot delivery.
    await sleep(20);
    h.ordersHolder.orders = [
      {
        id: 'ord_poll',
        status: 'pending',
        orderType: 'delivery',
        branchId: 'branch_1',
        customerName: 'Poll Row',
        items: [],
        createdAt: 1761300000000,
      },
    ];
    await rerender();

    expect(latest!.lastRefreshAt).toBe(streamStamp);
  });

  it('does NOT stamp the age on a Refresh tap before a snapshot arrives', async () => {
    await mount();
    await sleep(20);
    await act(async () => {
      h.snapshots[0].next({ docs: [] });
    });
    const streamStamp = latest!.lastRefreshAt;

    await sleep(20);
    await act(async () => {
      latest!.refresh();
    });

    expect(latest!.lastRefreshAt).toBe(streamStamp);
  });
});
