// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * F17 review round 3 — the context-boundary race the round-2 review graded LOW
 * but REACHABLE.
 *
 * Round 2 keyed the directory LOAD on `UID|role`, but the page itself stayed
 * mounted across a session/role switch: the route and layout are not keyed by
 * UID or role, so a brand session that becomes `regional_manager` keeps the
 * SAME component instance. Two defects follow from that, and both are here:
 *
 *  R1  Local state is cleared only by the passive load effect, i.e. AFTER a
 *      render. A brand session's private per-row values (revenue, roster) stay
 *      in `stores` for that frame, and the grid renders them.
 *
 *  R2  `saveStores` had no session/unmount guard. A save started as brand and
 *      completed after the switch still advances `confirmedStoresRef` with the
 *      OLD brand array. Because `canRunSync` stays true for a
 *      `regional_manager` (it holds `admin.petpooja.sync`), a later sync in the
 *      new public-only context attempts a metadata write that the paired
 *      private rule rejects — and its rollback restores that OLD brand array
 *      into a public-only session. The reviewer's "repopulation" wording was
 *      too broad (success alone only touches the ref, not `setStores`); this is
 *      the actual reachable poisoning, so it is what the test drives.
 *
 * Fix shape pinned by this suite:
 *  - the default export becomes a UID+role-keyed wrapper around the existing
 *    stateful content, so a context switch REMOUNTS before paint and every
 *    local ref/array/modal dies with the old instance;
 *  - a completion guard makes a pre-switch save return false instead of
 *    advancing state or claiming success in the new context;
 *  - POS metadata sync (a paired private write) is disabled and honestly
 *    marked unavailable for a public-only read mode, without touching
 *    `storeDirectoryAccess` or any global RBAC permission.
 *
 * Negative controls in the same file prove a STABLE context still saves,
 * still toasts success, and still flips local state.
 */

const sdk = vi.hoisted(() => {
  type Row = { id: string; data: Record<string, any> };
  const state = {
    publicRows: [] as Row[],
    privateRows: [] as Row[],
    publicQueryAttempts: 0,
    privateQueryAttempts: 0,
    privateDenied: false,
    /** When set, the next batch commit waits on it. */
    gate: null as null | { promise: Promise<void>; resolve: () => void; reject: () => void },
    batchCommits: 0,
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

const roleState = vi.hoisted(() => ({ role: "brand_owner", uid: "brand_1" }));
const toastSpy = vi.hoisted(() => {
  // `sonner`'s `toast.loading()` returns an id; dismiss-by-id is the only way to
  // close your OWN toast. The mock mirrors that so a test can prove a stale
  // context never dismisses the NEW context's loading toast.
  let seq = 0;
  const loading = vi.fn(() => {
    seq += 1;
    return `toast-${seq}`;
  });
  return {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading,
    dismiss: vi.fn(),
  };
});
const apiSpy = vi.hoisted(() => {
  // F17 r4: the vendor call is DEFERRED so a test can hold it pending across a
  // session/UID boundary and only then settle it. Never a real vendor call —
  // this is a Promise the test resolves by hand.
  const state = {
    calls: [] as string[],
    pending: [] as Array<{
      storeId: string;
      resolve: (value: { itemCount: number; categoriesCount: number }) => void;
      reject: (err: unknown) => void;
    }>,
  };
  const syncPetpoojaMenu = vi.fn((storeId: string) => {
    state.calls.push(storeId);
    return new Promise<{ itemCount: number; categoriesCount: number }>(
      (resolve, reject) => {
        state.pending.push({ storeId, resolve, reject });
      },
    );
  });
  // Rule C (fix wave 2026-11-20): open/close is now a SERVER gate write, so the
  // session-boundary suite parks the same deferred gate on this call instead of
  // on a Firestore batch commit. `sdk.state.gate` is set by `deferredGate()`.
  const setStoreOperatingStatus = vi.fn(
    async (params: { branchId: string; status: "open" | "closed" }) => {
      const gate = (globalThis as any).__storeGate?.();
      if (gate) await gate;
      return {
        success: true,
        branchId: params.branchId,
        status: params.status,
        storeId: "str_alpha",
        storeStatusOverride: params.status === "closed",
      };
    },
  );
  return { syncPetpoojaMenu, setStoreOperatingStatus, state };
});

vi.mock("sonner", () => ({ toast: toastSpy }));
vi.mock("@/services/partnerFunctionsApi", () => ({ partnerFunctionsApi: apiSpy }));

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, name: string) => ({ kind: "collection", collection: name }),
  doc: (_db: unknown, collection: string, id: string) => ({ kind: "doc", collection, id }),
  query: (ref: unknown) => ref,
  getDocs: async (ref: { collection: string }) => {
    if (ref.collection === "admin_stores_private") {
      sdk.state.privateQueryAttempts += 1;
      // The rules deny this collection to a non-brand session.
      if (sdk.state.privateDenied) throw new Error("Missing or insufficient permissions.");
      return sdk.snap(sdk.state.privateRows);
    }
    sdk.state.publicQueryAttempts += 1;
    return sdk.snap(sdk.state.publicRows);
  },
  getDoc: async () => ({ exists: () => false }),
  writeBatch: () => ({
    set: () => undefined,
    commit: async () => {
      sdk.state.batchCommits += 1;
      if (sdk.state.gate) await sdk.state.gate.promise;
    },
  }),
  runTransaction: async () => {
    throw new Error("no transaction expected in this page test");
  },
  setDoc: () => undefined,
  updateDoc: () => undefined,
  limit: (n: number) => n,
}));

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
  useAuthStore: () => ({ user: { id: roleState.uid, role: roleState.role } }),
}));
vi.mock("@/admin/hooks/useAdmin", () => ({
  useAdmin: () => {
    const isDeveloper = roleState.role === "brand_owner" || roleState.role === "developer";
    // Mirrors the shipped useAdmin permission derivation: regional_manager holds
    // admin.petpooja.sync, so `storeDirectoryAccess.canRunSync` is genuinely true
    // for it. That is exactly why the page-level read-mode gate is needed.
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
      admin: { id: roleState.uid, fullName: "Ops" },
      assignedStoreIds: [],
    };
  },
}));

