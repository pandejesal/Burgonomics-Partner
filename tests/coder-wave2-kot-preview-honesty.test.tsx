/**
 * M6 — KOTPrintPreview: the slip must not claim Petpooja printed it, and a
 * missing clipboard must be reported instead of faking a "Copied" state.
 *
 * Node-env render harness (same pattern as
 * tests/partner-app-high-findings.test.tsx). Fails against the pre-fix source,
 * which stamps "Printed via Petpooja POS" and sets `copied` with no clipboard.
 */
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Order } from '@/types';

const reactState = vi.hoisted(() => ({
  index: 0,
  overrides: new Map<number, unknown>(),
  setters: [] as Array<(value: unknown) => void>,
}));

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

import { KOTPrintPreview } from '@/features/orders/components/KOTPrintPreview';
import { toast } from 'sonner';

const order = {
  id: 'ord_detail_8841',
  orderType: 'delivery',
  branchName: 'Surat Adajan',
  customerName: 'Aarav Patel',
  customerPhone: '+919876543210',
  items: [{ itemId: 'item_1', name: 'Double Truffle Melt', quantity: 2, price: 299 }],
  subtotal: 598,
  tax: 30,
  total: 628,
  createdAt: { toDate: () => new Date('2026-09-05T12:00:00+05:30') },
} as unknown as Order;

function flattenText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((child) => flattenText(child)).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return flattenText(node.props.children);
  return '';
}

function findButton(
  node: ReactNode,
  text: string
): ReactElement<{ onClick?: () => unknown }> | undefined {
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

describe('M6: KOT preview claims only what it does', () => {
  beforeEach(() => {
    reactState.index = 0;
    reactState.overrides.clear();
    reactState.setters.length = 0;
    vi.clearAllMocks();
    // No clipboard API (insecure context / unsupported browser).
    vi.stubGlobal('navigator', {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not stamp the slip with a POS that did not print it', () => {
    const html = renderToStaticMarkup(
      <KOTPrintPreview order={order} isOpen onClose={() => {}} />
    );

    expect(html).not.toContain('Petpooja');
    expect(html).toContain('Printed from Burgonomics Partner');
  });

  it('reports a missing clipboard instead of showing a fake "Copied"', () => {
    const tree = KOTPrintPreview({ order, isOpen: true, onClose: () => {} });
    const button = findButton(tree, 'Copy ASCII');
    expect(button).toBeDefined();

    button!.props.onClick?.();

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('Clipboard not available')
    );
    // `copied` is useState #1 in this component — it must never be set.
    expect(reactState.setters[1]).not.toHaveBeenCalled();
  });
});
