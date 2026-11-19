import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * F17 (audit-remediation-20261117-r1): the Admin -> Stores directory persisted
 * ONE `admin_stores` document that the rules serve anonymously (`read: true`).
 * That single document also carried the kitchen roster (names, phones, emails),
 * compliance documents, the manager's personal contacts, Petpooja webhook
 * metadata, queue counters and financial analytics. Anyone on the internet
 * could read a store's staff phone numbers.
 *
 * Fix pinned here:
 *  1. `toPublicStoreDoc` rebuilds the anonymously-readable document from an
 *     EXACT discovery whitelist (its keys mirror the guest readers in
 *     `customer/src/features/stores/services/storesService.ts` and
 *     `partner/src/admin/dashboard/services/dashboardService.ts`).
 *     `toPrivateStoreDoc` rebuilds the brand-only document.
 *  2. `listStores` joins the two collections by the ACTUAL document id and
 *     refuses to serve a half-joined directory: a denied/failed private read
 *     fails the whole list (`PRIVATE_JOIN_FAILED`) instead of silently dropping
 *     the roster the next save would then erase.
 *  3. Every write is ONE `writeBatch` of exactly two documents per store, the
 *     public write is a FULL REPLACEMENT (no `merge`, so legacy PII cannot
 *     survive inside the anonymous document), the private write merges (so
 *     unknown server-owned private fields survive), and an oversize directory
 *     is rejected BEFORE any batch exists.
 *
 * The Firestore SDK is realmocked: each test asserts on the exact wire payload,
 * never on a live backend.
 */

const sdk = vi.hoisted(() => {
  const state = {
    publicRows: [] as Array<{ id: string; data: Record<string, any> }>,
    privateRows: [] as Array<{ id: string; data: Record<string, any> }>,
    publicReadError: null as Error | null,
    privateReadError: null as Error | null,
    writes: [] as Array<{
      collection: string;
      id: string;
      data: Record<string, any>;
      options?: { merge?: boolean };
    }>,
    batches: 0,
    commits: 0,
    commitError: null as Error | null,
    docs: new Map<string, Record<string, any>>(),
    getDocError: null as Error | null,
    transactions: 0,
  };

  const readDocRef = (ref: { collection: string; id: string }) => {
    if (ref.collection === "admin_stores_private" && state.privateReadError) {
      throw state.privateReadError;
    }
    if (state.getDocError) throw state.getDocError;
    const data = state.docs.get(`${ref.collection}/${ref.id}`);
    return { exists: () => data !== undefined, id: ref.id, data: () => data };
  };

  const snapshot = (rows: Array<{ id: string; data: Record<string, any> }>, err: Error | null) => {
    if (err) throw err;
    const entries = rows.map((row) => ({ id: row.id, data: () => row.data }));
    return {
      empty: entries.length === 0,
      size: entries.length,
      docs: entries,
      forEach: (cb: (d: { id: string; data: () => Record<string, any> }) => void) => entries.forEach(cb),
    };
  };

  return {
    state,
    readDocRef,
    collection: (_db: unknown, name: string) => ({ kind: "collection" as const, collection: name }),
    doc: (_db: unknown, collection: string, id: string) => ({ kind: "doc" as const, collection, id }),
    query: (ref: unknown) => ref,
    getDocs: async (ref: { collection: string }) =>
      ref.collection === "admin_stores_private"
        ? snapshot(state.privateRows, state.privateReadError)
        : snapshot(state.publicRows, state.publicReadError),
    getDoc: async (ref: { collection: string; id: string }) => sdk.readDocRef(ref),
    writeBatch: (_db: unknown) => {
      state.batches += 1;
      return {
        set: (ref: { collection: string; id: string }, data: Record<string, any>, options?: { merge?: boolean }) => {
          state.writes.push({ collection: ref.collection, id: ref.id, data, options });
        },
        commit: async () => {
          state.commits += 1;
          if (state.commitError) throw state.commitError;
        },
      };
    },
  };
});

