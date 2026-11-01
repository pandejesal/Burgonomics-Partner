/**
 * Rules: branch_announcements create admits brand_owner/developer/support or a
 * branch member via ownsBranch. regional_manager matches no arm, so the
 * Broadcast action must be hidden for that role instead of failing with a raw
 * permission error.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'brand_owner' as string }));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { role: auth.role, branchIds: ['branch_1'] } }),
}));
vi.mock('@/hooks/useBranches', () => ({
  useBranches: () => ({
    branches: [
      {
        id: 'branch_1',
        name: 'Surat Adajan',
        city: 'Surat',
        address: 'Adajan',
        phone: '+91 90000 00000',
        active: false,
        status: 'coming_soon',
        coordinates: { lat: 21.19, lng: 72.79 },
      },
    ],
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
vi.mock('@/components/stores/FranchiseLeadsPipeline', () => ({ FranchiseLeadsPipeline: () => null }));

import { BranchesPage } from '../src/pages/BranchesPage';

const render = () =>
  renderToStaticMarkup(
    <MemoryRouter>
      <BranchesPage />
    </MemoryRouter>
  );

beforeEach(() => {
  auth.role = 'brand_owner';
});

describe('branch announcement action by role', () => {
  it.each(['brand_owner', 'developer', 'support'])('shows Broadcast for %s', (role) => {
    auth.role = role;
    expect(render()).toContain('Broadcast');
  });

  it('hides Broadcast for regional_manager (no rules arm)', () => {
    auth.role = 'regional_manager';
    expect(render()).not.toContain('Broadcast');
  });
});
