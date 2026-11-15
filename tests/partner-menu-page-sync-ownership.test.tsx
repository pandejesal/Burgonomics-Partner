// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * R4 (review r3, finding M2-outcome) — the PAGE half of the manual-sync outcome.
 *
 * `useMenu`'s manual mutation stopped invalidating a stale outlet, but it still
 * RESOLVED AS SUCCESS. `MenuPage.handleManualSync` awaits that resolution and
 * then paints its header chip "online", flips the button to "Catalog Synced!",
 * and announces "Catalog refreshed from Petpooja POS bridge". So an accepted A
 * sync that completed after the operator moved to B claimed **B** had just been
 * refreshed.
 *
 * The reviewer proved it by executing the frozen mutation callbacks and the
 * unchanged page handler: `manual-outcome-proof-r3.json` records `outcomes:
 * ["ok"]`, that toast, and an empty invalidation list. No existing MenuPage test
 * covered it — `menu-feedback.test.tsx` only exercises the REJECTION path and
 * mocks `mutateAsync` itself, so it could never see a resolved-but-stale result.
 *
 * These tests drive the REAL page and the REAL handler. Only the data hook, the
 * auth store, the sync-health probe and the three heavy child components are
 * replaced. The contract under test is narrow and explicit: a resolved
 * `{ status: 'retired' }` means "this operation no longer owns the outlet on
 * screen", and the page must release its pending state WITHOUT asserting either
 * freshness or failure.
 *
 * A rejection is deliberately NOT the mechanism: rejection would paint "Menu sync
 * failed — catalog unchanged" on an outlet whose sync may well have succeeded,
 * which is the same class of lie pointing the other way.
 */
const h = vi.hoisted(() => ({
  /** Resolved value of `syncPetpooja.mutateAsync()`. */
  syncResult: undefined as unknown,
  /** When set, `mutateAsync` rejects with this error. */
  syncError: null as null | Error,
  /** Deferred control so a test can hold the mutation open. */
  syncDeferred: null as null | { promise: Promise<unknown>; resolve: (v: unknown) => void },
  /** Current role surfaced by the mocked auth store. */
  role: 'brand_owner' as string | undefined,
  user: { id: 'user_brand_owner', role: 'brand_owner', branchIds: ['demo'], cityIds: [] } as any,
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: h.user }),
}));

vi.mock('@/admin/dashboard/hooks/useDashboardData', () => ({
  // Default: no verified POS link, so the chip only reads "Live" if the PAGE
  // claims it — which is exactly the claim under test.
  useSyncHealth: () => ({ data: undefined }),
}));