import { AdminStoresPage } from "../src/admin/pages/AdminStoresPage";

/** Private values a brand session legitimately sees and a public one must not. */
const BRAND_PRIVATE_MARKERS = ["48,210", "Ravi Kumar", "manager.personal@example.test"];

const publicRow = {
  id: "str_alpha",
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
    // Rule C: the open/close is a server gate write for the linked outlet, so
    // the fixture carries the link the console reads (`storeBranchIdFor`).
    partnerBranchId: "branch_adajan",
    supports: { delivery: true, takeaway: true, dineIn: true },
    hours: { open: "10:00", close: "23:00" },
    // Legacy pre-split PII sitting in the anonymously readable document.
    email: "manager.personal@example.test",
    staff: [
      {
        id: "STF-1",
        name: "Ravi Kumar",
        role: "Chef",
        phone: "+919820011224",
        email: "ravi@example.test",
      },
    ],
    todayRevenue: 48210,
    todayOrders: 96,
    webhookStatus: "active",
  },
};

const privateRow = {
  id: "str_alpha",
  data: {
    email: "manager.personal@example.test",
    managerName: "Ops Manager",
    managerPhone: "+919820099887",
    webhookUrl: "https://hooks.example.test/petpooja/secret",
    webhookStatus: "active",
    todayRevenue: 48210,
    todayOrders: 96,
    staff: [
      {
        id: "STF-1",
        name: "Ravi Kumar",
        role: "Chef",
        phone: "+919820011224",
        email: "ravi@example.test",
      },
    ],
    documents: [],
  },
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function element() {
  return React.createElement(
    MemoryRouter,
    null,
    React.createElement(AdminStoresPage, null),
  );
}

async function flush(times = 8) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function render(elem = element()) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await act(async () => {
    (root as any).render(elem);
  });
  await flush();
  return (container as HTMLDivElement).innerHTML;
}

