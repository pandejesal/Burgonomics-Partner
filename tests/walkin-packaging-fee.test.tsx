/**
 * Walk-in packaging now comes from the server. While it loads or after it
 * fails, Create is disabled and no fee/total is invented; the failure shows a
 * clear error with Retry. The staff "razorpay" tender is relabelled so nobody
 * is told a gateway took the payment.
 */
import React, { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const reactState = vi.hoisted(() => ({ index: 0, overrides: new Map<number, unknown>() }));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const hookIndex = reactState.index;
      reactState.index += 1;
      const value = reactState.overrides.has(hookIndex)
        ? reactState.overrides.get(hookIndex)
        : initial;
      return [value, vi.fn()];
    },
    useEffect: vi.fn(),
  };
});

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 'uid_counter_1', role: 'branch_staff', branchIds: ['branch_surat_01'] },
  }),
}));
vi.mock('@/stores/appStore', () => ({
  useAppStore: () => ({ selectedBranchId: 'branch_surat_01' }),
}));
vi.mock('@/config/firebase', () => ({ db: {}, auth: { currentUser: null } }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({ id: 'ord_pos_test' }),
  getDoc: vi.fn(async () => ({ exists: () => false })),
  setDoc: vi.fn(async () => undefined),
  Timestamp: { now: () => ({ _ts: 'now' }) },
}));
vi.mock('@/features/orders/utils/walkInOrder', () => ({
  WALK_IN_CUSTOMER_ID: 'cust_walkin',
  generateWalkInOrderId: () => 'ord_pos_test_000001',
  createOrderDocIfAbsent: async () => undefined,
}));

const packagingState = vi.hoisted(() => ({
  packagingFee: 20 as number | null,
  isLoading: false,
  error: null as string | null,
  retry: vi.fn(),
}));

vi.mock('@/features/orders/hooks/useWalkInPackagingFee', () => ({
  useWalkInPackagingFee: () => packagingState,
}));

import { ManualOrderCreateModal } from '@/features/orders/components/ManualOrderCreateModal';

function flattenText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((child) => flattenText(child)).join(' ');
  if (isValidElement<{ children?: ReactNode }>(node)) return flattenText(node.props.children);
  return '';
}

function findButton(node: ReactNode, text: string): any {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findButton(child, text);
      if (hit) return hit;
    }
    return undefined;
  }
  if (!isValidElement<{ children?: ReactNode; onClick?: () => unknown }>(node)) return undefined;
  if (node.type === 'button' && flattenText(node.props.children).includes(text)) return node;
  return findButton(node.props.children, text);
}

function render(overrides?: Map<number, unknown>): any {
  reactState.index = 0;
  reactState.overrides.clear();
  overrides?.forEach((value, key) => reactState.overrides.set(key, value));
  return (ManualOrderCreateModal as unknown as (props: any) => any)({
    isOpen: true,
    onClose: vi.fn(),
  });
}

beforeEach(() => {
  packagingState.packagingFee = 20;
  packagingState.isLoading = false;
  packagingState.error = null;
  packagingState.retry = vi.fn();
});

describe('ManualOrderCreateModal — server packaging fee', () => {
  it('uses the server fee in the total instead of a hard-coded 15', () => {
    const html = renderToStaticMarkup(render() as ReactElement);
    // 298 subtotal + 20 server packaging.
    expect(html).toContain('₹318');
    expect(html).toContain('₹20');
    expect(html).not.toContain('₹313');
  });

  it('disables Create while the fee is loading', () => {
    packagingState.packagingFee = null;
    packagingState.isLoading = true;
    const tree = render();
    const html = renderToStaticMarkup(tree as ReactElement);
    expect(html).toContain('Loading from server');
    const submit = findButton(tree, 'Place & Print KOT');
    expect(submit).toBeTruthy();
    expect(submit.props.disabled).toBe(true);
  });

  it('shows a clear error with Retry and keeps Create disabled on failure', () => {
    packagingState.packagingFee = null;
    packagingState.error = 'Could not load the packaging fee (server 500). Retry — no fee has been assumed.';
    const tree = render();
    const html = renderToStaticMarkup(tree as ReactElement);
    expect(html).toContain('Could not load the packaging fee');
    expect(html).toContain('role="alert"');
    const retry = findButton(tree, 'Retry packaging fee');
    expect(retry).toBeTruthy();
    retry.props.onClick();
    expect(packagingState.retry).toHaveBeenCalledTimes(1);
    expect(findButton(tree, 'Place & Print KOT').props.disabled).toBe(true);
  });

  it('relabels the staff-selected "razorpay" tender as Card/UPI at counter', () => {
    const html = renderToStaticMarkup(render() as ReactElement);
    expect(html).toContain('Card/UPI at counter');
    expect(html).not.toContain('Card Machine');
  });

  it('keeps walk-in delivery priced and enabled (takeaway packaging, no courier fee)', () => {
    // useState index 0 is orderType.
    const tree = render(new Map([[0, 'delivery']]));
    const html = renderToStaticMarkup(tree as ReactElement);
    expect(html).toContain('₹318');
    expect(findButton(tree, 'Place & Print KOT').props.disabled).toBe(false);
  });
});
