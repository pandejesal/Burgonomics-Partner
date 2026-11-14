import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Global-feed honesty: a global role reads TWO Firestore listeners
 * (`createdAt` primary + `placedAt` Delivery feed). The hook must never claim
 * the makeline is live while EITHER listener is dead, and a healthy feed must
 * not mask a dead one.
 *
 * The bugs this pins:
 * - `handleStreamError` logged `missing_index` and returned WITHOUT setting a
 *   fault, while the primary inline handler did set one. So a secondary feed
 *   dying on `failed-precondition` looked completely healthy.
 * - `ingest()` cleared `liveError` unconditionally, so any healthy primary
 *   snapshot erased the secondary feed's failure (and vice versa).
 *
 * The oracle is the hook's own `streamStatus`: only a genuinely healthy pair
 * may report `live`.
 */
const h = vi.hoisted(() => ({
  hookIndex: 0,
  states: [] as any[],
  initialized: [] as boolean[],
  refs: [] as any[],
  effects: [] as Array<{ deps?: any[]; run: () => void; cleanup?: () => void } | undefined>,
  pending: [] as Array<{ idx: number; deps?: any[]; run: () => any; cleanup?: () => void }>,
  memo: [] as Array<{ deps?: any[]; value: any } | undefined>,
  dirty: false,
  listeners: [] as Array<{ next: (snap: any) => void; error: (err: any) => void }>,
  renderHook: null as null | (() => void),
  result: null as any,
  user: { id: 'owner', role: 'brand_owner', branchIds: [] } as any,
  selectedBranchId: null as string | null,
  // One-shot fallback state, controllable per test (item 2 needs a FAILED
  // one-shot while the live feeds have already verified data).
  oneShot: { orders: [] as any[], isLoading: false, error: null as unknown },
  // Alias merge control (item 1): a deferred promise the test resolves AFTER the
  // listener has already failed.
  alias: {
    impl: null as null | ((branchIds: string[]) => Promise<any[]>),
    calls: 0,
  },
}));

vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: any) => {
      const idx = h.hookIndex++;
      if (!h.initialized[idx]) {
        h.states[idx] = typeof initial === 'function' ? initial() : initial;
        h.initialized[idx] = true;
      }
      const set = (value: any) => {
        const next = typeof value === 'function' ? value(h.states[idx]) : value;
        if (!Object.is(next, h.states[idx])) {
          h.states[idx] = next;
          h.dirty = true;
        }
      };
      return [h.states[idx], set];
    },
    useRef: (current: any) => {
      const idx = h.hookIndex++;
      if (!(idx in h.refs)) h.refs[idx] = { current };
      return h.refs[idx];
    },
    useCallback: (fn: any) => fn,
    useMemo: (fn: any, deps?: any[]) => {
      const idx = h.hookIndex++;
      const prev = h.memo[idx];
      const changed =
        !prev ||
        !deps ||
        !prev.deps ||
        deps.length !== prev.deps.length ||
        deps.some((dep, i) => !Object.is(dep, prev.deps![i]));
      if (changed) h.memo[idx] = { deps, value: fn() };
      return h.memo[idx]!.value;
    },
    useEffect: (run: () => any, deps?: any[]) => {
      const idx = h.hookIndex++;
      const prev = h.effects[idx];
      const changed =
        !prev ||
        !deps ||
        !prev.deps ||
        deps.length !== prev.deps.length ||
        deps.some((dep, i) => !Object.is(dep, prev.deps![i]));
      if (changed) h.pending.push({ idx, deps, run, cleanup: prev?.cleanup });
    },
  };
});

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/useOrders', () => ({
  useOrders: () => ({
    orders: h.oneShot.orders,
    isLoading: h.oneShot.isLoading,
    error: h.oneShot.error,
    updateOrderStatus: { mutateAsync: vi.fn() },
  }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: Object.assign(() => ({ user: h.user }), { getState: () => ({ user: h.user }) }),
}));
vi.mock('@/stores/appStore', () => ({
  useAppStore: Object.assign(() => ({ selectedBranchId: h.selectedBranchId }), {
    getState: () => ({ selectedBranchId: h.selectedBranchId }),
  }),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  query: (...args: unknown[]) => ({ args }),
  where: () => ({}),
  orderBy: (field: string) => ({ field }),
  limit: () => ({}),
  onSnapshot: (q: any, next: (snap: any) => void, error: (err: any) => void) => {
    // Order by which date field the query was built with, so each listener
    // keeps its own identity.
    const field = (q?.args ?? []).map((a: any) => a?.field).find(Boolean) ?? 'createdAt';
    h.listeners.push({ next, error });
    (h.listeners as any).byField = (h.listeners as any).byField ?? {};
    (h.listeners as any).byField[field] = h.listeners[h.listeners.length - 1];
    return vi.fn();
  },
}));
vi.mock('@/utils/orderContract', async (original) => ({
  ...(await original<typeof import('@/utils/orderContract')>()),
  // Item 1/5: the REAL ingestion gate stays in force so a deferred alias merge
  // can genuinely be raced against a terminal listener error. Only the network
  // fetch is stubbed, and it is controllable per test.
  fetchAliasedStoreOrders: vi.fn(async (branchIds: string[]) => {
    h.alias.calls += 1;
    if (h.alias.impl) return h.alias.impl(branchIds);
    return [];
  }),
  orderDocTimeMs: () => 0,
}));
vi.mock('@capacitor/haptics', () => ({
  Haptics: { notification: vi.fn(async () => undefined) },
  NotificationType: { Success: 'SUCCESS' },
}));
vi.mock('@/utils/kdsAudio', () => ({
  playKDSArrivalCue: vi.fn(),
  stopRepeatingKDSAlarm: vi.fn(),
  resetKDSAlarmState: vi.fn(),
  syncKDSAlarmState: vi.fn(),
}));

