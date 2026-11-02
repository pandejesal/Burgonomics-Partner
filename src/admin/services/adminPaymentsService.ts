import { db } from "@/core/config/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import { TransactionDetails, RefundDetails, DiscrepancyDetails } from "../pages/paymentsData";
import { normalizeDisplayTime, safeNormalizeRefundDoc } from "./adminRefundContract";

const TRANSACTION_STATUSES = [
  "CAPTURED",
  "AUTHORIZED",
  "PENDING",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "CHARGEBACK",
  "DISPUTED",
  "EXPIRED",
] as const satisfies readonly TransactionDetails["status"][];

const REFUND_STATUSES = ["PENDING", "COMPLETED", "FAILED"] as const satisfies readonly TransactionDetails["refunds"][number]["status"][];

function asPaymentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return "";
}

function firstPaymentText(...values: unknown[]): string {
  for (const value of values) {
    const text = asPaymentText(value).trim();
    if (text) return text;
  }
  return "";
}

function asPaymentRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizePaymentAmountPaise(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric);
}

function normalizePaymentStatus(value: unknown): TransactionDetails["status"] | null {
  if (typeof value !== "string") return null;
  const status = value.trim().toUpperCase();
  return (TRANSACTION_STATUSES as readonly string[]).includes(status)
    ? (status as TransactionDetails["status"])
    : null;
}

function normalizeVerificationStatus(value: unknown): TransactionDetails["verificationStatus"] {
  const status = asPaymentText(value).trim().toUpperCase();
  if (status === "VERIFIED" || status === "FAILED") return status;
  return "UNVERIFIED";
}

function normalizePaymentRefunds(value: unknown): TransactionDetails["refunds"] {
  if (!Array.isArray(value)) return [];
  const rows: TransactionDetails["refunds"] = [];
  for (const entry of value) {
    const refund = asPaymentRecord(entry);
    const status = asPaymentText(refund.status).trim().toUpperCase();
    const amountPaise = normalizePaymentAmountPaise(refund.amountPaise);
    if (!amountPaise || !(REFUND_STATUSES as readonly string[]).includes(status)) continue;
    rows.push({
      id: firstPaymentText(refund.id),
      amountPaise,
      reason: firstPaymentText(refund.reason),
      status: status as TransactionDetails["refunds"][number]["status"],
      createdAt: normalizeDisplayTime(refund.createdAt),
    });
  }
  return rows;
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  const source = asPaymentRecord(value);
  const record: Record<string, string> = {};
  for (const [key, entry] of Object.entries(source)) {
    const text = asPaymentText(entry);
    if (text) record[key] = text;
  }
  return record;
}

/**
 * Normalizes one raw `payments` snapshot document.
 *
 * The live ledger previously cast `docSnap.data()` straight to
 * TransactionDetails, so a missing amount/status/customer/store/timestamp
 * reached `.split()`, `.replace()`, and `.reduce()` during render and took
 * down the whole admin route. Amount and status are essential money facts: a
 * row without either is dropped instead of being rendered as ₹0.00 or a
 * fabricated status. Non-essential identity fields get explicit Unknown
 * labels. Throwing documents are isolated to one row.
 */
