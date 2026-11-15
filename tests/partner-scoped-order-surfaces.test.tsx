// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P2 — canonical branch reads keep working while the privileged legacy alias
 * read fails CLOSED for operators who cannot satisfy `ownsBranch`.
 *
 * The helper under test is the REAL `fetchAliasedStoreOrders`; only the
 * Firestore boundary is faked, and the fake enforces what the deployed rules
 * enforce: without `isAdmin()` (brand_owner/developer) a query whose only
 * predicate is `store.id` is REFUSED, not answered. Every such request a scoped
 * operator sends is therefore a genuine `permission-denied` in production, and
 * it is counted here.
 *
 * Oracle: for a scoped operator the number of `store.id` predicates must be
 * ZERO while the canonical `branchId` rows still arrive. A surface that only
 * "works" because a refusal was swallowed is a silent per-snapshot denial, not
 * a fix, and these tests refuse to accept it.
 *
 * Fixture note (contract §Slice P2.3): the branchless Delivery row is NOT a
 * fixture claiming staff may read it — it is the row staff must NOT receive.
 */

const h = vi.hoisted(() => ({
  user: null as any,
  selectedBranchId: null as string | null,
  docs: [] as Array<{ id: string; data: Record<string, any> }>,
  /** Every `store.id` predicate the code under test asked Firestore for. */
  storeIdWheres: [] as Array<{ field: string; op: string; value: unknown }>,
  /** Every `branchId` predicate, so "canonical read happened" is provable. */
  branchIdWheres: [] as Array<{ field: string; op: string; value: unknown }>,
  listeners: [] as Array<{ field: string; next: (snap: unknown) => void; error: (err: unknown) => void }>,
}));

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/core/config/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => {
  const time = (v: any) => {
    if (v && typeof v.toMillis === 'function') return v.toMillis();
    if (v && typeof v.toDate === 'function') return v.toDate().getTime();
    return Date.parse(String(v));
  };

  const evaluate = (q: any) => {
    const constraints: any[] = q?.constraints ?? [];
    const usesStoreId = constraints.some((c) => c.kind === 'where' && c.field === 'store.id');
    const role = h.user?.role;
    const brandRead = role === 'brand_owner' || role === 'developer';
    if (usesStoreId && !brandRead) {
      // Rules are not filters: this query is refused, not answered.
      throw Object.assign(new Error('Missing or insufficient permissions.'), {
        code: 'permission-denied',
      });
    }
    const ordering = constraints.find((c) => c.kind === 'orderBy');
    const wheres = constraints.filter((c) => c.kind === 'where');
    /** Firestore field paths may be dotted (`store.id`), so resolve them. */
    const valueAtPath = (data: Record<string, any>, path: string): unknown =>
      path.split('.').reduce<unknown>(
        (acc, key) => (acc as Record<string, any> | null | undefined)?.[key],
        data,
      );
    let rows = h.docs.filter((d) =>
      wheres.every((c) => {
        const field = valueAtPath(d.data, String(c.field));
        if (c.op === 'in') return (c.value as unknown[]).includes(field);
        if (c.op === '>=') return time(field) >= time(c.value);
        return field === c.value;
      }),
    );
    if (ordering) {
      rows = rows
        .filter((d) => d.data[ordering.field] !== undefined)
        .sort((a, b) => {
          const delta = time(a.data[ordering.field]) - time(b.data[ordering.field]);
          return ordering.direction === 'desc' ? -delta : delta;
        });
    }
    const cap = constraints.find((c) => c.kind === 'limit')?.value ?? Infinity;
    const docs = rows.slice(0, cap).map((d) => ({ id: d.id, data: () => d.data }));
    return {
      docs,
      empty: docs.length === 0,
      size: docs.length,
      forEach: (fn: (d: { id: string; data: () => Record<string, any> }) => void) => docs.forEach(fn),
    };
  };

  return {
    collection: (_db: unknown, name: string) => ({ name }),
    where: (field: string, op: string, value: unknown) => {
      const predicate = { kind: 'where', field, op, value };
      if (field === 'store.id') h.storeIdWheres.push(predicate);
      if (field === 'branchId') h.branchIdWheres.push(predicate);
      return predicate;
    },
    orderBy: (field: string, direction: string) => ({ kind: 'orderBy', field, direction }),
    limit: (value: number) => ({ kind: 'limit', value }),
    query: (ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }),
    doc: (_db: unknown, name: string, id: string) => ({ name, id }),
    getDoc: async () => ({ exists: () => false, data: () => undefined }),
    getDocs: vi.fn(async (q: any) => evaluate(q)),
    onSnapshot: vi.fn((q: any, next: (snap: unknown) => void, error: (err: unknown) => void) => {
      const ordering = (q?.constraints ?? []).find((c: any) => c.kind === 'orderBy');
      h.listeners.push({ field: ordering?.field ?? 'createdAt', next, error });
      try {
        next(evaluate(q));
      } catch (err) {
        error(err);
      }
      return () => undefined;
    }),
    Timestamp: {
      fromDate: (date: Date) => ({ toMillis: () => date.getTime(), toDate: () => date }),
      fromMillis: (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) }),
      now: () => ({ toMillis: () => Date.now(), toDate: () => new Date() }),
    },
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
/**
 * KDS audio owns a 10s repeat interval and a native haptics import. It is not
 * part of this contract, so it is stubbed here to keep the suite timer-free —
 * the alarm lifecycle has its own suites.
 */
