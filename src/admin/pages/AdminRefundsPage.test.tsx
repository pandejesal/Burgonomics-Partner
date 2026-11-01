import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/config/firebase", () => ({
  app: {},
  auth: { currentUser: null },
  db: {},
  messaging: null,
}));

vi.mock("@/core/config/firebase", () => ({
  app: {},
  auth: { currentUser: null },
  db: {},
  messaging: null,
}));

// The live listener is the only Firestore surface under test here: capture the
// snapshot callback so the real listener code path can be driven with a
// deliberately corrupt document alongside a valid one.
const firestoreMocks = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
}));

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    collection: vi.fn(() => ({})),
    query: vi.fn(() => ({})),
    where: vi.fn(() => ({})),
    orderBy: vi.fn(() => ({})),
    limit: vi.fn(() => ({})),
    getDocs: vi.fn(async () => ({ docs: [], forEach: () => {} })),
    onSnapshot: firestoreMocks.onSnapshot,
  };
});

import { AdminRefundsPage } from "./AdminRefundsPage";
import {
  normalizeRefundDoc,
  checkRefundReleaseReadiness,
} from "../services/adminRefundContract";
import { releaseRefundThroughApi } from "../services/refundRelease";
import { filterRefunds, getRefundRowActions } from "./refundsView";
import { adminPaymentsService } from "../services/adminPaymentsService";
import { partnerFunctionsApi } from "@/services/partnerFunctionsApi";
import { buildAdminRefundKey } from "@/utils/refundRequestIdentity";
import type { RefundDetails } from "./paymentsData";

// Authoritative writer shape from functions/src/modules/petpooja/item86ingSync.ts:1235
const rawPetpoojaPosCancel = {
  orderId: "BUR-8201",
  branchId: "str_001",
  razorpayPaymentId: "pay_OK8eF3js92l1",
  amountPaise: 42000,
  reason: "POS_CANCELLED",
  detail: "Cancelled by kitchen operator in Petpooja POS",
  status: "PENDING",
  createdAt: { toDate: () => new Date("2026-07-19T14:12:05.000Z") },
  updatedAt: { toDate: () => new Date("2026-07-19T14:12:05.000Z") },
};

vi.mock("../hooks/useAdmin", () => ({
  useAdmin: () => ({
    role: "brand_owner",
    adminUser: { email: "owner@burgonomics.com", name: "Brand Owner" },
  }),
}));

const renderPage = (refunds: RefundDetails[]) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <AdminRefundsPage initialRefunds={refunds} />
    </MemoryRouter>,
  );

const posRefund = () =>
  normalizeRefundDoc("refund_pos_cancel_BUR-8201", rawPetpoojaPosCancel as any);

