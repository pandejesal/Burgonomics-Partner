// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P1 — a menu SYNC is a privileged action; a menu READ is not.
 *
 * `POST /petpooja/syncMenu` accepts exactly brand_owner, developer,
 * regional_manager and branch_owner (functions/src/index.ts:573-576), and
 * `src/services/petpoojaMenuSyncRoles.ts` already mirrors that allowlist and
 * fails closed. But `useMenu` reached the sync services from THREE paths that
 * never consulted it: the empty-catalog recovery read, the hourly background
 * staleness effect, and the manual mutation. A branch_staff operator — the most
 * likely person on the menu screen — therefore triggered a guaranteed 403, and
 * in DEV an empty catalog silently turned that 403 into a "synced" demo menu.
 *
 * These tests drive the REAL hook with the REAL role helper; only Firestore and
 * the two sync service entry points are stubbed. The oracle is the service
 * boundary: a refused role must produce ZERO calls on either service through any
 * path, and must still be able to read its products and see an honest state.
 *
 * Demo-seed honesty (Runbook §8) is preserved and asserted: a genuinely empty
 * catalog still yields [DEMO]-marked rows in DEV, and no seed row may claim a
 * POS-sync timestamp.
 *
 * Live re-check: the hook renders from `useAuth()` and the async continuation
 * re-checks the CURRENT identity through the auth store. Both are fed by the same
 * `h.user` here, so a test can swap the operator mid-flight exactly as a real
 * demotion would.
 */

const h = vi.hoisted(() => ({
  user: null as any,
  selectedBranchId: 'demo' as string | null,
  /** Product rows the (faked) canonical read returns. */
  rows: [] as Array<{ id: string; data: Record<string, any> }>,
  getDocsCalls: 0,
  /** Per-call override, so a test can hold the first read open. */
  getDocsImpl: null as null | ((call: number) => Promise<unknown>),
  syncCalls: [] as Array<{ branchId: string }>,
  autoSyncCalls: [] as string[],
  syncImpl: null as null | ((branchId: string) => Promise<unknown>),
  /** Per-call override for the background helper, so a completion can be held. */
  autoSyncImpl: null as null | ((branchId: string) => Promise<boolean>),
  invalidated: [] as unknown[],
  /**
   * Store listener registries. The real zustand stores notify subscribers
   * synchronously inside `set()`, so a faithful double must expose `subscribe`
   * and let a test fire it. Without this, an A->B->A transition would look
   * invisible to the hook and the ownership tests below could not fail.
   */
  authListeners: [] as Array<() => void>,
  appListeners: [] as Array<() => void>,
}));

/**
 * Fire every registered store listener, exactly as `set()` would. Called after
 * a mutation of `h.user`/`h.selectedBranchId` so the hook observes a real
 * transition rather than a silent field assignment.
 */
const notifyStores = () => {
  [...h.authListeners].forEach((fn) => fn());
  [...h.appListeners].forEach((fn) => fn());
};

vi.mock('@/config/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => {
  const snapshot = (rows: Array<{ id: string; data: Record<string, any> }>) => {
    const docs = rows.map((row) => ({ id: row.id, data: () => row.data }));
    return { docs, empty: docs.length === 0, size: docs.length };
  };
  /**
   * The fake honours `where` so a cross-branch leak would be visible. Without
   * this, "the new outlet's rows are its own" could pass while the query was
   * silently answered with whatever rows the test last assigned.
   */
  const applyWhere = (q: any) => {
    const wheres: any[] = (q?.constraints ?? []).filter((c: any) => c?.kind === 'where');
    return h.rows.filter((row) =>
      wheres.every((c) =>
        c.op === '=='
          ? row.data[c.field] === c.value
          : c.op === 'in'
            ? (c.value as unknown[]).includes(row.data[c.field])
            : true,
      ),
    );
  };
  return {
    collection: (_db: unknown, name: string) => ({ name }),
    where: (field: string, op: string, value: unknown) => ({ kind: 'where', field, op, value }),
    query: (ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }),
    // Needed only so the REAL petpoojaSync module graph imports cleanly; its
    // write path is stubbed, so these are never exercised.
    doc: (_db: unknown, name: string, id: string) => ({ name, id }),
    writeBatch: () => ({ set: vi.fn(), commit: async () => undefined }),
    getDocs: vi.fn(async (q?: unknown) => {
      h.getDocsCalls += 1;
      if (h.getDocsImpl) return h.getDocsImpl(h.getDocsCalls);
      return snapshot(applyWhere(q));
    }),
    Timestamp: { now: () => ({ toMillis: () => Date.now(), toDate: () => new Date() }) },
  };
});

/**
 * The sync services are the privilege boundary under test. Everything else in
 * this module (the demo catalog the hook re-exports) stays REAL, so a seed row
 * must pass the same honesty assertions as in production.
 */
vi.mock('@/services/petpoojaSync', async (original) => {
  const actual = await original<typeof import('@/services/petpoojaSync')>();
  // Explicit return types keep the factory assignable to the real module type,
  // so a RED can never be an import/type failure.
  const syncPetpoojaMenuForBranch = vi.fn(
    async (
      branchId: string,
    ): Promise<{ categoriesSynced: number; itemsSynced: number; syncedAt: Date }> => {
      h.syncCalls.push({ branchId });
      if (h.syncImpl) {
        return (await h.syncImpl(branchId)) as {
          categoriesSynced: number;
          itemsSynced: number;
          syncedAt: Date;
        };
      }
      return { categoriesSynced: 0, itemsSynced: 0, syncedAt: new Date() };
    },
  );
  const checkAndAutoSyncMenu = vi.fn(
    async (branchId: string): Promise<boolean> => {
      h.autoSyncCalls.push(branchId);
      if (h.autoSyncImpl) return h.autoSyncImpl(branchId);
      return false;
    },
  );
  return { ...actual, syncPetpoojaMenuForBranch, checkAndAutoSyncMenu };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: h.user, loading: false, error: null, isAuthenticated: !!h.user }),
}));

vi.mock('@/stores/authStore', () => {
  // Faithful shape: zustand stores are callable hooks with `getState` and
  // `subscribe`. `subscribe` matters here — the hook must OBSERVE a transition,
  // not merely compare values at the end, and a mock without it would make the
  // A->B->A cases unfalsifiable.
  const useAuthStore = Object.assign(() => ({ user: h.user }), {
    getState: () => ({ user: h.user }),
    subscribe: (listener: () => void) => {
      h.authListeners.push(listener);
      return () => {
        h.authListeners = h.authListeners.filter((fn) => fn !== listener);
      };
    },
  });
  return { useAuthStore };
});

vi.mock('@/stores/appStore', () => {
  const state = () => ({
    selectedCity: 'all',
    selectedBranchId: h.selectedBranchId,
    setSelectedBranchId: vi.fn(),
  });
  // The hook re-checks authorisation AFTER an await, so it reads the store's
  // live state rather than render scope. `subscribe` is part of the real store
  // contract and is what lets the hook latch a branch transition.
  const useAppStore = Object.assign(state, {
    getState: state,
    subscribe: (listener: () => void) => {
      h.appListeners.push(listener);
      return () => {
        h.appListeners = h.appListeners.filter((fn) => fn !== listener);
      };
    },
  });
  return { useAppStore };
});

