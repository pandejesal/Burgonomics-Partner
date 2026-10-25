import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Hook-level arrival cue: the audio helper's own tests cannot prove the hook
 * wires an acknowledge-latched arrival to exactly one audible cue. This mounts
 * useKDSRealtimeStream under a minimal hook runtime, drives real Firestore
 * snapshot shapes, and uses kdsAudio's own state (`isKDSAlarmRepeating`) plus
 * the Web Audio oscillator calls as the oracle.
 */
const h = vi.hoisted(() => ({
  hookIndex: 0,
  states: [] as any[],
  initialized: [] as boolean[],
  refs: [] as any[],
  effects: [] as Array<{ deps?: any[]; run: () => void; cleanup?: () => void } | undefined>,
  pending: [] as Array<{ idx: number; deps?: any[]; run: () => any; cleanup?: () => void }>,
  dirty: false,
  snapshot: null as null | { next: (snap: any) => void; error: (err: any) => void },
  renderHook: null as null | (() => void),
  user: { id: 'kds_staff', role: 'branch_staff', branchIds: ['branch_1', 'branch_2'] } as any,
  selectedBranchId: 'branch_1',
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
    useMemo: (fn: any) => fn(),
    useMemo: (fn: any) => fn(),
    useEffect: (run: () => any, deps?: any[]) => {
      const idx = h.hookIndex++;
      const prev = h.effects[idx];
      const changed =
        !prev ||
        !deps ||
        !prev.deps ||
        deps.length !== prev.deps.length ||
        deps.some((dep, i) => !Object.is(dep, prev.deps![i]));
      if (changed) {
        h.pending.push({ idx, deps, run, cleanup: prev?.cleanup });
      }
    },
  };
});

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/useOrders', () => ({
  useOrders: () => ({ orders: [], isLoading: false, error: null, updateOrderStatus: undefined }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: Object.assign(() => ({ user: h.user }), {
    getState: () => ({ user: h.user }),
  }),
}));
vi.mock('@/stores/appStore', () => ({
  useAppStore: Object.assign(() => ({ selectedBranchId: h.selectedBranchId }), {
    getState: () => ({ selectedBranchId: h.selectedBranchId }),
  }),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  onSnapshot: (_query: unknown, next: (snap: any) => void, error: (err: any) => void) => {
    h.snapshot = { next, error };
    return vi.fn();
  },
}));
vi.mock('@/utils/orderContract', () => ({
  fetchAliasedStoreOrders: vi.fn(async () => []),
  normalizeOrderDoc: (id: string, data: Record<string, any>) => ({ id, ...data }),
  orderDocTimeMs: () => 0,
  createKdsIngestionGate: () => ({ next: () => 1, isCurrent: () => true }),
}));
vi.mock('@capacitor/haptics', () => ({
  Haptics: { notification: vi.fn(async () => undefined) },
  NotificationType: { Success: 'SUCCESS' },
}));

import {
  __resetKDSAudioStateForTests,
  acknowledgeKDSAlarm,
  isKDSAlarmRepeating,
} from '../src/utils/kdsAudio';
import { useKDSRealtimeStream } from '../src/features/kds/hooks/useKDSRealtimeStream';

const createdOscillators: Array<Record<string, unknown>> = [];

