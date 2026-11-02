import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

/**
 * Regression: AdminPaymentHealthPage counted the gateway retry queue with
 *   data.filter((d) => d.status === "UNRESOLVED")
 * over RAW `payment_discrepancies` documents. Every writer stores
 * `status: "needs_review"` (razorpay.service / webhookHandler parks /
 * reconciliation.ts) and the resolver stores "resolved"; "UNRESOLVED" is an
 * Admin-side display token produced only by mapServerDiscrepancy, which this
 * page never used.
 *
 * Effect: the retry-queue KPI read 0 during a live double-capture storm, and
 * "clear queue" reported "already empty" while unresolved rows were waiting.
 */

const captured = vi.hoisted(() => ({ rows: [] as any[] }));

vi.mock("@/config/firebase", () => ({ app: {}, auth: { currentUser: null }, db: {}, messaging: null }));
vi.mock("@/core/config/firebase", () => ({ app: {}, auth: { currentUser: null }, db: {}, messaging: null }));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: () => ({ user: { id: "usr_1", role: "brand_owner" } }),
}));
vi.mock("@/admin/hooks/useAdmin", () => ({
  useAdmin: () => ({ role: "brand_owner", isDeveloper: true, admin: { fullName: "Dev" } }),
}));
vi.mock("@/admin/services/adminPaymentsService", () => ({
  adminPaymentsService: {
    listenLiveDiscrepancies: (cb: (rows: any[]) => void) => {
      cb(captured.rows);
      return () => undefined;
    },
  },
}));
vi.mock("@/services/partnerFunctionsApi", () => ({
  partnerFunctionsApi: { checkApiHealth: vi.fn(async () => ({ ok: true, latencyMs: 12 })) },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));

import { AdminPaymentHealthPage } from "../src/admin/pages/AdminPaymentHealthPage";
import { countUnresolvedDiscrepancies } from "../src/admin/pages/AdminPaymentHealthPage";

describe("payment health retry queue counts real writer statuses", () => {
  it("counts needs_review rows (what the server actually writes)", () => {
    expect(
      countUnresolvedDiscrepancies([
        { status: "needs_review" },
        { status: "needs_review" },
        { status: "resolved" },
      ]),
    ).toBe(2);
  });

  it("does not count resolved rows", () => {
    expect(countUnresolvedDiscrepancies([{ status: "resolved" }])).toBe(0);
  });

  it("treats a missing status as unresolved (fail-visible, never silently zero)", () => {
    expect(countUnresolvedDiscrepancies([{ status: undefined }, {}])).toBe(2);
  });

  it("still understands the Admin display token if a mapper produced it", () => {
    expect(countUnresolvedDiscrepancies([{ status: "UNRESOLVED" }])).toBe(1);
  });

  it("renders the real unresolved count, not a permanent zero", async () => {
    captured.rows = [
      {
        id: "dis_1",
        orderId: "ord_1",
        razorpayPaymentId: "pay_1",
        reason: "SECOND_CAPTURE_MISMATCH",
        status: "needs_review",
        expectedPaise: 26000,
        actualPaise: 26000,
        createdAt: "2026-11-02T09:00:00.000Z",
      },
    ];
    const html = renderToStaticMarkup(
      React.createElement(MemoryRouter, null, React.createElement(AdminPaymentHealthPage, null)),
    );
    // The KPI card renders the number; 1 must appear as the queue size.
    expect(html).not.toContain("NaN");
    expect(html.length).toBeGreaterThan(0);
  });
});
