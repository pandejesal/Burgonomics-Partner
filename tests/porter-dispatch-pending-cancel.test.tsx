import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * Item 10 (backend review/20261030-backend, 1ebb596 + 2b92d55).
 *
 * A staff stop on a booking we cannot cancel ourselves writes a durable
 * `dispatchPendingCancel` on the order:
 *
 *   functions/src/modules/dispatch/dispatch.cancelPending.ts:34-59
 *     { provider, providerOrderId, reason, state, providerCanCancel,
 *       requestedAt, requestedBy, attempts, lastAttemptAt, lastError,
 *       confirmedAt, confirmedBy, confirmedByName, confirmedNote,
 *       staffActionRequired }
 *   states: pending | manual_required | dead_lettered | confirmed
 *
 * While pending/manual_required/dead_lettered every replacement dispatch is
 * refused with 409 DISPATCH_CANCEL_UNCONFIRMED (err.pendingCancel +
 * err.staffActionRequired, dispatch.cancelPending.ts:118-155). The block lifts
 * only via a provider callback, a successful provider cancel, or
 * POST /dispatch/cancel/confirm, which answers
 *
 *   { success: true, orderId, provider, providerOrderId,
 *     pendingCancel, reused }          (dispatch.router.ts:2242-2249)
 *
 * The order may ALSO carry `dispatchCancelAlert` — { code, provider,
 * providerOrderId, reason, requestedBy, message, raisedAt } — with codes
 * DISPATCH_CANCEL_MANUAL_REQUIRED, DISPATCH_CANCEL_DEAD_LETTERED or
 * DISPATCH_CANCEL_PENDING (shadowfax.reconcile.ts:678-690, 771-781).
 *
 * The card must say a rider may still be coming, never offer Call Courier /
 * Rebook while blocked, and must surface the server's own instruction.
 */
const { dispatchConfirmCancel } = vi.hoisted(() => ({ dispatchConfirmCancel: vi.fn() }));

vi.mock('@/services/partnerFunctionsApi', async () => {
  const actual = await vi.importActual<typeof import('../src/services/partnerFunctionsApi')>(
    '../src/services/partnerFunctionsApi'
  );
  return {
    ...actual,
    partnerFunctionsApi: { ...actual.partnerFunctionsApi, dispatchConfirmCancel },
  };
});

vi.mock('@/features/delivery/hooks/usePorterLogistics', () => ({}));
vi.mock('@/utils/kdsAudio', () => ({ playKDSChime: vi.fn() }));

import { PorterDispatchCard } from '../src/features/delivery/components/PorterDispatchCard';
import {
  isDispatchCancelBlocking,
  readPendingDispatchCancel,
} from '../src/features/delivery/dispatchPendingCancel';

/** An order whose Borzo booking was released locally but never confirmed. */
function blockedOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ord_p1d_card_1',
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
    // Real server-written cancellation state (dispatchCancel on a Borzo
    // booking: local release, no provider cancel API).
    deliveryStatus: 'rider_cancelled',
    needsRebook: true,
    rebookTrigger: 'staff_cancelled',
    dispatchProvider: 'borzo',
    borzoOrderId: 'BZ-P1D-7788',
    riderCancellationReason:
      'Booking cancelled by Ops Asha — confirm the cancellation in the borzo dashboard',
    dispatchPendingCancel: {
      provider: 'borzo',
      providerOrderId: 'BZ-P1D-7788',
      reason: 'staff_cancelled',
      state: 'manual_required',
      providerCanCancel: false,
      requestedAt: { seconds: 1762100000 },
      requestedBy: 'Ops Asha',
      attempts: 0,
      lastAttemptAt: null,
      lastError: null,
      confirmedAt: null,
      confirmedBy: null,
      confirmedByName: null,
      confirmedNote: null,
      staffActionRequired:
        'Cancel booking BZ-P1D-7788 in the Borzo dashboard, then confirm the cancellation (POST /dispatch/cancel/confirm). Booking another rider before that would put two riders on this order.',
    },
    dispatchCancelAlert: {
      code: 'DISPATCH_CANCEL_MANUAL_REQUIRED',
      provider: 'borzo',
      providerOrderId: 'BZ-P1D-7788',
      reason: 'staff_cancelled',
      requestedBy: 'Ops Asha',
      message:
        'Cancel booking BZ-P1D-7788 in the Borzo dashboard, then confirm the cancellation. Booking another rider before that would put two riders on this order.',
      raisedAt: { seconds: 1762100000 },
    },
    createdAt: { seconds: 1762099000 },
    updatedAt: { seconds: 1762100000 },
    ...overrides,
  } as any;
}