import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';
import { useMenu } from '@/hooks/useMenu';
import { PetpoojaStatusBadge } from '@/components/ui/PetpoojaStatusBadge';
import { syncPetpoojaMenuForBranch, checkAndAutoSyncMenu } from '@/services/petpoojaSync';

type MenuResult = ReturnType<typeof useMenu>;

const SYNC_ALLOWED = ['brand_owner', 'developer', 'regional_manager', 'branch_owner'] as const;

const identity = (
  role: string | null,
  branchIds: string[] = ['demo'],
): { id: string; role?: string; branchIds: string[]; cityIds: string[] } =>
  role === null
    ? { id: 'user_nonrole', branchIds, cityIds: [] }
    : { id: `user_${role}`, role, branchIds, cityIds: [] };

/**
 * Refused callers. `user: null` is the "missing user" case: a session without a
 * resolved operator must not inherit a manager's privilege, and its menu read
 * still works (products are world-readable per `firestore.rules:516`).
 */
const SYNC_DENIED: Array<{ label: string; user: () => any }> = [
  { label: 'branch_staff', user: () => identity('branch_staff') },
  { label: 'support', user: () => identity('support') },
  { label: 'unknown role', user: () => identity('franchise_partner') },
  { label: 'no role', user: () => identity(null) },
  { label: 'missing user', user: () => null },
];

const productRow = (id: string, branchId = 'demo') => ({
  id,
  data: {
    name: `Product ${id}`,
    price: 99,
    categoryId: 'cat_classic_burgers',
    categoryName: 'Classic Burgers',
    branchId,
    inStock: true,
  },
});

