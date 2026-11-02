import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * Item 12, the card half: with no reachable number the rider-call affordance
 * must be ABSENT, not a `tel:` link to "".
 *
 * The stored shape before a booking is an empty-string customerPhone (the
 * backend writes it at booking, a54c206), and normalizeOrderDoc keeps no phone
 * when every source is blank — so the card sees ''.
 */
vi.mock('@/services/partnerFunctionsApi', async () => {
  const actual = await vi.importActual<typeof import('../src/services/partnerFunctionsApi')>(
    '../src/services/partnerFunctionsApi'
  );
  return { ...actual };
});
vi.mock('@/utils/kdsAudio', () => ({ playKDSChime: vi.fn() }));

import { PorterDispatchCard } from '../src/features/delivery/components/PorterDispatchCard';
import { normalizeOrderDoc } from '../src/utils/orderContract';

function card(order: any) {
  return renderToStaticMarkup(
    <PorterDispatchCard
      order={order}
      onFetchQuote={vi.fn()}
      onDispatchPorter={vi.fn()}
      onOpenAssignModal={vi.fn()}
      onCancelPorter={vi.fn()}
    />
  );
}

function rawOrder(customerPhone: string, contactPhone: string) {
  return normalizeOrderDoc('ord_12_card', {
    id: 'ord_12_card',
    customerId: 'cust_1',
    customerName: 'Aarav',
    customerPhone,
    branchId: 'branch_surat_01',
    items: [{ id: 'p1', name: 'Burger', price: 200, quantity: 1 }],
    subtotal: 200,
    tax: 10,
    deliveryFee: 30,
    total: 240,
    orderType: 'delivery',
    status: 'ready',
    paymentMethod: 'razorpay',
    paymentStatus: 'completed',
    deliveryAddress: {
      label: 'Home',
      full: '12 Vesu Rd, Surat',
      lat: 21.15,
      lng: 72.77,
      contactName: 'Aarav',
      contactPhone,
    },
    createdAt: { seconds: 1762099000, toDate: () => new Date(1762099000_000) },
    updatedAt: { seconds: 1762100000, toDate: () => new Date(1762100000_000) },
  } as any);
}

describe('rider call action with no known number', () => {
  it('renders no tel: link and says the number is not known yet', () => {
    const html = card(rawOrder('', ''));

    expect(html).not.toContain('tel:');
    expect(html).toContain('No customer number yet');
  });

  it('renders a real tel: link once the delivery address carries a number', () => {
    const html = card(rawOrder('', '+919876543210'));

    expect(html).toContain('tel:+919876543210');
    expect(html).not.toContain('No customer number yet');
  });
});
