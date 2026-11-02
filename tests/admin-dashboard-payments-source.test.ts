/**
 * Regression: DashboardService.fetchPayments() read a `payments` collection that
 * no server code writes, so `paymentsCapturedLast24h`, the payments list and the
 * reconciliation totals were permanently 0 while real money was captured.
 *
 * Captures live on the ORDER doc (`payment` map, or the dotted-literal
 * `payment.*` keys for older merge-set writes). These rows are the shapes
 * Firestore really holds.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  collections: [] as string[],
}));

vi.mock("@/core/config/firebase", () => ({ db: {} }));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: { getState: () => ({ user: { role: "brand_owner" } }) },
}));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, path: string) => {
    state.collections.push(path);
    return { path };
  }),
  collectionGroup: vi.fn(),
  query: vi.fn((ref: any) => ref),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  doc: vi.fn(() => ({})),
  Timestamp: class {},
  getDocs: vi.fn(async () => ({
    size: state.rows.length,
    docs: state.rows.map((row, index) => ({ id: `ord_${index}`, data: () => row })),
    forEach: (cb: (doc: { id: string; data: () => Record<string, unknown> }) => void) =>
      state.rows.forEach((row, index) => cb({ id: `ord_${index}`, data: () => row })),
  })),
}));

import { DashboardService } from "../src/admin/dashboard/services/dashboardService";

const svc = new DashboardService();

const capturedOrder = (over: Record<string, unknown> = {}) => ({
  createdAt: "2026-11-02T09:00:00.000Z",
  branchId: "branch_t1",
  pricing: { grandTotal: 260 },
  paymentChannel: "razorpay",
  paymentMethod: "razorpay",
  payment: {
    status: "completed",
    razorpayPaymentId: "pay_live_1",
    capturedAmountPaise: 26000,
    verifiedAt: "2026-11-02T09:10:00.000Z",
  },
  ...over,
});

const payments = async () => {
  const privateSvc = svc as unknown as { fetchPayments: () => Promise<any[]> };
  return privateSvc.fetchPayments();
};

describe("dashboard payments read real capture truth from orders", () => {
  beforeEach(() => {
    state.rows.length = 0;
    state.collections.length = 0;
  });

  it("never queries the unwritten payments collection", async () => {
    state.rows.push(capturedOrder());
    await payments();
    expect(state.collections).not.toContain("payments");
    expect(state.collections).toContain("orders");
  });

  it("counts a captured order with the LIVE captured amount in paise", async () => {
    state.rows.push(capturedOrder());
    const rows = await payments();
    expect(rows).toHaveLength(1);
    expect(rows[0].amountPaise).toBe(26000);
    expect(rows[0].status).toBe("CAPTURED");
    expect(rows[0].gatewayPaymentId).toBe("pay_live_1");
  });

  it("excludes an unpaid online order (it is not a payment)", async () => {
    state.rows.push(
      capturedOrder({ payment: { status: "pending", razorpayPaymentId: null } }),
    );
    expect(await payments()).toEqual([]);
  });

  it("reads the dotted-literal payment shape older writers produced", async () => {
    state.rows.push({
      createdAt: "2026-11-02T09:00:00.000Z",
      branchId: "branch_t1",
      pricing: { grandTotal: 260 },
      paymentChannel: "razorpay",
      "payment.status": "completed",
      "payment.razorpayPaymentId": "pay_live_2",
      "payment.capturedAmountPaise": 26000,
    });
    const rows = await payments();
    expect(rows).toHaveLength(1);
    expect(rows[0].gatewayPaymentId).toBe("pay_live_2");
    expect(rows[0].amountPaise).toBe(26000);
  });

  it("marks a refunded capture REFUNDED", async () => {
    state.rows.push(capturedOrder({ refundStatus: "refunded" }));
    const rows = await payments();
    expect(rows[0].status).toBe("REFUNDED");
  });

  it("drops a captured order with no usable amount instead of reporting zero", async () => {
    state.rows.push(
      capturedOrder({ pricing: {}, payment: { status: "completed", razorpayPaymentId: "pay_x" } }),
    );
    expect(await payments()).toEqual([]);
  });
});