describe('useMenu — Petpooja sync stays a manager action', () => {
  let root: Root | null = null;
  let container: HTMLDivElement;
  let client: QueryClient;
  let latest: MenuResult | null = null;
  let forceRender: () => void = () => undefined;
  /**
   * A SECOND mounted consumer. The R4 review found that a shared,
   * reference-counted ledger only retires when the LAST subscriber leaves, so
   * one menu screen unmounting while another remains left the departed screen's
   * operations live. Reproducing that needs two real hook instances on one
   * query client, exactly as the app has.
   */
  let secondRoot: Root | null = null;
  let secondContainer: HTMLDivElement | null = null;
  let latestSecond: MenuResult | null = null;
  let forceRenderSecond: () => void = () => undefined;
  const actFlagBefore = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');

  function Harness(): React.ReactElement {
    const [, setTick] = useState(0);
    forceRender = () => setTick((tick) => tick + 1);
    latest = useMenu();
    return <div data-testid="count">{latest.items.length}</div>;
  }

  function SecondHarness(): React.ReactElement {
    const [, setTick] = useState(0);
    forceRenderSecond = () => setTick((tick) => tick + 1);
    latestSecond = useMenu();
    return <div data-testid="count-second">{latestSecond.items.length}</div>;
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    notifyManager.setScheduler(queueMicrotask);
    notifyManager.setNotifyFunction((fn) => act(fn));
    h.user = identity('branch_owner');
    h.selectedBranchId = 'demo';
    h.rows = [productRow('prd_a'), productRow('prd_b')];
    h.getDocsCalls = 0;
    h.getDocsImpl = null;
    h.syncCalls = [];
    h.autoSyncCalls = [];
    h.syncImpl = null;
    // `autoSyncImpl` was previously left dirty by whichever test set it, so a
    // later test inherited a hang gate it never armed. Reset it per test, and
    // drop listener registrations: every test mounts its own hook, which
    // subscribes afresh, so a carried-over listener could only ever be a stale
    // closure from an unmounted tree.
    h.autoSyncImpl = null;
    h.authListeners = [];
    h.appListeners = [];
    h.invalidated = [];
    latest = null;
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    // Records what the hook asked react-query to invalidate, without touching a
    // cache: the assertion is "did the hook claim freshness", not cache contents.
    const recordInvalidation = (async (filters?: { queryKey?: unknown }) => {
      h.invalidated.push(filters?.queryKey ?? null);
    }) as unknown as typeof client.invalidateQueries;
    vi.spyOn(client, 'invalidateQueries').mockImplementation(recordInvalidation);
    vi.mocked(syncPetpoojaMenuForBranch).mockClear();
    vi.mocked(checkAndAutoSyncMenu).mockClear();
  });

  afterEach(async () => {
    await unmountSecond();
    latestSecond = null;
    if (root) await act(async () => root!.unmount());
    root = null;
    container?.remove();
    client.clear();
    latest = null;
    vi.restoreAllMocks();
  });

  afterAll(() => {
    notifyManager.setNotifyFunction((fn) => fn());
    notifyManager.setScheduler((cb) => setTimeout(cb, 0));
    if (actFlagBefore) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', actFlagBefore);
    else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  async function flush(rounds = 18) {
    await act(async () => {
      for (let i = 0; i < rounds; i += 1) await Promise.resolve();
    });
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
    await flush();
  }

  async function rerender() {
    await act(async () => {
      forceRender();
    });
    await flush();
  }

  /** Mount a SECOND independent `useMenu` consumer on the same query client. */
  async function mountSecond() {
    secondContainer = document.createElement('div');
    document.body.appendChild(secondContainer);
    secondRoot = createRoot(secondContainer);
    await act(async () => {
      secondRoot!.render(
        <QueryClientProvider client={client}>
          <SecondHarness />
        </QueryClientProvider>,
      );
    });
    await flush();
  }

  async function unmountSecond() {
    if (!secondRoot) return;
    await act(async () => {
      secondRoot!.unmount();
    });
    secondRoot = null;
    secondContainer?.remove();
    secondContainer = null;
  }

  /**
   * Query keys the hook asked react-query to invalidate. Declared as a function
   * so it reads the CURRENT recorder, not a snapshot from setup.
   */
  const invalidatedKeys = () => h.invalidated.map((key) => JSON.stringify(key));

  /**
   * Perform a store transition the way the real app does: assignment PLUS the
   * synchronous listener notification that a zustand `set()` performs.
   *
   * The notification is the whole point. A test that only assigns the field
   * shows the hook two endpoint values, and `A -> B -> A` has identical
   * endpoints — which is exactly the blindness the ABA defect lives in. Firing
   * the listeners makes each intermediate state observable, so a fix that
   * latches transitions can be distinguished from one that compares values.
   */
  async function transition(mutate: () => void) {
    mutate();
    notifyStores();
    await rerender();
  }

  const selectBranch = (branchId: string) => transition(() => { h.selectedBranchId = branchId; });
  const setUser = (user: any) => transition(() => { h.user = user; });

  async function mountBadge(onSyncComplete = vi.fn()) {
    secondContainer = document.createElement('div');
    document.body.appendChild(secondContainer);
    secondRoot = createRoot(secondContainer);
    await act(async () => {
      secondRoot!.render(
        <QueryClientProvider client={client}>
          <PetpoojaStatusBadge branchId="demo" onSyncComplete={onSyncComplete} />
        </QueryClientProvider>,
      );
    });
    return { container: secondContainer, onSyncComplete };
  }

  it('badge offers no manual sync to a disallowed role', async () => {
    h.user = identity('branch_staff');
    const badge = await mountBadge();
    expect(badge.container.querySelector('button')).toBeNull();
    expect(h.syncCalls).toEqual([]);
  });

  it('badge rechecks a demoted role even before its old button rerenders', async () => {
    const badge = await mountBadge();
    h.user = identity('branch_staff');
    notifyStores();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await act(async () => {
        badge.container.querySelector('button')!.click();
        for (let i = 0; i < 24; i += 1) await Promise.resolve();
      });
      expect(h.syncCalls).toEqual([]);
      expect(badge.onSyncComplete).not.toHaveBeenCalled();
      expect(h.invalidated).toEqual([]);
    } finally {
      error.mockRestore();
    }
  });

  it('badge uses the guarded manual sync and reports an authorized completion', async () => {
    const badge = await mountBadge();
    await act(async () => {
      badge.container.querySelector('button')!.click();
      for (let i = 0; i < 24; i += 1) await Promise.resolve();
    });
    expect(vi.mocked(syncPetpoojaMenuForBranch)).toHaveBeenCalledWith(
      'demo', expect.objectContaining({ maySync: expect.any(Function) }),
    );
    expect(badge.container.textContent).toMatch(/live/i);
    expect(badge.onSyncComplete).toHaveBeenCalledTimes(1);
    expect(invalidatedKeys()).toContain(JSON.stringify(['menuItems', 'demo']));
  });

  it('badge does not report or invalidate a sync retired by an outlet round trip', async () => {
    h.user = { id: 'owner', role: 'branch_owner', branchIds: ['demo', 'demo2'], cityIds: [] };
    let release: (() => void) | undefined;
    h.syncImpl = () => new Promise((resolve) => {
      release = () => resolve({ categoriesSynced: 1, itemsSynced: 1, syncedAt: new Date() });
    });
    const badge = await mountBadge();
    await act(async () => { badge.container.querySelector('button')!.click(); });
    expect(release).toBeDefined();
    h.selectedBranchId = 'demo2'; notifyStores();
    h.selectedBranchId = 'demo'; notifyStores();
    await act(async () => { release!(); for (let i = 0; i < 24; i += 1) await Promise.resolve(); });
    expect(badge.container.textContent).not.toMatch(/live/i);
    expect(badge.onSyncComplete).not.toHaveBeenCalled();
    expect(h.invalidated).toEqual([]);
  });

  it('badge retires a pending sync after logout and relogin of the same account', async () => {
    const operator = identity('branch_owner');
    h.user = operator;
    let release: (() => void) | undefined;
    h.syncImpl = () => new Promise((resolve) => {
      release = () => resolve({ categoriesSynced: 1, itemsSynced: 1, syncedAt: new Date() });
    });
    const badge = await mountBadge();
    await act(async () => { badge.container.querySelector('button')!.click(); });
    expect(release).toBeDefined();
    h.user = null; notifyStores();
    h.user = operator; notifyStores();
    await act(async () => { release!(); for (let i = 0; i < 24; i += 1) await Promise.resolve(); });
    expect(badge.container.textContent).not.toMatch(/live/i);
    expect(badge.onSyncComplete).not.toHaveBeenCalled();
    expect(h.invalidated).toEqual([]);
  });

  it('badge owner unmount retires a pending sync even while another menu owner remains', async () => {
    h.rows = [productRow('prd_a')];
    let release: (() => void) | undefined;
    h.syncImpl = () => new Promise((resolve) => {
      release = () => resolve({ categoriesSynced: 1, itemsSynced: 1, syncedAt: new Date() });
    });
    await mount();
    const badge = await mountBadge();
    await act(async () => { badge.container.querySelector('button')!.click(); });
    expect(release).toBeDefined();
    await unmountSecond();
    await act(async () => { release!(); for (let i = 0; i < 24; i += 1) await Promise.resolve(); });
    expect(badge.onSyncComplete).not.toHaveBeenCalled();
    expect(h.invalidated).toEqual([]);
  });

  it('an ordinary product read still works for a scoped operator', async () => {
    h.user = identity('branch_staff');
    await mount();

    expect(latest!.error).toBeNull();
    expect(latest!.items.map((item) => item.id)).toEqual(['prd_a', 'prd_b']);
    expect(latest!.branchId).toBe('demo');
  });

  describe.each(SYNC_ALLOWED)('role %s keeps supported sync behaviour', (role) => {
    it('recovers an empty catalog through the sync service', async () => {
      h.user = identity(role);
      h.rows = [];
      await mount();

      expect(h.syncCalls.map((call) => call.branchId)).toEqual(['demo']);
      expect(vi.mocked(syncPetpoojaMenuForBranch)).toHaveBeenCalled();
      // DEV-honest empty state: [DEMO] rows, no invented POS-sync claim.
      expect(latest!.items.length).toBeGreaterThan(0);
      expect(latest!.items.every((item) => item.name.startsWith('[DEMO]'))).toBe(true);
      expect(latest!.items.every((item) => item.lastSyncedAt === undefined)).toBe(true);
      expect(latest!.lastSyncedAt).toBeNull();
    });

    it('runs the background staleness check', async () => {
      h.user = identity(role);
      await mount();

      expect(h.autoSyncCalls).toEqual(['demo']);
      // The helper now receives a LIVE authorisation callback, so it can refuse
      // in the window after its own read resolves. This assertion was
      // `toHaveBeenCalledWith('demo')`; it is strictly stronger now — it still
      // pins the branch and additionally pins that the callback was supplied.
      expect(vi.mocked(checkAndAutoSyncMenu)).toHaveBeenCalledWith(
        'demo',
        expect.objectContaining({ maySync: expect.any(Function) }),
      );
    });

    it('accepts a manual sync request', async () => {
      h.user = identity(role);
      await mount();
      h.syncCalls = [];

      await act(async () => {
        await latest!.syncPetpooja.mutateAsync();
      });

      expect(h.syncCalls.map((call) => call.branchId)).toEqual(['demo']);
      expect(invalidatedKeys()).toContain(JSON.stringify(['menuItems', 'demo']));
    });
  });

  describe.each(SYNC_DENIED)('role $label never reaches a sync service', ({ user }) => {
    beforeEach(() => {
      h.user = user();
    });

    it('an EMPTY catalog read is not turned into a sync', async () => {
      h.rows = [];
      await mount();

      expect(h.syncCalls).toEqual([]);
      expect(vi.mocked(syncPetpoojaMenuForBranch)).not.toHaveBeenCalled();
      // Products stay readable and the empty state stays honest.
      expect(latest!.items.length).toBeGreaterThan(0);
      expect(latest!.items.every((item) => item.name.startsWith('[DEMO]'))).toBe(true);
      expect(latest!.items.every((item) => item.lastSyncedAt === undefined)).toBe(true);
    });

    it('the background staleness effect never starts a sync', async () => {
      await mount();

      expect(h.autoSyncCalls).toEqual([]);
      expect(vi.mocked(checkAndAutoSyncMenu)).not.toHaveBeenCalled();
      expect(h.syncCalls).toEqual([]);
    });

    it('a manual sync request fails visibly instead of resolving as success', async () => {
      await mount();

      let caught: unknown = null;
      await act(async () => {
        try {
          await latest!.syncPetpooja.mutateAsync();
        } catch (err) {
          caught = err;
        }
      });

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/manager|role|permission|not permitted/i);
      // Local refusal: no request was sent and nothing claimed freshness.
      expect(h.syncCalls).toEqual([]);
      expect(vi.mocked(syncPetpoojaMenuForBranch)).not.toHaveBeenCalled();
      expect(invalidatedKeys().filter((key) => key.includes('menuItems'))).toEqual([]);
    });
  });

  it('a canonical read that FAILS never becomes a seed success (honesty preserved)', async () => {
    h.user = identity('branch_owner');
    h.getDocsImpl = async () => {
      throw Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
    };
    await mount();

    // The hook's own `retry: 1` overrides the client default, so the error is
    // only exposed once the retry is exhausted — wait for that instead of
    // reading the in-flight (not yet failed) state. The assertion itself is
    // unchanged: a failure must surface, and must not become a seed success.
    await vi.waitFor(() => expect(latest!.error).toBeInstanceOf(Error), { timeout: 5000 });
    expect(latest!.items).toEqual([]);
    expect(h.syncCalls).toEqual([]);
  });

  /**
   * P1.3 — ownership is re-checked AFTER the await, not only before it.
   *
   * The read starts while a branch_owner owns the scope; the operator is then
   * demoted to branch_staff while the products read is still outstanding. That
   * continuation must not start a sync: the request is privileged and the
   * CURRENT identity is not allowed to make it.
   */
  it('a demotion during a pending read cannot start a sync from the old continuation', async () => {
    h.user = identity('branch_owner');
    h.rows = [];
    let releaseRead: (() => void) | null = null;
    h.getDocsImpl = (call) =>
      call === 1
        ? new Promise((resolve) => {
            releaseRead = () => resolve({ docs: [], empty: true, size: 0 });
          })
        : Promise.resolve({ docs: [], empty: true, size: 0 });

    await mount();
    expect(releaseRead).not.toBeNull();
    expect(h.syncCalls).toEqual([]);

    // Demoted mid-flight, same branch: the suite keeps the in-flight read and
    // its captured continuation, which is exactly the race under test.
    h.user = identity('branch_staff');
    await rerender();

    await act(async () => {
      releaseRead!();
      for (let i = 0; i < 24; i += 1) await Promise.resolve();
    });

    // The privilege is gone: no sync, no invalidation of another scope.
    expect(h.syncCalls).toEqual([]);
    expect(vi.mocked(syncPetpoojaMenuForBranch)).not.toHaveBeenCalled();
    expect(h.invalidated).toEqual([]);
  });

  /**
   * M2 (independent review) — permission is not operation ownership.
   *
   * `maySyncMenuNow` returned `true` for every global role without looking at
   * the CURRENT branch, so a continuation started for outlet A could still sync
   * A after the operator had switched to B. These roles stay server-authorised,
   * so this is stale work rather than a demonstrated bypass — but P1.3 requires
   * current-branch ownership before a new side effect, for every role.
   *
   * The oracle is again the service boundary: no sync may be addressed to the
   * outlet the operator has already left.
   */
  describe.each(SYNC_ALLOWED)('role %s — a stale continuation cannot sync the abandoned outlet', (role) => {
    it('switching outlet mid-read means the resolved A read starts no sync for A', async () => {
      // Two outlets assigned, so the switch is a legitimate selection change and
      // not a scope reduction. `demo` (A) is the selection at mount.
      h.user = { id: `user_${role}`, role, branchIds: ['demo', 'demo2'], cityIds: [] };
      h.selectedBranchId = 'demo';
      h.rows = [productRow('prd_a')];
      let releaseRead: (() => void) | null = null;
      h.getDocsImpl = (call) =>
        call === 1
          ? new Promise((resolve) => {
              // Deferred A read: resolves EMPTY, i.e. the recovery-sync trigger.
              releaseRead = () => resolve({ docs: [], empty: true, size: 0 });
            })
          : Promise.resolve({
              docs: [{ id: 'prd_b', data: () => productRow('prd_b', 'demo2').data }],
              empty: false,
              size: 1,
            });

      await mount();
      expect(releaseRead).not.toBeNull();
      expect(h.syncCalls).toEqual([]);

      // The operator moves to outlet B while A's read is still in flight.
      h.selectedBranchId = 'demo2';
      await rerender();
      h.syncCalls = [];

      await act(async () => {
        releaseRead!();
        for (let i = 0; i < 24; i += 1) await Promise.resolve();
      });

      // The stale continuation belongs to an outlet this operator no longer has
      // open. It must not refresh it, for any role the server still accepts.
      expect(h.syncCalls.map((call) => call.branchId)).not.toContain('demo');
    });
  });

  /**
   * M2, second half — an old background completion must not invalidate the
   * outlet it ran for once the operator has left it.
   */
  describe.each(SYNC_ALLOWED)('role %s — a stale background completion claims no freshness', (role) => {
    it('a completion that lands after an outlet switch does not invalidate the abandoned outlet', async () => {
      h.user = { id: `user_${role}`, role, branchIds: ['demo', 'demo2'], cityIds: [] };
      h.selectedBranchId = 'demo';
      h.rows = [productRow('prd_a')];
      let releaseAuto: (() => void) | null = null;
      h.autoSyncImpl = (branchId) =>
        branchId === 'demo'
          ? new Promise<boolean>((resolve) => {
              releaseAuto = () => resolve(true);
            })
          : Promise.resolve(false);

      await mount();
      expect(releaseAuto).not.toBeNull();

      // Switch outlet while the background check for A is still outstanding.
      h.selectedBranchId = 'demo2';
      h.rows = [productRow('prd_b', 'demo2')];
      await rerender();
      h.invalidated = [];

      await act(async () => {
        releaseAuto!();
        for (let i = 0; i < 24; i += 1) await Promise.resolve();
      });

      // A's completion must not claim A's freshness on a screen showing B.
      expect(invalidatedKeys()).not.toContain(JSON.stringify(['menuItems', 'demo']));
    });
  });

  /**
   * M2, identity fence — a logout during a pending read must also stop the
   * sync, for a global role as well as a scoped one.
   */
  it('a logout during a pending read cannot start a sync (global role)', async () => {
    h.user = identity('brand_owner');
    h.rows = [];
    let releaseRead: (() => void) | null = null;
    h.getDocsImpl = (call) =>
      call === 1
        ? new Promise((resolve) => {
            releaseRead = () => resolve({ docs: [], empty: true, size: 0 });
          })
        : Promise.resolve({ docs: [], empty: true, size: 0 });

    await mount();
    expect(releaseRead).not.toBeNull();

    h.user = null;
    await rerender();

    await act(async () => {
      releaseRead!();
      for (let i = 0; i < 24; i += 1) await Promise.resolve();
    });

    expect(h.syncCalls).toEqual([]);
    expect(vi.mocked(syncPetpoojaMenuForBranch)).not.toHaveBeenCalled();
  });

  /**
   * R3 — the ABA gap: value equality cannot express "never left".
   *
   * `isSameMenuSyncScope` compares (userId, role, branchId). `A -> B -> A`
   * restores exactly that triple, so an operation started BEFORE the excursion
   * looks current again on return and its completion spends the privilege again.
   * The reviewer's `aba-proof-r2.json` demonstrated it for two shapes — an outlet
   * round trip and a same-account logout/relogin — in the background effect,
   * which also had no cleanup.
   *
   * These tests are the black-box version of that proof: they drive the real
   * hook, hold a real operation open, move the store through the excursion, then
   * let the OLD continuation finish. The oracle is unchanged and external — a
   * sync request the operator has no live operation for, or an invalidation
   * claiming freshness for it.
   *
   * Every transition goes through `selectBranch`/`setUser`, which fire the store
   * listeners exactly as zustand's `set()` does. Without that, the hook would
   * only ever see the two endpoints of `A -> B -> A` and the defect could not be
   * reproduced at all.
   */
  describe.each(SYNC_ALLOWED)('R3 role %s — A → B → A retires the pre-excursion operation', (role) => {
    const twoOutlets = () => ({ id: `user_${role}`, role, branchIds: ['demo', 'demo2'], cityIds: [] });

    it('the empty-menu read started before the excursion cannot sync on return', async () => {
      h.user = twoOutlets();
      h.selectedBranchId = 'demo';
      h.rows = [productRow('prd_a')];
      let releaseRead: (() => void) | null = null;
      h.getDocsImpl = (call) =>
        call === 1
          ? new Promise((resolve) => {
              // Deferred A read: resolves EMPTY, i.e. the recovery-sync trigger.
              releaseRead = () => resolve({ docs: [], empty: true, size: 0 });
            })
          : Promise.resolve({
              docs: [{ id: 'prd_b', data: () => productRow('prd_b', 'demo2').data }],
              empty: false,
              size: 1,
            });

      await mount();
      expect(releaseRead).not.toBeNull();
      expect(h.syncCalls).toEqual([]);

      // Out to B and back to A while A's read is still outstanding.
      await selectBranch('demo2');
      await selectBranch('demo');
      h.syncCalls = [];
      h.invalidated = [];

      await act(async () => {
        releaseRead!();
        for (let i = 0; i < 24; i += 1) await Promise.resolve();
      });

      // The continuation belongs to the generation before the excursion. The
      // outlet it would sync is the same one, which is exactly why a value
      // comparison lets it through — and exactly why it must not.
      expect(h.syncCalls.map((call) => call.branchId)).not.toContain('demo');
      expect(vi.mocked(syncPetpoojaMenuForBranch)).not.toHaveBeenCalled();
    });

    it('a background completion from before the excursion cannot claim freshness on return', async () => {
      h.user = twoOutlets();
      h.selectedBranchId = 'demo';
      h.rows = [productRow('prd_a')];
      let demoCalls = 0;
      let releaseFirst: (() => void) | null = null;
      h.autoSyncImpl = (branchId) => {
        if (branchId !== 'demo') return Promise.resolve(false);
        demoCalls += 1;
        // Only the pre-excursion arrival at A is held and answers "stale".
        if (demoCalls === 1) {
          return new Promise<boolean>((resolve) => {
            releaseFirst = () => resolve(true);
          });
        }
        return Promise.resolve(false);
      };

      await mount();
      expect(releaseFirst).not.toBeNull();

      await selectBranch('demo2');
      await selectBranch('demo');
      h.invalidated = [];

      await act(async () => {
        releaseFirst!();
        for (let i = 0; i < 24; i += 1) await Promise.resolve();
      });

      // `true` from the old generation must not repaint A's cache entry.
      expect(invalidatedKeys()).not.toContain(JSON.stringify(['menuItems', 'demo']));
      expect(h.invalidated).toEqual([]);
    });

    it('a manual sync accepted before the excursion cannot claim freshness on return', async () => {
      h.user = twoOutlets();
      h.selectedBranchId = 'demo';
      // Both outlets have rows, so the excursion itself triggers no recovery
      // sync. The manual sync below is then the ONLY send in this test, which is
      // what makes the count assertion mean something.
      h.rows = [productRow('prd_a'), productRow('prd_b', 'demo2')];
      let releaseSync: (() => void) | null = null;
      h.syncImpl = () =>
        new Promise((resolve) => {
          releaseSync = () => resolve({ categoriesSynced: 1, itemsSynced: 1, syncedAt: new Date() });
        });

      await mount();
      await act(async () => {
        void latest!.syncPetpooja.mutateAsync();
      });
      expect(releaseSync).not.toBeNull();
      expect(h.syncCalls).toHaveLength(1);

      await selectBranch('demo2');
      await selectBranch('demo');
      h.invalidated = [];

      await act(async () => {
        releaseSync!();
        for (let i = 0; i < 24; i += 1) await Promise.resolve();
      });

      // The request itself cannot be recalled, but its completion belongs to the
      // retired generation and must not claim freshness.
      expect(invalidatedKeys()).not.toContain(JSON.stringify(['menuItems', 'demo']));
      expect(h.invalidated).toEqual([]);
      expect(h.syncCalls).toHaveLength(1);
    });
  });

  /**
   * R3 CONTROL — retiring the old generation must not freeze the outlet.
   *
   * A fix that made the excursion permanently fatal would satisfy every test
   * above while breaking the feature. After returning, a NEW operation on the
   * same outlet must work normally.
   */
  it('CONTROL: an operation started AFTER the excursion still syncs and invalidates', async () => {
    h.user = { id: 'user_brand_owner', role: 'brand_owner', branchIds: ['demo', 'demo2'], cityIds: [] };
    h.selectedBranchId = 'demo';
    h.rows = [productRow('prd_a')];

    await mount();
    await selectBranch('demo2');
    await selectBranch('demo');
    h.syncCalls = [];
    h.invalidated = [];

    await act(async () => {
      await latest!.syncPetpooja.mutateAsync();
    });

    expect(h.syncCalls.map((call) => call.branchId)).toEqual(['demo']);
    expect(invalidatedKeys()).toContain(JSON.stringify(['menuItems', 'demo']));
  });

  /**
   * R3 — the same-account relogin is an ABA at the IDENTITY level.
   *
   * Sign out and back in as the same operator with the same role on the same
   * outlet: `(userId, role, branchId)` is identical before and after, so the
   * frozen guard answers `true` again. The session in between had no identity at
   * all, so the operation started before it is not the same session's work.
   *
   * Two roles, one global and one scoped, because the fence must not depend on
   * `isGlobalRole` — the M2 fix made global roles branch-aware, but neither role
   * class can express "the session was destroyed and rebuilt".
   */
  describe.each(['brand_owner', 'branch_owner'] as const)(
    'R3 role %s — logout/relogin of the same operator retires the pre-logout operation',
    (role) => {
      const operator = () => ({ id: `user_${role}`, role, branchIds: ['demo'], cityIds: [] });

      it('the empty-menu read started before the logout cannot sync after relogin', async () => {
        h.user = operator();
        h.selectedBranchId = 'demo';
        h.rows = [productRow('prd_a')];
        let releaseRead: (() => void) | null = null;
        h.getDocsImpl = (call) =>
          call === 1
            ? new Promise((resolve) => {
                releaseRead = () => resolve({ docs: [], empty: true, size: 0 });
              })
            : Promise.resolve({ docs: [], empty: true, size: 0 });

        await mount();
        expect(releaseRead).not.toBeNull();

        await setUser(null);
        await setUser(operator());
        h.syncCalls = [];
        h.invalidated = [];

        await act(async () => {
          releaseRead!();
          for (let i = 0; i < 24; i += 1) await Promise.resolve();
        });

        expect(h.syncCalls).toEqual([]);
        expect(vi.mocked(syncPetpoojaMenuForBranch)).not.toHaveBeenCalled();
      });

      it('a background completion from before the logout cannot claim freshness after relogin', async () => {
        h.user = operator();
        h.selectedBranchId = 'demo';
        h.rows = [productRow('prd_a')];
        let calls = 0;
        let releaseFirst: (() => void) | null = null;
        h.autoSyncImpl = () => {
          calls += 1;
          if (calls === 1) {
            return new Promise<boolean>((resolve) => {
              releaseFirst = () => resolve(true);
            });
          }
          return Promise.resolve(false);
        };

        await mount();
        expect(releaseFirst).not.toBeNull();

        await setUser(null);
        await setUser(operator());
        h.invalidated = [];

        await act(async () => {
          releaseFirst!();
          for (let i = 0; i < 24; i += 1) await Promise.resolve();
        });

        expect(invalidatedKeys()).not.toContain(JSON.stringify(['menuItems', 'demo']));
        expect(h.invalidated).toEqual([]);
      });

      it('a manual sync accepted before the logout cannot claim freshness after relogin', async () => {
        h.user = operator();
        h.selectedBranchId = 'demo';
        h.rows = [productRow('prd_a')];
        let releaseSync: (() => void) | null = null;
        h.syncImpl = () =>
          new Promise((resolve) => {
            releaseSync = () => resolve({ categoriesSynced: 1, itemsSynced: 1, syncedAt: new Date() });
          });

        await mount();
        await act(async () => {
          void latest!.syncPetpooja.mutateAsync();
        });
        expect(releaseSync).not.toBeNull();

        await setUser(null);
        await setUser(operator());
        h.invalidated = [];

        await act(async () => {
          releaseSync!();
          for (let i = 0; i < 24; i += 1) await Promise.resolve();
        });

        expect(invalidatedKeys()).not.toContain(JSON.stringify(['menuItems', 'demo']));
        expect(h.invalidated).toEqual([]);
      });
    },
  );

  /**
   * R3 — a role excursion away and back is an ABA on the PRIVILEGE.
   *
   * `brand_owner -> branch_staff -> brand_owner` restores the original role, so
   * value equality says "unchanged" while the session spent time without sync
   * authority. The operation started before the demotion must be retired.
   */
  describe.each(['brand_owner', 'branch_owner'] as const)(
    'R3 role %s — a demotion and restore retires the pre-demotion operation',
    (role) => {
      it('the empty-menu read started before the demotion cannot sync after the restore', async () => {
        h.user = { id: `user_${role}`, role, branchIds: ['demo'], cityIds: [] };
        h.selectedBranchId = 'demo';
        h.rows = [productRow('prd_a')];
        let releaseRead: (() => void) | null = null;
        h.getDocsImpl = (call) =>
          call === 1
            ? new Promise((resolve) => {
                releaseRead = () => resolve({ docs: [], empty: true, size: 0 });
              })
            : Promise.resolve({ docs: [], empty: true, size: 0 });

        await mount();
        expect(releaseRead).not.toBeNull();

        // Same account, same outlet, same branch ids — only the role moves.
        const demoted = { id: `user_${role}`, role: 'branch_staff', branchIds: ['demo'], cityIds: [] };
        await setUser(demoted);
        await setUser({ id: `user_${role}`, role, branchIds: ['demo'], cityIds: [] });
        h.syncCalls = [];

        await act(async () => {
          releaseRead!();
          for (let i = 0; i < 24; i += 1) await Promise.resolve();
        });

        expect(h.syncCalls).toEqual([]);
        expect(vi.mocked(syncPetpoojaMenuForBranch)).not.toHaveBeenCalled();
      });

      it('a background completion from before the demotion cannot claim freshness after the restore', async () => {
        h.user = { id: `user_${role}`, role, branchIds: ['demo'], cityIds: [] };
        h.selectedBranchId = 'demo';
        h.rows = [productRow('prd_a')];
        let calls = 0;
        let releaseFirst: (() => void) | null = null;
        h.autoSyncImpl = () => {
          calls += 1;
          if (calls === 1) {
            return new Promise<boolean>((resolve) => {
              releaseFirst = () => resolve(true);
            });
          }
          return Promise.resolve(false);
        };

        await mount();
        expect(releaseFirst).not.toBeNull();

        await setUser({ id: `user_${role}`, role: 'branch_staff', branchIds: ['demo'], cityIds: [] });
        await setUser({ id: `user_${role}`, role, branchIds: ['demo'], cityIds: [] });
        h.invalidated = [];

        await act(async () => {
          releaseFirst!();
          for (let i = 0; i < 24; i += 1) await Promise.resolve();
        });

        expect(invalidatedKeys()).not.toContain(JSON.stringify(['menuItems', 'demo']));
        expect(h.invalidated).toEqual([]);
      });
    },
  );

  /**
   * R3 — unmount is the last way an operation can outlive its owner.
   *
   * Nothing in the session changes here: the component simply stops existing,
   * so no value comparison and no store notification can express it. Only an
   * effect cleanup (or an explicit retirement) can, and the frozen effect had
   * none — `aba-proof-r2.json` recorded `effectHasCleanup: false`.
   *
   * Two roles, one global and one scoped: the cleanup must not depend on role.
   */
  describe.each(['brand_owner', 'branch_owner'] as const)(
    'R3 role %s — unmount retires a pending background check',
    (role) => {
      it('a completion that lands after unmount does not claim freshness', async () => {
        h.user = { id: `user_${role}`, role, branchIds: ['demo'], cityIds: [] };
        h.selectedBranchId = 'demo';
        h.rows = [productRow('prd_a')];
        let releaseAuto: (() => void) | null = null;
        h.autoSyncImpl = () =>
          new Promise<boolean>((resolve) => {
            releaseAuto = () => resolve(true);
          });

        await mount();
        expect(releaseAuto).not.toBeNull();

        await act(async () => {
          root!.unmount();
        });
        root = null;
        h.invalidated = [];

        await act(async () => {
          releaseAuto!();
          for (let i = 0; i < 24; i += 1) await Promise.resolve();
        });

        expect(h.invalidated).toEqual([]);
      });
    },
  );

  /**
   * R3 CONTROL — retiring on unmount must not fire on React's own remount.
   *
   * `main.tsx` renders inside `<StrictMode>`, whose development build deliberately
   * runs every effect setup → cleanup → setup on mount. If the ledger treated that
   * internal cleanup as a dead session, a dev menu would retire its own in-flight
   * work and silently skip the recovery sync. The retirement is therefore deferred
   * by one microtask and cancelled by the immediate re-subscribe; this test pins
   * that a StrictMode mount still syncs an empty catalog.
   */
  it('CONTROL: a StrictMode remount does not retire the live screen’s work', async () => {
    h.user = identity('brand_owner');
    h.rows = [];

    const strictContainer = document.createElement('div');
    document.body.appendChild(strictContainer);
    const strictRoot = createRoot(strictContainer);
    try {
      await act(async () => {
        strictRoot.render(
          <React.StrictMode>
            <QueryClientProvider client={client}>
              <Harness />
            </QueryClientProvider>
          </React.StrictMode>,
        );
      });
      await flush();

      expect(h.syncCalls.map((call) => call.branchId)).toEqual(['demo']);
    } finally {
      await act(async () => strictRoot.unmount());
      strictContainer.remove();
    }
  });

  /**
   * R4 (review r3, finding M2-lifecycle) — the ledger tracked whether ANY hook
   * existed, not whether the OWNING hook existed.
   *
   * `sessionObservers` is reference counted, so a second mounted menu screen kept
   * the count above zero when the first one unmounted. The generation therefore
   * never advanced, the departed screen's guard stayed `true`, and its background
   * completion still invalidated `['menuItems','A']`.
   *
   * A generation describes the SESSION; it cannot describe which component
   * instance started an operation. These tests mount two real consumers on one
   * query client — the app's actual shape — and require the owner's own lifetime
   * to fence its work regardless of who else is mounted.
   */
  describe('R4 — a departing OWNER retires its work even while another consumer stays mounted', () => {
    it('unmounting one consumer does not let its background completion claim freshness', async () => {
      h.user = identity('branch_owner');
      h.rows = [productRow('prd_a')];
      let releaseFirst: (() => void) | null = null;
      let calls = 0;
      h.autoSyncImpl = () => {
        calls += 1;
        // Only the FIRST consumer's check is held; the second resolves "fresh".
        if (calls === 1) {
          return new Promise<boolean>((resolve) => {
            releaseFirst = () => resolve(true);
          });
        }
        return Promise.resolve(false);
      };

      await mount();
      expect(releaseFirst).not.toBeNull();

      // A second consumer joins. The shared ledger now has two subscribers, so
      // the reference-counted teardown cannot fire when one leaves.
      await mountSecond();
      expect(latestSecond).not.toBeNull();

      // Only the OWNER unmounts; the other screen is still live.
      await act(async () => {
        root!.unmount();
      });
      root = null;
      h.invalidated = [];

      await act(async () => {
        releaseFirst!();
        for (let i = 0; i < 24; i += 1) await Promise.resolve();
      });

      // The owner is gone. Its completion must not repaint anybody's cache.
      expect(invalidatedKeys()).not.toContain(JSON.stringify(['menuItems', 'demo']));
      expect(h.invalidated).toEqual([]);
      // And the surviving consumer is still a working hook, not a poisoned one.
      expect(latestSecond).not.toBeNull();
    });

    it('a DIFFERENT consumer replacing the owner in the same turn cannot revive its work', async () => {
      h.user = identity('branch_owner');
      h.rows = [productRow('prd_a')];
      let releaseFirst: (() => void) | null = null;
      let calls = 0;
      h.autoSyncImpl = () => {
        calls += 1;
        if (calls === 1) {
          return new Promise<boolean>((resolve) => {
            releaseFirst = () => resolve(true);
          });
        }
        return Promise.resolve(false);
      };

      await mount();
      expect(releaseFirst).not.toBeNull();
      await mountSecond();

      // One turn: the owner leaves AND a replacement arrives before anything
      // else runs. A reference count that only looks at "any subscriber exists"
      // sees no change at all here.
      await act(async () => {
        root!.unmount();
        root = null;
        forceRenderSecond();
      });
      await flush();
      h.invalidated = [];

      await act(async () => {
        releaseFirst!();
        for (let i = 0; i < 24; i += 1) await Promise.resolve();
      });

      // A different instance must never stand in for the dead owner.
      expect(h.invalidated).toEqual([]);
    });

    it('a completion already queued when the owner unmounts is still refused', async () => {
      // The REVIEW-r3 addendum: resolve the helper BEFORE the unmount and let the
      // unmount happen synchronously, then flush microtasks. The review proved
      // that slot reachable, so the assertion counts invalidations recorded
      // AFTER the release rather than resetting the recorder around it — a reset
      // there would hide an invalidation that the queue slot itself produced.
      h.user = identity('branch_owner');
      h.rows = [productRow('prd_a')];
      let releaseFirst: (() => void) | null = null;
      let calls = 0;
      h.autoSyncImpl = () => {
        calls += 1;
        if (calls === 1) {
          return new Promise<boolean>((resolve) => {
            releaseFirst = () => resolve(true);
          });
        }
        return Promise.resolve(false);
      };

      await mount();
      expect(releaseFirst).not.toBeNull();
      await mountSecond();

      const before = h.invalidated.length;
      // Resolve first, unmount second, and do NOT let microtasks run in between.
      releaseFirst!();
      await act(async () => {
        root!.unmount();
      });
      root = null;

      await act(async () => {
        for (let i = 0; i < 24; i += 1) await Promise.resolve();
      });

      expect(h.invalidated.slice(before)).toEqual([]);
    });
  });

  /**
   * R4 (review r3, finding M2-outcome) — the manual mutation suppressed stale
   * invalidation but still RESOLVED AS SUCCESS.
   *
   * `MenuPage.handleManualSync` awaits `mutateAsync()` and then paints the chip
   * online and announces "Catalog refreshed". So an accepted A sync completing
   * after the operator moved to B claimed B was refreshed. The reviewer's
   * `manual-outcome-proof-r3.json` executed both callbacks and recorded outcome
   * `ok` with that toast on B.
   *
   * The fix is a typed retired outcome the caller can recognise, so the page can
   * release pending state without asserting freshness on the WRONG outlet — a
   * rejection would instead paint a misleading failure.
   */
  describe('R4 — a manual sync that no longer owns its outlet reports a retired outcome', () => {
    const deferredSync = () => {
      let release: (() => void) | null = null;
      h.syncImpl = () =>
        new Promise((resolve) => {
          release = () => resolve({ categoriesSynced: 1, itemsSynced: 1, syncedAt: new Date() });
        });
      return () => release!();
    };

    it('switching outlet mid-sync yields the retired outcome, not success', async () => {
      h.user = { id: 'user_owner', role: 'branch_owner', branchIds: ['demo', 'demo2'], cityIds: [] };
      h.selectedBranchId = 'demo';
      h.rows = [productRow('prd_a'), productRow('prd_b', 'demo2')];
      const release = deferredSync();

      await mount();
      let settled: any = null;
      let rejected: unknown = null;
      await act(async () => {
        latest!.syncPetpooja.mutateAsync().then(
          (value) => {
            settled = value;
          },
          (err) => {
            rejected = err;
          },
        );
      });

      await selectBranch('demo2');
      h.invalidated = [];

      await act(async () => {
        release();
        for (let i = 0; i < 24; i += 1) await Promise.resolve();
      });

      // Retirement is a RESULT, never a rejection: a rejection would let the page
      // paint a failure on an outlet whose sync may well have succeeded.
      expect(rejected).toBeNull();
      expect(settled).toMatchObject({ status: 'retired' });
      expect(invalidatedKeys()).not.toContain(JSON.stringify(['menuItems', 'demo']));
      expect(h.invalidated).toEqual([]);
    });

    it('an A → B → A round trip also yields the retired outcome', async () => {
      h.user = { id: 'user_owner', role: 'branch_owner', branchIds: ['demo', 'demo2'], cityIds: [] };
      h.selectedBranchId = 'demo';
      h.rows = [productRow('prd_a'), productRow('prd_b', 'demo2')];
      const release = deferredSync();

      await mount();
      let settled: any = null;
      await act(async () => {
        latest!.syncPetpooja.mutateAsync().then((value) => {
          settled = value;
        });
      });

      await selectBranch('demo2');
      await selectBranch('demo');
      h.invalidated = [];

      await act(async () => {
        release();
        for (let i = 0; i < 24; i += 1) await Promise.resolve();
      });

      expect(settled).toMatchObject({ status: 'retired' });
      expect(h.invalidated).toEqual([]);
    });

    it('a logout and same-account relogin also yields the retired outcome', async () => {
      const operator = { id: 'user_brand_owner', role: 'brand_owner', branchIds: ['demo'], cityIds: [] };
      h.user = operator;
      h.selectedBranchId = 'demo';
      h.rows = [productRow('prd_a')];
      const release = deferredSync();

      await mount();
      let settled: any = null;
      await act(async () => {
        latest!.syncPetpooja.mutateAsync().then((value) => {
          settled = value;
        });
      });

      await setUser(null);
      await setUser(operator);
      h.invalidated = [];

      await act(async () => {
        release();
        for (let i = 0; i < 24; i += 1) await Promise.resolve();
      });

      expect(settled).toMatchObject({ status: 'retired' });
      expect(h.invalidated).toEqual([]);
    });

    it('the owner unmounting mid-sync also yields the retired outcome', async () => {
      h.user = identity('branch_owner');
      h.selectedBranchId = 'demo';
      h.rows = [productRow('prd_a')];
      const release = deferredSync();

      await mount();
      let settled: any = null;
      await act(async () => {
        latest!.syncPetpooja.mutateAsync().then((value) => {
          settled = value;
        });
      });

      await act(async () => {
        root!.unmount();
      });
      root = null;
      h.invalidated = [];

      await act(async () => {
        release();
        for (let i = 0; i < 24; i += 1) await Promise.resolve();
      });

      expect(settled).toMatchObject({ status: 'retired' });
      expect(h.invalidated).toEqual([]);
    });

    it.each(['switch', 'round-trip', 'relogin', 'unmount', 'current'] as const)(
      'a deferred rejection is neutral only after ownership retirement: %s',
      async (transitionKind) => {
        const operator = {
          id: 'user_owner', role: 'branch_owner', branchIds: ['demo', 'demo2'], cityIds: [],
        };
        h.user = operator;
        h.selectedBranchId = 'demo';
        h.rows = [productRow('prd_a'), productRow('prd_b', 'demo2')];
        const outage = new Error('simulated backend outage');
        let failSync: (() => void) | null = null;
        h.syncImpl = () => new Promise((_resolve, reject) => {
          failSync = () => reject(outage);
        });

        await mount();
        let settled: any = null;
        let rejected: unknown = null;
        await act(async () => {
          latest!.syncPetpooja.mutateAsync().then(
            (value) => { settled = value; },
            (error) => { rejected = error; },
          );
        });
        expect(failSync).not.toBeNull();

        if (transitionKind === 'switch' || transitionKind === 'round-trip') {
          await selectBranch('demo2');
          if (transitionKind === 'round-trip') await selectBranch('demo');
        } else if (transitionKind === 'relogin') {
          await setUser(null);
          await setUser(operator);
        } else if (transitionKind === 'unmount') {
          await act(async () => root!.unmount());
          root = null;
        }
        h.invalidated = [];

        await act(async () => {
          failSync!();
          for (let i = 0; i < 24; i += 1) await Promise.resolve();
        });

        if (transitionKind === 'current') {
          expect(rejected).toBe(outage);
          expect(settled).toBeNull();
        } else {
          expect(rejected).toBeNull();
          expect(settled).toMatchObject({ status: 'retired', branchId: 'demo' });
        }
        expect(h.invalidated).toEqual([]);
      },
    );

    it('CONTROL: a sync that still owns its outlet reports a real success', async () => {
      h.user = identity('branch_owner');
      h.selectedBranchId = 'demo';
      h.rows = [productRow('prd_a')];

      await mount();
      let settled: any = null;
      await act(async () => {
        settled = await latest!.syncPetpooja.mutateAsync();
      });

      expect(settled).toMatchObject({ status: 'ok' });
      expect(invalidatedKeys()).toContain(JSON.stringify(['menuItems', 'demo']));
    });
  });

  /**
   * P1.4 (CONTROL) — a sync the server already accepted cannot be recalled by
   * the UI, and its late completion must not claim freshness for a DIFFERENT
   * outlet. Switching outlet mid-flight must leave the new outlet's rows and
   * freshness label untouched, and must not start a second (repeat) sync.
   */
  it('a late completion never claims freshness for a different outlet', async () => {
    h.user = { id: 'user_owner', role: 'branch_owner', branchIds: ['demo', 'demo2'], cityIds: [] };
    h.rows = [productRow('prd_a')];
    let releaseSync: (() => void) | null = null;
    h.syncImpl = () =>
      new Promise((resolve) => {
        releaseSync = () => resolve({ categoriesSynced: 1, itemsSynced: 1, syncedAt: new Date() });
      });

    await mount();
    await act(async () => {
      void latest!.syncPetpooja.mutateAsync();
    });
    expect(releaseSync).not.toBeNull();
    expect(h.syncCalls).toHaveLength(1);

    h.selectedBranchId = 'demo2';
    h.rows = [productRow('prd_z', 'demo2')];
    await rerender();
    h.invalidated = [];

    await act(async () => {
      releaseSync!();
      for (let i = 0; i < 24; i += 1) await Promise.resolve();
    });

    // The completed sync belongs to the OLD outlet. It must not repaint, refetch
    // or invalidate the new outlet's cache entry, and must not start a repeat.
    expect(latest!.branchId).toBe('demo2');
    expect(latest!.items.map((item) => item.id)).toEqual(['prd_z']);
    expect(invalidatedKeys()).not.toContain(JSON.stringify(['menuItems', 'demo2']));
    expect(latest!.lastSyncedAt).toBeNull();
    expect(h.syncCalls).toHaveLength(1);
    expect(latest!.error).toBeNull();
  });
});
