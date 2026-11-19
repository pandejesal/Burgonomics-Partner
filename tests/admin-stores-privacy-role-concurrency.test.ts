import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * F17 review round 2 (audit-remediation-20261117-r1).
 *
 * Independent review found four material gaps in the first F17 slice. Each test
 * below is the regression for one of them, written BEFORE the repair:
 *
 *  H1  `listStores` always queried the brand-only collection, so a
 *      `regional_manager` (route permission `admin.stores.view`, NOT a brand
 *      role) lost the whole directory to PRIVATE_JOIN_FAILED. A non-brand
 *      console reader must get the PUBLIC projection only: no private query,
 *      no private values fabricated as zero/absent, and still no legacy PII
 *      leaking out of a pre-split public document. Brand joins keep failing
 *      hard on a denied private read (that is a real integrity failure, not a
 *      "missing document"). The mode must be derived from the role names the
 *      rules actually use (`brand_owner`/`developer`), never from a client
 *      supplied hint or the broad `isDeveloper` presentation flag.
 *
 *  H2  The branch arm of the `admin_stores` rules kept its 8-key changed-key
 *      mask but validated no TYPE, so `phone: { staff: [...] }` or
 *      `name: { … }` could still be written anonymously by an outlet operator.
 *      The exact 8 keys and the ownership check must stay; the changed scalars
 *      must be typed (strings as before, `isActive` boolean) without forcing a
 *      legacy document to lose fields it still carries.
 *
 *  M3  `updateStore` read two documents and then committed a full rewrite,
 *      which is a lost-update window. It must run inside ONE Firestore
 *      transaction that re-reads both documents, applies only the caller's
 *      keys, rebuilds the sanitized pair, and writes nothing at all when the
 *      private read fails.
 *
 *  M4  `MAX_BATCH_WRITES` was capped at 250 (=125 stores) although one batch
 *      accepts 500 writes (=250 stores), and a non-array input was classified
 *      after `stores.length` had already been read. The limit must be 500,
 *      the array must be validated first, 250 stores must succeed, 251 must
 *      fail with zero backend effect, and a non-array must fail honestly.
 *
 *  L5  Unconsumed public metadata (`features.porterEnabled`, `location`) was
 *      silently dropped by the split. It must be carried in the brand-only
 *      document (`legacyMetadata`) without being published anonymously and
 *      without being able to override identity/discovery keys.
 *
 * The Firestore SDK is realmocked: every assertion is on the exact wire
 * payload, never on a live backend.
 */