vi.mock('@/features/menu/hooks/useBranchMenu', () => ({
  useBranchMenu: () => ({
    branchId: 'demo',
    categories: [],
    items: [{ id: 'burger', name: 'Burger', price: 100, categoryId: 'burgers' }],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    lastSyncedAt: null,
    syncPetpooja: {
      mutateAsync: () => {
        if (h.syncDeferred) return h.syncDeferred.promise;
        if (h.syncError) return Promise.reject(h.syncError);
        return Promise.resolve(h.syncResult);
      },
      isPending: false,
    },
    toggleAvailability: { mutateAsync: vi.fn(), isPending: false },
    markItem86: { mutateAsync: vi.fn(), isPending: false },
    toggleCategoryAvailability: { mutateAsync: vi.fn(), isPending: false },
    createComboMeal: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

vi.mock('@/features/menu/components/MenuItemToggleRow', () => ({ MenuItemToggleRow: () => null }));
vi.mock('@/features/menu/components/Instant86ingModal', () => ({ Instant86ingModal: () => null }));
vi.mock('@/features/menu/components/ComboBuilderDrawer', () => ({ ComboBuilderDrawer: () => null }));
// The badge module the page imports `petpoojaBadgeMeta` from also imports the
// sync service; stub the service so this page test never drags the Firebase
// graph in. Nothing here calls it — the page only reads the pure label map.
vi.mock('@/services/petpoojaSync', () => ({
  syncPetpoojaMenuForBranch: vi.fn(),
  checkAndAutoSyncMenu: vi.fn(),
}));

import { MenuPage } from '@/pages/MenuPage';

const SUCCESS_COPY = 'Catalog refreshed from Petpooja POS bridge';
const FAILURE_COPY = 'Menu sync failed';

describe('MenuPage — a retired manual sync claims nothing on the current outlet', () => {
  let root: Root | null = null;
  let container: HTMLDivElement;
  const actFlagBefore = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');

  const text = () => container?.textContent ?? '';

  /** The header chip the operator reads as "our menu is live". */
  const chipSaysLive = () => /Petpooja POS:\s*Live/.test(text());
  const chipSaysFallback = () => /Petpooja POS:\s*Fallback/.test(text());
  const syncButton = () =>
    Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Sync'),
    ) as HTMLButtonElement | undefined;

  async function mount() {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<MenuPage />);
    });
  }

  /** Click "Sync POS" and let the handler run to completion. */
  async function clickSync() {
    const button = syncButton();
    expect(button).toBeDefined();
    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      for (let i = 0; i < 24; i += 1) await Promise.resolve();
    });
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    h.syncResult = undefined;
    h.syncError = null;
    h.syncDeferred = null;
    h.user = { id: 'user_brand_owner', role: 'brand_owner', branchIds: ['demo'], cityIds: [] };
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = null;
    container?.remove();
    vi.restoreAllMocks();
  });

  it('CONTROL: a sync that still owns the outlet is announced as success', async () => {
    // The honest path must keep working — a fix that suppressed ALL feedback
    // would satisfy the cases below while removing the feature.
    h.syncResult = { status: 'ok', branchId: 'demo' };

    await mount();
    expect(chipSaysLive()).toBe(false);

    await clickSync();

    expect(chipSaysLive()).toBe(true);
    expect(text()).toContain(SUCCESS_COPY);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('a RETIRED outcome after an outlet switch paints neither Live nor a toast', async () => {
    // The exact shape the reviewer measured: A accepted, operator now on B,
    // A's request completes, the hook reports retirement, the page keeps its
    // hands off every success/failure surface.
    h.syncResult = { status: 'retired', branchId: 'demo' };

    await mount();
    await clickSync();

    expect(chipSaysLive()).toBe(false);
    expect(chipSaysFallback()).toBe(false);
    expect(text()).not.toContain(SUCCESS_COPY);
    expect(text()).not.toContain(FAILURE_COPY);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    // Pending state released: the control is offered again, not stuck.
    expect(syncButton()?.textContent).toContain('Sync POS');
  });

  it('a RETIRED outcome after an A → B → A round trip is equally silent', async () => {
    h.syncResult = { status: 'retired', branchId: 'demo' };

    await mount();
    await clickSync();

    expect(chipSaysLive()).toBe(false);
    expect(text()).not.toContain(SUCCESS_COPY);
    expect(text()).not.toContain(FAILURE_COPY);
  });

  it('a RETIRED outcome after logout/relogin is equally silent', async () => {
    h.syncResult = { status: 'retired', branchId: 'demo' };

    await mount();
    await clickSync();

    expect(chipSaysLive()).toBe(false);
    expect(text()).not.toContain(SUCCESS_COPY);
    expect(text()).not.toContain(FAILURE_COPY);
  });

  it('a RETIRED outcome whose owner unmounted paints nothing at all', async () => {
    // Nothing can be painted for a tree that no longer exists; what matters is
    // that resolving a retired result after teardown raises no error and writes
    // no feedback anywhere.
    let release: ((value: unknown) => void) | null = null;
    h.syncDeferred = {
      promise: new Promise((resolve) => {
        release = resolve;
      }),
      resolve: (value: unknown) => release!(value),
    };

    await mount();
    await act(async () => {
      syncButton()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    });

    await act(async () => {
      root!.unmount();
    });
    root = null;

    await act(async () => {
      h.syncDeferred!.resolve({ status: 'retired', branchId: 'demo' });
      for (let i = 0; i < 24; i += 1) await Promise.resolve();
    });

    expect(console.error).not.toHaveBeenCalled();
  });

  it('CONTROL: a real rejection still reports failure (retirement is not a rejection)', async () => {
    // The distinction the review demanded: a genuine failure must stay loud, or
    // the "retired" handling would silently swallow POS outages.
    h.syncError = new Error('offline');

    await mount();
    await clickSync();

    expect(chipSaysFallback()).toBe(true);
    expect(text()).toContain(FAILURE_COPY);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(text()).not.toContain(SUCCESS_COPY);
  });
});