vi.mock("firebase/firestore", () => ({
  collection: sdk.collection,
  doc: sdk.doc,
  query: sdk.query,
  getDocs: sdk.getDocs,
  getDoc: sdk.getDoc,
  writeBatch: sdk.writeBatch,
  // F17 review round 2: updateStore re-reads and writes inside ONE transaction.
  runTransaction: async (
    _db: unknown,
    fn: (tx: {
      get: (ref: { collection: string; id: string }) => Promise<unknown>;
      set: (
        ref: { collection: string; id: string },
        data: Record<string, any>,
        options?: { merge?: boolean },
      ) => void;
    }) => Promise<unknown>,
  ) => {
    sdk.state.transactions += 1;
    const staged: typeof sdk.state.writes = [];
    const result = await fn({
      get: async (ref: { collection: string; id: string }) => sdk.readDocRef(ref),
      set: (ref, data, options) => {
        staged.push({ collection: ref.collection, id: ref.id, data, options });
      },
    });
    sdk.state.writes.push(...staged);
    return result;
  },
  // The pre-F17 service wrote through setDoc/updateDoc straight into the
  // anonymous collection. Any reappearance of those calls must fail loudly.
  setDoc: vi.fn(() => {
    throw new Error("setDoc must not be used: admin_stores writes are paired batches");
  }),
  updateDoc: vi.fn(() => {
    throw new Error("updateDoc must not be used: admin_stores writes are paired batches");
  }),
  limit: (value: number) => value,
}));

vi.mock("@/core/config/firebase", () => ({
  app: {},
  auth: { currentUser: null },
  db: {},
  messaging: null,
}));
vi.mock("@/config/firebase", () => ({
  app: {},
  auth: { currentUser: null },
  db: {},
  messaging: null,
}));

import {
  adminStoresService,
  toPublicStoreDoc,
  toPrivateStoreDoc,
  PUBLIC_STORE_KEYS,
  PRIVATE_STORE_KEYS,
} from "../src/admin/services/adminStoresService";
import type { RichStore } from "../src/admin/pages/storesData";

function richStore(overrides: Partial<RichStore> = {}): RichStore {
  return {
    id: "str_alpha",
    name: "Burgonomics Adajan",
    address: "Adajan Gam, Surat",
    city: "Surat",
    area: "Adajan",
    lat: 21.195,
    lng: 72.793,
    phone: "+919820011223",
    imageUrl: null,
    hours: { open: "10:00", close: "23:00" },
    isOpen: true,
    isBusy: false,
    isRecentlyOpened: false,
    supports: { delivery: true, takeaway: true, dineIn: true },
    etaMinutes: 30,
    pickupEtaMinutes: 15,
    deliveryFee: 29,
    deliveryRadiusKm: 5,
    petpoojaRestId: "rest_adajan",
    partnerBranchId: "branch_01",
    richHours: {
      monday: { open: "10:00", close: "23:00" },
      tuesday: { open: "10:00", close: "23:00" },
      wednesday: { open: "10:00", close: "23:00" },
      thursday: { open: "10:00", close: "23:00" },
      friday: { open: "10:00", close: "23:59" },
      saturday: { open: "10:00", close: "23:59" },
      sunday: { open: "10:00", close: "23:59" },
    },
    email: "manager.personal@example.test",
    managerName: "Ops Manager",
    managerPhone: "+919820099887",
    webhookUrl: "https://hooks.example.test/petpooja/secret",
    webhookStatus: "active",
    circuitBreaker: "closed",
    lastSyncTime: "2026-11-01T10:00:00.000Z",
    menuVersion: "v4.1.0",
    webhookFailures: 0,
    retryCount: 0,
    queueOrdersWaiting: 3,
    queueOrdersActive: 2,
    queueFailedJobs: 0,
    queueDeadLetters: 0,
    queueWorkerStatus: "healthy",
    todayRevenue: 48210,
    todayOrders: 96,
    avgOrderValue: 502,
    customerCount: 41,
    weeklyRevenueTrend: [1, 2, 3, 4, 5, 6, 7],
    monthlyRevenueTrend: Array.from({ length: 30 }, () => 0),
    autoAcceptOrders: true,
    kitchenDisplayEnabled: true,
    onlinePaymentEnabled: true,
    cashOnDeliveryEnabled: true,
    staff: [
      {
        id: "STF-1",
        name: "Ravi Kumar",
        role: "Chef",
        phone: "+919820011224",
        email: "ravi.personal@example.test",
        isOnline: false,
      },
    ],
    documents: [
      {
        id: "DOC-1",
        name: "FSSAI licence",
        type: "FSSAI",
        expiryDate: "2027-01-31",
        status: "active",
      },
    ],
    deliveryMinOrder: 150,
    deliveryMaxDistance: 7,
    media: { heroBanner: "https://cdn.example.test/hero.jpg", logo: null, gallery: [] },
    ...overrides,
  };
}