vi.mock('@/utils/kdsAudio', () => ({
  playKDSArrivalCue: vi.fn(),
  stopRepeatingKDSAlarm: vi.fn(),
  resetKDSAlarmState: vi.fn(),
  syncKDSAlarmState: vi.fn(),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: Object.assign(() => ({ user: h.user }), { getState: () => ({ user: h.user }) }),
}));
vi.mock('@/stores/appStore', () => ({
  useAppStore: Object.assign(
    () => ({ selectedCity: null, selectedBranchId: h.selectedBranchId }),
    { getState: () => ({ selectedCity: null, selectedBranchId: h.selectedBranchId }) },
  ),
}));

import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';
import { startOfIstMonth } from '@/utils/analyticsMath';
import { useOrders } from '@/hooks/useOrders';
import { useAnalytics } from '@/hooks/useAnalytics';
import { adminOrdersService } from '@/admin/services/adminOrdersService';

const COMPLETED_ID = 'canonical_completed_branch_order';
const LIVE_ID = 'canonical_live_branch_order';
const LEGACY_ID = 'legacy_branchless_delivery_order';

/**
 * `demo` is the only VERIFIED store↔branch link (storeBranchRegistry), so the
 * alias helper genuinely has a store id to ask for — a scenario with no mapping
 * would pass for the wrong reason.
 */
const scopedBranch = 'demo';

const completedCanonicalRow = {
  id: COMPLETED_ID,
  data: {
    branchId: scopedBranch,
    status: 'delivered',
    paymentMethod: 'cod',
    paymentStatus: 'completed',
    items: [],
    total: 100,
    subtotal: 100,
    orderType: 'takeaway',
    createdAt: { toMillis: () => Date.UTC(2026, 10, 14, 6) },
  },
};

/** Still actionable, so both the KDS and the Control Room board render it. */
const liveCanonicalRow = {
  id: LIVE_ID,
  data: {
    branchId: scopedBranch,
    status: 'pending',
    paymentMethod: 'cod',
    paymentStatus: 'pending',
    items: [],
    total: 100,
    subtotal: 100,
    orderType: 'takeaway',
    createdAt: { toMillis: () => Date.UTC(2026, 10, 14, 8) },
  },
};

/**
 * Analytics buckets by IST month, so its fixtures are anchored to THIS month's
 * start rather than a hardcoded date — a fixed fixture would silently leave the
 * period and turn "one counted sale" into a vacuous assertion.
 */
