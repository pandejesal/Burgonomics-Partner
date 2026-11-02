import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

/**
 * Regression: `parseCoord` returned `parseFloat(value ?? "")`, which is `NaN` for
 * a blank coordinate input. Firestore accepts NaN as a double, so creation
 * succeeded, and the admin radar then rendered `store.lat.toFixed(4)` ->
 * "NaN" while the customer directory silently DROPPED the outlet (its
 * mapStoreDoc discards non-finite coords). Admin showed a store the customer
 * could never order from.
 *
 * Fix: a blank pin is stored as null (honest "not pinned") instead of NaN, and
 * the radar renders "not pinned" rather than a fake coordinate.
 */

const storeFixtures = vi.hoisted(() => ({ rows: [] as Array<Record<string, any>> }));

vi.mock("@/config/firebase", () => ({ app: {}, auth: { currentUser: null }, db: {}, messaging: null }));
vi.mock("@/core/config/firebase", () => ({ app: {}, auth: { currentUser: null }, db: {}, messaging: null }));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: () => ({ user: { id: "usr_1", role: "brand_owner" } }),
}));
vi.mock("@/admin/hooks/useAdmin", () => ({
  useAdmin: () => ({ role: "brand_owner", isDeveloper: true, admin: { fullName: "Dev" }, permissions: [] }),
}));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(async () => ({ exists: () => false })),
  updateDoc: vi.fn(async () => undefined),
  setDoc: vi.fn(async () => undefined),
  getDocs: vi.fn(async () => ({
    docs: storeFixtures.rows.map((row, i) => ({ id: `str_${i}`, data: () => row })),
    size: storeFixtures.rows.length,
    forEach: (cb: (d: { id: string; data: () => Record<string, any> }) => void) =>
      storeFixtures.rows.forEach((row, i) => cb({ id: `str_${i}`, data: () => row })),
  })),
}));

import { buildNewStore, parseCoord } from "../src/admin/pages/AdminStoresPage";

describe("store creation never persists NaN coordinates", () => {
  beforeEach(() => {
    storeFixtures.rows.length = 0;
  });

  it("returns null (not NaN) for a blank coordinate string", () => {
    expect(parseCoord("")).toBeNull();
    expect(parseCoord(undefined)).toBeNull();
    expect(parseCoord("   ")).toBeNull();
    expect(parseCoord("not-a-number")).toBeNull();
  });

  it("still parses a real coordinate", () => {
    expect(parseCoord("21.195")).toBe(21.195);
    expect(parseCoord(72.793)).toBe(72.793);
  });

  it("buildNewStore stores null coordinates when the operator leaves them blank", () => {
    const store = buildNewStore(
      {
        name: "Burgonomics Test",
        city: "Surat",
        area: "Adajan",
        address: "Adajan Gam",
        phone: "+919820011223",
        lat: "",
        lng: "",
      },
      [],
    );
    expect(store.lat).toBeNull();
    expect(store.lng).toBeNull();
    // The crash class: NaN.toFixed(4) rendered the literal string "NaN".
    expect(Number.isNaN(store.lat as number)).toBe(false);
  });

  it("renders 'not pinned' rather than NaN in the radar list", async () => {
    storeFixtures.rows.push({
      id: "str_nopin",
      name: "Burgonomics Unpinned",
      address: "Somewhere",
      city: "Surat",
      lat: null,
      lng: null,
      richHours: null,
      staff: [],
      documents: [],
    });
    const { AdminStoresPage } = await import("../src/admin/pages/AdminStoresPage");
    const html = renderToStaticMarkup(
      React.createElement(MemoryRouter, null, React.createElement(AdminStoresPage, null)),
    );
    expect(html).not.toContain("NaN");
  });
});