function resetState() {
  sdk.state.publicRows.length = 0;
  sdk.state.privateRows.length = 0;
  sdk.state.publicReadError = null;
  sdk.state.privateReadError = null;
  sdk.state.writes.length = 0;
  sdk.state.batches = 0;
  sdk.state.commits = 0;
  sdk.state.commitError = null;
  sdk.state.docs.clear();
  sdk.state.getDocError = null;
}

const publicWrites = () => sdk.state.writes.filter((w) => w.collection === "admin_stores");
const privateWrites = () => sdk.state.writes.filter((w) => w.collection === "admin_stores_private");

const flatten = (value: unknown): string => JSON.stringify(value);

// ---------------------------------------------------------------------------
// 1. Projections
// ---------------------------------------------------------------------------
describe("F17 projections: anonymous document carries discovery only", () => {
  it("public projection keeps every discovery field the guest readers use", () => {
    const pub = toPublicStoreDoc(richStore());
    expect(pub).toMatchObject({
      name: "Burgonomics Adajan",
      address: "Adajan Gam, Surat",
      city: "Surat",
      area: "Adajan",
      lat: 21.195,
      lng: 72.793,
      phone: "+919820011223",
      isOpen: true,
      isBusy: false,
      petpoojaRestId: "rest_adajan",
      partnerBranchId: "branch_01",
      deliveryRadiusKm: 5,
      etaMinutes: 30,
      pickupEtaMinutes: 15,
      deliveryFee: 29,
    });
    expect(pub.supports).toEqual({ delivery: true, takeaway: true, dineIn: true });
    expect(pub.hours).toEqual({ open: "10:00", close: "23:00" });
    // Neither guest reader touches richHours or the admin media gallery, so
    // both stay on the private side of the split.
    expect(pub.richHours).toBeUndefined();
    expect(pub.media).toBeUndefined();
  });

  it("public projection contains NO staff/compliance/personal/webhook/operator field", () => {
    const pub = toPublicStoreDoc(richStore());
    for (const key of PRIVATE_STORE_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(pub, key)).toBe(false);
    }
    for (const key of Object.keys(pub)) {
      expect(PUBLIC_STORE_KEYS).toContain(key);
    }
    const wire = flatten(pub);
    for (const secret of [
      "Ravi Kumar",
      "+919820011224",
      "ravi.personal@example.test",
      "manager.personal@example.test",
      "Ops Manager",
      "+919820099887",
      "hooks.example.test",
      "v4.1.0",
    ]) {
      expect(wire).not.toContain(secret);
    }
  });

  it("public projection drops nested PII smuggled under a discovery key", () => {
    const pub = toPublicStoreDoc(
      richStore({
        // A map where the contract says a string.
        name: { staff: [{ name: "Ravi Kumar", phone: "+919820011224" }] } as unknown as string,
        supports: {
          delivery: true,
          takeaway: false,
          dineIn: true,
          staff: [{ phone: "+919820011224" }],
        } as unknown as RichStore["supports"],
        hours: {
          open: "10:00",
          close: "23:00",
          managerPhone: "+919820099887",
        } as unknown as RichStore["hours"],
      }),
    );
    // The scalar key is omitted rather than carrying a smuggled map.
    expect(pub.name).toBeUndefined();
    expect(pub.supports).toEqual({ delivery: true, takeaway: false, dineIn: true });
    expect(pub.hours).toEqual({ open: "10:00", close: "23:00" });
    expect(flatten(pub)).not.toContain("Ravi Kumar");
    expect(flatten(pub)).not.toContain("+919820099887");
  });

  it("public projection never emits undefined values (Firestore rejects them)", () => {
    const pub = toPublicStoreDoc(
      richStore({
        imageUrl: undefined as unknown as string | null,
        lat: null,
        lng: null,
        etaMinutes: undefined as unknown as number | null,
        pricing: undefined as unknown as RichStore["pricing"],
      }),
    );
    // An explicit null pin is preserved in BOTH spellings the readers use.
    expect(pub.lat).toBeNull();
    expect(pub.latitude).toBeNull();
    expect(pub.lng).toBeNull();
    expect(pub.longitude).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(pub, "imageUrl")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(pub, "etaMinutes")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(pub, "pricing")).toBe(false);
    expect(flatten(pub)).not.toContain("undefined");
  });

  it("private projection keeps the roster/contacts/webhook/operator data and no public identity", () => {
    const priv = toPrivateStoreDoc(richStore());
    expect(priv.staff).toEqual(richStore().staff);
    expect(priv.documents).toEqual(richStore().documents);
    expect(priv.email).toBe("manager.personal@example.test");
    expect(priv.managerName).toBe("Ops Manager");
    expect(priv.managerPhone).toBe("+919820099887");
    expect(priv.webhookUrl).toBe("https://hooks.example.test/petpooja/secret");
    expect(priv.webhookStatus).toBe("active");
    expect(priv.queueWorkerStatus).toBe("healthy");
    expect(priv.todayRevenue).toBe(48210);
    expect(priv.autoAcceptOrders).toBe(true);
    for (const key of PUBLIC_STORE_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(priv, key)).toBe(false);
    }
    expect(Object.prototype.hasOwnProperty.call(priv, "id")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. listStores join
// ---------------------------------------------------------------------------
describe("F17 listStores: public/private joined by document id", () => {
  beforeEach(resetState);

  it("falls back to legacy private fields for a pre-split public document", async () => {
    const legacy = richStore();
    // A pre-split document is the only place the roster exists.
    sdk.state.publicRows.push({
      id: "str_alpha",
      data: {
        name: legacy.name,
        address: legacy.address,
        city: legacy.city,
        area: legacy.area,
        lat: legacy.lat,
        lng: legacy.lng,
        phone: legacy.phone,
        staff: legacy.staff,
        email: legacy.email,
        webhookStatus: "active",
      },
    });
    const res = await adminStoresService.listStores();
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data[0].staff).toHaveLength(1);
    expect(res.data[0].email).toBe("manager.personal@example.test");
  });

  it("lets an EXISTING private doc win, including an empty roster", async () => {
    sdk.state.publicRows.push({
      id: "str_alpha",
      data: { name: "Burgonomics Adajan", city: "Surat", lat: 21.195, lng: 72.793 },
    });
    sdk.state.privateRows.push({
      id: "str_alpha",
      data: {
        staff: [],
        email: null,
        webhookStatus: "unknown",
        todayRevenue: 0,
      },
    });
    const res = await adminStoresService.listStores();
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data[0].staff).toEqual([]);
    expect(res.data[0].email).toBeNull();
    expect(res.data[0].webhookStatus).toBe("unknown");
  });

  it("never lets private data override public identity/discovery fields", async () => {
    sdk.state.publicRows.push({
      id: "str_alpha",
      data: { name: "Real Store", address: "Real Address", city: "Surat", lat: 21.195, lng: 72.793 },
    });
    sdk.state.privateRows.push({
      id: "str_alpha",
      data: {
        id: "str_evil",
        name: "Injected Name",
        address: "Injected Address",
        city: "Injected City",
        lat: 0,
        lng: 0,
        staff: [],
      },
    });
    const res = await adminStoresService.listStores();
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data[0].id).toBe("str_alpha");
    expect(res.data[0].name).toBe("Real Store");
    expect(res.data[0].address).toBe("Real Address");
    expect(res.data[0].city).toBe("Surat");
    expect(res.data[0].lat).toBe(21.195);
  });

  it("fails the WHOLE list when the private query is denied (PRIVATE_JOIN_FAILED)", async () => {
    sdk.state.publicRows.push({
      id: "str_alpha",
      data: { name: "Burgonomics Adajan", city: "Surat", lat: 21.195, lng: 72.793 },
    });
    sdk.state.privateReadError = new Error("Missing or insufficient permissions.");
    const res = await adminStoresService.listStores();
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("PRIVATE_JOIN_FAILED");
    // Not an empty list and not a partial directory.
    expect(res.error.message).not.toContain("permissions.");
  });

  it("still succeeds when the private query itself fails?... no: a read failure is never a silent fallback", async () => {
    // Guard against the tempting "catch -> []" fallback: an empty private
    // collection is a successful read (handled above); a DENIED read is a
    // failure and must not degrade into "no private data exists".
    sdk.state.publicReadError = new Error("offline");
    sdk.state.privateRows.push({ id: "str_alpha", data: { staff: [] } });
    const res = await adminStoresService.listStores();
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("FETCH_FAILED");
  });
});