describe("AdminRefundsPage - Data Contract & POS Cancel Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders normalized minimal POS-cancel refund doc without any TypeError", () => {
    const html = renderPage([posRefund()]);

    expect(html).toContain("refund_pos_cancel_BUR-8201");
    expect(html).toContain("Store (str_001)");
    expect(html).toContain("Unknown Customer");
    expect(html).toContain("₹420.00");
    expect(html).toContain("Approve Payout");
    // Writer records no processor: the UI must not invent one.
    expect(html).toContain("Auth Operator: Unknown Processor");
    expect(html).not.toContain("POS Kitchen Auto-Cancel");
    // POS origin is shown as its own fact.
    expect(html).toContain("Source: Petpooja POS automatic request");
  });

  it("renders actionable disabled state when gateway payment ID is absent", () => {
    const normalized = normalizeRefundDoc("refund_no_gw", {
      ...rawPetpoojaPosCancel,
      razorpayPaymentId: null,
    } as any);

    const html = renderPage([normalized]);

    // Approve button should be disabled with informative label
    expect(html).toContain("No Gateway ID");
    expect(html).not.toContain("Approve Payout");
  });

  it("renders actionable disabled state when amount is null/unspecified — prevents zero-rupee release", () => {
    const normalized = normalizeRefundDoc("refund_no_amount", {
      ...rawPetpoojaPosCancel,
      amountPaise: null,
    } as any);

    const html = renderPage([normalized]);

    expect(html).toContain("Amount unspecified");
    expect(html).toContain("Amount Unspecified");
    expect(html).not.toContain("Approve Payout");
  });

  it("blocks release and calls NO gateway/refund API when required ID or amount is missing", async () => {
    const releaseSpy = vi
      .spyOn(partnerFunctionsApi, "releaseRefund")
      .mockResolvedValue({ id: "rfnd_test" });

    const docNoGateway = normalizeRefundDoc("doc_no_id", {
      orderId: "BUR-1234",
      amountPaise: 40000,
      status: "PENDING",
    });
    const docNoAmount = normalizeRefundDoc("doc_no_amt", {
      orderId: "BUR-1234",
      razorpayPaymentId: "pay_test123",
      amountPaise: null,
      status: "PENDING",
    });

    expect(checkRefundReleaseReadiness(docNoGateway).canRelease).toBe(false);
    expect(checkRefundReleaseReadiness(docNoAmount).canRelease).toBe(false);

    // Invoke the REAL release handler the Approve/Retry buttons call.
    const noGatewayOutcome = await releaseRefundThroughApi(docNoGateway);
    const noAmountOutcome = await releaseRefundThroughApi(docNoAmount);

    expect(noGatewayOutcome.ok).toBe(false);
    expect(noGatewayOutcome.disabledReason).toContain("Missing gateway payment ID");
    expect(noAmountOutcome.ok).toBe(false);
    expect(noAmountOutcome.disabledReason).toContain("Refund amount is unspecified");
    expect(releaseSpy).not.toHaveBeenCalled();
  });

  it("validates that a valid record retains correct amount in rupees, payment ID, and deterministic refund key", () => {
    const normalized = posRefund();
    const readiness = checkRefundReleaseReadiness(normalized);

    expect(readiness.canRelease).toBe(true);
    expect(readiness.amountRupees).toBe(420);
    expect(readiness.razorpayPaymentId).toBe("pay_OK8eF3js92l1");
    expect(readiness.refundRequestId).toBe(buildAdminRefundKey("refund_pos_cancel_BUR-8201"));
  });

  it("sends the exact validated payload through the real release handler", async () => {
    const releaseSpy = vi
      .spyOn(partnerFunctionsApi, "releaseRefund")
      .mockResolvedValue({ id: "rfnd_released_1", reused: false });

    const outcome = await releaseRefundThroughApi(posRefund());

    expect(outcome.ok).toBe(true);
    expect(releaseSpy).toHaveBeenCalledTimes(1);
    expect(releaseSpy).toHaveBeenCalledWith({
      refundRequestId: "refundreq_refund_pos_cancel_BUR-8201",
      orderId: "BUR-8201",
      razorpayPaymentId: "pay_OK8eF3js92l1",
      amountRupees: 420,
      reason: "POS_CANCELLED",
    });
  });

  it("reports a rejected release honestly instead of claiming money moved", async () => {
    const releaseSpy = vi
      .spyOn(partnerFunctionsApi, "releaseRefund")
      .mockRejectedValue(new Error("gateway 502"));

    const outcome = await releaseRefundThroughApi(posRefund());

    expect(releaseSpy).toHaveBeenCalledTimes(1);
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("gateway 502");
  });

  it("handles search queries safely without crashing on missing properties", () => {
    const normalized = normalizeRefundDoc("refund_pos_cancel_BUR-8201", rawPetpoojaPosCancel as any);
    const docWithEmptyStrings = {
      ...normalized,
      customerName: "",
      paymentId: "",
      orderId: "",
      reason: "",
    };

    expect(() => renderPage([docWithEmptyStrings])).not.toThrow();
  });
});

