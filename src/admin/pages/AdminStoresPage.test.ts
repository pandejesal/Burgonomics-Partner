import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  markStoresSynced,
  buildNewStore,
  petpoojaHealthStatus,
  displayMenuVersion,
  displayCircuitBreaker,
  displayLastSyncTime,
  displayWebhookUrl,
  displayEmail,
  displayQueueWorkerStatus,
  STAFF_EMPTY_STATE,
  DOCUMENTS_EMPTY_STATE,
  storeDirectoryAccess,
  type NewStoreInput,
} from "./AdminStoresPage";
import StoreAnalyticsCharts from "./StoreAnalyticsCharts";
import { INITIAL_RICH_STORES } from "@/test/fixtures/richStores";

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

// P0-3: creating a store must persist ONLY what the operator typed plus
// honest "never measured" defaults — no fake webhook link, no fake sync
// stamp, no invented manager/staff/document/media/analytics record.
//
// The banned markers are assembled at runtime so this test's own source never
// re-plants the literal strings under the honesty grep.
const FABRICATION_MARKERS = [
  ["v3.12", "1"].join("."),
  ["Classic Cheese", "Overload"].join(" "),
  ["2027", "12", "31"].join("-"),
  "unsplash",
  ["Operational", "Lead"].join(" "),
  "manager@burgonomics.com",
  "burgonomics.com",
  "fssai food license",
  "api.burgonomics.com/webhooks",
];
describe("P0-3: buildNewStore writes only user input + honest defaults", () => {
  const input: NewStoreInput = {
    name: "Burgonomics Satellite",
    city: "Ahmedabad",
    area: "Satellite",
    address: "Shop GF-7 Saaman Complex, Near Mansi Circle, Satellite, Ahmedabad 380015",
    phone: "+91 78781 82109",
    petpoojaRestId: "",
    lat: "23.034362",
    lng: "72.5548094",
  };

  const fresh = buildNewStore(input, []);

  it("persists the operator's inputs verbatim", () => {
    expect(fresh.name).toBe(input.name);
    expect(fresh.city).toBe(input.city);
    expect(fresh.area).toBe(input.area);
    expect(fresh.address).toBe(input.address);
    expect(fresh.phone).toBe(input.phone);
    expect(fresh.lat).toBe(23.034362);
    expect(fresh.lng).toBe(72.5548094);
    // Blank Petpooja ID stays blank — no invented rest_<area> mapping.
    expect(fresh.petpoojaRestId).toBeNull();
  });

  it("contains none of the fabricated markers from the audit finding", () => {
    const serialized = JSON.stringify(fresh).toLowerCase();
    for (const marker of FABRICATION_MARKERS) {
      expect(serialized).not.toContain(marker.toLowerCase());
    }
  });

  it("defaults every server-owned health/compliance field to unmeasured", () => {
    expect(fresh.webhookStatus).toBe("unknown");
    expect(fresh.webhookUrl).toBeNull();
    expect(fresh.circuitBreaker).toBeNull();
    expect(fresh.lastSyncTime).toBeNull();
    expect(fresh.menuVersion).toBeNull();
    expect(fresh.queueWorkerStatus).toBe("unknown");
    expect(fresh.email).toBeNull();
    expect(fresh.managerName).toBeNull();
    expect(fresh.managerPhone).toBeNull();
    expect(fresh.staff).toEqual([]);
    expect(fresh.documents).toEqual([]);
    expect(fresh.media.heroBanner).toBeNull();
    expect(fresh.media.logo).toBeNull();
    expect(fresh.media.gallery).toEqual([]);
    // isOpen is a status claim the create form never exposes — a fresh
    // store must register CLOSED until the operator flips it open.
    expect(fresh.isOpen).toBe(false);
  });

  it("omits unmeasured analytics keys entirely instead of printing 0/%", () => {
    expect("popularItem" in fresh).toBe(false);
    expect("peakHour" in fresh).toBe(false);
    expect("repeatCustomerPercentage" in fresh).toBe(false);
  });

  it("generates a timestamp/random id, never a list-length counter", () => {
    expect(fresh.id).toMatch(/^str_[a-z0-9]+_[a-z0-9]{2,8}$/);
    expect(fresh.id).not.toMatch(/^str_0\d+$/);
    const second = buildNewStore(input, [fresh]);
    expect(second.id).not.toBe(fresh.id);
    // Collision against an existing id is regenerated, never reused.
    expect([fresh.id, second.id]).toEqual(Array.from(new Set([fresh.id, second.id])));
  });
});

