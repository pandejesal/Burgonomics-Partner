/**
 * Franchise leads are brand-level PII: the canonical firestore.rules allow read
 * only to `isBrandOwner()` (brand_owner / developer). /branches still admits
 * support and regional_manager, so the tab + pipeline must be hidden there —
 * otherwise they click a tab that can only ever render an empty/denied list.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'brand_owner' as string }));
const franchise = vi.hoisted(() => ({
  value: {
    leads: [] as any[],
    isLoading: false,
    error: null as unknown,
    updateLeadStatus: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
  },
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { role: auth.role, branchIds: [] } }),
}));
vi.mock('@/hooks/useBranches', () => ({
  useBranches: () => ({
    branches: [],
    isLoading: false,
    createBranch: {},
    broadcastLaunchAlert: {},
    activateStore: {},
    updateBranchSettings: {},
    toggleBranchStatus: {},
  }),
}));
vi.mock('@/features/branches/components/BranchConfigModal', () => ({
  BranchConfigModal: () => null,
}));
vi.mock('@/components/stores/BranchSettingsModal', () => ({ BranchSettingsModal: () => null }));
vi.mock('@/components/stores/LaunchBroadcastModal', () => ({ LaunchBroadcastModal: () => null }));
vi.mock('@/hooks/useFranchiseLeads', () => ({ useFranchiseLeads: () => franchise.value }));

import { BranchesPage } from '../src/pages/BranchesPage';
import { FranchiseLeadsPipeline } from '@/components/stores/FranchiseLeadsPipeline';

beforeEach(() => {
  auth.role = 'brand_owner';
  franchise.value = {
    leads: [],
    isLoading: false,
    error: null,
    updateLeadStatus: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
  };
});

describe('franchise leads are visible only to roles that can read them', () => {
  it('brand_owner keeps the franchise tab', () => {
    expect(renderToStaticMarkup(<BranchesPage />)).toContain('Franchise Leads (CRM)');
  });

  it('developer keeps the franchise tab', () => {
    auth.role = 'developer';
    expect(renderToStaticMarkup(<BranchesPage />)).toContain('Franchise Leads (CRM)');
  });

  it.each(['support', 'regional_manager'])('%s does not get the franchise tab', (role) => {
    auth.role = role;
    expect(renderToStaticMarkup(<BranchesPage />)).not.toContain('Franchise Leads');
  });
});

describe('an allowed role seeing a read error gets an honest error, never an empty list', () => {
  it('renders the failure instead of the empty-pipeline message', () => {
    franchise.value.error = new Error('Missing or insufficient permissions.');
    const html = renderToStaticMarkup(<FranchiseLeadsPipeline onConvertToBranch={vi.fn()} />);

    expect(html).toContain('Could not load franchise inquiries');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('No franchise inquiries in this filter');
  });

  it('renders the empty-pipeline message when the read actually succeeded', () => {
    const html = renderToStaticMarkup(<FranchiseLeadsPipeline onConvertToBranch={vi.fn()} />);
    expect(html).not.toContain('Could not load franchise inquiries');
    expect(html).toContain('No franchise inquiries in this filter');
  });
});
