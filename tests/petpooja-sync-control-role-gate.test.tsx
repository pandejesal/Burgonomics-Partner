import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Item 7 (api-contract-audit): the Sync Menu / Sync POS controls must not be
 * offered to a role the server refuses (POST /petpooja/syncMenu ->
 * requireRole brand_owner/developer/regional_manager/branch_owner,
 * functions/src/index.ts:573-576).
 *
 * branch_staff is the kitchen: it is the role most likely to press the button
 * and the one guaranteed a 403. The oracle is the injected shared helper —
 * flipping its answer must flip what the operator sees.
 */
const { canSync, role } = vi.hoisted(() => ({
  canSync: vi.fn(),
  role: { current: 'branch_staff' as string },
}));

vi.mock('@/services/petpoojaMenuSyncRoles', async () => {
  const actual = await vi.importActual<typeof import('../src/services/petpoojaMenuSyncRoles')>(
    '../src/services/petpoojaMenuSyncRoles'
  );
  return { ...actual, canSyncPetpoojaMenu: canSync };
});

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { id: 'u1', role: role.current, branchIds: ['branch_surat_01'] } }),
}));

vi.mock('@/components/layout/Header', () => ({ Header: () => null }));

import { PetpoojaStatusBadge } from '../src/components/ui/PetpoojaStatusBadge';

describe('PetpoojaStatusBadge sync control follows the server role gate', () => {
  beforeEach(() => {
    canSync.mockReset();
  });

  it('hides the sync button for a role the server refuses, and says who can', () => {
    canSync.mockReturnValue(false);

    const html = renderToStaticMarkup(<PetpoojaStatusBadge branchId="branch_surat_01" />);

    expect(html).not.toContain('Sync menu &amp; items from Petpooja POS');
    expect(html).not.toContain('title="Sync menu');
    // The control is replaced by honest copy, not a dead button.
    expect(html).toContain('Manager action');
  });

  it('offers the sync button to a role the server accepts', () => {
    canSync.mockReturnValue(true);

    const html = renderToStaticMarkup(<PetpoojaStatusBadge branchId="branch_surat_01" />);

    expect(html).toContain('Sync menu &amp; items from Petpooja POS');
    expect(html).not.toContain('Manager action');
  });
});
