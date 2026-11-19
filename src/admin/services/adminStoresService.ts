import { db } from "@/core/config/firebase";
import {
  collection,
  doc,
  getDocs,
  runTransaction,
  writeBatch,
  query,
  type DocumentReference,
} from "firebase/firestore";
import type { RichStore } from "../pages/storesData";
import { fail, ok, type ApiResult } from "@/core/network/http";
import { logger } from "@/core/logging/logger";

const STORES_COLLECTION = "admin_stores";
// F17: the brand-only half of a store record. `admin_stores` is served
// anonymously (`read: true`) so it may carry discovery fields only; everything
// that identifies or describes real people (roster, compliance documents,
// manager contacts, Petpooja webhook/queue metadata, financials, settings)
// lives here, where the rules grant brand roles alone.
const PRIVATE_STORES_COLLECTION = "admin_stores_private";

// Firestore caps one WriteBatch at 500 writes. A store is two writes (public +
// private), so 250 is the highest store count a single batch can carry. The
// preflight runs BEFORE the batch object exists: an oversize directory must
// fail with zero backend effects rather than half-commit. A directory larger
// than 250 stores needs an explicit pagination/chunking design (partial
// outcomes reported honestly), never a silent truncation.
const WRITES_PER_STORE = 2;
const MAX_BATCH_WRITES = 500;

/**
 * Which half of the directory a console session may read.
 *
 * The `admin_stores_private` rules grant brand roles (`brand_owner`/`developer`,
 * exactly what `isBrandOwner()` resolves to) and nothing else, so the mode is
 * derived from the SAME role names — never from a client hint, and never from
 * the broader `isDeveloper` presentation flag. A non-brand console user
 * (`regional_manager` holds `admin.stores.view`) reads the public projection
 * only: no private query is attempted, so no denial can blank their directory.
 */
export type StoreDirectoryReadMode = "brand" | "public-only";

export function storeDirectoryReadMode(roleName: string): StoreDirectoryReadMode {
  if (typeof roleName !== "string") return "public-only";
  const role = roleName.trim();
  if (role === "brand_owner" || role === "developer") return "brand";
  return "public-only";
}

/**
 * EXACT anonymous-read whitelist for `admin_stores`.
 *
 * Derived from the two real guest readers, not from the RichStore type:
 *  - customer/src/features/stores/services/storesService.ts `mapStoreDoc`:
 *    name, address, city, area, lat/lng (or latitude/longitude), phone,
 *    imageUrl, hours{open,close}, isOpen, status, isBusy, isRecentlyOpened,
 *    supports{delivery,takeaway,dineIn}, etaMinutes/minPrepMinutes,
 *    pickupEtaMinutes, pricing{deliveryFeeFlat}, deliveryFee, petpoojaRestId,
 *    partnerBranchId, deliveryRadiusKm.
 *  - partner/src/admin/dashboard/services/dashboardService.ts `getStores`:
 *    name, address, city, state, pincode, country, phone, latitude, longitude,
 *    status, turnOnAt, minPrepMinutes, distanceKm.
 *
 * `title`/`branchId`/`isActive`/`createdAt`/`updatedAt` are the legacy metadata
 * keys the rules already accepted and that seeded directories carry; they hold
 * no personal data. Everything else — the kitchen roster, compliance documents,
 * manager email/name/phone, webhook URL and sync state, queue counters,
 * financial analytics, store settings, media, richHours — is private.
 */
export const PUBLIC_STORE_KEYS = [
  "title",
  "branchId",
  "name",
  "address",
  "city",
  "area",
  "state",
  "pincode",
  "country",
  "lat",
  "lng",
  "latitude",
  "longitude",
  "phone",
  "imageUrl",
  "hours",
  "isOpen",
  "isBusy",
  "isRecentlyOpened",
  "isActive",
  "status",
  "supports",
  "etaMinutes",
  "pickupEtaMinutes",
  "minPrepMinutes",
  "deliveryFee",
  "pricing",
  "petpoojaRestId",
  "partnerBranchId",
  "deliveryRadiusKm",
  "turnOnAt",
  "distanceKm",
  "createdAt",
  "updatedAt",
] as const;

