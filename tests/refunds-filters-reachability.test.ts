/**
 * Live UI finding 13 (partner, 1024px): the refund filter strip held ~552px of
 * labels in a ~397px column, so REJECTED rendered as "REJ" and WITHDRAWN sat
 * entirely off the strip with no scroll affordance. Two of six filters were
 * unreachable, and the search placeholder clipped mid-word.
 *
 * Source-contract assertions, deliberately: the page needs auth, live listeners
 * and the full admin shell to render, and a test that faked all of that would
 * assert the fake rather than the layout rule. The behavioural contract of the
 * page is covered by AdminRefundsPage's own suite and refundsView.edge.test.ts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "../src/admin/pages/AdminRefundsPage.tsx"), "utf8");

/** The filter tab strip region. */
function tabStrip(): string {
  const start = SRC.indexOf('role="tablist"');
  const end = SRC.indexOf("Search bar", start);
  if (start < 0 || end < 0) throw new Error("tab strip region not found");
  return SRC.slice(start, end);
}

describe("refund filter tabs stay reachable at narrow widths", () => {
  it("wraps instead of clipping a scrollable strip with no affordance", () => {
    const strip = tabStrip();
    expect(strip).toContain("flex-wrap");
    // The defect classes: a nowrap row that scrolls invisibly.
    expect(strip).not.toContain("overflow-x-auto");
  });

  it("never shrinks a tab label to a fragment", () => {
    const strip = tabStrip();
    expect(strip).toContain("whitespace-nowrap");
    // flex-1 was what squeezed "REJECTED" down to "REJ".
    expect(strip).not.toContain("flex-1");
  });

  it("renders all six filters including Withdrawn", () => {
    const strip = tabStrip();
    for (const tab of ["ALL", "PENDING", "COMPLETED", "FAILED", "REJECTED", "WITHDRAWN"]) {
      expect(strip).toContain(`"${tab}"`);
    }
    expect(strip).toContain('"Withdrawn"');
  });

  it("exposes the strip as a labelled tablist with selected state", () => {
    const strip = tabStrip();
    expect(strip).toContain('role="tablist"');
    expect(strip).toContain('aria-label="Refund status filters"');
    expect(strip).toContain('role="tab"');
    expect(strip).toContain("aria-selected");
  });

  it("names the search field instead of relying on a clipped placeholder", () => {
    const search = SRC.slice(SRC.indexOf("Search bar"), SRC.indexOf("metrics.unknownCount"));
    expect(search).toContain('aria-label="Search refunds by customer or order ID"');
    expect(search).toContain('placeholder="Search customer or order ID"');
    // The old placeholder was long enough to clip mid-word.
    expect(search).not.toContain("Search refunds directory by customer, order ID...");
  });
});
