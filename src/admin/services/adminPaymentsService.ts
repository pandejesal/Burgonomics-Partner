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
    limitCount = 100,
  ) {
    const q = query(collection(db, "payments"), orderBy("createdAt", "desc"), limit(limitCount));

    return onSnapshot(
      q,
      (snapshot) => {
        const liveTransactions: TransactionDetails[] = [];
        snapshot.forEach((docSnap) => {
          // Per-document isolation: one malformed payment row (bad timestamp,
          // missing nested customer, unreadable payload) must not reject the
          // whole snapshot and blank the route.
          const normalized = normalizeTransactionSnapshotDoc(docSnap as any);
          if (normalized) liveTransactions.push(normalized);
        });
        onUpdate(liveTransactions);
      },
      (error) => onError(error),
    );
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
