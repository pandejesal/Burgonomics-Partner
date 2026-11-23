/**
 * r2 A5 — every operator view must honour the staff-close override, and a surge
 * save must be guarded against FRESH state (a second session's stale cache must
 * not reopen a store the first session just closed).
 */
import React, { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  branches: [] as any[],
  settingsWrites: [] as any[],
  gateCalls: [] as any[],
  hookValues: {} as Record<number, unknown>,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const key = Object.keys(state.hookValues).length;
      if (!(key in state.hookValues)) state.hookValues[key] = initial;
      return [state.hookValues[key], (v: unknown) => { state.hookValues[key] = v; }];
    },
    useRef: (initial: unknown) => ({ current: initial }),
    // Effects run synchronously in this node-tree harness so the modal's
    // useState-derived fields are populated before we inspect its form.
    useEffect: (fn: () => void) => { fn(); },
  };
});
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn(), loading: vi.fn(() => 't'), dismiss: vi.fn() },
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { id: 'u1', role: 'brand_owner', branchIds: ['b1'], cityIds: [] } }),
}));
vi.mock('@/hooks/useBranches', () => ({
  useBranches: () => ({
    branches: state.branches,
    isLoading: false,
    createBranch: { mutateAsync: vi.fn(), isPending: false },
    broadcastLaunchAlert: { mutateAsync: vi.fn(), isPending: false },
    activateStore: { mutateAsync: vi.fn(), isPending: false },
    updateBranchSettings: { mutateAsync: async (v: any) => { state.settingsWrites.push(v); }, isPending: false },
    toggleBranchStatus: { mutate: vi.fn(), isPending: false },
  }),
}));
vi.mock('@/hooks/useFranchiseLeads', () => ({
  useFranchiseLeads: () => ({ leads: [], isLoading: false, updateLeadStatus: { mutate: vi.fn() } }),
}));
vi.mock('@/features/stores/services/storeOperatingStatus', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    applyStaffStoreStatus: async (input: any) => { state.gateCalls.push(input); return { branchId: input.branchId, status: input.status, storeId: 's1', storeStatusOverride: input.status === 'closed' }; },
  };
});

import { BranchesPage } from '../src/pages/BranchesPage';
import { BranchSettingsModal } from '../src/components/stores/BranchSettingsModal';
import { splitOperatingStatusChange } from '../src/features/stores/services/storeOperatingStatus';

const closedBranch = {
  id: 'b1', name: 'Nashik Outlet', city: 'Nashik', address: 'College Road', phone: '+919820011223',
  active: true, status: 'active', acceptingOrdersStatus: 'busy', storeStatusOverride: true,
  prepTimeMinutes: 35, deliveryRadiusKm: null, monthlyFee: null,
};

function textOf(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(textOf).join('');
  if (isValidElement<any>(children)) return textOf((children.props as any).children);
  return '';
}
function findButtonByText(node: ReactNode, text: string): ReactElement<any> | undefined {
  if (Array.isArray(node)) { for (const c of node) { const f = findButtonByText(c, text); if (f) return f; } return undefined; }
  if (!isValidElement<any>(node)) return undefined;
  if (node.type === 'button' && textOf((node.props as any).children).includes(text)) return node;
  return findButtonByText((node.props as any).children, text);
}
function findText(node: ReactNode, text: string): boolean {
  if (Array.isArray(node)) return node.some((c) => findText(c, text));
  if (!isValidElement<any>(node)) return typeof node === 'string' && node.includes(text);
  return textOf((node.props as any).children).includes(text) || findText((node.props as any).children, text);
}

beforeEach(() => {
  state.branches = [{ ...closedBranch }];
  state.settingsWrites = [];
  state.gateCalls = [];
  state.hookValues = {};
});

describe('r2 A5 — every status view honours the override', () => {
  it('the branch card shows Closed even when a stale session left it Busy', () => {
    const tree = (BranchesPage as any)({});
    expect(findText(tree, 'Offline / Closed')).toBe(true);
    expect(textOf(tree)).not.toContain('Busy (Delays)');
  });

  it('a surge save from a stale session is guarded against the fresh closed state', () => {
    // Session A closed the store. Session B still holds a busy settings form,
    // so the guard must use the FRESH branch (what BranchesPage now passes as
    // `current`) rather than the stale form's own idea of the status.
    const freshFromOtherSession = { ...state.branches[0] };
    const staleForm = { acceptingOrdersStatus: 'busy', active: true, prepTimeMinutes: 40 };
    const split = splitOperatingStatusChange({
      current: freshFromOtherSession,
      settings: staleForm,
    });
    expect(split.gate).toBeNull();
    expect(split.branchSettings).not.toHaveProperty('active');
    expect(split.branchSettings).not.toHaveProperty('acceptingOrdersStatus');
    expect(split.branchSettings.prepTimeMinutes).toBe(40);
    expect(state.gateCalls).toEqual([]);
  });

  it('a stale open modal saving an unrelated edit does not request a reopen', async () => {
    const saved: any[] = [];
    // Call the REAL modal. Another session closed the store, so it receives the
    // fresh branch with the override; its effective status is closed.
    const tree = (BranchSettingsModal as any)({
      isOpen: true,
      onClose: () => undefined,
      branch: closedBranch,
      onSave: async (_id: string, patch: any) => { saved.push(patch); },
    });
    function findForm(node: ReactNode): ReactElement<any> | undefined {
      if (Array.isArray(node)) { for (const c of node) { const f = findForm(c); if (f) return f; } return undefined; }
      if (!isValidElement<any>(node)) return undefined;
      if (node.type === 'form') return node;
      return findForm((node.props as any).children);
    }
    const form = findForm(tree);
    expect(form).toBeDefined();
    await (form as any).props.onSubmit({ preventDefault: () => undefined });
    expect(saved).toHaveLength(1);
    expect(saved[0]).not.toHaveProperty('active');
    expect(saved[0]).not.toHaveProperty('acceptingOrdersStatus');
  });

  it('the card action says Go Live for a closed outlet and reopens it', async () => {
    const tree = (BranchesPage as any)({});
    const goLive = findButtonByText(tree, 'Go Live');
    expect(goLive).toBeDefined();
    expect(findButtonByText(tree, 'Go Offline')).toBeUndefined();
    await goLive!.props.onClick();
    expect(state.gateCalls).toContainEqual({ branchId: 'b1', status: 'open' });
  });

  it('the shared split drops surge flags when the current state carries the override', () => {
    const split = splitOperatingStatusChange({
      current: { ...closedBranch },
      settings: { acceptingOrdersStatus: 'busy', active: true, prepTimeMinutes: 40 },
    });
    expect(split.gate).toBeNull();
    expect(split.branchSettings).not.toHaveProperty('active');
    expect(split.branchSettings).not.toHaveProperty('acceptingOrdersStatus');
  });
});
