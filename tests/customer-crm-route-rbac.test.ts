/**
 * PAR-03 — the route policy must not admit a role Firestore denies.
 *
 * firestore.rules: `match /customers/{customerId} { allow read: if
 * isUser(customerId) || isAdmin(); }` and isAdmin() is brand_owner/developer
 * only. useCustomers() reads the whole collection, so any other role reaching
 * /customers only ever gets a permission-denied page. The policy (single
 * source of truth for ProtectedRoute AND the sidebar) said otherwise.
 */
import { describe, it, expect, vi } from 'vitest';

// navItems is static; the auth store (and through it the Firebase config) is
// only needed by the useNavigation hook itself.
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ user: null }) }));

import { canAccessRoute, rolesForRoute } from '../src/core/auth/routePolicy';
import { navItems } from '../src/hooks/useNavigation';
import type { UserRole } from '../src/types';

describe('PAR-03 — customer CRM route matches the Firestore read gate', () => {
  it('denies /customers to roles firestore.rules denies (branch_owner, support, regional_manager)', () => {
    for (const role of ['branch_owner', 'support', 'regional_manager'] as UserRole[]) {
      expect(canAccessRoute(role, '/customers'), role).toBe(false);
      expect(canAccessRoute(role, '/customers/cust_1'), role).toBe(false);
    }
  });

  it('keeps /customers for the brand-admin roles the rules admit', () => {
    for (const role of ['brand_owner', 'developer'] as UserRole[]) {
      expect(canAccessRoute(role, '/customers'), role).toBe(true);
      expect(canAccessRoute(role, '/customers/cust_1'), role).toBe(true);
    }
  });

  it('never offers the CRM in navigation to a role the guard denies', () => {
    const crm = navItems.find((item) => item.path === '/customers');
    expect(crm).toBeDefined();
    expect(rolesForRoute('/customers')).toEqual(['brand_owner', 'developer']);
    expect(crm?.roles).toEqual(['brand_owner', 'developer']);
  });
});
