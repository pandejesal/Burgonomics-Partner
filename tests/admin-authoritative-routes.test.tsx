import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ReactNode } from 'react';

/**
 * R22 — admin demo-route repair (R09 PA-01 / PA-02).
 *
 * /admin/menu used to mount a hardcoded 5-item demo and /admin/customers a
 * localStorage-only CRM. Both entry routes now navigate to the authoritative
 * partner console (/menu → Firestore `products` + Petpooja bridge; /customers
 * → Firestore `customers`), and the /admin/customers/:id deep-link fails
 * closed with an honest unavailable page because local CRM ids were never
 * Firestore doc ids.
 *
 * These tests are hermetic and node-env: the route tree's ~40 page modules
 * are stubbed at the import boundary, the wiring is pinned at the source
 * level (repo convention for router structure), and the unavailable page is
 * verified through a real static render.
 */

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: null, loading: false }),
}));
vi.mock('@/admin/layouts/AdminLayout', () => ({
  AdminLayout: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock('@/admin/layouts/PetpoojaOperationsLayout', () => ({
  PetpoojaOperationsLayout: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock('@/admin/layouts/SystemOperationsLayout', () => ({
  SystemOperationsLayout: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock('@/admin/theme/ThemeContext', () => ({
  ThemeProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock('@/admin/pages/AdminDashboardPlaceholder', () => ({
  AdminDashboardPlaceholder: () => null,
}));
vi.mock('@/admin/pages/AdminOrdersPage', () => ({ AdminOrdersPage: () => null }));
vi.mock('@/admin/pages/AdminStoresPage', () => ({ AdminStoresPage: () => null }));
vi.mock('@/pages/DeliveryQueuePage', () => ({ DeliveryQueuePage: () => null }));

import {
  ADMIN_PORTAL_ROLES,
  AdminCustomerRecordUnavailable,
} from '../src/pages/admin/AdminRoutes';
import { canAccessRoute } from '../src/core/auth/routePolicy';

const adminRoutesSrc = readFileSync(
  fileURLToPath(new URL('../src/pages/admin/AdminRoutes.tsx', import.meta.url)),
  'utf8'
);
const appSrc = readFileSync(
  fileURLToPath(new URL('../src/App.tsx', import.meta.url)),
  'utf8'
);

describe('Admin entry routes are authoritative (R22 / PA-01 / PA-02)', () => {
  it('menu entry navigates to console /menu; the demo page is no longer routed or imported', () => {
    expect(adminRoutesSrc).toContain(
      '<Route path="menu" element={<Navigate to="/menu" replace />} />'
    );
    // No import (eager or lazy) and no route element may reference the demo page.
    expect(adminRoutesSrc).not.toMatch(/import[^\n]*AdminMenuPage/);
    expect(adminRoutesSrc).not.toMatch(/element=\{<AdminMenuPage/);
  });

  it('customers entry navigates to console /customers; the local-only CRM is no longer routed or imported', () => {
    expect(adminRoutesSrc).toContain(
      '<Route path="customers" element={<Navigate to="/customers" replace />} />'
    );
    expect(adminRoutesSrc).not.toMatch(/import[^\n]*AdminCustomersPage/);
    expect(adminRoutesSrc).not.toMatch(/import[^\n]*customersData/);
    expect(adminRoutesSrc).not.toMatch(/element=\{<AdminCustomersPage/);
  });

  it('no redirect loop: both targets are console leaf pages registered in App.tsx, never /admin paths', () => {
    // The entry redirects point exactly at the console routes (pinned above),
    // and App.tsx mounts those paths as real pages — not as Navigate elements
    // that could bounce back into /admin/*:
    expect(appSrc).toContain('<Route path="/menu" element={<MenuPage />} />');
    expect(appSrc).toContain('<Route path="/customers" element={<CustomersPage />} />');
    expect(appSrc).toContain('<Route path="/customers/:id" element={<CustomerDetailPage />} />');
    expect(appSrc).not.toMatch(/path="\/menu"[^>]*element=\{<Navigate/);
    expect(appSrc).not.toMatch(/path="\/customers"[^>]*element=\{<Navigate/);
    // Loop guard: an /admin target would re-enter this router and the
    // wildcard `*` → /admin bounce could cycle. Neither target is under /admin.
    for (const target of ['/menu', '/customers']) {
      expect(target.startsWith('/admin')).toBe(false);
    }
  });

  it('customer detail deep-link fails closed: unavailable page, id never forwarded', () => {
    expect(adminRoutesSrc).toContain(
      '<Route path="customers/:id" element={<AdminCustomerRecordUnavailable />} />'
    );
    // Never bridge a local-CRM id to the console profile — that would presume
    // a backend record for a browser-local reference.
    expect(adminRoutesSrc).not.toMatch(/to=\{`\/customers\/\$\{/);
    expect(adminRoutesSrc).not.toMatch(/element=\{<AdminCustomerProfilePage/);
    expect(adminRoutesSrc).not.toMatch(/import[^\n]*AdminCustomerProfilePage/);
  });
});

describe('AdminCustomerRecordUnavailable renders honestly', () => {
  const renderAt = (entry: string) =>
    renderToStaticMarkup(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/admin/customers/:id" element={<AdminCustomerRecordUnavailable />} />
        </Routes>
      </MemoryRouter>
    );

  it('states the local-only limitation and links to the authoritative CRM', () => {
    const html = renderAt('/admin/customers/LEGACY-LOCAL-9');
    expect(html).toContain('Customer profile unavailable from the admin portal');
    expect(html).toContain('were never real customer records');
    expect(html).toContain('no backend record is assumed for it');
    expect(html).toContain('href="/customers"');
  });

  it('never echoes the local id or renders any customer data', () => {
    const html = renderAt('/admin/customers/LEGACY-LOCAL-9');
    expect(html).not.toContain('LEGACY-LOCAL-9');
    // The component takes no data props and renders no record fields.
    expect(html).not.toMatch(/loyalty|phone|email|totalSpent/i);
  });
});

describe('Role boundaries unchanged — no RBAC widening (R22)', () => {
  it('admin portal still admits exactly brand_owner, developer, regional_manager', () => {
    expect([...ADMIN_PORTAL_ROLES]).toEqual(['brand_owner', 'developer', 'regional_manager']);
  });

  it('all three admin-portal roles already had console access to the navigation targets', () => {
    // The redirects reuse existing console reachability under the single
    // source of truth (routePolicy) — no new grant is introduced here.
    for (const role of ['brand_owner', 'developer', 'regional_manager'] as const) {
      expect(canAccessRoute(role, '/menu')).toBe(true);
      expect(canAccessRoute(role, '/customers')).toBe(true);
      expect(canAccessRoute(role, '/customers/any_doc_id')).toBe(true);
    }
  });

  it('non-admin roles remain denied the admin portal (fail-closed, unchanged)', () => {
    for (const role of ['branch_owner', 'branch_staff', 'support'] as const) {
      expect(canAccessRoute(role, '/admin')).toBe(false);
      expect(canAccessRoute(role, '/admin/menu')).toBe(false);
    }
    // customer sessions can never hold a partner-console route.
    expect(canAccessRoute('customer', '/menu')).toBe(false);
    expect(canAccessRoute('customer', '/customers')).toBe(false);
  });

  it('disallowed-role and unauthenticated bounces are preserved in AdminPortalLayout', () => {
    expect(adminRoutesSrc).toContain('<Navigate to="/login" replace />');
    expect(adminRoutesSrc).toContain('<Navigate to="/dashboard" replace />');
  });
});

describe('Other admin routes preserved (R22)', () => {
  it('keeps core ops, payments, refunds, petpooja, system and the wildcard bounce', () => {
    expect(adminRoutesSrc).toContain('<Route index element={<AdminDashboardPlaceholder />} />');
    for (const pin of [
      '<Route path="orders" element={<AdminOrdersPage />} />',
      '<Route path="orders/live" element={<AdminOrdersPage />} />',
      '<Route path="orders/:orderId" element={<AdminOrdersPage />} />',
      '<Route path="stores" element={<AdminStoresPage />} />',
      '<Route path="payments" element={<AdminPaymentsPage />} />',
      '<Route path="payments/:id" element={<AdminPaymentDetailsPage />} />',
      '<Route path="refunds" element={<AdminRefundsPage />} />',
      '<Route path="reconciliation" element={<AdminReconciliationPage />} />',
      '<Route path="petpooja" element={<PetpoojaOperationsLayout />}>',
      '<Route path="system" element={<SystemOperationsLayout />}>',
      'path="delivery-queue"',
      '<Route path="*" element={<Navigate to="/admin" replace />} />',
    ]) {
      expect(adminRoutesSrc).toContain(pin);
    }
  });

  it('keeps the customers sub-routes (static paths rank above the :id fallback)', () => {
    for (const pin of [
      'path="customers/analytics"',
      'path="customers/segments"',
      'path="customers/loyalty"',
      'path="segments"',
    ]) {
      expect(adminRoutesSrc).toContain(pin);
    }
  });
});
