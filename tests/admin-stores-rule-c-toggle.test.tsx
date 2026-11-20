// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Admin â†’ Stores console open/close (owner rule C).
 *
 * Pre-fix: `handleConfirmToggleStoreState` flipped ONLY `admin_stores.isOpen`
 * via `adminStoresService.bulkUpsert` and toasted success. Three problems:
 *
 *   1. On a deployment served from `stores/*`, that write moved a document the
 *      customer app never reads â€” staff "closed" the outlet and customers kept
 *      ordering. (Same class of bug as the Settings toggle.)
 *   2. A POS "open" simply overwrote it, so the staff decision had no authority.
 *   3. A row with no branch link could still be "toggled" and reported saved.
 *
 * Contract pinned here: the console close/open goes through the server gate
 * route (with the row's branch), a refusal keeps the row's state and says so,
 * and a row that cannot be linked to a branch is refused locally instead of
 * silently succeeding.
 */

const sdk = vi.hoisted(() => {
  type Row = { id: string; data: Record<string, any> };
  const state = {
    publicRows: [] as Row[],
    privateRows: [] as Row[],
    batchWriteCalls: 0,
  };
  const snap = (rows: Row[]) => {
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

const toastSpy = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  loading: vi.fn(() => "toast-1"),
  dismiss: vi.fn(),
}));

const apiSpy = vi.hoisted(() => ({
  syncPetpoojaMenu: vi.fn(async () => ({ itemCount: 0, categoriesCount: 0 })),
  setStoreOperatingStatus: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: toastSpy }));
vi.mock("@/services/partnerFunctionsApi", () => ({ partnerFunctionsApi: apiSpy }));

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, name: string) => ({ kind: "collection", collection: name }),
  doc: (_db: unknown, collection: string, id: string) => ({ kind: "doc", collection, id }),
  query: (ref: unknown) => ref,
  getDocs: async (ref: { collection: string }) =>
    sdk.snap(
      ref.collection === "admin_stores_private" ? sdk.state.privateRows : sdk.state.publicRows,
    ),
  getDoc: async () => ({ exists: () => false }),
  writeBatch: () => ({
    set: () => {
      sdk.state.batchWriteCalls += 1;
    },
    commit: async () => undefined,
  }),
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
  useAuthStore: () => ({ user: { id: "brand_1", role: "brand_owner" } }),
}));
vi.mock("@/admin/hooks/useAdmin", () => ({
  useAdmin: () => ({
    role: "brand_owner",
    isDeveloper: true,
    permissions: ["admin.developer"],
    admin: { id: "brand_1", fullName: "Ops" },
    assignedStoreIds: [],
  }),
}));

import { AdminStoresPage } from "../src/admin/pages/AdminStoresPage";

const linkedPublicRow = {
  id: "str_linked",
  data: {
    name: "Burgonomics Adajan",
    address: "Adajan Gam, Surat",
    city: "Surat",
    area: "Adajan",
    lat: 21.195,
    lng: 72.793,
    phone: "+919820011223",
    isOpen: true,
    isBusy: false,
    partnerBranchId: "branch_adajan",
    supports: { delivery: true, takeaway: true, dineIn: true },
    hours: { open: "10:00", close: "23:00" },
  },
};

const unlinkedPublicRow = {
  id: "str_unlinked",
  data: {
    name: "Burgonomics Pilot Kiosk",
    address: "Somewhere",
    city: "Surat",
    area: "Adajan",
    lat: 21.2,
    lng: 72.8,
    phone: "+919820011224",
    isOpen: true,
    isBusy: false,
    supports: { delivery: true, takeaway: true, dineIn: true },
    hours: { open: "10:00", close: "23:00" },
  },
};

let container: HTMLDivElement;
let root: Root;

const element = () =>
  React.createElement(MemoryRouter, null, React.createElement(AdminStoresPage, null));

async function flush(times = 8) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function render() {
  await act(async () => {
    root.render(element());
  });
  await flush();
  return container.innerHTML;
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => (b.textContent ?? "").trim().includes(text) && !b.disabled,
  ) as HTMLButtonElement | undefined;
}

async function click(el: Element | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    el!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush(4);
}

async function openToggleFor(storeId: string) {
  // No test-only attributes: find the row by its rendered store id, then climb
  // to the innermost ancestor that also holds the OPEN/CLOSED pill.
  const idNode = Array.from(container.querySelectorAll("span")).find(
    (el) => (el.textContent ?? "").trim() === storeId,
  );
  expect(idNode).toBeTruthy();
  let host: HTMLElement | null = idNode!.parentElement;
  let pill: HTMLElement | null = null;
  while (host && !pill) {
    const candidate = Array.from(host.querySelectorAll("span")).find(
      (el) =>
        ["OPEN", "CLOSED"].includes((el.textContent ?? "").trim()) &&
        (el.className ?? "").includes("rounded-full"),
    );
    if (candidate) pill = candidate as HTMLElement;
    else host = host.parentElement;
  }
  await click(pill as HTMLElement | undefined);
  await click(buttonByText("Confirm Toggle State"));
}

beforeEach(() => {
  sdk.state.publicRows = [linkedPublicRow, unlinkedPublicRow];
  sdk.state.privateRows = [];
  sdk.state.batchWriteCalls = 0;
  apiSpy.setStoreOperatingStatus.mockReset();
  toastSpy.success.mockClear();
  toastSpy.error.mockClear();
  toastSpy.info.mockClear();
  toastSpy.warning.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("Admin Stores open/close goes through the server gate (rule C)", () => {
  it("closes through POST /stores/setOperatingStatus for the row's branch", async () => {
    apiSpy.setStoreOperatingStatus.mockResolvedValue({
      success: true,
      branchId: "branch_adajan",
      status: "closed",
      storeId: "str_linked",
      storeStatusOverride: true,
    });
    await render();
    await openToggleFor("str_linked");

    expect(apiSpy.setStoreOperatingStatus).toHaveBeenCalledWith({
      branchId: "branch_adajan",
      status: "closed",
    });
    // The old mechanism (whole-array bulkUpsert) must not be what "saves" it.
    expect(sdk.state.batchWriteCalls).toBe(0);
    expect(toastSpy.success.mock.calls.join(" ")).toMatch(/Petpooja cannot reopen/i);
  });

  it("keeps the row's state and reports the refusal when the server says no", async () => {
    apiSpy.setStoreOperatingStatus.mockRejectedValue(
      new Error("This outlet is not linked to a storefront â€” nothing was saved."),
    );
    await render();
    await openToggleFor("str_linked");

    expect(toastSpy.success).not.toHaveBeenCalled();
    expect(toastSpy.error.mock.calls.join(" ")).toMatch(/not changed/i);
    expect(toastSpy.error.mock.calls.join(" ")).toMatch(/not linked to a storefront/i);
    // Still OPEN on screen: the pill was never advanced.
    expect((container as HTMLDivElement).innerHTML).toContain("OPEN");
  });

  it("refuses a row with no branch link instead of pretending it saved", async () => {
    await render();
    await openToggleFor("str_unlinked");

    expect(apiSpy.setStoreOperatingStatus).not.toHaveBeenCalled();
    expect(sdk.state.batchWriteCalls).toBe(0);
    expect(toastSpy.success).not.toHaveBeenCalled();
    expect(toastSpy.error.mock.calls.join(" ")).toMatch(/not linked to an outlet/i);
  });
});
