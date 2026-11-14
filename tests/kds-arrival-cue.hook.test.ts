import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { KDSOrderCard } from '../src/features/kds/components/KDSOrderCard';
import { KDSNewOrderAlert } from '../src/features/kds/components/KDSNewOrderAlert';

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
  memo: [] as Array<{ deps?: any[]; value: any } | undefined>,
  effects: [] as Array<{ deps?: any[]; run: () => void; cleanup?: () => void } | undefined>,
  pending: [] as Array<{ idx: number; deps?: any[]; run: () => any; cleanup?: () => void }>,
  dirty: false,
  snapshot: null as null | { next: (snap: any) => void; error: (err: any) => void },
  renderHook: null as null | (() => void),
  result: null as any,
  bump: vi.fn(async () => undefined),
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
    // Dependency-aware memo slots, indexed like every other hook slot.
    // The previous duplicate `useMemo: (fn) => fn()` keys never cached anything,
    // so a stable-deps memo in the hook produced a NEW value every render. That
    // tore down the stream effect per render and invalidated in-flight async
    // snapshots — a harness defect that masqueraded as an audio regression.
    useMemo: (fn: any, deps?: any[]) => {
      const idx = h.hookIndex++;
      const prev = h.memo[idx];
      const changed =
        !prev ||
        !deps ||
        !prev.deps ||
        prev.deps.length !== deps.length ||
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
  useOrders: () => ({ orders: [], isLoading: false, error: null, updateOrderStatus: { mutateAsync: h.bump } }),
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
vi.mock('@/utils/orderContract', async (original) => ({
  ...(await original<typeof import('@/utils/orderContract')>()),
  fetchAliasedStoreOrders: vi.fn(async () => []),
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
  paymentMethod: 'cod',
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
  h.memo = [];
  h.hookIndex = 0;
}

describe('useKDSRealtimeStream — one arrival cue after an acknowledge', () => {
  beforeEach(() => {
    h.hookIndex = 0;
    h.states = [];
    h.initialized = [];
    h.refs = [];
    h.memo = [];
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
      h.result = useKDSRealtimeStream();
    };
    settle();
  });

  afterEach(() => {
    __resetKDSAudioStateForTests();
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
  });

  it('cues C exactly once after acknowledge + A→preparing, and re-arms the loop', async () => {
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

  it('does not re-announce a still-pending ticket after the seen-set passes its cap', async () => {
    // Regression: the hook ran a BLIND FIFO eviction (first 100 ids in insertion
    // order) *before* the pending-aware helper. Once the dedupe set passed 500,
    // that blind delete removed tickets that were STILL pending, and the very
    // next snapshot treated the old ticket as brand new — re-announcing it and
    // re-chiming. The pure helper test could not see this: the hook never used
    // the helper's guarantee because it had already destroyed the id.
    //
    // Drive it through real snapshot emissions only. Each batch is a normal
    // production-sized payload (1 long-lived ticket + 9 new, previous batch
    // bumped to preparing), so the active list never exceeds the 100-doc query
    // limit while the SEEN set accumulates across batches: 1 + 9 × 60 = 541.
    await emit([order('LONG_PENDING', 'pending')]);
    settle();
    // The mount pass primes with an empty list, so this first ticket is a
    // genuine arrival. Acknowledge it and start from a clean cue count.
    expect(h.result.newOrderIds).toEqual(['LONG_PENDING']);
    createdOscillators.length = 0;

    let previous: string[] = [];
    const reannouncedAt: number[] = [];
    for (let batch = 0; batch < 60; batch += 1) {
      const fresh = Array.from({ length: 9 }, (_, index) => `B${batch}_${index}`);
      const cuesBefore = createdOscillators.length;
      await emit([
        order('LONG_PENDING', 'pending'),
        ...previous.map((id) => order(id, 'preparing')),
        ...fresh.map((id) => order(id, 'pending')),
      ]);
      // The regression signal: an old, continuously-pending ticket announced
      // again after the seen-set overflowed its cap.
      if (h.result.newOrderIds.includes('LONG_PENDING')) {
        reannouncedAt.push(batch);
      }
      // It must also not re-chime beyond the 9 genuinely-new arrivals.
      if (createdOscillators.length - cuesBefore > 10) {
        reannouncedAt.push(-batch - 1);
      }
      previous = fresh;
    }

    // The long-lived ticket was pending through every single batch, so it must
    // never have been re-announced or re-chimed.
    expect(reannouncedAt).toEqual([]);

    // Settle the last batch to preparing. That batch WAS a real arrival, so its
    // banner is legitimately still showing; the operator dismisses it.
    await emit([
      order('LONG_PENDING', 'pending'),
      ...previous.map((id) => order(id, 'preparing')),
    ]);
    h.result.dismissNewOrderAlert();
    settle();

    // Now re-deliver the identical state. Nothing has arrived, so nothing may be
    // announced and no cue may sound — the long-pending ticket in particular
    // must not be treated as new merely because the seen-set overflowed.
    createdOscillators.length = 0;
    await emit([
      order('LONG_PENDING', 'pending'),
      ...previous.map((id) => order(id, 'preparing')),
    ]);

    expect(h.result.pendingOrders.map((o: any) => o.id)).toContain('LONG_PENDING');
    expect(h.result.newOrderIds).not.toContain('LONG_PENDING');
    expect(h.result.newOrderTotal).toBe(0);
    expect(createdOscillators).toHaveLength(0);
  });

  it('hides unpaid customer orders and alerts exactly once when capture arrives', async () => {
    h.bump.mockClear();
    const unpaid = { ...order('ord_1793526177472_uiI9kl', 'pending'), paymentMethod: undefined,
      payment: { method: 'razorpay', status: 'pending' }, status: { code: 'PLACED', kind: 'upcoming', terminal: false } };
    await emit([]);
    createdOscillators.length = 0;
    await emit([unpaid]);
    expect(h.result.activeOrders).toHaveLength(0);
    expect(h.result.newOrderTotal).toBe(0);
    expect(createdOscillators).toHaveLength(0);
    const renderBoard = () => renderToStaticMarkup(createElement('div', null,
      createElement(KDSNewOrderAlert, { orderIds: h.result.newOrderIds, totalCount: h.result.newOrderTotal, onDismiss: () => {} }),
      ...h.result.pendingOrders.map((o: any) => createElement(KDSOrderCard, { key: o.id, order: o, checkedItems: {}, onToggleItemCheck: () => {}, onBumpOrder: () => {} }))));
    expect(renderBoard()).not.toContain('New order received');
    expect(renderBoard()).not.toContain('Accept');
    await h.result.bumpOrder(unpaid.id, 'preparing');
    expect(h.bump).not.toHaveBeenCalled();
    await emit([{ ...unpaid, paymentChannel: 'razorpay' }]);
    expect(h.result.pendingOrders.map((o: any) => o.id)).toEqual([unpaid.id]);
    expect(h.result.newOrderIds).toEqual([unpaid.id]);
    expect(renderBoard()).toContain('New order received');
    expect(renderBoard()).toContain('Accept');
    expect(createdOscillators).toHaveLength(2);
    createdOscillators.length = 0;
    await emit([{ ...unpaid, paymentChannel: 'razorpay' }]);
    expect(createdOscillators).toHaveLength(0);
  });

  it('keeps COD and walk-in tickets visible without a gateway marker', async () => {
    await emit([{ ...order('cash', 'pending'), paymentMethod: 'cod' },
      { ...order('walkin', 'pending'), customerId: 'cust_walkin', paymentMethod: 'upi' }]);
    expect(h.result.pendingOrders.map((o: any) => o.id)).toEqual(['cash', 'walkin']);
  });

  it('an outlet switch clears the acknowledge latch so the new outlet alarms', async () => {
    await emit([order('A', 'pending'), order('B', 'pending'), order('C', 'pending')]);
    settle();
    expect(createdOscillators).toHaveLength(2);
    expect(isKDSAlarmRepeating()).toBe(true);

    acknowledgeKDSAlarm(3);
    expect(isKDSAlarmRepeating()).toBe(false);
    createdOscillators.length = 0;

    // Capture branch 1's own live listener BEFORE the switch. After the new
    // scope commits, this callback belongs to a superseded generation.
    const branch1Listener = h.snapshot!;

    // Actually commit the new scope. A query is scoped by branchId, so branch 1's
    // listener can never deliver branch 2 documents: the previous version of this
    // test emitted D/E/F into the OLD listener before any rerender and only
    // passed by bypassing the scope fence. Settle first so branch 2's listener
    // exists, and only then deliver.
    h.selectedBranchId = 'branch_2';
    settle();

    // A late payload from the superseded branch 1 listener is scope-inert: it
    // may not add rows and may not cue.
    branch1Listener.next({
      docs: [order('A_LATE', 'pending')].map((o) => ({ id: o.id, data: () => o })),
    });
    await flush();
    settle();
    expect(createdOscillators).toHaveLength(0);
    expect(h.result.activeOrders.map((o: any) => o.id)).not.toContain('A_LATE');

    // Branch 2's current snapshot: 3 new pending tickets → 2 oscillators (the
    // alarm's own chime pair) and the loop re-armed.
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
