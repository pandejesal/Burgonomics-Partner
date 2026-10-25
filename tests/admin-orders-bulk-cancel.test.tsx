/**
 * F1/F2/F6/F8 — Control Room order board truthfulness.
 *
 * Node-env / no DOM (repo convention): the page component is executed as a
 * function with a state store substituted for React's hooks, so handlers can be
 * driven and the resulting element tree inspected. This is the same harness
 * style as tests/menu-feedback.test.tsx.
 */
import React, { type ReactElement, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  stateIndex: 0,
  assignedStoreIds: ['branch_a', 'branch_b'] as string[],
  updates: vi.fn(),
  releaseRefund: vi.fn(),
  listenLiveOrders: vi.fn(),
  getHistory: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  cleanups: [] as Array<() => void>,
}));

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  // One shared store keyed by hook call order: the page is re-invoked after a
  // handler runs, so state survives the "render".
  useState: (initial: unknown) => {
    const index = h.stateIndex++;
    if (!(index in h.states)) {
      h.states[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
    }
    return [
      h.states[index],
      (value: unknown) => {
        h.states[index] = typeof value === 'function' ? (value as (p: unknown) => unknown)(h.states[index]) : value;
      },
    ];
  },
  useEffect: (effect: () => unknown) => {
    const cleanup = effect();
    if (typeof cleanup === 'function') h.cleanups.push(cleanup as () => void);
  },
  useMemo: (fn: () => unknown) => fn(),
  useCallback: (fn: unknown) => fn,
  useRef: (current: unknown) => ({ current }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: h.toastSuccess,
    error: h.toastError,
    info: h.toastInfo,
    warning: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('@/admin/hooks/useAdmin', () => ({
  useAdmin: () => ({
    admin: {
      id: 'u1',
      email: 'owner@example.com',
      fullName: 'Owner',
      avatar: null,
      role: { name: 'branch_owner', permissions: [] },
      assignedStoreId: 'branch_a',
    },
    // F8: two assigned outlets — the old code clamped to branchIds[0].
    assignedStoreIds: h.assignedStoreIds,
    role: 'branch_owner',
  }),
}));

vi.mock('@/admin/dashboard/hooks/useDashboardData', () => ({
  useStores: () => ({ data: [] }),
}));

vi.mock('@/admin/services/adminOrdersService', () => ({
  adminOrdersService: {
    listenLiveOrders: h.listenLiveOrders,
    getHistory: h.getHistory,
    updateOrderStatus: h.updates,
  },
}));

vi.mock('@/services/partnerFunctionsApi', () => ({
  partnerFunctionsApi: { releaseRefund: h.releaseRefund, pushOrderToPetpooja: vi.fn() },
}));

// Keep the render light: the page only needs these to exist as element types.
vi.mock('../src/admin/components/Headers', () => ({ PageHeader: () => null }));
vi.mock('../src/admin/components/Cards', () => ({ StatCard: () => null }));
vi.mock('../src/admin/components/Badges', () => ({ StatusBadge: () => null }));
vi.mock('../src/admin/components/Buttons', () => ({ AdminButton: () => null }));
vi.mock('motion/react', () => ({
  motion: { div: (props: any) => React.createElement('div', props) },
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
}));

import { AdminOrdersPage, BULK_CANCEL_LABEL } from '../src/admin/pages/AdminOrdersPage';

const order = (overrides: Record<string, unknown>) =>
  ({
    id: 'ord_1',
    orderStatus: 'New',
    paymentStatus: 'Paid',
    fulfillment: 'delivery',
    store: { id: 'branch_a', name: 'A' },
    address: {},
    items: [],
    totals: {
      subtotal: 0,
      grandTotal: 100,
      tax: 0,
      deliveryCharge: 0,
      packagingCharge: 0,
      discount: 0,
    },
    payment: { method: 'online', label: 'Online' },
    petpoojaStatus: 'Pending',
    placedAt: new Date().toISOString(),
    timeline: [],
    ...overrides,
  }) as any;

function page(tab: 'live' | 'history' = 'history') {
  h.stateIndex = 0;
  return (AdminOrdersPage as any)({ defaultTab: tab });
}

function findAll<T = any>(
  node: ReactNode,
  predicate: (element: ReactElement<any>) => boolean,
  out: ReactElement<any>[] = [],
): ReactElement<any>[] {
  for (const child of React.Children.toArray(node)) {
    if (!React.isValidElement<any>(child)) continue;
    if (predicate(child)) out.push(child);
    findAll(child.props.children as ReactNode, predicate, out);
  }
  return out;
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement<any>(node)) return '';
  const kids = node.props.children as ReactNode;
  return React.Children.toArray(kids)
    .map((child) => textOf(child))
    .join(' ');
}

/** The ResponsiveTable element the history branch renders. */
function findTable(tree: ReactNode): ReactElement<any> {
  const table = findAll(tree, (el) => Array.isArray(el.props?.bulkActions))[0];
  expect(table, 'history table must render').toBeTruthy();
  return table;
}

describe('AdminOrdersPage — bulk cancel is honest and gated (F1)', () => {
  beforeEach(() => {
    h.states = [];
    h.stateIndex = 0;
    h.cleanups = [];
    vi.clearAllMocks();
    h.getHistory.mockResolvedValue([]);
    h.listenLiveOrders.mockReturnValue(() => undefined);
  });

  it('stages the cancel behind a confirmation and never calls the refund API', async () => {
    const view = page();
    const table = findTable(view);

    const cancel = table.props.bulkActions.find(
      (action: { label: string }) => action.label === BULK_CANCEL_LABEL,
    );
    expect(cancel, 'bulk action must be labelled as a cancel with no refund').toBeTruthy();
    expect(
      table.props.bulkActions.map((a: { label: string }) => a.label),
      'the old "Force Refund/Cancel" claim must be gone',
    ).toEqual(['Bulk Accept Incoming', BULK_CANCEL_LABEL]);

    // Selecting (incl. a settled order that must be skipped) only opens the
    // confirmation — nothing is written yet.
    cancel.onClick([
      order({ id: 'ord_paid', orderStatus: 'New', paymentStatus: 'Paid' }),
      order({ id: 'ord_done', orderStatus: 'Completed' }),
    ]);
    expect(h.updates).not.toHaveBeenCalled();
    expect(h.releaseRefund).not.toHaveBeenCalled();

    const rerendered = page();
    const dialogs = findAll(rerendered, (el) => el.props?.confirmLabel === 'Cancel orders — no refund');
    expect(dialogs).toHaveLength(1);
    const dialog = dialogs[0];
    expect(dialog.props.description).toMatch(/no refund is issued/i);
    expect(dialog.props.description).toMatch(/already PAID/i);
    expect(dialog.props.description).toMatch(/money is NOT moved/i);
    expect(dialog.props.isDestructive).toBe(true);

    await dialog.props.onConfirm();

    // Only the cancellable order was written; still no refund call.
    expect(h.updates).toHaveBeenCalledTimes(1);
    expect(h.updates).toHaveBeenCalledWith(
      'ord_paid',
      'Cancelled',
      expect.objectContaining({ actor: 'Bulk Operations Panel' }),
    );
    expect(h.releaseRefund).not.toHaveBeenCalled();
    expect(h.toastSuccess).toHaveBeenCalledWith(
      '1 order cancelled — no refund was issued.',
    );
  });

  it('does nothing (and says so) when every selected order is already settled', () => {
    const cancel = findTable(page()).props.bulkActions.find(
      (action: { label: string }) => action.label === BULK_CANCEL_LABEL,
    );

    cancel.onClick([order({ orderStatus: 'Completed' }), order({ orderStatus: 'Cancelled' })]);

    expect(h.updates).not.toHaveBeenCalled();
    expect(h.releaseRefund).not.toHaveBeenCalled();
    expect(h.toastInfo).toHaveBeenCalledWith(
      'Nothing to cancel — selected orders are already settled.',
    );
  });
});

describe('AdminOrdersPage — POS state is not fabricated locally (F2)', () => {
  beforeEach(() => {
    h.states = [];
    h.stateIndex = 0;
    h.cleanups = [];
    vi.clearAllMocks();
    h.getHistory.mockResolvedValue([]);
    h.listenLiveOrders.mockReturnValue(() => undefined);
  });

  it('has no "Bypass POS" control and never writes petpoojaStatus locally', () => {
    const table = findTable(page());
    // Open the order drawer so the Petpooja panel is part of the tree.
    table.props.onRowClick(order({ id: 'ord_drawer' }));

    const markup = textOf(page());
    expect(markup).not.toContain('Bypass POS');
    expect(markup).toContain('POS sync state is written by the server only.');

    const source = readFileSync(
      new URL('../src/admin/pages/AdminOrdersPage.tsx', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/petpoojaStatus:\s*["']Bypassed["']/);
    expect(source).not.toMatch(/Bypass POS/);
  });
});

describe('AdminOrdersPage — 409 conflicts refresh, never "unchanged" (F11)', () => {
  beforeEach(() => {
    h.states = [];
    h.stateIndex = 0;
    h.assignedStoreIds = ['branch_a'];
    h.cleanups = [];
    vi.clearAllMocks();
    h.getHistory.mockResolvedValue([]);
    h.listenLiveOrders.mockReturnValue(() => undefined);
  });

  it('reports that another terminal moved the order and resubscribes', async () => {
    page('live');
    // Deliver one live ticket, then re-render so the kanban card exists.
    h.listenLiveOrders.mock.calls.at(-1)![1]([order({ id: 'ord_race', orderStatus: 'Accepted' })]);
    const tree = page('live');

    const prepare = findAll(
      tree,
      (el) => el.type === 'button' && textOf(el).includes('Prepare'),
    )[0];
    expect(prepare, 'Accepted card must offer Prepare').toBeTruthy();

    h.updates.mockRejectedValueOnce(Object.assign(new Error('CONFLICT'), { status: 409 }));
    const callsBefore = h.listenLiveOrders.mock.calls.length;
    prepare.props.onClick({ stopPropagation: () => undefined });
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(h.toastError).toHaveBeenCalledWith(
      'Another terminal already moved this order — refreshing',
      expect.objectContaining({ description: expect.stringMatching(/not applied/i) }),
    );
    expect(h.toastError).not.toHaveBeenCalledWith(
      'Status update failed — order unchanged',
      expect.anything(),
    );

    // The conflict bumps streamEpoch → effect resubscribes.
    page('live');
    expect(h.listenLiveOrders.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});

describe('AdminOrdersPage — scope truth (F6/F8)', () => {
  beforeEach(() => {
    h.states = [];
    h.stateIndex = 0;
    h.assignedStoreIds = ['branch_a', 'branch_b'];
    h.cleanups = [];
    vi.clearAllMocks();
    h.getHistory.mockResolvedValue([]);
    h.listenLiveOrders.mockReturnValue(() => undefined);
  });

  it('renders the truncation notice when the assigned scope exceeds the in cap (F6)', () => {
    h.assignedStoreIds = Array.from({ length: 12 }, (_, i) => `branch_${i}`);
    const markup = textOf(page('live'));
    expect(markup).toContain('first 10 of 12 assigned outlets');
    expect(markup).toMatch(/narrow the outlet filter/i);
  });

  it('reads the full assigned scope and lets the outlet filter narrow within it', () => {
    page('live');
    // F8: two outlets → the read is the whole scope (null = all assigned), not
    // the first branch id.
    expect(h.listenLiveOrders).toHaveBeenLastCalledWith(
      null,
      expect.any(Function),
      expect.any(Function),
    );

    const selects = findAll(page('live'), (el) => el.type === 'select');
    const storeSelect = selects.find((el) => textOf(el).includes('ALL STORES OUTLETS'));
    expect(storeSelect).toBeTruthy();
    storeSelect!.props.onChange({ target: { value: 'branch_b' } });

    // Re-render so the listener effect re-runs with the narrowed filter.
    page('live');

    // The filter narrows inside the assigned scope.
    expect(h.listenLiveOrders).toHaveBeenLastCalledWith(
      'branch_b',
      expect.any(Function),
      expect.any(Function),
    );
  });
});
