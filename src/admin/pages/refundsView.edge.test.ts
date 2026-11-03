/**
 * Edge cases for the refund ledger projection:
 *  - money columns exclude quarantined (UNKNOWN) and withdrawn rows while the
 *    audit counts still include them,
 *  - a list made ONLY of those rows moves zero rupees,
 *  - missing amounts never produce NaN,
 *  - no row action is offered for UNKNOWN / WITHDRAWN / COMPLETED / REJECTED,
 *  - normalizeRefundStatus precedence between the raw status and the
 *    disposition audit row.
 *
 * The existing AdminRefundsPage suite covers the page render for UNKNOWN and
 * WITHDRAWN and the PENDING/FAILED controls; this file pins the pure contract.
 */
import { describe, expect, it } from "vitest";
import { calculateRefundMetrics, getRefundRowActions } from "./refundsView";
import { normalizeRefundDoc, normalizeRefundStatus } from "../services/adminRefundContract";

const base = {
  orderId: "BUR-EDGE-1",
  razorpayPaymentId: "pay_edge_1",
  reason: "fixture",
  customerName: "Fixture Customer",
};

const refund = (id: string, status: unknown, amountPaise: number | null, extra: Record<string, unknown> = {}) =>
  normalizeRefundDoc(id, { ...base, status, amountPaise, ...extra } as any);
const MIXED = [
  refund("rfnd_pending", "PENDING", 42000),
  refund("rfnd_completed", "COMPLETED", 15000),
  refund("rfnd_failed", "FAILED", 20000),
  refund("rfnd_rejected", "REJECTED", 30000),
  refund("rfnd_unknown", "PROCESSING", 50000),
  refund("rfnd_withdrawn", "WITHDRAWN", 42000, { withdrawReason: "fully_refunded" }),
];

describe("calculateRefundMetrics with mixed quarantined/withdrawn rows", () => {
  it("counts every row but keeps quarantined and withdrawn money out of every volume", () => {
    const metrics = calculateRefundMetrics(MIXED);

    // Counts include everything, including the two non-money rows.
    expect(metrics.totalCount).toBe(6);
    expect(metrics.unknownCount).toBe(1);
    expect(metrics.withdrawnCount).toBe(1);
    expect(metrics.pendingCount).toBe(1);
    expect(metrics.completedCount).toBe(1);
    expect(metrics.failedCount).toBe(1);
    expect(metrics.rejectedCount).toBe(1);

    // ₹420 + ₹150 + ₹200 + ₹300; the ₹500 quarantined and ₹420 withdrawn
    // amounts are excluded from the headline total.
    expect(metrics.totalVolume).toBe(1070);
    expect(metrics.totalVolume).not.toBe(1570); // would include the quarantined row
    expect(metrics.totalVolume).not.toBe(1990); // would include both excluded rows

    expect(metrics.pendingVolume).toBe(420);
    expect(metrics.completedVolume).toBe(150);
    expect(metrics.failedVolume).toBe(200);
    expect(metrics.rejectedVolume).toBe(300);
  });

  it("moves zero rupees for a ledger made only of quarantined and withdrawn rows", () => {
    const metrics = calculateRefundMetrics([
      refund("rfnd_only_unknown", "PROCESSING", 50000),
      refund("rfnd_only_withdrawn", "WITHDRAWN", 42000, { withdrawReason: "refund_history_ambiguous" }),
    ]);

    expect(metrics).toMatchObject({
      totalCount: 2,
      unknownCount: 1,
      withdrawnCount: 1,
      totalVolume: 0,
      pendingVolume: 0,
      completedVolume: 0,
      failedVolume: 0,
      rejectedVolume: 0,
    });
  });

  it("treats a missing amount as no money rather than NaN or zero-filled volume", () => {
    const metrics = calculateRefundMetrics([
      refund("rfnd_no_amount_pending", "PENDING", null),
      refund("rfnd_no_amount_unknown", "PROCESSING", null),
      refund("rfnd_no_amount_withdrawn", "WITHDRAWN", null),
    ]);

    expect(metrics.totalCount).toBe(3);
    expect(metrics.pendingCount).toBe(1);
    expect(metrics.unknownCount).toBe(1);
    expect(metrics.withdrawnCount).toBe(1);
    for (const volume of [metrics.totalVolume, metrics.pendingVolume, metrics.completedVolume, metrics.failedVolume, metrics.rejectedVolume]) {
      expect(Number.isFinite(volume)).toBe(true);
      expect(volume).toBe(0);
    }
  });

  it("returns a zeroed ledger for an empty list", () => {
    expect(calculateRefundMetrics([])).toEqual({
      totalCount: 0,
      totalVolume: 0,
      pendingCount: 0,
      pendingVolume: 0,
      completedCount: 0,
      completedVolume: 0,
      failedCount: 0,
      failedVolume: 0,
      rejectedCount: 0,
      rejectedVolume: 0,
      withdrawnCount: 0,
      unknownCount: 0,
    });
  });
});

