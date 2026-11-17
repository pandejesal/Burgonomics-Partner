// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  user: {
    id: 'usr_staff_1',
    role: 'branch_staff',
    branchIds: ['br_cybercity_01'],
  } as any,
  selectedBranchId: 'br_cybercity_01' as string | null,
  productsDocs: [] as Array<{ id: string; data: () => Record<string, any> }>,
  getDocsCalls: 0,
  syncCalls: 0,
  autoSyncCalls: 0,
  queriedBranches: [] as string[],
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: Object.assign(
    (selector?: (s: any) => any) => (selector ? selector({ user: h.user }) : { user: h.user }),
    {
      getState: () => ({ user: h.user }),
      subscribe: vi.fn(() => () => {}),
    }
  ),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: h.user, loading: false }),
}));

vi.mock('@/stores/appStore', () => ({
  useAppStore: Object.assign(
    (selector?: (s: any) => any) =>
      selector ? selector({ selectedBranchId: h.selectedBranchId }) : { selectedBranchId: h.selectedBranchId },
    {
      getState: () => ({ selectedBranchId: h.selectedBranchId }),
      subscribe: vi.fn(() => () => {}),
    }
  ),
}));

vi.mock('@/config/firebase', () => ({
  db: { __mockDb: true },
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ __collection: name })),
  query: vi.fn((...args) => ({ __query: args })),
  where: vi.fn((field, op, val) => {
    if (field === 'branchId') {
      h.queriedBranches.push(val);
    }
    return { __where: [field, op, val] };
  }),
  getDocs: vi.fn(async () => {
    h.getDocsCalls++;
    return {
      empty: h.productsDocs.length === 0,
      docs: h.productsDocs,
    };
  }),
  doc: vi.fn(),
  Timestamp: {
    now: () => ({ seconds: 1234567890, nanoseconds: 0 }),
  },
}));

vi.mock('@/services/petpoojaSync', () => ({
  syncPetpoojaMenuForBranch: vi.fn(async () => {
    h.syncCalls++;
    return { success: true };
  }),
  checkAndAutoSyncMenu: vi.fn(async () => {
    h.autoSyncCalls++;
    return false;
  }),
  BURGONOMICS_63_ITEMS: [
    { id: 'prd_demo_1', name: 'Demo Burger', price: 100, inStock: true },
  ],
}));

import { useStrictWalkInMenu, useMenu } from '@/hooks/useMenu';

