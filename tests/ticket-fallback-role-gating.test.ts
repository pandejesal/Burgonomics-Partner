/**
 * Rules ticket update arms admit brand_owner/developer or branch_owner/staff
 * with ownsBranch. support and regional_manager have no arm, so the legacy
 * direct-timeline fallback must not attempt a denied write; it returns an
 * honest message so the screen keeps the draft.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  role: 'support' as string,
  updateDoc: vi.fn(async () => undefined),
  sendTicketMessage: vi.fn(async () => {
    throw new Error('permission-denied');
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: null, isLoading: false, error: null }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: (options: any) => ({
    mutateAsync: (vars: any) => options.mutationFn(vars),
    isPending: false,
  }),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  getDoc: vi.fn(async () => ({ exists: () => false })),
  updateDoc: state.updateDoc,
  setDoc: vi.fn(),
  collection: () => ({}),
  arrayUnion: (value: unknown) => value,
  Timestamp: { now: () => ({}) },
}));
vi.mock('@/services/partnerFunctionsApi', () => ({
  partnerFunctionsApi: { sendTicketMessage: state.sendTicketMessage },
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: Object.assign(() => ({ user: { role: state.role } }), {
    getState: () => ({ user: { role: state.role } }),
  }),
}));

import { canWriteTicketTimelineDirectly } from '@/core/auth/routePolicy';
import { useTicket } from '@/hooks/useTicket';

beforeEach(() => {
  state.role = 'support';
  state.updateDoc.mockClear();
  state.sendTicketMessage.mockClear();
});

describe('ticket direct-timeline fallback by role', () => {
  it('admits only the roles the rules arm accepts', () => {
    expect(canWriteTicketTimelineDirectly('brand_owner')).toBe(true);
    expect(canWriteTicketTimelineDirectly('developer')).toBe(true);
    expect(canWriteTicketTimelineDirectly('branch_owner')).toBe(true);
    expect(canWriteTicketTimelineDirectly('branch_staff')).toBe(true);
    expect(canWriteTicketTimelineDirectly('support')).toBe(false);
    expect(canWriteTicketTimelineDirectly('regional_manager')).toBe(false);
  });

  it('never attempts the denied write for support and keeps the draft message honest', async () => {
    const { addMessage } = useTicket('tkt_1');
    await expect(
      addMessage.mutateAsync({ text: 'typed reply', authorName: 'Support' })
    ).rejects.toThrow(/draft is kept/i);
    expect(state.updateDoc).not.toHaveBeenCalled();
  });

  it('still uses the legacy fallback for branch staff', async () => {
    state.role = 'branch_staff';
    const { addMessage } = useTicket('tkt_1');
    const event = await addMessage.mutateAsync({ text: 'typed reply', authorName: 'Staff' });
    expect(state.updateDoc).toHaveBeenCalledTimes(1);
    expect(event).toMatchObject({ message: 'typed reply' });
  });
});