// ---------------------------------------------------------------------------
// 3. Write path: one atomic paired batch per save
// ---------------------------------------------------------------------------
describe("F17 writes: paired atomic projections", () => {
  beforeEach(resetState);

  it("bulkUpsert writes two documents per store in ONE batch, public not merged", async () => {
    const stores = [richStore(), richStore({ id: "str_beta", name: "Burgonomics Beta" })];
    const res = await adminStoresService.bulkUpsert(stores);
    expect(res.success).toBe(true);
    expect(sdk.state.batches).toBe(1);
    expect(sdk.state.commits).toBe(1);
    expect(publicWrites()).toHaveLength(2);
    expect(privateWrites()).toHaveLength(2);
    for (const write of publicWrites()) {
      // Full replacement only: `merge: true` would keep legacy PII in place.
      expect(write.options?.merge).toBeFalsy();
      expect(flatten(write.data)).not.toContain("Ravi Kumar");
      expect(flatten(write.data)).not.toContain("ravi.personal@example.test");
      expect(write.data.staff).toBeUndefined();
    }
    for (const write of privateWrites()) {
      // Private merge preserves unknown server-owned private fields.
      expect(write.options?.merge).toBe(true);
      expect(write.data.staff).toHaveLength(1);
    }
  });

  it("public payload is the SAME store id as the private payload (joined by document id)", async () => {
    await adminStoresService.bulkUpsert([richStore({ id: "str_alpha" })]);
    expect(publicWrites().map((w) => w.id)).toEqual(["str_alpha"]);
    expect(privateWrites().map((w) => w.id)).toEqual(["str_alpha"]);
  });

  it("rejects an oversize directory BEFORE any batch exists (500-write ceiling)", async () => {
    // 251 stores = 502 writes: past the SDK's 500-write batch limit.
    const stores = Array.from({ length: 251 }, (_, i) => richStore({ id: `str_${i}` }));
    const res = await adminStoresService.bulkUpsert(stores);
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("BATCH_TOO_LARGE");
    expect(res.error.retryable).toBe(false);
    expect(sdk.state.batches).toBe(0);
    expect(sdk.state.writes).toHaveLength(0);
    expect(sdk.state.commits).toBe(0);
  });

  it("a failed commit reports failure and never claims partial success", async () => {
    sdk.state.commitError = new Error("permission-denied");
    const res = await adminStoresService.bulkUpsert([richStore()]);
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("UPSERT_FAILED");
    expect(res.error.message).not.toContain("permission-denied");
    expect(sdk.state.commits).toBe(1);
  });

  it("createStore writes the pair atomically, public full replacement", async () => {
    const res = await adminStoresService.createStore(richStore({ id: "str_new" }));
    expect(res.success).toBe(true);
    expect(sdk.state.batches).toBe(1);
    expect(sdk.state.commits).toBe(1);
    expect(publicWrites()).toHaveLength(1);
    expect(privateWrites()).toHaveLength(1);
    expect(publicWrites()[0].options?.merge).toBeFalsy();
    expect(privateWrites()[0].options?.merge).toBe(true);
    expect(publicWrites()[0].data.staff).toBeUndefined();
    expect(privateWrites()[0].data.staff).toHaveLength(1);
  });

  it("a 125-store directory (250 writes) is still accepted", async () => {
    const stores = Array.from({ length: 125 }, (_, i) => richStore({ id: `str_${i}` }));
    const res = await adminStoresService.bulkUpsert(stores);
    expect(res.success).toBe(true);
    expect(sdk.state.writes).toHaveLength(250);
  });
});

