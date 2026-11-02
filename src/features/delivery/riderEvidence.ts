import type { Order } from '@/types';
import { isDispatchCancelBlocking } from '@/features/delivery/dispatchPendingCancel';

/**
 * "Is a rider actually going to this delivery?" — the client mirror of the
 * server's rider guard.
 *
 * LIVE FINDING (item 11): the partner order page offered "ADVANCE TO
 * DISPATCHED" at Ready on a delivery order with no courier booking and no
 * in-house rider. Pressing it moved the order to OUT_FOR_DELIVERY and the
 * Delivery Queue then said "With assigned courier" — the customer was told
 * their food was on the way with nobody coming.
 *
 * The server now refuses that transition with 409 DISPATCH_RIDER_REQUIRED
 * (backend 15e839c, functions/src/modules/orders/orderStatus.ts
 * assertRiderForOutForDelivery). This module repeats that evidence test on the
 * client so the control is hidden instead of dialling a guaranteed 409, and so
 * the queue cannot claim a courier that does not exist.
 *
 * Evidence accepted (exactly the server's list, reading the same stored fields):
 *   - a live carrier booking: an active deliveryStatus, or dispatchStatus
 *     'dispatched' with a bound provider id, plus a provider + bound provider
 *     order id, and NOT released/staff-cancelled;
 *   - an in-house assignment: dispatchType 'manual_branch_terminal' with an
 *     active deliveryStatus (what /orders/manualDispatch writes);
 *   - an order deliberately parked for a dispatch decision (needsRebook,
 *     needs_review, rider_cancelled, dispatch_failed, manual_pending) — no
 *     handover claim is made there, so the rider guard does not apply.
 *
 * Fail-closed: anything absent is "no rider". A riderName alone is NOT
 * evidence — provider webhooks and stale docs leave names behind.
 */

const ACTIVE_DELIVERY_STATUSES = ['dispatched', 'in_transit', 'driver_allocated'];

function providerOrderIdOf(order: Record<string, any> | null | undefined): string | null {
  if (!order) return null;
  const id =
    order.dispatchOrderId ?? order.porterOrderId ?? order.borzoOrderId ?? order.shadowfaxOrderId;
  return typeof id === 'string' && id.trim() ? id.trim() : typeof id === 'number' ? String(id) : null;
}

/** True when the order presents a live carrier booking (any provider). */
export function hasLiveCourierBooking(order: Order | Record<string, any> | null | undefined): boolean {
  const o = order as Record<string, any> | null | undefined;
  if (!o) return false;
  const deliveryStatus = String(o.deliveryStatus || '');
  const active = ACTIVE_DELIVERY_STATUSES.includes(deliveryStatus);
  const boundProviderId = providerOrderIdOf(o) !== null;
  const provider = typeof o.dispatchProvider === 'string' && o.dispatchProvider ? o.dispatchProvider : null;
  const settled = o.dispatchStatus === 'dispatched' && boundProviderId;
  // A released/staff-cancelled booking no longer owns the order.
  if (o.dispatchProviderCancel === 'manual-required') return false;
  // An unconfirmed remote cancellation means the old rider may STILL be live,
  // but it is not a booking we may dispatch on — the server refuses a
  // replacement too, so this is not "a rider is assigned".
  if (isDispatchCancelBlocking(o)) return false;
  if (!(active || settled) && !(boundProviderId && provider)) return false;
  if (o.needsRebook === true && !active) return false;
  return boundProviderId && (active || settled || !!provider);
}

/** True while an in-house rider owns the order (the /orders/manualDispatch shape). */
export function hasInHouseRider(order: Order | Record<string, any> | null | undefined): boolean {
  const o = order as Record<string, any> | null | undefined;
  if (!o) return false;
  return (
    o.dispatchType === 'manual_branch_terminal' &&
    ACTIVE_DELIVERY_STATUSES.includes(String(o.deliveryStatus || ''))
  );
}

/** True when the order is parked for a staff dispatch decision. */
export function isParkedForDispatchDecision(
  order: Order | Record<string, any> | null | undefined
): boolean {
  const o = order as Record<string, any> | null | undefined;
  if (!o) return false;
  return (
    o.needsRebook === true ||
    o.deliveryStatus === 'needs_review' ||
    o.deliveryStatus === 'rider_cancelled' ||
    o.dispatchStatus === 'dispatch_failed' ||
    o.dispatchStatus === 'manual_pending'
  );
}

/** True when a real rider (courier booking or in-house) is assigned. */
export function hasAssignedRider(order: Order | Record<string, any> | null | undefined): boolean {
  return hasLiveCourierBooking(order) || hasInHouseRider(order);
}

/** True only for a real courier booking (not an in-house rider). */
export function hasCourierBooking(order: Order | Record<string, any> | null | undefined): boolean {
  return hasLiveCourierBooking(order);
}

/**
 * May this order be marked out for delivery right now?
 *
 * Delivery orders need a rider or a deliberate park; takeaway/dine-in have no
 * courier and are never gated.
 */
export function canAdvanceToDispatched(
  order: Order | Record<string, any> | null | undefined
): boolean {
  const o = order as Record<string, any> | null | undefined;
  if (!o) return false;
  const fulfillment = String(o.orderType ?? o.fulfillment ?? 'delivery');
  if (fulfillment !== 'delivery' && fulfillment !== 'deliver') return true;
  if (hasAssignedRider(o)) return true;
  if (isParkedForDispatchDecision(o)) return true;
  return false;
}

/** Copy telling the operator what to do instead of advancing. */
export const NO_RIDER_DISPATCH_COPY =
  'No courier or in-house rider is assigned yet. Book a courier from the Delivery Queue (or assign an in-house rider) before marking this order dispatched — otherwise the customer is told the food is on the way with nobody coming.';
