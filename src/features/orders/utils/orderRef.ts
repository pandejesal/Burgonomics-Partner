/**
 * One order reference, derived the same way everywhere (review finding 10/12).
 *
 * Orders carry a server-written `shortCode` (e.g. `BG-L29BTJ`). When it is
 * missing, the fallback used to be `id.slice(0, 6)` — but every order id begins
 * `ord_17…`, so the entire Live Orders table rendered `#ORD_17` on every row and
 * every row's aria-label read "View full details for order ORD_17". Rows were
 * indistinguishable on screen and to a screen reader, and the KDS ticket clipped
 * to `#OR…`.
 *
 * The suffix is the identifying part of an order id, so that is what the fallback
 * uses. The leading marker (`ord_`) is stripped because it carries no identity.
 */

/** Longest suffix kept from a bare id, matching the 6 chars `shortCode` tails use. */
export const ORDER_REF_SUFFIX = 6;

/**
 * A stable, unique-per-order display reference. Prefers the server's shortCode,
 * then a legacy `orderNumber`, then the identifying tail of the id.
 *
 * Returns `ORDER` only for an order with no usable id at all, which cannot
 * collide in practice because a row with no id cannot be actioned either.
 */
export function orderRef(order: {
  id?: string | null;
  shortCode?: string | null;
  orderNumber?: string | null;
}): string {
  const stored = (order.shortCode || order.orderNumber || '').trim();
  if (stored) return stored.replace(/^#/, '');

  const id = (order.id || '').trim();
  if (!id) return 'ORDER';

  // Strip a leading `ord_`/`ord-` marker, then keep the tail: that tail is the
  // part that actually differs between orders.
  const bare = id.replace(/^ord[_-]/i, '');
  const tail = bare.length > ORDER_REF_SUFFIX ? bare.slice(-ORDER_REF_SUFFIX) : bare;
  return tail.toUpperCase();
}

/** Same reference with the leading `#` the tables render. */
export function orderRefLabel(order: {
  id?: string | null;
  shortCode?: string | null;
  orderNumber?: string | null;
}): string {
  return `#${orderRef(order)}`;
}
