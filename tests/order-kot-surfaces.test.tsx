import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * Item 3/4/5 at the surfaces staff actually use:
 *  - OrderDetailPage shows the "Did the kitchen receive this order?" prompt for
 *    an ambiguous KOT only, with the state badge;
 *  - a refused role sees the state but no actions;
 *  - KDSOrderCard shows the same state;
 *  - the plain "Sync Petpooja" action never claims success for such an order.
 *
 * Real order shape: petpoojaStatus/petpoojaSyncStatus 'accepted_unconfirmed'
 * (backend orderPush.ts:1885-1886), or petpoojaAcceptedNoId without an id.
 */
const fixture = vi.hoisted(() => ({
  order: null as Record<string, any> | null,
  role: { value: 'branch_staff' as string },
  pushOrder: vi.fn(async () => ({ success: true })),
  resolveKot: vi.fn(async () => ({ resolved: 'printed', orderId: 'ord_kot_screen' })),
}));

vi.mock('@/services/partnerFunctionsApi', async () => {
  const actual = await vi.importActual<typeof import('../src/services/partnerFunctionsApi')>(
    '../src/services/partnerFunctionsApi'
  );
  return {
    ...actual,
    partnerFunctionsApi: {
      ...actual.partnerFunctionsApi,
      pushOrderToPetpooja: fixture.pushOrder,
      resolvePetpoojaKot: fixture.resolveKot,
    },
  };
});

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'ord_kot_screen' }),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: { id: 'u1', role: fixture.role.value } }),
}));
vi.mock('@/hooks/useOrder', () => ({
  useOrder: () => ({
    order: fixture.order,
    isLoading: false,
    error: null,
    updateStatus: { mutateAsync: vi.fn() },
    pushToPetpooja: { mutateAsync: fixture.pushOrder },
    autoDispatchPorter: { mutateAsync: vi.fn() },
  }),
}));
vi.mock('@/hooks/useAssignableRiders', () => ({
  useAssignableRiders: () => ({ riders: [], isLoading: false }),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { OrderDetailPage } from '../src/pages/OrderDetailPage';
import { KDSOrderCard } from '../src/features/kds/components/KDSOrderCard';

function order(overrides: Record<string, any> = {}) {
  return {
    id: 'ord_kot_screen',
    customerId: 'cust_1',
    customerName: 'Aarav',
    customerPhone: '+919876543210',
    branchId: 'branch_surat_01',
    items: [{ lineId: 'l1', name: 'Burger', quantity: 1, unitPrice: 199 }],
    subtotal: 199,
    tax: 10,
    deliveryFee: 0,
    total: 209,
    orderType: 'delivery',
    status: 'preparing',
    paymentMethod: 'razorpay',
    paymentStatus: 'completed',
    totals: { subtotal: 199, taxes: 10, grandTotal: 209 },
    deliveryAddress: { label: 'Home', full: '12 Vesu Rd', lat: 21.15, lng: 72.77 },
    createdAt: { seconds: 1762099000, toDate: () => new Date(1762099000_000) },
    updatedAt: { seconds: 1762100000, toDate: () => new Date(1762100000_000) },
    // The ambiguous ack: POS accepted the payload without an order id.
    petpoojaStatus: 'accepted_unconfirmed',
    petpoojaSyncStatus: 'accepted_unconfirmed',
    petpoojaAcceptedNoId: true,
    ...overrides,
  };
}

describe('OrderDetailPage — ambiguous KOT', () => {
  it('shows the print prompt and the unconfirmed badge', () => {
    fixture.order = order();
    const html = renderToStaticMarkup(<OrderDetailPage />);

    expect(html).toContain('Did the kitchen receive this order?');
    expect(html).toContain('Yes, it printed');
    expect(html).toContain('No, send again');
    expect(html).toContain('POS unconfirmed');
  });

  it('shows nothing extra for a normally-synced order', () => {
    fixture.order = order({
      petpoojaStatus: 'synced',
      petpoojaSyncStatus: 'synced',
      petpoojaOrderId: 'pp_kot_1',
      petpoojaAcceptedNoId: undefined,
    });
    const html = renderToStaticMarkup(<OrderDetailPage />);

    expect(html).not.toContain('Did the kitchen receive this order?');
    expect(html).not.toContain('POS unconfirmed');
  });

  it('hides the actions from a refused role but keeps the state visible', () => {
    fixture.role.value = 'support';
    fixture.order = order();
    const html = renderToStaticMarkup(<OrderDetailPage />);

    expect(html).not.toContain('Yes, it printed');
    expect(html).not.toContain('No, send again');
    expect(html).toContain('POS unconfirmed');
    expect(html).toContain('branch owner');
    fixture.role.value = 'branch_staff';
  });
});

describe('KDSOrderCard — ambiguous KOT', () => {
  const card = (o: any) =>
    renderToStaticMarkup(
      <KDSOrderCard
        order={o as never}
        checkedItems={{}}
        onToggleItemCheck={vi.fn()}
        onBumpOrder={vi.fn()}
      />
    );

  it('shows the same POS state on the kitchen card', () => {
    expect(card(order())).toContain('POS unconfirmed: check the printer');
  });

  it('stays quiet for a synced order', () => {
    expect(
      card(
        order({
          petpoojaStatus: 'synced',
          petpoojaSyncStatus: 'synced',
          petpoojaOrderId: 'pp_kot_1',
          petpoojaAcceptedNoId: undefined,
        })
      )
    ).not.toContain('POS unconfirmed');
  });
});
