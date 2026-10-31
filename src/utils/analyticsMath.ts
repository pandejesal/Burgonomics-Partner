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
  refundStatus?: string | null;
  refundAmount?: number | null;
  refundedTotalPaise?: number | null;
}

/** Terminal refund states: the order is fully refunded and earns nothing. */
const FULL_REFUND_STATUSES = new Set([
  'refunded',
  'full_refund',
  'fully_refunded',
  'refund_completed',
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

export interface OrderRevenueSummary {
  totalRevenue: number;
  totalOrders: number;
  brandRoyaltyEarned: number;
  netBranchPayoutTotal: number;
}

/**
 * Revenue, billable order count and the 5% brand royalty for a set of orders.
 * Cancelled and fully refunded orders contribute nothing; partially refunded
 * orders contribute their net amount.
 */
export function summarizeOrderRevenue(
  orders: readonly OrderRevenueShape[]
): OrderRevenueSummary {
  const billable = billableOrders(orders);
  const totalRevenue = Math.round(
    billable.reduce((sum, order) => sum + orderNetRevenue(order), 0)
  );
  const totalOrders = billable.length;
  const brandRoyaltyEarned = Math.round(totalRevenue * 0.05);
  return {
    totalRevenue,
    totalOrders,
    brandRoyaltyEarned,
    netBranchPayoutTotal: totalRevenue - brandRoyaltyEarned,
  };
}