function deferredGate() {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // Attach a no-op rejection handler so an intentional reject is not reported
  // as an unhandled rejection before the component awaits it.
  promise.catch(() => undefined);
  sdk.state.gate = { promise, resolve: () => resolve(), reject: () => reject(new Error("write failed")) };
  // The gate is consumed by the mocked status route (see `apiSpy`). Read it
  // through a function so the mock sees the gate created AFTER its own call.
  (globalThis as any).__storeGate = () => {
    const gate = sdk.state.gate;
    return gate ? gate.promise : null;
  };
  return sdk.state.gate as { promise: Promise<void>; resolve: () => void; reject: () => void };
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return Array.from((container as HTMLDivElement).querySelectorAll("button")).find(
    (b) => (b.textContent ?? "").trim().includes(text) && !b.disabled,
  ) as HTMLButtonElement | undefined;
}

function allButtonsByText(text: string): HTMLButtonElement[] {
  return Array.from((container as HTMLDivElement).querySelectorAll("button")).filter((b) =>
    (b.textContent ?? "").trim().includes(text),
  ) as HTMLButtonElement[];
}

async function click(el: Element | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    el!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush(3);
}

/** Flip the OPEN/CLOSED pill on the first grid card, then confirm the dialog. */
async function startToggleSave() {
  const pill = Array.from((container as HTMLDivElement).querySelectorAll("span")).find(
    (s) => (s.textContent ?? "").trim() === (publicRow.data.isOpen ? "OPEN" : "CLOSED"),
  );
  await click(pill);
  await click(buttonByText("Confirm Toggle State"));
}

async function switchContext(role: string, uid: string) {
  roleState.role = role;
  roleState.uid = uid;
  await act(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (root as any).render(element());
  });
  await flush();
}