// ---------------------------------------------------------------------------
// 4. Partial update path
// ---------------------------------------------------------------------------
describe("F17 updateStore: joined read, legacy PII carried privately", () => {
  beforeEach(resetState);

  it("sanitizes a legacy public doc and carries its PII into the private pair", async () => {
    const legacy = richStore();
    // Pre-split cloud doc: everything lives in the anonymous collection.
    sdk.state.docs.set("admin_stores/str_alpha", {
      name: legacy.name,
      address: legacy.address,
      city: legacy.city,
      area: legacy.area,
      lat: legacy.lat,
      lng: legacy.lng,
      phone: legacy.phone,
      email: legacy.email,
      managerName: legacy.managerName,
      managerPhone: legacy.managerPhone,
      staff: legacy.staff,
      documents: legacy.documents,
      webhookUrl: legacy.webhookUrl,
      webhookStatus: "active",
      todayRevenue: 100,
    });

    const res = await adminStoresService.updateStore("str_alpha", { isOpen: false });
    expect(res.success).toBe(true);
    // F17 review round 2: the partial update is ONE transaction, not a batch.
    expect(sdk.state.transactions).toBe(1);
    expect(sdk.state.batches).toBe(0);

    const pub = publicWrites()[0];
    expect(pub.id).toBe("str_alpha");
    expect(pub.options?.merge).toBeFalsy();
    expect(pub.data.isOpen).toBe(false);
    // The legacy PII is GONE from the anonymous document...
    expect(pub.data.staff).toBeUndefined();
    expect(pub.data.email).toBeUndefined();
    expect(pub.data.managerPhone).toBeUndefined();
    expect(flatten(pub.data)).not.toContain("Ravi Kumar");
    // ...because the same commit CARRIED it to the brand-only document.
    const priv = privateWrites()[0];
    expect(priv.options?.merge).toBe(true);
    expect(priv.data.staff).toHaveLength(1);
    expect(priv.data.email).toBe(legacy.email);
    expect(priv.data.managerPhone).toBe(legacy.managerPhone);
    expect(priv.data.todayRevenue).toBe(100);
    // Public discovery is preserved across the partial update.
    expect(pub.data.name).toBe(legacy.name);
    expect(pub.data.lat).toBe(legacy.lat);
  });

  it("never sends a raw private patch into the public document", async () => {
    sdk.state.docs.set("admin_stores/str_alpha", {
      name: "Burgonomics Adajan",
      city: "Surat",
      lat: 21.195,
      lng: 72.793,
    });
    sdk.state.docs.set("admin_stores_private/str_alpha", { staff: [] });

    const res = await adminStoresService.updateStore("str_alpha", {
      staff: richStore().staff,
      email: "manager.personal@example.test",
    });
    expect(res.success).toBe(true);
    const pub = publicWrites()[0];
    expect(pub.data.staff).toBeUndefined();
    expect(pub.data.email).toBeUndefined();
    expect(flatten(pub.data)).not.toContain("Ravi Kumar");
    expect(privateWrites()[0].data.staff).toHaveLength(1);
    expect(privateWrites()[0].data.email).toBe("manager.personal@example.test");
  });

  it("an authoritative empty private roster is not resurrected from legacy public data", async () => {
    sdk.state.docs.set("admin_stores/str_alpha", {
      name: "Burgonomics Adajan",
      city: "Surat",
      lat: 21.195,
      lng: 72.793,
      staff: richStore().staff,
    });
    sdk.state.docs.set("admin_stores_private/str_alpha", { staff: [] });
    await adminStoresService.updateStore("str_alpha", { isOpen: true });
    expect(privateWrites()[0].data.staff).toEqual([]);
  });

  it("refuses to write when the private read fails (never writes an empty private doc)", async () => {
    sdk.state.docs.set("admin_stores/str_alpha", {
      name: "Burgonomics Adajan",
      city: "Surat",
      lat: 21.195,
      lng: 72.793,
    });
    sdk.state.privateReadError = new Error("Missing or insufficient permissions.");
    const res = await adminStoresService.updateStore("str_alpha", { isOpen: true });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("PRIVATE_JOIN_FAILED");
    expect(sdk.state.batches).toBe(0);
    expect(sdk.state.writes).toHaveLength(0);
    expect(sdk.state.commits).toBe(0);
  });

  it("reports a missing store instead of silently creating a shell", async () => {
    const res = await adminStoresService.updateStore("str_missing", { isOpen: true });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("STORE_NOT_FOUND");
    expect(sdk.state.batches).toBe(0);
    expect(sdk.state.writes).toHaveLength(0);
  });
});
