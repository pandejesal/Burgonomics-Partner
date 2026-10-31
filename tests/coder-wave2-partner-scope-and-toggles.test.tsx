/**
 * Wave-2 partner scope + silent-toggle fixes (coder lane, partner app).
 *
 * One focused test per finding from
 * audit-results/polish-2026-10-14/sprint-2026-10-16/audit-partner-app.md:
 *   M4 (regional-manager scope fails closed in useTickets/useAnalytics),
 *   L1 (branch cards show configured values or an explicit "Not configured"),
 *   L4 (branch + lead toggles surface a rejected write).
 *
 * Node environment (vitest.config.ts: environment 'node'). React's useState /
 * useRef are stubbed so the hooks can be driven and the element tree inspected
 * without a DOM; each test FAILS against the pre-fix source.
 */
import React, { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  role: 'brand_owner' as string,
  cityIds: [] as string[],
  branchIds: [] as string[],
  selectedBranchId: null as string | null,
  branches: [] as any[],
  leads: [] as any[],
  queries: [] as any[],
  docs: {} as Record<string, any[]>,
  capturedQuery: null as any,
  refs: [] as { current: unknown }[],
  toggleCalls: [] as any[],
  toastErrors: [] as string[],
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    // Hooks are stubbed so hook bodies and element trees can be exercised in
    // the node environment. Rendering still runs through the real renderer.
    useState: (initial: unknown) => [
      typeof initial === 'function' ? (initial as () => unknown)() : initial,
      vi.fn(),
    ],
    // Recorded so a hook's ref (e.g. useTickets' warningsRef) can be read after
    // the captured queryFn resolves.
    useRef: (initial: unknown) => {
      const ref = { current: initial };
      state.refs.push(ref);
      return ref;
    },
  };
});

vi.mock('sonner', () => ({
  toast: {
    error: (m: string) => state.toastErrors.push(m),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/config/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ __collection: name }),
  query: (ref: any, ...constraints: any[]) => ({
    __collection: ref?.__collection,
    constraints,
  }),
  where: (field: string, op: string, value: unknown) => ({ __where: { field, op, value } }),
  orderBy: (field: string, dir: string) => ({ __orderBy: { field, dir } }),
  limit: (n: number) => ({ __limit: n }),
  doc: (_db: unknown, name: string, id: string) => ({ __doc: `${name}/${id}` }),
  updateDoc: vi.fn(async () => undefined),
  addDoc: vi.fn(async () => undefined),
  setDoc: vi.fn(async () => undefined),
  Timestamp: {
    now: () => ({ toMillis: () => Date.now() }),
    fromMillis: (ms: number) => ({ toMillis: () => ms }),
    fromDate: (d: Date) => ({ toMillis: () => d.getTime() }),
  },
  getDocs: vi.fn(async (q: any) => {
    state.queries.push(q);
    const rows = state.docs[q?.__collection] ?? [];
    return { docs: rows, empty: rows.length === 0, size: rows.length };
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: any) => {
    state.capturedQuery = options;
    return { data: undefined, isLoading: false, error: null, refetch: vi.fn() };
  },
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/utils/orderContract', () => ({
  normalizeOrderDoc: (id: string, data: any) => ({ id, ...data }),
  fetchAliasedStoreOrders: vi.fn(async () => []),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: {
      id: 'user_1',
      role: state.role,
      branchIds: state.branchIds,
      cityIds: state.cityIds,
    },
  }),
}));

vi.mock('@/stores/appStore', () => ({
  useAppStore: () => ({ selectedBranchId: state.selectedBranchId, selectedCity: null }),
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
        options?.onError?.(new Error('permission-denied'));
      },
    },
  }),
}));

vi.mock('@/hooks/useFranchiseLeads', () => ({
  useFranchiseLeads: () => ({
    leads: state.leads,
    isLoading: false,
    updateLeadStatus: {
      isPending: false,
      mutate: (vars: any, options?: { onError?: (error: unknown) => void }) => {
        state.toggleCalls.push(vars);
        options?.onError?.(new Error('permission-denied'));
      },
    },
  }),
}));

vi.mock('@/features/branches/components/BranchConfigModal', () => ({
  BranchConfigModal: () => null,
}));
vi.mock('@/components/stores/BranchSettingsModal', () => ({ BranchSettingsModal: () => null }));
vi.mock('@/components/stores/LaunchBroadcastModal', () => ({ LaunchBroadcastModal: () => null }));

