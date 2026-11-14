// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * OUTBOX SCOPE — replay ownership.
 *
 * The persisted queue (`kds-pending-bumps:v1`) has no owner stamp, so today a
 * bump queued under branch A replays after the operator moves to branch B. That
 * is a cross-scope CLIENT mutation attempt — all I/O here is faked and no
 * backend permission or rejection is proved. This file pins the contract the
 * future minimal fix must satisfy; the tests must therefore express scope
 * ownership WITHOUT the production code existing yet.
 *
 * Only I/O boundaries are faked (Firestore `onSnapshot`, the bump API, audio,
 * stores). The hook, `readPendingKdsBumps` and `kdsAuthScopeKey` are REAL.
 * Backend permission guards (payments/KOT/stock) are entirely out of scope.
 */
const h = vi.hoisted(() => ({
  listeners: [] as Array<{ field: string; next: (snap: unknown) => void }>,
  // Nullable so the "no signed-in operator" boundary can be exercised; `role`
  // is widened to the app's real union so fixtures can be any real role.
  user: { id: 'staff-a', role: 'branch_staff', branchIds: ['branch_1', 'branch_2'], cityIds: [] } as {
    id: string;
    role: UserRole;
    branchIds: string[];
    cityIds: string[];
  } | null,
  selectedBranchId: 'branch_1' as string | null,
  orders: [] as Record<string, unknown>[],
  /** Bump calls, in order; each resolves/rejects via the next controller. */
  bumpCalls: [] as Array<{ orderId: string; status: string; expectedStatus?: string }>,
  bumpControllers: [] as Array<{ resolve: () => void; reject: (e: unknown) => void }>,
  bumpMode: 'auto' as 'auto' | 'manual' | 'reject',
  /** Per-order failure for automatic replay; anything else resolves. */
  autoRejectOrders: [] as string[],
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn((...parts: unknown[]) => ({ parts })),
  where: vi.fn(() => ({})),
  orderBy: vi.fn((field: string) => ({ field })),
  limit: vi.fn(() => ({})),
  onSnapshot: vi.fn((q: { parts?: Array<{ field?: string }> }, next: (s: unknown) => void) => {
    const field = (q?.parts ?? []).map((p) => p?.field).find(Boolean) ?? 'createdAt';
    h.listeners.push({ field, next });
    return () => undefined;
  }),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('sonner', () => ({
  toast: { success: h.toastSuccess, error: h.toastError, info: vi.fn() },
}));
vi.mock('@/utils/kdsAudio', () => ({
  playKDSArrivalCue: vi.fn(),
  stopRepeatingKDSAlarm: vi.fn(),
  resetKDSAlarmState: vi.fn(),
  syncKDSAlarmState: vi.fn(),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: h.user }),
}));
vi.mock('@/stores/appStore', () => ({
  useAppStore: () => ({ selectedBranchId: h.selectedBranchId }),
}));
vi.mock('@/hooks/useOrders', () => ({
  useOrders: () => ({
    orders: h.orders,
    isLoading: false,
    error: null,
    updateOrderStatus: { mutateAsync: bump },
  }),
}));
// Only the alias network read is stubbed; the rest of orderContract stays real.
vi.mock('@/utils/orderContract', async (original) => ({
  ...(await original<typeof import('@/utils/orderContract')>()),
  fetchAliasedStoreOrders: vi.fn(async () => []),
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  KDS_BUMP_TTL_MS,
  kdsAuthScopeKey,
  useKDSRealtimeStream,
  type PendingKdsBump,
} from '@/features/kds/hooks/useKDSRealtimeStream';
import { isGlobalRole, resolveScopedBranchIds } from '@/utils/branchScope';
import type { UserRole } from '@/types';

const KEY = 'kds-pending-bumps:v1';
const TTL_SAFE = () => Date.now() - 1000;

/** Typed bump boundary: records the call, then resolves or defers. */
function bump(args: { orderId: string; status: string; expectedStatus?: string }): Promise<void> {
  h.bumpCalls.push(args);
  if (h.bumpMode === 'reject') return Promise.reject(new Error('network'));
  if (h.bumpMode === 'auto') {
    // Per-order failure lets a later automatic replay fail without changing the
    // mode that governs the manual controllers this test still needs.
    if (h.autoRejectOrders.includes(args.orderId)) {
      return Promise.reject(new Error('network'));
    }
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    h.bumpControllers.push({ resolve, reject });
  });
}

type Stream = ReturnType<typeof useKDSRealtimeStream>;
let latest: Stream | null = null;

function Harness(): React.ReactElement {
  latest = useKDSRealtimeStream();
  return <div>{latest.streamStatus}</div>;
}

/**
 * Scope key for a synthetic user, derived through the REAL resolver and the
 * REAL `kdsAuthScopeKey` — no policy copy. `resolveScopedBranchIds` narrows a
 * scoped role to the selected branch only when it is actually assigned, so a
 * forged selection cannot manufacture an authorised B scope.
 *
 * `user === null` is the anonymous boundary: the same code path the hook takes,
 * producing `anonymous::no-role::::all`.
 */
function scopeKeyOf(
  user: { id: string; role: UserRole; branchIds: string[] } | null,
  selectedBranchId: string | null,
): string {
  const resolved = resolveScopedBranchIds(
    user ? { role: user.role, branchIds: user.branchIds } : null,
    selectedBranchId,
  );
  return kdsAuthScopeKey({
    userId: user?.id ?? null,
    role: user?.role ?? null,
    resolvedBranchIds: resolved,
    selectedBranchId,
  });
}

/**
 * Runtime narrowing for the ORIGINAL cases, whose fixtures are never null.
 * Throws instead of asserting, so no `!` or cast is needed at the call sites.
 */
function requireUser(): { id: string; role: UserRole; branchIds: string[]; cityIds: string[] } {
  const user = h.user;
  if (!user) throw new Error('fixture user is null in a case that requires one');
  return user;
}

const row = (orderId: string, extra: Record<string, unknown> = {}) => ({
  orderId,
  targetStatus: 'preparing',
  queuedAt: TTL_SAFE(),
  ...extra,
});

function readQueue(): PendingKdsBump[] {
  const raw = window.localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as PendingKdsBump[]) : [];
}

function writeQueue(rows: unknown[]): void {
  // The persisted queue is the external boundary here; a direct write is the
  // only way to simulate a row that appears while a drain is in flight.
  window.localStorage.setItem(KEY, JSON.stringify(rows));
}

describe('useKDSRealtimeStream — outbox replay ownership', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  let client: QueryClient;
  const actFlagBefore = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  const onLineBefore = Object.getOwnPropertyDescriptor(window.navigator, 'onLine');

  function setOnline(value: boolean): void {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => value,
    });
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    h.listeners.length = 0;
    h.user = {
      id: 'staff-a',
      role: 'branch_staff',
      branchIds: ['branch_1', 'branch_2'],
      cityIds: [],
    };
    h.selectedBranchId = 'branch_1';
    h.orders = [];
    h.bumpCalls = [];
    h.bumpControllers = [];
    h.bumpMode = 'auto';
    h.autoRejectOrders = [];
    h.toastError.mockClear();
    h.toastSuccess.mockClear();
    window.localStorage.removeItem(KEY);
    setOnline(true);
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  afterEach(async () => {
    // Settle any fake controller a case left pending, so no deferred promise
    // outlives its test (and no old test body resumes inside a later one).
    await act(async () => {
      for (const controller of h.bumpControllers) {
        controller.resolve();
      }
      h.bumpControllers = [];
      await flush();
    });
    if (root) await act(async () => root!.unmount());
    root = null;
    container?.remove();
    container = null;
    client.clear();
    latest = null;
    window.localStorage.removeItem(KEY);
  });

  afterAll(() => {
    if (actFlagBefore) {
      Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', actFlagBefore);
    } else {
      Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    }
    if (onLineBefore) Object.defineProperty(window.navigator, 'onLine', onLineBefore);
  });

  async function flush(): Promise<void> {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  }

  async function mount(): Promise<void> {
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
    await act(async () => {
      await flush();
    });
  }

  async function rerender(): Promise<void> {
    await act(async () => {
      root!.render(
        <QueryClientProvider client={client}>
          <Harness />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await flush();
    });
  }

  async function deliver(rows: Array<Record<string, unknown>>): Promise<void> {
    // Use the LAST registered createdAt listener: a scope change installs a new
    // generation, and the earlier one is discarded. Emitting into the stale
    // registration would be a false control on a cancelled callback.
    const primaries = h.listeners.filter((l) => l.field === 'createdAt');
    const primary = primaries[primaries.length - 1];
    if (!primary) throw new Error('no createdAt snapshot listener registered');
    // `next` and the flush happen inside ONE act so React batches the update and
    // no update-outside-act warning is produced.
    await act(async () => {
      primary.next({ docs: rows.map((r) => ({ id: r.id, data: () => r })) });
      await flush();
    });
  }

  const boardOrder = (id: string, branchId: string) => ({
    id,
    branchId,
    status: 'pending',
    paymentMethod: 'cod',
    items: [],
    total: 100,
    createdAt: { toMillis: () => 1, toDate: () => new Date(1) },
  });

  /* ---------------------------------------------------------------- case 1 */

  it('OB1: a fresh un-scoped legacy row is retained exactly and never replayed', async () => {
    const legacy = row('A1');
    writeQueue([legacy]);
    // Non-vacuous positive: the queue really holds the row before mount.
    expect(readQueue()).toHaveLength(1);

    await mount();

    // ~(red) today the un-owned row is replayed as if it belonged to this scope.
    expect(h.bumpCalls).toEqual([]);
    // Retained exactly — not dropped, not rewritten.
    expect(readQueue()).toEqual([legacy]);
    expect(h.toastError).toHaveBeenCalled();
  });

  /* ---------------------------------------------------------------- case 2 */

  it('OB2: a fresh row owned by a FOREIGN scope is skipped, retained exactly', async () => {
    const foreignKey = scopeKeyOf(
      { id: 'staff-a', role: 'branch_staff', branchIds: ['branch_2'] },
      'branch_2',
    );
    const foreign = row('B1', { scopeKey: foreignKey });
    writeQueue([foreign]);
    expect(readQueue()).toHaveLength(1);

    await mount();

    // ~(red) the foreign row is sent under the current (branch_1) scope.
    expect(h.bumpCalls).toEqual([]);
    expect(readQueue()).toEqual([foreign]);
  });

  /* ---------------------------------------------------------------- case 3 */

  it('OB3: a row owned by the CURRENT scope replays exactly and is retired only after ack', async () => {
    // Positive premise: the current selection is genuinely authorised.
    expect(resolveScopedBranchIds(requireUser(), h.selectedBranchId)).toEqual(['branch_1']);
    const currentKey = scopeKeyOf(requireUser(), h.selectedBranchId);
    expect(currentKey).toBe(
      kdsAuthScopeKey({
        userId: requireUser().id,
        role: requireUser().role,
        resolvedBranchIds: resolveScopedBranchIds(requireUser(), h.selectedBranchId),
        selectedBranchId: h.selectedBranchId,
      }),
    );
    const owned = row('A1', { scopeKey: currentKey, expectedStatus: 'pending' });
    writeQueue([owned]);

    h.bumpMode = 'manual';
    await mount();

    // Sent with exactly the persisted payload shape — no queue fields leaked.
    expect(h.bumpCalls).toEqual([
      { orderId: 'A1', status: 'preparing', expectedStatus: 'pending' },
    ]);
    // Still queued while the request is unacknowledged.
    expect(readQueue()).toHaveLength(1);

    await act(async () => {
      h.bumpControllers[0].resolve();
      await flush();
    });

    // Retired only after the ack.
    expect(readQueue()).toEqual([]);
  });

  /* ---------------------------------------------------------------- case 4 */

  it('OB4: a row queued while offline in A is not written after switching to B', async () => {
    setOnline(false);
    const currentA = scopeKeyOf(requireUser(), 'branch_1');
    writeQueue([row('A1', { scopeKey: currentA })]);

    await mount();
    expect(h.bumpCalls).toEqual([]);

    // Operator moves to branch 2 and reconnects.
    h.selectedBranchId = 'branch_2';
    await rerender();
    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await flush();
    });

    // ~(red) A's row is replayed under B.
    expect(h.bumpCalls).toEqual([]);
    expect(readQueue()).toHaveLength(1);
  });

  /* ---------------------------------------------------------------- case 5 */

  it('OB5: while A is in flight no second drain starts; B drains once after A settles', async () => {
    // Positive premise: branch_1 and branch_2 are BOTH genuinely assigned, so
    // selecting branch_2 yields a real authorised B scope (not a forged one).
    expect(requireUser().branchIds).toEqual(['branch_1', 'branch_2']);
    expect(resolveScopedBranchIds(requireUser(), 'branch_1')).toEqual(['branch_1']);
    expect(resolveScopedBranchIds(requireUser(), 'branch_2')).toEqual(['branch_2']);

    const aKey = scopeKeyOf(requireUser(), 'branch_1');
    writeQueue([row('A1', { scopeKey: aKey })]);
    h.bumpMode = 'manual';

    await mount();
    expect(h.bumpCalls).toHaveLength(1);

    // Move to B, put an eligible B row in the queue, keep A unacknowledged.
    h.selectedBranchId = 'branch_2';
    expect(resolveScopedBranchIds(requireUser(), h.selectedBranchId)).toEqual(['branch_2']);
    const bKey = scopeKeyOf(requireUser(), 'branch_2');
    expect(bKey).not.toBe(aKey);
    writeQueue([row('A1', { scopeKey: aKey }), row('B1', { scopeKey: bKey })]);
    await rerender();

    // Single-flight: no simultaneous drain while A awaits.
    expect(h.bumpCalls).toHaveLength(1);

    await act(async () => {
      h.bumpControllers[0].resolve();
      await flush();
    });
    await rerender();

    // ~(red) B never drains: the release of `drainingRef` does not reschedule.
    expect(h.bumpCalls).toHaveLength(2);
    expect(h.bumpCalls[1]).toMatchObject({ orderId: 'B1', status: 'preparing' });
  });

  /* ---------------------------------------------------------------- case 6 */

  it('OB6: a row enqueued during a drain survives the old success finalizer', async () => {
    const aKey = scopeKeyOf(requireUser(), 'branch_1');
    writeQueue([row('A1', { scopeKey: aKey })]);
    h.bumpMode = 'manual';

    await mount();
    // Positive: the A1 drain is genuinely in flight (controller 0 pending).
    expect(h.bumpCalls).toHaveLength(1);
    expect(h.bumpCalls[0]).toMatchObject({ orderId: 'A1' });
    expect(h.bumpControllers).toHaveLength(1);

    // The board must show A2 so the real bumpOrder can admit it.
    h.orders = [boardOrder('A2', 'branch_1')];
    await rerender();
    await deliver([boardOrder('A2', 'branch_1')]);

    // Concurrent enqueue through the ACTUAL hook. The promise is CAPTURED, not
    // awaited: the boundary only rejects when this test says so.
    setOnline(false);
    let enqueuePromise: Promise<void> | undefined;
    await act(async () => {
      enqueuePromise = latest!.bumpOrder('A2', 'preparing');
      await flush();
    });

    // Positive: a SECOND call really happened, for A2, with its own controller.
    expect(h.bumpCalls).toHaveLength(2);
    expect(h.bumpCalls[1]).toMatchObject({ orderId: 'A2' });
    expect(h.bumpControllers).toHaveLength(2);

    // Drive the REAL offline-queue path by rejecting the second call.
    await act(async () => {
      h.bumpControllers[1].reject(new Error('network'));
      await enqueuePromise;
      await flush();
    });
    setOnline(true);

    const beforeAck = readQueue();
    // Positive proof the new row is present BEFORE the old drain resolves.
    expect(beforeAck.some((e) => e.orderId === 'A2')).toBe(true);
    // Desired future enqueue ownership: the queued A2 row is scope-stamped.
    // `scopeKey` is not on the production type yet, so inspect the raw fixture
    // structure rather than casting the interface.
    const a2Row = beforeAck.find((e) => e.orderId === 'A2') as unknown as Record<string, unknown>;
    expect('scopeKey' in a2Row).toBe(true);
    expect(a2Row.scopeKey).toBe(aKey);

    // Any LATER automatic replay of A2 must fail, so a preserved row cannot be
    // asserted vacuously by simply being drained away successfully. This does
    // not disturb the still-pending A1 controller 0.
    h.bumpMode = 'auto';
    h.autoRejectOrders = ['A2'];
    const callsBeforeAck = h.bumpCalls.length;

    await act(async () => {
      h.bumpControllers[0].resolve();
      await flush();
    });

    // Bounded: the old drain acknowledged once; no unbounded retry storm.
    expect(h.bumpCalls.length).toBeGreaterThanOrEqual(callsBeforeAck);
    // Meaningful upper bound: at most ONE additional replay attempt (A2, which
    // is configured to fail) and no retry loop beyond it.
    expect(h.bumpCalls.length).toBeLessThanOrEqual(callsBeforeAck + 1);

    // ~(red) the old finalizer writes `remaining`, discarding A2.
    expect(readQueue().some((e) => e.orderId === 'A2')).toBe(true);
  });

  /* ---------------------------------------------------------------- case 7 */

  it('OB7: a newer replacement of the same orderId is not removed by the old ack', async () => {
    const aKey = scopeKeyOf(requireUser(), 'branch_1');
    const original = row('A1', { scopeKey: aKey });
    writeQueue([original]);
    h.bumpMode = 'manual';

    await mount();
    expect(h.bumpCalls).toHaveLength(1);

    // External boundary write: same orderId, newer queuedAt and status.
    const replacement = {
      orderId: 'A1',
      targetStatus: 'ready',
      queuedAt: Date.now() - 500,
      scopeKey: aKey,
    };
    writeQueue([replacement]);

    await act(async () => {
      h.bumpControllers[0].resolve();
      await flush();
    });

    // ~(red) removing by orderId alone deletes the newer entry.
    const queue = readQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].targetStatus).toBe('ready');
    expect(queue[0].queuedAt).toBe(replacement.queuedAt);
  });

  /* ---------------------------------------------------------------- case 8 */

  it('OB8: a failed current-scope replay stays queued and does not retry in a loop', async () => {
    const aKey = scopeKeyOf(requireUser(), 'branch_1');
    writeQueue([row('A1', { scopeKey: aKey })]);
    h.bumpMode = 'manual';

    await mount();
    expect(h.bumpCalls).toHaveLength(1);

    await act(async () => {
      h.bumpControllers[0].reject(new Error('bump rejected'));
      await flush();
    });

    // Remains queued for a later attempt.
    expect(readQueue()).toHaveLength(1);
    // Bounded: microtask flushing must not spin up repeated attempts.
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        await flush();
      });
    }
    expect(h.bumpCalls).toHaveLength(1);
  });

  /* ============================================================ FOLLOW-UPS */

  it('N1: mixed owned and legacy rows drain the owned row and report the legacy one once', async () => {
    const aKey = scopeKeyOf(requireUser(), 'branch_1');
    const legacy = row('L1');
    writeQueue([row('A1', { scopeKey: aKey }), legacy]);
    expect(readQueue()).toHaveLength(2);

    await mount();

    // The owned row drains.
    expect(h.bumpCalls).toEqual([{ orderId: 'A1', status: 'preparing' }]);
    // The legacy row is retained exactly and not replayed.
    expect(readQueue()).toEqual([legacy]);
    // ~(red) today the unowned notice only fires when NOTHING is eligible.
    expect(h.toastError).toHaveBeenCalledTimes(1);
  });

  /**
   * SAME-SCOPE FLAP. A2 is queued before mount alongside A1; the operator
   * toggles offline→online while A1 is in flight, so a second drain trigger
   * arrives and must produce exactly ONE follow-up for A2 — plus the feedback
   * that BOTH acknowledged bumps were applied.
   */
  it('N2: an offline/online flap during a pending ack still acks both queued bumps', async () => {
    const aKey = scopeKeyOf(requireUser(), 'branch_1');
    const a1 = row('A1', { scopeKey: aKey });
    const a2 = row('A2', { scopeKey: aKey });
    writeQueue([a1, a2]);
    h.bumpMode = 'manual';

    await mount();
    // Only the first row goes out; the second waits behind single-flight.
    expect(h.bumpCalls).toHaveLength(1);
    expect(h.bumpCalls[0]).toMatchObject({ orderId: 'A1' });
    expect(h.bumpControllers).toHaveLength(1);

    // Separate acts: the flap must not be coalesced into one state update.
    await act(async () => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
      await flush();
    });
    await act(async () => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
      await flush();
    });

    // No second request while A1 is still awaiting.
    expect(h.bumpCalls).toHaveLength(1);

    await act(async () => {
      h.bumpControllers[0].resolve();
      await flush();
    });

    // Exactly ONE follow-up, for A2 — no conditional here.
    expect(h.bumpCalls).toHaveLength(2);
    expect(h.bumpCalls[1]).toMatchObject({ orderId: 'A2' });
    expect(h.bumpControllers).toHaveLength(2);

    await act(async () => {
      h.bumpControllers[1].resolve();
      await flush();
    });

    // Both retired, A1 sent exactly once.
    expect(readQueue()).toEqual([]);
    expect(h.bumpCalls.filter((call) => call.orderId === 'A1')).toHaveLength(1);

    // ~(red) the follow-up's own-scope feedback is suppressed by `!cancelled`,
    // so the operator is never told both bumps synced. The count is parsed from
    // the description text, not counted as calls.
    const syncedTotals = h.toastSuccess.mock.calls
      .map((call) => /(\d+) offline bump\(s\) synced/.exec(String((call[1] as { description?: string } | undefined)?.description ?? '')))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => Number(match[1]));
    expect(syncedTotals.reduce((sum, value) => sum + value, 0)).toBe(2);
  });

  /**
   * N2b CONTROL — the scope leaves A before A1's ack. Then A's row is retired
   * exactly, A2 is retained and never sent under B, and NO success is claimed.
   */
  it('N2b: a scope change before the ack retires A1 exactly with no success claim', async () => {
    const aKey = scopeKeyOf(requireUser(), 'branch_1');
    const a1 = row('A1', { scopeKey: aKey });
    const a2 = row('A2', { scopeKey: aKey });
    writeQueue([a1, a2]);
    h.bumpMode = 'manual';

    await mount();
    expect(h.bumpCalls).toHaveLength(1);

    // Move to B while A1 is still pending.
    h.selectedBranchId = 'branch_2';
    await rerender();
    await act(async () => {
      await flush();
    });

    // A2 must NOT be sent under B.
    expect(h.bumpCalls.filter((call) => call.orderId === 'A2')).toHaveLength(0);
    // A2 is retained exactly, untouched.
    expect(readQueue()).toContainEqual(a2);

    await act(async () => {
      h.bumpControllers[0].resolve();
      await flush();
    });
    // One extra flush pass: an incorrect follow-up drain for the stale scope
    // would need another render/microtask turn to reach the bump boundary.
    await act(async () => {
      await flush();
    });

    // Exactly ONE request existed for this case, and it was A1's own.
    expect(h.bumpCalls).toHaveLength(1);
    expect(h.bumpCalls.filter((call) => call.orderId === 'A1')).toHaveLength(1);
    expect(h.bumpCalls.filter((call) => call.orderId === 'A2')).toHaveLength(0);
    // No second in-flight request was ever created for A2.
    expect(h.bumpControllers).toHaveLength(1);

    // A1 retired exactly once; A2 still queued.
    const queue = readQueue();
    expect(queue).toContainEqual(a2);
    expect(queue.some((entry) => entry.orderId === 'A1')).toBe(false);
    // No success feedback for work that was not completed for the live scope.
    expect(h.toastSuccess).not.toHaveBeenCalled();
  });

  it.each<{
    label: string;
    user: { id: string; role: UserRole; branchIds: string[]; cityIds: string[] } | null;
    selectedBranchId: string | null;
  }>([
    {
      label: 'anonymous (no signed-in operator)',
      user: null,
      selectedBranchId: null,
    },
    {
      label: 'scoped role with no assigned branches',
      user: { id: 'staff-none', role: 'branch_staff', branchIds: [], cityIds: [] },
      selectedBranchId: null,
    },
  ])('N3: $label performs no I/O for a row keyed to its current scope', async (fixture) => {
    // The TTL constant is imported from the source (not copied): the expired
    // row below must be past the REAL retention window, not a guessed one.
    expect(Number.isFinite(KDS_BUMP_TTL_MS)).toBe(true);
    expect(KDS_BUMP_TTL_MS).toBeGreaterThan(0);

    // The key is computed by the ACTUAL helper for the CURRENT (unauthorised)
    // scope — defence in depth against hand-written/corrupt persisted metadata,
    // not a path reachable through the enqueue code.
    const currentKey = scopeKeyOf(
      fixture.user,
      fixture.selectedBranchId,
    );
    h.user = fixture.user;
    h.selectedBranchId = fixture.selectedBranchId;

    const forged = row('X1', { scopeKey: currentKey });
    const expired = row('X2', {
      scopeKey: currentKey,
      queuedAt: Date.now() - KDS_BUMP_TTL_MS - 60000,
    });
    writeQueue([forged, expired]);
    // Non-vacuous premise: both rows really are on disk before mount.
    expect(readQueue()).toEqual([forged, expired]);

    // Spy the REAL Storage boundary, not a per-instance shim: jsdom's
    // localStorage may bind these methods per object, so the prototype is the
    // reliable seam the hook's `window.localStorage.setItem(...)` calls hit.
    const getSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setSpy = vi.spyOn(Storage.prototype, 'setItem');
    const outboxReads = () => getSpy.mock.calls.filter((call) => call[0] === KEY).length;
    const outboxWrites = () => setSpy.mock.calls.filter((call) => call[0] === KEY).length;

    try {
      // Positive control: the spies really observe an OWN key, then their
      // counts are cleared and the probe key removed so the measurement below
      // cannot be polluted by the control itself.
      const probeKey = 'kds-spy-self-check:v1';
      window.localStorage.setItem(probeKey, 'ok');
      expect(window.localStorage.getItem(probeKey)).toBe('ok');
      expect(setSpy.mock.calls.filter((call) => call[0] === probeKey)).toHaveLength(1);
      expect(getSpy.mock.calls.filter((call) => call[0] === probeKey)).toHaveLength(1);
      window.localStorage.removeItem(probeKey);
      getSpy.mockClear();
      setSpy.mockClear();

      await mount();

      // The admission guard fires BEFORE any storage access: not one outbox
      // read (so nothing was parsed or TTL-pruned) and not one outbox write.
      expect(outboxReads()).toBe(0);
      expect(outboxWrites()).toBe(0);
      // No request was issued, and no feedback was claimed.
      expect(h.bumpCalls).toEqual([]);
      expect(h.toastSuccess).not.toHaveBeenCalled();
      // Specifically no expiry notice: an unauthorised session must not mutate
      // (or report on) a queue it cannot prove ownership of.
      const toastMessages = h.toastError.mock.calls.map((call) => String(call[0]));
      expect(toastMessages.some((message) => /expired/i.test(message))).toBe(false);
    } finally {
      getSpy.mockRestore();
      setSpy.mockRestore();
    }

    // With the boundary spies gone, the persisted queue is proven byte-equal:
    // the forged row was neither replayed nor retired, and the expired row was
    // not pruned by an unauthorised session.
    expect(readQueue()).toEqual([forged, expired]);
  });

  it('N3c: a global owner with an empty scope is still authorised to replay', async () => {
    // `brand_owner` really is a global role (branchScope GLOBAL_ROLES); a
    // SCOPED role with [] means no access and must never be used as a control.
    h.user = { id: 'owner-global', role: 'brand_owner', branchIds: [], cityIds: [] };
    h.selectedBranchId = null;
    expect(isGlobalRole(h.user.role)).toBe(true);
    expect(resolveScopedBranchIds(h.user, null)).toEqual([]);
    const globalKey = scopeKeyOf(h.user, null);
    writeQueue([row('G1', { scopeKey: globalKey })]);

    await mount();

    // Positive control: the guard must not block an authorised all-stores view.
    expect(h.bumpCalls).toHaveLength(1);
    expect(h.bumpCalls[0]).toMatchObject({ orderId: 'G1' });
  });

  it('N4: a deferred trigger plus a failed retry produces exactly one follow-up', async () => {
    const aKey = scopeKeyOf(requireUser(), 'branch_1');
    // Identical A1 object reused in every rewrite: a fresh `row('A1')` would be
    // a NEWER replacement (different queuedAt) that the exact-tuple retirement
    // must keep, which is a different scenario.
    const a1 = row('A1', { scopeKey: aKey });
    writeQueue([a1]);
    h.bumpMode = 'manual';

    await mount();
    expect(h.bumpCalls).toHaveLength(1);

    // A trigger arrives while the first flight is still awaiting.
    h.selectedBranchId = 'branch_2';
    const bKey = scopeKeyOf(requireUser(), 'branch_2');
    const b1 = row('B1', { scopeKey: bKey });
    writeQueue([a1, b1]);
    await rerender();

    // The follow-up row fails, so nothing further should be attempted.
    h.bumpMode = 'auto';
    h.autoRejectOrders = ['B1'];

    await act(async () => {
      h.bumpControllers[0].resolve();
      await flush();
    });
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        await flush();
      });
    }

    const bAttempts = h.bumpCalls.filter((call) => call.orderId === 'B1');
    expect(bAttempts).toHaveLength(1);
    // A1 was acknowledged and retired; the failed B1 is retained EXACTLY.
    const queue = readQueue();
    expect(queue.some((entry) => entry.orderId === 'A1')).toBe(false);
    expect(queue).toEqual([b1]);
  });

  it('N5: an already-issued request is not retracted, and unmount neither retries nor restores the queue', async () => {
    const aKey = scopeKeyOf(requireUser(), 'branch_1');
    writeQueue([row('A1', { scopeKey: aKey })]);
    h.bumpMode = 'manual';

    await mount();
    // Positive: exactly one request was already issued before unmount.
    expect(h.bumpCalls).toHaveLength(1);

    // Clear the queue, then unmount while the request is still pending.
    window.localStorage.removeItem(KEY);
    h.toastError.mockClear();
    h.toastSuccess.mockClear();

    await act(async () => {
      root!.unmount();
    });
    root = null;

    // Resolve after unmount: the ack retires nothing (queue already clear) and
    // must not restore it, retry, or emit ANY feedback.
    await act(async () => {
      h.bumpControllers[0].resolve();
      await flush();
    });

    expect(h.bumpCalls).toHaveLength(1);
    expect(h.toastError).not.toHaveBeenCalled();
    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('N6: A→B→A retires A1 once during the flight and A2 once afterwards', async () => {
    const aKey = scopeKeyOf(requireUser(), 'branch_1');
    // The SAME A1 object must be reused in every rewrite. A fresh `row('A1')`
    // would carry a new queuedAt, i.e. a newer replacement that the exact-tuple
    // retirement is required to KEEP (OB7) — which would make this case invalid.
    const a1 = row('A1', { scopeKey: aKey });
    const a2 = row('A2', { scopeKey: aKey });
    writeQueue([a1]);
    h.bumpMode = 'manual';

    await mount();
    expect(h.bumpCalls).toHaveLength(1);
    expect(h.bumpCalls[0]).toMatchObject({ orderId: 'A1' });

    // Move to B then back to A while A1 is still in flight.
    h.selectedBranchId = 'branch_2';
    await rerender();
    h.selectedBranchId = 'branch_1';
    await rerender();

    // A2 is in the LATEST queue before the old ack lands.
    writeQueue([a1, a2]);
    expect(readQueue()).toContainEqual(a2);

    await act(async () => {
      h.bumpControllers[0].resolve();
      await flush();
    });

    // A1 retired exactly once; A2 still pending before its own ack.
    const afterFirstAck = readQueue();
    expect(afterFirstAck.some((entry) => entry.orderId === 'A1')).toBe(false);
    expect(afterFirstAck).toContainEqual(a2);

    // Exactly two controllers: the original A1 and the A2 follow-up.
    expect(h.bumpControllers).toHaveLength(2);
    expect(h.bumpCalls[1]).toMatchObject({ orderId: 'A2' });

    await act(async () => {
      h.bumpControllers[1].resolve();
      await flush();
    });

    // A2 retired after its own ack, and A1 was never re-sent.
    const afterSecondAck = readQueue();
    expect(afterSecondAck.some((entry) => entry.orderId === 'A2')).toBe(false);
    expect(h.bumpCalls.filter((call) => call.orderId === 'A1')).toHaveLength(1);
  });
});
