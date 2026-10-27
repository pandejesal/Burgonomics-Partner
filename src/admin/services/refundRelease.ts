import type { RefundDetails } from "../pages/paymentsData";
import { checkRefundReleaseReadiness } from "./adminRefundContract";
import { partnerFunctionsApi } from "@/services/partnerFunctionsApi";

export interface RefundReleaseInput {
  refundRequestId: string;
  orderId: string;
  razorpayPaymentId: string;
  amountRupees: number;
  reason: string;
}

export interface RefundReleaseApi {
  releaseRefund: (input: RefundReleaseInput) => Promise<unknown>;
}

export interface RefundReleaseOutcome {
  ok: boolean;
  /** Set when the row is not releasable; the caller surfaces it, no API call was made. */
  disabledReason?: string;
  /** Set when the API call rejected. */
  error?: string;
  reused?: boolean;
  id?: string;
}

/**
 * The single release path used by both "Approve Payout" and "Retry Release".
 *
 * Builds the request from the readiness assessment only — never from raw row
 * fields — so the amount, gateway id, and deterministic idempotency key that
 * reach the server are exactly the validated ones. A non-releasable row exits
 * before any API call. The API is injectable so tests exercise this real
 * handler against a spy instead of a re-implementation.
 */
export async function releaseRefundThroughApi(
  refund: RefundDetails,
  api: Pick<RefundReleaseApi, "releaseRefund"> = partnerFunctionsApi,
): Promise<RefundReleaseOutcome> {
  const readiness = checkRefundReleaseReadiness(refund);
  if (!readiness.canRelease) {
    return { ok: false, disabledReason: readiness.disabledReason };
  }

  try {
    const response = (await api.releaseRefund({
      refundRequestId: readiness.refundRequestId!,
      orderId: refund.orderId,
      razorpayPaymentId: readiness.razorpayPaymentId!,
      amountRupees: readiness.amountRupees!,
      reason: refund.reason,
    })) as { reused?: unknown; id?: unknown } | null;

    return {
      ok: true,
      reused: Boolean(response?.reused),
      id: typeof response?.id === "string" ? response.id : refund.id,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
