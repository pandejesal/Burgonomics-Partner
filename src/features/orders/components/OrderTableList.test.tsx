/**
 * Live UI findings 10 and 11 (partner, 1024px and 1400px).
 *
 * Finding 10: every Live Orders row rendered `#ORD_17` and every row action's
 * aria-label read "View full details for order ORD_17" — rows were
 * indistinguishable on screen and to a screen reader.
 *
 * Finding 11: at 1024px the table was ~994px inside a ~718px wrapper with no
 * scroll affordance, so STATUS and ACTIONS sat off-screen and a kitchen
 * operator could neither see status nor reach an action.
 */
/** @vitest-environment jsdom */
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { Order } from '@/types';

vi.mock('@/utils/analyticsMath', () => ({
  orderPaymentChannel: (o: { paymentMethod?: string }) => o.paymentMethod || 'online',
}));

import { OrderTableList } from './OrderTableList';

const order = (over: Partial<Order> & { shortCode?: string; orderNumber?: string } = {}): Order =>
  ({
    id: 'ord_1793721600000_l29btj',
    customerName: 'Fixture Customer',
    customerPhone: '+910000000000',
    orderType: 'delivery',
    status: 'preparing',
    paymentStatus: 'paid',
    paymentMethod: 'online',
    createdAt: new Date('2026-11-03T21:30:00+05:30'),
    items: [{ name: 'Jr. Hero Burger', quantity: 2, price: 129 }],
    total: 258,
    ...over,
  }) as unknown as Order;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(orders: Order[]) {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <OrderTableList orders={orders} onPrintKot={() => {}} />
      </MemoryRouter>,
    );
  });
  await act(async () => {});
}

/** Row order references as rendered (the `#…#` span in the first cell). */
function renderedRefs(): string[] {
  return Array.from(container.querySelectorAll('tbody tr')).map(
    (row) => row.querySelector('td span.block')?.textContent ?? '',
  );
}

describe('partner Live Orders identity', () => {
  it('renders a DIFFERENT reference for each order', async () => {
    await render([
      order({ id: 'ord_1793721600000_l29btj', shortCode: undefined }),
      order({ id: 'ord_1793721600000_OlxLGP', shortCode: undefined }),
      order({ id: 'ord_1793721600000_PHwicU', shortCode: undefined }),
    ]);

    const refs = renderedRefs();
    expect(refs).toHaveLength(3);
    expect(new Set(refs).size).toBe(3);
    // The defect value was identical on every row.
    expect(refs).not.toContain('#ORD_17');
  });

  it('prefers the server shortCode when the order carries one', async () => {
    await render([
      order({ id: 'ord_1', shortCode: 'BG-L29BTJ' }),
      order({ id: 'ord_2', shortCode: 'BG-ABCDEF' }),
    ]);
    expect(renderedRefs()).toEqual(['#BG-L29BTJ', '#BG-ABCDEF']);
  });

  it('gives every row action a DISTINCT accessible name', async () => {
    await render([
      order({ id: 'ord_1793721600000_l29btj', shortCode: undefined }),
      order({ id: 'ord_1793721600000_OlxLGP', shortCode: undefined }),
    ]);

    const labels = Array.from(container.querySelectorAll('[aria-label]')).map(
      (el) => el.getAttribute('aria-label') ?? '',
    );
    const detailLabels = labels.filter((l) => l.startsWith('View full details'));

    expect(detailLabels).toHaveLength(2);
    expect(new Set(detailLabels).size).toBe(2);
    expect(detailLabels.join(' ')).not.toMatch(/ORD_17\b/);
  });
});

describe('partner Live Orders narrow-layout reachability', () => {
  it('exposes the table as a labelled, focusable scroll region', async () => {
    await render([order()]);

    const region = container.querySelector('[data-testid="orders-table-scroll-region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('role')).toBe('region');
    expect(region?.getAttribute('aria-label')).toMatch(/scrollable horizontally/i);
    // WCAG 2.1.1: a scrollable region must be keyboard reachable.
    expect(region?.getAttribute('tabindex')).toBe('0');
  });

  it('tells the operator the table scrolls to Status and Actions', async () => {
    await render([order()]);
    expect(container.textContent).toMatch(/Scroll the table sideways/i);
    expect(container.textContent).toMatch(/Actions stay pinned/i);
  });

  it('keeps the identity and actions columns pinned', async () => {
    await render([order()]);

    const headerCells = Array.from(container.querySelectorAll('thead th'));
    expect(headerCells[0].className).toMatch(/sticky/);
    expect(headerCells[0].className).toMatch(/left-0/);
    expect(headerCells[headerCells.length - 1].className).toMatch(/sticky/);
    expect(headerCells[headerCells.length - 1].className).toMatch(/right-0/);

    const firstBodyCell = container.querySelector('tbody tr td');
    const lastBodyCell = container.querySelector('tbody tr td:last-child');
    expect(firstBodyCell?.className).toMatch(/sticky/);
    expect(lastBodyCell?.className).toMatch(/sticky/);
  });

  it('gives the table a min width so columns cannot collapse into each other', async () => {
    await render([order()]);
    expect(container.querySelector('table')?.className).toMatch(/min-w-/);
  });
});
