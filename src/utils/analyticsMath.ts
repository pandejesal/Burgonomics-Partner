/**
 * Partner analytics money + calendar math.
 *
 * Why this module exists (PAR-01): `useAnalytics` used to sum every fetched
 * order into revenue/royalty — cancelled and refunded orders included — and
 * bucket days with `toISOString()` (UTC), which splits an Indian business day
 * at 05:30 IST. Both are pure calculations, kept here so they are unit-testable
 * without a Firestore or a React render.
 *
 * Refund truth is read from the fields the payments backend actually writes on
 * `orders/{id}` (functions/src/modules/payments/razorpay.service.ts and
 * webhookHandler.ts):
 *   - `refundStatus`: 'refunded' (terminal/full) | 'partially_refunded' | other
 *   - `refundAmount`: rupees for the latest refund request (null on a
 *     full-amount intent)
 *   - `refundedTotalPaise`: cumulative refunded amount in paise (authoritative
 *     when present — a partial refund is netted against it)
 * Normalized orders carry these now (see orderContract.normalizeOrderDoc);
 * analytics never guesses a refund from a missing field.
 */

/** ISO calendar day of a timestamp in Asia/Kolkata (IST, UTC+05:30). */
const IST_DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const MS_PER_DAY = 86_400_000;

/** India has no DST: Asia/Kolkata is a fixed UTC+05:30. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Minimal order shape the money helpers need (raw or normalized). */
export interface OrderRevenueShape {
  status?: string | null;
  total?: number | null;
  deliveryFee?: number | null;
  /** Server-stamped top-level marker; the only proof of a gateway capture. */
  paymentChannel?: string | null;
  /** Walk-in sentinel customer id (staff-created counter order). */
  customerId?: string | null;
  /** Client/staff-written tender; never proof of a gateway receipt. */
  paymentMethod?: string | null;
  refundStatus?: string | null;
  refundAmount?: number | null;
  refundedTotalPaise?: number | null;
}

/** The two real earnings streams, plus orders that earned nothing. */
export type PaymentStream = 'razorpay' | 'cash' | 'unpaid';

/**
 * Staff-created counter orders keep the `cust_walkin` sentinel customerId
 * (see features/orders/utils/walkInOrder). Duplicated as a constant because
 * this module must stay pure (no Firestore import chain).
 */
const WALK_IN_CUSTOMER_ID = 'cust_walkin';

/** Terminal refund states: the order is fully refunded and earns nothing. */
const FULL_REFUND_STATUSES = new Set([
  'refunded',
  'full_refund',
  'fully_refunded',
  'refund_completed',
]);

/** Statuses where the cash is actually in the branch's hands. */
const COMPLETED_STATUSES = new Set([
  'delivered',
  'completed',
  'complete',
  'picked_up',
  'pickedup',
  'handed_over',
  'closed',
]);

function toMillis(value: unknown): number {
  if (value == null) return NaN;
  const candidate = value as {
    toMillis?: () => number;
    toDate?: () => Date;
    getTime?: () => number;
  };
  if (typeof candidate.toMillis === 'function') {
    const ms = Number(candidate.toMillis());
    return Number.isFinite(ms) ? ms : NaN;
  }
  if (typeof candidate.toDate === 'function') {
    const d = candidate.toDate();
    return d instanceof Date ? d.getTime() : NaN;
  }
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value as string | number).getTime();
  return Number.isFinite(parsed) ? parsed : NaN;
}

/**
 * `yyyy-MM-dd` for the Asia/Kolkata calendar day containing `value`.
 * Independent of the device timezone (never uses local getDate/getHours).
 */
export function istDayKey(value: unknown): string {
  const ms = toMillis(value);
  if (!Number.isFinite(ms)) return '';
  const parts = IST_DAY_FORMAT.formatToParts(new Date(ms));
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : '';
}

/**
 * The last `days` IST calendar days ending on the day that contains `now`,
 * oldest first. Anchor arithmetic runs on the date string at UTC midnight so
 * the result is a stable list of IST day keys.
 */
export function istDayRange(now: Date, days: number): string[] {
  const today = istDayKey(now);
  if (!today || !Number.isFinite(days) || days <= 0) return [];
  const anchor = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(anchor)) return [];
  const range: string[] = [];
  const count = Math.floor(days);
  for (let i = count - 1; i >= 0; i--) {
    range.push(new Date(anchor - i * MS_PER_DAY).toISOString().slice(0, 10));
  }
  return range;
}

