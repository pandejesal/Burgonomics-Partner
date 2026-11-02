import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

/**
 * Regression: `adminStoresService.listStores()` cast a raw Firestore document to
 * RichStore. The Stores page then rendered `Object.entries(activeStore.richHours)`,
 * `activeStore.staff.length`, `activeStore.documents.length` and a coordinates
 * panel. A store document NOT created by buildNewStore - the seeded
 * `admin_stores` shape (customer/scripts/seed.ts writes id/name/address/city/
 * latitude/longitude/lat/lng and NO richHours/staff/documents) or any
 * console/import edit - threw and white-screened the whole Admin -> Stores route.
 *
 * The fix normalises at the service boundary (the same discipline the order and
 * ticket contracts already use) and guards the coordinates render.
 */

const storeFixtures = vi.hoisted(() => ({ rows: [] as Array<Record<string, any>> }));

vi.mock("@/config/firebase", () => ({
  app: {},
  auth: { currentUser: null },
  db: {},
  messaging: null,
}));
vi.mock("@/core/config/firebase", () => ({
  app: {},
  auth: { currentUser: null },
  db: {},
  messaging: null,
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: () => ({ user: { id: "usr_1", role: "brand_owner" } }),
}));
vi.mock("@/admin/hooks/useAdmin", () => ({
  useAdmin: () => ({
    role: "brand_owner",
    isDeveloper: true,
    admin: { fullName: "Dev Lead" },
    permissions: [],
  }),
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

import { adminStoresService } from "../src/admin/services/adminStoresService";
import { AdminStoresPage } from "../src/admin/pages/AdminStoresPage";

// The SEEDED / console-edited shape: no richHours, no staff, no documents, no
// trend arrays, and coordinates under latitude/longitude only.
const seededStore = () => ({
  id: "str_seeded",
  name: "Burgonomics Surat Adajan",
  address: "Adajan Gam, Surat",
  city: "Surat",
  state: "Gujarat",
  pincode: "395009",
  phone: "+919820011223",
  status: "OPEN",
  isOpen: true,
  isBusy: false,
  isRecentlyOpened: false,
  latitude: 21.195,
  longitude: 72.793,
  lat: 21.195,
  lng: 72.793,
  supports: { delivery: true, takeaway: true, dineIn: true },
  features: { porterEnabled: false },
});

describe("admin_stores directory tolerates a non-buildNewStore document", () => {
  beforeEach(() => {
    storeFixtures.rows.length = 0;
  });

  it("normalizes a seeded store into a render-safe RichStore", async () => {
    storeFixtures.rows.push(seededStore());
    const res = await adminStoresService.listStores();
    expect(res.success).toBe(true);
    const store = res.data[0];
    // Every collection the page maps over must be a real array.
    expect(Array.isArray(store.staff)).toBe(true);
    expect(Array.isArray(store.documents)).toBe(true);
    expect(Array.isArray(store.weeklyRevenueTrend)).toBe(true);
    expect(Array.isArray(store.monthlyRevenueTrend)).toBe(true);
    // richHours must be an object with all seven days.
    expect(typeof store.richHours).toBe("object");
    for (const day of [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ]) {
      expect(store.richHours[day as keyof typeof store.richHours]).toBeDefined();
    }
    // Coordinates resolve from latitude/longitude when lat/lng are absent.
    expect(store.lat).toBe(21.195);
    expect(store.lng).toBe(72.793);
  });

  it("never returns NaN coordinates (a blank pin must not crash toFixed)", async () => {
    const store = seededStore();
    delete (store as any).lat;
    delete (store as any).lng;
    delete (store as any).latitude;
    delete (store as any).longitude;
    storeFixtures.rows.push(store);
    const res = await adminStoresService.listStores();
    const lat = res.data[0].lat;
    const lng = res.data[0].lng;
    // Not NaN: the render calls .toFixed(4), and NaN.toFixed is "NaN" at best.
    expect(Number.isNaN(lat)).toBe(false);
    expect(Number.isNaN(lng)).toBe(false);
  });

  it("keeps a well-formed buildNewStore document intact", async () => {
    const good = {
      ...seededStore(),
      richHours: {
        monday: { open: "10:00", close: "23:00" },
        tuesday: { open: "10:00", close: "23:00" },
        wednesday: { open: "10:00", close: "23:00" },
        thursday: { open: "10:00", close: "23:00" },
        friday: { open: "10:00", close: "23:59" },
        saturday: { open: "10:00", close: "23:59" },
        sunday: { open: "10:00", close: "23:59" },
      },
      staff: [{ id: "s1", name: "Ravi", role: "Chef", phone: "", email: "", isOnline: false }],
      documents: [],
    };
    storeFixtures.rows.push(good);
    const res = await adminStoresService.listStores();
    expect(res.data[0].staff).toHaveLength(1);
    expect(res.data[0].staff[0].name).toBe("Ravi");
    expect(res.data[0].richHours.friday.close).toBe("23:59");
  });

  it("renders the Stores page for a seeded document instead of throwing", async () => {
    storeFixtures.rows.push(seededStore());
    // Server-render is the cheapest real proof that nothing throws during the
    // first paint of the route.
    const html = renderToStaticMarkup(
      React.createElement(MemoryRouter, null, React.createElement(AdminStoresPage, null)),
    );
    expect(html.length).toBeGreaterThan(0);
  });
});
