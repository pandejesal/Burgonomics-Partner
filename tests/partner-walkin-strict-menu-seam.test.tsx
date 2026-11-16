// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
  where: vi.fn((...args) => ({ __where: args })),
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

describe('useStrictWalkInMenu seam hook contract', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  let queryClient: QueryClient;

  beforeEach(() => {
    h.getDocsCalls = 0;
    h.syncCalls = 0;
    h.autoSyncCalls = 0;
    h.productsDocs = [];
    h.selectedBranchId = 'br_cybercity_01';
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
  });

  it('never invokes Petpooja sync, background auto-sync, or demo seeds on empty catalog', async () => {
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

    // Wait microtasks
    await act(async () => {
      await Promise.resolve();
    });

    expect(h.syncCalls).toBe(0);
    expect(h.autoSyncCalls).toBe(0);
    expect(hookResult?.eligibleItems).toEqual([]);
    expect(hookResult?.ineligibleItems).toEqual([]);
    expect(hookResult?.allItems).toEqual([]);
    expect(hookResult?.categories).toEqual([]);
  });

  it('correctly partitions canonical Firestore products according to backend walk-in contract', async () => {
    h.productsDocs = [
      {
        id: 'p1',
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
        id: 'p2',
        data: () => ({
          name: 'Out of Stock Shake',
          branchId: 'br_cybercity_01',
          inStock: false,
          price: 120,
          categoryId: 'cat_beverages',
          categoryName: 'Beverages',
        }),
      },
      {
        id: 'p3',
        data: () => ({
          name: 'Customizable Pizza',
          branchId: 'br_cybercity_01',
          inStock: true,
          price: 250,
          customizations: [{ id: 'extra_cheese' }],
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

    await vi.waitFor(() => expect(hookResult?.eligibleItems).toHaveLength(1));

    expect(hookResult?.eligibleItems).toHaveLength(1);
    expect(hookResult?.eligibleItems[0].id).toBe('p1');
    expect(hookResult?.ineligibleItems).toHaveLength(2);
    expect(hookResult?.allItems).toHaveLength(3);
    expect(hookResult?.categories).toHaveLength(1);
    expect(hookResult?.categories[0].id).toBe('cat_burgers');
  });

  it('preserves default useMenu callers behaviour unchanged', async () => {
    h.productsDocs = [
      {
        id: 'p1',
        data: () => ({
          name: 'Regular Item',
          branchId: 'br_cybercity_01',
          price: 100,
        }),
      },
    ];

    let standardHookResult: ReturnType<typeof useMenu> | null = null;

    function TestComp() {
      standardHookResult = useMenu();
      return null;
    }

    await act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <TestComp />
        </QueryClientProvider>
      );
    });

    await vi.waitFor(() => expect(standardHookResult?.items).toHaveLength(1));

    expect(standardHookResult?.items).toHaveLength(1);
    // Standard useMenu mapper treats missing inStock as available
    expect(standardHookResult?.items[0].available).toBe(true);
  });
});
