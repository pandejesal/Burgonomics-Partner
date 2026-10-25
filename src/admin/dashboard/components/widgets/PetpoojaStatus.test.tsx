import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// F25: the widget rendered "Retry Count: 0" and "Last Pipeline Alert: None" as
// if they were measurements while no sync history had ever been read, under a
// header claiming a live telemetry stream. Mock the data hooks so importing
// the widget never pulls the Firebase-backed dashboard service into this test
// (same convention as SystemHealth.test.ts / KpiSection.trend.test.ts).

vi.mock("../../hooks/useDashboardData", () => ({
  useSyncHealth: vi.fn(() => ({
    data: {
      status: "standby" as const,
      connected: false,
      message: "Awaiting live merchant Petpooja credentials",
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })),
  useSyncHistory: vi.fn(() => ({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })),
  useSyncMutations: vi.fn(() => ({
    triggerPetpoojaSync: vi.fn(),
    isTriggeringPetpooja: false,
    refreshCache: vi.fn(),
    isRefreshingCache: false,
    replayWebhook: vi.fn(),
    isReplayingWebhook: false,
  })),
  SYNC_NOT_WIRED_MESSAGE:
    "Not wired to a server route yet — this action has no backend endpoint, so nothing was run.",
}));

import { PetpoojaStatus, formatRetryCount, formatLastAlert } from "./PetpoojaStatus";
import type { MenuSyncLog } from "../../types";

const completedLog: MenuSyncLog = {
  id: "log-1",
  storeId: "str_001",
  syncType: "FULL",
  status: "COMPLETED",
  version: "v1",
  itemsCreated: 0,
  itemsUpdated: 0,
  itemsDeleted: 0,
  errorMessage: null,
  startedAt: "2026-10-16T10:00:00.000Z",
  finishedAt: "2026-10-16T10:00:01.000Z",
};

describe("F25: PetpoojaStatus reports unknowns, never fabricated measurements", () => {
  it("(a) retry count is unknown until a counter is reported — never '0' or '1 / 3'", () => {
    expect(formatRetryCount(undefined)).toBe("—");
    expect(formatRetryCount([])).toBe("—");
    // A RUNNING log carries no retry counter; the old code invented "1 / 3".
    expect(formatRetryCount([{ ...completedLog, status: "RUNNING", finishedAt: null }])).toBe("—");
  });

  it("(b) last alert separates never-read / clean / failed", () => {
    expect(formatLastAlert(undefined)).toBe("—");
    expect(formatLastAlert([])).toBe("—");
    expect(formatLastAlert([completedLog])).toBe("No alerts recorded");
    expect(formatLastAlert([{ ...completedLog, status: "FAILED", errorMessage: "Bridge timeout" }])).toBe(
      "Bridge timeout",
    );
    // MenuSyncLog allows a null/blank errorMessage on a FAILED log: the failure
    // is still proof of an alert and must never be reported as clean.
    expect(formatLastAlert([{ ...completedLog, status: "FAILED", errorMessage: null }])).toBe(
      "Sync failed — no error details recorded",
    );
    expect(formatLastAlert([{ ...completedLog, status: "FAILED", errorMessage: "   " }])).toBe(
      "Sync failed — no error details recorded",
    );
  });

  it("(c) standby render drops live/middleware claims and shows the disabled reasons", () => {
    const markup = renderToStaticMarkup(<PetpoojaStatus />);

    // Header no longer claims a live telemetry stream while disconnected.
    expect(markup).not.toContain("Petpooja POS Live Gateway");
    expect(markup).not.toContain(
      "Direct telemetry stream from the Petpooja Restaurant ERP middleware",
    );
    expect(markup).toContain("Petpooja POS Gateway");
    expect(markup).toContain("Standby — no live Petpooja gateway telemetry is being read");

    // The fabricated "None" clean-pipeline label is gone.
    expect(markup).not.toContain(">None<");

    // All three actions are disabled and the reason is visible, not tooltip-only.
    expect((markup.match(/disabled=""/g) ?? []).length).toBe(3);
    expect(markup).toContain("All three actions above are unavailable");
    expect(markup).toContain("Not wired to a server route yet");
  });
});
