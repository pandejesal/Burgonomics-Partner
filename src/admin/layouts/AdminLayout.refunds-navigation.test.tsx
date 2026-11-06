/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminLayout } from './AdminLayout';

const session = vi.hoisted(() => ({ role: 'brand_owner' as string | null, signOut: vi.fn() }));

// Keep useAdmin's real role-to-permission mapping. Only its auth boundary is fake;
// this component test never signs in or imports a live Firebase connection.
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: session.role === null ? null : {
      id: 'unit-operator', name: 'Unit Operator', email: 'operator@example.invalid',
      role: session.role, branchIds: ['unit-branch'],
    },
    firebaseUser: null, loading: false, signOut: session.signOut,
  }),
}));
vi.mock('../theme/ThemeContext', () => ({ useAdminTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));
vi.mock('../components/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('../components/Utilities', () => ({ AdminAvatar: () => null }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: Root;

function layout() {
  return (
    <MemoryRouter initialEntries={['/admin/orders']}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="orders" element={<h2>Orders route</h2>} />
          {/* Route marker only: navigation must not invoke a refund-page action. */}
          <Route path="refunds" element={<h2>Refunds route</h2>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}
beforeEach(() => {
  session.role = 'brand_owner'; session.signOut.mockClear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

async function render(role: string | null) {
  session.role = role;
  await act(async () => root.render(layout()));
}
async function openMenu() {
  const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="Open Admin Menu"]');
  expect(trigger).not.toBeNull();
  await act(async () => trigger!.click());
}
function refundsLinks() {
  return [...host.querySelectorAll<HTMLAnchorElement>('a[href="/admin/refunds"]')];
}

describe('authorized Refunds navigation uses the same desktop and drawer permission gate', () => {
  for (const role of ['brand_owner', 'developer']) {
    it(`${role} can reach the existing Refunds route through the desktop sidebar`, async () => {
      await render(role);
      const link = host.querySelector<HTMLAnchorElement>('aside a[href="/admin/refunds"]');
      expect(link).not.toBeNull();
      expect(link!.textContent?.trim()).toBe('Refunds');
      await act(async () => link!.click());
      expect(host.querySelector('main h2')?.textContent).toBe('Refunds route');
      expect(session.signOut).not.toHaveBeenCalled();
    });
    it(`${role} can reach Refunds through the opened mobile drawer and closes that drawer`, async () => {
      await render(role); await openMenu();
      const drawerLink = refundsLinks().find(link => !link.closest('aside'));
      expect(drawerLink).toBeDefined();
      expect(drawerLink!.textContent?.trim()).toBe('Refunds');
      await act(async () => drawerLink!.click());
      expect(host.querySelector('main h2')?.textContent).toBe('Refunds route');
      expect(host.querySelector('button[aria-label="Open Admin Menu"]')).not.toBeNull();
      expect(session.signOut).not.toHaveBeenCalled();
    });
  }
  it.each(['regional_manager', 'branch_owner', 'branch_staff', 'support', 'customer', 'admin', 'unknown', null])(
    'offers no Refunds link in either menu for %s', async role => {
      await render(role);
      expect(refundsLinks()).toHaveLength(0);
      await openMenu();
      expect(refundsLinks()).toHaveLength(0);
      expect(host.querySelector('main h2')?.textContent).toBe('Orders route');
      expect(session.signOut).not.toHaveBeenCalled();
    },
  );
  it('removes both links if an authorized session becomes a regional manager while the drawer is open', async () => {
    await render('brand_owner'); await openMenu();
    expect(refundsLinks()).toHaveLength(2);
    await render('regional_manager');
    expect(refundsLinks()).toHaveLength(0);
    expect(host.querySelector('main h2')?.textContent).toBe('Orders route');
  });
});
