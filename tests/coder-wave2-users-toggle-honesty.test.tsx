/**
 * L4 — UsersPage: a rejected staff activate/deactivate must surface, not fail
 * silently.
 *
 * Node-env render harness (same pattern as
 * tests/partner-app-high-findings.test.tsx). Fails against the pre-fix source,
 * which calls `toggleUserStatus.mutate({ userId, active })` with no onError.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const reactState = vi.hoisted(() => ({
  index: 0,
  overrides: new Map<number, unknown>(),
  setters: [] as Array<(value: unknown) => void>,
}));

const tableProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
const toggleUserStatus = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const hookIndex = reactState.index;
      reactState.index += 1;
      const setter = vi.fn();
      reactState.setters.push(setter);
      const value = reactState.overrides.has(hookIndex)
        ? reactState.overrides.get(hookIndex)
        : initial;
      return [value, setter];
    },
    useEffect: vi.fn(),
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/hooks/useUsers', () => ({
  useUsers: () => ({
    users: [
      {
        id: 'u1',
        name: 'Ramesh Patel',
        email: 'ramesh@burgonomics.in',
        phone: '99887 65432',
        role: 'branch_staff',
        active: true,
        pinSet: true,
        cityIds: ['Surat'],
      },
    ],
    isLoading: false,
    inviteUser: { mutateAsync: vi.fn(), isPending: false },
    updateUser: { mutateAsync: vi.fn(), isPending: false },
    toggleUserStatus,
    revokeUser: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

vi.mock('@/hooks/useBranches', () => ({
  useBranches: () => ({ branches: [] }),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { role: 'brand_owner' } }),
}));

vi.mock('@/features/users/components/CreateStaffModal', () => ({
  CreateStaffModal: () => null,
}));

vi.mock('@/components/users/EditUserModal', () => ({
  EditUserModal: () => null,
}));

vi.mock('@/features/users/components/StaffMemberTable', () => ({
  StaffMemberTable: (props: Record<string, unknown>) => {
    tableProps.current = props;
    return null;
  },
}));

import { UsersPage } from '@/pages/UsersPage';
import { toast } from 'sonner';

describe('L4: staff status toggle surfaces failures', () => {
  beforeEach(() => {
    reactState.index = 0;
    reactState.overrides.clear();
    reactState.setters.length = 0;
    tableProps.current = null;
    vi.clearAllMocks();
  });

  it('raises an error toast when the toggle mutation rejects', () => {
    renderToStaticMarkup(<UsersPage />);

    const props = tableProps.current;
    expect(props).toBeTruthy();
    const onToggleStatus = props!.onToggleStatus as (id: string, active: boolean) => void;

    onToggleStatus('u1', false);

    expect(toggleUserStatus.mutate).toHaveBeenCalledOnce();
    const options = toggleUserStatus.mutate.mock.calls[0][1] as
      | { onError?: (err: unknown) => void }
      | undefined;
    expect(options?.onError).toBeTypeOf('function');

    options!.onError!(new Error('permission denied'));
    expect(toast.error).toHaveBeenCalledWith('Status NOT changed.', expect.anything());
  });
});