describe('tests/walkin-canonical-menu.hook.test.tsx: boundary & regression integration', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  let queryClient: QueryClient;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    notifyManager.setScheduler(queueMicrotask);
    notifyManager.setNotifyFunction((fn) => act(fn));
    h.getDocsCalls = 0;
    h.syncCalls = 0;
    h.autoSyncCalls = 0;
    h.queriedBranches = [];
    h.productsDocs = [];
    h.selectedBranchId = 'br_cybercity_01';
    h.user = { id: 'usr_staff_1', role: 'branch_staff', branchIds: ['br_cybercity_01'] };
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  async function flush(rounds = 18) {
    await act(async () => {
      for (let i = 0; i < rounds; i += 1) await Promise.resolve();
    });
  }

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
  });

  it('keeps catalog identities stable across renders before any catalog exists', async () => {
    // No outlet context: the query is disabled and nothing has loaded. A fresh
    // default object per render would hand consumers new arrays every render
    // (the KDS seeding loop pattern), so identities must hold.
    h.selectedBranchId = null;
    h.user = { id: 'usr_staff_1', role: 'branch_staff', branchIds: [] };
    const seen: Array<ReturnType<typeof useStrictWalkInMenu>> = [];
    function Probe({ tick }: { tick: number }) {
      seen.push(useStrictWalkInMenu());
      return <span>{tick}</span>;
    }
    for (const tick of [0, 1]) {
      await act(async () => {
        root!.render(
          <QueryClientProvider client={queryClient}>
            <Probe tick={tick} />
          </QueryClientProvider>
        );
      });
    }
    const first = seen[0];
    const last = seen[seen.length - 1];
    expect(last).not.toBe(first);
    expect(last.eligibleItems).toBe(first.eligibleItems);
    expect(last.ineligibleItems).toBe(first.ineligibleItems);
    expect(last.allItems).toBe(first.allItems);
    expect(last.categories).toBe(first.categories);
    expect(h.getDocsCalls).toBe(0);
  });

  it('empty DEV catalog in strict mode never seeds demos and never calls POS sync services', async () => {
    h.productsDocs = [];
    let hookResult: ReturnType<typeof useStrictWalkInMenu> | null = null;

    function TestComp() {
      hookResult = useStrictWalkInMenu();
      return null;
    }

    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <TestComp />
        </QueryClientProvider>
      );
    });

    await flush();

    expect(h.syncCalls).toBe(0);
    expect(h.autoSyncCalls).toBe(0);
    expect(hookResult?.eligibleItems).toEqual([]);
    expect(hookResult?.ineligibleItems).toEqual([]);
    expect(hookResult?.allItems).toEqual([]);
    expect(hookResult?.categories).toEqual([]);
  });

  it('canonical query is strictly branch-scoped and excludes out-of-branch / invalid / configurable items', async () => {
    h.productsDocs = [
      {
        id: 'p_valid',
        data: () => ({
          name: 'Crispy Veg Burger',
          branchId: 'br_cybercity_01',
          inStock: true,
          price: 150,
          categoryId: 'cat_burgers',
          categoryName: 'Burgers',
        }),
      },
      {
        id: 'p_other_branch',
        data: () => ({
          name: 'Other Branch Burger',
          branchId: 'br_other_branch',
          inStock: true,
          price: 150,
          categoryId: 'cat_burgers',
        }),
      },
      {
        id: 'p_out_of_stock',
        data: () => ({
          name: 'Sold Out Drink',
          branchId: 'br_cybercity_01',
          inStock: false,
          price: 80,
          categoryId: 'cat_drinks',
        }),
      },
      {
        id: 'p_configurable',
        data: () => ({
          name: 'Custom Burger',
          branchId: 'br_cybercity_01',
          inStock: true,
          price: 200,
          customizations: [{ name: 'Extra Cheese', price: 20 }],
        }),
      },
    ];

    let hookResult: ReturnType<typeof useStrictWalkInMenu> | null = null;

    function TestComp() {
      hookResult = useStrictWalkInMenu();
      return null;
    }

    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <TestComp />
        </QueryClientProvider>
      );
    });

    await flush();

    expect(h.queriedBranches).toContain('br_cybercity_01');
    expect(hookResult?.eligibleItems).toHaveLength(1);
    expect(hookResult?.eligibleItems[0].id).toBe('p_valid');
    expect(hookResult?.ineligibleItems).toHaveLength(3);
    const reasons = hookResult?.ineligibleItems.map((item) => item.reason);
    expect(reasons).toContain('branch_mismatch');
    expect(reasons).toContain('out_of_stock');
    expect(reasons).toContain('configurable_unsupported');
  });

  it('strict cache key is distinct from loose default menuItems cache entry', async () => {
    h.productsDocs = [
      {
        id: 'p_demo',
        data: () => ({
          name: 'Standard Product',
          branchId: 'br_cybercity_01',
          price: 99,
          // inStock missing -> default useMenu treats as available
        }),
      },
    ];

    function TestBoth() {
      useStrictWalkInMenu();
      useMenu();
      return null;
    }

    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <TestBoth />
        </QueryClientProvider>
      );
    });

    await flush();

    const looseCache = queryClient.getQueryData(['menuItems', 'br_cybercity_01']);
    const strictCache = queryClient.getQueryData(['strictWalkInMenuItems', 'br_cybercity_01']);

    expect(looseCache).toBeDefined();
    expect(strictCache).toBeDefined();
    expect(looseCache).not.toBe(strictCache);
  });

  it('preserves default useMenu callers behaviour unchanged', async () => {
    h.productsDocs = [
      {
        id: 'p_loose',
        data: () => ({
          name: 'Loose Item',
          branchId: 'br_cybercity_01',
          price: 100,
        }),
      },
    ];

    let standardHookResult: ReturnType<typeof useMenu> | null = null;

    function TestDefault() {
      standardHookResult = useMenu();
      return null;
    }

    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <TestDefault />
        </QueryClientProvider>
      );
    });

    await flush();

    expect(standardHookResult?.items).toHaveLength(1);
    expect(standardHookResult?.items[0].available).toBe(true);
  });
});
