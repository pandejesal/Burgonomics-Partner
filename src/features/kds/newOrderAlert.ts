/**
 * Pure state/wording helpers for the KDS new-order signal (A11Y-14).
 *
 * Kept out of the component so the cap and the announcement text can be
 * tested without a DOM, and out of the hook so importing them does not pull
 * in Firebase.
 */

/** How many arrived order ids the banner retains after one snapshot. */
export const KDS_NEW_ORDER_ID_CAP = 10;

export interface KdsNewOrderAlertState {
  /** Most recent capped ids, oldest-first. */
  ids: string[];
  /** Full size of the burst, including ids dropped by the cap. */
  total: number;
}

/** Same ticket label the KDS card shows (first 6 chars, uppercased). */
export function formatKdsOrderLabel(orderId: string): string {
  return orderId.slice(0, 6).toUpperCase();
}

/**
 * Retains the most recent `cap` ids (the input is oldest-first). A burst on a
 * long-lived makeline tab therefore cannot grow the aria-live string without
 * bound; the drop count is reported by `formatNewOrderAnnouncement` instead.
 */
export function capNewOrderIds(
  orderIds: string[],
  cap: number = KDS_NEW_ORDER_ID_CAP
): string[] {
  if (orderIds.length <= cap) return orderIds.slice();
  return orderIds.slice(orderIds.length - cap);
}

/**
 * Live-region wording. One arrival is named; larger bursts are counted, the
 * retained tail is listed, and any capped-away ids collapse into "(N more)".
 */
export function formatNewOrderAnnouncement(
  orderIds: string[],
  total: number = orderIds.length
): string {
  if (orderIds.length === 0) return '';
  const labels = orderIds.map(formatKdsOrderLabel);
  if (total <= 1) return `New order ${labels[0]} arrived on the makeline.`;
  const overflow = Math.max(0, total - labels.length);
  const more = overflow > 0 ? ` (${overflow} more)` : '';
  return `${total} new orders arrived on the makeline: ${labels.join(', ')}${more}.`;
}