import { useKDSRealtimeStream } from '../src/features/kds/hooks/useKDSRealtimeStream';

const order = (id: string, status: string) => ({
  id,
  branchId: 'branch_1',
  status,
  paymentMethod: 'cod',
  paymentChannel: 'cod',
  items: [],
  total: 100,
  createdAt: { toMillis: () => 1 },
});

function runRender() {
  h.hookIndex = 0;
  h.pending = [];
  h.renderHook!();
  const pending = h.pending.splice(0);
  for (const effect of pending) {
    effect.cleanup?.();
    const cleanup = effect.run();
    h.effects[effect.idx] = {
      deps: effect.deps,
      run: effect.run,
      cleanup: typeof cleanup === 'function' ? cleanup : undefined,
    };
  }
}

function settle() {
  for (let i = 0; i < 20; i++) {
    h.dirty = false;
    runRender();
    if (!h.dirty) return;
  }
  throw new Error('hook render did not settle');
}

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function feed(field: 'createdAt' | 'placedAt') {
  const byField = (h.listeners as any).byField ?? {};
  const listener = byField[field];
  if (!listener) throw new Error(`no listener registered for ${field}`);
  return listener;
}

async function deliver(field: 'createdAt' | 'placedAt', orders: any[]) {
  feed(field).next({ docs: orders.map((o) => ({ id: o.id, data: () => o })) });
  await flush();
  settle();
}

async function fail(field: 'createdAt' | 'placedAt', err: unknown) {
  feed(field).error(err);
  await flush();
  settle();
}

const missingIndex = () =>
  Object.assign(new Error('The query requires an index.'), { code: 'failed-precondition' });

function reset() {
  h.hookIndex = 0;
  h.states = [];
  h.initialized = [];
  h.refs = [];
  h.memo = [];
  h.effects = [];
  h.pending = [];
  h.dirty = false;
  h.listeners = [];
  (h.listeners as any).byField = {};
  h.oneShot = { orders: [], isLoading: false, error: null };
  h.alias.impl = null;
  h.alias.calls = 0;
}

