import { buildAdminRefundKey } from "@/utils/refundRequestIdentity";
import type { RefundDetails, RefundStatus } from "../pages/paymentsData";

export interface RawRefundDoc {
  id?: string;
  orderId?: string | null;
  branchId?: string | null;
  razorpayPaymentId?: string | null;
  paymentId?: string | null;
  gatewayPaymentId?: string | null;
  amountPaise?: number | null;
  amount?: number | null;
  reason?: string | null;
  detail?: string | null;
  status?: string | null;
  disposition?: {
    decision?: string | null;
    reason?: string | null;
    decidedBy?: string | null;
    decidedAt?: unknown;
  } | null;
  customerName?: string | null;
  storeName?: string | null;
  processedBy?: string | null;
  gatewayStatus?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
  completedAt?: unknown;
  [key: string]: unknown;
}

/** True only for a Date whose time value is a finite number inside the ISO range. */
function isRenderableDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

/** Formats a Date when it is renderable, otherwise reports the value as unparsed. */
function formatRenderable(date: Date): string {
  return isRenderableDate(date) ? date.toISOString() : "Unknown (unparsed timestamp)";
}

/**
 * Normalizes any timestamp, Firestore Timestamp, Date, number, or string into
 * a valid ISO display string.
 *
 * Contract: this function NEVER throws and NEVER returns `[object Object]`.
 * Names/descriptions that merely look like dates are irrelevant here — only
 * timestamp shapes are accepted. Every unusable shape reports honesty
 * ("Unknown" / "Unknown (unparsed timestamp)") so one malformed refund can
 * never blank the live ledger.
 */
export function normalizeDisplayTime(val: unknown): string {
  if (val == null) return "Unknown";

  try {
    if (val instanceof Date) {
      return formatRenderable(val);
    }

    if (typeof val === "object") {
      const candidate = val as {
        toDate?: unknown;
        toMillis?: unknown;
        seconds?: unknown;
        _seconds?: unknown;
        nanoseconds?: unknown;
        _nanoseconds?: unknown;
      };

      // Firestore Timestamp (client SDK) — toDate() can throw on a corrupt shape.
      if (typeof candidate.toDate === "function") {
        try {
          const fromToDate = (candidate.toDate as () => unknown)();
          if (isRenderableDate(fromToDate)) return fromToDate.toISOString();
        } catch {
          // fall through to the numeric representation
        }
      }

      if (typeof candidate.toMillis === "function") {
        try {
          const millis = (candidate.toMillis as () => unknown)();
          if (typeof millis === "number" && Number.isFinite(millis)) {
            return formatRenderable(new Date(millis));
          }
        } catch {
          // fall through to the numeric representation
        }
      }

      // Serialized Timestamp representation { seconds, nanoseconds } / { _seconds }.
      // Validate the constructed Date BEFORE toISOString: Date#toISOString
      // throws `RangeError: Invalid time value` for out-of-range seconds.
      const seconds = candidate.seconds ?? candidate._seconds;
      if (typeof seconds === "number" && Number.isFinite(seconds)) {
        const nanoseconds = candidate.nanoseconds ?? candidate._nanoseconds;
        const subMillisecond =
          typeof nanoseconds === "number" && Number.isFinite(nanoseconds) ? nanoseconds / 1e6 : 0;
        return formatRenderable(new Date(seconds * 1000 + subMillisecond));
      }

      return "Unknown (unparsed timestamp)";
    }

    // Epoch number (seconds or milliseconds).
    if (typeof val === "number") {
      if (!Number.isFinite(val)) return "Unknown (unparsed timestamp)";
      const ms = val < 1e11 ? val * 1000 : val;
      return formatRenderable(new Date(ms));
    }

    // String: parse as a date when possible, otherwise report it as unparsed
    // rather than presenting an arbitrary string as a filing time.
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) return "Unknown";
      const parsed = Date.parse(trimmed);
      if (!Number.isNaN(parsed)) {
        return formatRenderable(new Date(parsed));
      }
      return `Unknown (unparsed timestamp: ${trimmed})`;
    }

    return "Unknown (unparsed timestamp)";
  } catch {
    return "Unknown (unparsed timestamp)";
  }
}

