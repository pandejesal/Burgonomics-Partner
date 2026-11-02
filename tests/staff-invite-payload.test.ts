import { describe, expect, it, vi } from 'vitest';

/**
 * Item 8 (api-contract-audit), the dispatch half: whatever the operator typed
 * must reach POST /staff/invite as E.164 — or not be sent at all.
 *
 * The server body is pinned by InviteStaffSchema
 * (functions/src/modules/auth/staffInvite.ts:10-25) and the API wrapper sends
 * { name, email, phone, role, branchIds, cityIds } (partnerFunctionsApi
 * inviteStaff). A raw "9876543210" is a guaranteed 400.
 */
const { inviteStaff } = vi.hoisted(() => ({ inviteStaff: vi.fn() }));

vi.mock('@/services/partnerFunctionsApi', () => ({
  partnerFunctionsApi: { inviteStaff },
}));

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { id: 'u1', role: 'brand_owner' } }),
}));

// The hook only needs the mutation helper; bypass react-query's runtime.
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [], isLoading: false, error: null }),
  useMutation: (opts: { mutationFn: (v: unknown) => Promise<unknown> }) => ({
    mutateAsync: (v: unknown) => opts.mutationFn(v),
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { buildStaffInvitePayload } from '../src/features/users/staffInvitePayload';

describe('staff invite payload phone handling', () => {
  const base = {
    name: 'Ramesh Patel',
    email: 'ramesh@burgonomics.in',
    role: 'branch_staff' as const,
    branchIds: ['branch_surat_01'],
    cityIds: ['Surat'],
  };

  it('sends a typed 10-digit Indian mobile as E.164', () => {
    const payload = buildStaffInvitePayload({ ...base, phone: '9876543210' });

    expect(payload).toMatchObject({ phone: '+919876543210' });
    expect(inviteStaff).not.toHaveBeenCalled();
  });

  it('keeps the phone optional: a blank field sends no phone key at all', () => {
    for (const phone of ['', '   ']) {
      const payload = buildStaffInvitePayload({ ...base, phone });
      expect('phone' in payload).toBe(false);
    }
  });

  it('refuses an invalid number with the operator-facing message instead of sending it', () => {
    expect(() => buildStaffInvitePayload({ ...base, phone: '12345' })).toThrow(
      /valid 10-digit Indian mobile/i
    );
    expect(() => buildStaffInvitePayload({ ...base, phone: '+14155550123' })).toThrow(
      /valid 10-digit Indian mobile/i
    );
  });

  it('trims the email/name it forwards', () => {
    const payload = buildStaffInvitePayload({
      ...base,
      name: '  Ramesh Patel ',
      email: ' RAMESH@Burgonomics.in ',
      phone: '+91 98765 43210',
    });
    expect(payload.name).toBe('Ramesh Patel');
    expect(payload.email).toBe('RAMESH@Burgonomics.in');
    expect(payload.phone).toBe('+919876543210');
  });
});

describe('useUsers().inviteUser sends the normalized body', () => {
  it('forwards E.164 to POST /staff/invite and no PIN key', async () => {
    inviteStaff.mockResolvedValue({ uid: 'uid_new_staff' });
    const { useUsers } = await import('../src/hooks/useUsers');

    const { inviteUser } = useUsers();
    await inviteUser.mutateAsync({
      name: 'Ramesh Patel',
      email: 'ramesh@burgonomics.in',
      phone: '9876543210',
      role: 'branch_staff',
      branchIds: ['branch_surat_01'],
      cityIds: ['Surat'],
    });

    expect(inviteStaff).toHaveBeenCalledTimes(1);
    const body = inviteStaff.mock.lastCall?.[0] as Record<string, unknown>;
    expect(body).toMatchObject({ phone: '+919876543210' });
    // .strict() on the server schema: a PIN key is a 400.
    expect('pin' in body).toBe(false);
    expect(Object.keys(body).sort()).toEqual([
      'branchIds',
      'cityIds',
      'email',
      'name',
      'phone',
      'role',
    ]);
  });

  it('refuses an invalid number before any network call', async () => {
    inviteStaff.mockClear();
    const { useUsers } = await import('../src/hooks/useUsers');

    const { inviteUser } = useUsers();
    await expect(
      inviteUser.mutateAsync({
        name: 'Ramesh Patel',
        email: 'ramesh@burgonomics.in',
        phone: '12345',
        role: 'branch_staff',
        branchIds: ['branch_surat_01'],
        cityIds: ['Surat'],
      })
    ).rejects.toThrow(/valid 10-digit Indian mobile/i);
    expect(inviteStaff).not.toHaveBeenCalled();
  });
});
