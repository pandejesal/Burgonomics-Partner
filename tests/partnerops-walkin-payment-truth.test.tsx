/**
 * P1-C — ManualOrderCreateModal walk-in payment truth (committed HEAD e69f211;
 * this source is CLEAN in the working tree — verified via git diff).
 *
 * LIVE pins: the committed modal offers Cash / UPI QR / Card Machine tender and
 * an explicit cash-received field; the cash calculator only shows for cash.
 *
 * EXPECTED-FAIL skips: every tender is stamped `paymentStatus: 'completed'`
 * (ManualOrderCreateModal.tsx:189) regardless of what the operator actually
 * collected. A walk-in whose UPI/card/cash tender was never confirmed must not
 * be recorded as paid. These are skipped because the honest behavior does not
 * exist yet; unskip them in the fix lane.
 */
import React, { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reactState = vi.hoisted(() => ({
  index: 0,
  overrides: new Map<number, unknown>(),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const hookIndex = reactState.index;
      reactState.index += 1;
      const setter = vi.fn();
      const value = reactState.overrides.has(hookIndex)
        ? reactState.overrides.get(hookIndex)
        : initial;
      return [value, setter];
    },
    useEffect: vi.fn(),
  };
});

const submitCaptured = vi.hoisted(() => ({ docs: [] as any[] }));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 'uid_counter_1', role: 'branch_staff', branchIds: ['branch_surat_01'] },
  }),
}));

vi.mock('@/stores/appStore', () => ({
  useAppStore: () => ({ selectedBranchId: 'branch_surat_01' }),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  auth: { currentUser: null },
}));

vi.mock('firebase/firestore', () => ({
  doc: () => ({ id: 'ord_pos_test' }),
  getDoc: vi.fn(async () => ({ exists: () => false })),
  setDoc: vi.fn(async () => undefined),
  Timestamp: { now: () => ({ _ts: 'now' }) },
}));

vi.mock('@/features/orders/utils/walkInOrder', () => ({
  WALK_IN_CUSTOMER_ID: 'cust_walkin',
  generateWalkInOrderId: () => 'ord_pos_t_e_s_t_000001',
  createOrderDocIfAbsent: async (_ref: unknown, data: any, probe?: any) => {
    submitCaptured.docs.push(data);
    if (probe?.get) await probe.get(_ref);
    if (probe?.set) await probe.set(_ref, data);
  },
}));

import { ManualOrderCreateModal } from '@/features/orders/components/ManualOrderCreateModal';

function flattenText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((child) => flattenText(child)).join('');
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

// useState call order in the modal: 0 orderType ... 6 paymentMethod ... 8 cashTendered
const PAYMENT_METHOD_STATE_INDEX = 6;

let lastTree: ReactNode | null = null;

/** Renders the committed modal in this file's node harness. */
function renderModal(overrides?: Map<number, unknown>): string {
  reactState.index = 0;
  reactState.overrides.clear();
  overrides?.forEach((value, key) => reactState.overrides.set(key, value));
  // Plain function call: a JSX element's props.children is undefined until
  // React renders it, so the mock-based hook stubs must back a direct call
  // to produce a concrete tree that findButton can traverse. The react mock
  // provides useState/useEffect, so this is safe outside a real render.
  lastTree = (ManualOrderCreateModal as unknown as (props: any) => any)({
    isOpen: true,
    onClose: vi.fn(),
  });
  return renderToStaticMarkup(lastTree as unknown as ReactElement);
}

function renderTree(overrides?: Map<number, unknown>): any {
  reactState.index = 0;
  reactState.overrides.clear();
  overrides?.forEach((value, key) => reactState.overrides.set(key, value));
  lastTree = (ManualOrderCreateModal as unknown as (props: any) => any)({
    isOpen: true,
    onClose: vi.fn(),
  });
  return lastTree;
}

/** Finds the <form onSubmit={...}> wrapper in the last rendered element tree. */
function findForm(node: ReactNode | null): any {
  if (!node) return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findForm(child);
      if (hit) return hit;
    }
    return undefined;
  }
  if (!isValidElement<{ children?: ReactNode; onSubmit?: unknown }>(node)) return undefined;
  if (node.type === 'form' && typeof node.props.onSubmit === 'function') return node;
  return findForm(node.props.children);
}

beforeEach(() => {
  submitCaptured.docs.length = 0;
});

afterEach(() => {
  reactState.overrides.clear();
});

describe('ManualOrderCreateModal — tender surface (committed behavior)', () => {
  it('offers Cash / UPI QR / Card Machine tender with an explicit cash-received field', () => {
    const html = renderModal();

    // All three tenders are offered from the committed source.
    expect(findButton(lastTree as ReactNode, 'Cash')).toBeTruthy();
    expect(findButton(lastTree as ReactNode, 'UPI QR')).toBeTruthy();
    expect(findButton(lastTree as ReactNode, 'Card Machine')).toBeTruthy();
    // Default cash tender shows the explicit cash-handling surface.
    expect(html).toContain('Cash Received (₹)');
    expect(html).toContain('Change to Return');
    // Default list: burger 199 + fries 99 = 298 subtotal, 15 tax, 15 packaging = 328.
    // '&' renders escaped in static markup.
    expect(html).toContain('Place &amp; Print KOT (₹328)');
  });

  it('hides the cash change calculator when UPI is the tender', () => {
    const html = renderModal(new Map([[PAYMENT_METHOD_STATE_INDEX, 'upi']]));

    expect(html).not.toContain('Cash Received (₹)');
    expect(html).not.toContain('Change to Return');
    expect(html).toContain('UPI QR');
    expect(html).toContain('bg-purple-700'); // UPI QR is the visually selected tender
  });
});

describe('ManualOrderCreateModal — walk-in payment TRUTH (HONEST BEHAVIOR DOES NOT EXIST YET)', () => {
  // EXPECTED FAIL: walk-in records unverified tender as completed - ManualOrderCreateModal.tsx:189
  // A UPI-tendered walk-in has no confirmed payment at create time; the order
  // doc must NOT claim `paymentStatus: 'completed'`.
  it.skip('creates a UPI walk-in with paymentStatus NOT completed before confirmation', async () => {
    const tree = renderTree(new Map([[PAYMENT_METHOD_STATE_INDEX, 'upi']]));
    const form = findForm(tree);
    expect(form).toBeTruthy();

    await form.props.onSubmit({ preventDefault: () => {} });

    expect(submitCaptured.docs).toHaveLength(1);
    const order = submitCaptured.docs[0];
    expect(order.paymentMethod).toBe('upi');
    // The truth assertion the current code violates (it hardcodes 'completed'):
    expect(order.paymentStatus).not.toBe('completed');
  });

  // EXPECTED FAIL: walk-in records unverified tender as completed - ManualOrderCreateModal.tsx:189
  // Cash without a recorded tendered amount must not be trusted as paid either.
  it.skip('creates a cash walk-in with no tendered amount as paymentStatus NOT completed', async () => {
    const tree = renderTree();
    const form = findForm(tree);
    expect(form).toBeTruthy();

    await form.props.onSubmit({ preventDefault: () => {} });

    expect(submitCaptured.docs).toHaveLength(1);
    const order = submitCaptured.docs[0];
    expect(order.paymentMethod).toBe('cod');
    expect(order.paymentStatus).not.toBe('completed');
  });
});