function installAudioMock() {
  const ctx = {
    currentTime: 0,
    state: 'running',
    destination: {},
    resume: vi.fn(async () => undefined),
    createOscillator: () => {
      const oscillator = {
        type: '',
        frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      createdOscillators.push(oscillator);
      return oscillator;
    },
    createGain: () => ({
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }),
  };
  const store = new Map<string, string>();
  (globalThis as any).window = {
    AudioContext: function AudioContextMock() {
      return ctx;
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    localStorage: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  };
  (globalThis as any).localStorage = (globalThis as any).window.localStorage;
}

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

const order = (id: string, status: string, branchId: string = h.selectedBranchId) => ({
  id,
  branchId,
  status,
  items: [],
  total: 100,
  createdAt: { toMillis: () => Date.now() },
});

async function emit(orders: any[]) {
  h.snapshot!.next({ docs: orders.map((o) => ({ id: o.id, data: () => o })) });
  await flush();
  settle();
}

function unmount() {
  for (const effect of h.effects) effect?.cleanup?.();
  h.effects = [];
  h.pending = [];
  h.states = [];
  h.initialized = [];
  h.refs = [];
  h.hookIndex = 0;
}

describe('useKDSRealtimeStream â€” one arrival cue after an acknowledge', () => {
  beforeEach(() => {
    h.hookIndex = 0;
    h.states = [];
    h.initialized = [];
    h.refs = [];
    h.effects = [];
    h.pending = [];
    h.dirty = false;
    h.snapshot = null;
    h.selectedBranchId = 'branch_1';
    h.user = { id: 'kds_staff', role: 'branch_staff', branchIds: ['branch_1', 'branch_2'] };
    createdOscillators.length = 0;
    installAudioMock();
    __resetKDSAudioStateForTests();
    h.renderHook = () => {
      // eslint-disable-next-line react-hooks/rules-of-hooks -- test harness invokes the hook directly
      useKDSRealtimeStream();
    };
    settle();
  });

  afterEach(() => {
    __resetKDSAudioStateForTests();
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
  });

  it('cues C exactly once after acknowledge + Aâ†’preparing, and re-arms the loop', async () => {
    // Initial makeline: A and B pending, primed without a manual cue, then the
    // alarm arms on the next pass.
    await emit([order('A', 'pending'), order('B', 'pending')]);
    settle();
    expect(createdOscillators).toHaveLength(2); // the alarm's own one chime
    expect(isKDSAlarmRepeating()).toBe(true);

    acknowledgeKDSAlarm(2);
    expect(isKDSAlarmRepeating()).toBe(false);
    createdOscillators.length = 0;

    // A is bumped to preparing: pending drops to 1, still under the latch.
    await emit([order('A', 'preparing'), order('B', 'pending')]);
    expect(createdOscillators).toHaveLength(0);
    expect(isKDSAlarmRepeating()).toBe(false);

    // C arrives: pending is back at the acknowledged level, so the alarm stays
    // silent for this snapshot and the arrival cue provides exactly one
    // audible signal.
    await emit([order('A', 'preparing'), order('B', 'pending'), order('C', 'pending')]);
    expect(createdOscillators).toHaveLength(2);
    // F3: the latch is released so C keeps being chased by the 10s loop.
    expect(isKDSAlarmRepeating()).toBe(true);

    // An unchanged snapshot must not cue again; only the loop's own tick sounds.
    createdOscillators.length = 0;
    await emit([order('A', 'preparing'), order('B', 'pending'), order('C', 'pending')]);
    expect(createdOscillators).toHaveLength(0);
    expect(isKDSAlarmRepeating()).toBe(true);
  });

  it('an outlet switch clears the acknowledge latch so the new outlet alarms', async () => {
    await emit([order('A', 'pending'), order('B', 'pending'), order('C', 'pending')]);
    settle();
    expect(createdOscillators).toHaveLength(2);
    expect(isKDSAlarmRepeating()).toBe(true);

    acknowledgeKDSAlarm(3);
    expect(isKDSAlarmRepeating()).toBe(false);
    createdOscillators.length = 0;

    // Switch outlet and deliver its makeline in the same commit, so the latch
    // can only be cleared by the scope boundary â€” not by a transient 0 count.
    h.selectedBranchId = 'branch_2';
    await emit([
      order('D', 'pending', 'branch_2'),
      order('E', 'pending', 'branch_2'),
      order('F', 'pending', 'branch_2'),
    ]);

    expect(createdOscillators).toHaveLength(2);
    expect(isKDSAlarmRepeating()).toBe(true);
  });

  it('a new operator after unmount does not inherit the previous acknowledge', async () => {
    await emit([order('A', 'pending'), order('B', 'pending'), order('C', 'pending')]);
    settle();
    acknowledgeKDSAlarm(3);
    expect(isKDSAlarmRepeating()).toBe(false);
    createdOscillators.length = 0;

    unmount();
    h.user = { id: 'kds_staff_2', role: 'branch_staff', branchIds: ['branch_2'] };
    h.selectedBranchId = 'branch_2';
    settle();

    await emit([order('D', 'pending', 'branch_2'), order('E', 'pending', 'branch_2')]);

    expect(createdOscillators).toHaveLength(2);
    expect(isKDSAlarmRepeating()).toBe(true);
  });
});