export function normalizeTransactionSnapshotDoc(docSnap: {
  id: string;
  data: () => unknown;
}): TransactionDetails | null {
  try {
    const raw = asPaymentRecord(docSnap.data());
    const amountPaise = normalizePaymentAmountPaise(raw.amountPaise ?? raw.amount_paise);
    const status = normalizePaymentStatus(raw.status);
    if (!amountPaise || !status) {
      console.warn(
        `[adminPaymentsService] Dropped payment ${docSnap.id}: amount=${String(raw.amountPaise)} status=${String(raw.status)}`,
      );
      return null;
    }

    const customer = asPaymentRecord(raw.customer);
    const store = asPaymentRecord(raw.store);
    const id = firstPaymentText(docSnap.id, raw.id);

    return {
      id: id || "payment_unknown",
      orderId: firstPaymentText(raw.orderId, raw.order_id, raw.orderNumber) || "Unknown order",
      amountPaise,
      currency: firstPaymentText(raw.currency) || "INR",
      gateway: firstPaymentText(raw.gateway, raw.gatewayName, raw.provider) || "Unknown gateway",
      gatewayPaymentId: firstPaymentText(
        raw.gatewayPaymentId,
        raw.razorpayPaymentId,
        raw.paymentId,
      ),
      status,
      verificationStatus: normalizeVerificationStatus(raw.verificationStatus),
      createdAt: normalizeDisplayTime(raw.createdAt ?? raw.created_at ?? raw.timestamp),
      capturedAt: raw.capturedAt == null ? null : normalizeDisplayTime(raw.capturedAt),
      customer: {
        name:
          firstPaymentText(customer.name, raw.customerName) || "Unknown customer",
        email: firstPaymentText(customer.email, raw.customerEmail),
        phone: firstPaymentText(customer.phone, raw.customerPhone),
      },
      store: {
        id: firstPaymentText(store.id, raw.storeId, raw.branchId, raw.outletId),
        name:
          firstPaymentText(store.name, raw.storeName, raw.branchName, raw.outletName) ||
          "Unknown store",
      },
      timeline: [],
      metadata: normalizeStringRecord(raw.metadata),
      signature: firstPaymentText(raw.signature),
      webhookEvents: [],
      refunds: normalizePaymentRefunds(raw.refunds),
      auditLogs: [],
    };
  } catch (err) {
    console.error(`[adminPaymentsService] Undisposable payment document ${docSnap.id}:`, err);
    return null;
  }
}

/**
 * How the ledger gets its rows, and what it cannot see.
 *
 * There is NO `payments` collection in production: the backend never writes one
 * (`functions/src` has zero `.collection("payments")` call sites). Captures live
 * on the ORDER document - as the canonical nested `payment` map and, for older
 * merge-set writes, as the dotted-literal `"payment.x"` keys. Reading `payments`
 * therefore produced a permanently empty ledger while real money was captured.
 *
 * So the ledger is DERIVED from `orders`, and it says so. `bounded` is true
 * because the read is a capped newest-first page: an empty result means "no
 * captured payment in the loaded page", never "no money ever moved".
 */
export const PAYMENT_LEDGER_SOURCE = "orders" as const;
export const PAYMENT_LEDGER_READ_LIMIT = 200;

export interface PaymentLedgerCoverage {
  source: typeof PAYMENT_LEDGER_SOURCE;
  /** True: this is a capped page, not an exhaustive scan. */
  bounded: boolean;
  limit: number;
  /** Operator-facing sentence; never overclaims completeness. */
  statement: string;
}

export function describePaymentLedgerCoverage(
  limit: number = PAYMENT_LEDGER_READ_LIMIT,
): PaymentLedgerCoverage {
  return {
    source: PAYMENT_LEDGER_SOURCE,
    bounded: true,
    limit,
    statement:
      "Derived from the " + limit + " most recent orders. Captured payments are read " +
      "from each order's own payment record, which is the server's capture " +
      "source of truth. This is a bounded page, not a full historical ledger: " +
      "an empty list means no captured payment appears in this window.",
  };
}

/** Reads a field from either storage shape an order doc legitimately carries. */
function paymentField(order: Record<string, any>, field: string): unknown {
  const nested =
    order.payment && typeof order.payment === "object" && !Array.isArray(order.payment)
      ? (order.payment as Record<string, unknown>)[field]
      : undefined;
  if (nested !== undefined && nested !== null && nested !== "") return nested;
  const dotted = order["payment." + field];
  return dotted === undefined ? undefined : dotted;
}