const sdk = vi.hoisted(() => {
  const state = {
    publicRows: [] as Array<{ id: string; data: Record<string, any> }>,
    privateRows: [] as Array<{ id: string; data: Record<string, any> }>,
    publicReadError: null as Error | null,
    privateReadError: null as Error | null,
    readCollections: [] as string[],
    writes: [] as Array<{
      collection: string;
      id: string;
      data: Record<string, any>;
      options?: { merge?: boolean };
    }>,
    batches: 0,
    commits: 0,
    commitError: null as Error | null,
    transactions: 0,
    transactionAttempts: 0,
    conflictOnce: null as Error | null,
    docs: new Map<string, Record<string, any>>(),
    privateDocError: null as Error | null,
  };

  const snapshot = (
    rows: Array<{ id: string; data: Record<string, any> }>,
    err: Error | null,
  ) => {
    if (err) throw err;
    const entries = rows.map((row) => ({ id: row.id, data: () => row.data }));
    return {
      empty: entries.length === 0,
      size: entries.length,
      docs: entries,
      forEach: (cb: (d: { id: string; data: () => Record<string, any> }) => void) =>
        entries.forEach(cb),
    };
  };

  const docRef = (collection: string, id: string) => ({ kind: "doc" as const, collection, id });

  const readDoc = (ref: { collection: string; id: string }) => {
    if (ref.collection === "admin_stores_private") {
      if (state.privateDocError) throw state.privateDocError;
      if (state.privateReadError) throw state.privateReadError;
    }
    const data = state.docs.get(`${ref.collection}/${ref.id}`);
    return { exists: () => data !== undefined, id: ref.id, data: () => data };
  };

  return {
    state,
    docRef,
    readDoc,
    snapshot,
  };
});

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, name: string) => ({ kind: "collection" as const, collection: name }),
  doc: (_db: unknown, collection: string, id: string) => sdk.docRef(collection, id),
  query: (ref: unknown) => ref,
  getDocs: async (ref: { collection: string }) => {
    sdk.state.readCollections.push(ref.collection);
    return ref.collection === "admin_stores_private"
      ? sdk.snapshot(sdk.state.privateRows, sdk.state.privateReadError)
      : sdk.snapshot(sdk.state.publicRows, sdk.state.publicReadError);
  },
  getDoc: async (ref: { collection: string; id: string }) => sdk.readDoc(ref),
  writeBatch: (_db: unknown) => {
    sdk.state.batches += 1;
    return {
      set: (
        ref: { collection: string; id: string },
        data: Record<string, any>,
        options?: { merge?: boolean },
      ) => {
        sdk.state.writes.push({ collection: ref.collection, id: ref.id, data, options });
      },
      commit: async () => {
        sdk.state.commits += 1;
        if (sdk.state.commitError) throw sdk.state.commitError;
      },
    };
  },
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
    // Mimic the SDK's automatic retry: attempt 1 is aborted by a simulated
    // concurrent conflict, attempt 2 re-reads and commits.
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      sdk.state.transactionAttempts += 1;
      const staged: typeof sdk.state.writes = [];
      const tx = {
        get: async (ref: { collection: string; id: string }) => sdk.readDoc(ref),
        set: (
          ref: { collection: string; id: string },
          data: Record<string, any>,
          options?: { merge?: boolean },
        ) => {
          staged.push({ collection: ref.collection, id: ref.id, data, options });
        },
      };
      const result = await fn(tx);
      if (attempt === 1 && sdk.state.conflictOnce) {
        // Aborted attempt: nothing the callback staged may survive.
        continue;
      }
      sdk.state.writes.push(...staged);
      return result;
    }
    throw new Error("transaction retries exhausted");
  },
  setDoc: vi.fn(() => {
    throw new Error("setDoc must not be used: admin_stores writes are paired projections");
  }),
  updateDoc: vi.fn(() => {
    throw new Error("updateDoc must not be used: updateStore is transactional");
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
  storeDirectoryReadMode,
  PUBLIC_STORE_KEYS,
  PRIVATE_STORE_KEYS,
  toPrivateStoreDoc,
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

const legacyPublicRow = (id = "str_alpha") => ({
  id,
  data: {
    // Discovery
    name: "Burgonomics Adajan",
    address: "Adajan Gam, Surat",
    city: "Surat",
    area: "Adajan",
    lat: 21.195,
    lng: 72.793,
    phone: "+919820011223",
    hours: { open: "10:00", close: "23:00" },
    supports: { delivery: true, takeaway: true, dineIn: true },
    isOpen: true,
    // Pre-split PII that must NOT reach a non-brand reader
    staff: richStore().staff,
    documents: richStore().documents,
    email: "manager.personal@example.test",
    managerName: "Ops Manager",
    managerPhone: "+919820099887",
    webhookUrl: "https://hooks.example.test/petpooja/secret",
    webhookStatus: "active",
    todayRevenue: 48210,
    todayOrders: 96,
    // Unconsumed metadata the split used to drop
    features: { porterEnabled: false },
    location: { latitude: 21.195, longitude: 72.793 },
  },
});

function resetState() {
  sdk.state.publicRows.length = 0;
  sdk.state.privateRows.length = 0;
  sdk.state.publicReadError = null;
  sdk.state.privateReadError = null;
  sdk.state.readCollections.length = 0;
  sdk.state.writes.length = 0;
  sdk.state.batches = 0;
  sdk.state.commits = 0;
  sdk.state.commitError = null;
  sdk.state.transactions = 0;
  sdk.state.transactionAttempts = 0;
  sdk.state.conflictOnce = null;
  sdk.state.docs.clear();
  sdk.state.privateDocError = null;
}

const publicWrites = () => sdk.state.writes.filter((w) => w.collection === "admin_stores");
const privateWrites = () => sdk.state.writes.filter((w) => w.collection === "admin_stores_private");
const flatten = (value: unknown): string => JSON.stringify(value);

// ---------------------------------------------------------------------------
// H1a — the read mode is derived from the rules' brand role names
// ---------------------------------------------------------------------------
describe("H1 storeDirectoryReadMode matches the rules' brand role set", () => {
  it("brand_owner and developer get the brand (private-joined) mode", () => {
    expect(storeDirectoryReadMode("brand_owner")).toBe("brand");
    expect(storeDirectoryReadMode("developer")).toBe("brand");
  });

  it("regional_manager / support / branch roles get public-only", () => {
    for (const role of [
      "regional_manager",
      "support",
      "branch_owner",
      "branch_staff",
      "customer",
      "auditor",
      "",
      "  ",
    ]) {
      expect(storeDirectoryReadMode(role)).toBe("public-only");
    }
  });

  it("an unrecognised or non-string role fails closed to public-only", () => {
    expect(storeDirectoryReadMode(undefined as unknown as string)).toBe("public-only");
    expect(storeDirectoryReadMode(null as unknown as string)).toBe("public-only");
    expect(storeDirectoryReadMode({ role: "brand_owner" } as unknown as string)).toBe(
      "public-only",
    );
  });
});

// ---------------------------------------------------------------------------
// H1b — public-only listing never touches the private collection
// ---------------------------------------------------------------------------
describe("H1 public-only directory: one public query, no private attempt", () => {
  beforeEach(resetState);

  it("issues NO private query and returns the public directory", async () => {
    sdk.state.publicRows.push(legacyPublicRow());
    const res = await adminStoresService.listStores({ mode: "public-only" });
    expect(res.success).toBe(true);
    expect(sdk.state.readCollections).toEqual(["admin_stores"]);
  });

  it("strips legacy private PII from a pre-split public document", async () => {
    sdk.state.publicRows.push(legacyPublicRow());
    const res = await adminStoresService.listStores({ mode: "public-only" });
    expect(res.success).toBe(true);
    if (!res.success) return;
    const store = res.data[0];
    expect(store.staff).toEqual([]);
    expect(store.documents).toEqual([]);
    expect(store.email).toBeNull();
    expect(store.managerName).toBeNull();
    expect(store.managerPhone).toBeNull();
    expect(store.webhookUrl).toBeNull();
    expect(flatten(store)).not.toContain("manager.personal@example.test");
    expect(flatten(store)).not.toContain("ravi.personal@example.test");
    // Discovery survives.
    expect(store.name).toBe("Burgonomics Adajan");
    expect(store.lat).toBe(21.195);
  });

  it("does NOT fail when the private collection would have denied the read", async () => {
    sdk.state.publicRows.push(legacyPublicRow());
    sdk.state.privateReadError = new Error("Missing or insufficient permissions.");
    const res = await adminStoresService.listStores({ mode: "public-only" });
    expect(res.success).toBe(true);
    expect(sdk.state.readCollections).toEqual(["admin_stores"]);
  });

  it("still reports a genuine public read failure (never an empty directory)", async () => {
    sdk.state.publicReadError = new Error("offline");
    const res = await adminStoresService.listStores({ mode: "public-only" });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("FETCH_FAILED");
  });
});

// ---------------------------------------------------------------------------
// H1c — brand mode is unchanged: private query + hard failure
// ---------------------------------------------------------------------------
describe("H1 brand directory keeps the authoritative private join", () => {
  beforeEach(resetState);

  it("queries both collections by default", async () => {
    sdk.state.publicRows.push(legacyPublicRow());
    sdk.state.privateRows.push({ id: "str_alpha", data: { staff: [] } });
    const res = await adminStoresService.listStores();
    expect(res.success).toBe(true);
    expect(sdk.state.readCollections).toEqual(["admin_stores", "admin_stores_private"]);
  });

  it("still fails the whole list when the private read is denied", async () => {
    sdk.state.publicRows.push(legacyPublicRow());
    sdk.state.privateReadError = new Error("Missing or insufficient permissions.");
    const res = await adminStoresService.listStores({ mode: "brand" });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("PRIVATE_JOIN_FAILED");
  });
});

// ---------------------------------------------------------------------------
// L5 — unconsumed public metadata is preserved privately, never published
// ---------------------------------------------------------------------------
describe("L5 unconsumed legacy public metadata survives in the private half only", () => {
  it("keeps features/location in the brand-only document", () => {
    const priv = toPrivateStoreDoc(legacyPublicRow().data);
    expect(priv.legacyMetadata).toEqual({
      features: { porterEnabled: false },
      location: { latitude: 21.195, longitude: 72.793 },
    });
  });

  it("never republishes it anonymously and never lets it override identity", () => {
    const priv = toPrivateStoreDoc({
      ...legacyPublicRow().data,
      name: "Anonymous name",
      features: { porterEnabled: true },
      location: { latitude: 0, longitude: 0 },
    });
    expect(Object.prototype.hasOwnProperty.call(priv, "name")).toBe(false);
    expect(Object.keys(priv)).toContain("legacyMetadata");
  });

  it("omits legacyMetadata entirely when the document has no such extras", () => {
    const priv = toPrivateStoreDoc(richStore());
    expect(priv.legacyMetadata).toBeUndefined();
    expect(flatten(priv)).not.toContain("legacyMetadata");
  });

  it("carries legacyMetadata through a brand join without overriding discovery", async () => {
    resetState();
    sdk.state.publicRows.push(legacyPublicRow());
    sdk.state.privateRows.push({ id: "str_alpha", data: { legacyMetadata: { features: { porterEnabled: false } } } });
    const res = await adminStoresService.listStores({ mode: "brand" });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data[0].name).toBe("Burgonomics Adajan");
    expect(res.data[0].lat).toBe(21.195);
  });

  it("PUBLIC_STORE_KEYS and PRIVATE_STORE_KEYS stay disjoint", () => {
    for (const key of PRIVATE_STORE_KEYS) {
      expect(PUBLIC_STORE_KEYS).not.toContain(key);
    }
  });
});

// ---------------------------------------------------------------------------
// M3 — updateStore is a transactional read/apply/rebuild
// ---------------------------------------------------------------------------
describe("M3 updateStore runs in one transaction and never loses concurrent values", () => {
  beforeEach(resetState);

  it("reads both documents inside the transaction and writes the pair", async () => {
    sdk.state.docs.set("admin_stores/str_alpha", legacyPublicRow().data);
    sdk.state.docs.set("admin_stores_private/str_alpha", {
      staff: [],
      todayRevenue: 99,
      webhookStatus: "active",
    });
    const res = await adminStoresService.updateStore("str_alpha", { isOpen: false });
    expect(res.success).toBe(true);
    expect(sdk.state.transactions).toBe(1);
    expect(sdk.state.batches).toBe(0);
    expect(publicWrites()).toHaveLength(1);
    expect(privateWrites()).toHaveLength(1);
  });

  it("applies ONLY the caller's keys (a concurrent private counter survives)", async () => {
    // The transaction re-reads the private doc, so a counter written by another
    // writer after the page loaded is preserved rather than overwritten by the
    // page's stale copy.
    sdk.state.docs.set("admin_stores/str_alpha", legacyPublicRow().data);
    sdk.state.docs.set("admin_stores_private/str_alpha", {
      staff: [],
      todayOrders: 96,
      queueOrdersWaiting: 7,
    });
    await adminStoresService.updateStore("str_alpha", { isOpen: true });
    const priv = privateWrites()[0];
    expect(priv.options?.merge).toBe(true);
    expect(priv.data.queueOrdersWaiting).toBe(7);
    expect(priv.data.todayOrders).toBe(96);
  });

  it("moves legacy public PII into the private pair in the same commit", async () => {
    sdk.state.docs.set("admin_stores/str_alpha", legacyPublicRow().data);
    await adminStoresService.updateStore("str_alpha", { phone: "+919820011999" });
    const pub = publicWrites()[0];
    const priv = privateWrites()[0];
    expect(pub.options?.merge).toBeFalsy();
    expect(pub.data.staff).toBeUndefined();
    expect(pub.data.email).toBeUndefined();
    expect(pub.data.phone).toBe("+919820011999");
    expect(flatten(pub.data)).not.toContain("Ravi Kumar");
    expect(priv.data.staff).toHaveLength(1);
    expect(priv.data.email).toBe("manager.personal@example.test");
  });

  it("a failed private fetch inside the transaction writes ZERO documents", async () => {
    sdk.state.docs.set("admin_stores/str_alpha", legacyPublicRow().data);
    sdk.state.privateDocError = new Error("Missing or insufficient permissions.");
    const res = await adminStoresService.updateStore("str_alpha", { isOpen: true });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("PRIVATE_JOIN_FAILED");
    expect(sdk.state.writes).toHaveLength(0);
  });

  it("survives a concurrent-conflict retry without duplicating writes", async () => {
    sdk.state.docs.set("admin_stores/str_alpha", legacyPublicRow().data);
    sdk.state.conflictOnce = new Error("aborted");
    const res = await adminStoresService.updateStore("str_alpha", { isOpen: false });
    expect(res.success).toBe(true);
    expect(sdk.state.transactionAttempts).toBe(2);
    // Exactly one pair of documents, from the committed attempt only.
    expect(publicWrites()).toHaveLength(1);
    expect(privateWrites()).toHaveLength(1);
    expect(publicWrites()[0].data.isOpen).toBe(false);
  });

  it("still reports a missing store without writing or creating a shell", async () => {
    const res = await adminStoresService.updateStore("str_missing", { isOpen: true });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("STORE_NOT_FOUND");
    expect(sdk.state.writes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// M4 — the batch ceiling is the SDK's 500 writes, validated before use
// ---------------------------------------------------------------------------
describe("M4 bulkUpsert honours the 500-write contract", () => {
  beforeEach(resetState);

  const many = (count: number) =>
    Array.from({ length: count }, (_, i) => richStore({ id: `str_${i}` }));

  it("accepts 126 stores (252 writes) — the old 250 ceiling rejected this", async () => {
    const res = await adminStoresService.bulkUpsert(many(126));
    expect(res.success).toBe(true);
    expect(sdk.state.writes).toHaveLength(252);
    expect(sdk.state.batches).toBe(1);
    expect(sdk.state.commits).toBe(1);
  });

  it("accepts 249 stores (498 writes)", async () => {
    const res = await adminStoresService.bulkUpsert(many(249));
    expect(res.success).toBe(true);
    expect(sdk.state.writes).toHaveLength(498);
  });

  it("accepts exactly 250 stores (500 writes)", async () => {
    const res = await adminStoresService.bulkUpsert(many(250));
    expect(res.success).toBe(true);
    expect(sdk.state.writes).toHaveLength(500);
    expect(sdk.state.commits).toBe(1);
  });

  it("rejects 251 stores with ZERO backend effect (preflight before batch)", async () => {
    const res = await adminStoresService.bulkUpsert(many(251));
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("BATCH_TOO_LARGE");
    expect(sdk.state.batches).toBe(0);
    expect(sdk.state.writes).toHaveLength(0);
    expect(sdk.state.commits).toBe(0);
  });

  it("fails honestly for a non-array input instead of throwing on .length", async () => {
    for (const bad of [null, undefined, "stores", 42, {}]) {
      const res = await adminStoresService.bulkUpsert(bad as unknown as RichStore[]);
      expect(res.success).toBe(false);
      if (res.success) return;
      expect(res.error.code).toBe("INVALID_INPUT");
    }
    expect(sdk.state.batches).toBe(0);
    expect(sdk.state.writes).toHaveLength(0);
  });

  it("an empty directory is a no-op success", async () => {
    const res = await adminStoresService.bulkUpsert([]);
    expect(res.success).toBe(true);
    expect(sdk.state.writes).toHaveLength(0);
  });
});
