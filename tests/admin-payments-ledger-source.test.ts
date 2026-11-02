import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression: the admin payments ledger listened to a `payments` collection that
 * NO server code writes. `backend/functions/src` contains zero
 * `.collection("payments")` call sites; captures are recorded on the ORDER doc
 * (`payment.*`, both nested and dotted-literal shapes) and in `payment_audits`.
 *
 * Effect of the old read: the ledger was permanently empty, the dashboard's
 * `paymentsCapturedLast24h` was always 0, and `getPaymentReconciliation`
 * reported count/totalPaise/refundedPaise of 0 while real money was captured.
 *
 * The fix derives the ledger from `orders`, which IS the capture source of
 * truth, and reports its own coverage so the UI can state what it can and
 * cannot see instead of implying a complete ledger.
 */

const h = vi.hoisted(() => ({
  docs: [] as Array<{ id: string; data: Record<string, any> }>,
  collections: [] as string[],
}));

vi.mock("@/core/config/firebase", () => ({ db: {} }));
vi.mock("@/config/firebase", () => ({ app: {}, auth: {}, db: {}, messaging: null }));
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => {
    h.collections.push(path);
    return { path };
  },
  query: (ref: any, ...constraints: any[]) => ({ ref, constraints }),
  where: vi.fn((field: string, op: string, value: any) => ({ field, op, value })),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  getDocs: vi.fn(async () => {
    const docs = h.docs.map((d) => ({ id: d.id, data: () => d.data }));
    return {
      docs,
      empty: docs.length === 0,
      size: docs.length,
      forEach: (fn: (d: { id: string; data: () => Record<string, any> }) => void) =>
        docs.forEach(fn),
    };
  }),
  onSnapshot: vi.fn(),
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: { getState: () => ({ user: { role: "brand_owner" } }) },
}));

import { adminPaymentsService } from "@/admin/services/adminPaymentsService";

const capturedOrder = (id: string, over: Record<string, any> = {}) => ({
  id,
  customerId: "cust_1",
  customerName: "Asha Rao",
  customerPhone: "+919820011223",
  branchId: "branch_t1",
  branchName: "Bandra West",
  store: { id: "store_1", name: "Burgonomics Bandra" },
  pricing: { grandTotal: 260 },
  status: { code: "CONFIRMED", label: "Order confirmed", kind: "upcoming", terminal: false },
  payment: {
    status: "completed",
    razorpayPaymentId: "pay_live_1",
    razorpayOrderId: "order_live_1",
    capturedAmountPaise: 26000,
    verifiedAt: "2026-11-02T09:10:00.000Z",
  },
  paymentChannel: "razorpay",
  createdAt: "2026-11-02T09:00:00.000Z",
  ...over,
});

// The mocked onSnapshot is synchronous, but the real snapshot callback runs the
// normalizer per document; capture the callback and await the delivered rows.
const unwrap = async () => {
  const cb = vi.fn();
  const { onSnapshot } = await import("firebase/firestore");
  adminPaymentsService.listenLiveTransactions(cb);
  const calls = (onSnapshot as unknown as { mock: { calls: any[][] } }).mock.calls;
  const snapshotFn = calls[calls.length - 1][1] as (snap: any) => void;
  const snap = await (
    await import("firebase/firestore")
  ).getDocs({} as never);
  snapshotFn(snap);
  const last = cb.mock.calls[cb.mock.calls.length - 1];
  return last ? last[0] : undefined;
};

describe("admin payments ledger reads real capture truth", () => {
  beforeEach(() => {
    h.docs.length = 0;
    h.collections.length = 0;
    vi.clearAllMocks();
  });

  it("never reads the unwritten `payments` collection", async () => {
    h.docs.push({ id: "ord_1", data: capturedOrder("ord_1") });
    await unwrap();
    expect(h.collections).not.toContain("payments");
    expect(h.collections).toContain("orders");
  });

  it("derives a captured transaction from a real order doc (nested payment map)", async () => {
    h.docs.push({ id: "ord_1", data: capturedOrder("ord_1") });
    const rows = await unwrap();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      orderId: "ord_1",
      amountPaise: 26000,
      currency: "INR",
      gateway: "razorpay",
      gatewayPaymentId: "pay_live_1",
      status: "CAPTURED",
      verificationStatus: "VERIFIED",
    });
    expect(rows[0].customer.name).toBe("Asha Rao");
    expect(rows[0].store.name).toBe("Burgonomics Bandra");
    expect(rows[0].capturedAt).toBe("2026-11-02T09:10:00.000Z");
  });

  it("derives a captured transaction from the dotted-literal payment shape too", async () => {
    const order = capturedOrder("ord_2");
    delete (order as any).payment;
    (order as any)["payment.status"] = "completed";
    (order as any)["payment.razorpayPaymentId"] = "pay_live_2";
    (order as any)["payment.capturedAmountPaise"] = 26000;
    h.docs.push({ id: "ord_2", data: order });

    const rows = await unwrap();
    expect(rows).toHaveLength(1);
    expect(rows[0].gatewayPaymentId).toBe("pay_live_2");
    expect(rows[0].amountPaise).toBe(26000);
  });

  it("falls back to the priced grandTotal when no capturedAmountPaise was stamped", async () => {
    const order = capturedOrder("ord_3");
    delete (order as any).payment.capturedAmountPaise;
    h.docs.push({ id: "ord_3", data: order });
    const rows = await unwrap();
    expect(rows[0].amountPaise).toBe(26000);
  });

  it("drops an unpaid order instead of rendering it as a captured payment", async () => {
    h.docs.push({
      id: "ord_unpaid",
      data: capturedOrder("ord_unpaid", {
        payment: { status: "pending", razorpayPaymentId: null },
      }),
    });
    const rows = await unwrap();
    expect(rows).toEqual([]);
  });

  it("marks a refunded order REFUNDED from the order's own refund state", async () => {
    h.docs.push({
      id: "ord_ref",
      data: capturedOrder("ord_ref", {
        refundStatus: "refunded",
        refundedTotalPaise: 26000,
        refundAmount: 260,
      }),
    });
    const rows = await unwrap();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("REFUNDED");
  });

  it("marks a partially refunded order PARTIALLY_REFUNDED", async () => {
    h.docs.push({
      id: "ord_pref",
      data: capturedOrder("ord_pref", {
        refundStatus: "partially_refunded",
        refundedTotalPaise: 10000,
      }),
    });
    const rows = await unwrap();
    expect(rows[0].status).toBe("PARTIALLY_REFUNDED");
  });

  it("reports its own read coverage so the UI need not imply a complete ledger", () => {
    const coverage = adminPaymentsService.ledgerCoverage();
    expect(coverage.source).toBe("orders");
    // A bounded read is stated as bounded; it is never presented as exhaustive.
    expect(coverage.bounded).toBe(true);
    expect(coverage.limit).toBeGreaterThan(0);
    expect(coverage.statement.length).toBeGreaterThan(0);
  });

  it("drops a malformed order rather than throwing away the whole ledger", async () => {
    h.docs.push({ id: "ord_1", data: capturedOrder("ord_1") });
    h.docs.push({ id: "ord_bad", data: { id: "ord_bad", payment: "completed" } });
    const rows = await unwrap();
    expect(rows).toHaveLength(1);
    expect(rows[0].orderId).toBe("ord_1");
  });
});
