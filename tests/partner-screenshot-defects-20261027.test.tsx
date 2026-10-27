import React from 'react';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

/**
 * Partner screenshot-defect lane (2026-10-27).
 *
 * These are the tight, source-level RED tests for the device screenshots:
 * one System shell, safe staff normalization, safe payment rows, a theme-aware
 * delivery heading, and modal safe-area sizing. They intentionally do not
 * touch Firebase/network paths; the hermetic guard in tests/hermeticNetworkGuard
 * stays installed globally.
 */

const firestoreSnapshot = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  app: {},
  auth: { currentUser: null },
  db: {},
  messaging: null,
}));

vi.mock('@/core/config/firebase', () => ({
  app: {},
  auth: { currentUser: null },
  db: {},
  messaging: null,
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  getDocs: vi.fn(async () => ({ docs: [], empty: true, forEach: () => {} })),
  onSnapshot: firestoreSnapshot.onSnapshot,
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(async () => undefined),
  updateDoc: vi.fn(async () => undefined),
  Timestamp: {
    now: () => ({ toMillis: () => Date.now() }),
    fromMillis: (ms: number) => ({ toMillis: () => ms }),
  },
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 'usr_test', name: 'Test Operator', role: 'brand_owner', branchIds: ['branch_surat_01'] },
    loading: false,
  }),
}));

