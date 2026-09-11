import { describe, it, expect } from "vitest";
import { markStoresSynced } from "./AdminStoresPage";
import { INITIAL_RICH_STORES } from "./storesData";

// Loop 57/120: the stores-page Petpooja sync buttons used to stamp every
// row active with a fabricated random menuVersion and zero server contact.
// Now only genuinely-synced stores are stamped — failed/untouched rows must
// keep their existing state, and no version may be invented.
describe("Loop 57: honest Petpooja sync stamping", () => {
  it("stamps only the synced store, leaving other rows untouched", () => {
    const now = new Date().toISOString();
    const first = INITIAL_RICH_STORES[0];
    const second = INITIAL_RICH_STORES[1];
    const out = markStoresSynced([first, second], new Set([first.id]), now);
    expect(out[0].webhookStatus).toBe("active");
    expect(out[0].circuitBreaker).toBe("closed");
    expect(out[0].lastSyncTime).toBe(now);
    expect(out[0].webhookFailures).toBe(0);
    expect(out[0].retryCount).toBe(0);
    expect(out[1]).toEqual(second);
  });

  it("does not fabricate menuVersion on sync", () => {
    const before = INITIAL_RICH_STORES[0].menuVersion;
    const out = markStoresSynced(
      [INITIAL_RICH_STORES[0]],
      new Set([INITIAL_RICH_STORES[0].id]),
      new Date().toISOString(),
    );
    expect(out[0].menuVersion).toBe(before);
  });

  it("an empty sync set changes nothing", () => {
    const rows = INITIAL_RICH_STORES.slice(0, 2);
    expect(markStoresSynced(rows, new Set(), new Date().toISOString())).toEqual(
      rows,
    );
  });
});