/**
 * Captured amount in PAISE.
 *
 * `payment.capturedAmountPaise` is already paise (what the confirm transaction
 * stamps). The priced totals are RUPEES, so they must be converted - passing a
 * rupee figure to a paise validator under-reported a 260 rupee capture as 260
 * paise. A priced total is only a fallback for docs written before the capture
 * stamp existed.
 */
function paidAmountPaise(order: Record<string, any>): number | null {
  const captured = normalizePaymentAmountPaise(paymentField(order, "capturedAmountPaise"));
  if (captured) return captured;

  const rupeesToPaise = (value: unknown): number | null => {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return normalizePaymentAmountPaise(Math.round(numeric * 100));
  };

  const priced = rupeesToPaise(order.pricing?.grandTotal);
  if (priced) return priced;
  return rupeesToPaise(order.totals?.grandTotal);
}

/**
 * Derives ONE ledger row from a real `orders` document, or null when the order
 * is not a captured payment.
 *
 * Fail-closed on the money facts: no capture evidence means no row (an unpaid
 * online order is not a payment), and a doc with capture evidence but no usable
 * amount is dropped rather than rendered as zero.
 */
export function normalizeOrderPaymentDoc(docSnap: {
  id: string;
  data: () => unknown;
}): TransactionDetails | null {
  try {
    const order = asPaymentRecord(docSnap.data());
    const paymentStatus = firstPaymentText(
      paymentField(order, "status"),
      order.paymentStatus,
    ).toLowerCase();
    const captured =
      paymentStatus === "completed" || paymentStatus === "captured" || paymentStatus === "paid";
    if (!captured) return null;

    const amountPaise = paidAmountPaise(order);
    if (!amountPaise) {
      console.warn(
        "[adminPaymentsService] Dropped captured order " + docSnap.id + ": no usable amount",
      );
      return null;
    }

    const gatewayPaymentId = firstPaymentText(
      paymentField(order, "razorpayPaymentId"),
      paymentField(order, "transactionId"),
      order.razorpayPaymentId,
    );

    // Refund state is written by the payments backend onto the order itself.
    const refundStatus = firstPaymentText(order.refundStatus).toLowerCase();
    const refundedTotal = Number(order.refundedTotalPaise) || 0;
    let status: TransactionDetails["status"] = "CAPTURED";
    if (refundStatus === "refunded" || (refundedTotal > 0 && refundedTotal >= amountPaise)) {
      status = "REFUNDED";
    } else if (refundStatus === "partially_refunded" || refundedTotal > 0) {
      status = "PARTIALLY_REFUNDED";
    }

    const store = asPaymentRecord(order.store);
    const customer = asPaymentRecord(order.customer);
    const verifiedAtRaw = paymentField(order, "verifiedAt");

    return {
      id: "pay_ord_" + docSnap.id,
      orderId: docSnap.id,
      amountPaise,
      currency: "INR",
      gateway: firstPaymentText(order.paymentChannel, order.paymentMethod) || "razorpay",
      gatewayPaymentId,
      status,
      verificationStatus: verifiedAtRaw || gatewayPaymentId ? "VERIFIED" : "UNVERIFIED",
      createdAt: normalizeDisplayTime(order.createdAt ?? order.placedAt),
      capturedAt: verifiedAtRaw == null ? null : normalizeDisplayTime(verifiedAtRaw),
      customer: {
        name: firstPaymentText(order.customerName, customer.name) || "Unknown customer",
        email: firstPaymentText(order.customerEmail, customer.email),
        phone: firstPaymentText(order.customerPhone, customer.phone),
      },
      store: {
        id: firstPaymentText(store.id, order.branchId),
        name: firstPaymentText(store.name, order.branchName) || "Unknown store",
      },
      timeline: [],
      metadata: {},
      signature: "",
      webhookEvents: [],
      refunds: [],
      auditLogs: [],
    };
  } catch (err) {
    // One malformed order must never blank the whole ledger.
    console.error("[adminPaymentsService] Undisposable order " + docSnap.id + ":", err);
    return null;
  }
}