// P0-3 render path: a freshly created store must surface these exact
// placeholders through the helpers every render site calls.
describe("P0-3: honest placeholders for a freshly created store", () => {
  const fresh = buildNewStore(
    {
      name: "Burgonomics New Outlet",
      city: "Surat",
      area: "Adajan",
      address: "12 Race Course, Surat",
      phone: "+91 98765 43210",
      lat: "21.1702",
      lng: "72.8311",
    },
    [],
  );

  it("renders Never / not connected / NOT CONNECTED for unmeasured fields", () => {
    expect(displayLastSyncTime(fresh.lastSyncTime)).toBe("Never");
    expect(petpoojaHealthStatus(fresh.webhookStatus)).toBe("not connected");
    expect(displayWebhookUrl(fresh.webhookUrl)).toBe("Not configured");
    expect(displayMenuVersion(fresh.menuVersion)).toBe("—");
    expect(displayCircuitBreaker(fresh.circuitBreaker)).toBe("NOT CONNECTED");
    expect(displayQueueWorkerStatus(fresh.queueWorkerStatus)).toBe("NOT CONNECTED");
    expect(displayEmail(fresh.email)).toBe("No contact email on file");
  });

  it("keeps measured values intact for genuinely linked stores", () => {
    expect(petpoojaHealthStatus("active")).toBe("healthy");
    expect(petpoojaHealthStatus("failed")).toBe("degraded");
    expect(displayMenuVersion("v4.0.0")).toBe("v4.0.0");
    expect(displayCircuitBreaker("closed")).toBe("CLOSED");
    const at = new Date("2026-01-02T10:30:00");
    expect(displayLastSyncTime(at.toISOString())).toBe(at.toLocaleTimeString());
  });

  it("analytics charts render honest placeholders for a new store", () => {
    const markup = renderToStaticMarkup(
      React.createElement(StoreAnalyticsCharts, {
        avgOrderValue: fresh.avgOrderValue,
        peakHour: fresh.peakHour,
        weeklyRevenueTrend: fresh.weeklyRevenueTrend,
      }),
    );
    expect(markup).toContain("Not enough orders yet");
    expect(markup).toContain("—");
    expect(markup).not.toContain("₹0");
    expect(markup).not.toContain(FABRICATION_MARKERS[1]);
    expect(markup).not.toContain("19:00 - 21:00");
  });

  it("empty staff and document rosters take the honest empty-state branch", () => {
    expect(fresh.staff).toHaveLength(0);
    expect(fresh.documents).toHaveLength(0);
    // The render sites branch on exactly these lengths before mapping rows;
    // these are the exact strings they render.
    expect(STAFF_EMPTY_STATE).toBe(
      "No staff assigned yet — use Assign Staff to add your team.",
    );
    expect(DOCUMENTS_EMPTY_STATE).toBe(
      "No compliance documents uploaded for this outlet yet.",
    );
    const staffMarkup = renderToStaticMarkup(
      React.createElement(
        "div",
        null,
        fresh.staff.length === 0 ? STAFF_EMPTY_STATE : "rows",
      ),
    );
    expect(staffMarkup).toContain(STAFF_EMPTY_STATE);
    expect(staffMarkup).not.toContain(FABRICATION_MARKERS[4]);
  });
});

// Finding 12: store-directory RBAC derives from the real session roles
// (brand_owner / developer / regional_manager). No fabricated role fallback —
// an empty or unknown role fails closed (read-only, no sync).
describe("storeDirectoryAccess: real-role store directory RBAC", () => {
  it("developer and brand_owner keep directory management and sync", () => {
    expect(storeDirectoryAccess("developer", true, ["admin.developer"])).toEqual({
      isReadOnly: false,
      canRunSync: true,
    });
    expect(storeDirectoryAccess("brand_owner", true, ["admin.developer"])).toEqual({
      isReadOnly: false,
      canRunSync: true,
    });
  });

  it("regional_manager is read-only for the directory but keeps its sync permission", () => {
    expect(
      storeDirectoryAccess("regional_manager", false, [
        "admin.dashboard.view",
        "admin.petpooja.sync",
        "admin.stores.view",
      ]),
    ).toEqual({ isReadOnly: true, canRunSync: true });
  });

  it("an unknown role without permissions fails closed", () => {
    expect(storeDirectoryAccess("auditor", false, [])).toEqual({
      isReadOnly: true,
      canRunSync: false,
    });
  });

  it("an empty role fails closed even with contradictory derived flags", () => {
    expect(storeDirectoryAccess("", false, [])).toEqual({
      isReadOnly: true,
      canRunSync: false,
    });
    expect(storeDirectoryAccess("", true, ["admin.petpooja.sync"])).toEqual({
      isReadOnly: true,
      canRunSync: false,
    });
  });
});