describe("AdminRefundsPage - money safety for unknown and failed statuses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const buildRefund = (overrides: Record<string, unknown>): RefundDetails =>
    normalizeRefundDoc("refund_pos_cancel_BUR-8201", {
      ...rawPetpoojaPosCancel,
      ...overrides,
    } as any);

  it("quarantines a missing status: labelled unknown, no money action rendered", () => {
    const refund = buildRefund({ status: undefined });
    expect(refund.status).toBe("UNKNOWN");

    const html = renderPage([refund]);

    expect(html).toContain("UNKNOWN");
    expect(html).toContain("Status unverified — refund quarantined");
    expect(html).not.toContain("Approve Payout");
    expect(html).not.toContain("Retry Release");
    expect(html).not.toMatch(/>\s*Reject\s*</);
    expect(html).toContain("1 refund quarantined");
  });

  it("quarantines unrecognized statuses (PROCESSING / misspelled) even with a valid id and amount", () => {
    for (const status of ["PROCESSING", "PENDNG"]) {
      const refund = buildRefund({ status });
      const actions = getRefundRowActions(refund);

      expect(refund.status).toBe("UNKNOWN");
      expect(actions.isQuarantined).toBe(true);
      expect(actions.canApprove).toBe(false);
      expect(actions.canReject).toBe(false);
      expect(actions.canRetry).toBe(false);
      expect(renderPage([refund])).not.toContain("Approve Payout");
    }
  });

  it("makes zero API calls for a quarantined row when the release handler is invoked", async () => {
    const releaseSpy = vi.spyOn(partnerFunctionsApi, "releaseRefund");
    const refund = buildRefund({ status: "PROCESSING" });

    expect(checkRefundReleaseReadiness(refund).canRelease).toBe(false);
    const outcome = await releaseRefundThroughApi(refund);

    expect(outcome.ok).toBe(false);
    expect(outcome.disabledReason).toContain("unrecognized");
    expect(releaseSpy).not.toHaveBeenCalled();
  });

  it("keeps explicit PENDING and FAILED behaviour unchanged", () => {
    const pending = getRefundRowActions(buildRefund({}));
    expect(pending.canApprove).toBe(true);
    expect(pending.canReject).toBe(true);
    expect(pending.canRetry).toBe(false);

    const failed = getRefundRowActions(buildRefund({ status: "FAILED" }));
    expect(failed.canApprove).toBe(false);
    expect(failed.canReject).toBe(false);
    expect(failed.canRetry).toBe(true);
  });

  it("disables FAILED retry with the reason when the gateway ID is missing, and calls nothing", async () => {
    const releaseSpy = vi.spyOn(partnerFunctionsApi, "releaseRefund");
    const refund = buildRefund({ status: "FAILED", razorpayPaymentId: null });

    const actions = getRefundRowActions(refund);
    expect(actions.canRetry).toBe(false);
    expect(actions.releaseDisabledLabel).toBe("No Gateway ID");
    expect(actions.releaseDisabledReason).toContain("Missing gateway payment ID");

    const html = renderPage([refund]);
    expect(html).toContain("No Gateway ID");
    expect(html).not.toContain("Retry Release");
    // The reason reaches the disabled control for assistive tech.
    expect(html).toContain("Missing gateway payment ID — release unavailable until capture is linked in Payments.");

    const outcome = await releaseRefundThroughApi(refund);
    expect(outcome.ok).toBe(false);
    expect(releaseSpy).not.toHaveBeenCalled();
  });

  it("disables FAILED retry when the amount is unspecified, and retries a valid FAILED row exactly", async () => {
    const noAmount = buildRefund({ status: "FAILED", amountPaise: null });
    const noAmountActions = getRefundRowActions(noAmount);
    expect(noAmountActions.canRetry).toBe(false);
    expect(noAmountActions.releaseDisabledLabel).toBe("Amount Unspecified");
    expect(renderPage([noAmount])).not.toContain("Retry Release");

    const releaseSpy = vi
      .spyOn(partnerFunctionsApi, "releaseRefund")
      .mockResolvedValue({ id: "rfnd_retry_1" });
    const validFailed = buildRefund({ status: "FAILED" });

    const html = renderPage([validFailed]);
    expect(html).toContain("Retry Release");

    const outcome = await releaseRefundThroughApi(validFailed);
    expect(outcome.ok).toBe(true);
    expect(releaseSpy).toHaveBeenCalledWith({
      refundRequestId: "refundreq_refund_pos_cancel_BUR-8201",
      orderId: "BUR-8201",
      razorpayPaymentId: "pay_OK8eF3js92l1",
      amountRupees: 420,
      reason: "POS_CANCELLED",
    });
  });

  it("preserves a whitespace-bearing document id verbatim and blocks its release", async () => {
    const releaseSpy = vi.spyOn(partnerFunctionsApi, "releaseRefund");
    const refund = normalizeRefundDoc("  refund_space  ", rawPetpoojaPosCancel as any);

    expect(refund.id).toBe("  refund_space  ");
    expect(renderPage([refund])).toContain("  refund_space  ");

    const outcome = await releaseRefundThroughApi(refund);
    expect(outcome.ok).toBe(false);
    expect(releaseSpy).not.toHaveBeenCalled();
  });
});

