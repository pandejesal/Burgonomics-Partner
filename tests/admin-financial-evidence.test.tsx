import React, { type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ role: undefined as string | undefined, rows: [] as Record<string, unknown>[], hook: 0, resolve: vi.fn(async () => ({ id: 'dis1' })), reconciliation: { reconciliationStatus: 'unavailable', discrepancies: [] as { paymentId: string; reason: string }[] } }));
vi.mock('react', async (original) => {
  const actual = await original<typeof React>();
  return { ...actual, useState: (initial: unknown) => [state.hook++ === 0 ? state.rows : typeof initial === 'function' ? initial() : initial, vi.fn()], useEffect: vi.fn(), useMemo: (fn: () => unknown) => fn() };
});
vi.mock('@/admin/hooks/useAdmin', () => ({ useAdmin: () => ({ role: state.role }) }));
vi.mock('@/admin/pages/paymentsData', () => ({ paymentStorage: { getDuplicates: () => [] } }));
vi.mock('@/admin/services/adminPaymentsService', () => ({ adminPaymentsService: {} }));
vi.mock('@/services/partnerFunctionsApi', () => ({ partnerFunctionsApi: { resolveDiscrepancy: state.resolve } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/admin/components/Utilities', () => ({ ConfirmDialog: () => null }));
vi.mock('@/admin/dashboard/hooks/useDashboardData', () => ({
  useDuplicatePayments: () => ({ data: [] }), useRecentRefunds: () => ({ data: [] }), usePaymentReconciliation: () => ({ data: state.reconciliation }),
}));
import { AdminReconciliationPage } from '../src/admin/pages/AdminReconciliationPage';
import { AdminRefundsPage } from '../src/admin/pages/AdminRefundsPage';
import { PaymentOverview } from '../src/admin/dashboard/components/widgets/PaymentOverview';

function findButton(node: ReactNode, label: string): ReactElement<{ onClick: () => Promise<void>; disabled?: boolean }> | undefined {
  if (!React.isValidElement<{ children?: ReactNode }>(node)) return;
  if (node.type === 'button' && node.props.children === label) return node as ReactElement<{ onClick: () => Promise<void>; disabled?: boolean }>;
  for (const child of React.Children.toArray(node.props.children)) {
    const found = findButton(child, label);
    if (found) return found;
  }
}
beforeEach(() => { state.hook = 0; state.rows = []; state.resolve.mockClear(); });
describe('H3 canonical reconciliation action gate', () => {
  it.each(['brand_owner', 'developer', 'regional_manager', undefined, 'unknown'])('gates Force Settle for %s', async (role) => {
    state.role = role;
    state.rows = [{ id: 'dis1', orderId: 'order1', paymentId: 'pay1', type: 'AMOUNT_MISMATCH', status: 'UNRESOLVED', reason: 'Mismatch', internalAmountPaise: 100, gatewayAmountPaise: 200 }];
    const button = findButton(AdminReconciliationPage({}), 'Force Settle');
    expect(button).toBeDefined();
    const authorized = role === 'brand_owner' || role === 'developer';
    await button!.props.onClick();
    expect(state.resolve).toHaveBeenCalledTimes(authorized ? 1 : 0);
    expect(button!.props.disabled).toBe(!authorized);
  });
});
describe('H4 failure diagnostics use evidence', () => {
  it.each(['insufficient_merchant_balance', 'network_error', 'failed', ''])('renders recorded status %s without inventing a cause', (gatewayStatus) => {
    state.rows = [{ id: 'refund1', orderId: 'order1', paymentId: 'pay1', status: 'FAILED', gatewayStatus, amountPaise: 100, customerName: 'Customer', storeName: 'Outlet', processedBy: 'Operator', reason: 'Request', createdAt: '2026-10-15' }];
    const html = renderToStaticMarkup(<MemoryRouter>{AdminRefundsPage({})}</MemoryRouter>);
    expect(html).toContain(gatewayStatus || 'Failure reason unavailable');
    expect(html.includes('refill')).toBe(gatewayStatus === 'insufficient_merchant_balance');
    if (gatewayStatus !== 'insufficient_merchant_balance') expect(html).not.toContain('insufficient_merchant_balance');
  });
});
describe('H2 reconciliation presentation', () => {
  it.each(['unavailable', 'clear', 'needs_review'])('shows honest %s queue status', (status) => {
    state.reconciliation = { reconciliationStatus: status, discrepancies: status === 'needs_review' ? [{ paymentId: 'pay1', reason: 'AMOUNT_MISMATCH' }] : [] };
    const html = renderToStaticMarkup(<PaymentOverview dateRange={{ from: '2026-10-01', to: '2026-10-31' }} />);
    expect(html).not.toContain('ledger green');
    expect(html).not.toContain('All payment logs balance');
    expect(html).toContain(status === 'unavailable' ? 'Reconciliation unavailable' : status === 'clear' ? 'No open discrepancies' : 'AMOUNT_MISMATCH');
  });
});
