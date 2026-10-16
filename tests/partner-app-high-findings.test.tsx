import React, { isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BranchStats } from '@/hooks/useAnalytics';

const state = vi.hoisted(() => ({
  role: 'brand_owner' as string | null,
  tab: 'overview',
  snapshotState: 'ready',
  loading: false,
  error: true,
  refetch: vi.fn(),
}));

// Node-only render harness: select tabs/statuses without introducing a DOM dependency.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => [
      initial === 'overview' ? state.tab : initial === 'loading' ? state.snapshotState : initial,
      vi.fn(),
    ],
    useEffect: vi.fn(),
  };
});
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: state.role ? { role: state.role, branchIds: [] } : null, signOut: vi.fn() }),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/hooks/useBranches', () => ({ useBranches: () => ({ branches: [], isLoading: false }) }));
vi.mock('@/features/settings', () => ({
  ThermalPrinterSettings: () => null,
  AudioNotificationTester: () => null,
  StoreOperatingToggle: () => null,
}));
vi.mock('@/hooks/useAnalytics', () => ({
  useAnalytics: () => ({ data: undefined, isLoading: state.loading, isError: state.error, refetch: state.refetch }),
}));

import { RoyaltyLedger } from '@/components/analytics/RoyaltyLedger';
import { DevDiagnosticsModal } from '@/components/admin/DevDiagnosticsModal';
import { SettingsPage } from '@/pages/SettingsPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';

function findRetry(node: ReactNode): (() => void) | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const handler = findRetry(child);
      if (handler) return handler;
    }
  }
  if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(node)) return;
  if (node.type === 'button' && node.props.children === 'Retry') return node.props.onClick;
  return findRetry(node.props.children);
}

beforeEach(() => {
  state.role = 'brand_owner';
  state.tab = 'overview';
  state.snapshotState = 'ready';
  state.loading = false;
  state.error = true;
  state.refetch.mockReset();
});

describe('H1: account linkage never proves KYC or settlement', () => {
  it.each([
    ['unlinked', 'pending'],
    ['acc_real', 'pending'],
    ['acc_real', 'verified'],
  ] as const)('renders honest badges for %s / %s', (linkedAccountId, linkedStatus) => {
    const branch: BranchStats = {
      branchId: 'b1', branchName: 'Outlet', city: 'City', orders: 0, revenue: 0,
      brandRoyalty: 0, netBranchPayout: 0, averageOrderValue: 0,
      deliveryOrders: 0, takeawayOrders: 0, dineinOrders: 0, linkedAccountId, linkedStatus,
    };
    const html = renderToStaticMarkup(<RoyaltyLedger branches={[branch]} totalRevenue={0} brandRoyalty={0} netBranchPayout={0} />);
    expect(html).not.toContain('KYC Verified');
    expect(html).not.toContain('Route Settled');
    expect(html).not.toContain('100% Reconciled');
    expect(html).toContain(linkedAccountId === 'unlinked' ? 'Unlinked — no Route split' : linkedStatus === 'pending' ? 'Link pending' : 'Settlement not measured');
    if (linkedAccountId === 'unlinked') expect(html).toContain('0 Outlets Linked');
  });
});

describe('H2: diagnostics are restricted and not a health check', () => {
  it.each(['branch_staff', 'branch_owner', 'support', 'regional_manager', null])('denies entry and direct modal rendering for %s', (role) => {
    state.role = role;
    expect(renderToStaticMarkup(<SettingsPage />)).not.toContain('Dev Diagnostics');
    expect(renderToStaticMarkup(<DevDiagnosticsModal isOpen onClose={() => {}} />)).toBe('');
  });
  it.each(['developer', 'brand_owner'])('allows the canonical %s role', (role) => {
    state.role = role;
    expect(renderToStaticMarkup(<SettingsPage />)).toContain('Dev Diagnostics');
    expect(renderToStaticMarkup(<DevDiagnosticsModal isOpen onClose={() => {}} />)).toContain('Developer Diagnostics Console');
  });
  it('does not infer health from an empty snapshot list', () => {
    state.tab = 'snapshots';
    const html = renderToStaticMarkup(<DevDiagnosticsModal isOpen onClose={() => {}} />);
    expect(html).not.toContain('functioning normally');
    expect(html).toContain('No error snapshots recorded');
    expect(html).toContain('This is not a health check');
  });
  it.each(['loading', 'error'])('distinguishes %s snapshots from an empty result', (status) => {
    state.tab = 'snapshots';
    state.snapshotState = status;
    const html = renderToStaticMarkup(<DevDiagnosticsModal isOpen onClose={() => {}} />);
    expect(html).not.toContain('No error snapshots recorded');
    expect(html).not.toContain('functioning normally');
    expect(html).toContain(status === 'error' ? 'Error snapshots unavailable' : 'Loading error snapshots');
  });
  it.each(['overview', 'gateways'])('does not fabricate health on %s', (tab) => {
    state.tab = tab;
    const html = renderToStaticMarkup(<DevDiagnosticsModal isOpen onClose={() => {}} />);
    expect(html).toContain('Health unknown');
    for (const claim of ['Marketplace Active', 'Operational (', 'Live Quote / Dispatch', '2-Wheeler Dispatch Active', '₹40 for 2km', 'TimingSafe SHA256', 'reverse_all: 1']) {
      expect(html).not.toContain(claim);
    }
  });
});

describe('H3: query failure has a working retry, not an endless spinner', () => {
  it.each([true, false])('shows unavailable state with missing data (isError=%s)', (error) => {
    state.error = error;
    const element = AnalyticsPage();
    const html = renderToStaticMarkup(element);
    expect(html).toContain('Analytics unavailable');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('animate-spin');
    const retry = findRetry(element);
    expect(retry).toBeTypeOf('function');
    retry?.();
    expect(state.refetch).toHaveBeenCalledOnce();
  });
  it('retains the spinner during initial loading', () => {
    state.loading = true;
    expect(renderToStaticMarkup(<AnalyticsPage />)).toContain('animate-spin');
  });
});
