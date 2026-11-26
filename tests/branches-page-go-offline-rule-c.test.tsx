/**
 * The Branches screen "Go Offline" / "Go Live" pill (partner-ops, fix wave
 * 2026-11-20).
 *
 * `toggleBranchStatus` writes `branches/{id}.active` + `.status` only. Those are
 * lifecycle metadata: no ordering path reads them, so "Go Offline" left
 * customers ordering — the same defect as the Settings toggle, on a third
 * screen. Rule C says an open/close is the customer gate and a staff close must
 * outrank a later Petpooja "open".
 *
 * Contract pinned here:
 *   - the pill goes through the server gate (`applyStaffStoreStatus`);
 *   - the lifecycle fields (`active`, `status`) still save, so the outlet card
 *     and the branch list stay truthful;
 *   - a gate refusal leaves the outlet untouched and says so (the existing
 *     "Could not update <name>" behaviour is preserved).
 *
 * Node environment, following the repo's L1/L4 precedent
 * (coder-wave2-partner-scope-and-toggles.test.tsx): React hooks are stubbed so
 * the page's element tree can be inspected without a DOM.
 */
import React, { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  branches: [] as any[],
  toggleCalls: [] as any[],
  gateCalls: [] as any[],
  toastErrors: [] as string[],
  gateImpl: null as null | (() => Promise<unknown>),
  rejectToggle: true,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => [
      typeof initial === 'function' ? (initial as () => unknown)() : initial,
      vi.fn(),
    ],
    useRef: (initial: unknown) => ({ current: initial }),
    // The page tree is INSPECTED, not mounted (node environment, no renderer),
    // so an effect body has nothing to run under. Stub it — the tree-shape and
    // onClick assertions this file makes are unaffected.
    useEffect: vi.fn(),
  };
});

vi.mock('sonner', () => ({
  toast: {
    // Record the title AND the description: the server's own refusal reason
    // rides in the description (sonner's second argument), and that is what the
    // operator reads.
    error: (m: string, opts?: { description?: string }) => {
      state.toastErrors.push([m, opts?.description].filter(Boolean).join(' — '));
    },
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: {
      id: 'user_1',
      role: 'brand_owner',
      branchIds: ['branch_nashik_01'],
      cityIds: [],
    },
  }),
}));

vi.mock('@/hooks/useBranches', () => ({
  useBranches: () => ({
    branches: state.branches,
    isLoading: false,
    createBranch: { mutateAsync: vi.fn(), isPending: false },
    broadcastLaunchAlert: { mutateAsync: vi.fn(), isPending: false },
    activateStore: { mutateAsync: vi.fn(), isPending: false },
    updateBranchSettings: { mutateAsync: vi.fn(), isPending: false },
    toggleBranchStatus: {
      isPending: false,
      mutate: (vars: any, options?: { onError?: (error: unknown) => void }) => {
        state.toggleCalls.push(vars);
        if (state.rejectToggle) options?.onError?.(new Error('permission-denied'));
      },
    },
  }),
}));

vi.mock('@/hooks/useFranchiseLeads', () => ({
  useFranchiseLeads: () => ({
    leads: [],
    isLoading: false,
    updateLeadStatus: { mutate: vi.fn(), isPending: false },
  }),
}));

vi.mock('@/features/stores/services/storeOperatingStatus', () => ({
  applyStaffStoreStatus: async (input: any) => {
    state.gateCalls.push(input);
    if (state.gateImpl) return state.gateImpl();
    return {
      branchId: input.branchId,
      status: input.status,
      storeId: 'str_1',
      storeStatusOverride: input.status === 'closed',
    };
  },
  splitOperatingStatusChange: (input: any) => {
    const next = input?.settings?.acceptingOrdersStatus;
    const branchSettings: Record<string, unknown> = { ...(input?.settings ?? {}) };
    delete branchSettings.acceptingOrdersStatus;
    delete branchSettings.active;
    const current =
      input?.current?.acceptingOrdersStatus ??
      (input?.current?.active === false ? 'closed' : 'open');
    const gate =
      next === 'busy' || next === undefined || next === current ? null : { status: next };
    return { gate, branchSettings };
  },
}));

import { BranchesPage } from '../src/pages/BranchesPage';

const branch = (over: Record<string, unknown> = {}) => ({
  id: 'branch_nashik_01',
  name: 'Nashik Outlet',
  city: 'Nashik',
  address: 'College Road',
  phone: '+919820011223',
  active: true,
  status: 'active',
  acceptingOrdersStatus: 'open',
  prepTimeMinutes: 20,
  deliveryRadiusKm: null,
  monthlyFee: null,
  ...over,
});

function textOf(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(textOf).join('');
  // Icon/span wrappers: the label lives inside them, so recurse.
  if (isValidElement<any>(children)) {
    return textOf((children.props as { children?: ReactNode }).children);
  }
  return '';
}

function findButton(node: ReactNode, label: string): ReactElement<any> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findButton(child, label);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement<any>(node)) return undefined;
  const props = node.props as { children?: ReactNode };
  if (node.type === 'button' && textOf(props.children).includes(label)) return node;
  return findButton(props.children, label);
}

beforeEach(() => {
  state.branches = [branch()];
  state.toggleCalls = [];
  state.gateCalls = [];
  state.toastErrors = [];
  state.gateImpl = null;
  state.rejectToggle = true;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Branches page Go Offline goes through the server gate', () => {
  it('closes the customer gate AND keeps the lifecycle fields truthful', async () => {
    const tree = (BranchesPage as any)({});
    const toggle = findButton(tree, 'Go Offline');
    expect(toggle).toBeDefined();

    await toggle!.props.onClick();

    expect(state.gateCalls).toEqual([{ branchId: 'branch_nashik_01', status: 'closed' }]);
    // The lifecycle metadata still saves (`toggleBranchStatus` derives
    // status: active ? 'active' : 'inactive'), so the card and branch list stay right.
    expect(state.toggleCalls).toEqual([{ branchId: 'branch_nashik_01', active: false }]);
  });

  it('Go Live reopens the gate (clearing the staff override)', async () => {
    state.branches = [
      branch({ active: false, status: 'inactive', acceptingOrdersStatus: 'closed' }),
    ];
    const tree = (BranchesPage as any)({});
    const toggle = findButton(tree, 'Go Live');
    expect(toggle).toBeDefined();

    await toggle!.props.onClick();

    expect(state.gateCalls).toEqual([{ branchId: 'branch_nashik_01', status: 'open' }]);
    expect(state.toggleCalls).toEqual([{ branchId: 'branch_nashik_01', active: true }]);
  });

  it('a gate refusal leaves the outlet alone and says so', async () => {
    state.gateImpl = async () => {
      throw new Error('This outlet is not linked to a storefront — nothing was saved.');
    };
    const tree = (BranchesPage as any)({});
    const toggle = findButton(tree, 'Go Offline');

    await toggle!.props.onClick();

    // No lifecycle write on a refused close: that would claim the outlet went
    // offline while customers keep ordering.
    expect(state.toggleCalls).toEqual([]);
    expect(state.toastErrors.join(' ')).toMatch(/not linked to a storefront/i);
    // The existing failure wording still names the outlet.
    expect(state.toastErrors.join(' ')).toMatch(/Nashik Outlet/);
  });
});
