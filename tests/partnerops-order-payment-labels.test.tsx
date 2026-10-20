/**
 * P3-P — OrderTableList payment column truth (committed HEAD e69f211; this
 * source is CLEAN in the working tree — verified via git diff).
 *
 * LIVE pins: the payment states the component handles honestly —
 * `paymentStatus: 'completed'` → "Paid ✓" (emerald), `pending` → "Pending"
 * (amber), failed → "Failed" (rose — label fix has LANDED, no skip), and the
 * method labels cod→Cash / upi→UPI QR / razorpay→Card.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Order } from '@/types';

import { OrderTableList } from '@/features/orders/components/OrderTableList';

function order(over: {
  id: string;
  paymentMethod: string;
  paymentStatus: string;
}): Order {
  return {
    id: over.id,
    customerName: 'Aarav Patel',
    customerPhone: '+919876543210',
    // Regression note: these two fields are load-bearing for the payment
    // column — with them missing the component sees `undefined` and falls
    // into the generic 'Card'/'Pending' branch for every order.
    paymentMethod: over.paymentMethod,
    paymentStatus: over.paymentStatus,
    items: [{ itemId: 'itm_1', name: 'Smoky BBQ Burger', quantity: 1, price: 219 }],
    subtotal: 219,
    tax: 11,
    deliveryFee: 30,
    total: 260,
    orderType: 'takeaway',
    status: 'ready',
    createdAt: { toDate: () => new Date('2026-10-20T12:00:00Z') },
  } as unknown as Order;
}

function renderList(orders: Order[]): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/orders']}>
      <OrderTableList orders={orders} />
    </MemoryRouter>
  );
}

describe('OrderTableList — payment column (states the component handles honestly)', () => {
  it("renders a completed payment as 'Paid ✓' in emerald", () => {
    const html = renderList([
      order({ id: 'ord_paid_1', paymentMethod: 'upi', paymentStatus: 'completed' }),
    ]);

    expect(html).toContain('UPI QR'); // method label for cashless tender
    expect(html).toContain('Paid ✓');
    expect(html).toContain('text-emerald-400');
  });

  it("keeps uncovered states at 'Pending' in amber and labels cash/card methods", () => {
    const html = renderList([
      order({ id: 'ord_cash_1', paymentMethod: 'cod', paymentStatus: 'pending' }),
      order({ id: 'ord_card_1', paymentMethod: 'razorpay', paymentStatus: 'pending' }),
    ]);

    expect(html).toContain('Cash'); // cod label
    expect(html).toContain('Card'); // razorpay label
    expect(html).toContain('Pending');
    expect(html).toContain('text-amber-400');
  });
});

describe('OrderTableList — FAILED payment reads as Failed (label truth)', () => {
  // FIXED: failed payment renders label 'Failed' (OrderTableList.tsx:173).
  // The color mapping was already honest (rose); the label now matches it.
  it("renders a failed payment as 'Failed', never 'Pending'", () => {
    const html = renderList([
      order({ id: 'ord_fail_1', paymentMethod: 'razorpay', paymentStatus: 'failed' }),
    ]);

    expect(html).toContain('Failed');
    expect(html).toContain('text-rose-400');
    // Must NOT be rendered in the pending bucket:
    expect(html).not.toContain('Pending');
  });

  it('keeps pending payments in the pending bucket while failed reads Failed', () => {
    const html = renderList([
      order({ id: 'ord_pending_1', paymentMethod: 'cod', paymentStatus: 'pending' }),
      order({ id: 'ord_fail_2', paymentMethod: 'upi', paymentStatus: 'failed' }),
    ]);

    expect(html).toContain('Pending');
    expect(html).toContain('Failed');
  });
});
