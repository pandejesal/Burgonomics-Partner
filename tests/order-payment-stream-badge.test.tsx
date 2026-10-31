/**
 * Owner decision 1 Nov 2026: each order shows which money stream it belongs to.
 * Only the server-stamped `paymentChannel === "razorpay"` is Razorpay; a
 * walk-in / COD order is Cash; an online order without the marker is Unpaid
 * (it earns nothing).
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { Order } from '@/types';
import { OrderTableList } from '@/features/orders/components/OrderTableList';
import { OrderFiltersBar } from '@/features/orders/components/OrderFiltersBar';

const order = (over: Partial<Order> = {}): Order =>
  ({
    id: 'ord_1',
    customerName: 'Aarav Patel',
    customerPhone: '+91 90000 00000',
    branchId: 'branch_surat_01',
    items: [{ itemId: 'i1', name: 'Burger', quantity: 1, price: 199 }],
    subtotal: 199,
    tax: 9,
    deliveryFee: 0,
    total: 199,
    orderType: 'takeaway',
    status: 'delivered',
    paymentMethod: 'cod',
    paymentStatus: 'completed',
    createdAt: { toDate: () => new Date('2026-11-01T10:00:00Z') },
    updatedAt: { toDate: () => new Date('2026-11-01T10:00:00Z') },
    ...over,
  }) as Order;

const renderTable = (orders: Order[]) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <OrderTableList orders={orders} />
    </MemoryRouter>
  );

describe('OrderTableList — payment stream badge', () => {
  it('labels each order Razorpay, Cash, or Unpaid from the server marker', () => {
    const html = renderTable([
      order({ id: 'ord_rzp', paymentChannel: 'razorpay', paymentMethod: 'razorpay' }),
      order({ id: 'ord_cash', customerId: 'cust_walkin', paymentMethod: 'razorpay' }),
      order({ id: 'ord_unpaid', paymentMethod: 'razorpay', paymentStatus: 'completed' }),
    ]);

    expect(html).toContain('Razorpay');
    expect(html).toContain('Cash');
    expect(html).toContain('Unpaid');
    expect(html).toContain('data-payment-stream="razorpay"');
    expect(html).toContain('data-payment-stream="cash"');
    expect(html).toContain('data-payment-stream="unpaid"');
  });
});

describe('OrderFiltersBar — payment stream filter', () => {
  it('offers the three stream options next to the existing filters', () => {
    const html = renderToStaticMarkup(
      <OrderFiltersBar
        channelFilter="all"
        onChannelChange={() => {}}
        statusFilter="all"
        onStatusChange={() => {}}
        dateRange="all"
        onDateRangeChange={() => {}}
        searchQuery=""
        onSearchChange={() => {}}
        onOpenCreateModal={() => {}}
        totalCount={3}
        filteredCount={3}
        paymentFilter="all"
        onPaymentChange={() => {}}
      />
    );

    expect(html).toContain('All Payments');
    expect(html).toContain('Razorpay');
    expect(html).toContain('Cash &amp; counter');
    expect(html).toContain('Unpaid');
  });
});
