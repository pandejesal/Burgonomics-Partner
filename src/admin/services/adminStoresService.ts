import { db } from "@/core/config/firebase";
import { collection, doc, getDocs, setDoc, updateDoc, query } from "firebase/firestore";
import type { RichStore } from "../pages/storesData";
import { fail, ok, type ApiResult } from "@/core/network/http";
import { logger } from "@/core/logging/logger";

const STORES_COLLECTION = "admin_stores";

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

export const adminStoresService = {
  /**
   * Fetch all rich stores from Firestore
   */
  async listStores(): Promise<ApiResult<RichStore[]>> {
    try {
      const q = query(collection(db, STORES_COLLECTION));
      const snap = await getDocs(q);
      const stores: RichStore[] = [];
      snap.forEach((doc) => {
        // Never a raw cast: one non-buildNewStore document took down the route.
        stores.push(normalizeAdminStoreDoc(doc.id, doc.data() as Record<string, any>));
      });
      return ok(stores);
    } catch (err: any) {
      logger.error("adminStoresService.listStores_failed", err);
      return fail("FETCH_FAILED", err.message || "Failed to load stores");
    }
  },

  /**
   * Bulk insert/update stores (useful for seeding)
   */
  async bulkUpsert(stores: RichStore[]): Promise<ApiResult<void>> {
    try {
      const batchPromises = stores.map((store) =>
        setDoc(doc(db, STORES_COLLECTION, store.id), store),
      );
      await Promise.all(batchPromises);
      return ok(undefined);
    } catch (err: any) {
      logger.error("adminStoresService.bulkUpsert_failed", err);
      return fail("UPSERT_FAILED", err.message || "Failed to upsert stores");
    }
  },

  /**
   * Update a specific store
   */
  async updateStore(storeId: string, updates: Partial<RichStore>): Promise<ApiResult<void>> {
    try {
      await updateDoc(doc(db, STORES_COLLECTION, storeId), updates);
      return ok(undefined);
    } catch (err: any) {
      logger.error("adminStoresService.updateStore_failed", err);
      return fail("UPDATE_FAILED", err.message || "Failed to update store");
    }
  },

  /**
   * Create a new store
   */
  async createStore(store: RichStore): Promise<ApiResult<void>> {
    try {
      await setDoc(doc(db, STORES_COLLECTION, store.id), store);
      return ok(undefined);
    } catch (err: any) {
      logger.error("adminStoresService.createStore_failed", err);
      return fail("CREATE_FAILED", err.message || "Failed to create store");
    }
  },
};
