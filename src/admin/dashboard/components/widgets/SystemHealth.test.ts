import { describe, it, expect, vi } from "vitest";

// P0-5: "Core Cluster Health" standby guard. The widget must key on the
// COUNT of reported telemetry keys — never on object truthiness, because
// `!!(health?.details ?? health?.info)` passed for empty `info: {}` /
// `details: {}` placeholders and rendered fabricated numbers as measured.
// The guard is pure; mock the data hook so importing the widget never
// pulls the Firebase-backed dashboard service into this test.

vi.mock("../../hooks/useDashboardData", () => ({
  useSystemHealth: vi.fn(() => ({ data: { status: "standby" as const } })),
}));

import { hasLiveTelemetry } from "./SystemHealth";
import type { SystemHealthResponse } from "../../types";

describe("P0-5: Core Cluster Health standby guard", () => {
  it("(a) a status-only standby payload reports no live telemetry", () => {
    const standby: SystemHealthResponse = { status: "standby" };
    expect(hasLiveTelemetry(standby)).toBe(false);
    expect(hasLiveTelemetry()).toBe(false);
  });

  it("(b) empty info:{} AND details:{} objects are NOT live telemetry (the exact bug)", () => {
    expect(hasLiveTelemetry({ info: {}, details: {} })).toBe(false);
    expect(hasLiveTelemetry({ info: {} })).toBe(false);
    expect(hasLiveTelemetry({ details: {} })).toBe(false);
  });

  it("(c) a populated details probe IS live telemetry", () => {
    expect(hasLiveTelemetry({ details: { database: { status: "up" } } })).toBe(true);
  });

  it("(d) an info-only payload with a reported uptime IS live telemetry", () => {
    // The backend reports info.uptime as a number (the widget reads it);
    // the declared record type does not model that key, hence the cast.
    const infoOnly = { info: { uptime: 42 } } as unknown as Pick<
      SystemHealthResponse,
      "info" | "details"
    >;
    expect(hasLiveTelemetry(infoOnly)).toBe(true);
  });
});
