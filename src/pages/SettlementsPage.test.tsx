/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
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
    outstandingPaise: over.netPayablePaise ?? 1080000,
    ledgerSchema: 1,
    complete: true,
    current: true,
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

  it.each([{ outstandingPaise: 0 }, { complete: false }, { current: false }, { ledgerSchema: 0 }])('no payout for %j', (fields) => {
    const html = renderWithClient([statement(fields)]);
    expect(html).not.toContain('Mark as paid');
    expect(html).not.toContain('Record additional payment');
  });

  it('shows a late refund as a signed collection and offers only that delta', () => {
    const html = renderWithClient([statement({ outstandingPaise: -5000 })]);
    expect(html).toContain('-₹50');
    expect(html).toContain('Branch owes brand');
    expect(html).toContain('Mark as paid');
    expect(html).not.toContain('₹10,800');
  });

  it('reports gross, refunds, payable and manual collection separately in the footer', () => {
    const html = renderWithClient([statement(), statement({ id: 'other', branchId: 'other', onlineCollectedPaise: 0, onlineRefundedPaise: 0, onlineNetPaise: 0, outstandingPaise: -600000 })]);
    const footer = html.split('<tfoot')[1].split('</tfoot>')[0];
    expect(footer).toContain('₹13,000');
    expect(footer).toContain('₹200');
    expect(footer).toContain('₹10,800');
    expect(footer).toContain('₹6,000');
    expect(footer).toContain('Owes brand');
  });

  it('names the blocking captures instead of only saying "Blocked"', () => {
    const html = renderWithClient([statement({ complete: false, unresolvedCaptures: 2 })]);
    expect(html).toContain('Blocked');
    expect(html).toContain('2 captures need brand review');
    // A blocked month is never offered for payment.
    expect(html).not.toContain('Mark as paid');
  });

  it('submits only the collection amount actually entered for a part payment', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const click = (text: string) => [...container.querySelectorAll('button')].find(b => b.textContent?.includes(text))?.click();
    const change = (input: HTMLInputElement, value: string) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    env.IS_REACT_ACT_ENVIRONMENT = true;
    try {
      await act(async () => root.render(<QueryClientProvider client={queryClient}><MemoryRouter>
        <SettlementsPage initialStatements={[statement({ outstandingPaise: -200000 })]} initialMonthKey="2026-11" />
      </MemoryRouter></QueryClientProvider>));
      await act(async () => { click('Mark as paid'); });
      const amount = [...container.querySelectorAll('label')].find(l => l.textContent?.includes('Actual amount (₹)'))?.querySelector('input');
      expect(amount).toBeDefined();
      await act(async () => { change(amount!, '321.45'); change(container.querySelector('input[maxlength="120"]')!, 'UTR-PART'); });
      await act(async () => { click('Record payment'); });
      expect(apiMocks.markSettlementPaid).toHaveBeenCalledWith(expect.objectContaining({ reference: 'UTR-PART', settledNetPaise: -32145 }));
    } finally {
      await act(async () => root.unmount());
      env.IS_REACT_ACT_ENVIRONMENT = false;
      container.remove();
      queryClient.clear();
    }
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