/**
 * Normalizes authoritative refund status.
 * Canonical writer statuses: PENDING | COMPLETED | FAILED | REJECTED.
 * (`PENDING_APPROVAL` is the order's payment-refund flag used by the POS
 * writer; it is a pending-family alias and never an actionable money state by
 * itself.)
 *
 * Money-safety contract: an unrecognized, missing, or malformed status is
 * NEVER promoted to PENDING. It becomes the explicit UI-only `UNKNOWN`
 * quarantine state, which disables every money action. Only statuses the real
 * writers emit may unlock release/reject/retry.
 */
export function normalizeRefundStatus(rawStatus: unknown, rawDisposition?: unknown): RefundStatus {
  const dispositionDecision =
    rawDisposition && typeof rawDisposition === "object"
      ? (rawDisposition as { decision?: unknown }).decision
      : undefined;
  const dispositionRejected =
    typeof dispositionDecision === "string" && dispositionDecision.trim().toUpperCase() === "REJECTED";

  if (typeof rawStatus === "string") {
    const s = rawStatus.trim().toUpperCase();
    if (s === "REJECTED") return "REJECTED";
    if (s === "COMPLETED") return "COMPLETED";
    if (s === "FAILED") return "FAILED";
    if (s === "PENDING" || s === "PENDING_APPROVAL") return "PENDING";
  }

  // A rejection disposition is authoritative even if the status field is
  // absent or malformed (server writes both; the disposition is the audit row).
  if (dispositionRejected) return "REJECTED";

  return "UNKNOWN";
}

/** Statuses that may expose a money-moving action (release or retry). */
const ACTIONABLE_REFUND_STATUSES: readonly RefundStatus[] = ["PENDING", "FAILED"];

/**
 * Derives gateway payment id from real non-empty fields with fallthrough.
 * Never invents a fake or placeholder payment ID.
 */
export function deriveGatewayPaymentId(raw: RawRefundDoc): string {
  const candidates = [
    raw.razorpayPaymentId,
    raw.paymentId,
    raw.gatewayPaymentId,
  ];

  for (const c of candidates) {
    if (typeof c === "string") {
      const trimmed = c.trim();
      if (trimmed.length > 0 && trimmed !== "undefined" && trimmed !== "null") {
        return trimmed;
      }
    }
  }

  return "";
}

/**
 * Normalizes refund amount in paise.
 * Unknown or missing amount is strictly `null` (NOT zero).
 * Does not fabricate captured money.
 */
export function normalizeRefundAmountPaise(raw: RawRefundDoc): number | null {
  const candidate = typeof raw.amountPaise === "number" ? raw.amountPaise : raw.amount;
  if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
    return Math.round(candidate);
  }
  return null;
}

/**
 * Normalizes one raw Firestore refund document (including POS-cancelled docs)
 * into a safe, strongly-typed RefundDetails contract.
 *
 * The Firestore document ID is preserved VERBATIM — it is the idempotency
 * anchor for release and the target of rejection. Any normalization of it
 * (trimming/case) would silently retarget a different document.
 */