/**
 * Normalizes one refund snapshot document without letting a single corrupt
 * record abort the batch. Returns `null` when the document itself cannot be
 * read/normalized; the caller keeps every other refund.
 */
export function normalizeRefundSnapshotDoc(docSnap: {
  id: string;
  data: () => unknown;
}): RefundDetails | null {
  try {
    return safeNormalizeRefundDoc(docSnap.id, (docSnap.data() ?? {}) as any);
  } catch (err) {
    console.error(`[adminPaymentsService] Undisposable refund document ${docSnap.id}:`, err);
    return null;
  }
}

export const adminPaymentsService = {
  /**
   * Listen for live incoming payment transactions.
   */
  listenLiveTransactions(
    onUpdate: (transactions: TransactionDetails[]) => void,
    onError: (err: Error) => void,
    limitCount = PAYMENT_LEDGER_READ_LIMIT,
  ) {
    // Reads the CAPTURE SOURCE OF TRUTH (`orders`), not the unwritten `payments`
    // collection. See describePaymentLedgerCoverage: this is a bounded page.
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(limitCount));

    return onSnapshot(
      q,
      (snapshot) => {
        const liveTransactions: TransactionDetails[] = [];
        snapshot.forEach((docSnap) => {
          // Per-document isolation: one malformed order (bad timestamp, missing
          // nested customer, unreadable payload) must not reject the whole
          // snapshot and blank the route.
          const normalized = normalizeOrderPaymentDoc(docSnap as any);
          if (normalized) liveTransactions.push(normalized);
        });
        onUpdate(liveTransactions);
      },
      (error) => onError(error),
    );
  },

  /**
   * What this ledger can and cannot see. The page renders this instead of
   * implying a complete historical ledger.
   */
  ledgerCoverage(limitCount: number = PAYMENT_LEDGER_READ_LIMIT): PaymentLedgerCoverage {
    return describePaymentLedgerCoverage(limitCount);
  },

  /**
   * Listen for live refunds.
   */
  listenLiveRefunds(
    onUpdate: (refunds: RefundDetails[]) => void,
    onError: (err: Error) => void,
    limitCount = 100,
  ) {
    const q = query(collection(db, "refunds"), orderBy("createdAt", "desc"), limit(limitCount));

    return onSnapshot(
      q,
      (snapshot) => {
        const liveRefunds: RefundDetails[] = [];
        snapshot.forEach((docSnap) => {
          // Per-document isolation: one malformed refund (bad timestamp shape,
          // unreadable doc) must never blank the whole live ledger.
          const normalized = normalizeRefundSnapshotDoc(docSnap as any);
          if (normalized) liveRefunds.push(normalized);
        });
        onUpdate(liveRefunds);
      },
      (error) => onError(error),
    );
  },

  /**
   * Listen for live discrepancies.
   */
  listenLiveDiscrepancies(
    onUpdate: (discrepancies: DiscrepancyDetails[]) => void,
    onError: (err: Error) => void,
    limitCount = 100,
  ) {
    const q = query(
      collection(db, "payment_discrepancies"),
      orderBy("createdAt", "desc"),
      limit(limitCount),
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const liveDiscrepancies: DiscrepancyDetails[] = [];
        snapshot.forEach((docSnap) => {
          // Loop 25/120: stamp the doc id — resolvers need it for POST
          // /discrepancies/resolve, and server docs don't carry it inside.
          liveDiscrepancies.push({ id: docSnap.id, ...(docSnap.data() as any) } as DiscrepancyDetails);
        });
        onUpdate(liveDiscrepancies);
      },
      (error) => onError(error),
    );
  },

  // Loop 25/120: REMOVED resolveDiscrepancy direct client write — it could
  // never succeed (rules deny all client writes to payment_discrepancies)
  // and had zero callers. Resolution flows through POST
  // /discrepancies/resolve via partnerFunctionsApi.resolveDiscrepancy.
};
