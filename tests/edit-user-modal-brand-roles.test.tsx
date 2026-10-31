/**
 * PAR-02b — brand-level roles cannot be edited into the claims route.
 *
 * POST /auth/assignRole validates
 *   role: z.enum(['support','regional_manager','branch_owner','branch_staff'])
 * (backend/functions/src/core/validation.ts), so editing a brand_owner or a
 * developer used to submit that role and come back as a raw 400. The modal now
 * locks role/branch/city editing for those targets and says why, while name and
 * phone stay editable (non-privileged direct write).
 *
 * The enum is NOT widened here and no role field is ever written directly.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/hooks/useBranches', () => ({
  useBranches: () => ({ branches: [{ id: 'branch_surat_01', name: 'Surat', city: 'Surat' }] }),
}));

import {
  EditUserModal,
  buildUserEditUpdates,
} from '../src/components/users/EditUserModal';
import type { TeamUser } from '../src/hooks/useUsers';

const baseUser: TeamUser = {
  id: 'uid_1',
  name: 'Ramesh Patel',
  email: 'ramesh@burgonomics.in',
  phone: '+91 90000 00000',
  role: 'branch_staff',
  branchIds: ['branch_surat_01'],
  cityIds: ['Surat'],
};

const form = {
  name: 'Ramesh P.',
  phone: '+91 91111 11111',
  role: 'branch_owner' as const,
  branchIds: ['branch_surat_01'],
  cityIds: ['Surat'],
};

const render = (user: TeamUser) =>
  renderToStaticMarkup(
    <EditUserModal isOpen onClose={() => {}} user={user} onSave={async () => {}} />
  );

describe('PAR-02b — brand-level targets are locked in the edit modal', () => {
  it.each(['brand_owner', 'developer'] as const)(
    'locks role editing for a %s account and explains why',
    (role) => {
      const html = render({ ...baseUser, role });
      expect(html).toContain('cannot be changed from the partner console');
      // The role API only accepts the four operator roles; never offer the
      // brand roles as an assignable option.
      expect(html).not.toContain('value="brand_owner"');
      expect(html).not.toContain('value="developer"');
      // Profile edits stay available.
      expect(html).toContain('Full Name');
      expect(html).toContain('Mobile Number');
      expect(html).toContain('<input type="text"');
      expect(html).toContain('<input type="tel"');
    }
  );

  it('never sends role/branch/city for a brand-level target', () => {
    for (const role of ['brand_owner', 'developer'] as const) {
      const updates = buildUserEditUpdates({ ...baseUser, role }, form);
      expect(updates).toEqual({ name: 'Ramesh P.', phone: '+91 91111 11111' });
      expect(updates).not.toHaveProperty('role');
      expect(updates).not.toHaveProperty('branchIds');
      expect(updates).not.toHaveProperty('cityIds');
    }
  });

  it('still sends role/branch scope for an operator target', () => {
    const updates = buildUserEditUpdates(baseUser, form);
    expect(updates).toEqual({
      name: 'Ramesh P.',
      phone: '+91 91111 11111',
      role: 'branch_owner',
      branchIds: ['branch_surat_01'],
      cityIds: ['Surat'],
    });
  });

  it('refuses a forged brand-level role even for an operator target', () => {
    const updates = buildUserEditUpdates(baseUser, { ...form, role: 'brand_owner' });
    expect(updates).not.toHaveProperty('role');
    expect(updates).toEqual({ name: 'Ramesh P.', phone: '+91 91111 11111' });
  });

  it('offers only the four server-assignable roles to operator targets', () => {
    const html = render(baseUser);
    for (const role of ['branch_staff', 'branch_owner', 'regional_manager', 'support']) {
      expect(html).toContain(`value="${role}"`);
    }
    expect(html).not.toContain('value="brand_owner"');
    expect(html).not.toContain('value="developer"');
  });
});
