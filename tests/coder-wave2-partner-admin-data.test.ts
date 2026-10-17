/**
 * Wave-2 partner admin data-honesty fixes.
 *
 * One focused test per behavioural finding from
 * audit-results/polish-2026-10-14/sprint-2026-10-16/audit-partner-admin.md:
 * M1, M2, M3, M4, M5, M6, M7, M8, M9, M15, M16, L1.
 *
 * Each test fails against the pre-fix source and passes after the fix.
 * Node environment (vitest.config.ts: environment 'node'), so component
 * findings are exercised through the pure helpers the components now use.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Toast capture (sonner is mocked, so nothing renders) ────────────────────
const toasts = vi.hoisted(() => ({
  success: [] as string[],
  error: [] as string[],
  info: [] as string[],
}));
vi.mock('sonner', () => ({
  toast: {
    success: (m: string) => {
      toasts.success.push(m);
    },
    error: (m: string) => {
      toasts.error.push(m);
    },
    info: (m: string) => {
      toasts.info.push(m);
    },
    loading: () => undefined,
    warning: () => undefined,
    dismiss: () => undefined,
  },
}));

// ── Firebase / auth doubles ────────────────────────────────────────────────
const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  denied: false,
  allowed: null as Set<string> | null,
}));

vi.mock('@/core/config/firebase', () => ({ db: {} }));
// Some admin pages reach the other firebase entrypoint via
// services/partnerFunctionsApi; stub it so no real initializeApp runs.
vi.mock('@/config/firebase', () => ({ app: {}, auth: {}, db: {}, messaging: null }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: { getState: () => ({ user: { role: 'brand_owner' } }) },
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  collectionGroup: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(async () => undefined),
  getDoc: vi.fn(async () => ({ exists: () => false })),
  Timestamp: class {},
  getDocs: vi.fn(async () => {
    if (state.denied) throw new Error('permission-denied');
    return {
      size: state.rows.length,
      forEach: (cb: (doc: { id: string; data: () => Record<string, unknown> }) => void) =>
        state.rows.forEach((row, index) => cb({ id: `d${index}`, data: () => row })),
    };
  }),
}));

import { DashboardService } from '../src/admin/dashboard/services/dashboardService';
import { buildStoreOptions, copyTextWithFeedback } from '../src/admin/pages/AdminOrdersPage';
import { marketingStorage } from '../src/admin/pages/marketingData';
import {
  ANALYTICS_SOURCE_LABEL,
  describeDirectorySourceState,
  resolveDirectorySourceState,
} from '../src/admin/pages/AdminCustomerAnalyticsPage';
import {
  DISCREPANCY_LIST_MESSAGES,
  computeCoherencePct,
  mapDiscrepancyType,
  mapServerDiscrepancy,
  resolveDiscrepancyListView,
} from '../src/admin/pages/AdminReconciliationPage';
import { runHealthRefresh } from '../src/admin/pages/petpooja/PetpoojaHealthPage';
import { loadStoreStatuses } from '../src/admin/pages/petpooja/PetpoojaStoresPage';
import { validatePartnerFinancials } from '../src/admin/pages/AdminSettingsPage';

const dateRange = { from: '2026-10-01', to: '2026-10-31' };

class TestDashboard extends DashboardService {
  protected async fetchOrders() {
    return state.rows;
  }
  protected async fetchPayments() {
    return [];
  }
  protected async fetchRefunds() {
    return [];
  }
  protected async scopedOrderIds() {
    return state.allowed;
  }
  async getLiveCounts() {
    return {
      ordersLast24h: 0,
      ordersActive: 0,
      paymentsCapturedLast24h: 0,
      refundsPendingCount: 0,
      petpoojaWebhooksPending: 0,
      paymentWebhooksPending: 0,
      realtimeSessionsActive: 0,
      storesActive: 0,
    };
  }
}
const service = new TestDashboard();

beforeEach(() => {
  state.rows = [];
  state.denied = false;
  state.allowed = null;
  toasts.success.length = 0;
  toasts.error.length = 0;
  toasts.info.length = 0;
});

describe('M1 — a missing status is Unknown, never fabricated as Completed', () => {
  it('labels a status-less order Unknown and leaves recognised statuses alone', async () => {
    state.rows = [
      { createdAt: '2026-10-15', totalAmount: 10 }, // no supported status field anywhere
      { status: { code: 'COMPLETED' }, createdAt: '2026-10-15', totalAmount: 10 },
      { status: 'Preparing', createdAt: '2026-10-15', totalAmount: 10 },
    ];

    const { statusBreakdown } = await service.getDashboardSnapshot(dateRange);

    expect(statusBreakdown).toEqual(expect.arrayContaining([{ status: 'Unknown', count: 1 }]));
    expect(statusBreakdown.some((s) => s.status === 'Completed')).toBe(false);
    expect(statusBreakdown).toEqual(expect.arrayContaining([{ status: 'Preparing', count: 1 }]));
  });
});

describe('M2 — payment discrepancies are not all duplicates', () => {
  it('requires a recognised, unresolved, in-window second capture with real identities', async () => {
    const nowIso = new Date().toISOString();
    const staleIso = new Date(Date.now() - 90 * 60 * 1000).toISOString();
    state.rows = [
      {
        orderId: 'dup',
        reason: 'SECOND_CAPTURE_MISMATCH',
        status: 'needs_review',
        razorpayPaymentId: 'pay_second',
        recordedPaymentId: 'pay_first',
        createdAt: nowIso,
      },
      { orderId: 'amount', reason: 'AMOUNT_MISMATCH', status: 'needs_review', razorpayPaymentId: 'pay_a', createdAt: nowIso },
      { orderId: 'uncaptured', reason: 'PAYMENT_NOT_CAPTURED', status: 'needs_review', razorpayPaymentId: 'pay_b', createdAt: nowIso },
      {
        orderId: 'resolved',
        reason: 'SECOND_CAPTURE_MISMATCH',
        status: 'resolved',
        razorpayPaymentId: 'pay_c',
        recordedPaymentId: 'pay_d',
        createdAt: nowIso,
      },
      {
        orderId: 'stale',
        reason: 'SECOND_CAPTURE_MISMATCH',
        status: 'needs_review',
        razorpayPaymentId: 'pay_e',
        recordedPaymentId: 'pay_f',
        createdAt: staleIso,
      },
    ];

    expect(await service.getDuplicatePayments(60)).toEqual([{ orderId: 'dup', count: 2 }]);

    // No identities recorded => no count is manufactured, no duplicate claimed.
    state.rows = [
      { orderId: 'noid', reason: 'SECOND_CAPTURE_MISMATCH', status: 'needs_review', createdAt: nowIso },
    ];
    expect(await service.getDuplicatePayments(60)).toEqual([]);
  });
});

describe('M3 — undated orders belong to no reporting interval', () => {
  it('excludes invalid timestamps from window totals and reports them separately', async () => {
    state.rows = [
      { status: 'COMPLETED', createdAt: '2026-10-15', totalAmount: 100 },
      { status: 'COMPLETED', totalAmount: 100 }, // undated
    ];

    const inWindow = await service.getDashboardSnapshot({ from: '2026-10-01', to: '2026-10-31' });
    const otherWindow = await service.getDashboardSnapshot({ from: '2026-11-01', to: '2026-11-30' });

    expect(inWindow.revenue.orderCount).toBe(1);
    expect(inWindow.revenue.totalRevenuePaise).toBe(10000);
    expect(inWindow.undatedOrderCount).toBe(1);

    expect(otherWindow.revenue.orderCount).toBe(0);
    expect(otherWindow.revenue.totalRevenuePaise).toBe(0);
    expect(otherWindow.undatedOrderCount).toBe(1);
  });
});

describe('M4 — store filter options come from the authorized directory', () => {
  it('lists directory outlets and live-order outlets instead of hardcoded ids', () => {
    const options = buildStoreOptions(
      [{ id: 'st_live_new', name: 'Live New Outlet' }],
      [{ store: { id: 'st_order_only', name: 'Order Only Outlet' } }],
    );

    expect(options.map((o) => o.id)).toEqual(['st_live_new', 'st_order_only']);
    expect(options.map((o) => o.name)).toEqual(['Live New Outlet', 'Order Only Outlet']);
    // The old bundled ids are gone.
    expect(options.some((o) => o.id === 'st_cp_delhi')).toBe(false);
  });
});

describe('M5 — clipboard writes are awaited and reported honestly', () => {
  it('announces success only after the write resolves and errors on rejection', async () => {
    let resolveWrite!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolveWrite = resolve;
    });

    const copy = copyTextWithFeedback('ticket text', () => pending);
    expect(toasts.success).toEqual([]); // nothing announced before resolution

    resolveWrite();
    expect(await copy).toBe(true);
    expect(toasts.success).toHaveLength(1);

    expect(await copyTextWithFeedback('ticket text', () => Promise.reject(new Error('denied')))).toBe(
      false,
    );
    expect(toasts.error).toHaveLength(1);

    // Default writer: no navigator in this environment => honest failure.
    expect(await copyTextWithFeedback('ticket text')).toBe(false);
    expect(toasts.error).toHaveLength(2);
  });
});

describe('M6 — local offer drafts never claim activation', () => {
  it('forces a created offer to Inactive and says it is local-only', () => {
    const offer = marketingStorage.createOffer({
      name: 'Wave2 Saver',
      description: '',
      type: 'Flat Discount',
      status: 'Active',
      validFrom: '2026-10-01',
      validTo: '2026-10-31',
    });

    expect(offer.status).toBe('Inactive');
    expect(toasts.info.some((m) => /local|not active at checkout/i.test(m))).toBe(true);
    expect(toasts.success.some((m) => /activated/i.test(m))).toBe(false);
  });
});

describe('M7 — analytics identify a local directory, not the live CRM', () => {
  it('labels the source honestly and separates unavailable from measured-empty', () => {
    expect(ANALYTICS_SOURCE_LABEL).toMatch(/local/i);
    expect(ANALYTICS_SOURCE_LABEL).toMatch(/not connected to the live CRM/i);
    expect(ANALYTICS_SOURCE_LABEL).not.toMatch(/real CRM/i);

    expect(resolveDirectorySourceState(false)).toBe('unavailable');
    expect(resolveDirectorySourceState(true)).toBe('local');

    const unavailable = describeDirectorySourceState('unavailable', 0);
    expect(unavailable).toMatch(/unavailable/i);
    expect(unavailable).not.toMatch(/0 records/i);

    expect(describeDirectorySourceState('local', 0)).toMatch(/not the live CRM/i);
    expect(describeDirectorySourceState('local', 0)).not.toMatch(/real CRM/i);
  });
});

describe('M8 — bounded list states never assert ledger coherence', () => {
  it('distinguishes loading, error, filtered-empty and queue-empty', () => {
    expect(
      resolveDiscrepancyListView({ isLoading: true, hasError: false, total: 0, filteredCount: 0 }),
    ).toBe('loading');
    expect(
      resolveDiscrepancyListView({ isLoading: false, hasError: true, total: 5, filteredCount: 5 }),
    ).toBe('error');
    expect(
      resolveDiscrepancyListView({ isLoading: false, hasError: false, total: 3, filteredCount: 0 }),
    ).toBe('filtered-empty');
    expect(
      resolveDiscrepancyListView({ isLoading: false, hasError: false, total: 0, filteredCount: 0 }),
    ).toBe('queue-empty');
    expect(
      resolveDiscrepancyListView({ isLoading: false, hasError: false, total: 3, filteredCount: 2 }),
    ).toBe('list');

    // A verified 100% score only ever comes from a measured, non-empty queue.
    expect(computeCoherencePct({ isLoading: true, hasError: false, total: 4, resolvedCount: 4 })).toBeNull();
    expect(computeCoherencePct({ isLoading: false, hasError: true, total: 4, resolvedCount: 4 })).toBeNull();
    expect(computeCoherencePct({ isLoading: false, hasError: false, total: 0, resolvedCount: 0 })).toBeNull();
    expect(computeCoherencePct({ isLoading: false, hasError: false, total: 4, resolvedCount: 3 })).toBe(75);

    for (const message of Object.values(DISCREPANCY_LIST_MESSAGES)) {
      expect(message).not.toMatch(/fully coherent/i);
      expect(message).not.toMatch(/ledger is coherent/i);
    }
  });
});

describe('M9 — a second capture is a duplicate, not a failed capture', () => {
  it('maps known reasons exactly before the generic substring branches', () => {
    expect(mapDiscrepancyType('SECOND_CAPTURE_MISMATCH')).toBe('DUPLICATE_PAYMENT');
    expect(mapDiscrepancyType('PAYMENT_NOT_CAPTURED')).toBe('FAILED_CAPTURE');
    expect(mapDiscrepancyType('AMOUNT_MISMATCH')).toBe('AMOUNT_MISMATCH');
    expect(mapDiscrepancyType('SOMETHING_NEW')).toBe('VERIFICATION_FAILURE');
    expect(
      mapServerDiscrepancy('d1', { reason: 'SECOND_CAPTURE_MISMATCH', status: 'needs_review' }).type,
    ).toBe('DUPLICATE_PAYMENT');
  });
});

describe('M15 — the health refresh reports the actual outcome', () => {
  it('never announces success before the request resolves', async () => {
    const notices: string[] = [];
    let resolveHealth!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolveHealth = resolve;
    });

    const call = runHealthRefresh(() => pending, {
      success: (m) => notices.push(`ok:${m}`),
      error: (m) => notices.push(`err:${m}`),
    });
    expect(notices).toEqual([]); // no success before the request settles

    resolveHealth();
    expect(await call).toBe(true);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatch(/^ok:/);

    expect(
      await runHealthRefresh(() => Promise.reject(new Error('gateway disabled')), {
        success: (m) => notices.push(`ok:${m}`),
        error: (m) => notices.push(`err:${m}`),
      }),
    ).toBe(false);
    expect(notices[notices.length - 1]).toMatch(/^err:/);
  });
});

describe('M16 — per-store status reads settle independently', () => {
  it('keeps measured stores and reports each failing store', async () => {
    const measured = { storeId: 's1', menuVersion: 'v3' } as never;

    const { states, errors } = await loadStoreStatuses(['s1', 's2', 's3'], (storeId) => {
      if (storeId === 's2') return Promise.reject(new Error('gateway offline'));
      if (storeId === 's3') throw new Error('proxy threw synchronously');
      return Promise.resolve(measured);
    });

    expect(states.s1).toBe(measured);
    expect(errors.s2).toBe('gateway offline');
    expect(errors.s3).toBe('proxy threw synchronously');
    expect(states.s2).toBeUndefined();
    expect(states.s3).toBeUndefined();
  });
});

describe('L1 — negative financial configuration is rejected', () => {
  it('rejects negative/non-finite amounts and accepts zero and valid values', () => {
    expect(validatePartnerFinancials({ gstRate: -1, deliveryFee: 40, minOrder: 150 })).toMatch(/nonnegative/i);
    expect(validatePartnerFinancials({ gstRate: 5, deliveryFee: -1, minOrder: 150 })).toMatch(/nonnegative/i);
    expect(validatePartnerFinancials({ gstRate: 5, deliveryFee: 40, minOrder: -5 })).toMatch(/nonnegative/i);
    expect(validatePartnerFinancials({ gstRate: NaN, deliveryFee: 40, minOrder: 150 })).toMatch(/nonnegative/i);

    expect(validatePartnerFinancials({ gstRate: 0, deliveryFee: 0, minOrder: 0 })).toBeNull();
    expect(validatePartnerFinancials({ gstRate: 5, deliveryFee: 40, minOrder: 150 })).toBeNull();
  });
});