export function normalizeRefundDoc(id: string, raw: RawRefundDoc): RefundDetails {
  const safeId =
    typeof id === "string" && id.length > 0
      ? id
      : typeof raw.id === "string" && raw.id.length > 0
        ? raw.id
        : "refund_unknown";
  const orderId = typeof raw.orderId === "string" && raw.orderId.trim() ? raw.orderId.trim() : "";
  const paymentId = deriveGatewayPaymentId(raw);
  const amountPaise = normalizeRefundAmountPaise(raw);
  const status = normalizeRefundStatus(raw.status, raw.disposition);

  // Safely label customer, store, operator, and justification
  const customerName =
    typeof raw.customerName === "string" && raw.customerName.trim()
      ? raw.customerName.trim()
      : "Unknown Customer";

  const storeName =
    typeof raw.storeName === "string" && raw.storeName.trim()
      ? raw.storeName.trim()
      : typeof raw.branchId === "string" && raw.branchId.trim()
      ? `Store (${raw.branchId.trim()})`
      : "Unknown Store";

  // Processor identity is an audit fact, never a guess: use what the writer
  // recorded, otherwise say Unknown. POS origin is a separate source fact.
  const explicitProcessor =
    typeof raw.processedBy === "string" && raw.processedBy.trim() ? raw.processedBy.trim() : null;
  const decidedBy =
    typeof raw.disposition?.decidedBy === "string" && raw.disposition.decidedBy.trim()
      ? raw.disposition.decidedBy.trim()
      : null;
  const processedBy =
    explicitProcessor ??
    (status === "REJECTED" && decidedBy ? `Rejected by ${decidedBy}` : "Unknown Processor");

  const source = raw.reason === "POS_CANCELLED" ? "Petpooja POS automatic request" : null;

  const reason =
    typeof raw.reason === "string" && raw.reason.trim()
      ? raw.reason.trim()
      : typeof raw.detail === "string" && raw.detail.trim()
      ? raw.detail.trim()
      : "No justification provided";

  const gatewayStatus =
    typeof raw.gatewayStatus === "string" && raw.gatewayStatus.trim()
      ? raw.gatewayStatus.trim()
      : status === "REJECTED"
      ? "rejected"
      : "";

  const createdAt = normalizeDisplayTime(raw.createdAt);
  const completedAt = raw.completedAt ? normalizeDisplayTime(raw.completedAt) : null;

  return {
    id: safeId,
    paymentId,
    orderId,
    customerName,
    storeName,
    amountPaise,
    reason,
    status,
    processedBy,
    source,
    gatewayStatus,
    createdAt,
    completedAt,
    razorpayPaymentId: paymentId || undefined,
    branchId: typeof raw.branchId === "string" ? raw.branchId : null,
    detail: typeof raw.detail === "string" ? raw.detail : null,
  };
}

/**
 * Document-level isolation for the live listener: a single malformed refund
 * document (throwing getter, corrupt nested value) is reported as `null`
 * instead of aborting normalization for every other refund in the snapshot.
 * The caller keeps the remaining records and logs the quarantined id.
 */
export function safeNormalizeRefundDoc(id: string, raw: RawRefundDoc): RefundDetails | null {
  try {
    return normalizeRefundDoc(id, raw);
  } catch {
    return null;
  }
}

export interface RefundReleaseReadiness {
  canRelease: boolean;
  disabledReason?: string;
  amountRupees?: number;
  razorpayPaymentId?: string;
  refundRequestId?: string;
}

/**
 * Assesses whether a refund can be released to the gateway.
 * Enforces:
 * - Status must be an explicit actionable status (PENDING or FAILED). An
 *   UNKNOWN/quarantined, COMPLETED, or REJECTED row can never release.
 * - Payment ID must be present and non-empty.
 * - Amount must be a valid positive number (unknown/missing amount NOT zero).
 * - Deterministic refund request ID generated from the exact document id; an
 *   id that cannot form a safe key blocks release instead of being rewritten.
 */
export function checkRefundReleaseReadiness(r: RefundDetails): RefundReleaseReadiness {
  if (!ACTIONABLE_REFUND_STATUSES.includes(r.status)) {
    return {
      canRelease: false,
      disabledReason:
        r.status === "UNKNOWN"
          ? "Refund status is unrecognized — quarantined for review. No money action is available."
          : `Refund is already ${r.status} — no further payout action is available.`,
    };
  }

  if (!r.paymentId || !r.paymentId.trim()) {
    return {
      canRelease: false,
      disabledReason: "Missing gateway payment ID — release unavailable until capture is linked in Payments.",
    };
  }

  if (r.amountPaise == null || r.amountPaise <= 0) {
    return {
      canRelease: false,
      disabledReason: "Refund amount is unspecified — release blocked to prevent zero or fabricated payout.",
    };
  }

  let refundRequestId: string;
  try {
    // Derived from the VERBATIM document id: buildAdminRefundKey rejects
    // whitespace/unsupported characters rather than trimming into a key that
    // would point at a different document.
    refundRequestId = buildAdminRefundKey(r.id);
  } catch (err) {
    return {
      canRelease: false,
      disabledReason: `Invalid refund doc ID for idempotent release key: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return {
    canRelease: true,
    amountRupees: r.amountPaise / 100,
    razorpayPaymentId: r.paymentId.trim(),
    refundRequestId,
  };
}
