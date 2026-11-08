import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { UserRole } from '@/types';
import { canAccessRoute } from '@/core/auth/routePolicy';

const session = vi.hoisted(() => ({
  user: null as { role: UserRole; branchIds: string[] } | null,
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => session,
}));

import { QuickActionsBar } from './QuickActionsBar';

function renderShortcuts(role?: UserRole) {
  session.user = role ? { role, branchIds: ['test-branch'] } : null;
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/dashboard']}>
      <QuickActionsBar />
    </MemoryRouter>,
  );
}

describe('QuickActionsBar route permissions', () => {
  beforeEach(() => { session.user = null; });

  it('does not offer a Support Desk link that redirects Branch Staff to KDS', () => {
    const html = renderShortcuts('branch_staff');
    expect(canAccessRoute('branch_staff', '/tickets')).toBe(false);
    expect(html).not.toContain('Customer Support Desk');
    expect(html).not.toContain('href="/tickets"');
    for (const path of ['/orders', '/menu', '/delivery-queue']) {
      expect(html).toContain(`href="${path}"`);
    }
  });

  it.each<UserRole>(['branch_owner', 'brand_owner', 'developer', 'support', 'regional_manager'])(
    'keeps the real Support Desk route for %s',
    (role) => {
      const html = renderShortcuts(role);
      expect(canAccessRoute(role, '/tickets')).toBe(true);
      expect(html).toContain('Customer Support Desk');
      expect(html).toContain('href="/tickets"');
    },
  );

  it('offers no operational shortcuts without a session', () => {
    expect(renderShortcuts()).not.toContain('<a ');
  });

  it('offers no partner shortcuts to a customer role', () => {
    expect(renderShortcuts('customer')).not.toContain('<a ');
  });
});
