import { describe, it, expect, vi } from "vitest";

// P0-4: "Control-room home KPI cards render invented trend percentages
// and sparklines next to real values." The trend / freshness / shifted-
// window helpers are pure; mock the data hooks so importing the widget
// never pulls the Firebase-backed dashboard service into this test
// (same convention as SystemHealth.test.ts).

vi.mock("../../hooks/useDashboardData", () => ({
  useAnalyticsSummary: vi.fn(() => ({ data: undefined })),
  useLiveCounts: vi.fn(() => ({ data: undefined })),
  useRevenueSeries: vi.fn(() => ({ data: undefined })),
  useOrderSeries: vi.fn(() => ({ data: undefined })),
}));

import {
  computeTrend,
  formatFreshness,
  roundOneDecimal,
  shiftRangeByOneDay,
  granularityForRange,
} from "./KpiSection";

describe("P0-4: real trend computation", () => {
  it("(a) computes the delta with correct sign and one-decimal rounding", () => {
    expect(computeTrend(115, 100)).toEqual({ value: 15, isPositive: true });
    expect(computeTrend(85, 100)).toEqual({ value: -15, isPositive: false });
    expect(computeTrend(110.44, 100)).toEqual({ value: 10.4, isPositive: true });
    expect(computeTrend(89.56, 100)).toEqual({ value: -10.4, isPositive: false });
    expect(computeTrend(0, 100)).toEqual({ value: -100, isPositive: false });
    // delta >= 0 → isPositive, including an exact zero
    expect(computeTrend(100, 100)).toEqual({ value: 0, isPositive: true });
  });

  it("(a) rounds halves AWAY from zero at one decimal", () => {
    expect(roundOneDecimal(1.25)).toBe(1.3);
    expect(roundOneDecimal(-1.25)).toBe(-1.3);
    expect(roundOneDecimal(8.25)).toBe(8.3);
    expect(roundOneDecimal(-8.25)).toBe(-8.3);
    expect(roundOneDecimal(12.34)).toBe(12.3);
    expect(roundOneDecimal(-9.86)).toBe(-9.9);
  });

  it("(b) a missing/unavailable side yields NO trend (no chip)", () => {
    expect(computeTrend(5, undefined)).toBeUndefined();
    expect(computeTrend(5, null)).toBeUndefined();
    expect(computeTrend(undefined, 5)).toBeUndefined();
    expect(computeTrend(NaN, 5)).toBeUndefined();
    expect(computeTrend(5, NaN)).toBeUndefined();
  });

  it("(b) a zero baseline yields NO trend (percentage undefined)", () => {
    expect(computeTrend(5, 0)).toBeUndefined();
    expect(computeTrend(0, 0)).toBeUndefined();
  });
});

describe("P0-4: freshness label from dataUpdatedAt", () => {
  const now = 1_800_000_000_000;

  it("(c) never loaded (null / undefined / 0) → —", () => {
    expect(formatFreshness(null, now)).toBe("—");
    expect(formatFreshness(undefined, now)).toBe("—");
    expect(formatFreshness(0, now)).toBe("—");
  });

  it("(c) relative buckets: 5s / 45s / 5m / 3h", () => {
    expect(formatFreshness(now - 5_000, now)).toBe("just now");
    expect(formatFreshness(now - 45_000, now)).toBe("45s ago");
    expect(formatFreshness(now - 300_000, now)).toBe("5m ago");
    expect(formatFreshness(now - 10_800_000, now)).toBe("3h ago");
  });

  it("(c) boundaries and future timestamps stay honest", () => {
    expect(formatFreshness(now - 9_999, now)).toBe("just now");
    // boundary: ≥10s leaves the "just now" bucket (exact label built by
    // the formatter, asserted without re-stating a freshness literal)
    expect(formatFreshness(now - 10_000, now)).not.toBe("just now");
    expect(formatFreshness(now - 3_599_000, now)).toBe("59m ago");
    expect(formatFreshness(now + 5_000, now)).toBe("just now");
  });
});

describe("P0-4: shifted comparison window and series bucketing", () => {
  it("(d) shifts the range by exactly one day, same duration", () => {
    expect(
      shiftRangeByOneDay({
        from: "2026-10-08T00:00:00.000Z",
        to: "2026-10-08T14:30:00.000Z",
      }),
    ).toEqual({ from: "2026-10-07T00:00:00.000Z", to: "2026-10-07T14:30:00.000Z" });
  });

  it("(d) an unparseable range disables the comparison query instead of guessing", () => {
    expect(shiftRangeByOneDay({ from: "", to: "" })).toEqual({ from: "", to: "" });
  });

  it("(d) buckets short ranges by hour and long ranges by day", () => {
    expect(
      granularityForRange({ from: "2026-10-08T00:00:00.000Z", to: "2026-10-08T14:30:00.000Z" }),
    ).toBe("hour");
    expect(
      granularityForRange({ from: "2026-09-08T00:00:00.000Z", to: "2026-10-08T14:30:00.000Z" }),
    ).toBe("day");
  });
});
