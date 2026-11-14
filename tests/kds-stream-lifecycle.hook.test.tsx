// @vitest-environment jsdom
import React, { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Astra item 5 — real-React lifecycle coverage.
 *
 * The hook-level suite replaces React's lifecycle with a bespoke harness, which
 * cannot exercise StrictMode's deliberate setup → cleanup → setup, a mounted
 * scope change, or callbacks that fire after unmount. This file drives the real
 * hook through `createRoot` + `act` + `<StrictMode>`.
 *
 * The environment comes from the documented `@vitest-environment jsdom`
 * directive above, so Vitest owns the DOM globals and no untyped `jsdom` import
 * (or manual global installation/restoration) is needed.
 *
 * The real ingestion gate stays in force; only network/audio I/O is stubbed.
 */
const h = vi.hoisted(() => {
  const userHolder: { user: any } = {
    user: { id: 'owner', role: 'brand_owner', branchIds: [], cityIds: [] },
  };
  const branchHolder = { selectedBranchId: null as string | null };
  return {
    userHolder,
    branchHolder,
    listeners: [] as Array<{ field: string; next: (snap: unknown) => void; error: (err: unknown) => void }>,
    ordersHolder: { orders: [] as any[], isLoading: false, error: null as unknown },
    // Every RENDER-BODY invocation's externally visible surface (this recorder
    // runs in the render body, so it includes StrictMode's discarded renders —
    // stricter than committed-only). Used to prove what a NEW identity could
    // ever see, not just the final settled value.
    renders: [] as Array<{
      status: string;
      ids: string[];
      verified: boolean;
      // Recall/arrival surfaces too, so a leak is provable on the FIRST render
      // of a new scope rather than only after an effect has cleaned up.
      canRecall: boolean;
      lastBumped: string | null;
      newIds: string[];
      newTotal: number;
    }>,
    // Stable across renders: a fresh vi.fn() per render (the previous shape)
    // would make deferred resolve/reject impossible to reason about. The
    // explicit `Promise<void>` signature keeps main AND strict typecheck happy
    // without casts: `async () => undefined` infers `Promise<undefined>`.
    mutateAsync: vi.fn(async (_args: unknown): Promise<void> => undefined),
  };
});

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn((...parts: any[]) => ({ parts })),
  where: vi.fn(() => ({})),
  orderBy: vi.fn((field: string) => ({ field })),
  limit: vi.fn(() => ({})),
  onSnapshot: vi.fn((q: any, next: (snap: any) => void, error: (err: any) => void) => {
    const field =
      (q?.parts ?? []).map((part: any) => part?.field).find(Boolean) ?? 'createdAt';
    h.listeners.push({ field, next, error });
    return () => undefined;
  }),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/hooks/useOrders', () => ({
  useOrders: () => ({
    orders: h.ordersHolder.orders,
    isLoading: h.ordersHolder.isLoading,
    error: h.ordersHolder.error,
    updateOrderStatus: { mutateAsync: h.mutateAsync },
  }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: h.userHolder.user }),
}));
vi.mock('@/stores/appStore', () => ({
  useAppStore: () => ({ selectedBranchId: h.branchHolder.selectedBranchId }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/utils/kdsAudio', () => ({
  playKDSArrivalCue: vi.fn(),
  stopRepeatingKDSAlarm: vi.fn(),
  resetKDSAlarmState: vi.fn(),
  syncKDSAlarmState: vi.fn(),
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetKDSAlarmState, syncKDSAlarmState } from '@/utils/kdsAudio';
import { useKDSRealtimeStream } from '@/features/kds/hooks/useKDSRealtimeStream';

type Stream = ReturnType<typeof useKDSRealtimeStream>;
let latest: Stream | null = null;

function Harness(): React.ReactElement {
  latest = useKDSRealtimeStream();
  // Record every committed render so a leak is visible even if a later commit
  // hides it: identity must never briefly see another scope's orders.
  h.renders.push({
    status: latest.streamStatus,
    ids: latest.activeOrders.map((o) => o.id),
    verified: latest.dataVerified,
    canRecall: latest.canRecall,
    lastBumped: latest.lastBumpedOrder?.id ?? null,
    newIds: latest.newOrderIds,
    newTotal: latest.newOrderTotal,
  });
  return <div data-testid="status">{latest.streamStatus}</div>;
}

/**
 * The hook calls `useQueryClient()` (to expose `refresh()`), so every render
 * must sit under a provider. Retries are off so a failing query can never turn
 * into background work that outlives the test.
 */
function withProvider(client: QueryClient, children: React.ReactElement) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const order = (id: string, status = 'pending') => ({
  id,
  branchId: 'branch_1',
  status,
  paymentMethod: 'cod',
  items: [],
  total: 100,
  createdAt: { toMillis: () => 1 },
});

async function flush() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

describe('useKDSRealtimeStream — real React lifecycle', () => {
  let root: Root | null = null;
  let container: HTMLDivElement;
  let client: QueryClient;
  // Captured once so an earlier act-environment state is restored, not destroyed.
  const actFlagBefore = Object.getOwnPropertyDescriptor(
    globalThis,
    'IS_REACT_ACT_ENVIRONMENT',
  );

  beforeEach(() => {
    // jsdom is provided by Vitest via the file-level directive; React only needs
    // the act-environment flag, which the DOM environment does not set itself.
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    h.listeners.length = 0;
    h.ordersHolder.orders = [];
    h.ordersHolder.isLoading = false;
    h.ordersHolder.error = null;
    h.userHolder.user = { id: 'owner', role: 'brand_owner', branchIds: [], cityIds: [] };
    h.branchHolder.selectedBranchId = null;
    h.renders.length = 0;
    h.mutateAsync.mockReset();
    h.mutateAsync.mockResolvedValue(undefined);
    // Only the KDS outbox key is touched — no other storage is inspected.
    window.localStorage.removeItem('kds-pending-bumps:v1');
    latest = null;
    // Fresh client per test: no cache or in-flight query may leak between cases.
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = null;
    container?.remove();
    client.clear();
    // Restore the synthetic outbox key so no case inherits another's queue.
    window.localStorage.removeItem('kds-pending-bumps:v1');
    latest = null;
  });

  afterAll(() => {
    // Restore any pre-existing act-environment state instead of destroying it.
    if (actFlagBefore) {
      Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', actFlagBefore);
    } else {
      Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    }
  });

  async function mountStrict() {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <StrictMode>
          {withProvider(
            client,
            <Harness />,
          )}
        </StrictMode>,
      );
    });
  }

  /**
   * Resolve a listener for a field. With no index, target the LIVE generation —
   * the most recently registered listener for that field. Under StrictMode the
   * first registration belongs to the discarded effect run, so defaulting to
   * index 0 would deliver into callbacks the hook is required to ignore.
   */
  function listener(field: 'createdAt' | 'placedAt', index?: number) {
    const matches = h.listeners.filter((entry) => entry.field === field);
    const resolved = index === undefined ? matches[matches.length - 1] : matches[index];
    if (!resolved) {
      throw new Error(
        index === undefined
          ? `no ${field} listener registered`
          : `no ${field} listener at index ${index}`,
      );
    }
    return resolved;
  }

  async function deliver(field: 'createdAt' | 'placedAt', rows: any[]) {
    listener(field).next({ docs: rows.map((row) => ({ id: row.id, data: () => row })) });
    await act(async () => {
      await flush();
    });
  }

  it('StrictMode setup→cleanup→setup leaves no duplicate live listener', async () => {
    await mountStrict();
    await flush();

    // StrictMode mounts effects twice; only one live subscription set remains,
    // and the survivors are the second generation.
    const primaries = h.listeners.filter((entry) => entry.field === 'createdAt');
    const deliveries = h.listeners.filter((entry) => entry.field === 'placedAt');
    expect(primaries.length).toBeGreaterThanOrEqual(1);
    expect(deliveries.length).toBe(primaries.length);

    expect(latest!.streamStatus).toBe('connecting');

    // The first (discarded) generation's callbacks must be inert.
    const discarded = primaries[0];
    if (primaries.length > 1) {
      discarded.next({ docs: [{ id: 'GHOST', data: () => order('GHOST') }] });
      await act(async () => {
        await flush();
      });
      expect(latest!.activeOrders.map((o) => o.id)).not.toContain('GHOST');
    }
  });

  it('StrictMode: a single healthy generation reaches live after both feeds', async () => {
    await mountStrict();
    await flush();

    const primaryCount = h.listeners.filter((entry) => entry.field === 'createdAt').length;
    await deliver('createdAt', [order('A')]);
    await deliver('placedAt', []);
    await act(async () => {
      await flush();
    });

    expect(primaryCount).toBeGreaterThanOrEqual(1);
    expect(latest!.streamStatus).toBe('live');
  });

  it('a mounted scope change resubscribes and clears old-scope verification', async () => {
    await mountStrict();
    await flush();

    await deliver('createdAt', [order('A')]);
    await deliver('placedAt', []);
    await act(async () => {
      await flush();
    });
    expect(latest!.streamStatus).toBe('live');

    // Capture the LIVE generation before the rerender: after it, this object is
    // a previous-generation listener whose callbacks must be inert.
    const gen1Primary = listener('createdAt');
    const listenersBefore = h.listeners.length;

    // Real scope change: new branch selection re-runs the effect.
    h.branchHolder.selectedBranchId = 'branch_1';
    await act(async () => {
      root!.render(
        <StrictMode>
          {withProvider(
            client,
            <Harness />,
          )}
        </StrictMode>,
      );
      await flush();
    });

    expect(h.listeners.length).toBeGreaterThanOrEqual(listenersBefore);
    // New scope has delivered nothing yet: honest connecting, never stale live.
    expect(latest!.streamStatus).toBe('connecting');

    // The previous scope's still-open listener cannot inject its data.
    gen1Primary.next({ docs: [{ id: 'OLD_SCOPE', data: () => order('OLD_SCOPE') }] });
    await act(async () => {
      await flush();
    });
    expect(latest!.activeOrders.map((o) => o.id)).not.toContain('OLD_SCOPE');
  });

  it('callbacks arriving after unmount are inert and do not throw', async () => {
    await mountStrict();
    await flush();

    const primary = h.listeners.find((entry) => entry.field === 'createdAt')!;
    const delivery = h.listeners.find((entry) => entry.field === 'placedAt')!;

    await act(async () => {
      root!.unmount();
    });
    root = null;

    await act(async () => {
      primary.next({ docs: [{ id: 'POST_UNMOUNT', data: () => order('POST_UNMOUNT') }] });
      delivery.error(Object.assign(new Error('late'), { code: 'failed-precondition' }));
      await flush();
    });

    // The hook is gone; the important guarantee is that nothing threw and the
    // last captured result was not mutated into a bogus live claim.
    expect(latest === null || latest.streamStatus !== 'live').toBe(true);
  });

  /**
   * PRIVACY — a different identity must never inherit the previous one's board.
   *
   * `globalPages`/verification are keyed only by uid + selectedBranch, and
   * `activeOrders` filters only `selectedBranchId`. So user B, arriving with a
   * non-empty branch assignment and `selectedBranchId === 'all'`, can render
   * user A's tickets before B's first snapshot — and a same-uid role/branch-list
   * narrowing keeps the wider global Delivery pages.
   */

  /** Everything the currently mounted identity has been allowed to see. */
  function visibleIds(): string[] {
    return h.renders.flatMap((entry) => entry.ids);
  }

  const branchOrder = (id: string, branchId: string) => ({
    ...order(id),
    branchId,
  });

  it('PRIV1: a different user never sees the previous user’s orders, not even for one commit', async () => {
    await mountStrict();
    await flush();

    // User A: global brand owner, both feeds populated with branch X and Y data.
    await deliver('createdAt', [branchOrder('A_X', 'branch_x'), branchOrder('A_Y', 'branch_y')]);
    await deliver('placedAt', [
      { ...branchOrder('A_X_DEL', 'branch_x'), createdAt: undefined },
      { ...branchOrder('A_Y_DEL', 'branch_y'), createdAt: undefined },
    ]);
    await act(async () => {
      await flush();
    });
    expect(latest!.streamStatus).toBe('live');

    // Identity switch to user B: branch_owner assigned only branch Y, and the
    // branch selector is "all".
    h.renders.length = 0;
    h.userHolder.user = { id: 'userB', role: 'branch_owner', branchIds: ['branch_y'], cityIds: [] };
    h.branchHolder.selectedBranchId = null;
    await act(async () => {
      root!.render(
        <StrictMode>
          {withProvider(
            client,
            <Harness />,
          )}
        </StrictMode>,
      );
      await flush();
    });

    // ~(red) A's tickets are still rendered because liveOrders was never cleared.
    expect(visibleIds().filter((id) => id.startsWith('A_'))).toEqual([]);
    // The old board must not even be reported as verified while B is unproven.
    expect(h.renders.some((entry) => entry.verified)).toBe(false);
  });

  it('PRIV2: after the new user’s first snapshot, a refresh never resurrects old pages', async () => {
    // Mount A first as a GLOBAL identity so A genuinely populates BOTH feeds —
    // that is the only way old global Delivery pages can exist to resurrect.
    await mountStrict();
    await flush();
    await deliver('createdAt', [branchOrder('A_X', 'branch_x'), branchOrder('A_Y', 'branch_y')]);
    await deliver('placedAt', [
      { ...branchOrder('A_X_DEL', 'branch_x'), createdAt: undefined },
      { ...branchOrder('A_Y_DEL', 'branch_y'), createdAt: undefined },
    ]);
    await act(async () => {
      await flush();
    });
    expect(latest!.streamStatus).toBe('live');

    // Switch to B: branch_owner scoped to Y. A scoped role reads ONE
    // `createdAt` feed plus the aliased-store merge — never a placedAt listener.
    h.renders.length = 0;
    h.userHolder.user = { id: 'userB', role: 'branch_owner', branchIds: ['branch_y'], cityIds: [] };
    h.branchHolder.selectedBranchId = null;
    await act(async () => {
      root!.render(
        <StrictMode>
          {withProvider(
            client,
            <Harness />,
          )}
        </StrictMode>,
      );
      await flush();
    });

    // B's first (and only) feed delivers its own page.
    await deliver('createdAt', [branchOrder('B_Y', 'branch_y')]);
    await act(async () => {
      await flush();
    });
    expect(visibleIds()).toContain('B_Y');
    expect(visibleIds().filter((id) => id.startsWith('A_'))).toEqual([]);

    // A same-scope refresh for B must not resurrect A's retained global pages.
    h.renders.length = 0;
    latest!.refresh();
    await act(async () => {
      await flush();
    });
    await deliver('createdAt', [branchOrder('B_Y', 'branch_y')]);
    await act(async () => {
      await flush();
    });

    // ~(red) A's Delivery pages survive the uid change and come back here.
    expect(visibleIds().filter((id) => id.startsWith('A_'))).toEqual([]);
    expect(visibleIds()).toContain('B_Y');
  });

  it('PRIV3: the same uid narrowing role+branches clears the old verification', async () => {
    await mountStrict();
    await flush();

    await deliver('createdAt', [branchOrder('A_X', 'branch_x'), branchOrder('A_Y', 'branch_y')]);
    await deliver('placedAt', []);
    await act(async () => {
      await flush();
    });
    expect(latest!.streamStatus).toBe('live');
    expect(latest!.dataVerified).toBe(true);

    // SAME uid: brand_owner (global) → branch_owner assigned only branch Y.
    h.renders.length = 0;
    h.userHolder.user = { id: 'owner', role: 'branch_owner', branchIds: ['branch_y'], cityIds: [] };
    h.branchHolder.selectedBranchId = null;
    await act(async () => {
      root!.render(
        <StrictMode>
          {withProvider(
            client,
            <Harness />,
          )}
        </StrictMode>,
      );
      await flush();
    });

    // ~(red) scopeKey ignores role/branchIds, so the wider data stays verified.
    expect(latest!.dataVerified).toBe(false);
    expect(visibleIds().filter((id) => id === 'A_X')).toEqual([]);
  });

  it('PRIV4: the same uid narrowing the assigned branch list clears the old pages', async () => {
    h.userHolder.user = {
      id: 'owner2',
      role: 'branch_owner',
      branchIds: ['branch_y', 'branch_z'],
      cityIds: [],
    };
    h.branchHolder.selectedBranchId = null;
    await mountStrict();
    await flush();

    // A scoped role reads ONE `createdAt` feed (plus the aliased-store merge);
    // its first snapshot already proves the scoped feed ready, so no secondary
    // listener exists to deliver on — and none is fabricated here.
    await deliver('createdAt', [branchOrder('Y1', 'branch_y'), branchOrder('Z1', 'branch_z')]);
    await act(async () => {
      await flush();
    });

    // Same uid and role, branch list narrowed Y,Z → Z only.
    h.renders.length = 0;
    h.userHolder.user = { id: 'owner2', role: 'branch_owner', branchIds: ['branch_z'], cityIds: [] };
    await act(async () => {
      root!.render(
        <StrictMode>
          {withProvider(
            client,
            <Harness />,
          )}
        </StrictMode>,
      );
      await flush();
    });

    // ~(red) pageScopeKey unchanged, so branch-Y data survives the narrowing.
    expect(visibleIds()).not.toContain('Y1');
  });

  it('PRIV5: a stale previous-identity callback cannot insert before unsubscribe', async () => {
    await mountStrict();
    await flush();

    await deliver('createdAt', [branchOrder('A_X', 'branch_x')]);
    await deliver('placedAt', []);
    await act(async () => {
      await flush();
    });

    const stalePrimary = listener('createdAt');

    // Identity switch; the old listener's unsubscribe has not been observed yet.
    h.renders.length = 0;
    h.userHolder.user = { id: 'userB', role: 'branch_owner', branchIds: ['branch_y'], cityIds: [] };
    await act(async () => {
      root!.render(
        <StrictMode>
          {withProvider(
            client,
            <Harness />,
          )}
        </StrictMode>,
      );
      await flush();
    });

    // A's retained callback fires late, before any B snapshot.
    await act(async () => {
      stalePrimary.next({ docs: [{ id: 'A_LATE', data: () => branchOrder('A_LATE', 'branch_x') }] });
      await flush();
    });

    // ~(red) nothing fences the render, so the injected row can surface.
    expect(visibleIds().filter((id) => id.startsWith('A_'))).toEqual([]);
  });

  it('PRIV6 control: a same-identity refresh keeps verified orders on screen', async () => {
    h.userHolder.user = { id: 'owner3', role: 'brand_owner', branchIds: [], cityIds: [] };
    h.branchHolder.selectedBranchId = null;
    await mountStrict();
    await flush();

    await deliver('createdAt', [branchOrder('K_X', 'branch_x')]);
    await deliver('placedAt', [{ ...branchOrder('K_DEL', 'branch_y'), createdAt: undefined }]);
    await act(async () => {
      await flush();
    });
    expect(latest!.streamStatus).toBe('live');

    h.renders.length = 0;
    latest!.refresh();
    await act(async () => {
      await flush();
    });

    // No artificial empty board and no lost verification across a refresh.
    expect(visibleIds()).toContain('K_X');
    expect(visibleIds()).toContain('K_DEL');
    expect(latest!.dataVerified).toBe(true);
  });

  /**
   * LAGGING ONE-SHOT PROVENANCE.
   *
   * `liveOrdersScope === authScopeKey` proves only that the RESET stamped the new
   * key — not that `useOrders` has refetched. Its rows can still be the previous
   * identity's, and `oneShotError === null` here is the HEALTHY fallback case the
   * earlier error-based tests never covered.
   */
  it('PRIV7: a lagging non-empty one-shot from the previous user is never adopted', async () => {
    await mountStrict();
    await flush();

    await deliver('createdAt', [branchOrder('A_X', 'branch_x'), branchOrder('A_Y', 'branch_y')]);
    await deliver('placedAt', [{ ...branchOrder('A_Y_DEL', 'branch_y'), createdAt: undefined }]);
    await act(async () => {
      await flush();
    });
    expect(latest!.streamStatus).toBe('live');

    // The one-shot query has NOT refetched yet: it still holds A's rows, and
    // reports success (no error, not loading) — a healthy but stale fallback.
    h.ordersHolder.orders = [
      branchOrder('A_LEGACY_X', 'branch_x'),
      branchOrder('A_LEGACY_Y', 'branch_y'),
    ];
    h.ordersHolder.isLoading = false;
    h.ordersHolder.error = null;

    h.renders.length = 0;
    h.userHolder.user = { id: 'userB', role: 'branch_owner', branchIds: ['branch_y'], cityIds: [] };
    h.branchHolder.selectedBranchId = null;
    await act(async () => {
      root!.render(
        <StrictMode>
          {withProvider(
            client,
            <Harness />,
          )}
        </StrictMode>,
      );
      await flush();
    });

    // No B snapshot has arrived, so nothing of A's may be shown or verified.
    expect(visibleIds().filter((id) => id.startsWith('A_'))).toEqual([]);
    expect(h.renders.some((entry) => entry.verified)).toBe(false);
  });

  it('PRIV8: a lagging one-shot is not adopted across a same-uid role/branch narrowing', async () => {
    await mountStrict();
    await flush();

    await deliver('createdAt', [branchOrder('A_X', 'branch_x'), branchOrder('A_Y', 'branch_y')]);
    await deliver('placedAt', []);
    await act(async () => {
      await flush();
    });
    expect(latest!.streamStatus).toBe('live');

    // Same uid, narrowed to branch Y — the one-shot still returns the wide set.
    h.ordersHolder.orders = [branchOrder('A_LEGACY_X', 'branch_x')];
    h.ordersHolder.isLoading = false;
    h.ordersHolder.error = null;

    h.renders.length = 0;
    h.userHolder.user = { id: 'owner', role: 'branch_owner', branchIds: ['branch_y'], cityIds: [] };
    h.branchHolder.selectedBranchId = null;
    await act(async () => {
      root!.render(
        <StrictMode>
          {withProvider(
            client,
            <Harness />,
          )}
        </StrictMode>,
      );
      await flush();
    });

    expect(visibleIds().filter((id) => id.startsWith('A_'))).toEqual([]);
    expect(latest!.dataVerified).toBe(false);
  });

  /**
   * EQUIVALENT IDENTITY OBJECT. A fresh `user` object carrying identical uid,
   * role and sorted branch ids is not an authorisation change: it must not tear
   * down and rebuild listeners, and must not drop the verified dataset.
   */
  it('PRIV9: an equal fresh user object causes no listener churn and keeps verification', async () => {
    h.userHolder.user = { id: 'owner4', role: 'brand_owner', branchIds: [], cityIds: [] };
    h.branchHolder.selectedBranchId = null;
    await mountStrict();
    await flush();

    await deliver('createdAt', [branchOrder('E_X', 'branch_x')]);
    await deliver('placedAt', []);
    await act(async () => {
      await flush();
    });
    expect(latest!.dataVerified).toBe(true);
    const listenersBefore = h.listeners.length;

    // Same identity, brand-new object identity.
    h.renders.length = 0;
    h.userHolder.user = { id: 'owner4', role: 'brand_owner', branchIds: [], cityIds: [] };
    await act(async () => {
      root!.render(
        <StrictMode>
          {withProvider(
            client,
            <Harness />,
          )}
        </StrictMode>,
      );
      await flush();
    });

    // ~(red) the effect deps are object identities, so listeners are rebuilt.
    expect(h.listeners.length).toBe(listenersBefore);
    expect(latest!.dataVerified).toBe(true);
    expect(visibleIds()).toContain('E_X');
  });

  /**
   * SCOPE-RESET CAUSE — pins that an outlet switch actually INVOKES the alarm
   * reset, not merely that the withheld rows happen to become zero.
   *
   * A branch_staff assigned branches 1 and 2, selected branch 1, proves the
   * reset by call count (mocked resetKDSAlarmState) and by the new listener's
   * data. Without this, the mock-audio unit could pass on a false positive:
   * rows withheld → count 0 → a latch that never needed the scope boundary.
   */
  it('SCOPE-RESET: switching outlet invokes the alarm reset and adopts the new branch', async () => {
    h.userHolder.user = {
      id: 'staff9',
      role: 'branch_staff',
      branchIds: ['branch_1', 'branch_2'],
      cityIds: [],
    };
    h.branchHolder.selectedBranchId = 'branch_1';
    await mountStrict();
    await flush();

    // Real feed for branch A (selection 1). `order()` defaults to branch_1,
    // which is exactly the selected outlet here, so A1 is genuinely in scope.
    await deliver('createdAt', [branchOrder('A1', 'branch_1')]);
    await act(async () => {
      await flush();
    });
    expect(latest!.activeOrders.map((o) => o.id)).toContain('A1');
    expect(latest!.activeOrders.every((o) => o.branchId === 'branch_1')).toBe(true);

    const listenersBeforeSwitch = h.listeners.length;
    const resetsBefore = (resetKDSAlarmState as any).mock.calls.length;

    // Switch the outlet selection.
    h.branchHolder.selectedBranchId = 'branch_2';
    await act(async () => {
      root!.render(
        <StrictMode>
          {withProvider(
            client,
            <Harness />,
          )}
        </StrictMode>,
      );
      await flush();
    });

    // The scope boundary must have invoked the reset — not relied on a 0 count.
    expect((resetKDSAlarmState as any).mock.calls.length).toBeGreaterThan(resetsBefore);
    // Old-branch rows are withheld from the new scope.
    expect(latest!.activeOrders.map((o) => o.id)).not.toContain('A1');
    // The switch really installed a new query listener generation.
    expect(h.listeners.length).toBeGreaterThan(listenersBeforeSwitch);

    // The NEW branch's own listener delivers three pending tickets. These must
    // carry branch_2: `order()` hardcodes branch_1, which the activeOrders
    // filter would drop for the newly selected outlet — the previous version's
    // fixtures were the wrong branch, so B3 could never be adopted.
    await deliver('createdAt', [
      branchOrder('B1', 'branch_2'),
      branchOrder('B2', 'branch_2'),
      branchOrder('B3', 'branch_2'),
    ]);
    await act(async () => {
      await flush();
    });

    expect(latest!.activeOrders.map((o) => o.id)).toContain('B3');
    expect(latest!.activeOrders.every((o) => o.branchId === 'branch_2')).toBe(true);
    expect((syncKDSAlarmState as any)).toHaveBeenCalledWith(3);
  });

  /* ============================================================ SCOPE SAFETY */

  /** A deferred `Promise<void>` the test resolves/rejects explicitly. */
  function deferred(): {
    promise: Promise<void>;
    resolve: () => void;
    reject: (reason?: unknown) => void;
  } {
    let resolve!: () => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  /** Brand-owner pinned to branch_1, so recall/arrival work in scope A. */
  async function mountScopedA() {
    h.userHolder.user = { id: 'owner', role: 'brand_owner', branchIds: [], cityIds: [] };
    h.branchHolder.selectedBranchId = 'branch_1';
    await mountStrict();
    await flush();
    await deliver('createdAt', [branchOrder('A1', 'branch_1')]);
    await act(async () => {
      await flush();
    });
    expect(latest!.activeOrders.map((o) => o.id)).toContain('A1');
  }

  /** Commits a new scope by rerendering (StrictMode harness stays in place). */
  async function commitScope() {
    await act(async () => {
      root!.render(
        <StrictMode>
          {withProvider(
            client,
            <Harness />,
          )}
        </StrictMode>,
      );
      await flush();
    });
  }

  it('SCOPE1: a successful bump makes recall available, and any auth-scope change clears it', async () => {
    await mountScopedA();

    await act(async () => {
      await latest!.bumpOrder('A1', 'preparing');
    });
    await flush();
    expect(latest!.canRecall).toBe(true);
    expect(latest!.lastBumpedOrder?.id).toBe('A1');

    // (a) Selected-branch change, same uid/role.
    h.renders.length = 0;
    h.branchHolder.selectedBranchId = 'branch_2';
    await commitScope();

    // ~(red) recall state is not scope-tagged, so A's entry survives into B.
    expect(latest!.canRecall).toBe(false);
    expect(latest!.lastBumpedOrder).toBeNull();
    // And the FIRST B render must not have exposed it either.
    for (const render of h.renders) {
      expect(render.canRecall).toBe(false);
      expect(render.lastBumped).toBeNull();
    }

    // (b) Same test, different dimension: a fresh bump in scope B, then a
    // uid+role change. This proves the fence is the FULL auth scope, not only
    // the selected branch.
    await deliver('createdAt', [branchOrder('B1', 'branch_2')]);
    await act(async () => {
      await flush();
    });
    await act(async () => {
      await latest!.bumpOrder('B1', 'preparing');
    });
    await flush();
    expect(latest!.canRecall).toBe(true);

    h.renders.length = 0;
    h.userHolder.user = { id: 'owner2', role: 'branch_staff', branchIds: ['branch_1'], cityIds: [] };
    h.branchHolder.selectedBranchId = 'branch_1';
    await commitScope();

    // ~(red) recall survives an identity change too.
    expect(latest!.canRecall).toBe(false);
    expect(latest!.lastBumpedOrder).toBeNull();
    for (const render of h.renders) expect(render.canRecall).toBe(false);
  });

  it('SCOPE2: an arrival in A does not surface as a new arrival in B', async () => {
    await mountScopedA();

    // A second ticket arrives in scope A.
    await deliver('createdAt', [branchOrder('A1', 'branch_1'), branchOrder('A2', 'branch_1')]);
    await act(async () => {
      await flush();
    });
    expect(latest!.newOrderIds).toContain('A2');
    expect(latest!.newOrderTotal).toBeGreaterThan(0);

    h.renders.length = 0;
    h.branchHolder.selectedBranchId = 'branch_2';
    await commitScope();

    // ~(red) the A arrival alert is never cleared, so B inherits A's ids.
    expect(latest!.newOrderIds).toEqual([]);
    expect(latest!.newOrderTotal).toBe(0);
    for (const render of h.renders) {
      expect(render.newIds).toEqual([]);
      expect(render.newTotal).toBe(0);
    }
  });

  it('SCOPE3: an A bump resolving after the switch publishes no recall under B', async () => {
    await mountScopedA();

    const pending = deferred();
    h.mutateAsync.mockImplementationOnce(() => pending.promise);

    // Enter the bump while A is the committed scope.
    let bumpSettled = false;
    const bumpCall = latest!
      .bumpOrder('A1', 'preparing')
      .finally(() => {
        bumpSettled = true;
      });
    await flush();
    expect(bumpSettled).toBe(false);

    h.renders.length = 0;
    h.branchHolder.selectedBranchId = 'branch_2';
    await commitScope();

    // Now the already-issued A request completes under B.
    await act(async () => {
      pending.resolve();
      await bumpCall;
      await flush();
    });

    // ~(red) the continuation writes A's recall entry into mounted B.
    expect(latest!.canRecall).toBe(false);
    expect(latest!.lastBumpedOrder).toBeNull();
    for (const render of h.renders) expect(render.lastBumped).toBeNull();
  });

  it('SCOPE4: an A bump rejecting network after the switch enqueues no A work and toasts nothing under B', async () => {
    await mountScopedA();

    const pending = deferred();
    h.mutateAsync.mockImplementationOnce(() => pending.promise);
    const bumpCall = latest!.bumpOrder('A1', 'preparing');
    await flush();

    h.branchHolder.selectedBranchId = 'branch_2';
    await commitScope();

    const toastError = (await import('sonner')).toast.error as ReturnType<typeof vi.fn>;
    toastError.mockClear();

    await act(async () => {
      pending.reject(new Error('offline: network unreachable'));
      await bumpCall.catch(() => undefined);
      await flush();
    });

    // Offline path must not queue a stale A bump for a scope we already left.
    const raw = window.localStorage.getItem('kds-pending-bumps:v1');
    const queued = raw ? (JSON.parse(raw) as Array<{ orderId: string }>) : [];
    // ~(red) the queue effect/closure still records A1 under B.
    expect(queued.some((entry) => entry.orderId === 'A1')).toBe(false);
    // No B toast claiming the old A work was queued.
    expect(toastError).not.toHaveBeenCalled();
  });

  it('SCOPE5: a recall callback captured under A drops before any I/O once B is committed', async () => {
    await mountScopedA();

    await act(async () => {
      await latest!.bumpOrder('A1', 'preparing');
    });
    await flush();
    expect(latest!.canRecall).toBe(true);

    // Capture the callback bound to scope A, as a stale UI handler would.
    const staleRecall = latest!.recallLastOrder;
    h.mutateAsync.mockClear();

    h.branchHolder.selectedBranchId = 'branch_2';
    await commitScope();

    let result: boolean | undefined;
    await act(async () => {
      result = await staleRecall();
      await flush();
    });

    // ~(red) the stale callback still reaches the mutation layer.
    expect(h.mutateAsync).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('SCOPE6: a same-scope success keeps the canonical payload and recall precondition', async () => {
    await mountScopedA();

    await act(async () => {
      await latest!.bumpOrder('A1', 'preparing');
    });
    await flush();

    // Unchanged-scope behaviour must be untouched by the scope work.
    expect(h.mutateAsync).toHaveBeenCalledTimes(1);
    expect(h.mutateAsync.mock.calls[0][0]).toEqual({
      orderId: 'A1',
      status: 'preparing',
      expectedStatus: 'pending',
    });
    expect(latest!.canRecall).toBe(true);
    expect(latest!.lastBumpedOrder?.id).toBe('A1');
  });

  /**
   * SCOPE8 — a captured `bumpOrder` from scope A must not admit work after B.
   *
   * `bumpOrder` admitted via `activeOrders`; but the CURRENT code then reads
   * `latestAuthScopeKeyRef.current` (already B) into `callScope`, so the
   * "before I/O" comparison is a tautology and A's order is sent anyway. The
   * correct contract is the scope captured by the CALLBACK'S RENDER, compared
   * against the live ref before any I/O or state write.
   */
  it('SCOPE8: a captured A bumpOrder invoked after B is committed performs no I/O', async () => {
    await mountScopedA();

    // Capture the callback that A's render produced.
    const capturedBumpA = latest!.bumpOrder;
    h.mutateAsync.mockClear();

    // Commit scope B (same uid/role, different branch) — B's board has B1 only.
    h.branchHolder.selectedBranchId = 'branch_2';
    await commitScope();
    await deliver('createdAt', [branchOrder('B1', 'branch_2')]);
    await act(async () => {
      await flush();
    });

    // Invoke A's stale callback against an order that only A could see.
    await act(async () => {
      await capturedBumpA('A1', 'preparing');
      await flush();
    });

    // ~(red) the stale callback still reaches the mutation layer for A1.
    expect(h.mutateAsync).not.toHaveBeenCalled();
    expect(latest!.canRecall).toBe(false);
    expect(latest!.lastBumpedOrder).toBeNull();
  });

  /**
   * SCOPE9 — a stale recall callback must not ERASE B's fresh recall entry.
   *
   * `recallLastOrder` filters the stack by the live scope; finding no B-tagged
   * entry for its stale captured list it calls `setRecallStack([])`, wiping the
   * B recall the operator legitimately earned. Stale must return `false`
   * UNCHANGED, without touching state or I/O.
   */
  it('SCOPE9: a stale A recall callback cannot erase B’s fresh recall', async () => {
    await mountScopedA();

    // A earns a recall entry, and A's callback is captured for later misuse.
    await act(async () => {
      await latest!.bumpOrder('A1', 'preparing');
    });
    await flush();
    expect(latest!.canRecall).toBe(true);
    const capturedRecallA = latest!.recallLastOrder;

    // Commit B, load B's ticket, and let B earn its OWN recall (positive proof).
    h.branchHolder.selectedBranchId = 'branch_2';
    await commitScope();
    await deliver('createdAt', [branchOrder('B1', 'branch_2')]);
    await act(async () => {
      await flush();
    });
    await act(async () => {
      await latest!.bumpOrder('B1', 'preparing');
    });
    await flush();
    expect(latest!.canRecall).toBe(true);
    expect(latest!.lastBumpedOrder?.id).toBe('B1');

    // Clear only the I/O counter so the assertions below are about the stale call.
    h.mutateAsync.mockClear();

    let result: boolean | undefined;
    await act(async () => {
      result = await capturedRecallA();
      await flush();
    });

    // ~(red) stale recall returns false but wipes B's entry via setRecallStack([]).
    expect(result).toBe(false);
    expect(h.mutateAsync).not.toHaveBeenCalled();
    expect(latest!.canRecall).toBe(true);
    expect(latest!.lastBumpedOrder?.id).toBe('B1');
  });
});