import { useTickets } from '@/hooks/useTickets';
import { useAnalytics } from '@/hooks/useAnalytics';
import { BranchesPage } from '@/pages/BranchesPage';
import { FranchiseLeadsPipeline } from '@/components/stores/FranchiseLeadsPipeline';
import { getDocs } from 'firebase/firestore';

const branch = (overrides: Record<string, unknown> = {}) => ({
  id: 'branch_nashik_01',
  name: 'Nashik Outlet',
  city: 'Nashik',
  address: 'College Road, Nashik',
  phone: '+91 90000 12345',
  active: true,
  status: 'active',
  acceptingOrdersStatus: 'open',
  coordinates: { lat: 19.99, lng: 73.78 },
  createdAt: null,
  ...overrides,
});

const lead = (overrides: Record<string, unknown> = {}) => ({
  id: 'lead_1',
  applicantName: 'Applicant One',
  phone: '+91 90000 00000',
  email: 'applicant.one@example.com',
  city: 'Vadodara',
  investmentBudget: '25L-50L',
  commercialSpace: 'searching',
  status: 'new',
  createdAt: null,
  updatedAt: null,
  ...overrides,
});

/** Queries that ask Firestore for the two hardcoded fallback cities. */
const fallbackCityQueries = () =>
  state.queries.filter((q) =>
    (q?.constraints ?? []).some(
      (c: any) =>
        c?.__where?.field === 'city' &&
        JSON.stringify(c.__where.value) === JSON.stringify(['Ahmedabad', 'Surat'])
    )
  );

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

function findElement(
  node: ReactNode,
  match: (element: ReactElement<any>) => boolean
): ReactElement<any> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, match);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement<any>(node)) return undefined;
  if (match(node as ReactElement<any>)) return node as ReactElement<any>;
  return findElement((node.props as any).children, match);
}

beforeEach(() => {
  state.role = 'brand_owner';
  state.cityIds = [];
  state.branchIds = [];
  state.selectedBranchId = null;
  state.branches = [];
  state.leads = [];
  state.queries = [];
  state.docs = {};
  state.capturedQuery = null;
  state.refs = [];
  state.toggleCalls = [];
  state.toastErrors = [];
});