describe('useKDSRealtimeStream — two global feeds stay individually honest', () => {
  beforeEach(() => {
    reset();
    h.selectedBranchId = null;
    h.user = { id: 'owner', role: 'brand_owner', branchIds: [] };
    (globalThis as any).window = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    };
    h.renderHook = () => {
      // eslint-disable-next-line react-hooks/rules-of-hooks -- test harness invokes the hook directly
      h.result = useKDSRealtimeStream();
    };
    settle();
  });

  afterEach(() => {
    for (const effect of h.effects) effect?.cleanup?.();
    delete (globalThis as any).window;
  });

  it('both feeds healthy reports live and keeps the orders', async () => {
    await deliver('createdAt', [order('A', 'pending')]);
    // The placedAt feed owns only docs MISSING createdAt (Delivery schema).
    await deliver('placedAt', [{ ...order('D1', 'pending'), createdAt: undefined }]);
    expect(h.result.streamStatus).toBe('live');
    expect(h.result.activeOrders.map((o: any) => o.id).sort()).toEqual(['A', 'D1']);
  });

  it('a missing index on the SECONDARY feed degrades status and keeps last-good orders', async () => {
    await deliver('createdAt', [order('A', 'pending')]);
    // Delivery-schema doc: no createdAt, so the secondary feed owns it.
    await deliver('placedAt', [{ ...order('D1', 'pending'), createdAt: undefined }]);
    expect(h.result.streamStatus).toBe('live');

    await fail('placedAt', missingIndex());

    expect(h.result.streamStatus).toBe('live_unavailable');
    expect(h.result.activeOrders.map((o: any) => o.id).sort()).toEqual(['A', 'D1']);
  });

  it('a healthy primary snapshot AFTER the secondary died does not mask it', async () => {
    await deliver('createdAt', [order('A', 'pending')]);
    await deliver('placedAt', [order('D1', 'pending')]);
    await fail('placedAt', missingIndex());

    await deliver('createdAt', [order('A', 'pending'), order('B', 'pending')]);

    expect(h.result.streamStatus).toBe('live_unavailable');
  });

  it('a healthy secondary snapshot AFTER the primary died does not mask it', async () => {
    await deliver('createdAt', [order('A', 'pending')]);
    await deliver('placedAt', [order('D1', 'pending')]);
    await fail('createdAt', missingIndex());

    await deliver('placedAt', [order('D1', 'pending'), order('D2', 'pending')]);

    expect(h.result.streamStatus).toBe('live_unavailable');
  });

  it('restores live only through refresh() — a Firestore error callback is terminal', async () => {
    await deliver('createdAt', [order('A', 'pending')]);
    await deliver('placedAt', [order('D1', 'pending')]);
    await fail('placedAt', new Error('transport hiccup'));
    expect(h.result.streamStatus).toBe('live_unavailable');

    // Firestore error callbacks are TERMINAL: the listener is torn down and
    // will never emit again. The previous version of this test emitted another
    // snapshot from the SAME listener and expected recovery — a sequence that
    // cannot occur in production, so it proved nothing about real behaviour.
    // Recovery happens only via resubscription.
    await deliver('placedAt', [order('D1', 'pending')]);
    expect(h.result.streamStatus).toBe('live_unavailable');

    const gen1 = feed('placedAt');
    h.result.refresh();
    await flush();
    settle();

    // The fresh generation must re-prove BOTH feeds before claiming live.
    await deliver('createdAt', [order('A', 'pending')]);
    expect(h.result.streamStatus).toBe('connecting');
    await deliver('placedAt', [order('D1', 'pending')]);
    expect(h.result.streamStatus).toBe('live');

    // A late callback from the dead generation cannot resurrect the failure.
    gen1.error(new Error('late terminal error'));
    await flush();
    settle();
    expect(h.result.streamStatus).toBe('live');
  });

  it('a branch-scoped single-feed error still degrades correctly', async () => {
    h.selectedBranchId = 'branch_1';
    h.user = { id: 'staff', role: 'branch_staff', branchIds: ['branch_1'] };
    reset();
    settle();

    await deliver('createdAt', [order('A', 'pending')]);
    expect(h.result.streamStatus).toBe('live');

    await fail('createdAt', missingIndex());
    expect(h.result.streamStatus).toBe('live_unavailable');
    expect(h.result.activeOrders.map((o: any) => o.id)).toEqual(['A']);
  });

  /**
   * BUGA — generation recovery.
   *
   * `refresh()` resubscribes, which builds a NEW empty `feedFailures` map inside
   * the fresh effect. The `liveError` React state, however, survives from the
   * dead generation. In the new generation `clearFeedFailure()` starts with
   * `if (!feedFailures.has(feed)) return;`, so a successful snapshot from a feed
   * that never failed in THIS generation never publishes `null` — the badge
   * stays "Live Unavailable" forever even though both feeds are healthy again.
   *
   * Driven through the real effect: the gen-1 error, the real `refresh()`, then
   * gen-2 snapshots. Deferred gen-1 callbacks are retained and fired last to
   * prove they can neither resurrect the old error nor poison the new one.
   */
  it('BUGA: a new listener generation recovers to live after refresh', async () => {
    await deliver('createdAt', [order('A', 'pending')]);
    await deliver('placedAt', [{ ...order('D1', 'pending'), createdAt: undefined }]);
    expect(h.result.streamStatus).toBe('live');

    // Retain generation 1's callbacks before refresh() replaces them.
    const gen1 = { createdAt: feed('createdAt'), placedAt: feed('placedAt') };

    await fail('placedAt', missingIndex());
    expect(h.result.streamStatus).toBe('live_unavailable');

    // Operator retry: resubscribe into a brand-new listener generation.
    h.result.refresh();
    await flush();
    settle();

    // Generation 2 delivers first snapshots for BOTH feeds — both healthy.
    await deliver('createdAt', [order('A', 'pending')]);
    await deliver('placedAt', [{ ...order('D1', 'pending'), createdAt: undefined }]);

    // ~(red) Stuck on live_unavailable because the stale error is never cleared.
    expect(h.result.streamStatus).toBe('live');
    expect(h.result.streamError).toBeNull();

    // Deferred generation-1 callbacks must be inert: the old error must not
    // come back, and a stale payload must not enter the new generation's board.
    gen1.placedAt.error(missingIndex());
    await flush();
    settle();
    expect(h.result.streamStatus).toBe('live');

    gen1.createdAt.next({
      docs: [{ id: 'STALE', data: () => order('STALE', 'pending') }],
    });
    await flush();
    settle();
    expect(h.result.activeOrders.map((o: any) => o.id)).not.toContain('STALE');
    expect(h.result.streamStatus).toBe('live');
  });

  /**
   * BUGB — global initial readiness.
   *
   * A global role has TWO feeds. `streamHydrated` flips on the first snapshot
   * from EITHER one, and `deriveKdsStreamStatus` treats that as fully live — so
   * the header claims "Live" while the Delivery feed has never proven it can
   * deliver. The `feedFailures` map only tracks failure; an unknown second feed
   * is not a healthy one.
   *
   * A settled one-shot fallback (`isLoading:false`, no error) proves that data
   * EXISTS, not that both listeners deliver, so it must not promote to live.
   */
  it('BUGB: global scope stays connecting until BOTH feeds deliver a first snapshot', async () => {
    // Cold start: useOrders is settled (isLoading false, no error) but no
    // snapshot has arrived from either feed.
    expect(h.result.streamStatus).toBe('connecting');

    // Only the primary has delivered a first snapshot so far.
    await deliver('createdAt', [order('A', 'pending')]);
    // ~(red) Currently 'live' — the Delivery feed has proven nothing yet.
    expect(h.result.streamStatus).toBe('connecting');

    // The Delivery feed's FIRST snapshot — an empty one is a valid proof of
    // delivery — now allows the honest "live" claim.
    await deliver('placedAt', []);
    expect(h.result.streamStatus).toBe('live');
  });

  it('BUGB control: a cold branch-scoped lane goes live on its single feed', async () => {
    // Scoped roles read ONE feed, so its first snapshot alone is full proof.
    h.selectedBranchId = 'branch_1';
    h.user = { id: 'staff', role: 'branch_staff', branchIds: ['branch_1'] };
    reset();
    settle();

    expect(h.result.streamStatus).toBe('connecting');
    await deliver('createdAt', [order('A', 'pending')]);
    expect(h.result.streamStatus).toBe('live');
  });

  /**
   * Astra item 1 — a pending alias merge must not resurrect a terminal error.
   *
   * A scoped snapshot starts `fetchAliasedStoreOrders`; the listener then fails.
   * Firestore error callbacks are terminal, yet the pending merge keeps the
   * current ingestion token, so when it resolves it calls `ingest()` and clears
   * the newer failure, advertising `live`. Failures must invalidate pending
   * merges and survive until resubscription.
   */
  it('item1: a deferred alias merge cannot clear a terminal listener error', async () => {
    h.selectedBranchId = 'branch_1';
    h.user = { id: 'staff', role: 'branch_staff', branchIds: ['branch_1'] };
    reset();

    let releaseAlias: (rows: any[]) => void = () => undefined;
    h.alias.impl = () =>
      new Promise<any[]>((resolve) => {
        releaseAlias = resolve;
      });

    settle();
    const beforeIngest = h.result.lastRefreshAt;

    // Primary snapshot kicks off the alias fetch and then the listener dies.
    feed('createdAt').next({ docs: [{ id: 'A', data: () => order('A', 'pending') }] });
    await flush();
    await fail('createdAt', missingIndex());
    expect(h.result.streamStatus).toBe('live_unavailable');
    const afterError = h.result.lastRefreshAt;

    // The stale merge now resolves — it must NOT prove the feed live again.
    releaseAlias([{ id: 'ALIAS', data: order('ALIAS', 'pending') }]);
    await flush();
    settle();

    expect(h.result.streamStatus).toBe('live_unavailable');
    // lastRefreshAt tracks successful deliveries only; a raced stale merge must
    // not advance it past the failure.
    expect(h.result.lastRefreshAt).toBe(afterError);
    expect(afterError).toBe(beforeIngest);
  });

  /**
   * Astra item 2 — readiness is current-generation; verification is historical.
   *
   * `dataVerified` reuses `streamHydrated`, which now resets on refresh. With a
   * failed one-shot query and previously verified live snapshots, a refresh
   * flipped dataVerified true→false and the columns showed `error` instead of
   * the retained, verified orders.
   */
  it('item2: refresh keeps verified orders when the one-shot query failed', async () => {
    h.oneShot = { orders: [], isLoading: false, error: new Error('one-shot failed') };

    await deliver('createdAt', [order('A', 'pending')]);
    await deliver('placedAt', [{ ...order('D1', 'pending'), createdAt: undefined }]);
    expect(h.result.dataVerified).toBe(true);

    h.result.refresh();
    await flush();
    settle();

    // Current generation has proven nothing yet, so the badge is honestly
    // "connecting" — but the previously verified dataset is still on screen.
    expect(h.result.streamStatus).toBe('connecting');
    expect(h.result.dataVerified).toBe(true);
    expect(h.result.activeOrders.map((o: any) => o.id).sort()).toEqual(['A', 'D1']);
  });

  /**
   * Astra item 3 — a same-scope refresh must retain each feed's last page.
   *
   * The new generation starts with an empty `globalPages`, so the first primary
   * snapshot replaces the board with primary-only data and deletes last-good
   * Delivery tickets. If Delivery then fails they stay missing, and an empty
   * primary snapshot can blank the board.
   */
  it('item3: a same-scope refresh retains the Delivery page until it re-delivers', async () => {
    await deliver('createdAt', [order('A', 'pending')]);
    await deliver('placedAt', [{ ...order('D1', 'pending'), createdAt: undefined }]);
    expect(h.result.activeOrders.map((o: any) => o.id).sort()).toEqual(['A', 'D1']);

    h.result.refresh();
    await flush();
    settle();

    // Primary re-delivers an empty page; Delivery has not yet re-delivered.
    await deliver('createdAt', []);

    // ~(red) Delivery ticket D1 is dropped because globalPages was reset.
    expect(h.result.activeOrders.map((o: any) => o.id)).toContain('D1');
  });

  it('item3b: a failing Delivery feed after refresh keeps the retained page visible', async () => {
    await deliver('createdAt', [order('A', 'pending')]);
    await deliver('placedAt', [{ ...order('D1', 'pending'), createdAt: undefined }]);

    h.result.refresh();
    await flush();
    settle();

    await deliver('createdAt', [order('A', 'pending')]);
    await fail('placedAt', missingIndex());

    expect(h.result.streamStatus).toBe('live_unavailable');
    expect(h.result.activeOrders.map((o: any) => o.id)).toContain('D1');
  });

  /**
   * Astra item 4 — liveness/error must reset before the early exits.
   *
   * The no-user and unassigned-scoped-user returns happen before the reset, so
   * moving from a healthy scope to a scoped user with no branches keeps
   * reporting `live`, and an old error survives too.
   */
  it('item4: an unassigned scoped user is not live and inherits no old error', async () => {
    await deliver('createdAt', [order('A', 'pending')]);
    await deliver('placedAt', [{ ...order('D1', 'pending'), createdAt: undefined }]);
    expect(h.result.streamStatus).toBe('live');

    const healthy = { createdAt: feed('createdAt'), placedAt: feed('placedAt') };

    // Switch to a scoped user with no branch assignments: the effect returns
    // early and must publish a non-live, fault-reset state.
    h.user = { id: 'nobody', role: 'branch_staff', branchIds: [] };
    settle();

    // ~(red) Still 'live' because the early return precedes the reset.
    expect(h.result.streamStatus).not.toBe('live');

    // The old generation's callbacks must be inert.
    healthy.createdAt.next({ docs: [{ id: 'STALE', data: () => order('STALE', 'pending') }] });
    await flush();
    settle();
    expect(h.result.activeOrders).toEqual([]);
  });

  it('item4b: an unassigned scoped user cleared a previously recorded failure', async () => {
    await deliver('createdAt', [order('A', 'pending')]);
    await fail('createdAt', missingIndex());
    expect(h.result.streamStatus).toBe('live_unavailable');
    expect(h.result.streamError).not.toBeNull();

    h.user = { id: 'nobody', role: 'branch_staff', branchIds: [] };
    settle();

    // ~(red) The old error survives the early return.
    expect(h.result.streamError).toBeNull();
    expect(h.result.streamStatus).not.toBe('live');
  });
});
