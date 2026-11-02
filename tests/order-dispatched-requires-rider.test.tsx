import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * Item 11 (LIVE FINDING). At Ready, the partner order page offered
 * "ADVANCE TO DISPATCHED" on a delivery order with NO courier booking and NO
 * in-house rider. Pressing it really moved an order to OUT_FOR_DELIVERY and the
 * Delivery Queue then claimed "With assigned courier" while nothing was booked
 * — the customer was told the food was on the way with no rider.
 *
 * Server side is done (backend 15e839c): bumpStatus refuses that transition
 * with 409 DISPATCH_RIDER_REQUIRED. The client must not offer it and must
 * surface that code if it arrives anyway.
 *
 * Fields are the ones the server writes (orderStatus.ts hasLiveCourierBooking /
 * hasInHouseRider / isParkedForDispatchDecision).
 */
import {
  canAdvanceToDispatched,
  hasAssignedRider,
  hasLiveCourierBooking,
} from '../src/features/delivery/riderEvidence';
import { OrderStatusStepper } from '../src/features/orders/components/OrderStatusStepper';

/** A delivery order sitting at Ready with nothing assigned. */
function readyDeliveryOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ord_11_ready',
    customerId: 'cust_1',
    customerName: 'Aarav',
    customerPhone: '+919876543210',
    branchId: 'branch_surat_01',
    items: [],
    subtotal: 400,
    tax: 20,
    deliveryFee: 30,
    total: 450,
    orderType: 'delivery',
    status: 'ready',
    paymentMethod: 'razorpay',
    paymentStatus: 'completed',
    // The real "nothing assigned" shape: no booking, no rider, no park.
    deliveryStatus: 'ready',
    createdAt: { seconds: 1762099000 },
    updatedAt: { seconds: 1762100000 },
    ...overrides,
  } as any;
}

function renderStepper(order: any, isSubmitting = false) {
  return renderToStaticMarkup(
    <OrderStatusStepper
      currentStatus={order.status}
      orderType={order.orderType}
      isSubmitting={isSubmitting}
      onUpdateStatus={vi.fn()}
      order={order}
    />
  );
}

describe('a delivery order at Ready with no rider is not "advanceable" to dispatched', () => {
  it('accepts none of the non-evidence shapes', () => {
    const noEvidence = [
      {},
      { deliveryStatus: 'ready' },
      // A riderName alone is not evidence — webhooks leave stale names.
      { riderName: 'Ravi' },
      { riderPhone: '+919000000000' },
      // A provider name with no bound booking id is not a booking.
      { dispatchProvider: 'borzo', deliveryStatus: 'ready' },
      // A bound id without an active state or a provider is not a booking.
      { borzoOrderId: 'BZ-1', deliveryStatus: 'ready' },
    ];
    for (const shape of noEvidence) {
      expect(hasLiveCourierBooking(shape)).toBe(false);
      expect(hasAssignedRider(shape)).toBe(false);
      expect(canAdvanceToDispatched(readyDeliveryOrder(shape))).toBe(false);
    }
  });

  it('accepts a live courier booking and an in-house assignment', () => {
    expect(
      canAdvanceToDispatched(
        readyDeliveryOrder({ dispatchProvider: 'borzo', borzoOrderId: 'BZ-9', deliveryStatus: 'dispatched' })
      )
    ).toBe(true);
    expect(
      canAdvanceToDispatched(
        readyDeliveryOrder({
          dispatchProvider: 'shadowfax',
          shadowfaxOrderId: 'SF-9',
          dispatchStatus: 'dispatched',
        })
      )
    ).toBe(true);
    // /orders/manualDispatch writes exactly this.
    expect(
      canAdvanceToDispatched(
        readyDeliveryOrder({ dispatchType: 'manual_branch_terminal', deliveryStatus: 'dispatched' })
      )
    ).toBe(true);
  });

  it('does not count a released or still-unconfirmed cancellation as a rider', () => {
    expect(
      hasLiveCourierBooking({
        dispatchProvider: 'borzo',
        borzoOrderId: 'BZ-1',
        deliveryStatus: 'dispatched',
        dispatchProviderCancel: 'manual-required',
      })
    ).toBe(false);
    expect(
      hasLiveCourierBooking({
        dispatchProvider: 'borzo',
        borzoOrderId: 'BZ-1',
        deliveryStatus: 'dispatched',
        dispatchPendingCancel: {
          provider: 'borzo',
          providerOrderId: 'BZ-1',
          state: 'manual_required',
          reason: 'staff_cancelled',
          requestedBy: 'Ops',
          attempts: 0,
          lastError: null,
          staffActionRequired: 'cancel it',
        },
      })
    ).toBe(false);
  });

  it('does not gate takeaway or dine-in orders (they have no courier)', () => {
    for (const orderType of ['takeaway', 'dinein'] as const) {
      expect(canAdvanceToDispatched(readyDeliveryOrder({ orderType }))).toBe(true);
    }
  });

  it('hides the advance control and says what to do instead', () => {
    const html = renderStepper(readyDeliveryOrder());

    expect(html).not.toMatch(/Advance to Dispatched/i);
    expect(html).toContain('Book a courier from the Delivery Queue');
    // The step icons themselves still render — only the handover action goes.
    expect(html).toContain('Order Status Progression');
  });

  it('shows the advance control once a rider really exists', () => {
    const html = renderStepper(
      readyDeliveryOrder({ dispatchProvider: 'borzo', borzoOrderId: 'BZ-9', deliveryStatus: 'dispatched' })
    );

    expect(html).toMatch(/Advance to Dispatched/i);
    expect(html).not.toContain('Book a courier from the Delivery Queue');
  });

  it('still gates the control for takeaway/dine-in orders', () => {
    for (const orderType of ['takeaway', 'dinein'] as const) {
      const html = renderStepper(readyDeliveryOrder({ orderType, status: 'ready' }));
      expect(html).not.toContain('Book a courier from the Delivery Queue');
    }
  });
});
