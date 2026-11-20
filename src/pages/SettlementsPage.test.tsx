import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Settlements screen (owner decision 2026-11-20).
 *
 * The owner's rule: one flat ₹2,000 per branch per active month, taken at month
 * end. The screen must show, per branch: online money collected centrally,
 * cash the branch already holds (informational), the one flat fee line and the
 * net payable — including the case where the fee is bigger than the online
 * money and the branch therefore owes the brand.
 */

vi.mock('@/config/firebase', () => ({
  app: {},
  auth: { currentUser: null },
  db: {},
  messaging: null,
  getAppCheckToken: async () => null,
}));

vi.mock('@/core/config/firebase', () => ({
  app: {},
  auth: { currentUser: null },
  db: {},
  messaging: null,
}));

const authState = vi.hoisted(() => ({
  user: { id: 'usr_owner', name: 'Owner', role: 'brand_owner' as const, branchIds: [] as string[], cityIds: [] as string[] },
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => authState,
}));

// The branch list feeds the generate buttons; a real Firestore read would make
// the render network-dependent, so it is stubbed with two branches.
vi.mock('@/hooks/useBranches', () => ({
  useBranches: () => ({
    branches: [
      { id: 'br_surat', name: 'Burgonomics - Surat', city: 'Surat' },
      { id: 'br_ahm', name: 'Burgonomics - Ahmedabad', city: 'Ahmedabad' },
    ],
    isLoading: false,
  }),
}));

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: toastMocks }));

const apiMocks = vi.hoisted(() => ({
  generateSettlementStatement: vi.fn(async () => ({ id: 'br_a_2026-11_v002', version: 2 })),
  listSettlements: vi.fn(async () => ({ monthKey: '2026-11', statements: [] })),
  markSettlementPaid: vi.fn(async () => ({ statement: {}, reused: false })),
  exportSettlementsCsv: vi.fn(async () => ({ text: '"Statement ID"', filename: 'settlements-2026-11.csv' })),
}));

vi.mock('@/services/partnerFunctionsApi', async () => {
  const actual = await vi.importActual<any>('@/services/partnerFunctionsApi');
  return { ...actual, partnerFunctionsApi: { ...actual.partnerFunctionsApi, ...apiMocks } };
});

import { SettlementsPage } from './SettlementsPage';
import type { SettlementStatement } from '@/features/settlements';

function statement(over: Partial<SettlementStatement> = {}): SettlementStatement {
  return {
    id: 'br_surat_2026-11_v001',
    branchId: 'br_surat',
    branchName: 'Burgonomics - Surat',
    monthKey: '2026-11',
    version: 1,
    currency: 'INR',
    onlineCollectedPaise: 1300000,
    onlineRefundedPaise: 20000,
    onlineNetPaise: 1280000,
    onlineOrders: 40,
    cashCollectedPaise: 500000,
    cashOrders: 12,
    cashPendingOrders: 1,
    platformFeePaise: 200000,
    netPayablePaise: 1080000,
    branchOwes: false,
    feeApplicable: true,
    paidStatus: 'unpaid',
    paidAtMs: null,
    paymentReference: null,
    payments: [],
    generatedAtMs: 0,
    ...over,
  };
}

function renderWithClient(statements: SettlementStatement[], role?: string) {
  if (role) authState.user = { ...authState.user, role: role as any };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SettlementsPage initialStatements={statements} initialMonthKey="2026-11" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SettlementsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { ...authState.user, role: 'brand_owner' };
  });

  it('shows the online money, the single fee line and the net payable per branch', () => {
    const html = renderWithClient([statement()]);

    expect(html).toContain('Burgonomics - Surat');
    // Online net ₹12,800, one fee line ₹2,000, net payable ₹10,800.
    expect(html).toContain('₹12,800');
    expect(html).toContain('₹2,000');
    expect(html).toContain('₹10,800');
    expect(html).toContain('Payable to branch');
    // Cash is shown as information and is NOT part of the payable.
    expect(html).toContain('₹5,000');
    expect(html).toContain('Cash');
    expect(html).not.toContain('₹15,800');
  });

  it('shows the branch owing the brand when the fee exceeds the online money', () => {
    const html = renderWithClient([
      statement({
        id: 'br_new_2026-11_v001',
        branchId: 'br_new',
        branchName: 'New outlet',
        onlineCollectedPaise: 0,
        onlineRefundedPaise: 0,
        onlineNetPaise: 0,
        onlineOrders: 0,
        cashCollectedPaise: 0,
        cashOrders: 0,
        netPayablePaise: -200000,
        branchOwes: true,
      }),
    ]);
    expect(html).toContain('New outlet');
    expect(html).toContain('-₹2,000');
    expect(html).toContain('Branch owes brand');
  });

  it('says so when there are no statements, and never fakes a zero', () => {
    const html = renderWithClient([]);
    expect(html).toContain('No settlement statements');
    // No branch totals are invented for an empty month.
    expect(html).not.toContain('All branches');
  });

  it('offers generation and mark-as-paid to a brand role', () => {
    const html = renderWithClient([statement()]);
    expect(html).toContain('Mark as paid');
    expect(html).toContain('Generate');
  });

  it('hides generation and mark-as-paid from a branch owner (read-only view)', () => {
    const html = renderWithClient([statement()], 'branch_owner');
    expect(html).toContain('Burgonomics - Surat');
    expect(html).not.toContain('Mark as paid');
    expect(html).not.toContain('Generate statement');
  });

  it('refuses the screen outright for a support account', () => {
    const html = renderWithClient([statement()], 'support');
    expect(html).toContain('Not available');
    expect(html).not.toContain('Mark as paid');
  });
});