/** IST calendar parts of an instant (null when the value is not a timestamp). */
function istDayParts(value: unknown): { year: number; month: number; day: number } | null {
  const key = istDayKey(value);
  if (!key) return null;
  const [year, month, day] = key.split('-').map(Number);
  if (![year, month, day].every((part) => Number.isFinite(part))) return null;
  return { year, month, day };
}

/**
 * PAR-01b: fetch-window anchors. The bucket keys above are IST days, so the
 * window edge must be an IST midnight too — otherwise a non-IST device asks
 * Firestore for a window that starts on a different day than the buckets show.
 * `startOfWeek`/`startOfMonth` from date-fns use the device timezone.
 */
export function startOfIstDay(value: Date): Date {
  const parts = istDayParts(value);
  if (!parts) return value;
  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day) - IST_OFFSET_MS
  );
}

/** Monday 00:00 IST of the week containing `value`. */
export function startOfIstWeek(value: Date): Date {
  const parts = istDayParts(value);
  if (!parts) return value;
  const dayAnchor = Date.UTC(parts.year, parts.month - 1, parts.day);
  const weekday = new Date(dayAnchor).getUTCDay(); // 0=Sun … 6=Sat
  const daysSinceMonday = (weekday + 6) % 7;
  return new Date(dayAnchor - daysSinceMonday * MS_PER_DAY - IST_OFFSET_MS);
}

/** 00:00 IST on the first day of the month containing `value`. */
export function startOfIstMonth(value: Date): Date {
  const parts = istDayParts(value);
  if (!parts) return value;
  return new Date(Date.UTC(parts.year, parts.month - 1, 1) - IST_OFFSET_MS);
}

/**
 * `yyyy-MM` for the Asia/Kolkata calendar month containing `value` (F2).
 * IST has no DST; the month flips at 18:30Z on the last day.
 */
const IST_MONTH_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
});

export function istMonthKey(value: unknown): string {
  const ms = toMillis(value);
  if (!Number.isFinite(ms)) return '';
  const parts = IST_MONTH_FORMAT.formatToParts(new Date(ms));
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  return year && month ? `${year}-${month}` : '';
}

