import { describe, it, expect } from "vitest";
import {
  normalizeRefundDoc,
  normalizeDisplayTime,
  normalizeRefundStatus,
  deriveGatewayPaymentId,
  normalizeRefundAmountPaise,
  checkRefundReleaseReadiness,
  safeNormalizeRefundDoc,
} from "./adminRefundContract";

describe("adminRefundContract - Authoritative POS Cancel & Data Normalization", () => {
  // Authoritative payload shape from functions/src/modules/petpooja/item86ingSync.ts:1235
  const petpoojaPosCancelPayload = {
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

  it("normalizes a minimal POS-cancel document preserving actual doc id, mapping gateway ID and formatting timestamp", () => {
    const docId = "refund_pos_cancel_BUR-8201";
    const normalized = normalizeRefundDoc(docId, petpoojaPosCancelPayload as any);

    expect(normalized.id).toBe(docId);
    expect(normalized.orderId).toBe("BUR-8201");
    // Gateway ID resolved from razorpayPaymentId
    expect(normalized.paymentId).toBe("pay_OK8eF3js92l1");
    expect(normalized.razorpayPaymentId).toBe("pay_OK8eF3js92l1");
    expect(normalized.amountPaise).toBe(42000);
    expect(normalized.status).toBe("PENDING");
    // Timestamp normalized to ISO string
    expect(normalized.createdAt).toBe("2026-07-19T14:12:05.000Z");
    // Safely and honestly labeled unknowns
    expect(normalized.storeName).toBe("Store (str_001)");
    expect(normalized.customerName).toBe("Unknown Customer");
    expect(normalized.reason).toBe("POS_CANCELLED");
  });

  it("preserves null amountPaise when amount is missing or not positive — never invents zero", () => {
    const docWithoutAmount = {
      orderId: "BUR-9999",
      razorpayPaymentId: "pay_XYZ123",
      amountPaise: null,
      status: "PENDING",
    };
    const normalized = normalizeRefundDoc("ref_no_amt", docWithoutAmount as any);
    expect(normalized.amountPaise).toBeNull();

    const docWithZero = {
      orderId: "BUR-9999",
      razorpayPaymentId: "pay_XYZ123",
      amountPaise: 0,
      status: "PENDING",
    };
    const normalizedZero = normalizeRefundDoc("ref_zero", docWithZero as any);
    expect(normalizedZero.amountPaise).toBeNull();
  });

  it("leaves paymentId empty when gateway id is absent — never fabricates captured money or fake IDs", () => {
    const docWithoutGateway = {
      orderId: "BUR-1111",
      amountPaise: 25000,
      status: "PENDING",
    };
    const normalized = normalizeRefundDoc("ref_no_gw", docWithoutGateway as any);
    expect(normalized.paymentId).toBe("");
    expect(normalized.razorpayPaymentId).toBeUndefined();
  });

  it("normalizes canonical REJECTED status from disposition or status field", () => {
    // Shape from functions/src/modules/payments/refundRequests.ts:52-61
    const rejectedDoc = {
      orderId: "BUR-3333",
      razorpayPaymentId: "pay_REJ123",
      amountPaise: 15000,
      status: "REJECTED",
      disposition: {
        decision: "rejected",
        reason: "Customer already collected item",
        decidedBy: "owner@burgonomics.com",
      },
    };
    const normalized = normalizeRefundDoc("ref_rej", rejectedDoc as any);
    expect(normalized.status).toBe("REJECTED");
    expect(normalized.gatewayStatus).toBe("rejected");
    expect(normalized.processedBy).toBe("Rejected by owner@burgonomics.com");
  });

  it("validates release readiness: allows valid POS refund and computes rupees", () => {
    const normalized = normalizeRefundDoc("refund_pos_cancel_BUR-8201", petpoojaPosCancelPayload as any);
    const readiness = checkRefundReleaseReadiness(normalized);

    expect(readiness.canRelease).toBe(true);
    expect(readiness.amountRupees).toBe(420);
    expect(readiness.razorpayPaymentId).toBe("pay_OK8eF3js92l1");
    expect(readiness.refundRequestId).toBe("refundreq_refund_pos_cancel_BUR-8201");
  });

  it("blocks release readiness when gateway ID is missing", () => {
    const doc = normalizeRefundDoc("ref_no_id", {
      orderId: "BUR-1234",
      amountPaise: 50000,
      status: "PENDING",
    });
    const readiness = checkRefundReleaseReadiness(doc);

    expect(readiness.canRelease).toBe(false);
    expect(readiness.disabledReason).toContain("Missing gateway payment ID");
  });

  it("blocks release readiness when amount is null/missing — prevents 0 rupee gateway calls", () => {
    const doc = normalizeRefundDoc("ref_no_amount", {
      orderId: "BUR-1234",
      razorpayPaymentId: "pay_ABC",
      amountPaise: null,
      status: "PENDING",
    });
    const readiness = checkRefundReleaseReadiness(doc);

    expect(readiness.canRelease).toBe(false);
    expect(readiness.disabledReason).toContain("Refund amount is unspecified");
  });

  describe("processor identity is an audit fact, not an invention", () => {
    it("labels the actual POS writer (which records no processedBy) as Unknown Processor", () => {
      const normalized = normalizeRefundDoc(
        "refund_pos_cancel_BUR-8201",
        petpoojaPosCancelPayload as any,
      );

      expect(normalized.processedBy).toBe("Unknown Processor");
      expect(normalized.processedBy).not.toContain("POS Kitchen");
      // Origin is preserved as a SEPARATE fact, not presented as an operator.
      expect(normalized.source).toBe("Petpooja POS automatic request");
    });

    it("preserves an explicit processedBy exactly", () => {
      const normalized = normalizeRefundDoc("ref_explicit", {
        status: "PENDING",
        razorpayPaymentId: "pay_X",
        amountPaise: 1000,
        processedBy: "ops.lead@burgonomics.com",
        reason: "POS_CANCELLED",
      });

      expect(normalized.processedBy).toBe("ops.lead@burgonomics.com");
      expect(normalized.source).toBe("Petpooja POS automatic request");
    });

    it("never invents an operator for a plain document missing both identity fields", () => {
      const normalized = normalizeRefundDoc("ref_anon", {
        status: "PENDING",
        razorpayPaymentId: "pay_X",
        amountPaise: 1000,
      });

      expect(normalized.processedBy).toBe("Unknown Processor");
      expect(normalized.source).toBeNull();
    });
  });

  describe("unknown / missing status is quarantined, never actionable PENDING", () => {
    const baseDoc = {
      orderId: "BUR-8201",
      razorpayPaymentId: "pay_OK8eF3js92l1",
      amountPaise: 42000,
    };

    it("maps every unrecognized or missing status to UNKNOWN", () => {
      for (const status of [undefined, null, "", "   ", "PROCESSING", "PENDNG", 42, {}]) {
        expect(normalizeRefundStatus(status)).toBe("UNKNOWN");
      }
      expect(normalizeRefundStatus(undefined)).toBe("UNKNOWN");
    });

    it("keeps the real writer statuses intact", () => {
      expect(normalizeRefundStatus("PENDING")).toBe("PENDING");
      expect(normalizeRefundStatus("pending_approval")).toBe("PENDING");
      expect(normalizeRefundStatus(" pending ")).toBe("PENDING");
      expect(normalizeRefundStatus("FAILED")).toBe("FAILED");
      expect(normalizeRefundStatus("COMPLETED")).toBe("COMPLETED");
      expect(normalizeRefundStatus("REJECTED")).toBe("REJECTED");
      expect(normalizeRefundStatus(undefined, { decision: "rejected" })).toBe("REJECTED");
    });

    it("blocks every money action for malformed statuses even with a valid ID and amount", () => {
      for (const status of [undefined, "PROCESSING", "PENDNG", 42]) {
        const normalized = normalizeRefundDoc("refund_pos_cancel_BUR-8201", {
          ...baseDoc,
          status,
        } as any);

        expect(normalized.status).toBe("UNKNOWN");
        const readiness = checkRefundReleaseReadiness(normalized);
        expect(readiness.canRelease).toBe(false);
        expect(readiness.disabledReason).toContain("unrecognized");
        expect(readiness.refundRequestId).toBeUndefined();
      }
    });

    it("still allows a FAILED record to be retried (backend-written failure state)", () => {
      const normalized = normalizeRefundDoc("ref_failed", { ...baseDoc, status: "FAILED" });
      const readiness = checkRefundReleaseReadiness(normalized);

      expect(normalized.status).toBe("FAILED");
      expect(readiness.canRelease).toBe(true);
      expect(readiness.amountRupees).toBe(420);
    });

    it("refuses release for COMPLETED and REJECTED rows", () => {
      for (const status of ["COMPLETED", "REJECTED"]) {
        const normalized = normalizeRefundDoc("ref_done", { ...baseDoc, status });
        const readiness = checkRefundReleaseReadiness(normalized);

        expect(readiness.canRelease).toBe(false);
        expect(readiness.disabledReason).toContain("no further payout action");
      }
    });
  });

  describe("Firestore document id is preserved verbatim", () => {
    const baseDoc = {
      orderId: "BUR-8201",
      razorpayPaymentId: "pay_OK8eF3js92l1",
      amountPaise: 42000,
      status: "PENDING",
    };

    it("does not trim leading/trailing whitespace out of the id", () => {
      const actualId = "  refund_space  ";
      const normalized = normalizeRefundDoc(actualId, baseDoc as any);

      expect(normalized.id).toBe(actualId);
      expect(normalized.id).not.toBe(actualId.trim());
    });

    it("blocks release with a key-specific reason when the exact id cannot form a safe key", () => {
      const normalized = normalizeRefundDoc("refund with spaces", baseDoc as any);
      const readiness = checkRefundReleaseReadiness(normalized);

      expect(normalized.id).toBe("refund with spaces");
      expect(readiness.canRelease).toBe(false);
      expect(readiness.disabledReason).toContain("Invalid refund doc ID");
    });

    it("keeps ordinary POS ids and their keys byte-for-byte unchanged", () => {
      const normalized = normalizeRefundDoc("refund_pos_cancel_BUR-8201", baseDoc as any);
      const readiness = checkRefundReleaseReadiness(normalized);

      expect(readiness.canRelease).toBe(true);
      expect(readiness.refundRequestId).toBe("refundreq_refund_pos_cancel_BUR-8201");
    });
  });

  describe("timestamps are total functions — never throw, never [object Object]", () => {
    const fixedIso = "2026-07-19T14:12:05.000Z";
    const fixedDate = new Date(fixedIso);

    it("formats every valid shape", () => {
      const validShapes: unknown[] = [
        fixedDate,
        { toDate: () => fixedDate },
        { seconds: fixedDate.getTime() / 1000, nanoseconds: 0 },
        { _seconds: fixedDate.getTime() / 1000 },
        fixedDate.getTime(), // epoch millis
        fixedDate.getTime() / 1000, // epoch seconds
        fixedIso,
      ];

      for (const shape of validShapes) {
        expect(normalizeDisplayTime(shape)).toBe(fixedIso);
      }
    });

    it("reports unknown/unparsed for every unusable shape without throwing", () => {
      const invalidShapes: unknown[] = [
        null,
        undefined,
        {},
        [],
        "",
        "   ",
        "not-a-date",
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        new Date("nope"),
        { seconds: 1e20 },
        { _seconds: Number.MAX_VALUE },
        { seconds: Number.NaN },
        { seconds: "not-a-number" },
        { toDate: () => new Date("nope") },
        { toDate: () => { throw new Error("corrupt"); } },
        true,
      ];

      for (const shape of invalidShapes) {
        let result = "";
        expect(() => {
          result = normalizeDisplayTime(shape);
        }).not.toThrow();
        expect(result).not.toContain("[object Object]");
        expect(result.startsWith("Unknown")).toBe(true);
      }
    });

    it("keeps valid records intact when one refund carries an out-of-range timestamp", () => {
      const good = normalizeRefundDoc("ref_good", {
        status: "PENDING",
        razorpayPaymentId: "pay_GOOD",
        amountPaise: 42000,
        createdAt: { seconds: fixedDate.getTime() / 1000 },
      });
      const bad = normalizeRefundDoc("ref_bad", {
        status: "PENDING",
        razorpayPaymentId: "pay_BAD",
        amountPaise: 42000,
        createdAt: { seconds: 1e20 },
      });

      expect(good.createdAt).toBe(fixedIso);
      expect(bad.createdAt.startsWith("Unknown")).toBe(true);
    });
  });

  describe("document-level isolation", () => {
    it("returns null for a document that throws during normalization", () => {
      const explosive = {
        get status(): string {
          throw new Error("corrupt doc");
        },
      };

      expect(safeNormalizeRefundDoc("ref_explosive", explosive as any)).toBeNull();
    });

    it("still normalizes the neighbouring valid document", () => {
      const normalized = safeNormalizeRefundDoc("refund_pos_cancel_BUR-8201", {
        orderId: "BUR-8201",
        razorpayPaymentId: "pay_OK8eF3js92l1",
        amountPaise: 42000,
        status: "PENDING",
      } as any);

      expect(normalized).not.toBeNull();
      expect(normalized!.id).toBe("refund_pos_cancel_BUR-8201");
    });
  });

  describe("existing helpers keep their contracts", () => {
    it("derives the gateway id with fallthrough and rejects placeholder strings", () => {
      expect(deriveGatewayPaymentId({ razorpayPaymentId: "pay_A" } as any)).toBe("pay_A");
      expect(deriveGatewayPaymentId({ paymentId: "pay_B" } as any)).toBe("pay_B");
      expect(deriveGatewayPaymentId({ gatewayPaymentId: "pay_C" } as any)).toBe("pay_C");
      expect(deriveGatewayPaymentId({ razorpayPaymentId: "null", paymentId: "pay_D" } as any)).toBe(
        "pay_D",
      );
      expect(deriveGatewayPaymentId({} as any)).toBe("");
    });

    it("rounds positive paise and keeps non-positive amounts unknown", () => {
      expect(normalizeRefundAmountPaise({ amountPaise: 42000.6 } as any)).toBe(42001);
      expect(normalizeRefundAmountPaise({ amount: 1200 } as any)).toBe(1200);
      expect(normalizeRefundAmountPaise({ amountPaise: -5 } as any)).toBeNull();
      expect(normalizeRefundAmountPaise({ amountPaise: Number.NaN } as any)).toBeNull();
      expect(normalizeRefundAmountPaise({} as any)).toBeNull();
    });
  });
});
