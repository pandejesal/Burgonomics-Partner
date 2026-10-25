import { describe, it, expect } from 'vitest';
import type { UserRole } from '@/types';
import { canAccessRoute, PARTNER_CONSOLE_ROLES } from '@/core/auth/routePolicy';
import { navItems } from '@/hooks/useNavigation';

// 'customer' can never hold a partner session (authStore rejects it at
// sign-in) and routePolicy denies it everywhere — parity must hold for it too.
const ALL_ROLES: UserRole[] = [...PARTNER_CONSOLE_ROLES, 'customer'];

describe('Nav/policy parity (sidebar derives from routePolicy)', () => {
  it('every nav item x role: item.roles.includes(role) === canAccessRoute(role, item.path)', () => {
    expect(navItems.length).toBeGreaterThan(0);
    for (const item of navItems) {
      for (const role of ALL_ROLES) {
        expect(item.roles.includes(role), `${item.path} as ${role}`).toBe(
          canAccessRoute(role, item.path)
        );
      }
    }
  });

  it('pins the reported bounces shut: no nav entry a denied role can reach', () => {
    const byPath = new Map(navItems.map((item) => [item.path, item]));
    // branch_staff clicked Chat Hub / Support Tickets and bounced to /kds.
    for (const path of ['/chat', '/tickets']) {
      expect(byPath.get(path)?.roles, path).not.toContain('branch_staff');
    }
    // Support clicked Settings and bounced to /dashboard.
    expect(byPath.get('/settings')?.roles, '/settings').not.toContain('support');
    // branch_staff menu access the policy grants is now actually offered.
    expect(byPath.get('/menu')?.roles, '/menu').toContain('branch_staff');
  });

  it('notification bell target is reachable for every role that can see it', () => {
    // NotificationBell hides itself when the policy denies /notifications,
    // so the bell can never link to a bounce. Bell-visible roles:
    for (const role of PARTNER_CONSOLE_ROLES) {
      const bellVisible = canAccessRoute(role, '/notifications');
      if (role === 'branch_staff') expect(bellVisible).toBe(false);
      else expect(bellVisible).toBe(true);
    }
    expect(canAccessRoute('customer', '/notifications')).toBe(false);
  });
});