vi.mock('@/stores/appStore', () => ({
  useAppStore: () => ({ selectedBranchId: 'branch_surat_01' }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

const deliveryMocks = vi.hoisted(() => ({
  usePorterLogistics: () => ({
    deliveryOrders: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    quotes: {},
    loadingQuotes: false,
    dispatchingOrderIds: new Set<string>(),
    rebookingOrderIds: new Set<string>(),
    fareConfirms: {},
    manualLanes: {},
    pastingOrderIds: new Set<string>(),
    fetchOrderQuote: vi.fn(),
    dispatchPorter: vi.fn(),
    confirmFareDispatch: vi.fn(),
    dismissFareConfirm: vi.fn(),
    savePorterManual: vi.fn(),
    assignInHouseRider: vi.fn(),
    cancelPorter: vi.fn(),
    rebookPorter: vi.fn(),
  }),
}));

vi.mock('@/features/delivery', () => ({
  PorterDispatchCard: () => null,
  RiderAssignmentModal: () => null,
  deriveDeliveryFeedState: () => 'ready',
  usePorterLogistics: deliveryMocks.usePorterLogistics,
}));

import { normalizeTeamUserDoc } from '@/hooks/useUsers';
import {
  adminPaymentsService,
  normalizeTransactionSnapshotDoc,
} from '@/admin/services/adminPaymentsService';
import { DeliveryQueuePage } from '@/pages/DeliveryQueuePage';
import { ManualOrderCreateModal } from '@/features/orders/components/ManualOrderCreateModal';
import { RaiseTicketModal } from '@/components/tickets/RaiseTicketModal';

describe('System diagnostics — one layout shell', () => {
  it('AdminSystemPage is content-only because the /admin/system route owns the shell', () => {
    const page = readFileSync(
      new URL('../src/admin/pages/AdminSystemPage.tsx', import.meta.url),
      'utf8',
    );
    const routes = readFileSync(
      new URL('../src/pages/admin/AdminRoutes.tsx', import.meta.url),
      'utf8',
    );

    expect(page).not.toMatch(/import\s*\{[^}]*SystemOperationsLayout/);
    expect(page).not.toMatch(/<SystemOperationsLayout[\s>]/);
    // The route must still mount the single shell that renders the tab Outlet.
    expect(routes.match(/<SystemOperationsLayout\s*\/>/g) ?? []).toHaveLength(1);
  });
});

describe('Team & Staff — raw Firestore rows cannot crash the roster', () => {
  it('normalizes null/numeric strings, malformed arrays, and unknown roles without inventing a role', () => {
    const user = normalizeTeamUserDoc('usr_malformed', {
      name: null,
      email: 42,
      phone: null,
      role: 7,
      branchIds: 'branch_surat_01',
      cityIds: [null, 'Surat', 7],
      active: 'yes',
      pinSet: 0,
    });

    expect(user.name).toBe('');
    expect(user.email).toBe('42');
    expect(user.phone).toBe('');
    expect(user.role).toBe('');
    expect(user.branchIds).toEqual([]);
    expect(user.cityIds).toEqual(['Surat']);
    expect(user.active).toBe(true);
    expect(user.pinSet).toBe(false);
  });

  it('turns a Firestore Timestamp lastActiveAt into safe display text', () => {
    const user = normalizeTeamUserDoc('usr_timestamp', {
      name: 'Timestamp Staff',
      email: 'timestamp@example.com',
      role: 'branch_staff',
      lastActiveAt: { seconds: 1793088000, nanoseconds: 0 },
    });

    expect(user.lastActiveAt).toBe('2026-10-27T08:00:00.000Z');
    expect(typeof user.lastActiveAt).toBe('string');
  });

  it('preserves a real unknown role string for the generic badge instead of granting a known role', () => {
    const user = normalizeTeamUserDoc('usr_unknown_role', {
      name: 'Mystery Staff',
      email: 'mystery@example.com',
      role: 'mystery_role',
    });

    expect(user.role).toBe('mystery_role');
    expect(() => `${user.name} ${user.email}`.toLowerCase()).not.toThrow();
  });
});

describe('Admin payments — raw snapshot rows are normalized or dropped', () => {
  it('normalizes a minimal live payment document, including the document id and timestamp', () => {
    const normalized = normalizeTransactionSnapshotDoc({
      id: 'pay_live_1',
      data: () => ({
        orderId: 'BUR-8201',
        amountPaise: 42000,
        status: 'captured',
        gateway: 'Razorpay UPI',
        gatewayPaymentId: 'pay_gw_1',
        customer: { name: 'Aarav Mehta', phone: '+91 98765 43210', email: 'aarav@example.com' },
        store: { id: 'str_001', name: 'Burgonomics Navrangpura' },
        createdAt: { toDate: () => new Date('2026-10-27T10:00:00.000Z') },
        refunds: [],
      }),
    });

    expect(normalized).not.toBeNull();
    expect(normalized).toMatchObject({
      id: 'pay_live_1',
      orderId: 'BUR-8201',
      amountPaise: 42000,
      status: 'CAPTURED',
      createdAt: '2026-10-27T10:00:00.000Z',
      gateway: 'Razorpay UPI',
      gatewayPaymentId: 'pay_gw_1',
      verificationStatus: 'UNVERIFIED',
    });
    expect(normalized?.customer.name).toBe('Aarav Mehta');
    expect(normalized?.store.name).toBe('Burgonomics Navrangpura');
  });

  it('keeps a valid payment row with missing customer/store labels truthful', () => {
    const normalized = normalizeTransactionSnapshotDoc({
      id: 'pay_sparse_1',
      data: () => ({
        amountPaise: 12900,
        status: 'PENDING',
      }),
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.customer).toMatchObject({
      name: 'Unknown customer',
      phone: '',
      email: '',
    });
    expect(normalized?.store).toMatchObject({
      id: '',
      name: 'Unknown store',
    });
    expect(normalized?.createdAt).toBe('Unknown');
    expect(normalized?.refunds).toEqual([]);
  });

  it('drops rows without a derivable amount or recognized status instead of rendering fake money', () => {
    expect(
      normalizeTransactionSnapshotDoc({
        id: 'pay_no_amount',
        data: () => ({ status: 'CAPTURED', orderId: 'BUR-1' }),
      }),
    ).toBeNull();

    expect(
      normalizeTransactionSnapshotDoc({
        id: 'pay_bad_status',
        data: () => ({ amountPaise: 1000, status: 'SOMETHING_NEW', orderId: 'BUR-2' }),
      }),
    ).toBeNull();
  });

  it('isolates a throwing document and keeps every valid live row', () => {
    let snapshotCallback: ((snap: any) => void) | undefined;
    firestoreSnapshot.onSnapshot.mockImplementation(
      (_query: unknown, next: (snap: any) => void) => {
        snapshotCallback = next;
        return () => {};
      },
    );

    const received: unknown[][] = [];
    adminPaymentsService.listenLiveTransactions(
      (rows) => received.push(rows),
      () => {},
      50,
    );

    expect(snapshotCallback).toBeTypeOf('function');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    snapshotCallback!({
      forEach: (iterate: (doc: any) => void) => {
        iterate({
          id: 'pay_explosive',
          data: () => {
            throw new Error('corrupt payment payload');
          },
        });
        iterate({
          id: 'pay_bad',
          data: () => ({ amountPaise: 'not-paise', status: 'CAPTURED' }),
        });
        iterate({
          id: 'pay_ok',
          data: () => ({
            orderId: 'BUR-9001',
            amountPaise: 5000,
            status: 'CAPTURED',
            createdAt: '2026-10-27 10:00:00',
          }),
        });
      },
    });
    errorSpy.mockRestore();

    expect(received).toHaveLength(1);
    expect(received[0]).toHaveLength(1);
    expect((received[0][0] as { id: string }).id).toBe('pay_ok');
  });
});

describe('Delivery Queue heading — dark-native page and admin canvas', () => {
  it('keeps a white heading for the dark partner console and wraps the admin mount', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <DeliveryQueuePage />
      </MemoryRouter>,
    );
    const adminRoutes = readFileSync(
      new URL('../src/pages/admin/AdminRoutes.tsx', import.meta.url),
      'utf8',
    );

    expect(html).toMatch(/<h1[^>]*class="[^"]*text-white[^"]*"/);
    expect(html).not.toContain('text-gray-900');
    expect(adminRoutes).toContain('bg-[#0a0f0c] p-4 text-gray-200');
  });
});

describe('Partner modals — top/bottom safe insets with a scrollable body', () => {
  it('ManualOrderCreateModal clears the status bar and gesture area without double inset', () => {
    const html = renderToStaticMarkup(
      <ManualOrderCreateModal isOpen onClose={() => {}} />,
    );

    expect(html.match(/safe-area-inset-top/g) ?? []).toHaveLength(1);
    expect(html.match(/safe-area-inset-bottom/g) ?? []).toHaveLength(1);
    expect(html).toContain('max-h-full');
    expect(html).toContain('overflow-y-auto');
  });

  it('RaiseTicketModal clears the status bar and keeps the form scrollable', () => {
    const html = renderToStaticMarkup(
      <RaiseTicketModal
        isOpen
        onClose={() => {}}
        onSubmit={async () => {}}
        defaultBranchId="branch_surat_01"
        defaultBranchName="Surat Adajan"
      />,
    );

    expect(html.match(/safe-area-inset-top/g) ?? []).toHaveLength(1);
    expect(html.match(/safe-area-inset-bottom/g) ?? []).toHaveLength(1);
    expect(html).toContain('max-h-full');
    expect(html).toContain('min-h-0');
    expect(html).toContain('overflow-y-auto');
  });
});