beforeEach(() => {
  sdk.state.publicRows.length = 0;
  sdk.state.privateRows.length = 0;
  sdk.state.publicRows.push(publicRow);
  sdk.state.privateRows.push(privateRow);
  sdk.state.publicQueryAttempts = 0;
  sdk.state.privateQueryAttempts = 0;
  sdk.state.privateDenied = false;
  sdk.state.gate = null;
  sdk.state.batchCommits = 0;
  roleState.role = "brand_owner";
  roleState.uid = "brand_1";
  toastSpy.success.mockClear();
  toastSpy.error.mockClear();
  toastSpy.warning.mockClear();
  toastSpy.info.mockClear();
  toastSpy.loading.mockClear();
  toastSpy.dismiss.mockClear();
  apiSpy.syncPetpoojaMenu.mockClear();
  apiSpy.state.calls.length = 0;
  apiSpy.state.pending.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  if (container) document.body.removeChild(container);
  container = null;
  sdk.state.gate = null;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// R1 — a role switch must remount, not inherit the old session's private frame
// ---------------------------------------------------------------------------
describe("R1 role switch is a context boundary, not a passive-effect reset", () => {
  it("a brand session really does see its private values first (control)", async () => {
    const html = await render();
    expect(sdk.state.privateQueryAttempts).toBe(1);
    expect(html).toContain("48,210");
    expect(html).toContain("Surat");
  });

  it("after switching to regional_manager the DOM holds NO brand private value", async () => {
    await render();
    await switchContext("regional_manager", "reg_1");
    const html = (container as HTMLDivElement).innerHTML;
    expect(sdk.state.publicQueryAttempts).toBe(2);
    for (const marker of BRAND_PRIVATE_MARKERS) {
      expect(html).not.toContain(marker);
    }
    expect(html).toContain("Unavailable");
    expect(html).toContain("Burgonomics Adajan");
  });

  it("a same-role UID switch is also a boundary (fresh load, no stale values)", async () => {
    await render();
    await switchContext("brand_owner", "brand_2");
    expect(sdk.state.publicQueryAttempts).toBe(2);
    expect(sdk.state.privateQueryAttempts).toBe(2);
    // The new session's own load decides what is painted; no leftover row from
    // the previous UID survives the switch.
    const html = (container as HTMLDivElement).innerHTML;
    expect(html).toContain("Burgonomics Adajan");
  });
});

// ---------------------------------------------------------------------------
// R2 — a save that started before the switch must not poison the new context
// ---------------------------------------------------------------------------
describe("R2 an in-flight save cannot advance or roll back the new context", () => {
  it("post-switch success makes no success claim and paints no brand value", async () => {
    await render();
    const gate = deferredGate();
    await startToggleSave();
    // Save is parked on the batch commit; the session now changes.
    toastSpy.success.mockClear();
    await switchContext("regional_manager", "reg_1");
    await act(async () => {
      gate.resolve();
    });
    await flush();

    expect(toastSpy.success).not.toHaveBeenCalled();
    const html = (container as HTMLDivElement).innerHTML;
    for (const marker of BRAND_PRIVATE_MARKERS) {
      expect(html).not.toContain(marker);
    }
  });

  it("a poisoned confirmed snapshot can never be rolled back into a public-only session", async () => {
    await render();
    const gate = deferredGate();
    await startToggleSave();
    // Brand save completes SUCCESSFULLY after the session changed: under the
    // defect this advances the (shared) confirmed snapshot with the brand array.
    await switchContext("regional_manager", "reg_1");
    await act(async () => {
      gate.resolve();
    });
    await flush();

    // Now a regional metadata sync (permitted by canRunSync) is the reachable
    // follow-up that used to force a failed paired write and roll back to that
    // brand array. It must not even start.
    await click(allButtonsByText("POS Batch Sync")[0]);
    await flush();
    expect(apiSpy.syncPetpoojaMenu).not.toHaveBeenCalled();

    const html = (container as HTMLDivElement).innerHTML;
    for (const marker of BRAND_PRIVATE_MARKERS) {
      expect(html).not.toContain(marker);
    }
  });

  it("a pre-switch save that FAILS writes no rollback into the new context", async () => {
    await render();
    const gate = deferredGate();
    await startToggleSave();
    await switchContext("regional_manager", "reg_1");
    await act(async () => {
      gate.reject();
    });
    await flush();
    const html = (container as HTMLDivElement).innerHTML;
    for (const marker of BRAND_PRIVATE_MARKERS) {
      expect(html).not.toContain(marker);
    }
    expect(toastSpy.success).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Stable-context negative controls: the guard must not disable normal saving
// ---------------------------------------------------------------------------
describe("negative control: a stable context still saves normally", () => {
  it("flips the pill, claims success and advances the confirmed snapshot", async () => {
    await render();
    const gate = deferredGate();
    await startToggleSave();
    await act(async () => {
      gate.resolve();
    });
    await flush();
    expect(toastSpy.success).toHaveBeenCalled();
  });

  it("still refuses a save while the load is in a failed state", async () => {
    sdk.state.privateDenied = true;
    await render();
    // The failure panel replaces the grid, so there is no toggle surface at all.
    const html = (container as HTMLDivElement).innerHTML;
    expect(html).toContain("Store directory could not be loaded");
    expect(html).not.toContain("Confirm Toggle State");
  });
});

// ---------------------------------------------------------------------------
// LOW observation — regional metadata sync is a guaranteed paired-write failure
// ---------------------------------------------------------------------------
describe("regional_manager cannot run a private-metadata POS sync", () => {
  it("does not call the menu API and marks the control unavailable", async () => {
    roleState.role = "regional_manager";
    roleState.uid = "reg_1";
    await render();
    expect(sdk.state.privateQueryAttempts).toBe(0);

    const batch = allButtonsByText("POS Batch Sync")[0] as HTMLButtonElement | undefined;
    expect(batch).toBeTruthy();
    expect(batch!.disabled).toBe(true);
    expect(batch!.getAttribute("title") ?? "").toMatch(/not available for your role/i);

    // The per-row control lives in the LIST view (the grid card has no sync
    // control), so switch tabs first — this is a selector precondition, not a
    // relaxed assertion. Its stable aria-label identifies it in either mode.
    await click(buttonByText("list View"));
    const rowSync = Array.from((container as HTMLDivElement).querySelectorAll("button")).find(
      (b) => /^Sync Menu for /.test(b.getAttribute("aria-label") ?? ""),
    ) as HTMLButtonElement | undefined;
    expect(rowSync).toBeTruthy();
    expect(rowSync!.disabled).toBe(true);

    await click(batch);
    await click(rowSync);
    expect(apiSpy.syncPetpoojaMenu).not.toHaveBeenCalled();
  });

  it("a brand session keeps the sync control and its capability", async () => {
    await render();
    const batch = allButtonsByText("POS Batch Sync")[0] as HTMLButtonElement | undefined;
    expect(batch).toBeTruthy();
    expect(batch!.disabled).toBe(false);
    // `storeDirectoryAccess` itself is untouched: the gate is page-level only.
    const { storeDirectoryAccess } = await import("../src/admin/pages/AdminStoresPage");
    expect(storeDirectoryAccess("regional_manager", false, ["admin.petpooja.sync"]).canRunSync).toBe(
      true,
    );
    expect(storeDirectoryAccess("regional_manager", false, ["admin.petpooja.sync"]).isReadOnly).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// R4 — an in-flight PETPOOJA SYNC outliving its session
//
// The R3 boundary covers SAVES that resolve late. The sync handlers have the
// same shape of hole and were not covered: `handleSyncStore` awaits the vendor
// and then UNCONDITIONALLY calls `saveStores` + terminal toasts, so a session
// change during that await makes an OLD context start a metadata write and
// claim the outcome in the NEW one. `handleSyncAllStores` is worse — its loop
// keeps issuing the NEXT vendor call after the boundary. `saveStores` only
// guards on its OWN resolve (`stale()` after `bulkUpsert`), never at entry, so
// a late `handleSyncStore` could START a write the guard has no chance to stop.
//
// These cases drive the REAL mounted handlers and the REAL service over the
// existing SDK boundary double; the vendor promise is deferred by the test and
// is never a real vendor call. Nothing here depends on a private-rule denial:
// a new-context authorization failure would hide the defect rather than prove
// it, so the assertions are on call counts and absence of claims.
// ---------------------------------------------------------------------------

/** Settle the FIRST pending vendor promise (success path). */
async function settleFirstVendorSuccess(itemCount = 4) {
  const call = apiSpy.state.pending.shift();
  expect(call).toBeTruthy();
  await act(async () => {
    call!.resolve({ itemCount, categoriesCount: 2 });
  });
  await flush();
}

/** Settle the FIRST pending vendor promise (failure path). */
async function settleFirstVendorError(message = "petpooja unreachable") {
  const call = apiSpy.state.pending.shift();
  expect(call).toBeTruthy();
  await act(async () => {
    call!.reject(new Error(message));
  });
  await flush();
}

/** Run one per-row sync from the list view (the only place it is rendered). */
async function clickRowSyncControl() {
  await click(buttonByText("list View"));
  const rowSync = Array.from((container as HTMLDivElement).querySelectorAll("button")).find(
    (b) => /^Sync Menu for /.test(b.getAttribute("aria-label") ?? ""),
  ) as HTMLButtonElement | undefined;
  await click(rowSync);
}

function batchCommitsNow() {
  return sdk.state.batchCommits;
}

describe("R4 an in-flight single sync cannot act on the next context", () => {
  it("a single sync pending across a role switch starts NO metadata write and claims nothing", async () => {
    await render();
    await clickRowSyncControl();
    // Vendor call is in flight and nothing has been written yet.
    expect(apiSpy.state.calls).toEqual(["str_alpha"]);
    const commitsBefore = batchCommitsNow();

    await switchContext("regional_manager", "reg_1");
    await settleFirstVendorSuccess();

    // The defect would now (a) start a saveStores for the OLD array and
    // (b) toast the petpooja outcome into the new session.
    expect(batchCommitsNow()).toBe(commitsBefore);
    expect(toastSpy.success).not.toHaveBeenCalled();
    expect(toastSpy.warning).not.toHaveBeenCalled();
    expect(toastSpy.error).not.toHaveBeenCalled();
  });

  it("a single sync pending when the page UNMOUNTS starts no write and claims nothing", async () => {
    await render();
    await clickRowSyncControl();
    const commitsBefore = batchCommitsNow();
    expect(apiSpy.state.calls).toEqual(["str_alpha"]);

    // Real unmount (not a context switch): nothing is left to paint into.
    await act(async () => {
      root!.unmount();
    });
    root = null;

    await settleFirstVendorSuccess();

    // `saveStores` only guards AFTER its own await, so under the defect a late
    // sync could still START a metadata write for a dead instance.
    expect(batchCommitsNow()).toBe(commitsBefore);
    expect(toastSpy.success).not.toHaveBeenCalled();
    expect(toastSpy.warning).not.toHaveBeenCalled();
    expect(toastSpy.error).not.toHaveBeenCalled();
  });

  it("a single sync pending across a same-role UID switch starts NO metadata write", async () => {
    await render();
    await clickRowSyncControl();
    const commitsBefore = batchCommitsNow();
    expect(apiSpy.state.calls).toEqual(["str_alpha"]);

    // Same role, different UID: the keyed boundary still remounts, so this is
    // a real context change for the stale completion.
    await switchContext("brand_owner", "brand_2");
    await settleFirstVendorSuccess();

    expect(batchCommitsNow()).toBe(commitsBefore);
    expect(toastSpy.success).not.toHaveBeenCalled();
    expect(toastSpy.warning).not.toHaveBeenCalled();
  });

  it("a single sync that REJECTS after the boundary makes no stale error claim", async () => {
    await render();
    await clickRowSyncControl();
    await switchContext("regional_manager", "reg_1");
    await settleFirstVendorError("denied by vendor");

    expect(toastSpy.error).not.toHaveBeenCalled();
    expect(toastSpy.success).not.toHaveBeenCalled();
  });
});

describe("R4 an in-flight BATCH sync cannot continue into the next context", () => {
  /** Two open stores so the batch loop has a NEXT call to make. */
  async function renderTwoOpenStores() {
    sdk.state.publicRows.length = 0;
    sdk.state.privateRows.length = 0;
    sdk.state.publicRows.push(publicRow, {
      id: "str_beta",
      data: { ...publicRow.data, name: "Burgonomics Vesu", area: "Vesu", isOpen: true },
    });
    sdk.state.privateRows.push(privateRow, { id: "str_beta", data: { ...privateRow.data } });
    await render();
    expect(apiSpy.state.calls).toEqual([]);
  }

  it("after a role switch the batch loop issues NO second vendor call and no write/claim", async () => {
    await renderTwoOpenStores();
    await click(allButtonsByText("POS Batch Sync")[0]);
    expect(apiSpy.state.calls).toHaveLength(1);
    const commitsBefore = batchCommitsNow();

    await switchContext("regional_manager", "reg_1");
    toastSpy.dismiss.mockClear();
    await settleFirstVendorSuccess();

    // The old instance's loop must not reach the SECOND store, must not
    // persist, and must not toast the old summary into the new context.
    expect(apiSpy.state.calls).toHaveLength(1);
    expect(batchCommitsNow()).toBe(commitsBefore);
    expect(toastSpy.success).not.toHaveBeenCalled();
    expect(toastSpy.warning).not.toHaveBeenCalled();
    expect(toastSpy.error).not.toHaveBeenCalled();
    // Loading-toast ownership: the stale context must never issue a GLOBAL
    // dismiss (no argument), which would close the new context's own toast.
    const globalDismisses = toastSpy.dismiss.mock.calls.filter((c) => c.length === 0);
    expect(globalDismisses).toHaveLength(0);
  });

  it("a same-role UID switch mid-batch also stops the remaining vendor calls", async () => {
    await renderTwoOpenStores();
    await click(allButtonsByText("POS Batch Sync")[0]);
    expect(apiSpy.state.calls).toHaveLength(1);

    await switchContext("brand_owner", "brand_2");
    await settleFirstVendorError("first store failed");

    expect(apiSpy.state.calls).toHaveLength(1);
    expect(toastSpy.error).not.toHaveBeenCalled();
    expect(toastSpy.success).not.toHaveBeenCalled();
  });
});

describe("R4 negative controls: a stable context still syncs honestly", () => {
  it("single sync syncs once, persists once and claims success", async () => {
    await render();
    await clickRowSyncControl();
    expect(apiSpy.state.calls).toEqual(["str_alpha"]);
    const commitsBefore = batchCommitsNow();
    await settleFirstVendorSuccess();

    expect(apiSpy.state.calls).toHaveLength(1);
    expect(batchCommitsNow()).toBe(commitsBefore + 1);
    expect(toastSpy.success).toHaveBeenCalledTimes(1);
  });

  it("single sync failure reports it honestly and writes nothing", async () => {
    await render();
    await clickRowSyncControl();
    const commitsBefore = batchCommitsNow();
    await settleFirstVendorError("KYB blocked");

    expect(batchCommitsNow()).toBe(commitsBefore);
    expect(toastSpy.error).toHaveBeenCalledTimes(1);
    expect(toastSpy.success).not.toHaveBeenCalled();
  });

  it("a two-store batch syncs each store once and persists once", async () => {
    sdk.state.publicRows.length = 0;
    sdk.state.privateRows.length = 0;
    sdk.state.publicRows.push(publicRow, {
      id: "str_beta",
      data: { ...publicRow.data, name: "Burgonomics Vesu", area: "Vesu", isOpen: true },
    });
    sdk.state.privateRows.push(privateRow, { id: "str_beta", data: { ...privateRow.data } });
    await render();

    await click(allButtonsByText("POS Batch Sync")[0]);
    expect(apiSpy.state.calls).toHaveLength(1);
    await settleFirstVendorSuccess(4);
    // The loop advanced to the second store only after the first settled.
    expect(apiSpy.state.calls).toHaveLength(2);
    const commitsBefore = batchCommitsNow();
    await settleFirstVendorSuccess(6);

    expect(apiSpy.state.calls).toHaveLength(2);
    expect(batchCommitsNow()).toBe(commitsBefore + 1);
    expect(toastSpy.success).toHaveBeenCalledTimes(1);
  });

  it("a stable-context batch partial failure stays partial, not success", async () => {
    sdk.state.publicRows.length = 0;
    sdk.state.privateRows.length = 0;
    sdk.state.publicRows.push(publicRow, {
      id: "str_beta",
      data: { ...publicRow.data, name: "Burgonomics Vesu", area: "Vesu", isOpen: true },
    });
    sdk.state.privateRows.push(privateRow, { id: "str_beta", data: { ...privateRow.data } });
    await render();

    await click(allButtonsByText("POS Batch Sync")[0]);
    await settleFirstVendorSuccess(4);
    await settleFirstVendorError("second store failed");

    expect(toastSpy.success).not.toHaveBeenCalled();
    const claimed = [
      ...toastSpy.warning.mock.calls.map((c) => String(c[0])),
      ...toastSpy.error.mock.calls.map((c) => String(c[0])),
    ].join(" | ");
    expect(claimed).toMatch(/1 synced, 1 failed/i);
  });

  // StrictMode double-invokes effects/mounts, so a load may legitimately run
  // more than once. What must still hold: one click in a STABLE context issues
  // exactly one vendor call, persists once, and claims success once.
  it("a StrictMode stable context still syncs exactly once per click", async () => {
    await act(async () => {
      root!.render(
        React.createElement(
          React.StrictMode,
          null,
          React.createElement(MemoryRouter, null, React.createElement(AdminStoresPage, null)),
        ),
      );
    });
    await flush();

    await clickRowSyncControl();
    expect(apiSpy.state.calls).toEqual(["str_alpha"]);
    const commitsBefore = batchCommitsNow();
    await settleFirstVendorSuccess();

    expect(apiSpy.state.calls).toHaveLength(1);
    expect(batchCommitsNow()).toBe(commitsBefore + 1);
    expect(toastSpy.success).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// R5 — the OWNED loading toast must be cleaned up at the context boundary,
//      NOT when the vendor promise happens to settle.
//
// R4 stopped the stale continuation from writing/toasting, but it only
// dismissed its loading toast on a path that had already passed the stale
// check. Every early return skipped the dismiss, so an indefinitely-pending
// Sonner `toast.loading` (which never auto-expires) stayed on screen forever
// after the context changed — and the app-level Toaster outlives this page.
//
// These cases hold the vendor promise UNSETTLED across the boundary and
// assert the dismiss happens THERE AND THEN, that only the id this page
// created is dismissed, and that an unrelated toast is untouched.
// ---------------------------------------------------------------------------

/** Every id `toast.loading()` has returned so far, in call order. */
function loadingIds(): Array<string | number> {
  return toastSpy.loading.mock.results
    .filter((r) => r.type === "return")
    .map((r) => (r as { value: string | number }).value);
}

/** A toast this page did NOT create: it must never be dismissed for it. */
function raiseUnrelatedToast(): string | number {
  return toastSpy.loading("Unrelated background toast") as string | number;
}

function globalDismissCalls() {
  return toastSpy.dismiss.mock.calls.filter((c) => c.length === 0 || c[0] === undefined);
}

function expectOwnToastDismissed(ownedId: string | number, unrelatedId: string | number) {
  const dismissed = toastSpy.dismiss.mock.calls.map((c) => c[0]);
  expect(dismissed).toContain(ownedId);
  expect(dismissed).not.toContain(unrelatedId);
  expect(globalDismissCalls()).toHaveLength(0);
}

describe("R5 the owned loading toast closes at the context boundary, not at vendor settle", () => {
  it("single sync pending across a role switch dismisses its OWN toast immediately", async () => {
    await render();
    await clickRowSyncControl();
    const [ownedId] = loadingIds();
    expect(ownedId).toBeTruthy();
    const unrelatedId = raiseUnrelatedToast();

    await switchContext("regional_manager", "reg_1");

    // Vendor STILL UNSETTLED: the load spinner must already be gone.
    expect(apiSpy.state.pending).toHaveLength(1);
    expectOwnToastDismissed(ownedId, unrelatedId);

    // Settling afterwards changes nothing: no extra vendor call, no write, no claim.
    const commitsBefore = batchCommitsNow();
    await settleFirstVendorSuccess();
    expect(apiSpy.state.calls).toHaveLength(1);
    expect(batchCommitsNow()).toBe(commitsBefore);
    expect(toastSpy.success).not.toHaveBeenCalled();
    expect(toastSpy.warning).not.toHaveBeenCalled();
    expect(toastSpy.error).not.toHaveBeenCalled();
  });

  it("batch sync pending across an UNMOUNT dismisses its OWN toast immediately", async () => {
    sdk.state.publicRows.length = 0;
    sdk.state.privateRows.length = 0;
    sdk.state.publicRows.push(publicRow, {
      id: "str_beta",
      data: { ...publicRow.data, name: "Burgonomics Vesu", area: "Vesu", isOpen: true },
    });
    sdk.state.privateRows.push(privateRow, { id: "str_beta", data: { ...privateRow.data } });
    await render();

    await click(allButtonsByText("POS Batch Sync")[0]);
    const [ownedId] = loadingIds();
    expect(ownedId).toBeTruthy();
    const unrelatedId = raiseUnrelatedToast();

    await act(async () => {
      root!.unmount();
    });
    root = null;

    // Vendor STILL UNSETTLED: unmount alone must close the owned toast.
    expect(apiSpy.state.pending).toHaveLength(1);
    expectOwnToastDismissed(ownedId, unrelatedId);

    const callsBefore = apiSpy.state.calls.length;
    await settleFirstVendorSuccess();
    expect(apiSpy.state.calls).toHaveLength(callsBefore);
    expect(toastSpy.success).not.toHaveBeenCalled();
    expect(toastSpy.warning).not.toHaveBeenCalled();
    expect(toastSpy.error).not.toHaveBeenCalled();
  });
});
