import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F11 — a stale/precondition 409 means ANOTHER terminal already moved the
 * order. The old toast said "order unchanged", which is false and leaves the
 * operator on a stale card. The hook must say so honestly and resubscribe.
 */
const h = vi.hoisted(() => ({
  hookIndex: 0,
  states: [] as any[],
  initialized: [] as boolean[],
  refs: [] as any[],
  effects: [] as Array<{ deps?: any[]; run: () => void; cleanup?: () => void } | undefined>,
  pending: [] as Array<{ idx: number; deps?: any[]; run: () => any; cleanup?: () => void }>,
  memo: [] as Array<{ deps?: any[]; value: any }>,
  dirty: false,
  snapshotSubscriptions: 0,
  snapshot: null as null | { next: (snap: any) => void; error: (err: any) => void },
  renderHook: null as null | (() => void),
  result: null as any,
  toastError: vi.fn(),
  mutateAsync: vi.fn(),
  emptyOrders: [] as any[],
  user: { id: 'kds_staff', role: 'branch_owner', branchIds: ['branch_1', 'branch_2'] } as any,
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
      if (
        prev &&
        deps &&
        prev.deps &&
        deps.length === prev.deps.length &&
        deps.every((dep, i) => Object.is(dep, prev.deps![i]))
      ) {
        return prev.value;
      }
      const value = fn();
      h.memo[idx] = { deps, value };
      return value;
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
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: h.toastError } }));
vi.mock('@/hooks/useOrders', () => ({
  useOrders: () => ({
    orders: h.emptyOrders,
    isLoading: false,
    error: null,
    updateOrderStatus: { mutateAsync: h.mutateAsync },
  }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: Object.assign(() => ({ user: h.user }), {
    getState: () => ({ user: h.user }),
  }),
}));
vi.mock('@/stores/appStore', () => ({
  useAppStore: Object.assign(() => ({ selectedBranchId: 'branch_1' }), {
    getState: () => ({ selectedBranchId: 'branch_1' }),
  }),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  onSnapshot: (_query: unknown, next: (snap: any) => void) => {
    h.snapshotSubscriptions++;
    h.snapshot = { next, error: () => undefined };
    return vi.fn();
  },
}));
vi.mock('@/utils/orderContract', () => ({
  fetchAliasedStoreOrders: vi.fn(async () => []),
  normalizeOrderDoc: (id: string, data: Record<string, any>) => ({ id, ...data }),
  orderDocTimeMs: () => 0,
  createKdsIngestionGate: () => ({ next: () => 1, isCurrent: () => true }),
}));
vi.mock('@/capacitor/haptics', () => ({
  Haptics: { notification: vi.fn(async () => undefined) },
  NotificationType: { Success: 'SUCCESS' },
}));

import { __resetKDSAudioStateForTests } from '../src/utils/kdsAudio';
import {
  isStaleOrderConflict,
  useKDSRealtimeStream,
} from '../src/features/kds/hooks/useKDSRealtimeStream';

const order = (id: string, status: string) => ({
  id,
  branchId: 'branch_1',
  status,
  items: [],
  total: 100,
  createdAt: { toMillis: () => Date.now() },
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

async function emit(orders: any[]) {
  h.snapshot!.next({ docs: orders.map((o) => ({ id: o.id, data: () => o })) });
  await flush();
  settle();
}

describe('useKDSRealtimeStream — stale precondition conflicts (F11)', () => {
  beforeEach(() => {
    h.hookIndex = 0;
    h.states = [];
    h.initialized = [];
    h.refs = [];
    h.effects = [];
    h.pending = [];
    h.memo = [];
    h.dirty = false;
    h.snapshotSubscriptions = 0;
    h.snapshot = null;
    h.result = null;
    h.mutateAsync.mockReset();
    h.toastError.mockReset();
    (globalThis as any).window = {
      localStorage: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setInterval: vi.fn(() => 1),
      clearInterval: vi.fn(),
    };
    (globalThis as any).localStorage = (globalThis as any).window.localStorage;
    __resetKDSAudioStateForTests();
    h.renderHook = () => {
      // eslint-disable-next-line react-hooks/rules-of-hooks -- test harness invokes the hook directly
      h.result = useKDSRealtimeStream();
    };
    settle();
  });

  afterEach(() => {
    __resetKDSAudioStateForTests();
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
  });

  it('detects 409 / conflict / stale rejections only', () => {
    expect(isStaleOrderConflict(Object.assign(new Error('CONFLICT'), { status: 409 }))).toBe(true);
    expect(isStaleOrderConflict(new Error('Server error 409'))).toBe(true);
    expect(isStaleOrderConflict(new Error('stale precondition failed'))).toBe(true);
    expect(isStaleOrderConflict(new Error('Another terminal already moved this order'))).toBe(true);
    expect(isStaleOrderConflict(new Error('permission denied'))).toBe(false);
  });

  it('says another terminal moved the order and refreshes instead of claiming "unchanged"', async () => {
    await emit([order('A', 'pending')]);

    h.mutateAsync.mockRejectedValueOnce(
      Object.assign(new Error('CONFLICT'), { status: 409 }),
    );

    const subscriptionsBefore = h.snapshotSubscriptions;
    await h.result.bumpOrder('A', 'preparing');

    expect(h.toastError).toHaveBeenCalledWith(
      'Another terminal already moved this order — refreshing',
      expect.objectContaining({ description: expect.stringMatching(/not applied/i) }),
    );
    expect(h.toastError).not.toHaveBeenCalledWith(
      'Bump failed — order unchanged',
      expect.anything(),
    );
    // refresh() bumps listenerEpoch → the snapshot listener resubscribes.
    settle();
    expect(h.snapshotSubscriptions).toBeGreaterThan(subscriptionsBefore);
  });
});