const analyticsRow = (id: string, offsetMs: number) => ({
  id,
  data: {
    branchId: scopedBranch,
    status: 'delivered',
    paymentMethod: 'cod',
    paymentStatus: 'completed',
    items: [],
    total: 100,
    subtotal: 100,
    orderType: 'takeaway',
    createdAt: {
      toMillis: () => startOfIstMonth(new Date()).getTime() + offsetMs,
      toDate: () => new Date(startOfIstMonth(new Date()).getTime() + offsetMs),
    },
  },
});

/** Delivery-shaped, branchless: reachable only through the privileged read. */
const legacyRow = {
  id: LEGACY_ID,
  data: {
    store: { id: scopedBranch },
    status: { code: 'DELIVERED', kind: 'completed', terminal: true },
    totals: { grandTotal: 250 },
    items: [],
    placedAt: { toMillis: () => Date.UTC(2026, 10, 14, 7) },
  },
};

const capturedStoreIdWheres = () => h.storeIdWheres.slice();
const canonicalReadHappened = () => h.branchIdWheres.some((w) => w.op === 'in');

const actFlagBefore = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');

function restoreActFlag() {
  if (actFlagBefore) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', actFlagBefore);
  else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
}

describe('scoped order surfaces never send the privileged legacy read', () => {
  beforeEach(() => {
    h.storeIdWheres = [];
    h.branchIdWheres = [];
    h.listeners = [];
    h.docs = [liveCanonicalRow, completedCanonicalRow, legacyRow];
    h.selectedBranchId = scopedBranch;
    h.user = { id: 'staff_1', role: 'branch_staff', branchIds: [scopedBranch], cityIds: [] };
  });

  afterAll(() => {
    notifyManager.setNotifyFunction((fn) => fn());
    notifyManager.setScheduler((cb) => setTimeout(cb, 0));
    restoreActFlag();
  });

  describe('useOrders', () => {
    let root: Root | null = null;
    let container: HTMLDivElement;
    let client: QueryClient;
    let latest: ReturnType<typeof useOrders> | null = null;

    function Harness(): React.ReactElement {
      latest = useOrders({ dateRange: 'all' });
      return <div>{latest.orders.length}</div>;
    }

    beforeEach(() => {
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
      notifyManager.setScheduler(queueMicrotask);
      notifyManager.setNotifyFunction((fn) => act(fn));
      latest = null;
      client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
    });

    afterEach(async () => {
      if (root) await act(async () => root!.unmount());
      root = null;
      container?.remove();
      client.clear();
      latest = null;
    });

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
      await act(async () => {
        for (let i = 0; i < 16; i += 1) await Promise.resolve();
      });
    }

    it('a branch-staff board shows its canonical rows and issues ZERO store.id reads', async () => {
      await mount();

      // Boundary first: the forbidden request is the defect, so it must be the
      // reported failure rather than a downstream row diff.
      expect(capturedStoreIdWheres()).toEqual([]);
      expect(canonicalReadHappened()).toBe(true);
      expect(latest!.error).toBeNull();
      expect(latest!.orders.map((o) => o.id).sort()).toEqual([LIVE_ID, COMPLETED_ID].sort());
      // The branchless Delivery row is NOT staff-accessible: exposing it would
      // need a rules change or a server projection, neither belongs here.
      expect(latest!.orders.map((o) => o.id)).not.toContain(LEGACY_ID);
    });

    it('a brand_owner still reads the mapped legacy rows', async () => {
      // A brand reader WITH an outlet selected: the alias read is permitted and
      // still carries exactly the verified mapping.
      h.user = { id: 'owner_1', role: 'brand_owner', branchIds: [], cityIds: [] };
      h.selectedBranchId = scopedBranch;

      await mount();

      expect(capturedStoreIdWheres()).toHaveLength(1);
      expect(capturedStoreIdWheres()[0].value).toEqual([scopedBranch]);
      // The branchless alias row is visible to a brand reader, and normalization
      // resolves its store id to the selected branch.
      expect(latest!.orders.map((o) => o.id)).toContain(LEGACY_ID);
      expect(latest!.error).toBeNull();
    });
  });

  describe('adminOrdersService (Control Room)', () => {
    it('history for an assigned operator returns canonical rows, no legacy read', async () => {
      // A scoped operator must pass its outlet explicitly: `getHistory(null)`
      // short-circuits to an empty page (no brand-wide read), which would make
      // this case assert nothing about the alias boundary.
      const result = await adminOrdersService
        .getHistory(scopedBranch, 100)
        .catch((err: unknown) => err);

      expect(capturedStoreIdWheres()).toEqual([]);
      expect(result).not.toBeInstanceOf(Error);
      expect((result as Array<{ id: string }>).map((o) => o.id)).toEqual([COMPLETED_ID]);
    });

    it('the live board paints its canonical ticket without a forbidden request', async () => {
      const next = vi.fn();
      const error = vi.fn();
      const cleanup = adminOrdersService.listenLiveOrders(scopedBranch, next, error);

      // Settle the async page handler before asserting: the forbidden request
      // must be the reported failure, not a downstream timeout.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(capturedStoreIdWheres()).toEqual([]);

      await vi.waitFor(() => expect(next).toHaveBeenCalled());
      expect(error).not.toHaveBeenCalled();
      expect(next.mock.calls.at(-1)![0].map((o: any) => o.id)).toContain(LIVE_ID);
      cleanup();
    });
  });

  describe('useAnalytics', () => {
    let root: Root | null = null;
    let container: HTMLDivElement;
    let client: QueryClient;
    let captured: any = null;

    function Harness(): React.ReactElement {
      const query = useAnalytics('month') as any;
      captured = query;
      return <div>{query?.data?.totalOrders ?? 0}</div>;
    }

    beforeEach(() => {
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
      notifyManager.setScheduler(queueMicrotask);
      notifyManager.setNotifyFunction((fn) => act(fn));
      captured = null;
      client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    });

    afterEach(async () => {
      if (root) await act(async () => root!.unmount());
      root = null;
      container?.remove();
      client.clear();
    });

    it('a scoped outlet report keeps its rows and never asks for store.id', async () => {
      h.user = { id: 'owner_2', role: 'branch_owner', branchIds: [scopedBranch], cityIds: [] };
      // Anchored to the live IST month: the period filter must genuinely keep
      // this row, otherwise "one counted sale" would be vacuous.
      h.docs = [analyticsRow('analytics_in_period', 60 * 60 * 1000), legacyRow];
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
        for (let i = 0; i < 24; i += 1) await Promise.resolve();
      });

      // Boundary first: the forbidden request is the defect, so it must be the
      // reported failure rather than a downstream symptom (a dropped warning).
      expect(capturedStoreIdWheres()).toEqual([]);
      await vi.waitFor(() => expect(captured?.data).toBeTruthy());
      expect(captured.error ?? null).toBeNull();
      // Only the completed cash order counts as a sale, and it is in range.
      expect(captured.data.totalOrders).toBe(1);
      expect(captured.data.warnings.join(' ')).not.toMatch(/linked delivery stores/i);
    });
  });

  describe('KDS stream', () => {
    it('a scoped snapshot never issues a forbidden legacy read', async () => {
      const { useKDSRealtimeStream } = await import('@/features/kds/hooks/useKDSRealtimeStream');
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
      notifyManager.setScheduler(queueMicrotask);
      notifyManager.setNotifyFunction((fn) => act(fn));

      let latest: ReturnType<typeof useKDSRealtimeStream> | null = null;
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      function Harness(): React.ReactElement {
        latest = useKDSRealtimeStream();
        return <div>{latest.activeOrders.length}</div>;
      }

      await act(async () => {
        root!.render(
          <QueryClientProvider client={client}>
            <Harness />
          </QueryClientProvider>,
        );
      });
      await act(async () => {
        for (let i = 0; i < 24; i += 1) await Promise.resolve();
      });

      // The canonical listener really registered and delivered.
      expect(h.listeners.some((l) => l.field === 'createdAt')).toBe(true);
      expect(capturedStoreIdWheres()).toEqual([]);
      expect(latest!.activeOrders.map((o) => o.id)).toContain(LIVE_ID);
      expect(latest!.streamError ?? null).toBeNull();

      await act(async () => root.unmount());
      client.clear();
      container.remove();
    });
  });
});