describe("getRefundRowActions exposes no money control for terminal/quarantined rows", () => {
  it.each([
    ["UNKNOWN", "PROCESSING", "unrecognized"],
    ["WITHDRAWN", "WITHDRAWN", "withdrawn"],
    ["COMPLETED", "COMPLETED", "already COMPLETED"],
    ["REJECTED", "REJECTED", "already REJECTED"],
  ])("offers no approve/retry/reject for %s", (_label, rawStatus, reasonSnippet) => {
    const row = refund(`rfnd_${String(_label).toLowerCase()}`, rawStatus, 42000);
    const actions = getRefundRowActions(row);

    expect(actions.canApprove).toBe(false);
    expect(actions.canRetry).toBe(false);
    expect(actions.canReject).toBe(false);
    // No control is rendered for these statuses, so no disabled label either.
    expect(actions.releaseDisabledLabel).toBeUndefined();
    expect(actions.releaseDisabledReason).toContain(reasonSnippet);
  });

  it("still exposes the controls for an actionable PENDING row (guard against a vacuous assertion)", () => {
    const actions = getRefundRowActions(refund("rfnd_guard_pending", "PENDING", 42000));
    expect(actions).toMatchObject({ canApprove: true, canReject: true, canRetry: false, isQuarantined: false, isWithdrawn: false });
  });
});

describe("normalizeRefundStatus precedence", () => {
  it("keeps WITHDRAWN ahead of a rejected disposition", () => {
    expect(normalizeRefundStatus("WITHDRAWN", { decision: "REJECTED" })).toBe("WITHDRAWN");
    expect(normalizeRefundStatus(" withdrawn ", { decision: " rejected " })).toBe("WITHDRAWN");
  });

  it("keeps an explicit REJECTED status even with no disposition", () => {
    expect(normalizeRefundStatus("REJECTED")).toBe("REJECTED");
    expect(normalizeRefundStatus("rejected", undefined)).toBe("REJECTED");
    expect(normalizeRefundStatus("REJECTED", { decision: null })).toBe("REJECTED");
    expect(normalizeRefundStatus("REJECTED", { decision: "approved" })).toBe("REJECTED");
  });

  it("uses a rejected disposition as the audit truth when the status is missing or malformed", () => {
    expect(normalizeRefundStatus(undefined, { decision: "rejected" })).toBe("REJECTED");
    expect(normalizeRefundStatus(null, { decision: "REJECTED" })).toBe("REJECTED");
    expect(normalizeRefundStatus("PROCESSING", { decision: "rejected" })).toBe("REJECTED");
    expect(normalizeRefundStatus("", { decision: "rejected" })).toBe("REJECTED");
  });

  it("quarantines an unknown string or null status without a rejection disposition", () => {
    expect(normalizeRefundStatus("PROCESSING")).toBe("UNKNOWN");
    expect(normalizeRefundStatus("pending_review", { decision: "approved" })).toBe("UNKNOWN");
    expect(normalizeRefundStatus(null)).toBe("UNKNOWN");
    expect(normalizeRefundStatus(null, null)).toBe("UNKNOWN");
    // A non-object disposition cannot be read as a rejection.
    expect(normalizeRefundStatus(null, "rejected")).toBe("UNKNOWN");
  });
});
