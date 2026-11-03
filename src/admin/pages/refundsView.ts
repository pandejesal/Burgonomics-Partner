import type { RefundDetails, RefundStatus, RefundWithdrawReason } from "./paymentsData";
import { checkRefundReleaseReadiness } from "../services/adminRefundContract";

export type RefundTab = "ALL" | RefundStatus;

/**
 * Ledger search + tab projection.
 *
 * Every field is read defensively: a refund document with missing/blank
 * strings must never throw, and an UNKNOWN (quarantined) row is reachable only
 * through the ALL tab — it is never counted as pending.
 */
export function filterRefunds(
  refunds: readonly RefundDetails[],
  filters: { activeTab: RefundTab; searchQuery: string },
): RefundDetails[] {
  const query = filters.searchQuery.toLowerCase();
  return refunds.filter((r) => {
    if (filters.activeTab !== "ALL" && r.status !== filters.activeTab) return false;

    if (query) {
      return (
        (r.id || "").toLowerCase().includes(query) ||
        (r.paymentId || "").toLowerCase().includes(query) ||
        (r.orderId || "").toLowerCase().includes(query) ||
        (r.customerName || "").toLowerCase().includes(query) ||
        (r.reason || "").toLowerCase().includes(query)
      );
    }

    return true;
  });
}

export interface RefundRowActions {
  /** Quarantined: raw status was missing/unrecognized, so no money action exists. */
  isQuarantined: boolean;
  /** Inactive review: machine-owned review closed as withdrawn, no money action exists. */
  isWithdrawn: boolean;
  canApprove: boolean;
  canReject: boolean;
  canRetry: boolean;
  /** Present whenever the release/retry control must render disabled. */
  releaseDisabledReason?: string;
  releaseDisabledLabel?: string;
}

/**
 * Single source of truth for the money controls on one refund row.
 *
 * PENDING exposes Approve/Reject; FAILED exposes Retry. Both release paths are
 * gated by the SAME readiness assessment, so a FAILED row missing a gateway ID
 * or amount renders disabled with the actionable reason instead of an enabled
 * button. UNKNOWN rows — and any other status — expose no money action at all.
 */
export function getRefundRowActions(refund: RefundDetails): RefundRowActions {
  const readiness = checkRefundReleaseReadiness(refund);
  const isPending = refund.status === "PENDING";
  const isFailed = refund.status === "FAILED";
  const isQuarantined = refund.status === "UNKNOWN";
  const isWithdrawn = refund.status === "WITHDRAWN";

  const disabledLabel = !refund.paymentId ? "No Gateway ID" : "Amount Unspecified";

  return {
    isQuarantined,
    isWithdrawn,
    canApprove: isPending && readiness.canRelease,
    canReject: isPending,
    canRetry: isFailed && readiness.canRelease,
    releaseDisabledReason: readiness.canRelease ? undefined : readiness.disabledReason,
    // Only meaningful while a release/retry control is rendered at all.
    releaseDisabledLabel: (isPending || isFailed) && !readiness.canRelease ? disabledLabel : undefined,
  };
}

/** Rows whose status was unreadable, listed for the quarantine summary. */
export function countQuarantinedRefunds(refunds: readonly RefundDetails[]): number {
  return refunds.filter((r) => r.status === "UNKNOWN").length;
}

/** Rows whose review was closed as withdrawn. */
export function countWithdrawnRefunds(refunds: readonly RefundDetails[]): number {
  return refunds.filter((r) => r.status === "WITHDRAWN").length;
}

/**
 * Bounded explanations for WITHDRAWN status reasons.
 *
 * Safe-contract rules:
 * - Accurately describes the known reason without claiming the bank/gateway completed a refund.
 * - Unknown or missing reason falls back to a neutral generic explanation.
 * - Freeform HTML is strictly prevented (returns plain text only).
 */
export function getWithdrawReasonExplanation(
  reason: RefundWithdrawReason | string | null | undefined,
  supersededBy?: string | null,
): string {
  switch (reason) {
    case "fully_refunded":
      return "Order balance was already fully refunded in prior processing; this automated review was closed without initiating another refund.";
    case "superseded_by_decision":
      return supersededBy
        ? `This review was superseded by an operator decision on request ${supersededBy}.`
        : "This review was superseded by an existing operator decision for this order.";
    case "superseded_by_existing_request":
      return supersededBy
        ? `This review was superseded by an active refund request (${supersededBy}).`
        : "This review was superseded by an existing active refund request for this order.";
    case "refund_history_ambiguous":
      return "Refund history for this order contains multiple or conflicting records; automated review was closed for manual audit.";
    default:
      return "This review has been withdrawn and is inactive; no further payout action is available.";
  }
}

export interface RefundMetrics {
  totalCount: number;
  totalVolume: number;
  pendingCount: number;
  pendingVolume: number;
  completedCount: number;
  completedVolume: number;
  failedCount: number;
  failedVolume: number;
  rejectedCount: number;
  rejectedVolume: number;
  withdrawnCount: number;
  unknownCount: number;
}

/**
 * Aggregate metrics over a refund list.
 *
 * Money-safety contract:
 * - Excludes BOTH UNKNOWN (quarantined) and WITHDRAWN (inactive review) amounts from
 *   Total, Pending, and Completed volume calculations.
 * - Preserves coverage and audit count: totalCount includes every row.
 */
export function calculateRefundMetrics(refunds: readonly RefundDetails[]): RefundMetrics {
  const totalCount = refunds.length;

  // Exclude BOTH UNKNOWN and WITHDRAWN amounts from money calculations
  const countableMoneyRows = refunds.filter(
    (r) => r.status !== "UNKNOWN" && r.status !== "WITHDRAWN",
  );
  const totalVolume =
    countableMoneyRows.reduce((sum, r) => sum + (r.amountPaise ?? 0), 0) / 100;

  const pendingList = refunds.filter((r) => r.status === "PENDING");
  const pendingCount = pendingList.length;
  const pendingVolume =
    pendingList.reduce((sum, r) => sum + (r.amountPaise ?? 0), 0) / 100;

  const completedList = refunds.filter((r) => r.status === "COMPLETED");
  const completedCount = completedList.length;
  const completedVolume =
    completedList.reduce((sum, r) => sum + (r.amountPaise ?? 0), 0) / 100;

  const failedList = refunds.filter((r) => r.status === "FAILED");
  const failedCount = failedList.length;
  const failedVolume =
    failedList.reduce((sum, r) => sum + (r.amountPaise ?? 0), 0) / 100;

  const rejectedList = refunds.filter((r) => r.status === "REJECTED");
  const rejectedCount = rejectedList.length;
  const rejectedVolume =
    rejectedList.reduce((sum, r) => sum + (r.amountPaise ?? 0), 0) / 100;

  const withdrawnCount = countWithdrawnRefunds(refunds);
  const unknownCount = countQuarantinedRefunds(refunds);

  return {
    totalCount,
    totalVolume,
    pendingCount,
    pendingVolume,
    completedCount,
    completedVolume,
    failedCount,
    failedVolume,
    rejectedCount,
    rejectedVolume,
    withdrawnCount,
    unknownCount,
  };
}