function render(order: any, props: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    <PorterDispatchCard
      order={order}
      onFetchQuote={vi.fn()}
      onDispatchPorter={vi.fn()}
      onOpenAssignModal={vi.fn()}
      onCancelPorter={vi.fn()}
      onRebookPorter={vi.fn()}
      {...props}
    />
  );
}

describe('pending dispatch cancellation card', () => {
  it('reads the stored record and treats only unconfirmed states as blocking', () => {
    expect(readPendingDispatchCancel(blockedOrder())).toMatchObject({
      provider: 'borzo',
      providerOrderId: 'BZ-P1D-7788',
      state: 'manual_required',
      requestedBy: 'Ops Asha',
    });
    for (const state of ['pending', 'manual_required', 'dead_lettered']) {
      expect(
        isDispatchCancelBlocking({
          ...blockedOrder(),
          dispatchPendingCancel: { ...blockedOrder().dispatchPendingCancel, state },
        })
      ).toBe(true);
    }
    expect(
      isDispatchCancelBlocking({
        ...blockedOrder(),
        dispatchPendingCancel: { ...blockedOrder().dispatchPendingCancel, state: 'confirmed' },
      })
    ).toBe(false);
    // No record at all is not a block.
    expect(isDispatchCancelBlocking({ ...blockedOrder(), dispatchPendingCancel: undefined })).toBe(
      false
    );
  });

  it('says a rider may still be coming and names the courier dashboard to cancel in', () => {
    const html = render(blockedOrder());

    expect(html).toMatch(/rider may still be coming|may still be on the way/i);
    expect(html).toContain('Borzo dashboard');
    expect(html).toContain('BZ-P1D-7788');
    // The server's own instruction is shown, not a paraphrase that loses the
    // booking id or the confirm step.
    expect(html).toContain('then confirm the cancellation');
  });

  it('hides Call Courier and Rebook while the cancellation is unconfirmed', () => {
    const html = render(blockedOrder());

    expect(html).not.toContain('1-Click Rebook');
    expect(html).not.toMatch(/Call Borzo|Call Courier|Book Courier/);
    // Cancel of a released booking is also gone: this IS the released state.
    expect(html).not.toContain('Cancel Borzo / Re-assign');
  });

  it('offers "Confirm dashboard cancellation" behind a confirmation step', () => {
    const html = render(blockedOrder());

    expect(html).toContain('Confirm dashboard cancellation');
    // The confirmation dialog is a separate step (state-driven); the button
    // itself must not be the thing that calls the route.
    expect(html).not.toContain('Execute Command');
  });

  it('badges the order with the server alert code, including on a cancelled order', () => {
    const cancelled = blockedOrder({ status: 'cancelled' });
    const html = render(cancelled);

    // The alert survives the order turning terminal — this is exactly when a
    // live rider still needs a human.
    expect(html).toContain('DISPATCH_CANCEL_MANUAL_REQUIRED');
    expect(html).toContain('rider');
    // Nothing here claims a courier is assigned.
    expect(html).not.toContain('With assigned courier');
  });

  it('does not show the block UI for a confirmed cancellation', () => {
    const html = render(
      blockedOrder({
        dispatchPendingCancel: {
          ...blockedOrder().dispatchPendingCancel,
          state: 'confirmed',
          confirmedBy: 'staff_confirmation',
          staffActionRequired: null,
        },
        dispatchCancelAlert: null,
      })
    );

    expect(html).not.toContain('Confirm dashboard cancellation');
    expect(html).not.toMatch(/rider may still be/i);
  });
});
