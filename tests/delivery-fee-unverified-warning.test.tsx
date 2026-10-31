/**
 * `deliveryFeeUnverified` is written by the backend on a cash delivery order
 * whose courier quote could not be verified. Staff must see it on the kitchen
 * wall and the order detail before collecting cash — otherwise a 0/estimated
 * delivery fee is silently collected. Display-only: this must not change any
 * order logic.
 */
import { type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { Order } from '@/types';

import { DeliveryFeeUnverifiedWarning } from '@/features/orders/components/DeliveryFeeUnverifiedWarning';
import { KDSOrderCard } from '@/features/kds/components/KDSOrderCard';
import { normalizeOrderDoc } from '@/utils/orderContract';

const WARNING_TEXT = 'Delivery fee not verified. Confirm the amount before collecting cash.';

function kdsOrder(over: Partial<Order> = {}): Order {
  return {
    id: 'ord_cash_fee',
    customerName: 'Aarav Patel',
    orderType: 'delivery',
    status: 'pending',
    items: [{ itemId: 'itm_1', name: 'Smoky BBQ Burger', quantity: 1, price: 219 }],
    createdAt: { toDate: () => new Date('2026-10-20T12:00:00Z') },
    ...over,
  } as unknown as Order;
}

function renderCard(order: Order): string {
  const tree = (KDSOrderCard as unknown as (props: any) => any)({
    order,
    checkedItems: {},
    onToggleItemCheck: vi.fn(),
    onBumpOrder: vi.fn(),
  });
  // Static render expands child components (the warning banner), which plain
  // tree traversal cannot — element children are undefined until render.
  return renderToStaticMarkup(tree as ReactElement);
}

describe('DeliveryFeeUnverifiedWarning', () => {
  it('shows the warning when the backend flag is true', () => {
    const html = renderToStaticMarkup(
      <DeliveryFeeUnverifiedWarning order={{ deliveryFeeUnverified: true }} />
    );
    expect(html).toContain(WARNING_TEXT);
    // Not colour alone: the banner is text plus an alert role/icon.
    expect(html).toContain('role="alert"');
  });

  it('shows nothing when the flag is absent or false', () => {
    expect(
      renderToStaticMarkup(<DeliveryFeeUnverifiedWarning order={{}} />)
    ).toBe('');
    expect(
      renderToStaticMarkup(
        <DeliveryFeeUnverifiedWarning order={{ deliveryFeeUnverified: false }} />
      )
    ).toBe('');
  });
});

describe('KDS order card + order detail surface the unverified delivery fee', () => {
  it('normalizes the backend flag verbatim and never invents it', () => {
    const flagged = normalizeOrderDoc('ord_fee_1', {
      status: 'pending',
      items: [],
      deliveryFeeUnverified: true,
    });
    expect(flagged.deliveryFeeUnverified).toBe(true);

    const unset = normalizeOrderDoc('ord_fee_2', { status: 'pending', items: [] });
    expect(unset.deliveryFeeUnverified).toBeUndefined();
  });

  it('KDS card shows the warning only for an unverified-fee order', () => {
    expect(renderCard(kdsOrder({ deliveryFeeUnverified: true }))).toContain(WARNING_TEXT);
    expect(renderCard(kdsOrder())).not.toContain(WARNING_TEXT);
    expect(
      renderCard(kdsOrder({ deliveryFeeUnverified: false }))
    ).not.toContain(WARNING_TEXT);
  });

  it('OrderDetailPage renders the same warning component', () => {
    // The page's data hook cannot be mounted in a node harness, so this pins
    // the render site structurally, in the same style as the other page pins.
    const source = readFileSync(
      new URL('../src/pages/OrderDetailPage.tsx', import.meta.url),
      'utf8'
    );
    expect(source).toMatch(/DeliveryFeeUnverifiedWarning/);
    expect(source).toMatch(/<DeliveryFeeUnverifiedWarning\s+order=\{order\}/);
  });
});