export const PRIVATE_STORE_KEYS = [
  "email",
  "managerName",
  "managerPhone",
  "webhookUrl",
  "webhookStatus",
  "circuitBreaker",
  "lastSyncTime",
  "menuVersion",
  "webhookFailures",
  "retryCount",
  "queueOrdersWaiting",
  "queueOrdersActive",
  "queueFailedJobs",
  "queueDeadLetters",
  "queueWorkerStatus",
  "todayRevenue",
  "todayOrders",
  "avgOrderValue",
  "popularItem",
  "peakHour",
  "customerCount",
  "repeatCustomerPercentage",
  "weeklyRevenueTrend",
  "monthlyRevenueTrend",
  "autoAcceptOrders",
  "kitchenDisplayEnabled",
  "onlinePaymentEnabled",
  "cashOnDeliveryEnabled",
  "staff",
  "documents",
  "deliveryMinOrder",
  "deliveryMaxDistance",
  "deliveryPolygonCoords",
  "media",
  "richHours",
  // Unconsumed legacy public metadata (e.g. `features`, `location`) moved out
  // of the anonymous document without being republished there.
  "legacyMetadata",
] as const;

const PUBLIC_KEY_SET: ReadonlySet<string> = new Set(PUBLIC_STORE_KEYS);
const PRIVATE_KEY_SET: ReadonlySet<string> = new Set(PRIVATE_STORE_KEYS);

/** A default week so a store without `richHours` still renders seven rows. */
function defaultWeek(): RichStore["richHours"] {
  const hours = { open: "10:00", close: "23:00" };
  return {
    monday: { ...hours },
    tuesday: { ...hours },
    wednesday: { ...hours },
    thursday: { ...hours },
    friday: { ...hours },
    saturday: { ...hours },
    sunday: { ...hours },
  };
}

function finiteCoord(...candidates: unknown[]): number {
  for (const candidate of candidates) {
    const numeric = typeof candidate === "number" ? candidate : Number(candidate);
    // A blank map pin used to persist NaN (parseFloat of an empty string).
    // NaN must never reach `.toFixed()` in the render, so it is collapsed to 0
    // and the UI shows "not pinned" instead of the string "NaN".
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Projection primitives. Every projection REBUILDS its object from validated
// scalars: no nested spread of arbitrary input, no `undefined` value, and no
// key the rules whitelist does not name.
// ---------------------------------------------------------------------------

const isObject = (value: unknown): value is Record<string, any> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A string that may be stored as-is; anything else is rejected. */
const text = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/** A finite number, or `null` when the source had none. */
const numOrNull = (value: unknown, fallback: number | null = null): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** A finite number, omitted when the source had none. */
const numOrAbsent = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const bool = (value: unknown, fallback = false): boolean =>
  typeof value === "boolean" ? value : fallback;

const numericArray = (value: unknown): number[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry));
};

/**
 * A coordinate is either a finite number or an explicit null ("not pinned yet");
 * anything else (string, NaN, map) is rejected so it never reaches Firestore.
 * Two spellings are accepted so a legacy `latitude`-only document still maps.
 */
const coordValue = (primary: unknown, alias: unknown): number | null | undefined => {
  for (const candidate of [primary, alias]) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (candidate === null) return null;
  }
  return undefined;
};

function rebuildHours(value: unknown): { open: string; close: string } | undefined {
  if (!isObject(value)) return undefined;
  const open = text(value.open);
  const close = text(value.close);
  if (open === undefined || close === undefined) return undefined;
  return { open, close };
}

function rebuildSupports(value: unknown): { delivery: boolean; takeaway: boolean; dineIn: boolean } | undefined {
  if (!isObject(value)) return undefined;
  return {
    delivery: bool(value.delivery),
    takeaway: bool(value.takeaway),
    dineIn: bool(value.dineIn),
  };
}