/** The IST calendar month immediately before `monthKey` (`YYYY-MM`). */
export function previousIstMonthKey(monthKey: string): string {
  const [year, month] = String(monthKey).split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return '';
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

/** Human label for a `YYYY-MM` key, e.g. "November 2026". */
export function istMonthLabel(monthKey: string): string {
  const [year, month] = String(monthKey).split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** 00:00 IST on the first day of a `YYYY-MM` month. */
export function startOfIstMonthKey(monthKey: string): Date | null {
  const [year, month] = String(monthKey).split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return new Date(Date.UTC(year, month - 1, 1) - IST_OFFSET_MS);
}

function refundStatusOf(order: OrderRevenueShape): string {
  return String(order?.refundStatus ?? '').trim().toLowerCase();
}

function totalRupeesOf(order: OrderRevenueShape): number {
  const total = Number(order?.total);
  return Number.isFinite(total) ? total : 0;
}

function refundedPaiseOf(order: OrderRevenueShape): number {
  const paise = Number(order?.refundedTotalPaise);
  return Number.isFinite(paise) && paise > 0 ? paise : 0;
}

/** A refund that returned the whole order (by status, or by cumulative paise). */
export function isFullyRefundedOrder(order: OrderRevenueShape): boolean {
  if (FULL_REFUND_STATUSES.has(refundStatusOf(order))) return true;
  const refundedPaise = refundedPaiseOf(order);
  const total = totalRupeesOf(order);
  return refundedPaise > 0 && total > 0 && refundedPaise >= Math.round(total * 100);
}

/**
 * Cancelled or fully refunded: excluded from revenue, royalty, order volume and
 * every per-day/per-branch/per-hour aggregation.
 */
export function isVoidOrder(order: OrderRevenueShape): boolean {
  const status = String(order?.status ?? '').trim().toLowerCase();
  if (status === 'cancelled' || status === 'refunded') return true;
  return isFullyRefundedOrder(order);
}

/** Revenue actually earned by one order (net of any partial refund). */
export function orderNetRevenue(order: OrderRevenueShape): number {
  if (isVoidOrder(order)) return 0;
  const total = totalRupeesOf(order);
  const refundedPaise = refundedPaiseOf(order);
  if (refundedPaise > 0) {
    return Math.max(0, total - refundedPaise / 100);
  }
  const status = refundStatusOf(order);
  if (status === 'partially_refunded' || status === 'partial_refund') {
    const refundRupees = Number(order?.refundAmount);
    if (Number.isFinite(refundRupees) && refundRupees > 0) {
      return Math.max(0, total - refundRupees);
    }
  }
  return total;
}

export function billableOrders<T extends OrderRevenueShape>(orders: readonly T[]): T[] {
  return orders.filter((order) => !isVoidOrder(order));
}

/**
 * Owner decision 1 Nov 2026. Only the server-stamped top-level
 * `paymentChannel === "razorpay"` proves a gateway capture. `paymentMethod`,
 * `paymentStatus` and `payment.*` are client/staff-written and prove nothing:
 * a walk-in (even with a "razorpay"/UPI tender picked by staff) and a COD order
 * are cash & counter. Any other order without the marker is unpaid and earns
 * nothing.
 */
export function orderPaymentChannel(order: OrderRevenueShape): PaymentStream {
  if (order?.paymentChannel === 'razorpay') return 'razorpay';
  if (order?.customerId === WALK_IN_CUSTOMER_ID) return 'cash';
  if (order?.paymentMethod === 'cod') return 'cash';
  return 'unpaid';
}

function deliveryFeeRupeesOf(order: OrderRevenueShape): number {
  const fee = Number(order?.deliveryFee);
  return Number.isFinite(fee) && fee > 0 ? fee : 0;
}

/** Cumulative refunded rupees (paise field first, then the amount fallback). */
function refundedRupeesOf(order: OrderRevenueShape): number {
  const paise = Number(order?.refundedTotalPaise);
  if (Number.isFinite(paise) && paise > 0) return paise / 100;
  const amount = Number(order?.refundAmount);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

/** Cash counts as earnings only once the order is completed. */
export function isCompletedOrder(order: OrderRevenueShape): boolean {
  return COMPLETED_STATUSES.has(String(order?.status ?? '').trim().toLowerCase());
}

/**
 * What the branch actually earns on the order (D6/D7): net revenue minus the
 * courier fee the brand paid. A refund comes out of the courier fee first, so
 * subtracting the fee from an already-refunded total would count it twice:
 *   max(0, total - courierFee) - max(0, refunded - courierFee), floored at 0.
 * Unpaid orders earn nothing.
 */
export function orderNetEarnings(order: OrderRevenueShape): number {
  const stream = orderPaymentChannel(order);
  if (stream === 'unpaid') return 0;
  // Cash is earnings only once the customer has taken the order; otherwise it
  // is a receivable and must never be shown as earned.
  if (stream === 'cash' && !isCompletedOrder(order)) return 0;
  if (isVoidOrder(order)) return 0;
  const total = totalRupeesOf(order);
  const courierFee = deliveryFeeRupeesOf(order);
  const refunded = refundedRupeesOf(order);
  const earningsBeforeRefund = Math.max(0, total - courierFee);
  const refundBeyondCourier = Math.max(0, refunded - courierFee);
  return Math.max(0, earningsBeforeRefund - refundBeyondCourier);
}

export interface OrderRevenueSummary {
  totalRevenue: number;
  totalOrders: number;
  razorpayRevenue: number;
  razorpayOrders: number;
  cashRevenue: number;
  cashOrders: number;
  /** Non-completed counter/cash orders — a receivable, never earnings. */
  cashPendingOrders: number;
}

/**
 * Revenue split into the two real streams for a set of orders. Cancelled and
 * fully refunded orders contribute nothing; partially refunded orders
 * contribute their net amount; unpaid orders count as order volume but earn 0.
 * Cash counts only once the order is completed — in-progress counter money is
 * a receivable. No per-order royalty exists any more (fixed monthly fee).
 */
export function summarizeOrderRevenue(
  orders: readonly OrderRevenueShape[]
): OrderRevenueSummary {
  const billable = billableOrders(orders);
  let razorpayRevenue = 0;
  let razorpayOrders = 0;
  let cashRevenue = 0;
  let cashOrders = 0;
  let cashPendingOrders = 0;

  for (const order of billable) {
    const stream = orderPaymentChannel(order);
    if (stream === 'razorpay') {
      razorpayRevenue += orderNetEarnings(order);
      razorpayOrders += 1;
    } else if (stream === 'cash') {
      if (isCompletedOrder(order)) {
        cashRevenue += orderNetEarnings(order);
        cashOrders += 1;
      } else {
        cashPendingOrders += 1;
      }
    }
  }

  return {
    totalRevenue: Math.round(razorpayRevenue + cashRevenue),
    totalOrders: billable.length,
    razorpayRevenue: Math.round(razorpayRevenue),
    razorpayOrders,
    cashRevenue: Math.round(cashRevenue),
    cashOrders,
    cashPendingOrders,
  };
}