describe('M4 — regional-manager scope fails closed', () => {
  it('useTickets: a manager with no cities gets no foreign-city query and no tickets', async () => {
    state.role = 'regional_manager';
    state.cityIds = [];
    state.docs = {
      branches: [{ id: 'branch_foreign_1', data: () => ({ city: 'Surat' }) }],
      support_tickets: [],
      tickets: [],
    };

    const { warnings } = useTickets({});
    const tickets = await state.capturedQuery.queryFn();

    // useTickets returns the ref read at render time; after the (captured)
    // query resolves the hook's own warning list is the ref's current value.
    const queryWarnings = [
      ...warnings,
      ...((state.refs[0]?.current as string[] | undefined) ?? []),
    ];

    expect(fallbackCityQueries()).toHaveLength(0);
    expect(
      state.queries.filter(
        (q) => q.__collection === 'support_tickets' || q.__collection === 'tickets'
      )
    ).toHaveLength(0);
    expect(tickets).toEqual([]);
    expect(queryWarnings.join(' ')).toMatch(/cities are assigned/i);
  });

  it('useAnalytics: a manager with no cities gets an empty, honest result', async () => {
    state.role = 'regional_manager';
    state.cityIds = [];
    state.docs = {
      branches: [{ id: 'branch_foreign_1', data: () => ({ name: 'Foreign Outlet', city: 'Surat' }) }],
      orders: [
        {
          id: 'ord_1',
          branchId: 'branch_foreign_1',
          total: 999,
          orderType: 'delivery',
          deliveryFee: 30,
          createdAt: { toMillis: () => Date.now() },
        },
      ],
    };

    useAnalytics('month');
    const result = await state.capturedQuery.queryFn();

    expect(result.totalOrders).toBe(0);
    expect(result.totalRevenue).toBe(0);
    expect(result.warnings.join(' ')).toMatch(/cities are assigned/i);
    expect(fallbackCityQueries()).toHaveLength(0);
    expect(state.queries.filter((q) => q.__collection === 'orders')).toHaveLength(0);
  });

  it('useAnalytics: a foreign selection is denied with a warning and no orders read', async () => {
    state.role = 'regional_manager';
    state.cityIds = ['Surat'];
    state.selectedBranchId = 'branch_ahmedabad_01';
    state.docs = {
      branches: [{ id: 'branch_surat_01', data: () => ({ name: 'Surat Outlet', city: 'Surat' }) }],
      orders: [
        {
          id: 'ord_foreign',
          branchId: 'branch_ahmedabad_01',
          total: 500,
          orderType: 'delivery',
          deliveryFee: 30,
          createdAt: { toMillis: () => Date.now() },
        },
      ],
    };

    useAnalytics('month');
    const result = await state.capturedQuery.queryFn();

    expect(result.totalOrders).toBe(0);
    expect(result.totalRevenue).toBe(0);
    expect(result.warnings.join(' ')).toMatch(/outside your assigned cities/i);
    expect(state.queries.filter((q) => q.__collection === 'orders')).toHaveLength(0);
  });

  it('useAnalytics: a failed city-scope read is denied, never a brand-wide read', async () => {
    state.role = 'regional_manager';
    state.cityIds = ['Surat'];
    state.selectedBranchId = null;
    state.docs = {
      branches: [{ id: 'branch_surat_01', data: () => ({ name: 'Surat Outlet', city: 'Surat' }) }],
      orders: [
        {
          id: 'ord_1',
          branchId: 'branch_surat_01',
          total: 500,
          orderType: 'delivery',
          deliveryFee: 30,
          createdAt: { toMillis: () => Date.now() },
        },
      ],
    };
    vi.mocked(getDocs).mockRejectedValueOnce(new Error('permission-denied'));

    useAnalytics('month');
    const result = await state.capturedQuery.queryFn();

    expect(result.totalOrders).toBe(0);
    expect(result.totalRevenue).toBe(0);
    expect(result.warnings.join(' ')).toMatch(/could not resolve/i);
    expect(state.queries.filter((q) => q.__collection === 'orders')).toHaveLength(0);
  });

  it('useAnalytics: a city scope resolving to no outlets is denied, not read unfiltered', async () => {
    state.role = 'regional_manager';
    state.cityIds = ['Surat'];
    state.selectedBranchId = null;
    state.docs = {
      branches: [],
      orders: [
        {
          id: 'ord_any',
          branchId: 'branch_any',
          total: 500,
          orderType: 'delivery',
          deliveryFee: 30,
          createdAt: { toMillis: () => Date.now() },
        },
      ],
    };

    useAnalytics('month');
    const result = await state.capturedQuery.queryFn();

    expect(result.totalOrders).toBe(0);
    expect(result.warnings.join(' ')).toMatch(/no outlets were found/i);
    expect(state.queries.filter((q) => q.__collection === 'orders')).toHaveLength(0);
  });
});

describe('L1 — branch cards show configured values or say they are unset', () => {
  it('renders Not configured instead of the 7 km / 5.0% defaults', () => {
    state.branches = [branch()];
    const html = renderToStaticMarkup(<BranchesPage />);

    expect(html).not.toContain('7 km');
    expect(html).not.toContain('5.0% Escrow Cut');
    expect(html).toContain('Not configured');
  });

  it('renders the recorded geofence and royalty when they exist', () => {
    state.branches = [branch({ deliveryRadiusKm: 9.5, brandRoyaltyPercent: 6 })];
    const html = renderToStaticMarkup(<BranchesPage />);

    expect(html).toContain('9.5 km Geofence');
    expect(html).toContain('6% Escrow Cut');
    expect(html).not.toContain('Not configured');
  });
});

describe('L4 — branch and lead toggles surface a failed write', () => {
  it('raises a toast when the outlet status write is rejected', () => {
    state.branches = [branch()];
    const tree = BranchesPage({});

    const toggle = findElement(
      tree,
      (element) => element.type === 'button' && textOf(element.props.children).includes('Go Offline')
    );
    expect(toggle).toBeDefined();

    toggle!.props.onClick();

    expect(state.toggleCalls).toEqual([{ branchId: 'branch_nashik_01', active: false }]);
    expect(state.toastErrors.some((m) => /Could not update Nashik Outlet/.test(m))).toBe(true);
  });

  it('raises a toast when a franchise lead status write is rejected', () => {
    state.leads = [lead()];
    const tree = FranchiseLeadsPipeline({ onConvertToBranch: vi.fn() });

    const select = findElement(tree, (element) => element.type === 'select');
    expect(select).toBeDefined();

    select!.props.onChange({ target: { value: 'approved' } });

    expect(state.toggleCalls).toEqual([{ leadId: 'lead_1', status: 'approved' }]);
    expect(state.toastErrors.some((m) => /Could not update Applicant One/.test(m))).toBe(true);
  });
});