describe("AdminRefundsPage - ledger search and live stream resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const pendingPos = () => posRefund();
  const completedRefund = (): RefundDetails =>
    normalizeRefundDoc("rfnd_completed_1", {
      orderId: "BUR-9002",
      razorpayPaymentId: "pay_COMPLETED",
      amountPaise: 15000,
      reason: "Duplicate payment",
      status: "COMPLETED",
      customerName: "Pooja Dave",
    } as any);

  it("narrows the visible rows when a search term is entered", () => {
    const all = [pendingPos(), completedRefund()];

    expect(filterRefunds(all, { activeTab: "ALL", searchQuery: "" })).toHaveLength(2);

    const narrowed = filterRefunds(all, { activeTab: "ALL", searchQuery: "pooja" });
    expect(narrowed).toHaveLength(1);
    expect(narrowed[0].id).toBe("rfnd_completed_1");

    const byOrder = filterRefunds(all, { activeTab: "ALL", searchQuery: "BUR-8201" });
    expect(byOrder).toHaveLength(1);
    expect(byOrder[0].id).toBe("refund_pos_cancel_BUR-8201");

    expect(filterRefunds(all, { activeTab: "ALL", searchQuery: "no-such-refund" })).toHaveLength(0);
  });

  it("keeps tabs honest: quarantined rows never appear under a money-status tab", () => {
    const unknown = normalizeRefundDoc("refund_unknown_status", {
      ...rawPetpoojaPosCancel,
      status: "PROCESSING",
    } as any);
    const all = [pendingPos(), completedRefund(), unknown];

    const allRows = filterRefunds(all, { activeTab: "ALL", searchQuery: "" });
    expect(allRows).toHaveLength(3);
    expect(allRows.filter((r) => r.status === "UNKNOWN")).toHaveLength(1);

    expect(filterRefunds(all, { activeTab: "PENDING", searchQuery: "" })).toHaveLength(1);
    expect(filterRefunds(all, { activeTab: "COMPLETED", searchQuery: "" })).toHaveLength(1);
    expect(filterRefunds(all, { activeTab: "FAILED", searchQuery: "" })).toHaveLength(0);
    expect(filterRefunds(all, { activeTab: "REJECTED", searchQuery: "" })).toHaveLength(0);
  });

  it("keeps valid refunds when one document throws during normalization", () => {
    let snapshotCallback: ((snap: any) => void) | undefined;
    firestoreMocks.onSnapshot.mockImplementation((_query: unknown, next: (snap: any) => void) => {
      snapshotCallback = next;
      return () => {};
    });

    const received: RefundDetails[][] = [];
    adminPaymentsService.listenLiveRefunds(
      (refunds) => received.push(refunds),
      () => {},
      100,
    );

    expect(snapshotCallback).toBeTypeOf("function");

    const corruptDoc = {
      id: "refund_explosive",
      data: () => {
        throw new Error("corrupt document payload");
      },
    };
    const validDoc = {
      id: "refund_pos_cancel_BUR-8201",
      data: () => rawPetpoojaPosCancel,
    };

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    snapshotCallback!({
      forEach: (iterate: (doc: any) => void) => {
        iterate(corruptDoc);
        iterate(validDoc);
      },
    });
    errorSpy.mockRestore();

    expect(received).toHaveLength(1);
    expect(received[0]).toHaveLength(1);
    expect(received[0][0].id).toBe("refund_pos_cancel_BUR-8201");
    expect(received[0][0].amountPaise).toBe(42000);
  });
});