/** Only the pricing keys the customer `Store` model declares, all numeric. */
function rebuildPricing(value: unknown): Record<string, number> | undefined {
  if (!isObject(value)) return undefined;
  const out: Record<string, number> = {};
  for (const key of [
    "gstRate",
    "packingChargePerItem",
    "deliveryFeeFlat",
    "freeDeliveryThreshold",
    "minOrderAmount",
  ]) {
    const entry = numOrAbsent(value[key]);
    if (entry !== undefined) out[key] = entry;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function rebuildWeek(value: unknown): RichStore["richHours"] {
  const week = defaultWeek();
  if (!isObject(value)) return week;
  for (const day of Object.keys(week) as Array<keyof RichStore["richHours"]>) {
    const entry = rebuildHours(value[day]);
    if (!entry) continue;
    const source = value[day] as Record<string, any>;
    week[day] = {
      ...entry,
      ...(text(source.secondShiftOpen) !== undefined
        ? { secondShiftOpen: text(source.secondShiftOpen) as string }
        : {}),
      ...(text(source.secondShiftClose) !== undefined
        ? { secondShiftClose: text(source.secondShiftClose) as string }
        : {}),
      ...(typeof source.closed === "boolean" ? { closed: source.closed } : {}),
    };
  }
  return week;
}

function rebuildMedia(value: unknown): RichStore["media"] | undefined {
  if (!isObject(value)) return undefined;
  const gallery = Array.isArray(value.gallery)
    ? value.gallery.filter((entry): entry is string => typeof entry === "string")
    : [];
  return {
    heroBanner: text(value.heroBanner) ?? null,
    logo: text(value.logo) ?? null,
    gallery,
  };
}

function rebuildStaff(value: unknown): RichStore["staff"] {
  if (!Array.isArray(value)) return [];
  const out: RichStore["staff"] = [];
  for (const entry of value) {
    if (!isObject(entry)) continue;
    const id = text(entry.id);
    const name = text(entry.name);
    const role = text(entry.role);
    if (id === undefined || name === undefined || role === undefined) continue;
    out.push({
      id,
      name,
      role: role as RichStore["staff"][number]["role"],
      phone: text(entry.phone) ?? "",
      email: text(entry.email) ?? "",
      isOnline: bool(entry.isOnline),
    });
  }
  return out;
}

function rebuildDocuments(value: unknown): RichStore["documents"] {
  if (!Array.isArray(value)) return [];
  const out: RichStore["documents"] = [];
  for (const entry of value) {
    if (!isObject(entry)) continue;
    const id = text(entry.id);
    const name = text(entry.name);
    const type = text(entry.type);
    if (id === undefined || name === undefined || type === undefined) continue;
    out.push({
      id,
      name,
      type: type as RichStore["documents"][number]["type"],
      expiryDate: text(entry.expiryDate) ?? "",
      status: (text(entry.status) ?? "active") as RichStore["documents"][number]["status"],
    });
  }
  return out;
}

function rebuildPolygon(value: unknown): { lat: number; lng: number }[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: { lat: number; lng: number }[] = [];
  for (const entry of value) {
    if (!isObject(entry)) continue;
    const lat = numOrAbsent(entry.lat);
    const lng = numOrAbsent(entry.lng);
    if (lat === undefined || lng === undefined) continue;
    out.push({ lat, lng });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Unconsumed public metadata that the split must not silently destroy.
 *
 * `features` (e.g. `porterEnabled`) and `location` are written into legacy
 * `admin_stores` documents by older importers but read by nothing in either
 * app. They are moved into the brand-only document verbatim-nested but
 * REBUILT here from known keys/scalars — never an arbitrary object spread, so
 * this cannot become a generic escape hatch for unknown private payloads.
 */
function rebuildLegacyMetadata(source: Record<string, any>): Record<string, any> | undefined {
  const out: Record<string, any> = {};

  if (isObject(source.features)) {
    const features: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(source.features)) {
      if (typeof value === "boolean") features[key] = value;
    }
    if (Object.keys(features).length > 0) out.features = features;
  }

  if (isObject(source.location)) {
    const latitude = numOrAbsent(source.location.latitude);
    const longitude = numOrAbsent(source.location.longitude);
    if (latitude !== undefined && longitude !== undefined) {
      out.location = { latitude, longitude };
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Rebuilds the ANONYMOUSLY READABLE half of a store record.
 *
 * Callers may pass a RichStore, a legacy document, or a merge of both; the
 * projection never trusts the shape. Unknown keys are dropped, nested maps are
 * rebuilt from validated scalars (so `name: { staff: [...] }` cannot smuggle
 * PII through a discovery key), and `undefined` never reaches Firestore.
 */
export function toPublicStoreDoc(input: RichStore | Record<string, any>): Record<string, any> {
  const source = (isObject(input) ? input : {}) as Record<string, any>;
  const out: Record<string, any> = {};

  for (const key of ["title", "branchId", "name", "address", "city", "area", "state", "pincode", "country", "phone", "status", "petpoojaRestId", "partnerBranchId", "imageUrl", "turnOnAt", "createdAt", "updatedAt"] as const) {
    const value = text(source[key]);
    if (value !== undefined) out[key] = value;
  }

  // Coordinates: latitude/longitude are the partner dashboard's spelling of
  // lat/lng. Both spellings are mirrored from ONE validated number, and an
  // explicit null ("not pinned yet") stays an explicit null - the guest reader
  // treats it as unknown and the rules allow a null pin.
  const lat = coordValue(source.lat, source.latitude);
  if (lat !== undefined) {
    out.lat = lat;
    out.latitude = lat;
  }
  const lng = coordValue(source.lng, source.longitude);
  if (lng !== undefined) {
    out.lng = lng;
    out.longitude = lng;
  }

  const hours = rebuildHours(source.hours);
  if (hours) out.hours = hours;
  const supports = rebuildSupports(source.supports);
  if (supports) out.supports = supports;
  const pricing = rebuildPricing(source.pricing);
  if (pricing) out.pricing = pricing;

  for (const key of ["isOpen", "isBusy", "isRecentlyOpened", "isActive"] as const) {
    if (typeof source[key] === "boolean") out[key] = source[key];
  }
  for (const key of ["etaMinutes", "pickupEtaMinutes", "minPrepMinutes", "deliveryFee", "deliveryRadiusKm", "distanceKm"] as const) {
    const value = numOrNull(source[key]);
    if (value !== null) out[key] = value;
  }

  return out;
}

/**
 * Rebuilds the BRAND-ONLY half of a store record (roster, compliance documents,
 * manager contacts, webhook/queue metadata, financials, settings, media, hours).
 * Public identity/discovery keys are deliberately NOT included, so a private
 * read can never override what the directory advertises.
 */
export function toPrivateStoreDoc(input: RichStore | Record<string, any>): Record<string, any> {
  const source = (isObject(input) ? input : {}) as Record<string, any>;
  const out: Record<string, any> = {};

  for (const key of ["email", "managerName", "managerPhone", "webhookUrl", "lastSyncTime", "menuVersion"] as const) {
    if (key in source) {
      const value = text(source[key]);
      // null is meaningful here ("no contact email on file" / "not connected").
      if (value !== undefined) out[key] = value;
      else if (source[key] === null) out[key] = null;
    }
  }
  for (const key of ["webhookStatus", "circuitBreaker", "queueWorkerStatus", "popularItem", "peakHour"] as const) {
    const value = text(source[key]);
    if (value !== undefined) out[key] = value;
  }
  for (const key of [
    "webhookFailures",
    "retryCount",
    "queueOrdersWaiting",
    "queueOrdersActive",
    "queueFailedJobs",
    "queueDeadLetters",
    "todayRevenue",
    "todayOrders",
    "avgOrderValue",
    "customerCount",
    "repeatCustomerPercentage",
    "deliveryMinOrder",
    "deliveryMaxDistance",
  ] as const) {
    const value = numOrAbsent(source[key]);
    if (value !== undefined) out[key] = value;
  }
  for (const key of [
    "autoAcceptOrders",
    "kitchenDisplayEnabled",
    "onlinePaymentEnabled",
    "cashOnDeliveryEnabled",
  ] as const) {
    if (typeof source[key] === "boolean") out[key] = source[key];
  }
  for (const key of ["weeklyRevenueTrend", "monthlyRevenueTrend"] as const) {
    const value = numericArray(source[key]);
    if (value !== undefined) out[key] = value;
  }

  if (Array.isArray(source.staff)) out.staff = rebuildStaff(source.staff);
  if (Array.isArray(source.documents)) out.documents = rebuildDocuments(source.documents);
  if (source.richHours !== undefined) out.richHours = rebuildWeek(source.richHours);
  const media = rebuildMedia(source.media);
  if (media) out.media = media;
  const legacyMetadata = rebuildLegacyMetadata(source);
  if (legacyMetadata) out.legacyMetadata = legacyMetadata;
  const polygon = rebuildPolygon(source.deliveryPolygonCoords);
  if (polygon) out.deliveryPolygonCoords = polygon;

  return out;
}

/**
 * Normalizes ONE raw `admin_stores` document into a render-safe RichStore.
 *
 * `listStores` used to cast `doc.data() as RichStore` straight through, so a
 * document that was NOT produced by buildNewStore - the seeded directory shape
 * (no richHours/staff/documents/trends) or any console/import edit - reached
 * `Object.entries(activeStore.richHours)` and `activeStore.staff.length` during
 * render and white-screened the whole Admin -> Stores route.
 *
 * Follows the same boundary discipline as the order and ticket contracts:
 * collections become arrays, richHours becomes a full week, coordinates become
 * finite numbers, and identity fields keep whatever the writer stored.
 */
export function normalizeAdminStoreDoc(
  id: string,
  raw: Record<string, any> | undefined,
): RichStore {
  const data = (raw ?? {}) as Record<string, any>;
  const week = data.richHours && typeof data.richHours === "object" ? data.richHours : null;
  const richHours = defaultWeek();
  if (week) {
    for (const day of Object.keys(richHours) as Array<keyof RichStore["richHours"]>) {
      const entry = (week as Record<string, any>)[day];
      if (entry && typeof entry === "object") {
        richHours[day] = { ...richHours[day], ...entry };
      }
    }
  }

  return {
    ...(data as RichStore),
    id: typeof data.id === "string" && data.id ? data.id : id,
    name: typeof data.name === "string" ? data.name : "",
    address: typeof data.address === "string" ? data.address : "",
    city: typeof data.city === "string" ? data.city : "",
    lat: finiteCoord(data.lat, data.latitude, data.location?.latitude),
    lng: finiteCoord(data.lng, data.longitude, data.location?.longitude),
    richHours,
    staff: Array.isArray(data.staff) ? data.staff : [],
    documents: Array.isArray(data.documents) ? data.documents : [],
    weeklyRevenueTrend: Array.isArray(data.weeklyRevenueTrend) ? data.weeklyRevenueTrend : [],
    monthlyRevenueTrend: Array.isArray(data.monthlyRevenueTrend)
      ? data.monthlyRevenueTrend
      : [],
  };
}

/**
 * Joins one public discovery document with its brand-only companion.
 *
 * The private document is authoritative for private keys — including an EMPTY
 * roster, which must not be resurrected from a legacy public document. A
 * pre-split store (no private document yet) may still fall back to legacy
 * fields in the public document so authorized admins keep seeing their roster
 * until the next save moves it.
 */
export function joinAdminStoreDocs(
  id: string,
  publicRaw: Record<string, any> | undefined,
  privateRaw: Record<string, any> | null | undefined,
): RichStore {
  const publicData = isObject(publicRaw) ? publicRaw : {};
  const merged: Record<string, any> = {};
  for (const key of Object.keys(publicData)) {
    if (PUBLIC_KEY_SET.has(key)) merged[key] = publicData[key];
  }
  if (isObject(privateRaw)) {
    for (const key of PRIVATE_KEY_SET) {
      if (key in privateRaw) merged[key] = privateRaw[key];
    }
  } else {
    // No private document exists yet: legacy public fields are the only
    // source of truth for the private half.
    for (const key of PRIVATE_KEY_SET) {
      if (key in publicData) merged[key] = publicData[key];
    }
  }
  return normalizeAdminStoreDoc(id, merged);
}

const STORE_NOT_FOUND = () =>
  fail("STORE_NOT_FOUND", "That store is no longer in the directory.", false);

const PRIVATE_JOIN_FAILED = () =>
  fail(
    "PRIVATE_JOIN_FAILED",
    "Store privacy data could not be loaded, so nothing was changed.",
    true,
  );

/**
 * The PUBLIC-ONLY view of one directory document, for console roles the rules
 * do not grant the private collection (e.g. `regional_manager`).
 *
 * Built from `toPublicStoreDoc` first, so legacy private fields that still sit
 * in a pre-split cloud document (staff, documents, manager contacts, webhook,
 * queue, financials) are dropped rather than rendered. Private surfaces are
 * explicitly marked unavailable instead of carrying a fabricated zero.
 */
export function publicOnlyStoreView(
  id: string,
  publicRaw: Record<string, any> | undefined,
): RichStore {
  const sanitized = toPublicStoreDoc(publicRaw ?? {});
  const store = normalizeAdminStoreDoc(id, sanitized);
  return {
    ...store,
    email: null,
    managerName: null,
    managerPhone: null,
    webhookUrl: null,
    webhookStatus: "unknown",
    circuitBreaker: null,
    lastSyncTime: null,
    menuVersion: null,
    staff: [],
    documents: [],
    privateDataUnavailable: true,
  };
}

/**
 * ONE atomic write for a full store record: the public discovery document (full
 * replacement, never a merge — a merge would leave legacy PII inside the
 * anonymously readable document) plus its brand-only companion (merged, so
 * unknown server-owned private fields survive).
 */
function stageStoreWrite(
  target: {
    set: (ref: DocumentReference, data: Record<string, any>, options?: { merge?: boolean }) => void;
  },
  store: RichStore | Record<string, any>,
  id: string,
): void {
  target.set(
    doc(db, STORES_COLLECTION, id) as DocumentReference,
    toPublicStoreDoc(store),
  );
  target.set(
    doc(db, PRIVATE_STORES_COLLECTION, id) as DocumentReference,
    toPrivateStoreDoc(store),
    { merge: true },
  );
}

export interface ListStoresOptions {
  /**
   * Which half of the directory to read. Derived by the caller from the
   * session role via `storeDirectoryReadMode` — a client hint here is NOT
   * authorization; the rules remain the authority on the private collection.
   */
  mode?: StoreDirectoryReadMode;
}

export const adminStoresService = {
  /**
   * Fetch all rich stores from Firestore.
   *
   * F17: the directory is two collections joined by the ACTUAL Firestore
   * document id (`data().id` is not authoritative).
   *
   * - brand mode (default): both collections are read; a denied/failed private
   *   read FAILS THE WHOLE LIST (`PRIVATE_JOIN_FAILED`), because serving a
   *   public-only row would show an empty roster the next save would persist.
   * - public-only mode: ONLY the public collection is queried, so a non-brand
   *   console role (which the rules deny the private collection) keeps its
   *   discovery directory and never sees private values or legacy PII.
   */
  async listStores(options: ListStoresOptions = {}): Promise<ApiResult<RichStore[]>> {
    const mode = options.mode === "public-only" ? "public-only" : "brand";

    let publicSnap: Awaited<ReturnType<typeof getDocs>>;
    try {
      publicSnap = await getDocs(query(collection(db, STORES_COLLECTION)));
    } catch (err: any) {
      logger.error("adminStoresService.listStores_failed", err);
      return fail("FETCH_FAILED", "Failed to load stores");
    }

    if (mode === "public-only") {
      const stores: RichStore[] = [];
      publicSnap.forEach((entry) => {
        stores.push(publicOnlyStoreView(entry.id, entry.data() as Record<string, any>));
      });
      return ok(stores);
    }

    let privateSnap: Awaited<ReturnType<typeof getDocs>>;
    try {
      privateSnap = await getDocs(query(collection(db, PRIVATE_STORES_COLLECTION)));
    } catch (err: any) {
      logger.error("adminStoresService.listStores_failed", err);
      return PRIVATE_JOIN_FAILED();
    }

    const privateById = new Map<string, Record<string, any>>();
    privateSnap.forEach((entry) => {
      privateById.set(entry.id, entry.data() as Record<string, any>);
    });

    const stores: RichStore[] = [];
    publicSnap.forEach((entry) => {
      // Never a raw cast: one non-buildNewStore document took down the route.
      stores.push(
        joinAdminStoreDocs(
          entry.id,
          entry.data() as Record<string, any>,
          privateById.get(entry.id),
        ),
      );
    });
    return ok(stores);
  },

  /**
   * Bulk insert/update stores (used by the directory's whole-array save).
   *
   * Exactly ONE writeBatch for every store and exactly two documents per store:
   * the public projection cannot be committed without its private half, and the
   * private half cannot be committed without the sanitized public document.
   */
  async bulkUpsert(stores: RichStore[]): Promise<ApiResult<void>> {
    // Validate the ARGUMENT before reading `.length` from it: a non-array is a
    // caller error and must fail honestly, with zero backend effect.
    if (!Array.isArray(stores)) {
      logger.error("adminStoresService.bulkUpsert_failed", {
        code: "invalid-argument",
        retryable: false,
      });
      return fail("INVALID_INPUT", "Stores must be provided as an array.", false);
    }
    const writeCount = stores.length * WRITES_PER_STORE;
    if (writeCount > MAX_BATCH_WRITES) {
      // Preflight BEFORE a batch object exists: zero writes, zero commits.
      logger.error("adminStoresService.bulkUpsert_failed", {
        code: "invalid-argument",
        retryable: false,
      });
      return fail(
        "BATCH_TOO_LARGE",
        `Saving ${stores.length} stores needs ${writeCount} writes; a single commit allows ${MAX_BATCH_WRITES}.`,
        false,
      );
    }
    try {
      const batch = writeBatch(db);
      for (const store of stores) {
        stageStoreWrite(batch, store, store.id);
      }
      await batch.commit();
      return ok(undefined);
    } catch (err: any) {
      logger.error("adminStoresService.bulkUpsert_failed", err);
      return fail("UPSERT_FAILED", "Failed to upsert stores");
    }
  },

  /**
   * Update a specific store.
   *
   * F17 (review round 2): ONE Firestore transaction re-reads both documents,
   * applies ONLY the caller's keys, then commits the sanitized public
   * replacement plus the merged private companion. A two-read + full-rewrite
   * outside a transaction would overwrite any private value another writer
   * changed between the page load and this save (queue counters and financial
   * tallies are exactly that kind of field). A failed private read inside the
   * transaction writes nothing at all, so a denial can never persist an empty
   * private document.
   */
  async updateStore(storeId: string, updates: Partial<RichStore>): Promise<ApiResult<void>> {
    const patch = (isObject(updates) ? updates : {}) as Record<string, any>;
    try {
      return await runTransaction(db, async (tx) => {
        const publicSnap = await tx.get(doc(db, STORES_COLLECTION, storeId));
        if (!publicSnap.exists()) {
          // Throwing rolls the transaction back with zero writes.
          throw Object.assign(new Error("store not found"), { code: "STORE_NOT_FOUND" });
        }
        const publicRaw = publicSnap.data() as Record<string, any>;
        let privateSnap: Awaited<ReturnType<typeof tx.get>>;
        try {
          privateSnap = await tx.get(doc(db, PRIVATE_STORES_COLLECTION, storeId));
        } catch (err) {
          // Tag the failure here so the caller can never mistake a denied
          // private read for a missing document (which would write an empty
          // private doc over real data).
          throw Object.assign(new Error("private join failed"), {
            code: "PRIVATE_JOIN_FAILED",
            cause: err,
          });
        }
        const privateRaw = privateSnap.exists()
          ? (privateSnap.data() as Record<string, any>)
          : null;

        const merged: Record<string, any> = {
          ...joinAdminStoreDocs(storeId, publicRaw, privateRaw),
        };
        for (const key of Object.keys(patch)) {
          if (PUBLIC_KEY_SET.has(key) || PRIVATE_KEY_SET.has(key)) merged[key] = patch[key];
        }
        merged.id = storeId;

        stageStoreWrite(tx, merged, storeId);
        return ok(undefined);
      });
    } catch (err: any) {
      if (err && err.code === "STORE_NOT_FOUND") {
        return STORE_NOT_FOUND();
      }
      if (err && err.code === "PRIVATE_JOIN_FAILED") {
        // A denied/failed private read is an integrity failure, not a missing
        // document: nothing was written.
        logger.error("adminStoresService.updateStore_failed", err);
        return PRIVATE_JOIN_FAILED();
      }
      logger.error("adminStoresService.updateStore_failed", err);
      return fail("UPDATE_FAILED", "Failed to update store");
    }
  },

  /**
   * Create a new store as the same paired atomic projection the update path
   * uses, so a freshly created store never publishes its roster anonymously.
   */
  async createStore(store: RichStore): Promise<ApiResult<void>> {
    try {
      const batch = writeBatch(db);
      stageStoreWrite(batch, store, store.id);
      await batch.commit();
      return ok(undefined);
    } catch (err: any) {
      logger.error("adminStoresService.createStore_failed", err);
      return fail("CREATE_FAILED", "Failed to create store");
    }
  },
};
