// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * F17 review round 2 (H1) — page-level regression.
 *
 * `regional_manager` is a real, non-brand console role: `useAdmin` grants it
 * `admin.stores.view` and the route admits it, but the rules deny
 * `admin_stores_private`. Before this repair the page always asked for the
 * brand join, so the denied private read blanked the whole directory behind a
 * PRIVATE_JOIN_FAILED card.
 *
 * Now the page derives the read mode from the session ROLE (the same role names
 * `isBrandOwner()` resolves to), so a non-brand reader queries the public
 * collection only. Private surfaces are honestly marked unavailable rather than
 * rendered as measured zeroes, and the directory stays read-only. A brand
 * session still joins the private collection and still fails hard when that
 * read is denied.
 */

const sdk = vi.hoisted(() => {
  const state = {
    publicRows: [] as Array<{ id: string; data: Record<string, any> }>,
    privateQueryAttempts: 0,
    publicQueryAttempts: 0,
    privateDenied: false,
  };
  const snap = (rows: Array<{ id: string; data: Record<string, any> }>) => {
    const entries = rows.map((r) => ({ id: r.id, data: () => r.data }));
    return {
      empty: entries.length === 0,
      size: entries.length,
      docs: entries,
      forEach: (cb: (d: { id: string; data: () => Record<string, any> }) => void) =>
        entries.forEach(cb),
    };
  };
  return { state, snap };
});

const roleState = vi.hoisted(() => ({ role: "regional_manager", uid: "reg_1" }));

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, name: string) => ({ kind: "collection", collection: name }),
  doc: (_db: unknown, collection: string, id: string) => ({ kind: "doc", collection, id }),
  query: (ref: unknown) => ref,
  getDocs: async (ref: { collection: string }) => {
    if (ref.collection === "admin_stores_private") {
      sdk.state.privateQueryAttempts += 1;
      // The real rules deny this collection to a non-brand session.
      if (sdk.state.privateDenied) throw new Error("Missing or insufficient permissions.");
      return sdk.snap([]);
    }
    sdk.state.publicQueryAttempts += 1;
    return sdk.snap(sdk.state.publicRows);
  },
  getDoc: async () => ({ exists: () => false }),
  writeBatch: () => ({ set: () => undefined, commit: async () => undefined }),
  runTransaction: async () => {
    throw new Error("no transaction expected in this page test");
  },
  setDoc: () => undefined,
  updateDoc: () => undefined,
  limit: (n: number) => n,
}));

vi.mock("@/config/firebase", () => ({ app: {}, auth: { currentUser: null }, db: {}, messaging: null }));
vi.mock("@/core/config/firebase", () => ({
  app: {},
  auth: { currentUser: null },
  db: {},
  messaging: null,
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: () => ({ user: { id: roleState.uid, role: roleState.role } }),
}));
vi.mock("@/admin/hooks/useAdmin", () => ({
  useAdmin: () => {
    const isDeveloper = roleState.role === "brand_owner" || roleState.role === "developer";
    // Mirrors the shipped useAdmin permission derivation for the non-brand role.
    const perms =
      roleState.role === "regional_manager"
        ? [
            "admin.dashboard.view",
            "admin.orders.view",
            "admin.petpooja.sync",
            "admin.stores.view",
            "admin.menu.sync",
            "admin.coupons.manage",
            "admin.customer.view",
            "admin.settings.manage",
          ]
        : [];
    return {
      role: roleState.role,
      isDeveloper,
      permissions: isDeveloper ? ["admin.developer"] : perms,
      admin: { id: roleState.uid, fullName: "Regional Ops" },
      assignedStoreIds: [],
    };
  },
}));

import { AdminStoresPage } from "../src/admin/pages/AdminStoresPage";

const legacyPublicRow = {
  id: "str_legacy",
  data: {
    name: "Burgonomics Adajan",
    address: "Adajan Gam, Surat",
    city: "Surat",
    area: "Adajan",
    lat: 21.195,
    lng: 72.793,
    phone: "+919820011223",
    isOpen: true,
    // Pre-split PII in the anonymous document must never render here.
    staff: [
      {
        id: "STF-1",
        name: "Ravi Kumar",
        role: "Chef",
        phone: "+919820011224",
        email: "ravi@example.test",
      },
    ],
    email: "manager.personal@example.test",
    managerPhone: "+919820099887",
    webhookStatus: "active",
    todayRevenue: 48210,
    todayOrders: 96,
  },
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  sdk.state.publicRows.length = 0;
  sdk.state.publicRows.push(legacyPublicRow);
  sdk.state.privateQueryAttempts = 0;
  sdk.state.publicQueryAttempts = 0;
  sdk.state.privateDenied = false;
  roleState.role = "regional_manager";
  roleState.uid = "reg_1";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  if (container) document.body.removeChild(container);
  container = null;
  vi.clearAllMocks();
});

async function renderPage(): Promise<string> {
  await act(async () => {
    root!.render(
      React.createElement(MemoryRouter, null, React.createElement(AdminStoresPage, null)),
    );
  });
  // Let the loader's microtasks settle before asserting.
  await act(async () => {
    await Promise.resolve();
  });
  return container!.innerHTML;
}

describe("F17 regional_manager gets the public directory, not a blank failure", () => {
  it("queries the public collection only and never attempts the private one", async () => {
    await renderPage();
    expect(sdk.state.publicQueryAttempts).toBe(1);
    expect(sdk.state.privateQueryAttempts).toBe(0);
  });

  it("renders the directory with role-unavailable private surfaces (no PII)", async () => {
    const html = await renderPage();
    expect(html).not.toContain("Store directory could not be loaded");
    expect(html).toContain("Burgonomics Adajan");
    expect(html).toContain("Unavailable");
    expect(html).not.toContain("manager.personal@example.test");
    expect(html).not.toContain("Ravi Kumar");
    expect(html).not.toContain("ravi@example.test");
  });

  it("keeps the directory read-only for the regional role (no register control)", async () => {
    const html = await renderPage();
    expect(html).not.toContain("REGISTER STORE");
  });
});

describe("F17 brand_owner keeps the authoritative private join", () => {
  beforeEach(() => {
    roleState.role = "brand_owner";
    roleState.uid = "brand_1";
  });

  it("does not show the role-unavailable copy for a brand session", async () => {
    const html = await renderPage();
    expect(html).not.toContain("Financial totals are not available for your role");
  });

  it("still surfaces the failure card when the private read is denied", async () => {
    sdk.state.privateDenied = true;
    const html = await renderPage();
    expect(sdk.state.privateQueryAttempts).toBe(1);
    expect(html).toContain("Store directory could not be loaded");
    expect(html).toContain("Retry");
  });
});
