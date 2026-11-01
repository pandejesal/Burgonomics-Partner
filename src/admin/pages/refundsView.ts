import type { RefundDetails, RefundStatus } from "./paymentsData";
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

  const disabledLabel = !refund.paymentId ? "No Gateway ID" : "Amount Unspecified";

  return {
    isQuarantined,
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
